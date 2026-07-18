// ══════════════════════════════════════════════════════════════
//  إعدادات ESLint — فحص أساسي لأخطاء TypeScript الشائعة + قواعد
//  React Hooks (rules-of-hooks و exhaustive-deps تحديدًا).
//
//  الهدف الأساسي من الإضافة دي: كشف مشاكل الـ dependency arrays في
//  useEffect/useCallback/useMemo تلقائيًا وقت الكتابة، بدل ما تتكشف
//  بالصدفة وانت بتقرا الكود يدويًا (زي حالة useAutoLogout.ts اللي
//  اتكتشفت في المراجعة).
//
//  التشغيل: npm run lint
//  ⚠️ محتاج npm install الأول عشان يجيب الحزم الجديدة المضافة في
//  package.json (eslint, typescript-eslint, eslint-plugin-react-hooks).
// ══════════════════════════════════════════════════════════════
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'supabase/functions'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // ── 'no-explicit-any' بقت 'error' — أي `any`/`as any` جديد هيوقف
      // الـ lint (وبالتالي الـ build، بعد ربط lint بـ build script في
      // package.json) بدل ما يفضل مجرد تحذير ممكن يتفوت. ── 15 يوليو 2026
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',

      // ── القواعد الأهم فعليًا (تفضل شغالة بكامل قوتها) ──
      'react-hooks/rules-of-hooks': 'error',   // استخدام غلط للـ hooks (شرط/loop)
      'react-hooks/exhaustive-deps': 'warn',   // dependency array ناقصة/غلط

      'react-refresh/only-export-components': 'off',
    },
  },
);
