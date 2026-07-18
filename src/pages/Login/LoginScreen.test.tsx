import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import LoginScreen from './LoginScreen';

// ⚠️ vitest.config.ts في المشروع ده شغّال بـ `globals: false`، ومعناه
// إن @testing-library/react مبتسجّلش تنظيف تلقائي بعد كل تست (بتتأكد من
// وجود `afterEach` كـ global قبل ما تسجّله، ومش موجودة هنا). من غير الـ
// cleanup اليدوي ده، كل تست كان بيرندر LoginScreen فوق نسخة التست اللي
// قبله في نفس document.body، فـ screen.getByPlaceholderText بيلاقي أكتر
// من عنصر مطابق ويرمي getMultipleElementsFoundError — ده السبب الحقيقي
// للـ 9 تستات اللي فشلوا في أول تشغيل فعلي (17 يوليو 2026)، مش باگ في
// LoginScreen.tsx نفسها ولا في منطق التستات.
afterEach(() => { cleanup(); });

// ══════════════════════════════════════════════════════════════════
// تست تكاملي بسيط (مش e2e حقيقي) — بيغطي تدفق LoginScreen مع Edge
// Function office-login زي ما موثّق في مرحلة 6 من الخطة: بيانات صح →
// دخول، بيانات غلط → رسالة موحّدة. office-login نفسها (فانكشن حقيقية،
// 19 تست) مغطاة بالكامل في مرحلة 2 — هنا بنموّك db.functions.invoke
// وبنتأكد إن LoginScreen بتتعامل صح مع كل شكل رد ممكن يرجع منها،
// بقراءة كود LoginScreen.tsx الفعلي (مفيش تخمين لأي رسالة).
//
// ⚠️ المشروع مفيهوش @testing-library/jest-dom ولا user-event مثبتين
// (اتأكد من package.json) — فمفيش matchers زي toBeInTheDocument،
// بنستخدم matchers فانيلا (toBeTruthy/toBeNull/toContain) بس، وfireEvent
// بدل userEvent. LoginScreen.tsx نفسها مبنية بـ React.createElement (مفيش
// JSX)، فالتست بيستخدم نفس الأسلوب عشان يفضل متسق مع باقي المشروع
// ومحتاجش أي إعداد إضافي لـ JSX transform في vitest.config.ts.
// ══════════════════════════════════════════════════════════════════

type InvokeResult = { data?: { access_token?: string; refresh_token?: string; user?: { id: string; email: string }; error?: string } | null; error?: { message: string } | null };

let invokeResult: InvokeResult = { data: null, error: null };
let invokeImpl: (() => Promise<InvokeResult>) | null = null;
const invoke = vi.fn((_fn: string, _opts: unknown) => (invokeImpl ? invokeImpl() : Promise.resolve(invokeResult)));

let setSessionResult: { error: { message: string } | null } = { error: null };
const setSession = vi.fn((..._args: unknown[]) => Promise.resolve(setSessionResult));

vi.mock('../../supabaseClient', () => ({
  db: { functions: { invoke: (...a: [string, unknown]) => invoke(...a) }, auth: { setSession: (...a: unknown[]) => setSession(...a) } },
}));

const logActivity = vi.fn();
vi.mock('../../shared/lib/dataAccess', () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));

const recordError = vi.fn();
vi.mock('../../systemHealth', () => ({ recordError: (...a: unknown[]) => recordError(...a) }));

const SUCCESS: InvokeResult = {
  data: { access_token: 'at-1', refresh_token: 'rt-1', user: { id: 'user-1', email: 'lawyer@sanad.test' } },
  error: null,
};

function fillAndSubmit(email: string, password: string) {
  const emailInput = screen.getByPlaceholderText('example@law.com') as HTMLInputElement;
  const passInput = screen.getByPlaceholderText('••••••••') as HTMLInputElement;
  if (email) fireEvent.change(emailInput, { target: { value: email } });
  if (password) fireEvent.change(passInput, { target: { value: password } });
  const btn = screen.getByText(/دخول إلى سَنَد|جاري التحقق/);
  fireEvent.click(btn);
  return { emailInput, passInput, btn };
}

describe('LoginScreen (تدفق تكاملي مع office-login)', () => {
  beforeEach(() => {
    invokeResult = { data: null, error: null };
    invokeImpl = null;
    setSessionResult = { error: null };
    invoke.mockClear();
    setSession.mockClear();
    logActivity.mockClear();
    recordError.mockClear();
  });

  it('بريد أو باسورد فاضي → رسالة تحقق محلية، من غير أي نداء لـ office-login خالص', () => {
    const onLogin = vi.fn();
    render(React.createElement(LoginScreen, { onLogin }));
    fillAndSubmit('', '');
    expect(screen.getByText('يرجى إدخال البريد وكلمة السر')).toBeTruthy();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('بيانات صح → invoke بـ action:login والإيميل/الباسورد، setSession بالتوكنز الراجعة، logActivity، وonLogin بالـ user', async () => {
    invokeResult = SUCCESS;
    const onLogin = vi.fn();
    render(React.createElement(LoginScreen, { onLogin }));
    fillAndSubmit('lawyer@sanad.test', 'secret123');

    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));

    expect(invoke).toHaveBeenCalledWith('office-login', { body: { action: 'login', email: 'lawyer@sanad.test', password: 'secret123' } });
    expect(setSession).toHaveBeenCalledWith({ access_token: 'at-1', refresh_token: 'rt-1' });
    expect(logActivity).toHaveBeenCalledWith(expect.anything(), 'تسجيل دخول', {
      entity_type: 'user',
      entity_id: 'user-1',
      details: 'lawyer@sanad.test',
    });
    expect(onLogin).toHaveBeenCalledWith({ id: 'user-1', email: 'lawyer@sanad.test' });
  });

  it('بيانات غلط (office-login بترجع data.error برسالة موحّدة) → نفس الرسالة بتتعرض، من غير setSession أو onLogin', async () => {
    invokeResult = { data: { error: 'بيانات الدخول غير صحيحة. تحقق من الإيميل وكلمة السر.' }, error: null };
    const onLogin = vi.fn();
    render(React.createElement(LoginScreen, { onLogin }));
    fillAndSubmit('lawyer@sanad.test', 'wrongpass');

    await waitFor(() => expect(screen.getByText('بيانات الدخول غير صحيحة. تحقق من الإيميل وكلمة السر.')).toBeTruthy());
    expect(setSession).not.toHaveBeenCalled();
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('حساب مقفول (403 من office-login) → نفس المسار، الرسالة الموحّدة اللي رجعت في data.error بتتعرض زي ما هي', async () => {
    invokeResult = { data: { error: 'هذا الحساب مقفول حاليًا، تواصل مع مدير النظام لفتحه' }, error: null };
    const onLogin = vi.fn();
    render(React.createElement(LoginScreen, { onLogin }));
    fillAndSubmit('lawyer@sanad.test', 'secret123');
    await waitFor(() => expect(screen.getByText('هذا الحساب مقفول حاليًا، تواصل مع مدير النظام لفتحه')).toBeTruthy());
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('🆕 خطأ شبكة (invoke بيرجّع error.message من غير data) → الرسالة الموحّدة بتتعرض للمستخدم، وerror.message الخام يتسجل داخليًا بس عبر recordError (مش بيتعرض)', async () => {
    invokeResult = { data: null, error: { message: 'Failed to fetch' } };
    const onLogin = vi.fn();
    render(React.createElement(LoginScreen, { onLogin }));
    fillAndSubmit('lawyer@sanad.test', 'secret123');
    await waitFor(() => expect(screen.getByText('تعذّر تسجيل الدخول. تحقق من اتصال الإنترنت وحاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.')).toBeTruthy());
    expect(screen.queryByText('Failed to fetch')).toBeNull();
    expect(recordError).toHaveBeenCalledWith('office_login', 'Failed to fetch');
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('خطأ بلا رسالة (error:{} من غير message، وdata:null) → رسالة fallback العامة، من غير أي كراش', async () => {
    invokeResult = { data: null, error: {} as { message: string } };
    const onLogin = vi.fn();
    render(React.createElement(LoginScreen, { onLogin }));
    fillAndSubmit('lawyer@sanad.test', 'secret123');
    await waitFor(() => expect(screen.getByText('تعذّر تسجيل الدخول. تحقق من اتصال الإنترنت وحاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.')).toBeTruthy());
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('data:null وerror:null معًا (رد فاضي غير متوقع من office-login) → بعد FIX دفاعي (17 يوليو 2026، إضافة !data?.access_token للشرط) رسالة fallback بتتعرض من غير أي كراش أو Unhandled Rejection — قبل الـ FIX ده كان بيكراش فعليًا بـ TypeError على data.access_token (موثّق في تقرير الخطة، تكملة 9)', async () => {
    invokeResult = { data: null, error: null };
    const onLogin = vi.fn();
    render(React.createElement(LoginScreen, { onLogin }));
    fillAndSubmit('lawyer@sanad.test', 'secret123');
    await waitFor(() => expect(screen.getByText('تعذّر تسجيل الدخول. تحقق من اتصال الإنترنت وحاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.')).toBeTruthy());
    expect(setSession).not.toHaveBeenCalled();
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('نجاح لكن data.access_token فاضية/مفقودة (رد جزئي غير متوقع) → نفس مسار الحماية، رسالة fallback من غير setSession', async () => {
    invokeResult = { data: { user: { id: 'user-1', email: 'lawyer@sanad.test' } }, error: null };
    const onLogin = vi.fn();
    render(React.createElement(LoginScreen, { onLogin }));
    fillAndSubmit('lawyer@sanad.test', 'secret123');
    await waitFor(() => expect(screen.getByText('تعذّر تسجيل الدخول. تحقق من اتصال الإنترنت وحاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.')).toBeTruthy());
    expect(setSession).not.toHaveBeenCalled();
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('invoke ناجحة لكن setSession بترجع error → رسالة مخصوصة، من غير logActivity أو onLogin', async () => {
    invokeResult = SUCCESS;
    setSessionResult = { error: { message: 'invalid token' } };
    const onLogin = vi.fn();
    render(React.createElement(LoginScreen, { onLogin }));
    fillAndSubmit('lawyer@sanad.test', 'secret123');
    await waitFor(() => expect(screen.getByText('تعذّر إتمام تسجيل الدخول. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.')).toBeTruthy());
    expect(recordError).toHaveBeenCalledWith('office_login', 'invalid token');
    expect(logActivity).not.toHaveBeenCalled();
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('أثناء الانتظار: الزرار بيتعطّل ونصه بيتغيّر لـ "جاري التحقق..."', async () => {
    let resolveInvoke: (v: InvokeResult) => void = () => {};
    invokeImpl = () => new Promise((resolve) => { resolveInvoke = resolve; });
    const onLogin = vi.fn();
    render(React.createElement(LoginScreen, { onLogin }));
    const { btn } = fillAndSubmit('lawyer@sanad.test', 'secret123');

    await waitFor(() => expect(screen.getByText('جاري التحقق...')).toBeTruthy());
    expect((btn as HTMLButtonElement).disabled).toBe(true);

    resolveInvoke(SUCCESS);
    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
  });

  it('زرار إظهار كلمة السر بيبدّل النوع بين password وtext', () => {
    const onLogin = vi.fn();
    render(React.createElement(LoginScreen, { onLogin }));
    const passInput = screen.getByPlaceholderText('••••••••') as HTMLInputElement;
    expect(passInput.type).toBe('password');
    const toggleBtn = passInput.parentElement!.querySelector('button') as HTMLButtonElement;
    fireEvent.click(toggleBtn);
    expect(passInput.type).toBe('text');
    fireEvent.click(toggleBtn);
    expect(passInput.type).toBe('password');
  });

  it('محاولة تانية ناجحة بعد فشل أول → رسالة الخطأ القديمة بتختفي', async () => {
    invokeResult = { data: { error: 'بيانات الدخول غير صحيحة. تحقق من الإيميل وكلمة السر.' }, error: null };
    const onLogin = vi.fn();
    render(React.createElement(LoginScreen, { onLogin }));
    fillAndSubmit('lawyer@sanad.test', 'wrongpass');
    await waitFor(() => expect(screen.getByText('بيانات الدخول غير صحيحة. تحقق من الإيميل وكلمة السر.')).toBeTruthy());

    invokeResult = SUCCESS;
    fillAndSubmit('lawyer@sanad.test', 'secret123');
    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('بيانات الدخول غير صحيحة. تحقق من الإيميل وكلمة السر.')).toBeNull();
  });
});
