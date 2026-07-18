import React, { useState, useEffect } from 'react';
import { toast } from '../../shared/lib/notifications';
import { formatPhoneForWhatsApp } from '../../shared/lib/validation';
import { Inp } from '@/shared/ui/Inp';
import { Sel } from '@/shared/ui/Sel';
import DatePicker from '@/shared/ui/DatePicker';
import { db } from '../../supabaseClient';
import { I, COUNTRY_CONFIGS, loadOfficeSetting } from '../../constants';
import EditCaseModal from './EditCaseModal';
import SessionUpdateModal from '@/features/calendar/sessions-calendar/SessionUpdateModal';
import DeleteConfirmModal from '@/shared/modals/DeleteConfirmModal';
import SessionsCalendar from '@/features/calendar/sessions-calendar/SessionsCalendar';
import NotesSection from './case-detail/NotesSection';
import InfoSection from './case-detail/InfoSection';
import DocsSection from './case-detail/DocsSection';
import TimelineSection from './case-detail/TimelineSection';
import PdfViewerModal from '@/shared/modals/PdfViewerModal';
import { useCaseDetailActions } from './hooks/useCaseDetailActions';
import type { CaseDocWithUrl } from './hooks/useCaseDetailActions';
import type { MappedCase } from '../../hooks/useAppData';
import type { ClientRow, ProfileRow } from '../../types';
import type { CaseFormSubmitData } from './hooks/useCaseActions';

// شكل عنصر حالة القضية (نفس الحقول المستخدمة فعليًا في مصفوفة statuses تحت)
interface CaseStatusOption {
    key: string;
    color: string;
    icon: string;
}

// شكل عنصر رسالة واتساب الجاهزة (نفس الحقول المستخدمة فعليًا في مصفوفة messages تحت)
interface WhatsAppMessageOption {
    label: string;
    icon: string;
    text: string;
}

// شكل عنصر تبويب شاشة تفاصيل القضية
interface CaseDetailTab {
    key: string;
    label: string;
    icon: string;
}

interface CaseDetailViewProps {
    caseData: MappedCase;
    client: ClientRow | null;
    onClose: () => void;
    onUpdate?: (newStatus: string) => void;
    onDelete?: (caseId: string) => void | Promise<void>;
    onEdit?: (caseId: string, form: CaseFormSubmitData) => void | Promise<void>;
    onNotify?: (msg: string) => void | Promise<void>;
    initialTab?: string;
    profile?: ProfileRow | null;
    country?: string | null;
}

function CaseDetailView({caseData, client, onClose, onUpdate, onDelete, onEdit, onNotify, initialTab='timeline', profile=null, country=null}: CaseDetailViewProps){
    const [activeSection, setActiveSection] = useState(initialTab);
    const [showEditCase, setShowEditCase] = useState(false);
    const [confirmDeleteCase, setConfirmDeleteCase] = useState(false);
    const [showStatusPicker, setShowStatusPicker] = useState(false);
    const [docSearch, setDocSearch] = useState('');
    const [viewingDoc, setViewingDoc] = useState<CaseDocWithUrl | null>(null);

    // ✅ FIX: كان هنا كاست إجباري (as unknown as CaseRow) لأن توقيع
    // useCaseDetailActions كان بيطلب CaseRow خام، بينما caseData هنا فعليًا
    // MappedCase (الشكل المُطبَّع بعد fetchCases في useAppData.ts) — نفس باگ
    // case_type/case_number المعروف. اتصلح من الجذر بتغيير توقيع
    // useCaseDetailActions نفسه ليقبل MappedCase مباشرة، فبقى الاستدعاء هنا
    // بدون أي كاست.
    const actions = useCaseDetailActions(caseData, onUpdate, onDelete, onNotify, setShowStatusPicker, client, profile);
    const {
      sessions, notes, docs, loadingSessions,
      showAddSession, setShowAddSession,
      editingNoteId, setEditingNoteId, editingNoteText, setEditingNoteText,
      editingSession, setEditingSession,
      deletingSessionId, setDeletingSessionId,
      sessionUpdateTarget, setSessionUpdateTarget,
      deletingNoteId, setDeletingNoteId,
      showAddNote, setShowAddNote,
      uploadingDoc, docCategory, setDocCategory, docLabel, setDocLabel,
      showDocForm, setShowDocForm, pendingFile, setPendingFile,
      deletingDocId, setDeletingDocId, fileInputRef,
      savingSession, savingNote, changingStatus,
      sessionForm, setSessionForm, noteText, setNoteText,
      exportingPdf, showWhatsApp, setShowWhatsApp, officeWhatsAppName,
      confirmDeleteSession, setConfirmDeleteSession,
      confirmDeleteNote, setConfirmDeleteNote,
      confirmDeleteDoc, setConfirmDeleteDoc,
      fetchSessions, handleFileSelect, handleUploadDoc, handleDeleteDoc,
      handleExportPdf, handleAddSession, handleAddNote, handleDeleteNote,
      handleUpdateNote, handleDeleteSession, handleUpdateSession, handleChangeStatus,
    } = actions;

    const statuses: CaseStatusOption[] = [
        {key:'نشطة', color:'emerald', icon:'⚡'},
        {key:'مؤجلة', color:'amber', icon:'⏸'},
        {key:'منتهية', color:'blue', icon:'✅'},
        {key:'مغلقة', color:'slate', icon:'🔒'},
    ];

    // جلب بيانات المكتب للواتساب
    const [officeWA, setOfficeWA] = useState('');
    useEffect(()=>{
        Promise.all([
            loadOfficeSetting('office_whatsapp'),
            loadOfficeSetting('office_name'),
        ]).then(([wa, name]: [string | null, string | null])=>{
            actions.setOfficeWhatsAppName?.(name||'مكتب المحاماة');
            setOfficeWA(wa||'');
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    },[]);

    const statusStyle: Record<string, string> = {
        'نشطة': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        'مؤجلة': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        'منتهية': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
        'مغلقة': 'bg-slate-500/15 text-slate-400 border-slate-500/30',
    };

    const typeColors: Record<string, string> = {
        'تجاري':'from-blue-600/30 to-blue-600/5 border-blue-500/20 text-blue-300',
        'عمالي':'from-purple-600/30 to-purple-600/5 border-purple-500/20 text-purple-300',
        'جنائي':'from-rose-600/30 to-rose-600/5 border-rose-500/20 text-rose-300',
        'إداري':'from-cyan-600/30 to-cyan-600/5 border-cyan-500/20 text-cyan-300',
        'مدني':'from-teal-600/30 to-teal-600/5 border-teal-500/20 text-teal-300',
    };

    const tColor = typeColors[caseData.type] || typeColors['تجاري'];

    return React.createElement('div', {className: "fixed inset-0 z-50 bg-premium-bg flex flex-col fade-in", 'data-testid': 'case-detail-view'},

        // ── SessionUpdateModal ──
        sessionUpdateTarget && React.createElement(SessionUpdateModal, {
            session: sessionUpdateTarget,
            caseData: caseData,
            db: db,
            onClose: () => setSessionUpdateTarget(null),
            onDone: () => fetchSessions(),
            onNotify: onNotify
        }),

        // ── عرض المستند ──
        viewingDoc && React.createElement(PdfViewerModal, {doc: viewingDoc, onClose: () => setViewingDoc(null)}),

        // ── مودال تأكيد الحذف ──
        confirmDeleteCase && React.createElement('div', {className: "fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"},
            React.createElement('div', {className: "bg-premium-card border border-rose-500/20 rounded-3xl p-6 w-full max-w-sm slide-up shadow-2xl"},
                React.createElement('div', {className: "w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-2xl mx-auto mb-4"}, "🗑"),
                React.createElement('h3', {className: "text-sm font-black text-white text-center mb-2"}, "حذف القضية"),
                React.createElement('p', {className: "text-xs text-slate-400 text-center mb-5 leading-relaxed"}, "هل أنت متأكد من حذف \""+caseData.title+"\"؟\nلن يمكن التراجع عن هذا الإجراء."),
                React.createElement('div', {className: "flex gap-3"},
                    React.createElement('button', {
                        onClick: () => { onDelete?.(caseData.id); },
                        className: "flex-1 py-3 bg-rose-500 text-white rounded-xl text-xs font-black active:scale-95 transition-all",
                        'data-testid': 'case-delete-local-confirm'
                    }, "نعم، احذف"),
                    React.createElement('button', {
                        onClick: () => setConfirmDeleteCase(false),
                        className: "flex-1 py-3 bg-white/5 text-slate-300 rounded-xl text-xs font-black active:scale-95 transition-all"
                    }, "إلغاء")
                )
            )
        ),

        // ── مودال تعديل القضية ──
        showEditCase && React.createElement('div', {className: "fixed inset-0 z-[60] flex items-end justify-center bg-black/80 backdrop-blur-sm"},
            React.createElement(EditCaseModal, {
                caseData,
                onClose: () => setShowEditCase(false),
                onSave: (form: CaseFormSubmitData) => { onEdit?.(caseData.id, form); setShowEditCase(false); },
                countryCourts: COUNTRY_CONFIGS[country as string]?.courts,
                countryCaseTypes: COUNTRY_CONFIGS[country as string]?.caseTypes,
            })
        ),

        // ── مودال واتساب ──
        showWhatsApp && (()=>{
            const waNum = formatPhoneForWhatsApp(officeWA);
            const clientPhone = formatPhoneForWhatsApp(client?.phone);
            const officeName = officeWhatsAppName || 'مكتب المحاماة';
            const caseTitle = caseData.title || '—';
            const caseNum = caseData.number && caseData.number!=='—' ? (()=>{const p=(caseData.number||'').split('/');return p.length===2?p[0]+' لسنة '+p[1]:caseData.number;})() : '';
            const nextDate = caseData.date && caseData.date!=='—' ? caseData.date : '';
            const clientName = client?.full_name || 'الموكل الكريم';
            const sig = `\n\nمع التقدير،\n${officeName}`;

            const messages: WhatsAppMessageOption[] = [
                {
                    label: '📅 تأجيل الجلسة',
                    icon: '📅',
                    text: `السلام عليكم ورحمة الله وبركاته،\nأستاذ/ة ${clientName}،\n\nنحيطكم علماً بأنه تم تأجيل الجلسة،\nوسيتم إخطاركم بالموعد الجديد فور تحديده.${sig}`
                },
                {
                    label: '📋 طلب مستندات',
                    icon: '📋',
                    text: `السلام عليكم ورحمة الله وبركاته،\nأستاذ/ة ${clientName}،\n\nتمهيداً للجلسة القادمة، نود إفادتكم بضرورة توفير المستندات التالية:\n- \n- \n\nيُرجى التواصل معنا في أسرع وقت ممكن.${sig}`
                },
                {
                    label: '🎉 صدور حكم لصالحكم',
                    icon: '🎉',
                    text: `السلام عليكم ورحمة الله وبركاته،\nأستاذ/ة ${clientName}،\n\nيسعدنا إخطاركم بأن المحكمة قد أصدرت حكمها لصالحكم،\nوالحمد لله على هذا الفضل.${sig}`
                },
                {
                    label: '⚖️ تحديد جلسة جديدة',
                    icon: '⚖️',
                    text: `السلام عليكم ورحمة الله وبركاته،\nأستاذ/ة ${clientName}،\n\nنفيدكم بأنه تم تحديد موعد الجلسة القادمة،\nوسيتم إخطاركم بالتفاصيل قريباً.${sig}`
                },
                {
                    label: '📎 تسليم صورة الحكم',
                    icon: '📎',
                    text: `السلام عليكم ورحمة الله وبركاته،\nأستاذ/ة ${clientName}،\n\nنفيدكم بأن صورة الحكم أصبحت جاهزة للاستلام،\nيمكنكم التواصل معنا لتحديد موعد مناسب.${sig}`
                },
                {
                    label: '💰 تذكير بالأتعاب',
                    icon: '💰',
                    text: `السلام عليكم ورحمة الله وبركاته،\nأستاذ/ة ${clientName}،\n\nتذكيراً ودياً، نرجو منكم إتمام سداد المستحقات المتفق عليها،\nوذلك حتى نتمكن من الاستمرار في تقديم أفضل خدمة قانونية لكم.${sig}`
                },
                {
                    label: '✅ انتهاء القضية',
                    icon: '✅',
                    text: `السلام عليكم ورحمة الله وبركاته،\nأستاذ/ة ${clientName}،\n\nنسعد بإخطاركم بانتهاء إجراءات القضية،\nوقد كان شرفاً لنا خدمتكم، ونأمل أن نكون عند حسن ظنكم.${sig}`
                },
                {
                    label: '📞 طلب تواصل',
                    icon: '📞',
                    text: `السلام عليكم ورحمة الله وبركاته،\nأستاذ/ة ${clientName}،\n\nنرجو التكرم بالتواصل معنا في أقرب وقت ممكن لمناقشة بعض المستجدات المتعلقة بقضيتكم.${sig}`
                },
            ];

            const sendWA = (text: string) => {
                if(!clientPhone){ toast('⚠️ لا يوجد رقم واتساب مسجل للموكل', true); return; }
                const url = `https://wa.me/${clientPhone}?text=${encodeURIComponent(text)}`;
                window.open(url, '_blank');
            };

            return React.createElement('div', {
                className: "fixed inset-0 z-[70] flex items-end justify-center bg-black/80 backdrop-blur-sm",
                onClick: (e: React.MouseEvent<HTMLDivElement>) =>{ if(e.target===e.currentTarget) setShowWhatsApp(false); }
            },
                React.createElement('div', {className: "bg-premium-card w-full max-w-lg rounded-t-3xl border-t border-white/10 shadow-2xl slide-up max-h-[85vh] flex flex-col"},
                    // Header
                    React.createElement('div', {className: "px-6 pt-5 pb-4 border-b border-white/5 shrink-0"},
                        React.createElement('div', {className: "w-10 h-1 bg-white/20 rounded-full mx-auto mb-4"}),
                        React.createElement('div', {className: "flex items-center justify-between"},
                            React.createElement('div', {className: "flex items-center gap-2.5"},
                                React.createElement('div', {className: "w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-lg"}, "💬"),
                                React.createElement('div', null,
                                    React.createElement('p', {className: "text-sm font-black text-white"}, "مراسلة الموكل"),
                                    React.createElement('p', {className: "text-[10px] text-slate-500"}, clientPhone ? `📱 ${client?.phone}` : "لا يوجد رقم واتساب مسجل للموكل")
                                )
                            ),
                            React.createElement('button', {onClick: ()=>setShowWhatsApp(false), className: "w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-slate-400"}, "✕")
                        )
                    ),
                    // رسائل
                    React.createElement('div', {className: "overflow-y-auto no-scrollbar p-4 space-y-2.5"},
                        messages.map((msg: WhatsAppMessageOption, i: number) =>
                            React.createElement('button', {
                                key: i,
                                onClick: () => sendWA(msg.text),
                                className: "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white/3 border border-white/8 hover:bg-emerald-500/10 hover:border-emerald-500/20 active:scale-[0.98] transition-all text-right"
                            },
                                React.createElement('span', {className: "text-xl shrink-0"}, msg.icon),
                                React.createElement('div', {className: "flex-1"},
                                    React.createElement('p', {className: "text-xs font-black text-white"}, msg.label),
                                    React.createElement('p', {className: "text-[10px] text-slate-500 mt-0.5 line-clamp-1"},
                                        msg.text.split('\n').filter((l: string) =>l.trim()&&!l.includes('السلام'))[0]||''
                                    )
                                ),
                                React.createElement('span', {className: "text-emerald-400 text-sm shrink-0"}, "↗")
                            )
                        )
                    )
                )
            );
        })(),

        // ── Hero Header ──
        React.createElement('div', {className: `relative bg-gradient-to-b ${tColor.split(' ').slice(0,2).join(' ')} border-b border-white/5 pb-0 overflow-hidden`},
            // خلفية زخرفية
            React.createElement('div', {className: "absolute inset-0 overflow-hidden pointer-events-none"},
                React.createElement('div', {className: "absolute -top-20 -right-20 w-64 h-64 rounded-full bg-white/3 blur-3xl"}),
                React.createElement('div', {className: "absolute top-10 left-10 w-32 h-32 rounded-full bg-premium-gold/5 blur-2xl"}),
                // خطوط زخرفية
                React.createElement('div', {style:{position:'absolute',top:0,right:0,width:'100%',height:'100%',backgroundImage:'repeating-linear-gradient(45deg, transparent, transparent 40px, rgba(255,255,255,0.01) 40px, rgba(255,255,255,0.01) 80px)', pointerEvents:'none'}})
            ),

            // شريط التنقل العلوي
            React.createElement('div', {className: "relative z-10 flex items-center justify-between px-4 pt-4 pb-3"},
                React.createElement('button', {
                    onClick: onClose,
                    'data-testid': 'case-detail-close',
                    className: "flex items-center gap-1.5 text-white/70 hover:text-white transition-colors active:scale-95"
                },
                    React.createElement(I.ChevronLeft),
                    React.createElement('span', {className: "text-xs font-bold"}, "القضايا")
                ),
                React.createElement('div', {className: "flex items-center gap-2"},
                    // زر تصدير PDF
                    React.createElement('button', {
                        onClick: handleExportPdf,
                        disabled: exportingPdf,
                        title: "تصدير PDF",
                        className: "w-8 h-8 rounded-xl bg-premium-gold/10 border border-premium-gold/20 flex items-center justify-center text-premium-gold hover:bg-premium-gold/20 active:scale-90 transition-all disabled:opacity-50"
                    }, exportingPdf ? React.createElement(I.Spin) : React.createElement('span',{className:"text-sm"},"📄")),
                    // زر واتساب
                    React.createElement('button', {
                        onClick: () => setShowWhatsApp(true),
                        title: "مراسلة الموكل واتساب",
                        className: "w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 active:scale-90 transition-all"
                    }, React.createElement('span', {className: "text-sm"}, "💬")),
                    // زر تعديل
                    React.createElement('button', {
                        onClick: () => setShowEditCase(true),
                        className: "w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-premium-gold hover:border-premium-gold/30 active:scale-90 transition-all"
                    }, React.createElement(I.Edit)),
                    // زر حذف
                    React.createElement('button', {
                        onClick: () => setConfirmDeleteCase(true),
                        className: "w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 hover:bg-rose-500/20 active:scale-90 transition-all",
                        'data-testid': 'case-delete-trigger'
                    }, React.createElement(I.Trash)),
                    // زر تغيير الحالة
                    React.createElement('div', {className: "relative"},
                        React.createElement('button', {
                            onClick: () => setShowStatusPicker(!showStatusPicker),
                            className: `flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-black transition-all ${statusStyle[caseData.status] || statusStyle['نشطة']}`
                        },
                            changingStatus ? React.createElement(I.Spin) : React.createElement('span', null, statuses.find((s: CaseStatusOption) =>s.key===caseData.status)?.icon || '⚡'),
                            React.createElement('span', null, caseData.status || 'نشطة'),
                            React.createElement('svg', {className: "w-3 h-3 opacity-60", fill: "none", viewBox: "0 0 24 24", strokeWidth: "2.5", stroke: "currentColor"},
                                React.createElement('path', {strokeLinecap: "round", strokeLinejoin: "round", d: "m19.5 8.25-7.5 7.5-7.5-7.5"})
                            )
                        ),
                        showStatusPicker && React.createElement('div', {className: "absolute top-full left-0 mt-2 bg-premium-card border border-white/10 rounded-2xl overflow-hidden shadow-2xl z-20 min-w-[140px]"},
                            statuses.map((s: CaseStatusOption) =>
                                React.createElement('button', {
                                    key: s.key,
                                    onClick: () => handleChangeStatus(s.key),
                                    className: `w-full flex items-center gap-2 px-4 py-3 text-xs font-bold text-right transition-colors ${caseData.status === s.key ? 'bg-white/5 text-premium-gold' : 'text-slate-300 hover:bg-white/5'}`
                                },
                                    React.createElement('span', null, s.icon),
                                    React.createElement('span', null, s.key),
                                    caseData.status === s.key && React.createElement(I.Check)
                                )
                            )
                        )
                    )
                )
            ),

            // معلومات القضية الرئيسية
            React.createElement('div', {className: "relative z-10 px-5 pb-5"},
                // نوع القضية badge
                React.createElement('div', {className: "inline-flex items-center gap-1.5 mb-3"},
                    React.createElement('div', {className: `px-2.5 py-1 rounded-lg border text-[9px] font-black tracking-widest uppercase ${tColor.split(' ').slice(2).join(' ')}`},
                        React.createElement(I.Scale),
                    ),
                    React.createElement('span', {className: "text-[10px] font-black text-white/60 tracking-wider"}, caseData.type)
                ),

                React.createElement('h1', {className: "text-lg font-black text-white leading-tight mb-2 ml-2", 'data-testid': 'case-detail-title'}, caseData.title),

                // أسماء الخصوم
                (()=>{
                    const splitParty = (val: string | null) => {
                        if(!val) return {name:'—', capacity:''};
                        const m = val.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
                        return m ? {name:m[1].trim(), capacity:m[2].trim()} : {name:val, capacity:''};
                    };
                    const p = splitParty(caseData.plaintiff);
                    const d = splitParty(caseData.defendant);
                    return (caseData.plaintiff || caseData.defendant) && React.createElement('div',{className:"flex items-center gap-2 mb-3 flex-wrap"},
                        React.createElement('div',{className:"flex flex-col"},
                            React.createElement('span',{className:"text-[11px] font-black text-emerald-400 leading-tight"},p.name),
                            p.capacity && React.createElement('span',{className:"text-[9px] font-bold text-emerald-400/60 leading-tight"},p.capacity)
                        ),
                        React.createElement('span',{className:"text-[10px] font-black text-purple-400 px-1.5 py-0.5 rounded-md shrink-0",style:{background:'rgba(168,85,247,0.12)'}},"ضد"),
                        React.createElement('div',{className:"flex flex-col"},
                            React.createElement('span',{className:"text-[11px] font-black text-rose-400 leading-tight"},d.name),
                            d.capacity && React.createElement('span',{className:"text-[9px] font-bold text-rose-400/60 leading-tight"},d.capacity)
                        )
                    );
                })(),

                React.createElement('div', {className: "flex flex-wrap gap-x-4 gap-y-2"},
                    caseData.number !== '—' && React.createElement('div', {className: "flex items-center gap-1.5"},
                        React.createElement('span', {className: "text-[9px] text-white/40 font-bold"}, "رقم القيد"),
                        React.createElement('span', {className: "text-[10px] text-premium-gold font-black font-mono"},
                            (()=>{const p=(caseData.number||'').split('/');return p.length===2?p[0]+' لسنة '+p[1]:caseData.number;})()
                        )
                    ),
                    React.createElement('div', {className: "flex items-center gap-1.5"},
                        React.createElement('span', {className: "text-[9px] text-white/40 font-bold"}, "المحكمة"),
                        React.createElement('span', {className: "text-[10px] text-white/80 font-bold"}, caseData.court)
                    ),
                    client && React.createElement('div', {className: "flex items-center gap-1.5"},
                        React.createElement('span', {className: "text-[9px] text-white/40 font-bold"}, "الموكل"),
                        React.createElement('span', {className: "text-[10px] text-emerald-400 font-black"}, client.full_name),
                        client.phone && React.createElement('a',{href:`tel:${client.phone}`,className:"text-[9px] text-slate-500"},client.phone)
                    )
                )
            ),

            // Tabs
            React.createElement('div', {className: "relative z-10 flex border-t border-white/5"},
                ([
                    {key:'timeline', label:'الجلسات', icon:'🗓'},
                    {key:'notes', label:'الملاحظات', icon:'📝'},
                    {key:'docs', label:'المستندات', icon:'📁'},
                    {key:'info', label:'البيانات', icon:'📋'},
                ] as CaseDetailTab[]).map((tab) =>
                    React.createElement('button', {
                        key: tab.key,
                        onClick: () => setActiveSection(tab.key),
                        'data-testid': 'case-tab-' + tab.key,
                        className: `flex-1 flex flex-col items-center gap-0.5 py-3 text-[9px] font-black transition-all ${activeSection === tab.key ? 'text-premium-gold border-b-2 border-premium-gold' : 'text-white/40 border-b-2 border-transparent'}`
                    },
                        React.createElement('span', {className: "text-base leading-none"}, tab.icon),
                        tab.label
                    )
                )
            )
        ),

        // ── المحتوى ──
        React.createElement('div', {className: "flex-1 overflow-y-auto no-scrollbar px-4 py-4 pb-28"},

            // ═══ Timeline الجلسات ═══
            activeSection === 'timeline' && React.createElement(TimelineSection, { showAddSession, setShowAddSession, sessionForm, setSessionForm, handleAddSession, savingSession, loadingSessions, sessions, editingSession, setEditingSession, handleUpdateSession, setSessionUpdateTarget, deletingSessionId, setConfirmDeleteSession }), // end sessions outer div

            // ═══ الملاحظات ═══
            activeSection === 'notes' && React.createElement(NotesSection, { showAddNote, setShowAddNote, noteText, setNoteText, handleAddNote, savingNote, loadingSessions, notes, editingNoteId, setEditingNoteId, editingNoteText, setEditingNoteText, handleUpdateNote, deletingNoteId, setConfirmDeleteNote }),

            // ═══ المستندات ═══
            activeSection === 'docs' && React.createElement(DocsSection, { fileInputRef, handleFileSelect, showDocForm, setShowDocForm, pendingFile, setPendingFile, docLabel, setDocLabel, docCategory, setDocCategory, handleUploadDoc, uploadingDoc, docs, docSearch, setDocSearch, loadingSessions, setViewingDoc, setConfirmDeleteDoc, deletingDocId }),

            // ═══ البيانات ═══
            activeSection === 'info' && React.createElement(InfoSection, { caseData, client, sessions, notes, docs })
        ),

        // ── مودال تأكيد حذف الجلسة ──
        confirmDeleteSession && React.createElement('div', {className: "fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"},
            React.createElement('div', {className: "bg-premium-card border border-rose-500/20 rounded-3xl p-6 w-full max-w-sm slide-up shadow-2xl"},
                React.createElement('div', {className: "w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-2xl mx-auto mb-4"}, "🗑"),
                React.createElement('h3', {className: "text-sm font-black text-white text-center mb-2"}, "حذف الجلسة"),
                React.createElement('p', {className: "text-xs text-slate-400 text-center mb-5 leading-relaxed"},
                    "هل أنت متأكد من حذف جلسة " + (confirmDeleteSession.date || '—') + "؟\nلن يمكن التراجع عن هذا الإجراء."
                ),
                React.createElement('div', {className: "flex gap-3"},
                    React.createElement('button', {
                        onClick: async () => {
                            const id = confirmDeleteSession.id;
                            setConfirmDeleteSession(null);
                            setDeletingSessionId(id);
                            await handleDeleteSession(id);
                            setDeletingSessionId(null);
                        },
                        className: "flex-1 py-3 bg-rose-500 text-white rounded-xl text-xs font-black active:scale-95 transition-all"
                    }, "نعم، احذف"),
                    React.createElement('button', {
                        onClick: () => setConfirmDeleteSession(null),
                        className: "flex-1 py-3 bg-white/5 text-slate-300 rounded-xl text-xs font-black active:scale-95 transition-all"
                    }, "إلغاء")
                )
            )
        ),

        // ── مودال تأكيد حذف الملاحظة ──
        confirmDeleteNote && React.createElement('div', {className: "fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"},
            React.createElement('div', {className: "bg-premium-card border border-rose-500/20 rounded-3xl p-6 w-full max-w-sm slide-up shadow-2xl"},
                React.createElement('div', {className: "w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-2xl mx-auto mb-4"}, "🗑"),
                React.createElement('h3', {className: "text-sm font-black text-white text-center mb-2"}, "حذف الملاحظة"),
                React.createElement('p', {className: "text-xs text-slate-400 text-center mb-5 leading-relaxed"},
                    confirmDeleteNote.preview
                        ? "\"" + confirmDeleteNote.preview + (confirmDeleteNote.preview.length >= 40 ? "…" : "") + "\"\n\nهل أنت متأكد من الحذف؟ لن يمكن التراجع."
                        : "هل أنت متأكد من حذف الملاحظة؟ لن يمكن التراجع."
                ),
                React.createElement('div', {className: "flex gap-3"},
                    React.createElement('button', {
                        onClick: async () => {
                            const id = confirmDeleteNote.id;
                            setConfirmDeleteNote(null);
                            setDeletingNoteId(id);
                            await handleDeleteNote(id);
                            setDeletingNoteId(null);
                        },
                        className: "flex-1 py-3 bg-rose-500 text-white rounded-xl text-xs font-black active:scale-95 transition-all"
                    }, "نعم، احذف"),
                    React.createElement('button', {
                        onClick: () => setConfirmDeleteNote(null),
                        className: "flex-1 py-3 bg-white/5 text-slate-300 rounded-xl text-xs font-black active:scale-95 transition-all"
                    }, "إلغاء")
                )
            )
        ),

        // ── مودال تأكيد حذف المستند (BUG-14 FIX) ──
        confirmDeleteDoc && React.createElement('div', {className: "fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"},
            React.createElement('div', {className: "bg-premium-card border border-rose-500/20 rounded-3xl p-6 w-full max-w-sm slide-up shadow-2xl"},
                React.createElement('div', {className: "w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-2xl mx-auto mb-4"}, "📄"),
                React.createElement('h3', {className: "text-sm font-black text-white text-center mb-2"}, "حذف المستند"),
                React.createElement('p', {className: "text-xs text-slate-400 text-center mb-5 leading-relaxed"},
                    "\"" + confirmDeleteDoc.file_name + "\"\n\nسيُحذف من التخزين وقاعدة البيانات ولا يمكن التراجع."
                ),
                React.createElement('div', {className: "flex gap-3"},
                    React.createElement('button', {
                        onClick: async () => {
                            const doc = confirmDeleteDoc;
                            setConfirmDeleteDoc(null);
                            await handleDeleteDoc(doc);
                        },
                        className: "flex-1 py-3 bg-rose-500 text-white rounded-xl text-xs font-black active:scale-95 transition-all"
                    }, "نعم، احذف"),
                    React.createElement('button', {
                        onClick: () => setConfirmDeleteDoc(null),
                        className: "flex-1 py-3 bg-white/5 text-slate-300 rounded-xl text-xs font-black active:scale-95 transition-all"
                    }, "إلغاء")
                )
            )
        )
    );
}

export default CaseDetailView;
