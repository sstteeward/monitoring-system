import React, { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import "./AuthSignup.css"; // Reuse auth styles

const EyeIcon = () => (
    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="eye-icon">
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);

const EyeOffIcon = () => (
    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="eye-icon closed">
        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
        <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
        <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
);

export default function UpdatePasswordView({ onComplete }: { onComplete: () => void }) {
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setMessage(null);

        if (password.length < 8) {
            setError("Password must be at least 8 characters.");
            return;
        }

        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setIsSubmitting(true);
        try {
            const { error: updateError } = await supabase.auth.updateUser({
                password: password
            });

            if (updateError) throw updateError;
            
            setMessage("Password updated successfully!");
            setTimeout(async () => {
                await supabase.auth.signOut();
                onComplete();
                window.location.href = '/login';
            }, 2000);
        } catch (err: any) {
            setError(err.message || String(err));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-card" style={{ maxWidth: '400px', flexDirection: 'column' }}>
                <div className="auth-form-wrapper" style={{ padding: '2.5rem 2rem', width: '100%', maxWidth: '100%' }}>
                    <div className="card-header" style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
                        <h2>Update Password</h2>
                        <p className="subtitle" style={{ marginTop: '0.5rem' }}>Enter your new password below.</p>
                    </div>

                    <form className="auth-form" onSubmit={handleUpdate} noValidate>
                        <div className="form-scrollable" style={{ gap: '1.25rem' }}>
                            <label className="full-width">
                                New Password *
                                <div className="password-input-wrapper">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        value={password}
                                        onChange={e => {
                                            setPassword(e.target.value);
                                            setError(null);
                                        }}
                                        placeholder="Min 8 characters"
                                    />
                                    <button 
                                        type="button" 
                                        className="password-toggle-btn" 
                                        onClick={() => setShowPassword(!showPassword)}
                                        tabIndex={-1}
                                    >
                                        {showPassword ? <EyeIcon /> : <EyeOffIcon />}
                                    </button>
                                </div>
                            </label>

                            <label className="full-width">
                                Confirm Password *
                                <div className="password-input-wrapper">
                                    <input
                                        type={showConfirm ? "text" : "password"}
                                        value={confirmPassword}
                                        onChange={e => {
                                            setConfirmPassword(e.target.value);
                                            setError(null);
                                        }}
                                        placeholder="Min 8 characters"
                                    />
                                    <button 
                                        type="button" 
                                        className="password-toggle-btn" 
                                        onClick={() => setShowConfirm(!showConfirm)}
                                        tabIndex={-1}
                                    >
                                        {showConfirm ? <EyeIcon /> : <EyeOffIcon />}
                                    </button>
                                </div>
                            </label>

                            {error && <div className="error" style={{ textAlign: 'center' }}>{error}</div>}
                            {message && <div className="info-msg">{message}</div>}

                            <div className="cta-row" style={{ marginTop: '0.5rem' }}>
                                <button className="primary" type="submit" disabled={isSubmitting}>
                                    {isSubmitting ? "Updating..." : "Update Password"}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
