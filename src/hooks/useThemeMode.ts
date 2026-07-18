import { useState, useEffect } from 'react';

// ─────────────────────────────────────────────────────────
//  useThemeMode — منقول حرفيًا من App.tsx (state + effect + toggle
//  الخاصين بالثيم dark/light). صفر تغيير في المنطق أو الترتيب.
// ─────────────────────────────────────────────────────────
export function useThemeMode() {
    const [darkMode, setDarkMode] = useState(() => {
        const saved = localStorage.getItem('sanad_theme');
        if (saved) return saved === 'dark';
        return true;
    });

    useEffect(() => {
        const html = document.documentElement;
        if (darkMode) { html.classList.remove('light'); localStorage.setItem('sanad_theme', 'dark'); }
        else          { html.classList.add('light');    localStorage.setItem('sanad_theme', 'light'); }
    }, [darkMode]);

    const toggleTheme = () => setDarkMode((p) => !p);

    return { darkMode, toggleTheme };
}
