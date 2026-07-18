import React from 'react';
import { I } from '../../../constants';
import { formatArDate } from '../../../shared/ui/arabicLocale';
import type { CaseNoteRow } from '../../../types';

interface NotesSectionProps {
  showAddNote: boolean;
  setShowAddNote: (v: boolean) => void;
  noteText: string;
  setNoteText: (v: string) => void;
  handleAddNote: () => void | Promise<void>;
  savingNote: boolean;
  loadingSessions: boolean;
  notes: CaseNoteRow[];
  editingNoteId: string | null;
  setEditingNoteId: (v: string | null) => void;
  editingNoteText: string;
  setEditingNoteText: (v: string) => void;
  handleUpdateNote: (noteId: string, content: string) => void | Promise<void>;
  deletingNoteId: string | null;
  setConfirmDeleteNote: (v: { id: string; preview: string } | null) => void;
}

function NotesSection({
  showAddNote, setShowAddNote, noteText, setNoteText, handleAddNote, savingNote,
  loadingSessions, notes, editingNoteId, setEditingNoteId, editingNoteText, setEditingNoteText,
  handleUpdateNote, deletingNoteId, setConfirmDeleteNote,
}: NotesSectionProps) {
  return React.createElement('div', {className: "space-y-4 fade-in"},
                React.createElement('button', {
                    onClick: () => setShowAddNote(!showAddNote),
                    className: "w-full py-3 border border-dashed border-blue-500/30 rounded-2xl flex items-center justify-center gap-2 text-blue-400 text-xs font-black hover:bg-blue-500/5 transition-all active:scale-[0.98]"
                },
                    React.createElement(I.Plus), "إضافة ملاحظة"
                ),

                showAddNote && React.createElement('div', {className: "bg-premium-card border border-blue-500/20 rounded-2xl p-4 space-y-3 slide-up"},
                    React.createElement('textarea', {
                        value: noteText,
                        onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => setNoteText(e.target.value),
                        placeholder: "اكتب ملاحظتك هنا...",
                        rows: 4,
                        className: "w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600 resize-none leading-relaxed",
                        style: {fontFamily:'Cairo,sans-serif'}
                    }),
                    React.createElement('div', {className: "flex gap-2"},
                        React.createElement('button', {
                            onClick: handleAddNote,
                            disabled: savingNote || !noteText.trim(),
                            className: "flex-1 py-2.5 bg-gradient-to-tr from-blue-500 to-blue-400 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95"
                        }, savingNote ? React.createElement(I.Spin) : React.createElement(I.Check), "حفظ الملاحظة"),
                        React.createElement('button', {onClick: () => setShowAddNote(false), className: "px-4 py-2.5 bg-white/5 text-slate-400 rounded-xl text-xs font-bold active:scale-95"}, "إلغاء")
                    )
                ),

                loadingSessions
                    ? React.createElement('div', {className: "flex items-center justify-center py-16 gap-2 text-slate-500 text-xs"}, React.createElement(I.Spin))
                    : notes.length === 0
                        ? React.createElement('div', {className: "text-center py-16 space-y-3"},
                            React.createElement('div', {className: "w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center text-3xl mx-auto"}, "📝"),
                            React.createElement('p', {className: "text-white/60 font-black text-sm"}, "لا توجد ملاحظات"),
                            React.createElement('p', {className: "text-slate-500 text-xs"}, "أضف ملاحظات خاصة بهذه القضية")
                          )
                        : React.createElement('div', {className: "space-y-3"},
                            notes.map((n: CaseNoteRow) =>
                                React.createElement('div', {key: n.id, className: "bg-premium-card border border-white/5 rounded-2xl p-4"},
                                    editingNoteId === n.id
                                    ? React.createElement('div', {className: "space-y-3"},
                                        React.createElement('textarea', {
                                            value: editingNoteText,
                                            onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => setEditingNoteText(e.target.value),
                                            rows: 4,
                                            className: "w-full p-3 text-xs rounded-xl border border-blue-500/30 bg-premium-bg text-white resize-none leading-relaxed",
                                            style: {fontFamily:'Cairo,sans-serif'}
                                        }),
                                        React.createElement('div', {className: "flex gap-2"},
                                            React.createElement('button', {
                                                onClick: () => { handleUpdateNote(n.id, editingNoteText); setEditingNoteId(null); },
                                                className: "flex-1 py-2 bg-gradient-to-tr from-blue-500 to-blue-400 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1 active:scale-95"
                                            }, React.createElement(I.Check), "حفظ"),
                                            React.createElement('button', {onClick:()=>setEditingNoteId(null), className:"px-4 py-2 bg-white/5 text-slate-400 rounded-xl text-xs font-bold active:scale-95"}, "إلغاء")
                                        )
                                      )
                                    : React.createElement('div', {className: "flex items-start gap-3"},
                                        React.createElement('div', {className: "w-7 h-7 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0 mt-0.5"},
                                            React.createElement(I.Note)
                                        ),
                                        React.createElement('div', {className: "flex-1"},
                                            React.createElement('p', {className: "text-xs text-slate-200 leading-relaxed font-medium"}, n.content),
                                            React.createElement('p', {className: "text-[9px] text-slate-500 mt-2 font-bold"},
                                                formatArDate(n.created_at as string, {year:'numeric', month:'long', day:'numeric'})
                                            )
                                        ),
                                        React.createElement('div', {className: "flex flex-col gap-1.5 shrink-0"},
                                            React.createElement('button', {
                                                onClick: () => { setEditingNoteId(n.id); setEditingNoteText(n.content as string); },
                                                className: "w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-slate-500 hover:text-premium-gold active:scale-90 transition-all"
                                            }, React.createElement(I.Edit)),
                                            deletingNoteId === n.id
                                            ? React.createElement('div',{className:"w-6 h-6 flex items-center justify-center"}, React.createElement(I.Spin))
                                            : React.createElement('button', {
                                                onClick: () => { setConfirmDeleteNote({id: n.id, preview: ((n.content as string)||'').slice(0,40)}); },
                                                className: "w-6 h-6 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400 hover:bg-rose-500/20 active:scale-90 transition-all"
                                            }, React.createElement(I.Trash))
                                        )
                                    )
                                )
                            )
                          )
            );
}

export default NotesSection;
