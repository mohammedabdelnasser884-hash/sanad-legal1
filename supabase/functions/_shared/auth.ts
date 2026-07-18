// ══════════════════════════════════════════════════════
//  مشترك: التحقق من هوية الطالب (caller) قبل تنفيذ أي عملية
//  حساسة في الإيدج فانكشنز (مكلفة على API خارجي، أو كتابة بالـ
//  service_role). يمنع أي طلب anon مجهول من استهلاك الفانكشن.
// ══════════════════════════════════════════════════════

export interface CallerProfile {
  user_id: string;
  tenant_id: string | null;
  role?: string;
  is_active?: boolean;
  is_super_admin?: boolean;
}

export async function getAuthorizedCaller(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
  serviceRoleKey: string,
): Promise<{ caller: CallerProfile } | { error: string; status: number }> {
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader) return { error: 'الجلسة مطلوبة، سجّل الدخول من جديد', status: 401 };

  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: anonKey },
  });
  if (!userRes.ok) return { error: 'الجلسة منتهية، سجّل الدخول من جديد', status: 401 };
  const user = await userRes.json().catch(() => null);
  if (!user?.id) return { error: 'الجلسة منتهية، سجّل الدخول من جديد', status: 401 };

  const profRes = await fetch(
    `${supabaseUrl}/rest/v1/profiles?user_id=eq.${user.id}&select=user_id,tenant_id,role,is_active,is_super_admin&limit=1`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  );
  if (!profRes.ok) return { error: 'تعذر التحقق من الحساب', status: 500 };
  const rows = await profRes.json().catch(() => []);
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile) return { error: 'حساب غير معروف', status: 403 };
  if (profile.is_active === false) return { error: 'الحساب معطّل', status: 403 };

  return { caller: profile as CallerProfile };
}
