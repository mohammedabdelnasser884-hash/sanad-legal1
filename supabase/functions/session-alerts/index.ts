import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ── حماية: الفانكشن دي متصممة تتنادى من Scheduled Trigger فقط
// (cron)، ومكانتش عندها أي تحقق هوية — أي حد يعرف الـ URL بتاعها
// كان يقدر ينده عليها POST ويشغّل إرسال رسائل تيليجرام لكل المكاتب
// بشكل متكرر (إزعاج/استهلاك rate limit بتاع Telegram API الحقيقي).
//
// الحل: سر ثابت (CRON_SECRET) لازم يتبعت في header اسمه x-cron-secret
// مطابق للقيمة المضبوطة في إعدادات الفانكشن. لازم تضبط نفس القيمة
// في إعداد الـ Scheduled Trigger (Supabase Dashboard → Edge Functions
// → session-alerts → Schedules → Headers) بعد نشر الكود ده.
const CRON_SECRET = Deno.env.get("SESSION_ALERTS_CRON_SECRET");
if (!CRON_SECRET) {
  throw new Error("SESSION_ALERTS_CRON_SECRET غير مضبوط في إعدادات الفانكشن — لا يمكن التشغيل بدونه");
}

const logError = async (action: string, details: string, tenantId: string | null = null) => {
  await supabase.from("activity_log").insert({
    user_name: "النظام التلقائي",
    action,
    details,
    entity_type: "telegram",
    tenant_id: tenantId,
    created_at: new Date().toISOString(),
  });
};

// إرسال رسالة تليجرام لبوت/مجموعة محددة (بتاعة مكتب معين)
const sendTg = async (token: string, chat: string, msg: string, tenantId: string | null): Promise<boolean> => {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: msg, parse_mode: "HTML" }),
    });
    const data = await res.json();
    if (!data.ok) {
      await logError("فشل إرسال تيليجرام", `الخطأ: ${data.description}`, tenantId);
      return false;
    }
    return true;
  } catch (err) {
    await logError("فشل إرسال تيليجرام", `استثناء: ${String(err)}`, tenantId);
    return false;
  }
};

const fmt = (d: Date) => d.toISOString().split("T")[0];

// تيليجرام بيرفض أي رسالة أطول من 4096 حرف
// لو الرسالة طويلة، بنقسمها على أجزاء وكل جزء يتبعت لوحده
const TG_LIMIT = 4000; // هامش أمان تحت الـ 4096
const sendTgChunked = async (token: string, chat: string, header: string, items: string[], tenantId: string | null): Promise<void> => {
  if (items.length === 0) {
    await sendTg(token, chat, header, tenantId);
    return;
  }

  let chunk = header;
  let partNum = 1;

  for (const item of items) {
    if ((chunk + item).length > TG_LIMIT) {
      await sendTg(token, chat, chunk, tenantId);
      partNum++;
      chunk = `(تابع ${partNum})\n━━━━━━━━━━━━━━━━━━━━\n\n` + item;
    } else {
      chunk += item;
    }
  }
  if (chunk.trim().length > 0) {
    await sendTg(token, chat, chunk, tenantId);
  }
};

const SESSION_COLS = "session_date, description, result, title, case_number, court, plaintiff, defendant, case_id, tenant_id";

// البيانات المفروض تكون موجودة جوا case_sessions نفسها (title, court, plaintiff, defendant)
// لو جلسة قديمة من قبل التحديث وأعمدتها الجديدة فاضية، بنجيب بياناتها fallback من جدول cases
const sendSessionAlert = async (token: string, chat: string, sessions: any[], label: string, emoji: string, tenantId: string | null) => {
  const missingCaseIds = [
    ...new Set(
      sessions.filter((s: any) => !s.title && s.case_id).map((s: any) => s.case_id)
    ),
  ];

  let fallbackById: any = {};
  if (missingCaseIds.length > 0) {
    const { data: fallbackCases } = await supabase
      .from("cases")
      .select("id, title, case_number_official, court_name, plaintiff, defendant")
      .in("id", missingCaseIds);
    (fallbackCases || []).forEach((c: any) => { fallbackById[c.id] = c; });
  }

  const items = sessions.map((s: any, i: number) => {
    const fb = fallbackById[s.case_id] || {};
    const title      = s.title || fb.title;
    const caseNumber = s.case_number || fb.case_number_official;
    const court      = s.court || fb.court_name;
    const plaintiff  = s.plaintiff || fb.plaintiff;
    const defendant  = s.defendant || fb.defendant;

    let item = `${i + 1}. ⚖️ <b>${title || "—"}</b>\n`;
    item += `   📋 رقم القيد: ${caseNumber || "—"}\n`;
    item += `   🏛 المحكمة: ${court || "—"}\n`;
    item += `   📆 تاريخ الجلسة: ${s.session_date}\n`;
    if (plaintiff)      item += `   🟢 المدعي: ${plaintiff}\n`;
    if (defendant)      item += `   🔴 المدعى عليه: ${defendant}\n`;
    if (s.description)  item += `   📝 ${s.description}\n`;
    item += "\n";
    return item;
  });

  const header = `${emoji} <b>${label}</b>\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  await sendTgChunked(token, chat, header, items, tenantId);
};

// ─────────────────────────────────────────────
// تشغيل الفحص اليومي لمكتب واحد (tenant) — بياناته وبوته الخاص بيه
// ─────────────────────────────────────────────
const runForTenant = async (office: any, type: string) => {
  const tenantId = office.tenant_id;
  const token = office.token;
  const chat = office.chat;

  if (!token || !chat) {
    // المكتب ده مش ضابط بوت التذكيرات اليومية — تخطّاه بصمت
    return;
  }

  const today = new Date();
  const todayStr = fmt(today);
  const tmrwStr  = fmt(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
  const day2Str  = fmt(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2));

  // ══════════════════════════════════════════
  // ── ٨ صبح: جلسات ومهام الغد وبعد غد ──
  // ══════════════════════════════════════════
  if (type === "morning") {

    // ── جلسات ──
    const { data: sessions, error: sErr } = await supabase
      .from("case_sessions")
      .select(SESSION_COLS)
      .eq("tenant_id", tenantId)
      .in("session_date", [tmrwStr, day2Str]);

    if (sErr) await logError("خطأ جلب جلسات الصبح", sErr.message, tenantId);

    const tmrwSess = (sessions || []).filter((s: any) => s.session_date === tmrwStr);
    const day2Sess = (sessions || []).filter((s: any) => s.session_date === day2Str);

    if (tmrwSess.length > 0) {
      await sendSessionAlert(token, chat, tmrwSess, `جلسات الغد ${tmrwStr}`, "🟡", tenantId);
    } else {
      await sendTg(token, chat, `🟡 <b>جلسات الغد ${tmrwStr}</b>\n━━━━━━━━━━━━━━━━━━━━\n\n✅ لا توجد جلسات مقررة للغد`, tenantId);
    }

    if (day2Sess.length > 0) {
      await sendSessionAlert(token, chat, day2Sess, `جلسات بعد غد ${day2Str}`, "🔵", tenantId);
    } else {
      await sendTg(token, chat, `🔵 <b>جلسات بعد غد ${day2Str}</b>\n━━━━━━━━━━━━━━━━━━━━\n\n✅ لا توجد جلسات مقررة بعد غد`, tenantId);
    }

    // ── مهام ──
    const { data: reminders, error: rErr } = await supabase
      .from("reminders")
      .select("*")
      .eq("tenant_id", tenantId)
      .in("due_date", [tmrwStr, day2Str])
      .eq("done", false);

    if (rErr) await logError("خطأ جلب مهام الصبح", rErr.message, tenantId);

    const tmrwRem = (reminders || []).filter((r: any) => r.due_date === tmrwStr);
    const day2Rem = (reminders || []).filter((r: any) => r.due_date === day2Str);

    if (tmrwRem.length > 0) {
      let msg = `🟡 <b>مهام الغد ${tmrwStr}</b>\n━━━━━━━━━━━━━━━━━━━━\n\n`;
      tmrwRem.forEach((r: any, i: number) => {
        msg += `${i + 1}. 📌 <b>${r.title}</b>\n`;
        if (r.notes) msg += `   📝 ${r.notes}\n`;
        msg += "\n";
      });
      await sendTg(token, chat, msg, tenantId);
    } else {
      await sendTg(token, chat, `🟡 <b>مهام الغد ${tmrwStr}</b>\n━━━━━━━━━━━━━━━━━━━━\n\n✅ لا توجد مهام مجدولة للغد`, tenantId);
    }

    if (day2Rem.length > 0) {
      let msg = `🔵 <b>مهام بعد غد ${day2Str}</b>\n━━━━━━━━━━━━━━━━━━━━\n\n`;
      day2Rem.forEach((r: any, i: number) => {
        msg += `${i + 1}. 📌 <b>${r.title}</b>\n`;
        if (r.notes) msg += `   📝 ${r.notes}\n`;
        msg += "\n";
      });
      await sendTg(token, chat, msg, tenantId);
    } else {
      await sendTg(token, chat, `🔵 <b>مهام بعد غد ${day2Str}</b>\n━━━━━━━━━━━━━━━━━━━━\n\n✅ لا توجد مهام مجدولة بعد غد`, tenantId);
    }
  }

  // ══════════════════════════════════════════
  // ── ٥ مساء: تنبيه مبكر الغد + فائت ──
  // ══════════════════════════════════════════
  if (type === "evening") {

    // ── جلسات الغد ──
    const { data: tmrwSessions, error: tsErr } = await supabase
      .from("case_sessions")
      .select(SESSION_COLS)
      .eq("tenant_id", tenantId)
      .eq("session_date", tmrwStr);

    if (tsErr) await logError("خطأ جلب جلسات المساء", tsErr.message, tenantId);

    if (tmrwSessions && tmrwSessions.length > 0) {
      await sendSessionAlert(token, chat, tmrwSessions, `⚡ تنبيه مبكر — جلسات الغد ${tmrwStr}`, "⚡", tenantId);
    } else {
      await sendTg(token, chat, `⚡ <b>تنبيه مبكر — جلسات الغد ${tmrwStr}</b>\n━━━━━━━━━━━━━━━━━━━━\n\n✅ لا توجد جلسات مقررة للغد`, tenantId);
    }

    // ── مهام الغد ──
    const { data: tmrwReminders, error: trErr } = await supabase
      .from("reminders")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("due_date", tmrwStr)
      .eq("done", false);

    if (trErr) await logError("خطأ جلب مهام المساء", trErr.message, tenantId);

    if (tmrwReminders && tmrwReminders.length > 0) {
      let msg = `⚡ <b>تنبيه مبكر — مهام الغد ${tmrwStr}</b>\n━━━━━━━━━━━━━━━━━━━━\n\n`;
      tmrwReminders.forEach((r: any, i: number) => {
        msg += `${i + 1}. 📌 <b>${r.title}</b>\n`;
        if (r.notes) msg += `   📝 ${r.notes}\n`;
        msg += "\n";
      });
      msg += `📲 افتح التطبيق للمراجعة.`;
      await sendTg(token, chat, msg, tenantId);
    } else {
      await sendTg(token, chat, `⚡ <b>تنبيه مبكر — مهام الغد ${tmrwStr}</b>\n━━━━━━━━━━━━━━━━━━━━\n\n✅ لا توجد مهام مجدولة للغد`, tenantId);
    }

    // ── جلسات فائتة بدون نتيجة ──
    const { data: allPastSessions, error: osErr } = await supabase
      .from("case_sessions")
      .select(SESSION_COLS)
      .eq("tenant_id", tenantId)
      .lt("session_date", todayStr);

    if (osErr) await logError("خطأ جلب جلسات فائتة", osErr.message, tenantId);

    const overdueSessions = (allPastSessions || []).filter(
      (s: any) => !s.result || s.result.trim() === ""
    );

    // fallback: الجلسات القديمة قبل التحديث، أعمدتها الجديدة فاضية
    const missingCaseIds = [
      ...new Set(
        overdueSessions
          .filter((s: any) => !s.title && s.case_id)
          .map((s: any) => s.case_id)
      ),
    ];

    let fallbackById: any = {};
    if (missingCaseIds.length > 0) {
      const { data: fallbackCases } = await supabase
        .from("cases")
        .select("id, title, case_number_official, court_name, plaintiff, defendant")
        .in("id", missingCaseIds);
      (fallbackCases || []).forEach((c: any) => { fallbackById[c.id] = c; });
    }

    if (overdueSessions.length > 0) {
      const items = overdueSessions.map((s: any, i: number) => {
        const fb = fallbackById[s.case_id] || {};
        const title       = s.title || fb.title;
        const caseNumber  = s.case_number || fb.case_number_official;
        const court       = s.court || fb.court_name;
        const plaintiff   = s.plaintiff || fb.plaintiff;
        const defendant   = s.defendant || fb.defendant;

        let item = `${i + 1}. ⚖️ <b>${title || "—"}</b>\n`;
        item += `   📋 رقم القيد: ${caseNumber || "—"}\n`;
        item += `   🏛 المحكمة: ${court || "—"}\n`;
        if (plaintiff)      item += `   🟢 المدعي: ${plaintiff}\n`;
        if (defendant)      item += `   🔴 المدعى عليه: ${defendant}\n`;
        if (s.description)  item += `   📝 ${s.description}\n`;
        item += `   📆 تاريخ الجلسة: ${s.session_date}\n\n`;
        return item;
      });
      const header = `⚠️ <b>جلسات فائتة بدون نتيجة</b>\n━━━━━━━━━━━━━━━━━━━━\n\n`;
      await sendTgChunked(token, chat, header, items, tenantId);
      await sendTg(token, chat, `📲 افتح التطبيق وسجّل نتيجة كل جلسة.`, tenantId);
    } else {
      await sendTg(token, chat, `⚠️ <b>جلسات فائتة بدون نتيجة</b>\n━━━━━━━━━━━━━━━━━━━━\n\n✅ ممتاز! جميع الجلسات السابقة تم تسجيل نتائجها`, tenantId);
    }

    // ── مهام فائتة ──
    const { data: overdueReminders, error: orErr } = await supabase
      .from("reminders")
      .select("*")
      .eq("tenant_id", tenantId)
      .lt("due_date", todayStr)
      .eq("done", false);

    if (orErr) await logError("خطأ جلب مهام فائتة", orErr.message, tenantId);

    if (overdueReminders && overdueReminders.length > 0) {
      const items = overdueReminders.map((r: any, i: number) => {
        let item = `${i + 1}. 📌 <b>${r.title}</b>\n`;
        item += `   📅 كان المفروض: ${r.due_date}\n`;
        if (r.notes) item += `   📝 ${r.notes}\n`;
        item += "\n";
        return item;
      });
      const header = `⚠️ <b>مهام فائتة لم تُنجز</b>\n━━━━━━━━━━━━━━━━━━━━\n\n`;
      await sendTgChunked(token, chat, header, items, tenantId);
      await sendTg(token, chat, `📲 افتح التطبيق وأغلق المنجز أو حدّث التاريخ.`, tenantId);
    } else {
      await sendTg(token, chat, `⚠️ <b>مهام فائتة لم تُنجز</b>\n━━━━━━━━━━━━━━━━━━━━\n\n✅ رائع! لا توجد مهام متأخرة`, tenantId);
    }
  }
};

Deno.serve(async (req) => {
  const providedSecret = req.headers.get("x-cron-secret");
  if (providedSecret !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "غير مصرح" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    let type = "morning";
    try {
      const body = await req.json();
      if (body?.type) type = body.type;
    } catch (_) {}

    // جيب كل المكاتب اللي ضابطة بيانات بوت التذكيرات اليومية —
    // التوكن دلوقتي في Vault، فبنستخدم دالة دفعية بترجّع tenant_id +
    // التوكن مفكوك التشفير + الـ chat في نداء واحد بدل قراءة عمود
    // tg_daily_token الصريح مباشرة (راجع 09-telegram-token-vault-migration.sql).
    const { data: offices, error: offErr } = await supabase.rpc("get_all_daily_tg_configs");

    if (offErr) {
      await logError("خطأ جلب بيانات المكاتب", offErr.message);
      return new Response(JSON.stringify({ error: offErr.message }), { status: 500 });
    }

    if (!offices || offices.length === 0) {
      return new Response("لا يوجد أي مكتب ضابط بوت التذكيرات اليومية", { status: 200 });
    }

    // لكل مكتب، نفّذ الفحص وابعت على بوته
    for (const office of offices) {
      try {
        await runForTenant(office, type);
      } catch (err) {
        await logError("خطأ عام في معالجة مكتب", String(err), office.tenant_id);
      }
    }

    return new Response(`تم تنفيذ "${type}" لـ ${offices.length} مكتب`, { status: 200 });

  } catch (err) {
    await logError("خطأ عام في session-alerts", String(err));
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
