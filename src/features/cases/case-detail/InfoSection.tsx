import React from 'react';
import type { MappedCase, MappedClient } from '../../../hooks/useAppData';
import type { CaseSessionRow, CaseNoteRow } from '../../../types';
import type { CaseDocWithUrl } from '../hooks/useCaseDetailActions';

interface InfoSectionProps {
  caseData: MappedCase;
  client: MappedClient | null;
  sessions: CaseSessionRow[];
  notes: CaseNoteRow[];
  docs: CaseDocWithUrl[];
}

interface InfoRow {
  label: string;
  value: string | null;
}

function InfoSection({ caseData, client, sessions, notes, docs }: InfoSectionProps) {
  return React.createElement('div', {className: "space-y-4 fade-in"},
                // بيانات القضية
                React.createElement('div', {className: "bg-premium-card border border-white/5 rounded-2xl p-4 space-y-0"},
                    React.createElement('p', {className: "text-[9px] font-black text-slate-500 mb-3 tracking-widest"}, "— بيانات القضية —"),
                    [
                        {label: 'موضوع الدعوى', value: caseData.title},
                        {label: 'نوع القضية', value: caseData.type},
                        {label: 'المحكمة', value: caseData.court},
                        {label: 'درجة التقاضي', value: caseData.court_level},
                        {label: 'رقم الدائرة', value: caseData.circuit_number},
                        {label: 'رقم القيد', value: (()=>{const p=(caseData.number||'').split('/');return p.length===2?p[0]+' لسنة '+p[1]:caseData.number;})()},
                        {label: 'أقرب جلسة', value: caseData.date},
                        {label: 'الحالة', value: caseData.status || 'نشطة'},
                    ].filter((r: InfoRow) => r.value && r.value !== '—').map((row: InfoRow, i: number, arr: InfoRow[]) =>
                        React.createElement('div', {
                            key: row.label,
                            className: `flex items-start justify-between gap-4 py-3 ${i < arr.length - 1 ? 'border-b border-white/5' : ''}`
                        },
                            React.createElement('span', {className: "text-[10px] text-slate-400 font-bold shrink-0"}, row.label),
                            React.createElement('span', {className: "text-xs text-white font-black text-left max-w-[60%] text-right"}, row.value)
                        )
                    )
                ),

                // أسماء الخصوم
                (caseData.plaintiff || caseData.defendant) && React.createElement('div', {className: "bg-premium-card border border-white/5 rounded-2xl p-4"},
                    React.createElement('p', {className: "text-[9px] font-black text-slate-500 mb-3 tracking-widest"}, "— أطراف الدعوى —"),
                    React.createElement('div', {className: "space-y-3"},
                        caseData.plaintiff && React.createElement('div', {className: "flex items-center justify-between"},
                            React.createElement('span', {className: "text-[10px] text-slate-400 font-bold"}, "المدعي / الطاعن"),
                            React.createElement('span', {className: "text-[11px] font-black text-emerald-400"}, caseData.plaintiff)
                        ),
                        caseData.plaintiff && caseData.defendant && React.createElement('div', {className: "border-t border-white/5"}),
                        caseData.defendant && React.createElement('div', {className: "flex items-center justify-between"},
                            React.createElement('span', {className: "text-[10px] text-slate-400 font-bold"}, "المدعى عليه / المطعون ضده"),
                            React.createElement('span', {className: "text-[11px] font-black text-rose-400"}, caseData.defendant)
                        )
                    )
                ),

                // بيانات الموكل
                client && React.createElement('div', {className: "bg-premium-card border border-emerald-500/15 rounded-2xl p-4"},
                    React.createElement('p', {className: "text-[9px] font-black text-emerald-400/70 mb-3 tracking-widest"}, "— الموكل —"),
                    React.createElement('div', {className: "flex items-center gap-3"},
                        React.createElement('div', {className: "w-11 h-11 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 font-black text-sm"},
                            (client.full_name || 'م').charAt(0)
                        ),
                        React.createElement('div', null,
                            React.createElement('p', {className: "text-sm font-black text-white"}, client.full_name),
                            React.createElement('p', {className: "text-[10px] text-emerald-400 font-bold"}, client.type || 'فرد'),
                            client.phone && React.createElement('a', {href:`tel:${client.phone}`, className: "text-[10px] text-slate-400 mt-0.5 block"}, '📞 '+client.phone)
                        )
                    )
                ),

                // إحصائيات سريعة
                React.createElement('div', {className: "grid grid-cols-3 gap-3"},
                    React.createElement('div', {className: "bg-premium-card border border-white/5 rounded-2xl p-4 text-center"},
                        React.createElement('p', {className: "text-3xl font-black text-premium-gold"}, sessions.length),
                        React.createElement('p', {className: "text-[9px] text-slate-400 font-bold mt-1"}, "الجلسات")
                    ),
                    React.createElement('div', {className: "bg-premium-card border border-white/5 rounded-2xl p-4 text-center"},
                        React.createElement('p', {className: "text-3xl font-black text-blue-400"}, notes.length),
                        React.createElement('p', {className: "text-[9px] text-slate-400 font-bold mt-1"}, "الملاحظات")
                    ),
                    React.createElement('div', {className: "bg-premium-card border border-white/5 rounded-2xl p-4 text-center"},
                        React.createElement('p', {className: "text-3xl font-black text-purple-400"}, docs.length),
                        React.createElement('p', {className: "text-[9px] text-slate-400 font-bold mt-1"}, "المستندات")
                    )
                )
            );
}

export default InfoSection;
