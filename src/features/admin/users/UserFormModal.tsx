import React, { useState } from 'react';
import { toast } from '../../../shared/lib/notifications';
import { I } from '../../../constants';
import { Inp } from '@/shared/ui/Inp';
import { ROLE_CONFIG } from '../icons';
import type { AddUserForm } from './hooks/useAdminUsers';

// فورم محلي للمودال ده تحديدًا — نفس حقول AddUserForm زائد is_active
// (الحقل ده مش مستخدم فعليًا في handleAddUser دلوقتي، لكنه موجود في الحالة الأولية للفورم من الأصل)
interface UserForm extends AddUserForm {
    is_active: boolean;
}

// ══════════════════════════════════════════════════════════════
//  UserFormModal — مودال إضافة مستخدم موحّد
//  يحل محل NewLawyerModal.tsx و admin/modals/AddUserModal.tsx
//  اللي كانا نفس المودال منطقيًا (نفس الحقول ونفس استدعاء الـ
//  create_lawyer action) بس مكتوبين مرتين بأسلوبين مختلفين.
// ══════════════════════════════════════════════════════════════
function UserFormModal({ onClose, onSave, loading, title = 'إضافة مستخدم جديد لسَنَد' }: {
    onClose: () => void;
    onSave: (form: AddUserForm) => void;
    loading?: boolean;
    title?: string;
}) {
    const [form, setForm] = useState<UserForm>({
        full_name: '', email: '', password: '', role: 'lawyer',
        permissions: {}, is_active: true
    });
    const [showPass, setShowPass] = useState(false);
    const s = (k: keyof UserForm, v: string | boolean | Record<string, boolean>) => setForm((p: UserForm) => ({ ...p, [k]: v }));

    const submit = () => {
        if (!form.full_name.trim() || !form.email.trim() || !form.password) {
            toast('يرجى تعبئة كل الحقول', true); return;
        }
        if (form.password.length < 8) {
            toast('كلمة السر 8 أحرف على الأقل', true); return;
        }
        onSave(form);
    };

    return React.createElement('div', {
        className: "fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm",
        onClick: (e: React.MouseEvent<HTMLDivElement>) => { if (e.target === e.currentTarget) onClose(); }
    },
        React.createElement('div', {
            className: "bg-premium-card w-full max-w-lg rounded-t-3xl border-t border-white/10 p-6 pb-10 shadow-2xl slide-up",
            style: { maxHeight: '90vh', overflowY: 'auto' }
        },
            React.createElement('div', { className: "w-10 h-1 bg-white/20 rounded-full mx-auto mb-5" }),
            React.createElement('div', { className: "flex items-center justify-between mb-5" },
                React.createElement('h3', { className: "text-sm font-black text-white flex items-center gap-2" },
                    React.createElement('span', { className: "w-1 h-4 bg-premium-gold rounded-full" }),
                    title
                ),
                React.createElement('button', {
                    onClick: onClose,
                    className: "w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-slate-400"
                }, React.createElement(I.X))
            ),

            React.createElement('div', { className: "space-y-4" },
                React.createElement(Inp, {
                    label: "الاسم الكامل", value: form.full_name,
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) => s('full_name', e.target.value),
                    placeholder: "الأستاذ / محمد أحمد", required: true
                }),
                React.createElement(Inp, {
                    label: "البريد الإلكتروني", type: "email", value: form.email,
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) => s('email', e.target.value),
                    placeholder: "lawyer@firm.com", required: true
                }),
                React.createElement('div', null,
                    React.createElement('label', { className: "block text-[10px] font-bold text-slate-400 mb-1.5" },
                        "كلمة السر المؤقتة",
                        React.createElement('span', { className: "text-rose-400 mr-1" }, "*")
                    ),
                    React.createElement('div', { className: "relative" },
                        React.createElement('input', {
                            type: showPass ? 'text' : 'password', value: form.password,
                            onChange: (e: React.ChangeEvent<HTMLInputElement>) => s('password', e.target.value),
                            placeholder: "8 أحرف على الأقل",
                            className: "w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600 pl-10",
                            style: { fontFamily: 'Cairo,sans-serif' }
                        }),
                        React.createElement('button', {
                            type: "button", onClick: () => setShowPass(!showPass),
                            className: "absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-premium-gold transition-colors"
                        }, React.createElement(I.Eye))
                    )
                ),
                React.createElement('div', null,
                    React.createElement('label', { className: "block text-[10px] font-bold text-slate-400 mb-2" }, "الصلاحية"),
                    React.createElement('div', { className: "grid grid-cols-3 gap-2" },
                        ['admin', 'lawyer', 'viewer'].map((role: string) => {
                            const rc = ROLE_CONFIG[role];
                            return React.createElement('button', {
                                key: role, type: "button",
                                onClick: () => s('role', role),
                                className: `py-2.5 rounded-xl text-[11px] font-black border transition-all ${form.role === role ? `${rc.bg} ${rc.color} ${rc.border}` : 'bg-white/5 text-slate-500 border-white/10'}`
                            }, rc.label);
                        })
                    )
                ),
                React.createElement('button', {
                    disabled: loading,
                    onClick: submit,
                    className: "w-full py-3.5 bg-gradient-to-tr from-premium-gold to-[#E8C97A] text-premium-bg rounded-xl font-black text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform mt-2"
                }, loading ? React.createElement(I.Spin) : React.createElement(I.Users), loading ? 'جاري الإنشاء...' : 'إنشاء الحساب وإضافته لسَنَد')
            )
        )
    );
}

export default UserFormModal;
