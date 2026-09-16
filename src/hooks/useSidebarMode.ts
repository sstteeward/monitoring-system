import { useCallback, useEffect, useState } from 'react';

// The value is used directly as the `sidebar-mode-<value>` CSS class suffix:
//   'expanded' → always-full sidebar
//   'hover'    → collapsed rail that expands while hovered
export type SidebarMode = 'expanded' | 'hover';

const STORAGE_KEY = 'sidebarMode';

// Read the persisted sidebar mode. Defaults to 'expanded' (full sidebar).
const readStored = (): SidebarMode => {
    try {
        return localStorage.getItem(STORAGE_KEY) === 'hover' ? 'hover' : 'expanded';
    } catch {
        // Storage may be unavailable (private mode, blocked cookies) — fall back.
        return 'expanded';
    }
};

const writeStored = (mode: SidebarMode) => {
    try {
        localStorage.setItem(STORAGE_KEY, mode);
    } catch {
        // Ignore write failures; the in-memory state still drives this session.
    }
};

/**
 * Shared, persisted sidebar collapse state used by every dashboard so the
 * burger toggle applies across the whole site (survives navigation, reloads,
 * and syncs between tabs). Binary: expanded ↔ collapsed-on-hover.
 */
export function useSidebarMode(): [SidebarMode, () => void] {
    const [mode, setMode] = useState<SidebarMode>(readStored);

    const toggle = useCallback(() => {
        setMode(prev => {
            const next: SidebarMode = prev === 'expanded' ? 'hover' : 'expanded';
            writeStored(next);
            return next;
        });
    }, []);

    // Keep multiple open tabs in sync.
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key === STORAGE_KEY && e.newValue) {
                setMode(e.newValue === 'hover' ? 'hover' : 'expanded');
            }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    return [mode, toggle];
}
