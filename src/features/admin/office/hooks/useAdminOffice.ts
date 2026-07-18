import React, { useState, useCallback } from 'react';
import { toast } from '../../../../shared/lib/notifications';
import { validateUploadFile, resolveStorageUrl } from '../../../../shared/lib/storage';
import { logActivity } from '../../../../shared/lib/dataAccess';
import { db } from '../../../../supabaseClient';
import { showErrorToast } from '../../../../shared/lib/errorReporting';
import { invalidateOfficeCache } from '../../../../constants';
import type { ProfileRow } from '../../../../types';

// شكل حالة إعدادات المكتب في الفورم (camelCase) — نفس الحقول الافتراضية
// اللي كانت متعرّفة أصلاً في useState تحت، من غير أي إضافة أو حذف.
export interface OfficeSettingsForm {
  name: string;
  slogan: string;
  logoUrl: string;
  brandColor: string;
  accentColor: string;
  phone: string;
  phone2: string;
  email: string;
  website: string;
  whatsapp: string;
  address: string;
  city: string;
  facebook: string;
  instagram: string;
  taxNumber: string;
  licenseNumber: string;
  bankName: string;
  bankIban: string;
  invoicePrefix: string;
  invoiceFooter: string;
  country: string;
}

export function useAdminOffice(tenantId: string | null, profile?: ProfileRow | null) {
  const _userName = profile?.full_name || null;
  // BUG FIX: الشكل القديم هنا كان فيه 6 حقول بس (officeName, officePhone...)
  // بينما باقي الكود (AdminPanel.tsx + handleSaveOfficeSettings تحت) بيستخدم
  // شكل تاني تمامًا (name, slogan, brandColor, taxNumber...) من نفس عملية
  // إعادة تصميم إعدادات المكتب اللي ما خلصتش. ده اللي كان يفجّر الـ build.
  const [officeSettings, setOfficeSettings] = useState<OfficeSettingsForm>({
    name: '', slogan: '', logoUrl: '',
    brandColor: '#D4AF37', accentColor: '#1e3a5f',
    phone: '', phone2: '', email: '', website: '', whatsapp: '',
    address: '', city: '',
    facebook: '', instagram: '',
    taxNumber: '', licenseNumber: '',
    bankName: '', bankIban: '',
    invoicePrefix: 'INV-', invoiceFooter: '',
    country: 'EG',
  });
  const [loadingOffice, setLoadingOffice] = useState(false);
  const [savingOffice, setSavingOffice] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const fetchOfficeSettings = useCallback(async () => {
    if (!tenantId) return; // لسه مفيش tenant معروف — متجيب حاجة عشوائية
    setLoadingOffice(true);
    try {
      const { data } = await db.from('office_settings').select('*').eq('tenant_id', tenantId).limit(1).maybeSingle();
      if (data) {
        // BUG FIX: كان بيعمل { ...s, ...data } مباشرة، وده بيحقن أعمدة الداتابيز
        // بأسماء snake_case (brand_color, tax_number...) جوه الـ state، بينما
        // الفورم كله بيقرا بأسماء camelCase (brandColor, taxNumber...) — يعني
        // الإعدادات المحفوظة كانت تفضل ما تطلعش في الفورم بعد إعادة فتح الصفحة.
        setOfficeSettings((s: OfficeSettingsForm) => ({
          ...s,
          name:           data.name           ?? s.name,
          slogan:         data.slogan         ?? s.slogan,
          logoUrl:        data.logo_url       ?? s.logoUrl,
          brandColor:     data.brand_color    ?? s.brandColor,
          accentColor:    data.accent_color   ?? s.accentColor,
          phone:          data.phone          ?? s.phone,
          phone2:         data.phone2         ?? s.phone2,
          email:          data.email          ?? s.email,
          website:        data.website        ?? s.website,
          whatsapp:       data.whatsapp       ?? s.whatsapp,
          address:        data.address        ?? s.address,
          city:           data.city           ?? s.city,
          facebook:       data.facebook       ?? s.facebook,
          instagram:      data.instagram      ?? s.instagram,
          taxNumber:      data.tax_number     ?? s.taxNumber,
          licenseNumber:  data.license_number ?? s.licenseNumber,
          bankName:       data.bank_name      ?? s.bankName,
          bankIban:       data.bank_iban      ?? s.bankIban,
          invoicePrefix:  data.invoice_prefix ?? s.invoicePrefix,
          invoiceFooter:  data.invoice_footer ?? s.invoiceFooter,
          country:        data.country        ?? s.country,
        }));
        // ⚠️ client-docs باكت private — نولّد رابط موقّع طازة للشعار بدل
        // استخدام الرابط المتخزن مباشرة (ممكن يكون منتهي).
        if (data.logo_url) {
          resolveStorageUrl('client-docs', data.logo_url).then((u) => { if (u) setLogoPreview(u); });
        }
      }
    } catch(e) { /* الجدول غير موجود بعد */ }
    setLoadingOffice(false);
  }, [tenantId]);

  // ── حفظ إعدادات المكتب ──
  const handleSaveOfficeSettings = async () => {
    if (!tenantId) { toast('❌ لا يمكن الحفظ، تعذر تحديد المكتب الحالي', true); return; }
    setSavingOffice(true);
    try {
      // رفع الشعار لو في شعار جديد
      let logoUrl = officeSettings.logoUrl;
      if (logoFile) {
        // ⚠️ فحص نوع وحجم الملف قبل الرفع — راجع validateUploadFile في utils.ts.
        const validationError = validateUploadFile(logoFile);
        if (validationError) {
          toast('❌ ' + validationError, true);
          setSavingOffice(false);
          return;
        }
        const ext = logoFile.name.split('.').pop();
        const path = `office/${tenantId}/logo.${ext}`;
        const { error: upErr } = await db.storage.from('client-docs').upload(path, logoFile, { upsert: true });
        // ⚠️ BUG FIX: قبل كده لو الرفع فشل (upErr)، الكود كان يتجاهل الخطأ
        // تمامًا ويكمل الحفظ بقيمة logoUrl القديمة (غالبًا فاضية)، ويظهر
        // "✅ تم حفظ إعدادات المكتب" — يعني المستخدم يشوف رسالة نجاح خادعة
        // والشعار فعليًا ملحقش يترفع ولا يتحفظ. دلوقتي نوقف الحفظ ونعرض
        // سبب فشل الرفع الحقيقي (مساحة، صلاحيات RLS، نوع ملف مرفوض... إلخ).
        if (upErr) {
          showErrorToast('office_logo_upload', upErr, 'تعذّر رفع شعار المكتب. تأكد إن حجم الصورة مناسب وحاول تاني. لو المشكلة استمرت، تواصل مع الدعم.', 'رفع شعار المكتب');
          setSavingOffice(false);
          return;
        }
        // الباكت client-docs private دلوقتي — بنولّد رابط موقّع مؤقت بدل
        // الرابط العام (كسر الكاش هنا مش لازم، التوقيع بيغيّر الرابط أصلاً).
        logoUrl = (await resolveStorageUrl('client-docs', path)) || '';
      }
      const { data: existing } = await db.from('office_settings').select('id').eq('tenant_id', tenantId).limit(1).maybeSingle();
      const payload = {
        name:           officeSettings.name           || '',
        slogan:         officeSettings.slogan         || '',
        logo_url:       logoUrl                       || '',
        brand_color:    officeSettings.brandColor     || '#D4AF37',
        accent_color:   officeSettings.accentColor    || '#1e3a5f',
        phone:          officeSettings.phone          || '',
        phone2:         officeSettings.phone2         || '',
        email:          officeSettings.email          || '',
        website:        officeSettings.website        || '',
        whatsapp:       officeSettings.whatsapp       || '',
        address:        officeSettings.address        || '',
        city:           officeSettings.city           || '',
        facebook:       officeSettings.facebook       || '',
        instagram:      officeSettings.instagram      || '',
        tax_number:     officeSettings.taxNumber      || '',
        license_number: officeSettings.licenseNumber  || '',
        bank_name:      officeSettings.bankName       || '',
        bank_iban:      officeSettings.bankIban       || '',
        invoice_prefix: officeSettings.invoicePrefix  || 'INV-',
        invoice_footer: officeSettings.invoiceFooter  || '',
      };
      let saveError;
      if (existing?.id) {
        ({ error: saveError } = await db.from('office_settings').update(payload).eq('id', existing.id));
      } else {
        ({ error: saveError } = await db.from('office_settings').insert({ ...payload, tenant_id: tenantId }));
      }
      if (saveError) throw saveError;
      invalidateOfficeCache(); // ⚠️ مهم: من غير السطر ده، شعار الفاتورة في قسم
      // الأتعاب وأي مكان تاني بيقرا عن طريق loadOfficeSetting() كان يفضل
      // يشوف نسخة قديمة من الكاش لحد إعادة تحميل الصفحة بالكامل.
      setOfficeSettings((s: OfficeSettingsForm) => ({ ...s, logoUrl }));
      setLogoFile(null);
      toast('✅ تم حفظ إعدادات المكتب');
      logActivity(db, 'تعديل إعدادات المكتب', { userName: _userName, entity_type: 'office', details: payload.name || null });
    } catch(e) {
      showErrorToast('save_office_settings', e, 'تعذّر حفظ إعدادات المكتب. تحقق من الاتصال بالإنترنت وحاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.', 'حفظ إعدادات المكتب');
    }
    setSavingOffice(false);
  };

  return {
    officeSettings, setOfficeSettings,
    loadingOffice, savingOffice,
    logoFile, setLogoFile,
    logoPreview, setLogoPreview,
    fetchOfficeSettings, handleSaveOfficeSettings
  };
}
