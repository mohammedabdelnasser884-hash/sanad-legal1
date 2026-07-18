import React from 'react';
import { I } from '../../../constants';
import { Inp } from '@/shared/ui/Inp';
import { Sel } from '@/shared/ui/Sel';
import { formatArDate } from '@/shared/ui/arabicLocale';
import type { CaseDocWithUrl } from '../hooks/useCaseDetailActions';

interface DocsSectionProps {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileSelect: (e: { target: HTMLInputElement }) => void;
  showDocForm: boolean;
  setShowDocForm: (v: boolean) => void;
  pendingFile: File | null;
  setPendingFile: (f: File | null) => void;
  docLabel: string;
  setDocLabel: (v: string) => void;
  docCategory: string;
  setDocCategory: (v: string) => void;
  handleUploadDoc: () => void | Promise<void>;
  uploadingDoc: boolean;
  docs: CaseDocWithUrl[];
  docSearch: string;
  setDocSearch: (v: string) => void;
  loadingSessions: boolean;
  setViewingDoc: (doc: CaseDocWithUrl) => void;
  setConfirmDeleteDoc: (v: { id: string; file_name: string | null; storage_path: string | null } | null) => void;
  deletingDocId: string | null;
}

function DocsSection({
  fileInputRef, handleFileSelect, showDocForm, setShowDocForm, pendingFile, setPendingFile,
  docLabel, setDocLabel, docCategory, setDocCategory, handleUploadDoc, uploadingDoc,
  docs, docSearch, setDocSearch, loadingSessions, setViewingDoc, setConfirmDeleteDoc, deletingDocId,
}: DocsSectionProps) {
  return React.createElement('div', {className: "space-y-4 fade-in"},

                // hidden file input
                React.createElement('input', {
                    ref: fileInputRef,
                    type: 'file',
                    accept: 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt',
                    onChange: handleFileSelect,
                    style: {display: 'none'}
                }),

                // زر الرفع
                !showDocForm && React.createElement('button', {
                    onClick: () => fileInputRef.current && fileInputRef.current.click(),
                    className: "w-full py-4 border-2 border-dashed border-purple-500/30 rounded-2xl flex flex-col items-center justify-center gap-2 text-purple-400 hover:bg-purple-500/5 transition-all active:scale-[0.98]"
                },
                    React.createElement('span', {className: "text-2xl"}, "📎"),
                    React.createElement('span', {className: "text-xs font-black"}, "رفع مستند جديد"),
                    React.createElement('span', {className: "text-[9px] text-slate-500"}, "صور · PDF · Word · Excel · PowerPoint")
                ),

                // فورم تصنيف المستند بعد اختيار الملف
                showDocForm && pendingFile && React.createElement('div', {className: "bg-premium-card border border-purple-500/20 rounded-2xl p-4 space-y-3 slide-up"},
                    // معاينة الملف
                    React.createElement('div', {className: "flex items-center gap-3 p-3 bg-premium-bg rounded-xl"},
                        React.createElement('div', {className: "w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 " + (
                            /\.(jpg|jpeg|png|gif|webp)$/i.test(pendingFile.name) ? 'bg-rose-500/10' :
                            /\.pdf$/i.test(pendingFile.name) ? 'bg-red-500/10' :
                            /\.(doc|docx)$/i.test(pendingFile.name) ? 'bg-blue-500/10' :
                            /\.(xls|xlsx)$/i.test(pendingFile.name) ? 'bg-emerald-500/10' : 'bg-white/5'
                        )},
                            /\.(jpg|jpeg|png|gif|webp)$/i.test(pendingFile.name) ? '🖼' :
                            /\.pdf$/i.test(pendingFile.name) ? '📄' :
                            /\.(doc|docx)$/i.test(pendingFile.name) ? '📝' :
                            /\.(xls|xlsx)$/i.test(pendingFile.name) ? '📊' : '📎'
                        ),
                        React.createElement('div', {className: "flex-1 min-w-0"},
                            React.createElement('p', {className: "text-xs font-bold text-white truncate"}, pendingFile.name),
                            React.createElement('p', {className: "text-[9px] text-slate-500"}, (pendingFile.size / 1024 / 1024).toFixed(2) + ' MB')
                        ),
                        React.createElement('button', {
                            onClick: () => { setShowDocForm(false); setPendingFile(null); if(fileInputRef.current) fileInputRef.current.value=''; },
                            className: "text-slate-500 hover:text-white text-sm"
                        }, "✕")
                    ),
                    // اسم المستند
                    React.createElement(Inp, {
                        label: "اسم / وصف المستند",
                        value: docLabel,
                        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDocLabel(e.target.value),
                        placeholder: "مثال: مذكرة الجلسة الأولى"
                    }),
                    // التصنيف
                    React.createElement(Sel, {
                        label: "تصنيف المستند",
                        value: docCategory,
                        onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setDocCategory(e.target.value),
                        options: ['مذكرة دفاع','صحيفة دعوى','حكم قضائي','عقد','توكيل','مستند رسمي','صورة','أخرى']
                    }),
                    React.createElement('div', {className: "flex gap-2"},
                        React.createElement('button', {
                            onClick: handleUploadDoc,
                            disabled: uploadingDoc,
                            className: "flex-1 py-2.5 bg-gradient-to-tr from-purple-600 to-purple-400 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95 transition-all"
                        }, uploadingDoc
                            ? React.createElement(React.Fragment, null, React.createElement(I.Spin), "جاري الرفع...")
                            : React.createElement(React.Fragment, null, "☁️ رفع المستند")
                        ),
                        React.createElement('button', {
                            onClick: () => { setShowDocForm(false); setPendingFile(null); if(fileInputRef.current) fileInputRef.current.value=''; },
                            className: "px-4 py-2.5 bg-white/5 text-slate-400 rounded-xl text-xs font-bold active:scale-95"
                        }, "إلغاء")
                    )
                ),

                // ─ بحث في مستندات القضية ─
                docs.length > 0 && !showDocForm && React.createElement('div', {className: "relative"},
                    React.createElement('span', {className: "absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none text-xs"}, "🔍"),
                    React.createElement('input', {
                        type: "text", value: docSearch,
                        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDocSearch(e.target.value),
                        placeholder: "ابحث في مستندات هذه القضية...",
                        className: "w-full p-2.5 pr-9 text-xs rounded-xl border border-white/10 bg-premium-card text-white placeholder-slate-500 transition-colors",
                        style: {fontFamily: 'Cairo,sans-serif'}
                    }),
                    docSearch && React.createElement('button', {
                        onClick: () => setDocSearch(''),
                        className: "absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
                    }, "✕")
                ),

                // قائمة المستندات
                loadingSessions
                    ? React.createElement('div', {className: "flex items-center justify-center py-12 gap-2 text-slate-500 text-xs"}, React.createElement(I.Spin))
                    : docs.length === 0 && !showDocForm
                        ? React.createElement('div', {className: "text-center py-14 space-y-3"},
                            React.createElement('div', {className: "w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center text-3xl mx-auto"}, "📁"),
                            React.createElement('p', {className: "text-white/60 font-black text-sm"}, "لا توجد مستندات"),
                            React.createElement('p', {className: "text-slate-500 text-xs"}, "ارفع مستندات القضية من الزر أعلاه")
                          )
                        : React.createElement('div', {className: "space-y-3"},
                            (docSearch.trim()
                              ? docs.filter((d: CaseDocWithUrl) => {
                                  const q = docSearch.trim().toLowerCase();
                                  return (d.file_name     || '').toLowerCase().includes(q)
                                      || (d.original_name || '').toLowerCase().includes(q)
                                      || (d.category      || '').toLowerCase().includes(q);
                                })
                              : docs
                            ).length === 0 && docSearch.trim()
                              ? React.createElement('div', {className: "text-center py-10 space-y-2"},
                                  React.createElement('p', {className: "text-slate-400 font-bold text-xs"}, `لا نتائج لـ "${docSearch}"`),
                                  React.createElement('button', {onClick: () => setDocSearch(''), className: "text-purple-400 text-xs font-bold"}, "مسح البحث")
                                )
                              : null,
                            (docSearch.trim()
                              ? docs.filter((d: CaseDocWithUrl) => {
                                  const q = docSearch.trim().toLowerCase();
                                  return (d.file_name     || '').toLowerCase().includes(q)
                                      || (d.original_name || '').toLowerCase().includes(q)
                                      || (d.category      || '').toLowerCase().includes(q);
                                })
                              : docs
                            ).map((doc: CaseDocWithUrl) => {
                                const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test((doc.original_name || doc.file_name) as string);
                                const isPdf = /\.pdf$/i.test((doc.original_name || doc.file_name) as string);
                                const isWord = /\.(doc|docx)$/i.test((doc.original_name || doc.file_name) as string);
                                const isExcel = /\.(xls|xlsx)$/i.test((doc.original_name || doc.file_name) as string);
                                const isPpt = /\.(ppt|pptx)$/i.test((doc.original_name || doc.file_name) as string);
                                const emoji = isImg ? '🖼' : isPdf ? '📄' : isWord ? '📝' : isExcel ? '📊' : isPpt ? '📑' : '📎';
                                const bgClass = isImg ? 'bg-rose-500/10 text-rose-400 border-rose-500/15'
                                    : isPdf ? 'bg-red-500/10 text-red-400 border-red-500/15'
                                    : isWord ? 'bg-blue-500/10 text-blue-400 border-blue-500/15'
                                    : isExcel ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/15'
                                    : isPpt ? 'bg-orange-500/10 text-orange-400 border-orange-500/15'
                                    : 'bg-white/5 text-slate-400 border-white/10';
                                const catColor = ({
                                    'حكم قضائي': 'text-premium-gold bg-premium-gold/10',
                                    'مذكرة دفاع': 'text-blue-400 bg-blue-500/10',
                                    'صحيفة دعوى': 'text-purple-400 bg-purple-500/10',
                                    'عقد': 'text-emerald-400 bg-emerald-500/10',
                                    'توكيل': 'text-cyan-400 bg-cyan-500/10',
                                } as Record<string, string>)[doc.category as string] || 'text-slate-400 bg-white/5';

                                return React.createElement('div', {key: doc.id, className: "bg-premium-card border border-white/5 rounded-2xl overflow-hidden"},
                                    // معاينة الصورة لو كانت صورة
                                    isImg && React.createElement('div', {className: "relative"},
                                        React.createElement('img', {
                                            src: doc.file_url,
                                            className: "w-full h-36 object-cover",
                                            alt: doc.file_name
                                        }),
                                        React.createElement('div', {className: "absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"}),
                                        React.createElement('a', {
                                            href: doc.file_url, target: '_blank', rel: 'noreferrer',
                                            className: "absolute bottom-2 left-2 px-3 py-1.5 bg-white/15 backdrop-blur-sm text-white text-[10px] font-bold rounded-xl border border-white/20"
                                        }, "عرض كامل ↗")
                                    ),
                                    // بيانات المستند
                                    React.createElement('div', {className: "p-4 flex items-start gap-3"},
                                        !isImg && React.createElement('div', {className: `w-11 h-11 rounded-xl border flex items-center justify-center text-xl shrink-0 ${bgClass}`},
                                            emoji
                                        ),
                                        React.createElement('div', {className: "flex-1 min-w-0"},
                                            React.createElement('p', {className: "text-xs font-black text-white truncate"}, doc.file_name),
                                            React.createElement('div', {className: "flex items-center gap-2 mt-1.5"},
                                                React.createElement('span', {className: `text-[9px] font-bold px-2 py-0.5 rounded-full ${catColor}`}, doc.category),
                                                doc.file_size && React.createElement('span', {className: "text-[9px] text-slate-500"}, (doc.file_size/1024/1024).toFixed(2)+' MB')
                                            ),
                                            React.createElement('p', {className: "text-[9px] text-slate-600 mt-1"},
                                                formatArDate(doc.created_at as string, {year:'numeric',month:'short',day:'numeric'})
                                            )
                                        ),
                                        React.createElement('div', {className: "flex flex-col gap-2"},
                                            // عرض
                                            React.createElement('button', {
                                                onClick: () => setViewingDoc(doc),
                                                className: "w-8 h-8 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 hover:bg-purple-500/20 transition-all active:scale-90 text-sm"
                                            }, "👁"),
                                            // تحميل / فتح
                                            React.createElement('a', {
                                                href: doc.file_url, target: '_blank', rel: 'noreferrer',
                                                className: "w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all text-sm"
                                            }, "↗"),
                                            // حذف
                                            React.createElement('button', {
                                                onClick: () => setConfirmDeleteDoc({ id: doc.id, file_name: doc.file_name, storage_path: doc.storage_path }),
                                                disabled: deletingDocId === doc.id,
                                                className: "w-8 h-8 rounded-xl bg-rose-500/5 flex items-center justify-center text-rose-500/50 hover:text-rose-400 hover:bg-rose-500/10 transition-all disabled:opacity-40"
                                            }, deletingDocId === doc.id ? React.createElement(I.Spin) : React.createElement(I.Trash))
                                        )
                                    )
                                );
                            })
                          )
            );
}

export default DocsSection;
