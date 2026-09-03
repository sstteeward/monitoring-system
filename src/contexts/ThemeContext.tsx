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

// Light is the default everywhere — signed in or out. The OS preference is
// deliberately ignored: the portal opens light until someone picks dark, and
// that choice is then remembered per account (and once for guests).
const DEFAULT_THEME: Theme = 'light';

const resolveTheme = (userId?: string): Theme => readStoredTheme(userId) ?? DEFAULT_THEME;

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
