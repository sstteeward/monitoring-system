import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);


export const ThemeProvider: React.FC<{ userId?: string; children: React.ReactNode }> = ({ userId, children }) => {
    const [theme, setThemeState] = useState<Theme>(() => {
        if (!userId) return 'light';
        const saved = localStorage.getItem(`cd-theme-${userId}`);
        return saved === 'dark' ? 'dark' : 'light'; // default: light
    });

    // When the userId changes (different user logs in), reload their saved theme preference
    useEffect(() => {
        let resolved: Theme = 'light';
        if (userId) {
            const saved = localStorage.getItem(`cd-theme-${userId}`);
            if (saved === 'dark') resolved = 'dark';
        }
        setThemeState(resolved);
        document.documentElement.setAttribute('data-theme', resolved);
    }, [userId]);

    const setTheme = (newTheme: Theme) => {
        if (!userId) return; // Prevent setting theme when logged out
        setThemeState(newTheme);
        localStorage.setItem(`cd-theme-${userId}`, newTheme);
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
