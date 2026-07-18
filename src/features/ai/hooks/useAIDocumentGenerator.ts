import { useState } from 'react';
import { toast } from '../../../shared/lib/notifications';
import { escapeHtml } from '../../../shared/lib/sanitize';
import { recordError } from '../../../systemHealth';
import { PDF_FONT_FAMILY, PDF_FONT_LINK } from '../../../shared/lib/pdf';
import type { CountryConfig } from '../../../constants';
import type { ProfileRow } from '../../../types';
import type { MappedCase } from '../../../hooks/useAppData';
import { DOC_TEMPLATES } from './aiAssistantTypes';
import type { AIDocFields, AIMessage, LegalArticle } from './aiAssistantTypes';

// ─────────────────────────────────────────────────────────
//  useAIDocumentGenerator — منقول حرفيًا من useAIAssistant.ts (دفعة 6):
//  docType/docFields/generatedDoc/generatingDoc/copied/sf +
//  generateDocument + copyDoc/printDoc/downloadPDF.
//  صفر تغيير في المنطق أو الصياغة (بما في ذلك تعليقات escapeHtml الأمنية).
// ─────────────────────────────────────────────────────────
interface UseAIDocumentGeneratorParams {
    profile: ProfileRow | null;
    activeCfg: CountryConfig;
    today: string;
    selectedCase: MappedCase | null;
    hasKey: boolean | null;
    setShowKeyInput: (v: boolean) => void;
    retrieveLegalArticles: (query: string) => Promise<LegalArticle[]>;
    buildLegalContextBlock: (articles: LegalArticle[] | null | undefined, forDocument?: boolean) => string;
    callAI: (prompt: string | null, history: AIMessage[] | null, legalContextBlock?: string) => Promise<string>;
}

export function useAIDocumentGenerator({
    profile, activeCfg, today, selectedCase, hasKey, setShowKeyInput,
    retrieveLegalArticles, buildLegalContextBlock, callAI,
}: UseAIDocumentGeneratorParams) {
    const [docType, setDocType] = useState('مذكرة_دفاع');
    const [docFields, setDocFields] = useState<AIDocFields>({
        plaintiff:'', plaintiffRole:'', defendant:'', defendantRole:'', caseNumber:'', court:'', subject:'', facts:'', claims:'', lawyerName: profile?.full_name||''
    });
    const [generatedDoc, setGeneratedDoc] = useState('');
    const [generatingDoc, setGeneratingDoc] = useState(false);
    const [copied, setCopied] = useState(false);

    const sf=(k: keyof AIDocFields, v: string)=>setDocFields((p: AIDocFields) =>({...p,[k]:v}));

    const generateDocument = async () => {
        if (!hasKey) { setShowKeyInput(true); return; }
        setGeneratingDoc(true);
        setGeneratedDoc('');
        // ✅ اتشال .type|| الميتة بموافقة جيمي — case_type هو العمود الحقيقي.
        const caseInfo = selectedCase
            ? `القضية: ${selectedCase.title}\nالمحكمة: ${selectedCase.court}\nالنوع: ${selectedCase.type}`
            : '';
        const isMemo = docType === 'مذكرة_دفاع';
        const memoHeader = `سَنَد
المحامي: ${docFields.lawyerName||profile?.full_name||'المحامي'}
────────────────────────────
مذكرة دفاع
────────────────────────────
مقدمة من: ${docFields.plaintiff}${docFields.plaintiffRole?' — بصفته: '+docFields.plaintiffRole:''}
ضـد: ${docFields.defendant}${docFields.defendantRole?' — بصفته: '+docFields.defendantRole:''}
رقم الدعوى: ${docFields.caseNumber||selectedCase?.number||'—'}
المحكمة المختصة: ${docFields.court||selectedCase?.court||activeCfg.courts[0]}
الجلسة المحددة: ${today}
الموضوع: ${docFields.subject}
────────────────────────────`;

        const prompt = isMemo ? `أنت محامٍ خبير في قوانين ${activeCfg.name}. الترويسة وبيانات القضية جاهزة أدناه — المطلوب منك فقط أن تكمل المذكرة بعدها مباشرةً بالأقسام الآتية بالترتيب، بلغة قانونية رسمية رصينة، بدون أي تعليق أو شرح خارج نص المذكرة:

${memoHeader}

اكتب بعد هذا السطر مباشرةً:

أولاً — الوقائع:
[فقرة وقائع مفصلة ومنظمة بناءً على: ${docFields.facts}]

ثانياً — الدفوع القانونية:
[دفوع موضوعية وشكلية مرقّمة (أولاً، ثانياً، ثالثاً، رابعاً...) تشمل: الدفع الرئيسي، الدفع الاحتياطي، أي دفع شكلي أو إجرائي — بصياغة قانونية رصينة]

ثالثاً — الأسانيد القانونية:
[استشهاد صريح بمواد ${activeCfg.referenceCode} وأحكام محكمة النقض/التمييز ذات الصلة بالنزاع، مرقّمة بنفس الترتيب]

رابعاً — بناءً عليه:
بناءً على ما تقدم، يلتمس الحاضر عن موكله الحكم بـ:
[الطلبات الختامية بناءً على: ${docFields.claims}]

${activeCfg.closing}
المحامي / ${docFields.lawyerName||profile?.full_name||'المحامي'}
التاريخ: ${today}
${caseInfo}

تعليمات الصياغة: لا تُعد كتابة الترويسة أو بيانات القضية — ابدأ من "أولاً — الوقائع:" مباشرةً. لا تضع عناوين بين ** **. العناوين تُكتب هكذا: "أولاً — الوقائع:" فقط.`
        : ('أنشئ '+(DOC_TEMPLATES[docType]?.label||'')+' قانونية كاملة ورسمية باللغة العربية بالصياغة الرسمية المعتمدة في '+activeCfg.name+' وفق '+activeCfg.legalSystem+'\n\nترويسة المستند:\n'+activeCfg.docHeader+'\n'+activeCfg.greeting+'\n\nبيانات المستند:\n'+(docType==='توكيل_رسمي'?('الموكِّل: '+docFields.plaintiff+'\nالموكَّل (المحامي): '+(docFields.lawyerName||profile?.full_name||'المحامي')+'\nموضوع التوكيل: '+docFields.subject+'\nرقم القضية: '+(docFields.caseNumber||'—')+'\nالمحكمة: '+(docFields.court||selectedCase?.court||'—')):('الموكل: '+docFields.plaintiff+(docFields.plaintiffRole?' (بصفته: '+docFields.plaintiffRole+')':'')+'\nالخصم: '+docFields.defendant+(docFields.defendantRole?' (بصفته: '+docFields.defendantRole+')':'')+'\nرقم القضية: '+(docFields.caseNumber||selectedCase?.number||'—')+'\nالمحكمة: '+(docFields.court||selectedCase?.court||activeCfg.courts[0]||'—')+'\nموضوع '+(DOC_TEMPLATES[docType]?.label||'')+': '+docFields.subject+'\nالوقائع والأسانيد: '+docFields.facts+'\nالطلبات: '+docFields.claims))+'\n\n'+caseInfo+'\n\nتعليمات الصياغة القانونية الاحترافية:\n١. ابدأ بـ '+(activeCfg.name==='المملكة العربية السعودية'?'البسملة ثم ':'')+'المقدمة الرسمية المعتمدة في '+activeCfg.name+'\n٢. في صلب الوثيقة، استشهد صراحةً بنصوص المواد القانونية حرفياً مع ذكر: اسم القانون + رقمه + سنته\n٣. أضف أي إسناد قضائي ذي صلة من محاكم '+activeCfg.name+' مع: رقم الطعن والسنة والمبدأ\n٤. الطلبات الختامية تكون محددة وقانونية\n٥. اختم بـ "'+activeCfg.closing+'" ثم توقيع المحامي والتاريخ\n٦. اكتب الوثيقة فقط — لا تضف أي شرح أو تعليق خارجها');
        try {
            const retrievalQuery = [docFields.subject, docFields.facts, docFields.claims].filter(Boolean).join(' — ');
            const retrieved = retrievalQuery ? await retrieveLegalArticles(retrievalQuery) : [];
            const legalContextBlock = buildLegalContextBlock(retrieved, true);
            const reply = await callAI(prompt, null, legalContextBlock);
            setGeneratedDoc(isMemo ? memoHeader + '\n\n' + reply : reply);
        } catch(e) {
            const _msg = e instanceof Error ? e.message : String(e);
            recordError('ai_document_generate', _msg, {label:'توليد المستندات', message:'تعذّر توليد المستند. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.'});
            setGeneratedDoc('⚠️ تعذّر توليد المستند. حاول مرة أخرى. لو المشكلة استمرت، تواصل مع الدعم.');
        }
        setGeneratingDoc(false);
    };

    const copyDoc = () => {
        navigator.clipboard?.writeText(generatedDoc).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2500);});
    };

    const printDoc = () => {
        const w = window.open('','_blank');
        if (!w) return;
        // ⚠️ generatedDoc نص حر (من مدخلات المستخدم ورد الـ AI) ولازم يتهرّب
        // قبل الدمج في HTML خام، وإلا ممكن ينفّذ كود في نافذة الطباعة (XSS).
        w.document.write(`<html dir="rtl"><head><meta charset="UTF-8"><title>مستند قانوني</title>${PDF_FONT_LINK}<style>body{font-family:${PDF_FONT_FAMILY};padding:40px;line-height:2.2;font-size:13px;color:#111;direction:rtl;text-align:right;}pre{white-space:pre-wrap;font-family:${PDF_FONT_FAMILY};}@page{margin:2cm;}.ai-disclaimer{margin-top:24px;padding-top:10px;border-top:1px solid #ccc;font-size:10px;color:#888;}</style></head><body><pre>${escapeHtml(generatedDoc)}</pre><div class="ai-disclaimer">⚠️ هذا المستند تمت صياغته بمساعدة الذكاء الاصطناعي ولا يُغني عن مراجعة محامٍ مرخّص قبل الاستخدام الرسمي.</div></body></html>`);
        w.document.close();
        w.document.fonts.ready.then(() => { setTimeout(() => { w.focus(); w.print(); }, 300); });
    };

    const downloadPDF = () => {
        try {
            const docLabel = escapeHtml(DOC_TEMPLATES[docType]?.label || 'مستند قانوني');
            const officeName = 'سَنَد'; // ثابت — لا يحتاج تهريب
            const lawyerName = escapeHtml(docFields.lawyerName || profile?.full_name || 'المحامي');

            // تحويل النص لـ HTML مع تمييز العناوين
            const lines = generatedDoc.split('\n');
            let htmlContent = '';
            lines.forEach((line: string) => {
                const t = line.trim();
                if (!t) { htmlContent += '<div style="height:10px"></div>'; return; }
                const isHeading = t.length < 70 && (
                    t.match(/^(أولاً|ثانياً|ثالثاً|رابعاً|خامساً|سادساً|سابعاً|بناءً|الوقائع|الدفاع|الطلبات|مقدمة|خاتمة|بسم الله|التوقيع|الاستشهاد)/) ||
                    t.endsWith(':') || t.startsWith('────')
                );
                const isDivider = t.startsWith('────');
                // ⚠️ t نص حر (من رد الـ AI/مدخلات المستخدم) — لازم escapeHtml
                // قبل إدراجه في HTML خام، وإلا ممكن ينفّذ كود في نافذة الطباعة.
                const safeT = escapeHtml(t);
                if (isDivider) {
                    htmlContent += `<hr style="border:none;border-top:1.5px solid #c8a84b;margin:14px 0;">`;
                } else if (isHeading) {
                    htmlContent += `<p style="font-weight:700;font-size:13px;color:#8b5e05;margin:14px 0 5px;border-bottom:1px solid #e8d5a0;padding-bottom:3px;">${safeT}</p>`;
                } else {
                    htmlContent += `<p style="margin:4px 0;font-size:12px;color:#1a1a1a;line-height:2;">${safeT}</p>`;
                }
            });

            const printHTML = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>${docLabel}</title>
${PDF_FONT_LINK}
<style>
  * { box-sizing: border-box; }
  body {
    font-family: ${PDF_FONT_FAMILY};
    direction: rtl;
    text-align: right;
    margin: 0;
    padding: 0;
    background: #fff;
    color: #1a1a1a;
    font-size: 13px;
    line-height: 2;
  }
  .page {
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    padding: 20mm 18mm 18mm 18mm;
    background: #fff;
    position: relative;
  }
  .header-box {
    text-align: center;
    border-bottom: 2.5px solid #c8a84b;
    padding-bottom: 14px;
    margin-bottom: 18px;
  }
  .office-name {
    font-size: 20px;
    font-weight: 700;
    color: #1a1a1a;
    letter-spacing: 0.5px;
  }
  .lawyer-name {
    font-size: 14px;
    color: #555;
    margin-top: 4px;
  }
  .doc-type-badge {
    display: inline-block;
    background: #c8a84b;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    padding: 3px 14px;
    border-radius: 20px;
    margin-top: 8px;
    letter-spacing: 0.5px;
  }
  .meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 20px;
    background: #fdf8ee;
    border: 1px solid #e8d5a0;
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 18px;
    font-size: 11.5px;
  }
  .meta-row { display: flex; gap: 6px; }
  .meta-label { color: #8b5e05; font-weight: 700; white-space: nowrap; }
  .meta-value { color: #1a1a1a; }
  .body-content { margin-top: 6px; }
  .footer {
    position: fixed;
    bottom: 14mm;
    left: 18mm;
    right: 18mm;
    text-align: center;
    font-size: 9px;
    color: #aaa;
    border-top: 0.5px solid #ddd;
    padding-top: 6px;
  }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { margin: 0; padding: 15mm 14mm 14mm 14mm; }
    .footer { position: fixed; bottom: 8mm; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="header-box">
    <div class="office-name">${officeName}</div>
    <div class="lawyer-name">المحامي / ${lawyerName}</div>
    <div class="doc-type-badge">${docLabel}</div>
  </div>

  <div class="meta-grid">
    <div class="meta-row"><span class="meta-label">المدعي:</span><span class="meta-value">${escapeHtml(docFields.plaintiff || '—')}</span></div>
    <div class="meta-row"><span class="meta-label">المدعى عليه:</span><span class="meta-value">${escapeHtml(docFields.defendant || '—')}</span></div>
    <div class="meta-row"><span class="meta-label">رقم الدعوى:</span><span class="meta-value">${escapeHtml(docFields.caseNumber || selectedCase?.number || '—')}</span></div>
    <div class="meta-row"><span class="meta-label">المحكمة:</span><span class="meta-value">${escapeHtml(docFields.court || selectedCase?.court || activeCfg?.courts?.[0] || '—')}</span></div>
    <div class="meta-row"><span class="meta-label">تاريخ الجلسة:</span><span class="meta-value">${escapeHtml(today)}</span></div>
    <div class="meta-row"><span class="meta-label">الموضوع:</span><span class="meta-value">${escapeHtml(docFields.subject || '—')}</span></div>
  </div>

  <div class="body-content">
    ${htmlContent}
  </div>

  <div style="margin-top:18px;padding-top:10px;border-top:1px dashed #ccc;font-size:9.5px;color:#999;line-height:1.7;">⚠️ صيغة هذا المستند بمساعدة الذكاء الاصطناعي ولا تُغني عن مراجعة محامٍ مرخّص قبل الاستخدام الرسمي.</div>

  <div class="footer">⚖️ سَنَد — نظام التشغيل القانوني — وثيقة سرية | ${today}</div>
</div>
<${'script'}>
  // انتظر تحميل الخط ثم اطبع
  document.fonts.ready.then(() => {
    setTimeout(() => { window.print(); }, 400);
  });
  window.onafterprint = () => window.close();
</${'script'}>
</body>
</html>`;

            const w = window.open('', '_blank');
            if (!w) { toast('❌ السماح بالنوافذ المنبثقة مطلوب', true); return; }
            w.document.write(printHTML);
            w.document.close();
            toast('📥 جاري فتح نافذة الطباعة/الحفظ...');
        } catch(err) {
            toast('❌ حدث خطأ، يرجى المحاولة مرة أخرى', true);
        }
    };

    return {
        docType, setDocType, docFields, sf,
        generatedDoc, setGeneratedDoc, generatingDoc,
        copied, copyDoc, printDoc, downloadPDF, generateDocument,
    };
}
