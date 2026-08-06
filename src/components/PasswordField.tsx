import React from 'react';
import './PasswordField.css';

interface PasswordFieldProps {
    value: string;
    onChange: (value: string) => void;
    onPaste?: React.ClipboardEventHandler<HTMLInputElement>;
    placeholder: string;
    visible: boolean;
    onVisibilityChange: () => void;
    inputStyle?: React.CSSProperties;
}

const PasswordField: React.FC<PasswordFieldProps> = ({
    value,
    onChange,
    onPaste,
    placeholder,
    visible,
    onVisibilityChange,
    inputStyle,
}) => (
    <div className="password-field">
        <input
            type={visible ? 'text' : 'password'}
            placeholder={placeholder}
            value={value}
            onChange={event => onChange(event.target.value)}
            onPaste={onPaste}
            style={{ ...inputStyle, marginBottom: 0, paddingRight: '3.5rem' }}
        />
        <button
            type="button"
            className="password-visibility-toggle"
            onClick={onVisibilityChange}
            aria-label={visible ? `Hide ${placeholder}` : `Show ${placeholder}`}
            aria-pressed={visible}
            title={visible ? 'Hide password' : 'Show password'}
        >
            {visible ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m3 3 18 18" />
                    <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                    <path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-3 4.1" />
                    <path d="M6.6 6.6C3.8 8.5 2 12 2 12s3 8 10 8a9.7 9.7 0 0 0 4.1-.9" />
                </svg>
            ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8S2 12 2 12Z" />
                    <circle cx="12" cy="12" r="3" />
                </svg>
            )}
        </button>
    </div>
);

export default PasswordField;
