import React from 'react';
import ReactDOM from 'react-dom';

interface CustomSelectOption {
    value: string;
    label: string;
}

interface CustomSelectProps {
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
    options: CustomSelectOption[];
    disabled?: boolean;
    /** optional extra inline styles on the trigger button */
    style?: React.CSSProperties;
}

const CustomSelect: React.FC<CustomSelectProps> = ({
    value, onChange, placeholder = 'Select...', options, disabled = false, style,
}) => {
    const [open, setOpen] = React.useState(false);
    const [dropRect, setDropRect] = React.useState<DOMRect | null>(null);
    const triggerRef = React.useRef<HTMLButtonElement>(null);

    // Close on outside click
    React.useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    // Recompute position on scroll / resize while open
    React.useEffect(() => {
        if (!open) return;
        const update = () => {
            if (triggerRef.current) setDropRect(triggerRef.current.getBoundingClientRect());
        };
        update();
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    }, [open]);

    const selected = options.find(o => o.value === value);

    const handleToggle = () => {
        if (disabled) return;
        if (!open && triggerRef.current) {
            setDropRect(triggerRef.current.getBoundingClientRect());
        }
        setOpen(o => !o);
    };

    const panel = open && dropRect ? ReactDOM.createPortal(
        <div
            style={{
                position: 'fixed',
                top: dropRect.bottom + 6,
                left: dropRect.left,
                width: dropRect.width,
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                zIndex: 99999,
                boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
                overflow: 'hidden auto',
                maxHeight: 240,
                animation: 'dropdownIn 0.15s ease',
            }}
        >
            {options.length === 0 ? (
                <div style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                    No options available
                </div>
            ) : options.map(opt => {
                const isSelected = opt.value === value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => { onChange(opt.value); setOpen(false); }}
                        style={{
                            width: '100%',
                            display: 'flex', alignItems: 'center',
                            justifyContent: 'space-between', gap: '0.5rem',
                            padding: '0.75rem 1rem',
                            background: isSelected ? 'rgba(16,185,129,0.1)' : 'transparent',
                            border: 'none', borderBottom: '1px solid var(--border)',
                            color: isSelected ? '#10b981' : 'var(--text-primary)',
                            fontSize: '0.9rem', fontFamily: 'inherit',
                            cursor: 'pointer', textAlign: 'left',
                            transition: 'background 0.1s',
                            boxSizing: 'border-box',
                        }}
                        onMouseOver={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(16,185,129,0.06)'; }}
                        onMouseOut={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                    >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {opt.label}
                        </span>
                        {isSelected && (
                            <svg width="14" height="14" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                                <path d="M2.5 6l2.5 2.5 4.5-5" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        )}
                    </button>
                );
            })}
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
                    gap: '0.5rem', padding: '0.65rem 0.9rem',
                    background: 'var(--bg-elevated)',
                    border: open ? '1px solid #10b981' : '1px solid var(--border)',
                    borderRadius: 10, cursor: disabled ? 'not-allowed' : 'pointer',
                    color: selected ? 'var(--text-primary)' : 'var(--text-dim)',
                    fontSize: '0.9rem', fontFamily: 'inherit', textAlign: 'left',
                    boxShadow: open ? '0 0 0 3px rgba(16,185,129,0.15)' : 'none',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    opacity: disabled ? 0.6 : 1,
                    boxSizing: 'border-box',
                    ...style,
                }}
            >
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selected ? selected.label : placeholder}
                </span>
                <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{
                        flexShrink: 0, opacity: 0.5,
                        transition: 'transform 0.2s',
                        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                >
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>
            {panel}
        </div>
    );
};

export default CustomSelect;
