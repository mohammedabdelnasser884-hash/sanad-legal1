import React from 'react';
import { Inp } from '@/shared/ui/Inp';
import DatePicker from '@/shared/ui/DatePicker';
import DeleteConfirmModal from '@/shared/modals/DeleteConfirmModal';
import { createPortal } from 'react-dom';
import { I } from '../../constants';
import ReminderCard from './ReminderCard';
import ViewReminderModal from './ViewReminderModal';
import EditReminderModal from './EditReminderModal';
import AddReminderForm from './AddReminderForm';
import { useRemindersTab } from './hooks/useRemindersTab';
import type { ReminderRow, ProfileRow } from '../../types';

interface RemindersTabProps {
    initialFilter?: string | null;
    profile?: ProfileRow | null;
}

function RemindersTab({initialFilter, profile=null}: RemindersTabProps){
    const {
        loading, todayStr,
        showForm, setShowForm, form, setForm, saving, handleSave,
        editTarget, setEditTarget, editForm, setEditForm, editSaving, handleEdit,
        confirmDeleteTarget, setConfirmDeleteTarget, handleDelete,
        viewTarget, setViewTarget,
        handleToggleDone,
        filter, setFilter, pillSections, activeSection,
        searchOpen, searchTerm, searchInputRef, searchLoading, filteredData,
        handleSearchOpen, handleSearchClear, handleSearchChange,
    } = useRemindersTab(initialFilter, profile);

    // ── مودال عرض المهمة ──
    const ViewModal = React.createElement(ViewReminderModal, { viewTarget, setViewTarget, handleToggleDone, setEditTarget, setEditForm, setConfirmDeleteTarget });

    // مودال تأكيد الحذف (BUG-15 FIX)
    const ConfirmDeleteModal = confirmDeleteTarget && createPortal(React.createElement(DeleteConfirmModal,{
        title:"حذف التذكير",
        itemName: confirmDeleteTarget.title || 'التذكير',
        itemType:"التذكير",
        mode:"delete",
        loading:false,
        onConfirm:()=>{ handleDelete(confirmDeleteTarget.id); setConfirmDeleteTarget(null); },
        onCancel:()=>setConfirmDeleteTarget(null)
    }), document.body);

    // مودال التعديل
    const EditModal = React.createElement(EditReminderModal, { editTarget, setEditTarget, editForm, setEditForm, handleEdit, editSaving });

    return React.createElement(React.Fragment,null,
    ViewModal,
    ConfirmDeleteModal,
    EditModal,
    React.createElement('div',{className:"space-y-4 fade-in"},

        // ── هيدر: أيقونة + عنوان على اليمين، بحث + إضافة على الشمال ──
        React.createElement('div',{className:"flex items-center justify-between gap-2 overflow-hidden"},
            React.createElement('div',{className:"flex items-center gap-1 min-w-0"},React.createElement('span',{className:"text-sm shrink-0"},"🔔"),React.createElement('h3',{className:"text-xs font-black text-white truncate"},"المهام والتذكيرات المخصصة")),
            React.createElement('div',{className:"flex items-center gap-2"},

                // زرار / حقل بحث
                searchOpen
                    ? React.createElement('div',{
                        className:"flex items-center gap-1.5 flex-1 bg-white/8 border border-white/12 rounded-xl px-2.5 py-1.5",
                        style:{minWidth:0}
                    },
                        React.createElement('svg',{className:"w-3.5 h-3.5 text-amber-400 shrink-0",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2.5",stroke:"currentColor"},
                            React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"})
                        ),
                        React.createElement('input',{
                            ref: searchInputRef,
                            type:"text",
                            value:searchTerm,
                            onChange:(e: React.ChangeEvent<HTMLInputElement>)=>{ handleSearchChange(e.target.value); },
                            maxLength:100,
                            placeholder:"ابحث في كل المهام...",
                            dir:"rtl",
                            className:"flex-1 bg-transparent text-[11px] text-white placeholder-slate-500 outline-none min-w-0"
                        }),
                        React.createElement('button',{
                            onClick:handleSearchClear,
                            className:"text-slate-500 hover:text-slate-300 shrink-0 active:scale-90 transition-transform"
                        },
                            React.createElement('svg',{className:"w-3.5 h-3.5",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2.5",stroke:"currentColor"},
                                React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"M6 18 18 6M6 6l12 12"})
                            )
                        )
                    )
                    : React.createElement('button',{
                        onClick:handleSearchOpen,
                        className:"flex items-center gap-1 bg-white/8 border border-white/10 text-slate-300 px-2.5 py-2 rounded-xl text-[11px] font-black active:scale-95 transition-transform hover:border-amber-500/30 hover:text-amber-300",
                        title:"بحث في المهام"
                    },
                        React.createElement('svg',{className:"w-3.5 h-3.5",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2.5",stroke:"currentColor"},
                            React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"})
                        ),
                        React.createElement('span',null,"بحث")
                    ),

                // زرار إضافة تذكير (ذهبي)
                React.createElement('button',{
                    onClick:()=>setShowForm(!showForm),
                    className:"flex items-center bg-gradient-to-tr from-premium-gold to-amber-200 text-premium-bg px-2.5 py-1.5 rounded-xl text-[11px] font-black shadow-lg gap-1 active:scale-95 transition-transform shrink-0"
                }, React.createElement(I.Plus), "إضافة")
            )
        ),

        // فورم
        React.createElement(AddReminderForm, { showForm, setShowForm, form, setForm, handleSave, saving }),

        // Pill Selector
        React.createElement('div',{className:"flex items-center bg-white/5 rounded-2xl p-1 gap-1"},
            pillSections.map((s) => {
                const isActive = filter === s.key;
                return React.createElement('button',{
                    key: s.key,
                    onClick: ()=>{setFilter(s.key);},
                    className:`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl transition-all active:scale-95 ${
                        isActive ? s.activeBg+' shadow-sm' : 'text-slate-500 hover:text-slate-300'
                    }`
                },
                    React.createElement('span',{className:"text-sm leading-none"},s.emoji),
                    React.createElement('span',{className:`text-[11px] font-black ${isActive?s.activeText:'text-slate-400'}`},s.label),
                    React.createElement('span',{
                        className:`text-[9px] font-black px-1.5 py-0.5 rounded-full ${isActive?s.countBg:'bg-white/8 text-slate-500'}`
                    }, s.paginated ? s.total : s.data.length)
                );
            })
        ),

        // ── شريط نتيجة البحث ──
        searchTerm.trim() && React.createElement('div',{
            className:"flex items-center gap-2 px-2.5 py-1.5 bg-amber-500/8 border border-amber-500/15 rounded-xl"
        },
            React.createElement('svg',{className:"w-3 h-3 text-amber-400 shrink-0",fill:"none",viewBox:"0 0 24 24",strokeWidth:"2.5",stroke:"currentColor"},
                React.createElement('path',{strokeLinecap:"round",strokeLinejoin:"round",d:"m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"})
            ),
            React.createElement('span',{className:"text-[10px] text-amber-300 flex-1"},
                searchLoading ? 'جاري البحث...' : `نتائج "${searchTerm}" · ${filteredData.length} مهمة من كل التابات`
            )
        ),

        // المحتوى
        loading
            ? React.createElement('div',{className:"flex items-center justify-center py-10 gap-2 text-slate-500 text-xs"},React.createElement(I.Spin))
            : filteredData.length === 0
                ? React.createElement('div',{className:"bg-premium-card border border-white/5 rounded-2xl px-5 py-10 text-center space-y-2"},
                    React.createElement('p',{className:"text-3xl mb-1"},searchTerm.trim() ? '🔍' : activeSection.emptyEmoji),
                    React.createElement('p',{className:`text-xs font-black ${activeSection.activeText}`},
                        searchTerm.trim() ? `لا توجد نتائج لـ "${searchTerm}"` : activeSection.emptyMsg
                    ),
                    React.createElement('p',{className:"text-[10px] text-slate-600 leading-relaxed mt-1"},
                        searchTerm.trim() ? 'جرّب كلمات مختلفة أو تحقق من التاب الصحيح' : activeSection.emptyNote
                    )
                  )
                : React.createElement('div',{className:"space-y-3"},
                    // القادمة: slice محلي — المتأخرة والمنجزة: كل المحملين
                    (searchTerm.trim() ? filteredData : activeSection.data).map((r: ReminderRow)=>React.createElement(ReminderCard,{
                        key:r.id,
                        r,
                        todayStr,
                        onToggleDone: handleToggleDone,
                        onView: (t: ReminderRow)=>setViewTarget(t),
                        onEdit: (t: ReminderRow)=>{ setEditTarget(t); setEditForm({title:t.title as string,due_date:t.due_date as string,notes:t.notes||''}); },
                        onDelete: (t: ReminderRow)=>setConfirmDeleteTarget(t),
                    })),

                    // زرار تحميل المزيد للتابات الـ paginated
                    !searchTerm.trim() && activeSection.paginated && activeSection.hasMore &&
                        React.createElement('button',{
                            onClick: activeSection.loadMore,
                            disabled: loading,
                            className:"w-full py-3 rounded-2xl text-xs font-black active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-40",
                            style:{background:'rgba(167,139,250,0.06)',border:'1px solid rgba(167,139,250,0.18)',color:'#a78bfa'}
                        },
                            loading
                                ? React.createElement(I.Spin)
                                : React.createElement('span',{className:"text-base"},"⬇️"),
                            "تحميل المزيد",
                            React.createElement('span',{
                                className:"text-[9px] px-2 py-0.5 rounded-full font-black",
                                style:{background:'rgba(167,139,250,0.12)',color:'#a78bfa'}
                            }, `${activeSection.total - activeSection.data.length} تذكير`)
                        )
                  )
    ));
}


export default RemindersTab;
