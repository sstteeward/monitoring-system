import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom';

export interface CustomSelectOption {
    value: string;
    label: string;
    code?: string;
}

interface CustomSelectProps {
    value: string;
    onChange: (val: string, code?: string) => void;
    placeholder?: string;
    options: CustomSelectOption[];
    disabled?: boolean;
    searchable?: boolean;
    searchPlaceholder?: string;
    style?: React.CSSProperties;
    showClear?: boolean;
}

const DROPDOWN_MAX_HEIGHT = 320;
const DROPDOWN_GAP = 6;
const SCROLL_BUFFER_PADDING = 8;

const CustomSelect: React.FC<CustomSelectProps> = ({
    value,
    onChange,
    placeholder = 'Select...',
    options,
    disabled = false,
    searchable = false,
    searchPlaceholder = 'Search...',
    style,
    showClear = false,
}) => {
    const [open, setOpen] = useState(false);
    const [dropRect, setDropRect] = useState<DOMRect | null>(null);
    const [search, setSearch] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const [position, setPosition] = useState<'down' | 'up'>('down');
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const calculatePosition = useCallback(() => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom - DROPDOWN_GAP;
        const spaceAbove = rect.top - DROPDOWN_GAP;
        const maxHeight = Math.min(DROPDOWN_MAX_HEIGHT, Math.max(spaceBelow, spaceAbove));
        const needsUpward = spaceBelow < DROPDOWN_MAX_HEIGHT && spaceAbove > spaceBelow;
        setPosition(needsUpward ? 'up' : 'down');
        setDropRect(rect);
    }, []);

    const getMaxHeight = useCallback(() => {
        if (!dropRect) return DROPDOWN_MAX_HEIGHT;
        const spaceBelow = window.innerHeight - dropRect.bottom - DROPDOWN_GAP;
        const spaceAbove = dropRect.top - DROPDOWN_GAP;
        if (position === 'down') {
            return Math.min(DROPDOWN_MAX_HEIGHT, Math.max(spaceBelow, 120));
        }
        return Math.min(DROPDOWN_MAX_HEIGHT, Math.max(spaceAbove, 120));
    }, [dropRect, position]);

    useEffect(() => {
        if (!open) return;
        calculatePosition();
        const handler = (e: MouseEvent) => {
            if (
                triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
                panelRef.current && !panelRef.current.contains(e.target as Node)
            ) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open, calculatePosition]);

    useEffect(() => {
        if (!open) return;
        const update = () => calculatePosition();
        update();
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    }, [open, calculatePosition]);

    const selected = options.find(o => o.value === value);
    const filteredOptions = useMemo(() => {
        if (!searchable) return options;
        const q = search.trim().toLowerCase();
        if (!q) return options;
        return options.filter(opt => opt.label.toLowerCase().includes(q));
    }, [options, searchable, search]);

    useEffect(() => {
        if (!open) return;
        setActiveIndex(0);
    }, [open, search]);

    useEffect(() => {
        if (!open || !searchable) return;
        const handler = (event: KeyboardEvent) => {
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex(i => Math.min(i + 1, filteredOptions.length - 1));
            }
            if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex(i => Math.max(i - 1, 0));
            }
            if (event.key === 'Enter' && filteredOptions[activeIndex]) {
                event.preventDefault();
                onChange(filteredOptions[activeIndex].value, filteredOptions[activeIndex].code);
                setOpen(false);
                setSearch('');
            }
            if (event.key === 'Escape') {
                setOpen(false);
                setSearch('');
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [activeIndex, filteredOptions, onChange, open, searchable]);

    useEffect(() => {
        if (open && searchable && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [open, searchable]);

    useEffect(() => {
        if (!open || !scrollContainerRef.current) return;
        const timer = setTimeout(() => {
            const selectedEl = scrollContainerRef.current?.querySelector('[data-selected="true"]');
            if (selectedEl) {
                selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
                scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }, 30);
        return () => clearTimeout(timer);
    }, [open, filteredOptions]);

    const handleToggle = () => {
        if (disabled) return;
        if (!open) {
            calculatePosition();
        }
        setOpen(o => !o);
        if (!open) setSearch('');
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange('', '');
    };

    const maxHeight = getMaxHeight();

    const panel = open && dropRect ? ReactDOM.createPortal(
        <div
            ref={panelRef}
            style={{
                position: 'fixed',
                top: position === 'down' ? dropRect.bottom + DROPDOWN_GAP : undefined,
                bottom: position === 'up' ? window.innerHeight - dropRect.top + DROPDOWN_GAP : undefined,
                left: dropRect.left,
                width: dropRect.width,
                minWidth: dropRect.width,
                maxHeight: maxHeight,
                borderRadius: 12,
                zIndex: 99999,
                boxShadow: '0 12px 32px rgba(0,0,0,0.12), 0 0 0 1px rgba(16,185,129,0.1)',
                animation: 'dropdownIn 0.15s ease',
                background: '#ffffff',
                border: '1px solid rgba(15, 118, 110, 0.14)',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            {searchable && (
                <div style={{ padding: '0.65rem 0.75rem', borderBottom: '1px solid rgba(15, 118, 110, 0.12)', background: '#f8fffd', flexShrink: 0 }}>
                    <div style={{ position: 'relative' }}>
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{
                                position: 'absolute',
                                left: '0.75rem',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                color: 'var(--text-dim)',
                                pointerEvents: 'none',
                            }}
                        >
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                            ref={searchInputRef}
                            autoFocus
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder={searchPlaceholder}
                            style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                border: '1px solid rgba(15,118,110,0.2)',
                                borderRadius: 8,
                                padding: '0.6rem 0.75rem 0.6rem 2.5rem',
                                fontSize: '0.85rem',
                                color: 'var(--text-primary)',
                                background: '#fff',
                                outline: 'none',
                            }}
                        />
                    </div>
                </div>
            )}
            {filteredOptions.length === 0 ? (
                <div style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-dim)', textAlign: 'center', flexShrink: 0 }}>
                    {searchable && search ? 'No matches found' : 'No options available'}
                </div>
            ) : (
                <div
                    ref={scrollContainerRef}
                    style={{
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        flex: '1 1 auto',
                        minHeight: 0,
                        maxHeight: '100%',
                        paddingBottom: SCROLL_BUFFER_PADDING,
                    }}
                >
                    {filteredOptions.map((opt, idx) => {
                        const isSelected = opt.value === value;
                        const isActive = idx === activeIndex;
                        return (
                            <button
                                key={opt.value}
                                type="button"
                                data-selected={isSelected}
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => { onChange(opt.value, opt.code); setOpen(false); setSearch(''); }}
                                style={{
                                    width: '100%',
                                    display: 'flex', alignItems: 'center',
                                    justifyContent: 'space-between', gap: '0.5rem',
                                    padding: '0.75rem 1rem',
                                    background: isSelected ? 'rgba(16,185,129,0.1)' : isActive ? 'rgba(16,185,129,0.06)' : 'transparent',
                                    border: 'none',
                                    borderBottom: `1px solid rgba(15,118,110,0.08)`,
                                    color: isSelected ? '#0f766e' : 'var(--text-primary)',
                                    fontSize: '0.9rem',
                                    fontFamily: 'inherit',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    transition: 'background 0.1s',
                                    boxSizing: 'border-box',
                                }}
                                onMouseOver={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(16,185,129,0.06)'; }}
                                onMouseOut={e => { if (!isSelected && !isActive) e.currentTarget.style.background = 'transparent'; }}
                            >
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                    {opt.label}
                                </span>
                                {isSelected && (
                                    <svg width="16" height="16" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, marginLeft: '0.5rem' }}>
                                        <path d="M2.5 6l2.5 2.5 4.5-5" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>,
        document.body
    ) : null;

    return (
        <div style={{ position: 'relative', width: '100%' }}>
            <button
                ref={triggerRef}
                type="button"
                disabled={disabled}
                onClick={handleToggle}
                style={{
                    width: '100%',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: '0.5rem', padding: '0.7rem 0.9rem',
                    background: 'var(--bg-elevated)',
                    border: open ? '1px solid #10b981' : '1px solid var(--border)',
                    borderRadius: 10,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    color: selected ? 'var(--text-primary)' : 'var(--text-dim)',
                    fontSize: '0.9rem',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                    boxShadow: open ? '0 0 0 3px rgba(16,185,129,0.15)' : 'none',
                    transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
                    opacity: disabled ? 0.6 : 1,
                    boxSizing: 'border-box',
                    ...style,
                }}
            >
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selected ? selected.label : placeholder}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    {showClear && value && (
                        <button
                            type="button"
                            onClick={handleClear}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                padding: '0.2rem',
                                cursor: 'pointer',
                                color: 'var(--text-dim)',
                                display: 'flex',
                                borderRadius: 4,
                                transition: 'color 0.15s, background 0.15s',
                            }}
                            onMouseOver={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,64,64,0.1)'; }}
                            onMouseOut={e => { e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.background = 'transparent'; }}
                            aria-label="Clear selection"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    )}
                    <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{
                            flexShrink: 0,
                            opacity: 0.5,
                            transition: 'transform 0.2s',
                            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                        }}
                    >
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </div>
            </button>
            {panel}
        </div>
    );
};

export default CustomSelect;