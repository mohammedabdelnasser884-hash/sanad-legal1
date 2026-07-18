import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { I } from '../../constants';
import { formatPhoneForWhatsApp } from '../../shared/lib/validation';
import { useResolvedStorageUrl } from '../../shared/lib/storage';
import EditClientModal from './EditClientModal';
import DeleteConfirmModal from '@/shared/modals/DeleteConfirmModal';
import type { ClientRow } from '../../types';
import type { MappedCase } from '../../hooks/useAppData';
import type { ClientContactInfo, ClientFormData } from './hooks/useClientActions';

interface ClientDetailModalProps {
    client: ClientRow;
    cases: MappedCase[];
    onClose: () => void;
    onDelete?: (clientId: string) => void;
    onEdit?: (clientId: string, form: ClientFormData, idFile?: File | null, poaFile?: File | null) => void;
    onOpenCase?: (ca: MappedCase) => void;
}

function ClientDetailModal({client:c, cases, onClose, onDelete, onEdit, onOpenCase}: ClientDetailModalProps){
    const typeLabel=c.type==='individual'?'فرد':c.type==='company'?'شركة':c.type==='government'?'جهة حكومية':c.type||'فرد';
    const [imgViewer,setImgViewer]=useState<string|null>(null);
    const [confirmDeleteClient, setConfirmDeleteClient]=useState(false);
    const [showEditClient, setShowEditClient]=useState(false);
    // ⚠️ client-docs باكت private — الرابط المتخزن في contact_info ممكن
    // يكون منتهي/رابط عام قديم، فبنولّد رابط موقّع طازة وقت فتح المودال.
    const contactInfo = c.contact_info as ClientContactInfo | null;
    const idImgUrl  = useResolvedStorageUrl('client-docs', contactInfo?.id_url);
    const poaImgUrl = useResolvedStorageUrl('client-docs', contactInfo?.poa_url);

    return React.createElement('div',{'data-testid':'client-detail-view',className:"fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm",onClick:(e: React.MouseEvent<HTMLDivElement>) =>{if(e.target===e.currentTarget)onClose();}},
        // عارض الصورة
        imgViewer&&React.createElement('div',{
            className:"fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4",
            onClick:()=>setImgViewer(null)
        },
            React.createElement('img',{src:imgViewer,className:"max-w-full max-h-full rounded-2xl object-contain"}),
            React.createElement('button',{className:"absolute top-6 left-6 text-white text-2xl font-black",onClick:()=>setImgViewer(null)},"✕")
        ),

        React.createElement('div',{className:"bg-premium-card w-full max-w-lg rounded-t-3xl border-t border-white/10 shadow-2xl slide-up max-h-[92vh] overflow-y-auto no-scrollbar"},
            // هيدر الكارت
            React.createElement('div',{className:"relative p-6 pb-4"},
                React.createElement('div',{className:"w-10 h-1 bg-white/20 rounded-full mx-auto mb-5"}),
                React.createElement('div',{className:"flex items-center justify-between mb-4"},
                    React.createElement('button',{onClick:onClose,className:"w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-colors"},"✕"),
                    React.createElement('div',{className:"flex items-center gap-2"},
                        React.createElement('button',{
                            onClick:()=>setShowEditClient(true),
                            'data-testid': 'client-edit-trigger',
                            className:"w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-premium-gold hover:border-premium-gold/30 active:scale-90 transition-all"
                        },React.createElement(I.Edit)),
                        React.createElement('button',{
                            onClick:()=>setConfirmDeleteClient(true),
                            className:"w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 hover:bg-rose-500/20 active:scale-90 transition-all"
                        },React.createElement(I.Trash))
                    )
                ),
                React.createElement('div',{className:"flex items-center gap-4"},
                    React.createElement('div',{className:"w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 flex items-center justify-center text-emerald-400 font-black text-2xl border border-emerald-500/20"},
                        (c.full_name||'م').charAt(0)
                    ),
                    React.createElement('div',null,
                        React.createElement('h2',{className:"text-base font-black text-white"},c.full_name),
                        React.createElement('span',{className:"text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400"},typeLabel),
                        cases.length > 0 && React.createElement('span',{
                            className:"text-[10px] font-bold px-2 py-0.5 rounded-full mr-1",
                            style:{background:'rgba(212,175,55,0.1)',color:'#D4AF37'}
                        }, cases.length + ' قضية')
                    )
                )
            ),

            // مودال تأكيد الحذف
            confirmDeleteClient && createPortal(React.createElement(DeleteConfirmModal,{
                title:"حذف الموكل",
                itemName: c.full_name || 'م',
                itemType:"الموكل",
                mode:"delete",
                loading:false,
                onConfirm:()=>{ onDelete?.(c.id); },
                onCancel:()=>setConfirmDeleteClient(false)
            }), document.body),

            // مودال تعديل الموكل
            showEditClient && React.createElement(EditClientModal,{
                client:c,
                onClose:()=>setShowEditClient(false),
                onSave:(form: ClientFormData,idFile?: File | null,poaFile?: File | null)=>{ onEdit?.(c.id, form, idFile, poaFile); setShowEditClient(false); }
            }),

            React.createElement('div',{className:"px-6 pb-10 space-y-4"},

                // بيانات التواصل
                React.createElement('div',{className:"bg-premium-bg rounded-2xl p-4 space-y-3"},
                    React.createElement('p',{className:"text-[10px] font-black text-slate-500"},"— بيانات التواصل —"),
                    c.phone&&React.createElement('div',{className:"flex items-center justify-between"},
                        React.createElement('span',{className:"text-[10px] text-slate-400"},"الهاتف"),
                        React.createElement('div',{className:"flex items-center gap-2"},
                            React.createElement('a',{
                                href:`tel:${c.phone}`,
                                onClick:(e: React.MouseEvent) =>e.stopPropagation(),
                                className:"text-xs font-bold text-white"
                            },c.phone),
                            React.createElement('a',{
                                href:`https://wa.me/${formatPhoneForWhatsApp(c.phone)}`,
                                target:"_blank",
                                onClick:(e: React.MouseEvent) =>e.stopPropagation(),
                                className:"w-7 h-7 rounded-lg flex items-center justify-center text-sm active:scale-90 transition-all",
                                style:{background:'rgba(37,211,102,0.15)',color:'#25d366'}
                            },"💬"),
                            React.createElement('a',{
                                href:`tel:${c.phone}`,
                                onClick:(e: React.MouseEvent) =>e.stopPropagation(),
                                className:"w-7 h-7 rounded-lg flex items-center justify-center text-sm active:scale-90 transition-all",
                                style:{background:'rgba(52,211,153,0.15)',color:'#34d399'}
                            },"📞")
                        )
                    ),
                    c.email&&React.createElement('div',{className:"flex items-center justify-between"},
                        React.createElement('span',{className:"text-[10px] text-slate-400"},"البريد"),
                        React.createElement('a',{
                            href:`mailto:${c.email}`,
                            onClick:(e: React.MouseEvent) =>e.stopPropagation(),
                            className:"text-xs font-bold text-white truncate max-w-[60%]"
                        },c.email)
                    ),
                    !c.phone&&!c.email&&React.createElement('p',{className:"text-[10px] text-slate-600 text-center"},"لا توجد بيانات تواصل")
                ),

                // المستندات الرسمية
                (c.national_id||c.cr_number)&&React.createElement('div',{className:"bg-premium-bg rounded-2xl p-4 space-y-3"},
                    React.createElement('p',{className:"text-[10px] font-black text-slate-500"},"— المستندات الرسمية —"),
                    c.national_id&&React.createElement('div',{className:"flex items-center justify-between"},
                        React.createElement('span',{className:"text-[10px] text-slate-400"},"الرقم القومي"),
                        React.createElement('span',{className:"text-xs font-bold text-white font-mono"},c.national_id)
                    ),
                    c.cr_number&&React.createElement('div',{className:"flex items-center justify-between"},
                        React.createElement('span',{className:"text-[10px] text-slate-400"},"رقم التوكيل"),
                        React.createElement('span',{className:"text-xs font-bold text-white"},c.cr_number)
                    )
                ),

                // صور المستندات
                contactInfo&&(contactInfo.id_url||contactInfo.poa_url)&&React.createElement('div',{className:"space-y-2"},
                    React.createElement('p',{className:"text-[10px] font-black text-slate-500"},"— صور المستندات —"),
                    React.createElement('div',{className:"grid grid-cols-2 gap-3"},
                        contactInfo?.id_url&&React.createElement('div',{className:"space-y-1"},
                            React.createElement('p',{className:"text-[9px] text-slate-500 text-center"},"البطاقة الشخصية"),
                            idImgUrl
                                ? React.createElement('img',{
                                    src:idImgUrl,
                                    onClick:()=>setImgViewer(idImgUrl),
                                    className:"w-full h-28 object-cover rounded-xl border border-white/10 cursor-pointer hover:border-emerald-500/50 transition-colors",
                                    alt:"البطاقة"
                                })
                                : React.createElement('div',{className:"w-full h-28 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center text-[9px] text-slate-500"},"جاري التحميل...")
                        ),
                        contactInfo?.poa_url&&React.createElement('div',{className:"space-y-1"},
                            React.createElement('p',{className:"text-[9px] text-slate-500 text-center"},"التوكيل"),
                            poaImgUrl
                                ? React.createElement('img',{
                                    src:poaImgUrl,
                                    onClick:()=>setImgViewer(poaImgUrl),
                                    className:"w-full h-28 object-cover rounded-xl border border-white/10 cursor-pointer hover:border-emerald-500/50 transition-colors",
                                    alt:"التوكيل"
                                })
                                : React.createElement('div',{className:"w-full h-28 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center text-[9px] text-slate-500"},"جاري التحميل...")
                        )
                    )
                ),

                // القضايا المرتبطة — قابلة للضغط
                React.createElement('div',{className:"space-y-2"},
                    React.createElement('p',{className:"text-[10px] font-black text-slate-500"},"— القضايا المرتبطة ("+cases.length+") —"),
                    cases.length===0
                        ?React.createElement('div',{className:"bg-premium-bg rounded-xl p-4 text-center text-[10px] text-slate-600"},"لا توجد قضايا مرتبطة بهذا الموكل")
                        :React.createElement('div',{className:"space-y-2"},
                            cases.map((ca: MappedCase) =>{
                                // ⚠️ `ca.case_number_official` مش موجود في `MappedCase` (نفس فصيلة
                                // باگ case_type/next_session) — القيمة دايمًا `undefined` هنا فعليًا،
                                // و`ca.number` (= case_number_official الأصلي، اتطبّع في useAppData)
                                // هو اللي بيتعرض دايمًا. الكاست بيحافظ على نفس السلوك بالظبط.
                                const numFmt = (()=>{const p=(ca.number||(ca as unknown as { case_number_official?: string }).case_number_official||'').split('/');return p.length===2?p[0]+' لسنة '+p[1]:p[0]||'—';})();
                                const statusColor = ca.status==='نشطة'?'#4ade80':ca.status==='مؤجلة'?'#fbbf24':ca.status==='منتهية'?'#60a5fa':'#94a3b8';
                                return React.createElement('div',{
                                    key:ca.id,
                                    onClick:()=>{ onClose(); onOpenCase?.(ca); },
                                    className:"bg-premium-bg rounded-xl p-3 flex items-center justify-between gap-2 cursor-pointer active:scale-[0.98] transition-all border border-white/5 hover:border-premium-gold/20"
                                },
                                    React.createElement('div',{className:"min-w-0 flex-1"},
                                        React.createElement('p',{className:"text-xs font-bold text-white truncate"},ca.title),
                                        React.createElement('div',{className:"flex items-center gap-2 mt-0.5"},
                                            numFmt!=='—'&&React.createElement('span',{className:"text-[9px] font-mono",style:{color:'#D4AF37'}},numFmt),
                                            ca.court&&React.createElement('span',{className:"text-[9px] text-slate-500"},ca.court)
                                        )
                                    ),
                                    React.createElement('div',{className:"flex items-center gap-1.5 shrink-0"},
                                        // ⚠️ `ca.case_type` مش موجود في `MappedCase` (نفس فصيلة باگ
                                        // `case_type`/`next_session` اللي اتكشفوا قبل كده) — القيمة دايمًا
                                        // `undefined` هنا فعليًا، و`ca.type` هو اللي بيتعرض دايمًا. الكاست
                                        // هنا بيحافظ على نفس السلوك بالظبط من غير تغيير منطق.
                                        React.createElement('span',{className:"text-[8px] font-bold px-2 py-1 rounded bg-premium-gold/10 text-premium-gold"},ca.type||(ca as unknown as { case_type?: string }).case_type),
                                        React.createElement('span',{
                                            className:"text-[8px] font-black px-2 py-1 rounded-full",
                                            style:{background:statusColor+'22',color:statusColor}
                                        },ca.status||'نشطة'),
                                        React.createElement('span',{className:"text-slate-600 text-xs"},"›")
                                    )
                                );
                            })
                        )
                ),

                // ملاحظات
                c.notes&&React.createElement('div',{className:"bg-premium-bg rounded-2xl p-4"},
                    React.createElement('p',{className:"text-[10px] font-black text-slate-500 mb-2"},"— ملاحظات —"),
                    React.createElement('p',{className:"text-xs text-slate-300 leading-relaxed"},c.notes)
                )
            )
        )
    );
}

export default ClientDetailModal;
