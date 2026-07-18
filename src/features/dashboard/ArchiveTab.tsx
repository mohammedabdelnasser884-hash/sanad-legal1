import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from '../../shared/lib/notifications';
import { validateUploadFile, resolveStorageUrl } from '../../shared/lib/storage';
import { logActivity } from '../../shared/lib/dataAccess';
import { ilikeOrClause } from '../../shared/lib/sanitize';
import { Inp } from '@/shared/ui/Inp';
import { Sel } from '@/shared/ui/Sel';
import { db } from '../../supabaseClient';
import { I, getCurrentTenantId } from '../../constants';
import { showErrorToast } from '../../shared/lib/errorReporting';
import PdfViewerModal from '@/shared/modals/PdfViewerModal';
import type { MappedCase, MappedClient } from '../../hooks/useAppData';
import type { CaseDocumentRow } from '../../types';

const PAGE_SIZE = 15;

interface ArchiveTabProps {
    cases: MappedCase[];
    clients: MappedClient[];
}

function ArchiveTab({cases, clients}: ArchiveTabProps){
    const [docs, setDocs]           = useState<CaseDocumentRow[]>([]);
    const [docsTotal, setDocsTotal] = useState(0);
    const [docsPage, setDocsPage]   = useState(0);
    const [docsMore, setDocsMore]   = useState(false);
    const [loading, setLoading]     = useState(true);

    const [searchQ, setSearchQ]       = useState('');
    const [filterCat, setFilterCat]   = useState('الكل');
    const [uploadingDoc, setUploadingDoc] = useState(false);
    const [pendingFile, setPendingFile]   = useState<File | null>(null);
    const [docLabel, setDocLabel]         = useState('');
    const [docCategory, setDocCategory]   = useState('مستند رسمي');
    const [docCaseId, setDocCaseId]       = useState('');
    const [showForm, setShowForm]         = useState(false);
    const [viewingDoc, setViewingDoc]     = useState<CaseDocumentRow | null>(null);
    const [deletingId, setDeletingId]     = useState<string | null>(null);
    const [sortBy, setSortBy]             = useState('date_desc');
    const fileInputRef = useRef<HTMLInputElement>(null);
    // FIX: كان البحث بيبعت طلب لقاعدة البيانات مع كل حرف بدون أي debounce
    // (بعكس باقي شاشات البحث في المشروع زي FeesTab/ClientsTab/RemindersTab)
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const CATS = ['الكل','مذكرة دفاع','صحيفة دعوى','حكم قضائي','عقد','توكيل','مستند رسمي','صورة','أخرى'];

    // ── جلب من DB (paginated + server-side search + فلتر تصنيف) ──
    const fetchDocs = useCallback(async (page = 0, search = searchQ, cat = filterCat, sort = sortBy, append = false) => {
        setLoading(true);
        const from = page * PAGE_SIZE;
        const to   = from + PAGE_SIZE - 1;

        const sortCol   = sort === 'name' ? 'file_name' : sort === 'size' ? 'file_size' : 'created_at';
        const ascending = sort === 'date_asc' || sort === 'name';

        let q = db.from('case_documents')
            .select('*', { count: 'exact' })
            .order(sortCol, { ascending })
            .range(from, to);

        if (search.trim()) {
            const s = search.trim();
            // FIX: كان بيبني فلتر .or() بstring خام — فاصلة أو قوس في نص
            // البحث كان بيكسر صياغة الفلتر. دلوقتي بنستخدم ilikeOrClause
            // اللي بتحط القيمة بين علامتي اقتباس وتهرّبها زي ما PostgREST محتاج.
            q = q.or([
                ilikeOrClause('file_name', s),
                ilikeOrClause('original_name', s),
                ilikeOrClause('category', s),
            ].join(','));
        }
        if (cat !== 'الكل') {
            q = q.eq('category', cat);
        }

        const { data, error, count } = await q;
        if (!error) {
            const rawList = data || [];
            // ⚠️ الباكت case-docs بقى private — لازم نولّد رابط موقّع طازة
            // لكل مستند بدل الاعتماد على رابط عام قديم متخزن في file_url.
            const list = await Promise.all(rawList.map(async (d: CaseDocumentRow) => ({
                ...d,
                file_url: await resolveStorageUrl('case-docs', d.storage_path || d.file_url),
            })));
            if (append) setDocs((prev: CaseDocumentRow[]) => [...prev, ...list]);
            else setDocs(list);
            setDocsTotal(count || 0);
            setDocsPage(page);
            setDocsMore((page + 1) * PAGE_SIZE < (count || 0));
        }
        setLoading(false);
    }, [searchQ, filterCat, sortBy]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { fetchDocs(0, searchQ, filterCat, sortBy, false); }, []);

    const handleSearchChange = (val: string) => {
        setSearchQ(val);
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = setTimeout(() => fetchDocs(0, val, filterCat, sortBy, false), 300);
    };

    useEffect(() => {
        return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
    }, []);

    const handleCatChange = (cat: string) => {
        setFilterCat(cat);
        fetchDocs(0, searchQ, cat, sortBy, false);
    };

    const handleSortChange = (sort: string) => {
        setSortBy(sort);
        fetchDocs(0, searchQ, filterCat, sort, false);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = (e.target.files as FileList)[0];
        if (!f) return;
        const validationError = validateUploadFile(f);
        if (validationError) { toast('❌ ' + validationError, true); e.target.value = ''; return; }
        setPendingFile(f);
        setDocLabel(f.name.replace(/\.[^/.]+$/,''));
        setShowForm(true);
    };

    const handleUpload = async () => {
        if (!pendingFile) return;
        const validationError = validateUploadFile(pendingFile);
        if (validationError) { toast('❌ ' + validationError, true); return; }
        const tenantId = getCurrentTenantId();
        if (!tenantId) { toast('❌ تعذر تحديد المكتب الحالي، أعد تحميل الصفحة وحاول مرة أخرى', true); return; }
        setUploadingDoc(true);
        const ext = (pendingFile.name.split('.').pop() as string).toLowerCase();
        // FIX (5.6): المسار لازم يبدأ بـ tenant_id عشان نقدر نفعّل RLS
        // بتفلتر بالمكتب على bucket case-docs (كان بدون أي عزل بين المكاتب).
        const safeName = `${tenantId}/archive_${Date.now()}.${ext}`;
        const {error: upErr} = await db.storage.from('case-docs').upload(safeName, pendingFile, {upsert:true});
        if (upErr) {
            setUploadingDoc(false);
            showErrorToast('case_document_upload', upErr, 'تعذّر رفع المستند. تأكد من حجم الملف والاتصال بالإنترنت. لو المشكلة استمرت، تواصل مع الدعم.', 'رفع مستند');
            return;
        }
        // الباكت private دلوقتي — بنولّد رابط موقّع مؤقت بدل الرابط العام.
        const fileUrl = await resolveStorageUrl('case-docs', safeName);
        const {error: dbErr} = await db.from('case_documents').insert([{
            case_id: docCaseId || null,
            file_name: docLabel.trim() || pendingFile.name,
            file_type: ext,
            file_url: fileUrl,
            storage_path: safeName,
            category: docCategory,
            original_name: pendingFile.name,
            file_size: pendingFile.size,
        }]);
        setUploadingDoc(false);
        if (dbErr) {
            showErrorToast('case_document_upload', dbErr, 'تم رفع الملف لكن تعذّر حفظ بياناته. حاول تاني. لو المشكلة استمرت، تواصل مع الدعم.', 'حفظ بيانات المستند');
            return;
        }
        toast('✅ تم رفع المستند وإضافته للأرشيف');
        logActivity(db, 'رفع مستند (أرشيف)', { entity_type: 'document', details: docLabel.trim() || pendingFile.name });
        setShowForm(false); setPendingFile(null); setDocLabel(''); setDocCaseId('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        setFilterCat(docCategory);
        fetchDocs(0, searchQ, docCategory, sortBy, false);
    };

    const handleDelete = async (doc: CaseDocumentRow) => {
        setDeletingId(doc.id);
        const { error: storageErr } = await db.storage.from('case-docs').remove([doc.storage_path as string]);
        if (storageErr) { setDeletingId(null); toast('❌ فشل حذف الملف من التخزين', true); return; }
        const { error: dbErr } = await db.from('case_documents').delete().eq('id', doc.id);
        setDeletingId(null);
        if (dbErr) { toast('❌ فشل تحديث قاعدة البيانات', true); return; }
        toast('🗑 تم حذف المستند من الأرشيف');
        logActivity(db, 'حذف مستند (أرشيف)', { entity_type: 'document', entity_id: doc.id, details: doc.file_name || null });
        setDocs((prev: CaseDocumentRow[]) => prev.filter((d: CaseDocumentRow) => d.id !== doc.id));
        setDocsTotal((prev: number) => prev - 1);
    };

    const getDocMeta = (doc: CaseDocumentRow) => {
        const name = doc.original_name || doc.file_name || '';
        const isPdf  = /\.pdf$/i.test(name);
        const isImg  = /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
        const isWord = /\.(doc|docx)$/i.test(name);
        const isExcel= /\.(xls|xlsx)$/i.test(name);
        const isPpt  = /\.(ppt|pptx)$/i.test(name);
        const emoji  = isPdf?'📄':isImg?'🖼':isWord?'📝':isExcel?'📊':isPpt?'📑':'📎';
        const bg = isPdf?'bg-red-500/10 text-red-400 border-red-500/20'
            :isImg?'bg-rose-500/10 text-rose-400 border-rose-500/20'
            :isWord?'bg-blue-500/10 text-blue-400 border-blue-500/20'
            :isExcel?'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            :isPpt?'bg-orange-500/10 text-orange-400 border-orange-500/20'
            :'bg-white/5 text-slate-400 border-white/10';
        const canPreview = isPdf || isImg;
        return {isPdf, isImg, isWord, isExcel, isPpt, emoji, bg, canPreview};
    };

    const catColors: Record<string, string> = {
        'حكم قضائي':'text-premium-gold bg-premium-gold/10',
        'مذكرة دفاع':'text-blue-400 bg-blue-500/10',
        'صحيفة دعوى':'text-purple-400 bg-purple-500/10',
        'عقد':'text-emerald-400 bg-emerald-500/10',
        'توكيل':'text-cyan-400 bg-cyan-500/10',
        'مستند رسمي':'text-slate-300 bg-white/5',
        'صورة':'text-rose-400 bg-rose-500/10',
        'أخرى':'text-slate-400 bg-white/5',
    };

    return React.createElement('div',{className:"space-y-4 fade-in"},
        viewingDoc && React.createElement(PdfViewerModal,{doc:viewingDoc, onClose:()=>setViewingDoc(null)}),

        React.createElement('input',{
            ref:fileInputRef, type:'file',
            accept:'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt',
            onChange:handleFileSelect, style:{display:'none'}
        }),

        // ─ هيدر ─
        React.createElement('div',{className:"flex items-center justify-between"},
            React.createElement('div',null,
                React.createElement('h3',{className:"text-sm font-black text-white"},"الأرشيف الرقمي"),
                React.createElement('p',{className:"text-[9px] text-slate-500 mt-0.5"},docsTotal+" مستند")
            ),
            React.createElement('button',{
                onClick:()=>fileInputRef.current&&fileInputRef.current.click(),
                className:"flex items-center bg-gradient-to-tr from-purple-600 to-purple-400 text-white px-3 py-2 rounded-xl text-xs font-black shadow-lg gap-1 active:scale-95 transition-transform"
            },React.createElement(I.Plus),"رفع مستند")
        ),

        // ─ فورم الرفع ─
        showForm && pendingFile && React.createElement('div',{className:"bg-premium-card border border-purple-500/20 rounded-2xl p-4 space-y-3 slide-up"},
            React.createElement('div',{className:"flex items-center gap-3 p-3 bg-premium-bg rounded-xl"},
                React.createElement('div',{className:"w-10 h-10 rounded-xl flex items-center justify-center text-2xl shrink-0 "+getDocMeta(pendingFile as unknown as CaseDocumentRow).bg},getDocMeta(pendingFile as unknown as CaseDocumentRow).emoji),
                React.createElement('div',{className:"flex-1 min-w-0"},
                    React.createElement('p',{className:"text-xs font-bold text-white truncate"},pendingFile.name),
                    React.createElement('p',{className:"text-[9px] text-slate-500"},(pendingFile.size/1024/1024).toFixed(2)+' MB')
                ),
                React.createElement('button',{onClick:()=>{setShowForm(false);setPendingFile(null);if(fileInputRef.current)fileInputRef.current.value='';},className:"text-slate-500 hover:text-white"},React.createElement(I.X))
            ),
            React.createElement(Inp,{label:"اسم / وصف المستند",value:docLabel,onChange:(e: React.ChangeEvent<HTMLInputElement>) =>setDocLabel(e.target.value),placeholder:"مذكرة دفاع — جلسة 15 يونيو"}),
            React.createElement(Sel,{label:"تصنيف المستند",value:docCategory,onChange:(e: React.ChangeEvent<HTMLSelectElement>) =>setDocCategory(e.target.value),options:['مذكرة دفاع','صحيفة دعوى','حكم قضائي','عقد','توكيل','مستند رسمي','صورة','أخرى']}),
            cases.length>0&&React.createElement(Sel,{label:"ربط بقضية (اختياري)",value:docCaseId,onChange:(e: React.ChangeEvent<HTMLSelectElement>) =>setDocCaseId(e.target.value),options:[{value:'',label:'— غير مرتبط بقضية —'},...cases.map((c: MappedCase) =>({value:c.id,label:c.title}))]}),
            React.createElement('div',{className:"flex gap-2"},
                React.createElement('button',{onClick:handleUpload,disabled:uploadingDoc,className:"flex-1 py-2.5 bg-gradient-to-tr from-purple-600 to-purple-400 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95"},uploadingDoc?React.createElement(React.Fragment,null,React.createElement(I.Spin),"جاري الرفع..."):React.createElement(React.Fragment,null,"☁️ رفع في نظام سند")),
                React.createElement('button',{onClick:()=>{setShowForm(false);setPendingFile(null);if(fileInputRef.current)fileInputRef.current.value='';},className:"px-4 py-2.5 bg-white/5 text-slate-400 rounded-xl text-xs font-bold"},"إلغاء")
            )
        ),

        // ─ شريط البحث والفلاتر ─
        React.createElement('div',{className:"space-y-2.5"},
            React.createElement('div',{className:"relative"},
                React.createElement('span',{className:"absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"},React.createElement(I.Search)),
                React.createElement('input',{
                    type:"text", value:searchQ,
                    onChange:(e: React.ChangeEvent<HTMLInputElement>) =>handleSearchChange(e.target.value),
                    maxLength:100,
                    placeholder:"ابحث في المستندات والتصنيفات...",
                    className:"w-full p-3 pr-10 text-xs rounded-xl border border-white/10 bg-premium-card text-white placeholder-slate-500 transition-colors",
                    style:{fontFamily:'Cairo,sans-serif'}
                }),
                searchQ&&React.createElement('button',{onClick:()=>handleSearchChange(''),className:"absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"},React.createElement(I.X))
            ),

            React.createElement('div',{className:"flex gap-2 overflow-x-auto no-scrollbar pb-1"},
                CATS.map((cat: string) =>React.createElement('button',{
                    key:cat,onClick:()=>handleCatChange(cat),
                    className:`shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black transition-all ${filterCat===cat?'bg-purple-500/20 text-purple-300 border border-purple-500/30':'bg-white/5 text-slate-400 border border-transparent'}`
                },cat))
            ),

            React.createElement('div',{className:"flex items-center justify-between"},
                React.createElement('span',{className:"text-[9px] text-slate-500 font-bold"},
                    searchQ||filterCat!=='الكل'
                        ? `${docs.length} من ${docsTotal} نتيجة`
                        : `${docsTotal} مستند في الأرشيف`
                ),
                React.createElement('select',{
                    value:sortBy,onChange:(e: React.ChangeEvent<HTMLSelectElement>) =>handleSortChange(e.target.value),
                    className:"text-[9px] font-bold bg-premium-card border border-white/10 text-slate-300 rounded-lg px-2 py-1 outline-none",
                    style:{fontFamily:'Cairo,sans-serif'}
                },
                    React.createElement('option',{value:'date_desc'},"الأحدث أولاً"),
                    React.createElement('option',{value:'date_asc'},"الأقدم أولاً"),
                    React.createElement('option',{value:'name'},"ترتيب أبجدي"),
                    React.createElement('option',{value:'size'},"الأكبر حجماً")
                )
            )
        ),

        // ─ قائمة المستندات ─
        loading && docs.length === 0
            ? React.createElement('div',{className:"flex items-center justify-center py-16 gap-2 text-slate-500 text-xs"},React.createElement(I.Spin),"جاري تحميل الأرشيف...")
            : docsTotal === 0
                ? React.createElement('div',{className:"text-center py-16 space-y-4"},
                    React.createElement('div',{className:"w-20 h-20 rounded-2xl bg-purple-500/10 flex items-center justify-center text-4xl mx-auto"},"🗄"),
                    React.createElement('p',{className:"text-white font-black text-sm"},searchQ||filterCat!=='الكل'?"لا توجد نتائج":"الأرشيف فارغ"),
                    searchQ||filterCat!=='الكل'
                        ? React.createElement('button',{onClick:()=>{handleSearchChange('');handleCatChange('الكل');},className:"text-purple-400 text-xs font-bold"},"مسح الفلاتر")
                        : React.createElement('button',{onClick:()=>fileInputRef.current&&fileInputRef.current.click(),className:"mx-auto mt-2 flex items-center gap-2 px-4 py-2.5 bg-purple-500/10 border border-purple-500/20 text-purple-300 rounded-xl text-xs font-black active:scale-95"},React.createElement(I.Plus),"ابدأ الأرشفة")
                  )
                : React.createElement('div',{className:"space-y-3"},
                    docs.map((doc: CaseDocumentRow) => {
                        const {emoji, bg, canPreview} = getDocMeta(doc);
                        const linkedCase   = cases.find((c: MappedCase) => c.id === doc.case_id);
                        const catColor     = catColors[doc.category as string] || 'text-slate-400 bg-white/5';
                        return React.createElement('div',{key:doc.id,className:"bg-premium-card border border-white/5 rounded-xl px-3 py-2.5 flex items-center gap-2.5 hover:border-purple-500/20 transition-all"},
                            React.createElement('div',{className:`w-9 h-9 rounded-lg border flex items-center justify-center text-lg shrink-0 ${canPreview?'cursor-pointer active:scale-90':''} ${bg}`,onClick:()=>canPreview&&setViewingDoc(doc)},emoji),
                            React.createElement('div',{className:"flex-1 min-w-0"},
                                React.createElement('p',{className:"text-[11px] font-black text-white leading-tight truncate"},doc.file_name),
                                React.createElement('div',{className:"flex items-center gap-1.5 mt-0.5"},
                                    React.createElement('span',{className:"text-[9px] font-bold px-1.5 py-0.5 rounded-full "+catColor},doc.category),
                                    linkedCase&&React.createElement('span',{className:"text-[9px] text-premium-gold/70 truncate"},"⚖️ "+linkedCase.title),
                                    !linkedCase&&doc.file_size&&React.createElement('span',{className:"text-[9px] text-slate-600"},(doc.file_size/1024/1024).toFixed(1)+" MB")
                                )
                            ),
                            React.createElement('div',{className:"flex items-center gap-1 shrink-0"},
                                canPreview&&React.createElement('button',{onClick:()=>setViewingDoc(doc),className:"w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/15 flex items-center justify-center text-purple-400 active:scale-90 text-sm"},"👁"),
                                React.createElement('a',{href:doc.file_url as string,target:'_blank',rel:'noreferrer',className:"w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 active:scale-90"},React.createElement(I.Download,{className:"w-3.5 h-3.5"})),
                                React.createElement('button',{onClick:()=>handleDelete(doc),disabled:deletingId===doc.id,className:"w-7 h-7 rounded-lg bg-rose-500/5 border border-rose-500/10 flex items-center justify-center text-rose-400/60 hover:text-rose-400 active:scale-90 disabled:opacity-40"},deletingId===doc.id?React.createElement(I.Spin):React.createElement(I.Trash,{className:"w-3.5 h-3.5"}))
                            )
                        );
                    }),

                    // زر تحميل المزيد
                    docsMore && React.createElement('button',{
                        onClick:()=>fetchDocs(docsPage+1,searchQ,filterCat,sortBy,true),
                        disabled:loading,
                        className:"w-full py-3 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/10 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
                    }, loading?React.createElement(I.Spin):"⬇️ تحميل المزيد")
                )
    );
}

export default ArchiveTab;
