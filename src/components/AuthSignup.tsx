import React, { useEffect, useState } from "react";
import "./AuthSignup.css";
import leftPhoto from "../assets/dumaguete (1).jpg";
import { signUp, signIn, resetPasswordForEmail } from "../services/auth";
// import { supabase } from '../lib/supabaseClient';

export default function AuthSignup() {
    const [mode, setMode] = useState<"signup" | "login" | "forgot">("login");

    // Signup state
    const [firstName, setFirstName] = useState("");
    const [middleName, setMiddleName] = useState("");
    const [lastName, setLastName] = useState("");
    const [signupEmail, setSignupEmail] = useState("");
    const [signupPassword, setSignupPassword] = useState("");
    const [signupConfirm, setSignupConfirm] = useState("");
    const [accountType, setAccountType] = useState<"student" | "coordinator">("student");
    const [emailVerified, setEmailVerified] = useState(false);

    // Login state
    const [loginEmail, setLoginEmail] = useState("");
    const [password, setPassword] = useState("");

    // Forgot password state
    const [forgotEmail, setForgotEmail] = useState("");

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [infoMessage, setInfoMessage] = useState<string | null>(null);

    // MFA State (HIDDEN)
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

    const handleSendVerification = () => {
        if (!isEduPh(signupEmail)) {
            setErrors(prev => ({ ...prev, signupEmail: "Enter a valid .edu.ph email before verifying" }));
            return;
        }
        // simulate
        setEmailVerified(true);
    };

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
            accountType: signupEmail.trim().toLowerCase() === "admin@asiancollege.edu.ph" ? "admin" : accountType
        }).then(() => {
            setInfoMessage("Sign-up successful. Please check your email to verify your account.");
            // switch to login so user can sign in after verification
            setMode("login");
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
            setInfoMessage("Signed in successfully.");
            setIsSubmitting(false);
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

    /* WebAuthn MFA Verification (HIDDEN)
    const handleVerifyMfa = async () => {
        if (!mfaFactorId) return;
        setMfaLoading(true);
        setErrors({});
        try {
            const { error } = await supabase.auth.mfa.webauthn.authenticate({
                factorId: mfaFactorId
            });
            if (error) throw error;
 
            setInfoMessage("Signed in successfully with Face ID / Touch ID!");
            // setMfaFactorId(null);
        } catch (err: any) {
            setErrors(prev => ({ ...prev, general: err.message || String(err) }));
        } finally {
            setMfaLoading(false);
        }
    };
    */

    return (
        <div className="auth-page">
            <div className={`auth-card ${mode}`}>
                {/* Left Side: Image */}
                <div className="auth-card-left">
                    <img src={leftPhoto} className="left-img" alt="Asian College campus" />
                    <div className="auth-left-overlay">
                        <h1 className="left-title"><span className="asian">Asian</span> <span className="college">College</span></h1>
                        <p className="left-sub">SIL Monitoring System</p>
                    </div>
                </div>

                {/* Right Side: Form */}
                <div className="auth-card-right">
                    {/* --- TWO-FACTOR WebAuthn UI (HIDDEN) --- */}
                    {/* 
                    _mfaFactorId ? (
                        <div className="auth-form">
                            <div className="card-header">
                                <h2>Two-Factor Authentication</h2>
                                <p className="subtitle">Please verify your identity using your registered Face ID or Touch ID passkey.</p>
                            </div>

                            <div className="form-scrollable" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 0' }}>
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#10b981', marginBottom: '1.5rem' }}>
                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                    <path d="M9 12l2 2 4-4" />
                                </svg>

                                {errors.general && <div className="error" style={{ width: '100%', marginBottom: '1rem' }}>{errors.general}</div>}
                                {infoMessage && <div className="info-msg" style={{ width: '100%', marginBottom: '1rem' }}>{infoMessage}</div>}

                                <button
                                    className="primary"
                                    type="button"
                                    disabled={_mfaLoading}
                                    onClick={_handleVerifyMfa}
                                    style={{ width: '100%' }}
                                >
                                    {_mfaLoading ? "Waiting for prompt..." : "Verify with Face ID / Touch ID"}
                                </button>

                                <button
                                    type="button"
                                    className="muted switch-btn"
                                    onClick={() => { _setMfaFactorId(null); setMode('login'); }}
                                    style={{ marginTop: '1rem' }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : 
                    */}
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
                                            <button type="button" className="verify-btn" onClick={handleSendVerification}>
                                                Send verification
                                            </button>
                                        </div>
                                        <div id="email-note" className="muted">Only emails ending with <code>.edu.ph</code> are accepted.</div>
                                        {errors.signupEmail && <span className="error">{errors.signupEmail}</span>}
                                    </label>

                                    <label className="full-width">
                                        Password *
                                        <input
                                            type="password"
                                            value={signupPassword}
                                            onChange={e => {
                                                setSignupPassword(e.target.value);
                                                setErrors(prev => ({ ...prev, signupPassword: "" }));
                                            }}
                                            placeholder="Create a password (min 8 characters)"
                                        />
                                        {errors.signupPassword && <span className="error">{errors.signupPassword}</span>}
                                    </label>

                                    <label className="full-width">
                                        Re-enter Password *
                                        <input
                                            type="password"
                                            value={signupConfirm}
                                            onChange={e => {
                                                setSignupConfirm(e.target.value);
                                                setErrors(prev => ({ ...prev, signupConfirm: "" }));
                                            }}
                                            placeholder="Re-enter your password"
                                        />
                                        {errors.signupConfirm && <span className="error">{errors.signupConfirm}</span>}
                                    </label>

                                    <div className="verification-line">
                                        <div className={`verify-indicator ${emailVerified ? "ok" : "pending"}`}>
                                            {emailVerified ? "Email verified" : "Unverified"}
                                        </div>
                                        <div className="account-type">
                                            <label>
                                                <input
                                                    type="radio"
                                                    name="acct"
                                                    value="student"
                                                    checked={accountType === "student"}
                                                    onChange={() => setAccountType("student")}
                                                />
                                                Student
                                            </label>
                                            <label>
                                                <input
                                                    type="radio"
                                                    name="acct"
                                                    value="coordinator"
                                                    checked={accountType === "coordinator"}
                                                    onChange={() => setAccountType("coordinator")}
                                                />
                                                Coordinator
                                            </label>
                                        </div>
                                    </div>

                                    {errors.general && <div className="error">{errors.general}</div>}
                                    {infoMessage && <div className="info-msg">{infoMessage}</div>}

                                    <div className="cta-row">
                                        <button className="primary" type="submit" disabled={isSubmitting}>
                                            {isSubmitting ? "Signing up..." : "Sign Up"}
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
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={e => {
                                                setPassword(e.target.value);
                                                setErrors(prev => ({ ...prev, password: "" }));
                                            }}
                                            placeholder="Enter your password"
                                        />
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