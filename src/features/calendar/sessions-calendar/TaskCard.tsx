import React from 'react';
import type { TaskFeedItem } from '@/shared/hooks/useDashboardFeed';

interface TaskCardProps {
    r: TaskFeedItem;
    accentColor?: string;
    accentBg?: string;
    accentBorder?: string;
    badge?: string | null;
    onOpenTab?: () => void;
    compact?: boolean;
}

function TaskCard({ r, accentColor = '#a78bfa', accentBg = 'rgba(139,92,246,0.07)', accentBorder = 'rgba(139,92,246,0.2)', badge = null, onOpenTab, compact = false }: TaskCardProps) {
    const MONTHS = ['','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
    const d = new Date(r.due_date + 'T00:00:00');
    return React.createElement('div', {
        key: r.id,
        onClick: () => onOpenTab && onOpenTab(),
        className: (compact ? 'rounded-xl' : 'rounded-2xl') + ' overflow-hidden cursor-pointer active:scale-[0.98] transition-all',
        style: { background: accentBg, border: '1px solid ' + accentBorder }
    },
        React.createElement('div', { className: 'flex items-stretch' },
            // العمود — التاريخ
            React.createElement('div', {
                className: (compact ? 'flex flex-col items-center justify-center px-2 py-1.5 shrink-0 min-w-[40px]' : 'flex flex-col items-center justify-center px-3 py-3 shrink-0 min-w-[56px]'),
                style: { borderLeft: '1px solid ' + accentBorder }
            },
                !compact && React.createElement('span', { className: 'text-[13px]' }, '📋'),
                React.createElement('p', { className: (compact?'text-[15px]':'text-[19px]') + ' font-black text-white leading-none' }, d.getDate()),
                React.createElement('p', { className: 'text-[8px] font-bold mt-0.5', style: { color: accentColor } }, MONTHS[d.getMonth()+1])
            ),
            // المحتوى
            React.createElement('div', { className: (compact ? 'flex-1 px-2.5 py-1.5 space-y-0.5 min-w-0' : 'flex-1 p-3 space-y-1 min-w-0') },
                React.createElement('div', { className: 'flex items-start justify-between gap-2' },
                    React.createElement('p', { className: 'text-[11px] font-black text-white leading-tight flex-1 truncate' }, r.title),
                    badge && React.createElement('span', {
                        className: 'text-[8px] px-2 py-0.5 rounded-full font-black shrink-0',
                        style: { background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)' }
                    }, badge)
                ),
                !compact && React.createElement('span', {
                    className: 'inline-block text-[8px] px-1.5 py-0.5 rounded-full font-black',
                    style: { background: 'rgba(167,139,250,0.12)', color: '#c4b5fd' }
                }, '📋 مهمة'),
                r.notes && React.createElement('p', { className: 'text-[9px] text-slate-400 truncate' }, '📝 ' + r.notes)
            )
        )
    );
}

export default TaskCard;
