import { escapeHtml } from '../../../shared/lib/sanitize';
import { PDF_FONT_LINK, RECEIPT_FONT_FAMILY } from '../../../shared/lib/pdf';
import { loadOfficeSetting, getCurrentTenantId } from '../../../constants';
import { db } from '../../../supabaseClient';
import { formatArDate, formatArNumber } from '../../../shared/ui/arabicLocale';
import type { ClientRow, ProfileRow, CaseFeeRow, FeePaymentRow, InvoiceRow } from '../../../types';
import type { InvoiceModalState } from './useFeesActions';
import type { MappedCase } from '../../../hooks/useAppData';

/**
 * منطق إصدار وطباعة الفواتير/إيصالات الأتعاب — منقول حرفيًا من FeesTab.tsx
 * (نفس المنطق تمامًا، صفر تغيير سلوك): getOrCreateInvoice, printInvoice,
 * printAllPayments, loadOfficeInfo + الدوال المساعدة المشتركة بينهم
 * (officeLogoSvg, sigRowHtml, autoPrintScript, openPrintWindow, writeAndPrint).
 */
export function useInvoicePrinting(
  cases: MappedCase[],
  clients: ClientRow[],
  profile: ProfileRow | null | undefined,
  currency: string
) {
  // ── جلب فاتورة موجودة لدفعة، أو إصدار واحدة جديدة برقم تسلسلي ثابت ──
  // (بدل الحساب اللحظي القديم اللي كان بيتزحلق لو دفعة اتحذفت/اتضافت)
  const getOrCreateInvoice = async (payment: FeePaymentRow, fee: CaseFeeRow): Promise<Pick<InvoiceRow, 'invoice_number' | 'issued_at'>> => {
    // فاتورة اتصدرت قبل كده لنفس الدفعة؟ رجّعها زي ما هي (مفيش تكرار ترقيم)
    const { data: existing, error: findErr } = await db
      .from('invoices')
      .select('invoice_number,issued_at')
      .eq('fee_payment_id', payment.id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (existing) return existing;

    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('تعذر تحديد المكتب الحالي');

    const { data: newNumber, error: rpcErr } = await db.rpc('generate_invoice_number', { p_tenant_id: tenantId });
    if (rpcErr) throw rpcErr;
    const invoiceNumber = newNumber as string;

    const clientName = fee.client_name || clients.find((c) => c.id === fee.client_id)?.full_name || null;
    const caseName = cases.find((c) => c.id === fee.case_id)?.title || null;

    const { data: inserted, error: insertErr } = await db
      .from('invoices')
      .insert([{
        tenant_id: tenantId,
        invoice_number: invoiceNumber,
        fee_payment_id: payment.id,
        case_id: fee.case_id || null,
        client_id: fee.client_id || null,
        case_name: caseName,
        client_name: clientName,
        amount: payment.amount,
        currency,
        notes: payment.notes || null,
        issued_by: profile?.id || null,
      }])
      .select('invoice_number,issued_at')
      .single();
    if (insertErr) throw insertErr;
    return inserted;
  };

  // ══════════════════════════════════════════
  //  دوال مشتركة بين كل عمليات الطباعة
  //  (لتقليل التكرار بين printInvoice و printAllPayments)
  // ══════════════════════════════════════════

  // ── جلب بيانات المكتب (الاسم/العنوان/الهاتف/الإيميل/الشعار) ──
  const loadOfficeInfo = async () => {
    const [officeName, officeAddress, officePhone, officeEmail, officeLogo] = await Promise.all([
      loadOfficeSetting('office_name'),
      loadOfficeSetting('office_address'),
      loadOfficeSetting('office_phone'),
      loadOfficeSetting('office_email'),
      loadOfficeSetting('office_logo'),
    ]);
    const name = escapeHtml(officeName || 'مكتب المحاماة');
    const address = escapeHtml(officeAddress || '');
    const phone = escapeHtml(officePhone || '');
    const email = escapeHtml(officeEmail || '');
    // ⚠️ officeLogo بيُستخدم كـ src مباشرة (Data URL أو رابط)، فمينفعش
    // يتعمل له escapeHtml (هيكسر الـ Data URL) — لكنه قيمة إعدادات مكتب
    // مش نص حر مكتوب من مستخدم تالت، فمخاطره محدودة هنا.
    const logoHtml = officeLogo
      ? `<img src="${officeLogo}" style="width:64px;height:64px;object-fit:contain;border-radius:10px;" />`
      : officeLogoSvg(64);
    const contactLine = [address, phone, email].filter(Boolean).join(' | ');
    return { name, address, phone, email, logoHtml, contactLine };
  };

  // ── شعار سند الافتراضي (SVG) بمقاس مرن ──
  const officeLogoSvg = (size = 64) => `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" style="width:${size}px;height:${size}px;">
                <rect width="80" height="80" rx="16" fill="#0B1320"/>
                <line x1="16" y1="26" x2="64" y2="26" stroke="#D4AF37" stroke-width="8" stroke-linecap="round"/>
                <line x1="22" y1="40" x2="64" y2="40" stroke="#D4AF37" stroke-width="8" stroke-linecap="round"/>
                <line x1="28" y1="54" x2="64" y2="54" stroke="#D4AF37" stroke-width="8" stroke-linecap="round"/>
                <line x1="16" y1="26" x2="16" y2="60" stroke="#D4AF37" stroke-width="8" stroke-linecap="round"/>
                <circle cx="16" cy="26" r="8" fill="#D4AF37"/>
                <circle cx="16" cy="61" r="5" fill="#D4AF37" opacity="0.38"/>
               </svg>`;

  // ── صف التواقيع المشترك بين كل المطبوعات ──
  const sigRowHtml = '<div class="sig-row">'
    + '<div class="sig-box"><div class="sig-line">توقيع المحامي / المكتب</div></div>'
    + '<div class="sig-box"><div class="sig-line">توقيع واستلام الموكل</div></div>'
    + '</div>';

  // ── سكريبت الطباعة التلقائية عند تحميل الصفحة ──
  const autoPrintScript = '<scr' + 'ipt>window.onload=function(){window.print();}<' + '/scr' + 'ipt>';

  // ── فتح نافذة جديدة جاهزة للطباعة بمقاس A4 ──
  const openPrintWindow = () => window.open('', '_blank', 'width=794,height=1123');

  // ── كتابة الـHTML النهائي وتشغيل الطباعة ──
  const writeAndPrint = (w: Window | null, html: string) => {
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  // ── طباعة الفاتورة ──
  const printInvoice = async (inv: InvoiceModalState) => {
    // جلب بيانات المكتب من الإعدادات
    const { name, contactLine, logoHtml } = await loadOfficeInfo();

    const w = openPrintWindow();
    if (!w) return;
    // ⚠️ BUG FIX: كان الشرط ده بيقارن inv.remaining (نص منسّق بـ fmt(),
    // وبيرجّع "٠" مش "0" للصفر) بالحرف '0' — فكان دايماً false، والفاتورة
    // تظهر "جزئي" حتى لو الأتعاب اتسددت بالكامل. دلوقتي بنستخدم isFullyPaid
    // اللي محسوبة من القيمة الرقمية الأصلية وقت بناء invoiceModal.
    const statusBadge = inv.isFullyPaid
      ? '<span class="status-badge status-paid">مسدد بالكامل</span>'
      : '<span class="status-badge" style="background:#fef3c7;color:#92400e">جزئي</span>';
    const notesHtml = inv.notes
      ? '<div class="notes-box">ملاحظة: ' + escapeHtml(inv.notes) + '</div>'
      : '';
    const invoiceNum = escapeHtml(inv.invoiceNum);
    const clientName = escapeHtml(inv.clientName || '—');
    const caseName = escapeHtml(inv.caseName);
    const receivedBy = escapeHtml(inv.receivedBy || '—');
    const issueDate = escapeHtml(inv.issueDate);
    const amount = escapeHtml(inv.amount);
    const payDate = escapeHtml(inv.payDate);
    const css = [
      '*{margin:0;padding:0;box-sizing:border-box;}',
      `body{font-family:${RECEIPT_FONT_FAMILY};background:#fff;color:#1a1208;direction:rtl;print-color-adjust:exact;-webkit-print-color-adjust:exact;}`,
      '.page{width:794px;min-height:1123px;padding:40px 50px;background:#fff;position:relative;}',
      '.header{display:flex;align-items:center;justify-content:space-between;padding-bottom:24px;border-bottom:3px solid #D4AF37;margin-bottom:28px;}',
      '.logo-box{display:flex;align-items:center;gap:14px;}',
      '.logo-svg{width:64px;height:64px;}',
      '.office-name{font-size:22px;font-weight:900;color:#070d1a;line-height:1.2;}',
      '.office-sub{font-size:10px;color:#7a6b52;margin-top:2px;}',
      '.invoice-badge{text-align:left;}',
      '.invoice-title{font-size:13px;font-weight:700;color:#7a6b52;letter-spacing:1px;}',
      '.invoice-num{font-size:26px;font-weight:900;color:#070d1a;}',
      '.invoice-date{font-size:11px;color:#7a6b52;margin-top:4px;}',
      '.gold-bar{height:4px;background:linear-gradient(90deg,#D4AF37,#E8C84A,#D4AF37);border-radius:2px;margin-bottom:28px;}',
      '.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:28px;}',
      '.info-box{background:#faf7f2;border:1px solid #e8e0d0;border-radius:10px;padding:14px 16px;}',
      '.info-label{font-size:10px;color:#7a6b52;font-weight:600;margin-bottom:4px;}',
      '.info-value{font-size:13px;font-weight:700;color:#1a1208;}',
      '.section-title{font-size:11px;font-weight:700;color:#7a6b52;margin-bottom:8px;}',
      '.amount-section{background:linear-gradient(135deg,#070d1a,#0d1a2e);border-radius:14px;padding:24px 28px;margin-bottom:28px;color:#fff;}',
      '.amount-label{font-size:12px;color:#D4AF37;font-weight:700;margin-bottom:6px;}',
      '.amount-value{font-size:36px;font-weight:900;color:#fff;}',
      '.amount-sub{font-size:11px;color:rgba(255,255,255,0.5);margin-top:4px;}',
      '.tbl{width:100%;border-collapse:collapse;margin-bottom:28px;}',
      '.tbl th{background:#070d1a;color:#D4AF37;font-size:11px;font-weight:700;padding:10px 14px;text-align:right;}',
      '.tbl td{padding:10px 14px;font-size:12px;border-bottom:1px solid #e8e0d0;color:#1a1208;}',
      '.tbl tr:nth-child(even) td{background:#faf7f2;}',
      '.status-badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;}',
      '.status-paid{background:#d1fae5;color:#065f46;}',
      '.notes-box{background:#faf7f2;border:1px solid #e8e0d0;border-right:3px solid #D4AF37;border-radius:8px;padding:12px 16px;margin-bottom:28px;font-size:11px;color:#4a3f2a;line-height:1.7;}',
      '.sig-row{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:36px;}',
      '.sig-box{text-align:center;}',
      '.sig-line{border-top:1.5px solid #1a1208;margin-top:44px;padding-top:8px;font-size:11px;color:#7a6b52;font-weight:600;}',
      '.footer{position:absolute;bottom:28px;left:50px;right:50px;text-align:center;font-size:10px;color:#c4b89a;border-top:1px solid #e8e0d0;padding-top:10px;}',
      '@media print{body{margin:0;}.page{padding:30px 40px;}}'
    ].join('\n');

    const html = '<!DOCTYPE html>'
      + '<html lang="ar" dir="rtl"><head><meta charset="UTF-8">'
      + '<title>فاتورة ' + invoiceNum + '</title>'
      + PDF_FONT_LINK
      + '<style>' + css + '</style></head><body>'
      + '<div class="page">'
      + '<div class="header">'
      + '<div class="logo-box">'
      + logoHtml
      + '<div><div class="office-name">' + name + '</div>'
      + (contactLine ? '<div class="office-sub">' + contactLine + '</div>' : '')
      + '</div></div>'
      + '<div class="invoice-badge">'
      + statusBadge
      + '<div class="invoice-title">فاتورة أتعاب</div>'
      + '<div class="invoice-num">' + invoiceNum + '</div>'
      + '<div class="invoice-date">تاريخ الإصدار: ' + issueDate + '</div>'
      + '</div></div>'
      + '<div class="gold-bar"></div>'
      + '<div class="info-grid">'
      + '<div class="info-box"><div class="section-title">بيانات الموكل</div>'
      + '<div class="info-label">اسم الموكل</div>'
      + '<div class="info-value">' + clientName + '</div></div>'
      + '<div class="info-box"><div class="section-title">بيانات القضية</div>'
      + '<div class="info-label">عنوان القضية</div>'
      + '<div class="info-value">' + caseName + '</div></div>'
      + '</div>'
      + '<div class="info-grid" style="margin-top:-16px">'
      + '<div class="info-box"><div class="info-label">استلم المبلغ</div>'
      + '<div class="info-value" style="color:#6d28d9">' + receivedBy + '</div></div>'
      + '<div class="info-box"><div class="info-label">تاريخ الإصدار</div>'
      + '<div class="info-value">' + issueDate + '</div></div>'
      + '</div>'
      + '<div class="amount-section">'
      + '<div class="amount-label">مبلغ هذه الدفعة</div>'
      + '<div class="amount-value">' + amount + ' ' + currency + '</div>'
      + '<div class="amount-sub">تاريخ الدفع: ' + payDate + '</div>'
      + '</div>'
      + notesHtml
      + sigRowHtml
      + '<div class="footer">' + name + (contactLine ? ' — ' + contactLine : '') + '</div>'
      + '</div>'
      + autoPrintScript
      + '</body></html>';

    writeAndPrint(w, html);
  };

  const printAllPayments = async (fee: CaseFeeRow, feePayments: FeePaymentRow[], caseName: string, clientName: string | null) => {
    // جلب بيانات المكتب الفعلية (الاسم/العنوان/الشعار) من إعدادات المكتب
    const { name, contactLine, logoHtml } = await loadOfficeInfo();
    const w = openPrintWindow();
    if (!w) return;
    const year = new Date().getFullYear();
    const css = [
      '*{margin:0;padding:0;box-sizing:border-box;}',
      `body{font-family:${RECEIPT_FONT_FAMILY};background:#fff;color:#1a1208;direction:rtl;print-color-adjust:exact;-webkit-print-color-adjust:exact;}`,
      '.page{width:794px;padding:36px 48px;background:#fff;}',
      '.header{display:flex;align-items:center;justify-content:space-between;padding-bottom:20px;border-bottom:3px solid #D4AF37;margin-bottom:24px;}',
      '.logo-box{display:flex;align-items:center;gap:12px;}',
      '.logo-svg{width:56px;height:56px;}',
      '.office-name{font-size:20px;font-weight:900;color:#070d1a;}',
      '.office-sub{font-size:10px;color:#7a6b52;margin-top:2px;}',
      '.report-title{font-size:14px;font-weight:900;color:#070d1a;text-align:left;}',
      '.report-sub{font-size:10px;color:#7a6b52;text-align:left;margin-top:3px;}',
      '.gold-bar{height:4px;background:linear-gradient(90deg,#D4AF37,#E8C84A,#D4AF37);border-radius:2px;margin-bottom:22px;}',
      '.info-row{display:flex;gap:16px;margin-bottom:20px;}',
      '.info-box{flex:1;background:#faf7f2;border:1px solid #e8e0d0;border-radius:10px;padding:12px 14px;}',
      '.info-label{font-size:9px;color:#7a6b52;font-weight:600;margin-bottom:3px;}',
      '.info-value{font-size:12px;font-weight:700;color:#1a1208;}',
      '.tbl{width:100%;border-collapse:collapse;margin-bottom:24px;}',
      '.tbl th{background:#070d1a;color:#D4AF37;font-size:10px;font-weight:700;padding:9px 12px;text-align:right;}',
      '.tbl td{padding:9px 12px;font-size:11px;border-bottom:1px solid #e8e0d0;color:#1a1208;}',
      '.tbl tr:nth-child(even) td{background:#faf7f2;}',
      '.total-row td{background:linear-gradient(135deg,#070d1a,#0d1a2e)!important;color:#D4AF37!important;font-weight:900;font-size:12px;}',
      '.sig-row{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:32px;}',
      '.sig-box{text-align:center;}',
      '.sig-line{border-top:1.5px solid #1a1208;margin-top:44px;padding-top:8px;font-size:11px;color:#7a6b52;font-weight:600;}',
      '.footer{margin-top:28px;text-align:center;font-size:9px;color:#c4b89a;border-top:1px solid #e8e0d0;padding-top:10px;}',
      '@media print{body{margin:0;}.page{padding:28px 38px;}}'
    ].join('\n');

    let rows = '';
    feePayments.forEach((p, i) => {
      const num = 'INV-' + year + '-' + String(i + 1).padStart(4, '0');
      const d = p.payment_date ? formatArDate(p.payment_date, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
      const recv = escapeHtml(p.received_by || '—');
      const amt = formatArNumber(p.amount || 0, { maximumFractionDigits: 0 });
      const note = escapeHtml(p.notes || '—');
      rows += '<tr>'
        + '<td>' + num + '</td>'
        + '<td>' + d + '</td>'
        + '<td>' + amt + ' ' + currency + '</td>'
        + '<td>' + recv + '</td>'
        + '<td>' + note + '</td>'
        + '</tr>';
    });
    const totalPaid = formatArNumber(fee.paid_fees || 0, { maximumFractionDigits: 0 });
    rows += '<tr class="total-row"><td colspan="2">\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0645\u062f\u0641\u0648\u0639</td><td>' + totalPaid + ' ' + currency + '</td><td colspan="2"></td></tr>';

    const safeCaseName = escapeHtml(caseName);
    const safeClientName = escapeHtml(clientName || '—');

    const html = '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">'
      + '<title>\u0643\u0634\u0641 \u062f\u0641\u0639\u0627\u062a ' + safeCaseName + '</title>'
      + PDF_FONT_LINK
      + '<style>' + css + '</style></head><body>'
      + '<div class="page">'
      + '<div class="header">'
      + '<div class="logo-box">'
      + logoHtml
      + '<div><div class="office-name">' + name + '</div>'
      + (contactLine ? '<div class="office-sub">' + contactLine + '</div>' : '') + '</div></div>'
      + '<div><div class="report-title">\u0643\u0634\u0641 \u062c\u0645\u064a\u0639 \u0627\u0644\u062f\u0641\u0639\u0627\u062a</div>'
      + '<div class="report-sub">\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0637\u0628\u0627\u0639\u0629: ' + formatArDate(new Date(), { year: 'numeric', month: 'long', day: 'numeric' }) + '</div></div>'
      + '</div>'
      + '<div class="gold-bar"></div>'
      + '<div class="info-row">'
      + '<div class="info-box"><div class="info-label">\u0627\u0644\u0642\u0636\u064a\u0629</div><div class="info-value">' + safeCaseName + '</div></div>'
      + '<div class="info-box"><div class="info-label">\u0627\u0644\u0645\u0648\u0643\u0644</div><div class="info-value">' + safeClientName + '</div></div>'
      + '<div class="info-box"><div class="info-label">\u0639\u062f\u062f \u0627\u0644\u062f\u0641\u0639\u0627\u062a</div><div class="info-value">' + feePayments.length + '</div></div>'
      + '</div>'
      + '<table class="tbl"><thead><tr>'
      + '<th>\u0631\u0642\u0645 \u0627\u0644\u0641\u0627\u062a\u0648\u0631\u0629</th>'
      + '<th>\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u062f\u0641\u0639</th>'
      + '<th>\u0627\u0644\u0645\u0628\u0644\u063a</th>'
      + '<th>\u0627\u0644\u0645\u0633\u062a\u0644\u0645</th>'
      + '<th>\u0645\u0644\u0627\u062d\u0638\u0627\u062a</th>'
      + '</tr></thead><tbody>' + rows + '</tbody></table>'
      + sigRowHtml
      + '<div class="footer">' + name + (contactLine ? ' \u2014 ' + contactLine : '') + '</div>'
      + '</div>'
      + autoPrintScript
      + '</body></html>';
    writeAndPrint(w, html);
  };

  return { getOrCreateInvoice, printInvoice, printAllPayments, loadOfficeInfo };
}
