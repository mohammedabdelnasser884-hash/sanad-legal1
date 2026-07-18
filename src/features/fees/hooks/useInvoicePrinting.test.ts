import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import type { CaseFeeRow, FeePaymentRow, ClientRow } from '../../../types';
import type { MappedCase } from '../../../hooks/useAppData';
import type { InvoiceModalState } from './useFeesActions';
import { formatArDate, formatArNumber } from '../../../shared/ui/arabicLocale';

// ── db (supabaseClient) بيتعمله mock كامل — نفس أسلوب dataAccess.test.ts.
//    getOrCreateInvoice بتستخدم 3 نداءات مختلفة على db:
//    1) db.from('invoices').select('invoice_number,issued_at').eq('fee_payment_id', id).maybeSingle()
//    2) db.rpc('generate_invoice_number', { p_tenant_id })
//    3) db.from('invoices').insert([...]).select('invoice_number,issued_at').single()
const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));

const single = vi.fn();
const insertSelect = vi.fn(() => ({ single }));
const insert = vi.fn(() => ({ select: insertSelect }));

const from = vi.fn(() => ({ select, insert }));
const rpc = vi.fn();

vi.mock('../../../supabaseClient', () => ({
  db: { from: (...args: Parameters<typeof from>) => from(...args), rpc: (...args: unknown[]) => rpc(...args) },
}));

// getCurrentTenantId مستوردة من constants.ts — مستخدمة في getOrCreateInvoice.
// loadOfficeSetting مستخدمة في loadOfficeInfo (ومن تحتها printInvoice/printAllPayments) —
// بقت قابلة للتحكم فيها بنفس الأسلوب علشان تستات loadOfficeInfo الجداد.
const getCurrentTenantId = vi.fn();
const loadOfficeSetting = vi.fn();
vi.mock('../../../constants', () => ({
  getCurrentTenantId: (...args: unknown[]) => getCurrentTenantId(...args),
  loadOfficeSetting: (...args: unknown[]) => loadOfficeSetting(...args),
}));

import { useInvoicePrinting } from './useInvoicePrinting';

function makeFee(overrides: Partial<CaseFeeRow> = {}): CaseFeeRow {
  return {
    id: 'fee-1', case_id: 'case-1', client_id: 'client-1', client_name: null,
    total_fees: 1000, paid_fees: 500, status: 'deferred', notes: null,
    receiver: null, last_payment_date: null, created_at: null, updated_at: null,
    deleted_at: null, tenant_id: 'tenant-1', case_title: null,
    ...overrides,
  } as CaseFeeRow;
}

function makePayment(overrides: Partial<FeePaymentRow> = {}): FeePaymentRow {
  return {
    id: 'pay-1', fee_id: 'fee-1', amount: 500, payment_date: '2026-07-01',
    notes: null, received_by: null, client_id: null, client_name: null,
    created_at: null, tenant_id: 'tenant-1',
    ...overrides,
  } as FeePaymentRow;
}

const cases: MappedCase[] = [{
  id: 'case-1', number: '1', title: 'قضية عمالية', court: '', type: 'عمالي',
  court_level: null, circuit_number: null, status: 'مفتوحة', date: '', client_id: 'client-1',
  plaintiff: null, defendant: null, year: 2026, updated_at: null, court_floor: null,
  court_hall: null, session_hall: null, secretary_hall: null, secretary_name: null, session_time: null,
}];

const clients: ClientRow[] = [{ id: 'client-1', full_name: 'أحمد محمد' } as ClientRow];

describe('getOrCreateInvoice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('فاتورة موجودة بالفعل لنفس الدفعة → ترجعها زي ما هي من غير rpc أو insert', async () => {
    maybeSingle.mockResolvedValue({
      data: { invoice_number: 'INV-2026-0007', issued_at: '2026-07-10T09:00:00.000Z' },
      error: null,
    });

    const { getOrCreateInvoice } = useInvoicePrinting(cases, clients, { id: 'lawyer-1' } as never, 'جنيه مصري');
    const result = await getOrCreateInvoice(makePayment(), makeFee());

    expect(result).toEqual({ invoice_number: 'INV-2026-0007', issued_at: '2026-07-10T09:00:00.000Z' });
    expect(rpc).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    // تأكيد إن الاستعلام اتعمل بالمفتاح الصح (fee_payment_id) مش fee_id غلط
    expect(eq).toHaveBeenCalledWith('fee_payment_id', 'pay-1');
  });

  it('مفيش فاتورة سابقة + tenant موجود → بتولّد رقم عن طريق RPC وتنشئ فاتورة جديدة بالبيانات الصح', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    getCurrentTenantId.mockReturnValue('tenant-1');
    rpc.mockResolvedValue({ data: 'INV-2026-0008', error: null });
    single.mockResolvedValue({
      data: { invoice_number: 'INV-2026-0008', issued_at: '2026-07-16T12:00:00.000Z' },
      error: null,
    });

    const { getOrCreateInvoice } = useInvoicePrinting(cases, clients, { id: 'lawyer-1' } as never, 'جنيه مصري');
    const payment = makePayment();
    const fee = makeFee();
    const result = await getOrCreateInvoice(payment, fee);

    expect(result).toEqual({ invoice_number: 'INV-2026-0008', issued_at: '2026-07-16T12:00:00.000Z' });
    expect(rpc).toHaveBeenCalledWith('generate_invoice_number', { p_tenant_id: 'tenant-1' });
    expect(insert).toHaveBeenCalledWith([expect.objectContaining({
      tenant_id: 'tenant-1',
      invoice_number: 'INV-2026-0008',
      fee_payment_id: 'pay-1',
      case_id: 'case-1',
      client_id: 'client-1',
      case_name: 'قضية عمالية',
      client_name: 'أحمد محمد', // fallback عن طريق clients.find لأن fee.client_name كان null
      amount: 500,
      currency: 'جنيه مصري',
      issued_by: 'lawyer-1',
    })]);
  });

  it('fee.client_name موجود مسبقًا → بيتستخدم هو من غير اللجوء لـ clients.find', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    getCurrentTenantId.mockReturnValue('tenant-1');
    rpc.mockResolvedValue({ data: 'INV-2026-0009', error: null });
    single.mockResolvedValue({ data: { invoice_number: 'INV-2026-0009', issued_at: '2026-07-16T12:00:00.000Z' }, error: null });

    const { getOrCreateInvoice } = useInvoicePrinting(cases, clients, { id: 'lawyer-1' } as never, 'جنيه مصري');
    await getOrCreateInvoice(makePayment(), makeFee({ client_name: 'اسم يدوي مكتوب في الأتعاب' }));

    expect(insert).toHaveBeenCalledWith([expect.objectContaining({ client_name: 'اسم يدوي مكتوب في الأتعاب' })]);
  });

  it('مفيش tenant حالي (getCurrentTenantId ترجع null) → يرمي خطأ من غير أي استدعاء لـ rpc أو insert', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    getCurrentTenantId.mockReturnValue(null);

    const { getOrCreateInvoice } = useInvoicePrinting(cases, clients, { id: 'lawyer-1' } as never, 'جنيه مصري');

    await expect(getOrCreateInvoice(makePayment(), makeFee())).rejects.toThrow('تعذر تحديد المكتب الحالي');
    expect(rpc).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('خطأ أثناء البحث عن فاتورة موجودة (findErr) → يترمى زي ما هو من غير محاولة إنشاء', async () => {
    const findErr = { message: 'network error', code: 'PGRST000' };
    maybeSingle.mockResolvedValue({ data: null, error: findErr });

    const { getOrCreateInvoice } = useInvoicePrinting(cases, clients, { id: 'lawyer-1' } as never, 'جنيه مصري');

    await expect(getOrCreateInvoice(makePayment(), makeFee())).rejects.toEqual(findErr);
    expect(getCurrentTenantId).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('خطأ من RPC توليد الرقم → يترمى من غير محاولة insert', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    getCurrentTenantId.mockReturnValue('tenant-1');
    const rpcErr = { message: 'function generate_invoice_number failed' };
    rpc.mockResolvedValue({ data: null, error: rpcErr });

    const { getOrCreateInvoice } = useInvoicePrinting(cases, clients, { id: 'lawyer-1' } as never, 'جنيه مصري');

    await expect(getOrCreateInvoice(makePayment(), makeFee())).rejects.toEqual(rpcErr);
    expect(insert).not.toHaveBeenCalled();
  });

  it('خطأ أثناء الـ insert النهائي → يترمى (مفيش فاتورة يترجع بها نتيجة جزئية)', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    getCurrentTenantId.mockReturnValue('tenant-1');
    rpc.mockResolvedValue({ data: 'INV-2026-0010', error: null });
    const insertErr = { message: 'duplicate key value violates unique constraint' };
    single.mockResolvedValue({ data: null, error: insertErr });

    const { getOrCreateInvoice } = useInvoicePrinting(cases, clients, { id: 'lawyer-1' } as never, 'جنيه مصري');

    await expect(getOrCreateInvoice(makePayment(), makeFee())).rejects.toEqual(insertErr);
  });
});

// ══════════════════════════════════════════════════════════════
//  loadOfficeInfo — دالة نقية بالكامل (مفيش window/document خالص)،
//  مجرد await لخمس نداءات loadOfficeSetting + escapeHtml. بتتغطى
//  بنفس أسلوب أي دالة تانية في المشروع، من غير أي mock للمتصفح.
// ══════════════════════════════════════════════════════════════
describe('loadOfficeInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('كل إعدادات المكتب موجودة → القيم بترجع بعد escapeHtml، logoHtml بيبقى <img>، وcontactLine مجمّع بفاصل " | "', async () => {
    loadOfficeSetting.mockImplementation(async (key: string) => ({
      office_name: 'مكتب <سند> للمحاماة',
      office_address: 'القاهرة، مصر',
      office_phone: '01000000000',
      office_email: 'info@sanad.law',
      office_logo: 'data:image/png;base64,AAAA',
    }[key]));

    const { loadOfficeInfo } = useInvoicePrinting(cases, clients, { id: 'lawyer-1' } as never, 'جنيه مصري');
    const result = await loadOfficeInfo();

    expect(result.name).toBe('مكتب &lt;سند&gt; للمحاماة'); // escapeHtml اتطبقت على الاسم
    expect(result.address).toBe('القاهرة، مصر');
    expect(result.phone).toBe('01000000000');
    expect(result.email).toBe('info@sanad.law');
    expect(result.contactLine).toBe('القاهرة، مصر | 01000000000 | info@sanad.law');
    expect(result.logoHtml).toContain('<img src="data:image/png;base64,AAAA"');
    expect(loadOfficeSetting).toHaveBeenCalledWith('office_name');
    expect(loadOfficeSetting).toHaveBeenCalledWith('office_address');
    expect(loadOfficeSetting).toHaveBeenCalledWith('office_phone');
    expect(loadOfficeSetting).toHaveBeenCalledWith('office_email');
    expect(loadOfficeSetting).toHaveBeenCalledWith('office_logo');
  });

  it('مفيش أي إعدادات (كلها null) → fallback: "مكتب المحاماة"، الباقي فاضي، شعار SVG افتراضي، contactLine فاضي', async () => {
    loadOfficeSetting.mockResolvedValue(null);

    const { loadOfficeInfo } = useInvoicePrinting(cases, clients, { id: 'lawyer-1' } as never, 'جنيه مصري');
    const result = await loadOfficeInfo();

    expect(result.name).toBe('مكتب المحاماة');
    expect(result.address).toBe('');
    expect(result.phone).toBe('');
    expect(result.email).toBe('');
    expect(result.contactLine).toBe('');
    expect(result.logoHtml).toContain('<svg');
    expect(result.logoHtml).not.toContain('<img');
  });

  it('بعض الإعدادات موجودة وبعضها فاضي → contactLine بتجمع الموجود بس', async () => {
    loadOfficeSetting.mockImplementation(async (key: string) => (key === 'office_address' ? 'الإسكندرية' : null));

    const { loadOfficeInfo } = useInvoicePrinting(cases, clients, { id: 'lawyer-1' } as never, 'جنيه مصري');
    const result = await loadOfficeInfo();

    expect(result.contactLine).toBe('الإسكندرية');
  });

  it('الشعار (Data URL) مبيتعملوش escapeHtml بعكس باقي الحقول — عشان الـ Data URL مش هينكسر', async () => {
    loadOfficeSetting.mockImplementation(async (key: string) =>
      (key === 'office_logo' ? 'data:image/png;base64,A&B"C' : null));

    const { loadOfficeInfo } = useInvoicePrinting(cases, clients, { id: 'lawyer-1' } as never, 'جنيه مصري');
    const result = await loadOfficeInfo();

    // القيمة اتحطت زي ما هي بالحرف من غير أي escape (لو اتعملها escape كانت &amp;/&quot; هتظهر بدالها)
    expect(result.logoHtml).toContain('data:image/png;base64,A&B"C');
  });
});

// ══════════════════════════════════════════════════════════════
//  printInvoice / printAllPayments — بيستخدموا window.open +
//  document.write/close. بنعمل mock لـ window.open ترجع كائن وهمي
//  فيه document.write/close (زي نفس أسلوب mock الـ createElement
//  اللي استخدمناه مع useAdminBackup.test.ts)، ونتأكد من محتوى الـ HTML
//  اللي اتكتب فعليًا. afterEach بيعمل restoreAllMocks عشان الـ spy
//  ميتسربش لتستات تانية.
// ══════════════════════════════════════════════════════════════
function makeFakeWindow() {
  return { document: { write: vi.fn(), close: vi.fn() } };
}

function makeInvoiceState(overrides: Partial<InvoiceModalState> = {}): InvoiceModalState {
  return {
    payment: makePayment(),
    fee: makeFee(),
    invoiceNum: 'INV-2026-0001',
    caseName: 'قضية عمالية',
    clientName: 'أحمد محمد',
    receivedBy: 'موظف الاستقبال',
    amount: '500',
    payDate: '01/07/2026',
    issueDate: '16/07/2026',
    totalFees: '1000',
    paidFees: '500',
    remaining: '500',
    isFullyPaid: false,
    notes: '',
    ...overrides,
  };
}

describe('printInvoice', () => {
  let fakeWindow: ReturnType<typeof makeFakeWindow>;
  let openSpy: MockInstance<Window['open']>;

  beforeEach(() => {
    vi.clearAllMocks();
    loadOfficeSetting.mockResolvedValue(null); // بيانات المكتب مش محور التستات دي
    fakeWindow = makeFakeWindow();
    openSpy = vi.spyOn(window, 'open').mockReturnValue(fakeWindow as unknown as Window);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('بتفتح نافذة بمقاس A4 الصح، وتكتب HTML واحد، وتقفل الـ document', async () => {
    const { printInvoice } = useInvoicePrinting(cases, clients, { id: 'lawyer-1' } as never, 'جنيه مصري');
    await printInvoice(makeInvoiceState());

    expect(openSpy).toHaveBeenCalledWith('', '_blank', 'width=794,height=1123');
    expect(fakeWindow.document.write).toHaveBeenCalledTimes(1);
    expect(fakeWindow.document.close).toHaveBeenCalledTimes(1);
  });

  it('window.open رجعت null (المتصفح منع الـ popup) → بترجع من غير أي كتابة ومن غير كراش', async () => {
    openSpy.mockReturnValue(null);
    const { printInvoice } = useInvoicePrinting(cases, clients, { id: 'lawyer-1' } as never, 'جنيه مصري');

    await expect(printInvoice(makeInvoiceState())).resolves.toBeUndefined();
    expect(fakeWindow.document.write).not.toHaveBeenCalled();
  });

  it('isFullyPaid:true → شارة "مسدد بالكامل" مش "جزئي"', async () => {
    const { printInvoice } = useInvoicePrinting(cases, clients, { id: 'lawyer-1' } as never, 'جنيه مصري');
    await printInvoice(makeInvoiceState({ isFullyPaid: true }));

    const html = fakeWindow.document.write.mock.calls[0][0] as string;
    expect(html).toContain('مسدد بالكامل');
    expect(html).not.toContain('جزئي');
  });

  it('isFullyPaid:false → شارة "جزئي" مش "مسدد بالكامل"', async () => {
    const { printInvoice } = useInvoicePrinting(cases, clients, { id: 'lawyer-1' } as never, 'جنيه مصري');
    await printInvoice(makeInvoiceState({ isFullyPaid: false }));

    const html = fakeWindow.document.write.mock.calls[0][0] as string;
    expect(html).toContain('جزئي');
    expect(html).not.toContain('مسدد بالكامل');
  });

  it('فيه ملاحظة → بتظهر جوه notes-box بعد escapeHtml', async () => {
    const { printInvoice } = useInvoicePrinting(cases, clients, { id: 'lawyer-1' } as never, 'جنيه مصري');
    await printInvoice(makeInvoiceState({ notes: 'دفعة مقدمة <خاصة>' }));

    const html = fakeWindow.document.write.mock.calls[0][0] as string;
    expect(html).toContain('<div class="notes-box">');
    expect(html).toContain('ملاحظة: دفعة مقدمة &lt;خاصة&gt;');
    expect(html).not.toContain('<خاصة>');
  });

  it('من غير ملاحظة → مفيش div الملاحظة خالص (رغم إن تعريف كلاس notes-box في الـ CSS موجود دايمًا)', async () => {
    const { printInvoice } = useInvoicePrinting(cases, clients, { id: 'lawyer-1' } as never, 'جنيه مصري');
    await printInvoice(makeInvoiceState({ notes: '' }));

    const html = fakeWindow.document.write.mock.calls[0][0] as string;
    // ⚠️ ملاحظة: 'notes-box' لوحدها بتتكرر دايمًا في الـ <style> (تعريف
    // الكلاس CSS ثابت في كل فاتورة)، فمفيش فايدة من toContain/not.toContain
    // على الكلمة المجرّدة — ده كان باگ في التست نفسه (مش في الكود) اتكشف
    // بالتشغيل الفعلي. الفحص الصح هو على الـ <div> الفعلي.
    expect(html).not.toContain('<div class="notes-box">');
  });

  it('كل الحقول النصية بتتعمل escapeHtml قبل الحقن (رقم الفاتورة/اسم الموكل/اسم القضية/المستلم)', async () => {
    const { printInvoice } = useInvoicePrinting(cases, clients, { id: 'lawyer-1' } as never, 'جنيه مصري');
    await printInvoice(makeInvoiceState({
      invoiceNum: '<b>INV</b>',
      clientName: '"موكل" خطير',
      caseName: 'قضية <script>alert(1)</script>',
      receivedBy: 'محمد & شريك',
    }));

    const html = fakeWindow.document.write.mock.calls[0][0] as string;
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&quot;موكل&quot; خطير');
    expect(html).toContain('محمد &amp; شريك');
  });

  it('clientName فاضي → بيظهر "—" (fallback جوه الدالة نفسها)', async () => {
    const { printInvoice } = useInvoicePrinting(cases, clients, { id: 'lawyer-1' } as never, 'جنيه مصري');
    await printInvoice(makeInvoiceState({ clientName: '' }));

    const html = fakeWindow.document.write.mock.calls[0][0] as string;
    expect(html).toContain('>—<');
  });

  it('المبلغ والعملة وتاريخ الدفع بيظهروا صح في قسم amount-section', async () => {
    const { printInvoice } = useInvoicePrinting(cases, clients, { id: 'lawyer-1' } as never, 'جنيه مصري');
    await printInvoice(makeInvoiceState({ amount: '750', payDate: '10/07/2026' }));

    const html = fakeWindow.document.write.mock.calls[0][0] as string;
    expect(html).toContain('750 جنيه مصري');
    expect(html).toContain('تاريخ الدفع: 10/07/2026');
  });
});

describe('printAllPayments', () => {
  let fakeWindow: ReturnType<typeof makeFakeWindow>;
  let openSpy: MockInstance<Window['open']>;

  beforeEach(() => {
    vi.clearAllMocks();
    loadOfficeSetting.mockResolvedValue(null);
    fakeWindow = makeFakeWindow();
    openSpy = vi.spyOn(window, 'open').mockReturnValue(fakeWindow as unknown as Window);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('بتفتح نافذة بنفس مقاس A4، وتكتب وتقفل الـ document', async () => {
    const { printAllPayments } = useInvoicePrinting(cases, clients, { id: 'lawyer-1' } as never, 'جنيه مصري');
    await printAllPayments(makeFee(), [makePayment()], 'قضية عمالية', 'أحمد محمد');

    expect(openSpy).toHaveBeenCalledWith('', '_blank', 'width=794,height=1123');
    expect(fakeWindow.document.write).toHaveBeenCalledTimes(1);
    expect(fakeWindow.document.close).toHaveBeenCalledTimes(1);
  });

  it('window.open رجعت null → بترجع من غير أي كتابة', async () => {
    openSpy.mockReturnValue(null);
    const { printAllPayments } = useInvoicePrinting(cases, clients, { id: 'lawyer-1' } as never, 'جنيه مصري');
    await printAllPayments(makeFee(), [makePayment()], 'قضية عمالية', 'أحمد محمد');

    expect(fakeWindow.document.write).not.toHaveBeenCalled();
  });

  it('كل دفعة بتاخد رقم فاتورة تسلسلي INV-{السنة}-{الترتيب مبطن 4 أرقام}', async () => {
    const payments = [makePayment({ id: 'p1' }), makePayment({ id: 'p2' }), makePayment({ id: 'p3' })];
    const { printAllPayments } = useInvoicePrinting(cases, clients, { id: 'lawyer-1' } as never, 'جنيه مصري');
    await printAllPayments(makeFee(), payments, 'قضية عمالية', 'أحمد محمد');

    const html = fakeWindow.document.write.mock.calls[0][0] as string;
    const year = new Date().getFullYear();
    expect(html).toContain(`INV-${year}-0001`);
    expect(html).toContain(`INV-${year}-0002`);
    expect(html).toContain(`INV-${year}-0003`);
  });

  it('مبلغ كل دفعة بيظهر منسّق بالتنسيق العربي، وصف الإجمالي بيعكس fee.paid_fees مش مجموع الدفعات', async () => {
    const payments = [makePayment({ amount: 1500 }), makePayment({ amount: 2500 })];
    const fee = makeFee({ paid_fees: 4000 });
    const { printAllPayments } = useInvoicePrinting(cases, clients, { id: 'lawyer-1' } as never, 'جنيه مصري');
    await printAllPayments(fee, payments, 'قضية عمالية', 'أحمد محمد');

    const html = fakeWindow.document.write.mock.calls[0][0] as string;
    expect(html).toContain(formatArNumber(1500, { maximumFractionDigits: 0 }) + ' جنيه مصري');
    expect(html).toContain(formatArNumber(2500, { maximumFractionDigits: 0 }) + ' جنيه مصري');
    expect(html).toContain(formatArNumber(4000, { maximumFractionDigits: 0 }) + ' جنيه مصري');
    expect(html).toContain('total-row');
  });

  it('عدد صفوف الجدول = صف الهيدر + عدد الدفعات + صف الإجمالي', async () => {
    const payments = [makePayment({ id: 'p1' }), makePayment({ id: 'p2' })];
    const { printAllPayments } = useInvoicePrinting(cases, clients, { id: 'lawyer-1' } as never, 'جنيه مصري');
    await printAllPayments(makeFee(), payments, 'قضية عمالية', 'أحمد محمد');

    const html = fakeWindow.document.write.mock.calls[0][0] as string;
    const trCount = (html.match(/<tr/g) || []).length;
    expect(trCount).toBe(1 /* header */ + payments.length + 1 /* total */);
  });

  it('اسم القضية بيتعمله escapeHtml، واسم الموكل null → "—"', async () => {
    const { printAllPayments } = useInvoicePrinting(cases, clients, { id: 'lawyer-1' } as never, 'جنيه مصري');
    await printAllPayments(makeFee(), [makePayment()], 'قضية <خطيرة>', null);

    const html = fakeWindow.document.write.mock.calls[0][0] as string;
    expect(html).toContain('قضية &lt;خطيرة&gt;');
    expect(html).not.toContain('قضية <خطيرة>');
    expect(html).toContain('>—<');
  });

  it('اسم المستلم وملاحظة الدفعة وتاريخها بيظهروا صح لكل دفعة', async () => {
    const payment = makePayment({ payment_date: '2026-07-05', received_by: 'موظف الاستقبال', notes: 'دفعة نقدية' });
    const { printAllPayments } = useInvoicePrinting(cases, clients, { id: 'lawyer-1' } as never, 'جنيه مصري');
    await printAllPayments(makeFee(), [payment], 'قضية عمالية', 'أحمد محمد');

    const html = fakeWindow.document.write.mock.calls[0][0] as string;
    expect(html).toContain('موظف الاستقبال');
    expect(html).toContain('دفعة نقدية');
    expect(html).toContain(formatArDate('2026-07-05', { year: 'numeric', month: 'short', day: 'numeric' }));
  });

  it('دفعة من غير payment_date → "—" بدل التاريخ', async () => {
    const payment = makePayment({ payment_date: null });
    const { printAllPayments } = useInvoicePrinting(cases, clients, { id: 'lawyer-1' } as never, 'جنيه مصري');
    await printAllPayments(makeFee(), [payment], 'قضية عمالية', 'أحمد محمد');

    const html = fakeWindow.document.write.mock.calls[0][0] as string;
    expect(html).toContain('<td>—</td>');
  });
});
