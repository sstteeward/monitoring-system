import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Signed-out visitors (landing, login, signup) share one guest preference.
const storageKey = (userId?: string) => (userId ? `cd-theme-${userId}` : 'cd-theme-guest');

const readStoredTheme = (userId?: string): Theme | null => {
    try {
        const saved = localStorage.getItem(storageKey(userId));
        return saved === 'dark' || saved === 'light' ? saved : null;
    } catch {
        return null;
    }
};

const getSystemTheme = (): Theme =>
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

// Signed-in accounts default to light; a signed-out visitor follows the OS
// preference until they pick a theme themselves.
const resolveTheme = (userId?: string): Theme =>
    readStoredTheme(userId) ?? (userId ? 'light' : getSystemTheme());

export const ThemeProvider: React.FC<{ userId?: string; children: React.ReactNode }> = ({ userId, children }) => {
    const [theme, setThemeState] = useState<Theme>(() => resolveTheme(userId));

    // When the userId changes (different user logs in, or logout), reload the matching preference
    useEffect(() => {
        const resolved = resolveTheme(userId);
        setThemeState(resolved);
        document.documentElement.setAttribute('data-theme', resolved);
    }, [userId]);

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
        try {
            localStorage.setItem(storageKey(userId), newTheme);
        } catch {
            // Storage can be unavailable (private mode); the theme still applies for this session.
        }
        document.documentElement.setAttribute('data-theme', newTheme);
    };

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    // Keep following the OS while a signed-out visitor has not chosen a theme yet.
    useEffect(() => {
        if (userId) return;
        const media = window.matchMedia?.('(prefers-color-scheme: dark)');
        if (!media) return;
        const handleChange = () => {
            if (!readStoredTheme(undefined)) setThemeState(getSystemTheme());
        };
        media.addEventListener('change', handleChange);
        return () => media.removeEventListener('change', handleChange);
    }, [userId]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
