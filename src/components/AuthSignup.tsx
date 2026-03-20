import React, { useEffect, useState } from "react";
import "./AuthSignup.css";
import leftPhoto from "../assets/dumaguete (1).jpg";
import { signUp, signIn, resetPasswordForEmail } from "../services/auth";
import { supabase } from "../lib/supabaseClient";

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

export default function AuthSignup() {
    const [mode, setMode] = useState<"signup" | "login" | "forgot">("login");

    // Signup state
    const [firstName, setFirstName] = useState("");
    const [middleName, setMiddleName] = useState("");
    const [lastName, setLastName] = useState("");
    const [signupEmail, setSignupEmail] = useState("");
    const [signupPassword, setSignupPassword] = useState("");
    const [signupConfirm, setSignupConfirm] = useState("");
    const [emailVerified, setEmailVerified] = useState(false);
    const [otpSent, setOtpSent] = useState(false);
    const [otpValue, setOtpValue] = useState("");
    const [sendingOtp, setSendingOtp] = useState(false);
    const [otpCooldown, setOtpCooldown] = useState(0);

    // Login state
    const [loginEmail, setLoginEmail] = useState("");
    const [password, setPassword] = useState("");

    // Visibility toggles
    const [showSignupPassword, setShowSignupPassword] = useState(false);
    const [showSignupConfirm, setShowSignupConfirm] = useState(false);
    const [showLoginPassword, setShowLoginPassword] = useState(false);

    // Forgot password state
    const [forgotEmail, setForgotEmail] = useState("");

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [infoMessage, setInfoMessage] = useState<string | null>(null);

    const [_mfaLoading, _setMfaLoading] = useState(false);

    useEffect(() => {
        document.title = mode === "signup" ? "Create Your Account | SIL Monitoring System" : mode === "login" ? "Login | SIL Monitoring System" : "Reset Password | SIL Monitoring System";
    }, [mode]);

    const isEduPh = (value: string) => /\.edu\.ph$/i.test(value.trim());

    const validateSignup = () => {
        const e: Record<string, string> = {};
        if (!firstName.trim()) e.firstName = "First name is required";
        if (!lastName.trim()) e.lastName = "Last name is required";
        if (!signupEmail.trim()) e.signupEmail = "Email is required";
        else if (!isEduPh(signupEmail)) e.signupEmail = "Email must end with .edu.ph";
        if (!signupPassword) e.signupPassword = "Password is required";
        else if (signupPassword.length < 8) e.signupPassword = "Password must be at least 8 characters";
        if (!signupConfirm) e.signupConfirm = "Please confirm your password";
        else if (signupPassword && signupConfirm && signupPassword !== signupConfirm) e.signupConfirm = "Passwords do not match";
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const validateLogin = () => {
        const e: Record<string, string> = {};
        if (!loginEmail.trim()) e.loginEmail = "Email is required";
        else if (!isEduPh(loginEmail) && loginEmail.trim().toLowerCase() !== "admin@asiancollege.edu.ph") {
            e.loginEmail = "Email must end with .edu.ph";
        }
        if (!password.trim()) e.password = "Password is required";
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSendVerification = async () => {
        if (!isEduPh(signupEmail)) {
            setErrors(prev => ({ ...prev, signupEmail: "Enter a valid .edu.ph email before verifying" }));
            return;
        }
        setSendingOtp(true);
        setInfoMessage(null);
        setErrors(prev => ({ ...prev, signupEmail: '' }));
        try {
            const { error } = await supabase.auth.signInWithOtp({
                email: signupEmail.trim(),
                options: { shouldCreateUser: true },
            });
            if (error) throw error;
            setOtpSent(true);
            setOtpValue("");
            setInfoMessage("An 8-digit code was sent to your email. Enter it below.");
            setOtpCooldown(60);
            const timer = setInterval(() => {
                setOtpCooldown(prev => {
                    if (prev <= 1) { clearInterval(timer); return 0; }
                    return prev - 1;
                });
            }, 1000);
        } catch (err: any) {
            setErrors(prev => ({ ...prev, signupEmail: err.message || "Failed to send verification email." }));
        } finally {
            setSendingOtp(false);
        }
    };

    const handleVerifyOtp = async () => {
        if (otpValue.length < 8) return;
        setSendingOtp(true);
        setErrors(prev => ({ ...prev, otp: '' }));
        try {
            const { error } = await supabase.auth.verifyOtp({
                email: signupEmail.trim(),
                token: otpValue.trim(),
                type: 'email',
            });
            if (error) throw error;
            await supabase.auth.signOut();
            setEmailVerified(true);
            setOtpSent(false);
            setOtpValue("");
            setInfoMessage(null);
        } catch (err: any) {
            setErrors(prev => ({ ...prev, otp: "Invalid or expired code. Try again." }));
        } finally {
            setSendingOtp(false);
        }
    };

    // Signup: creates the account, then Supabase sends a confirmation email automatically.
    const handleSignup = (ev: React.FormEvent) => {
        ev.preventDefault();
        setInfoMessage(null);
        if (!validateSignup()) return;
        setIsSubmitting(true);
        setErrors({});
        signUp({
            email: signupEmail,
            password: signupPassword,
            firstName,
            middleName,
            lastName,
            accountType: signupEmail.trim().toLowerCase() === "admin@asiancollege.edu.ph" ? "admin" : "student"
        }).then(() => {
            setInfoMessage("✅ Account created! Check your email for a confirmation link before logging in.");
        }).catch(err => {
            setErrors(prev => ({ ...prev, general: err.message || String(err) }));
        }).finally(() => setIsSubmitting(false));
    };

    const handleLogin = async (ev: React.FormEvent) => {
        ev.preventDefault();
        setInfoMessage(null);
        if (!validateLogin()) return;
        setIsSubmitting(true);
        setErrors({});
        try {
            await signIn({ email: loginEmail, password });
        } catch (err: any) {
            let errorMsg = err.message || String(err);
            if (errorMsg.includes('ACCOUNT_PENDING')) {
                errorMsg = "Your coordinator account is pending approval from an administrator.";
            } else if (errorMsg.includes('ACCOUNT_DEACTIVATED')) {
                errorMsg = "Your account has been deactivated. Please contact an administrator.";
            } else if (errorMsg.includes('ACCOUNT_LOCKED')) {
                errorMsg = errorMsg.replace('ACCOUNT_LOCKED: ', '');
            } else if (errorMsg.includes('credentials')) {
                errorMsg = "Invalid email or password.";
            }
            setErrors(prev => ({ ...prev, general: errorMsg }));
            setIsSubmitting(false);
        }
    };

    const handleForgotPassword = async (ev: React.FormEvent) => {
        ev.preventDefault();
        setInfoMessage(null);
        setErrors({});

        if (!forgotEmail.trim()) {
            setErrors({ forgotEmail: "Email is required" });
            return;
        } else if (!isEduPh(forgotEmail)) {
            setErrors({ forgotEmail: "Email must end with .edu.ph" });
            return;
        }

        setIsSubmitting(true);
        try {
            await resetPasswordForEmail(forgotEmail);
            setInfoMessage("If your email is registered, you will receive a password reset link shortly.");
            setForgotEmail("");
        } catch (err: any) {
            setErrors(prev => ({ ...prev, general: err.message || String(err) }));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="auth-page">
            <div className={`auth-card ${mode}`}>
                <div className="auth-card-left">
                    <img src={leftPhoto} className="left-img" alt="Asian College campus" />
                    <div className="auth-left-overlay">
                        <h1 className="left-title"><span className="asian">Asian</span> <span className="college">College</span></h1>
                        <p className="left-sub">SIL Monitoring System</p>
                    </div>
                </div>

                <div className="auth-card-right">
                    {mode === "signup" ? (
                        <div className="auth-form-wrapper">
                            <div className="card-header" style={{ marginBottom: '1.25rem' }}>
                                <h1>Create Your Account</h1>
                                <p className="subtitle">Sign up using your <strong>.edu.ph</strong> email.</p>
                            </div>

                            <form className="auth-form" onSubmit={handleSignup} noValidate>
                                <div className="form-scrollable">
                                    <div className="form-row">
                                        <label>
                                            First Name *
                                            <input value={firstName} onChange={e => setFirstName(e.target.value)} />
                                            {errors.firstName && <span className="error">{errors.firstName}</span>}
                                        </label>
                                        <label>
                                            Middle Name
                                            <input value={middleName} onChange={e => setMiddleName(e.target.value)} />
                                        </label>
                                        <label>
                                            Last Name *
                                            <input value={lastName} onChange={e => setLastName(e.target.value)} />
                                            {errors.lastName && <span className="error">{errors.lastName}</span>}
                                        </label>
                                    </div>

                                    <label className="full-width">
                                        Email Address *
                                        <div className="email-row">
                                            <input
                                                type="email"
                                                value={signupEmail}
                                                onChange={e => {
                                                    setSignupEmail(e.target.value);
                                                    setEmailVerified(false);
                                                    setErrors(prev => ({ ...prev, signupEmail: "" }));
                                                }}
                                                placeholder="name@school.edu.ph"
                                                aria-describedby="email-note"
                                            />
                                            <button
                                                type="button"
                                                className="verify-btn"
                                                onClick={handleSendVerification}
                                                disabled={sendingOtp || otpCooldown > 0 || emailVerified}
                                            >
                                                {emailVerified
                                                    ? "Verified ✓"
                                                    : sendingOtp
                                                    ? "Sending..."
                                                    : otpCooldown > 0
                                                    ? `Resend (${otpCooldown}s)`
                                                    : "Send code"}
                                            </button>
                                        </div>
                                        <div id="email-note" className="muted">Only emails ending with <code>.edu.ph</code> are accepted.</div>
                                        {errors.signupEmail && <span className="error">{errors.signupEmail}</span>}
                                    </label>

                                    <label className="full-width">
                                        Password *
                                        <div className="password-input-wrapper">
                                            <input
                                                type={showSignupPassword ? "text" : "password"}
                                                value={signupPassword}
                                                onChange={e => {
                                                    setSignupPassword(e.target.value);
                                                    setErrors(prev => ({ ...prev, signupPassword: "" }));
                                                }}
                                                placeholder="Create a password (min 8 characters)"
                                            />
                                            <button 
                                                type="button" 
                                                className="password-toggle-btn" 
                                                onClick={() => setShowSignupPassword(!showSignupPassword)}
                                                tabIndex={-1}
                                            >
                                                {showSignupPassword ? <EyeIcon /> : <EyeOffIcon />}
                                            </button>
                                        </div>
                                        {errors.signupPassword && <span className="error">{errors.signupPassword}</span>}
                                    </label>

                                    <label className="full-width">
                                        Re-enter Password *
                                        <div className="password-input-wrapper">
                                            <input
                                                type={showSignupConfirm ? "text" : "password"}
                                                value={signupConfirm}
                                                onChange={e => {
                                                    setSignupConfirm(e.target.value);
                                                    setErrors(prev => ({ ...prev, signupConfirm: "" }));
                                                }}
                                                placeholder="Re-enter your password"
                                            />
                                            <button 
                                                type="button" 
                                                className="password-toggle-btn" 
                                                onClick={() => setShowSignupConfirm(!showSignupConfirm)}
                                                tabIndex={-1}
                                            >
                                                {showSignupConfirm ? <EyeIcon /> : <EyeOffIcon />}
                                            </button>
                                        </div>
                                        {errors.signupConfirm && <span className="error">{errors.signupConfirm}</span>}
                                    </label>

                                    {otpSent && !emailVerified && (
                                        <label className="full-width" style={{ marginTop: '0.75rem' }}>
                                            Verification Code *
                                            <div className="email-row">
                                                <input
                                                    type="text"
                                                    maxLength={8}
                                                    value={otpValue}
                                                    onChange={e => {
                                                        setOtpValue(e.target.value.replace(/\D/g, ''));
                                                        setErrors(prev => ({ ...prev, otp: '' }));
                                                    }}
                                                    placeholder="8-digit code"
                                                    style={{ letterSpacing: '0.25em', fontWeight: 600 }}
                                                />
                                                <button
                                                    type="button"
                                                    className="verify-btn"
                                                    onClick={handleVerifyOtp}
                                                    disabled={sendingOtp || otpValue.length < 8}
                                                >
                                                    {sendingOtp ? "Verifying..." : "Verify"}
                                                </button>
                                            </div>
                                            {errors.otp && <span className="error">{errors.otp}</span>}
                                        </label>
                                    )}

                                    <div className="verification-line">
                                        <div className={`verify-indicator ${emailVerified ? "ok" : "pending"}`}>
                                            {emailVerified ? "Email verified ✓" : "Email not verified"}
                                        </div>
                                    </div>

                                    {errors.general && <div className="error">{errors.general}</div>}
                                    {infoMessage && <div className="info-msg">{infoMessage}</div>}

                                    <div className="cta-row">
                                        <button className="primary" type="submit" disabled={isSubmitting}>
                                            {isSubmitting ? "Creating account..." : "Create Account"}
                                        </button>
                                    </div>
                                </div>

                                <div className="auth-footer">
                                    <p className="foot muted">Secure .edu.ph portal • Trusted by Asian College Dumaguete</p>
                                    <button type="button" className="muted switch-btn" onClick={() => { setMode("login"); setErrors({}); }}>
                                        Already have an account? Sign in
                                    </button>
                                </div>
                            </form>
                        </div>
                    ) : mode === "login" ? (
                        <div className="auth-form-wrapper">
                            <div className="card-header" style={{ marginBottom: '1.25rem' }}>
                                <h2>Login</h2>
                                <p className="subtitle">SIL Monitoring System — sign in using your <strong>.edu.ph</strong> email.</p>
                            </div>

                            <form className="auth-form" onSubmit={handleLogin} noValidate>
                                <div className="form-scrollable">
                                    <label className="full-width">
                                        Email Address *
                                        <input
                                            type="email"
                                            value={loginEmail}
                                            onChange={e => {
                                                setLoginEmail(e.target.value);
                                                setErrors(prev => ({ ...prev, loginEmail: "" }));
                                            }}
                                            placeholder="name@school.edu.ph"
                                            aria-describedby="email-note"
                                        />
                                        <div id="email-note" className="muted">Only emails ending with <code>.edu.ph</code> are accepted.</div>
                                        {errors.loginEmail && <span className="error">{errors.loginEmail}</span>}
                                    </label>

                                    <label className="full-width">
                                        Password *
                                        <div className="password-input-wrapper">
                                            <input
                                                type={showLoginPassword ? "text" : "password"}
                                                value={password}
                                                onChange={e => {
                                                    setPassword(e.target.value);
                                                    setErrors(prev => ({ ...prev, password: "" }));
                                                }}
                                                placeholder="Enter your password"
                                            />
                                            <button 
                                                type="button" 
                                                className="password-toggle-btn" 
                                                onClick={() => setShowLoginPassword(!showLoginPassword)}
                                                tabIndex={-1}
                                            >
                                                {showLoginPassword ? <EyeIcon /> : <EyeOffIcon />}
                                            </button>
                                        </div>
                                        {errors.password && <span className="error">{errors.password}</span>}
                                    </label>

                                    <div className="verification-line" style={{ alignItems: "center" }}>
                                        <a className="muted" href="#" onClick={(e) => { e.preventDefault(); setMode("forgot"); setErrors({}); setInfoMessage(null); }}>Forgot password?</a>
                                        <div style={{ flex: 1 }} />
                                    </div>

                                    {errors.general && <div className="error">{errors.general}</div>}
                                    {infoMessage && <div className="info-msg">{infoMessage}</div>}

                                    <div className="cta-row" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        <button className="primary" type="submit" disabled={isSubmitting}>
                                            {isSubmitting ? "Signing in..." : "Sign In"}
                                        </button>
                                    </div>
                                </div>

                                <div className="auth-footer">
                                    <p className="foot muted">Secure .edu.ph portal • Trusted by Asian College Dumaguete.</p>
                                    <button type="button" className="muted switch-btn" onClick={() => { setMode("signup"); setErrors({}); setInfoMessage(null); }}>
                                        Create an account
                                    </button>
                                </div>
                            </form>
                        </div>
                    ) : (
                        <div className="auth-form-wrapper">
                            <div className="card-header" style={{ marginBottom: '1.25rem' }}>
                                <h2>Reset Password</h2>
                                <p className="subtitle">Enter your <strong>.edu.ph</strong> email to receive a password reset link.</p>
                            </div>

                            <form className="auth-form" onSubmit={handleForgotPassword} noValidate>
                                <div className="form-scrollable">
                                    <label className="full-width">
                                        Email Address *
                                        <input
                                            type="email"
                                            value={forgotEmail}
                                            onChange={e => {
                                                setForgotEmail(e.target.value);
                                                setErrors(prev => ({ ...prev, forgotEmail: "" }));
                                            }}
                                            placeholder="name@school.edu.ph"
                                        />
                                        <div id="email-note" className="muted">Only emails ending with <code>.edu.ph</code> are accepted.</div>
                                        {errors.forgotEmail && <span className="error">{errors.forgotEmail}</span>}
                                    </label>

                                    {errors.general && <div className="error">{errors.general}</div>}
                                    {infoMessage && <div className="info-msg">{infoMessage}</div>}

                                    <div className="cta-row" style={{ marginTop: '1rem' }}>
                                        <button className="primary" type="submit" disabled={isSubmitting}>
                                            {isSubmitting ? "Sending..." : "Send Reset Link"}
                                        </button>
                                    </div>
                                </div>

                                <div className="auth-footer">
                                    <button type="button" className="muted switch-btn" onClick={() => { setMode("login"); setErrors({}); setInfoMessage(null); }}>
                                        Back to Login
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}