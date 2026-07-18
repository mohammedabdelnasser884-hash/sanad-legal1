import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { toast } from '../../shared/lib/notifications';
import { I } from '../../constants';
import { Inp } from '@/shared/ui/Inp';
import { Sel } from '@/shared/ui/Sel';
import { FileUploadField } from '@/shared/ui/FileUploadField';
import { useResolvedStorageUrl } from '../../shared/lib/storage';
import type { ClientRow } from '../../types';
import type { ClientContactInfo } from './hooks/useClientActions';

interface EditClientForm {
    full_name: string;
    type: string;
    phone: string;
    phone2: string;
    email: string;
    address: string;
    notes: string;
    national_id: string;
    cr_number: string;
    kin_name: string;
    kin_phone: string;
}

interface EditClientModalProps {
    client: ClientRow;
    onClose: () => void;
    onSave: (form: EditClientForm, idFile?: File | null, poaFile?: File | null) => void;
}

function EditClientModal({client: c, onClose, onSave}: EditClientModalProps) {
    const [form, setForm] = useState<EditClientForm>({
        full_name:   c.full_name   || '',
        type:        c.client_type || c.type || 'individual',
        phone:       c.phone       || '',
        phone2:      c.phone2      || '',
        email:       c.email       || '',
        address:     c.address     || '',
        notes:       c.notes       || '',
        national_id: c.national_id || '',
        cr_number:   c.cr_number   || '',
        kin_name:    c.kin_name    || '',
        kin_phone:   c.kin_phone   || '',
    });

    // صور جديدة (اختيارية — لو مش اختار يبقى null ومش بيتغير الموجود)
    // ⚠️ client-docs باكت private — الرابط المتخزن في contact_info ممكن
    // يكون منتهي، فبنولّد رابط موقّع طازة للمعاينة بدل استخدامه مباشرة.
    // كاست موثّق واحد: contact_info عمود Json في السكيما، وشكله الفعلي
    // موصوف في ClientContactInfo (المُصدَّرة من useClientActions.ts).
    const contactInfo = c.contact_info as ClientContactInfo | null;
    const idResolved  = useResolvedStorageUrl('client-docs', contactInfo?.id_url);
    const poaResolved = useResolvedStorageUrl('client-docs', contactInfo?.poa_url);
    const [idFile,    setIdFile]    = useState<File | null>(null);
    const [idPreview, setIdPreview] = useState<string|null>(null);
    const [poaFile,    setPoaFile]    = useState<File | null>(null);
    const [poaPreview, setPoaPreview] = useState<string|null>(null);
    // لو لسه ماحددش ملف جديد، نعرض المعاينة الموقّعة الطازة بمجرد جهوزيتها
    useEffect(() => { if (!idFile) setIdPreview(idResolved); }, [idResolved, idFile]);
    useEffect(() => { if (!poaFile) setPoaPreview(poaResolved); }, [poaResolved, poaFile]);

    const s = <K extends keyof EditClientForm>(k: K, v: EditClientForm[K]) => setForm((p) => ({...p, [k]: v}));

    const pickId  = (file: File | null | undefined) => { if(!file) return; setIdFile(file);  setIdPreview(URL.createObjectURL(file)); };
    const pickPoa = (file: File | null | undefined) => { if(!file) return; setPoaFile(file); setPoaPreview(URL.createObjectURL(file)); };

    return createPortal(
        React.createElement('div', {
            className:"fixed inset-0 z-[70] flex items-end justify-center bg-black/80 backdrop-blur-sm",
            onClick: (e: React.MouseEvent<HTMLDivElement>) => { if(e.target===e.currentTarget) onClose(); }
        },
        React.createElement('div', {className:"bg-premium-card w-full max-w-lg rounded-t-3xl border-t border-white/10 p-6 pb-10 shadow-2xl slide-up max-h-[90vh] overflow-y-auto no-scrollbar"},
            React.createElement('div', {className:"w-10 h-1 bg-white/20 rounded-full mx-auto mb-5"}),
            React.createElement('div', {className:"flex items-center justify-between mb-5"},
                React.createElement('h3', {className:"text-sm font-black text-white flex items-center gap-2"},
                    React.createElement('span', {className:"w-1 h-4 bg-emerald-400 rounded-full"}),
                    "تعديل بيانات الموكل"
                ),
                React.createElement('button', {onClick:onClose, className:"w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-slate-400"}, "✕")
            ),
            React.createElement('div', {className:"space-y-4"},
                // الاسم ونوع الموكل
                React.createElement(Inp, {label:"الاسم الكامل", value:form.full_name, onChange:(e: React.ChangeEvent<HTMLInputElement>)=>s('full_name',e.target.value), placeholder:"اسم الموكل", required:true,'data-testid':'edit-client-name'}),
                React.createElement('div', {className:"grid grid-cols-2 gap-3"},
                    React.createElement(Sel, {label:"نوع الموكل", value:form.type, onChange:(e: React.ChangeEvent<HTMLSelectElement>)=>s('type',e.target.value), options:[
                        {value:'individual', label:'فرد'},
                        {value:'company',    label:'شركة'},
                        {value:'government', label:'جهة حكومية'},
                    ]}),
                    React.createElement(Inp, {label:"رقم الهاتف", value:form.phone, onChange:(e: React.ChangeEvent<HTMLInputElement>)=>s('phone',e.target.value), placeholder:"05xxxxxxxx"})
                ),
                React.createElement('div', {className:"grid grid-cols-2 gap-3"},
                    React.createElement(Inp, {label:"رقم هاتف ثاني", value:form.phone2, onChange:(e: React.ChangeEvent<HTMLInputElement>)=>s('phone2',e.target.value), placeholder:"رقم بديل"}),
                    React.createElement(Inp, {label:"العنوان", value:form.address, onChange:(e: React.ChangeEvent<HTMLInputElement>)=>s('address',e.target.value), placeholder:"العنوان التفصيلي"})
                ),
                React.createElement(Inp, {label:"البريد الإلكتروني", type:"email", value:form.email, onChange:(e: React.ChangeEvent<HTMLInputElement>)=>s('email',e.target.value), placeholder:"client@email.com"}),

                // الرقم القومي ورقم التوكيل
                React.createElement('div', {className:"grid grid-cols-2 gap-3"},
                    React.createElement(Inp, {label:"الرقم القومي", value:form.national_id, onChange:(e: React.ChangeEvent<HTMLInputElement>)=>s('national_id',e.target.value), placeholder:"14 رقم"}),
                    React.createElement(Inp, {label:"رقم التوكيل", value:form.cr_number, onChange:(e: React.ChangeEvent<HTMLInputElement>)=>s('cr_number',e.target.value), placeholder:"2024/أ/1234"})
                ),

                // فاصل قريب الدرجة الأولى
                React.createElement('div', {className:"border-t border-white/5 pt-2"},
                    React.createElement('p', {className:"text-[10px] font-black text-blue-400/80 mb-3"}, "— قريب الدرجة الأولى —")
                ),
                React.createElement('div', {className:"grid grid-cols-2 gap-3"},
                    React.createElement(Inp, {label:"اسم القريب",  value:form.kin_name,  onChange:(e: React.ChangeEvent<HTMLInputElement>)=>s('kin_name',e.target.value),  placeholder:"الاسم الكامل"}),
                    React.createElement(Inp, {label:"هاتف القريب", value:form.kin_phone, onChange:(e: React.ChangeEvent<HTMLInputElement>)=>s('kin_phone',e.target.value), placeholder:"05xxxxxxxx"})
                ),

                // فاصل المستندات
                React.createElement('div', {className:"border-t border-white/5 pt-2"},
                    React.createElement('p', {className:"text-[10px] font-black text-slate-500 mb-3"}, "— المستندات الرسمية —")
                ),
                React.createElement(FileUploadField, {
                    label:"صورة البطاقة الشخصية",
                    hint:"JPG أو PNG — حجم أقصى 5MB",
                    onChange: pickId,
                    preview: idPreview
                }),
                React.createElement(FileUploadField, {
                    label:"صورة التوكيل",
                    hint:"JPG أو PNG — حجم أقصى 5MB",
                    onChange: pickPoa,
                    preview: poaPreview
                }),

                // ملاحظات
                React.createElement('div', null,
                    React.createElement('label', {className:"block text-[10px] font-bold text-slate-400 mb-1.5"}, "ملاحظات"),
                    React.createElement('textarea', {
                        value:form.notes, onChange:(e: React.ChangeEvent<HTMLTextAreaElement>)=>s('notes',e.target.value),
                        placeholder:"ملاحظات إضافية...", rows:3,
                        className:"w-full p-3 text-xs rounded-xl border border-white/10 bg-premium-bg text-white placeholder-slate-600 resize-none transition-colors",
                        style:{fontFamily:'Cairo,sans-serif'}
                    })
                ),

                // زر الحفظ
                React.createElement('button', {
                    'data-testid': 'save-client-edit-button',
                    onClick: () => {
                        if(!form.full_name || !form.full_name.trim()){ toast('يرجى إدخال اسم الموكل', true); return; }
                        onSave(form, idFile, poaFile);
                    },
                    className:"w-full py-3.5 bg-gradient-to-tr from-emerald-500 to-emerald-400 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform mt-2"
                }, React.createElement(I.Check), "حفظ التعديلات")
            )
        )),
        document.body
    );
}

export default EditClientModal;
