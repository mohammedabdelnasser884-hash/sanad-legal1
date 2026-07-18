import React from 'react';

interface DayDividerProps {
    dayName: string;
    dayNum: number;
    monthName: string;
    isToday: boolean;
    sessCount: number;
    isConflict: boolean;
}

function DayDivider({ dayName, dayNum, monthName, isToday, sessCount, isConflict }: DayDividerProps) {
    const goldColor = isToday ? 'rgba(212,175,55,0.9)' : 'rgba(212,175,55,0.4)';
    const lineStyle = {
        position: 'absolute' as const,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '40%',
        height: '2px',
        background: `linear-gradient(to right, transparent, ${goldColor}, transparent)`,
        borderRadius: '999px',
    };
    return React.createElement('div', { className: "mt-6 mb-3" },
        React.createElement('div', {
            className: "flex items-center justify-between px-4 py-3 rounded-xl overflow-visible relative",
            style: {
                background: isToday
                    ? 'linear-gradient(135deg, rgba(42,31,0,0.9), rgba(61,46,0,0.9))'
                    : 'linear-gradient(135deg, rgba(15,18,32,0.95), rgba(20,24,42,0.95))',
                borderTop:    '1px solid rgba(255,255,255,0.06)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                borderRight: isToday ? '3px solid #D4AF37' : '3px solid rgba(212,175,55,0.35)',
                borderLeft:  isToday ? '3px solid #D4AF37' : '3px solid rgba(212,175,55,0.35)',
                boxShadow: isToday
                    ? '0 2px 20px rgba(212,175,55,0.12), inset 0 0 30px rgba(212,175,55,0.04)'
                    : '0 2px 10px rgba(0,0,0,0.3)',
            }
        },
            // خط ذهبي فوق من المنتصف
            React.createElement('div', { style: { ...lineStyle, top: '-3px' } }),
            // خط ذهبي تحت من المنتصف
            React.createElement('div', { style: { ...lineStyle, bottom: '-3px' } }),

            // النص في المنتصف
            React.createElement('div', { className: "flex-1 flex items-center justify-center gap-2" },
                React.createElement('span', {
                    className: "font-black text-[15px]",
                    style: { color: isToday ? '#D4AF37' : '#a78bfa' }
                }, dayName),
                React.createElement('span', {
                    className: "text-[13px] font-semibold",
                    style: { color: isToday ? 'rgba(212,175,55,0.75)' : 'rgba(167,139,250,0.7)' }
                }, `${dayNum} ${monthName}`)
            ),
            // badges
            React.createElement('div', { className: "flex items-center gap-1.5" },
                isConflict && React.createElement('span', {
                    className: "text-[9px] font-black px-2 py-1 rounded-lg",
                    style: { background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }
                }, "⚠️ تعارض"),
                React.createElement('span', {
                    className: "text-[10px] font-bold px-2.5 py-1 rounded-lg",
                    style: {
                        background: isToday ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.06)',
                        color: isToday ? '#D4AF37' : '#475569',
                        border: isToday ? '1px solid rgba(212,175,55,0.25)' : '1px solid rgba(255,255,255,0.07)'
                    }
                }, `${sessCount} جلسة`)
            )
        )
    );
}

export default DayDivider;
