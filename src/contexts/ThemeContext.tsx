import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const getKey = (userId?: string) => userId ? `cd-theme-${userId}` : 'cd-theme';

export const ThemeProvider: React.FC<{ userId?: string; children: React.ReactNode }> = ({ userId, children }) => {
    const [theme, setThemeState] = useState<Theme>(() => {
        const saved = localStorage.getItem(getKey(userId));
        return saved === 'light' ? 'light' : 'dark'; // default: dark
    });

    // When the userId changes (different user logs in), reload their saved theme preference
    useEffect(() => {
        const saved = localStorage.getItem(getKey(userId));
        const resolved: Theme = saved === 'light' ? 'light' : 'dark';
        setThemeState(resolved);
        document.documentElement.setAttribute('data-theme', resolved);
    }, [userId]);

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
        localStorage.setItem(getKey(userId), newTheme);
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
