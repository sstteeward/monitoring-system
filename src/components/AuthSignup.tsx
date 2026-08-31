import React, { useEffect, useRef, useState } from "react";
import { usePasteBlocker } from "../hooks/usePasteBlocker";
import { useLocation } from "react-router-dom";
import "./AuthSignup.css";
import leftPhoto from "../assets/dumaguete (1).jpg";
import { signIn, resetPasswordForEmail, validatePasskeyStudentSession } from "../services/auth";
import { formatPasskeyError, isPasskeySupported, signInWithPasskey } from "../services/passkeyAuth";
import { supabase } from "../lib/supabaseClient";
import { passwordRequirementLabels, passwordRequirementsMessage, validatePassword } from "../utils/passwordRules";
import { saveRegistrationName } from "../utils/registrationName";

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

const PortalBack = () => (
    <a className="portal-back" href="/">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
        Choose portal
    </a>
);

export default function AuthSignup() {
    const location = useLocation();
    const blockPaste = usePasteBlocker();
    // Read the portal role from URL search params (e.g. /login?portal=coordinator)
    const searchParams = new URLSearchParams(location.search);
    const roleState = searchParams.get('portal') || undefined;
    const displayRole = roleState ? roleState.charAt(0).toUpperCase() + roleState.slice(1) : "";

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
    const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
    const [sendingOtp, setSendingOtp] = useState(false);
    const [otpCooldown, setOtpCooldown] = useState(0);
    const otpRefs = useRef<(HTMLInputElement | null)[]>(Array(6).fill(null));

    // Login state
    const [loginEmail, setLoginEmail] = useState("");
    const [password, setPassword] = useState("");

    // Visibility toggles
    const [showSignupPassword, setShowSignupPassword] = useState(false);
    const [showSignupConfirm, setShowSignupConfirm] = useState(false);
    const [showLoginPassword, setShowLoginPassword] = useState(false);
    const [passkeySupported, setPasskeySupported] = useState(false);
    const [passkeySigningIn, setPasskeySigningIn] = useState(false);

    // Forgot password state
    const [forgotEmail, setForgotEmail] = useState("");

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [infoMessage, setInfoMessage] = useState<string | null>(null);

    const passwordValidation = validatePassword(signupPassword, signupConfirm);

    const authPageRef = useRef<HTMLDivElement>(null);
    const handleAuthMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const el = authPageRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        el.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
        el.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
    };

    const resolveAccountType = (): 'student' | 'coordinator' | 'admin' | 'company' => {
        if (roleState === 'company') return 'company';
        if (roleState === 'coordinator') return 'coordinator';
        if (roleState === 'admin') return 'admin';
        return 'student';
    };

    // Recover portal access-denied errors that were saved before sign-out redirect
    useEffect(() => {
        const savedError = sessionStorage.getItem('portal_login_error');
        if (savedError) {
            sessionStorage.removeItem('portal_login_error');
            setErrors(prev => ({ ...prev, general: savedError }));
        }
    }, []);

    const [_mfaLoading, _setMfaLoading] = useState(false);

    useEffect(() => {
        document.title = mode === "signup" ? "Create Your Account | SIL Monitoring System" : mode === "login" ? "Login | SIL Monitoring System" : "Reset Password | SIL Monitoring System";
    }, [mode]);

    useEffect(() => {
        setPasskeySupported(isPasskeySupported());
    }, []);

    // Auto-focus first OTP box when the verification section appears
    useEffect(() => {
        if (otpSent && !emailVerified) {
            otpRefs.current[0]?.focus();
        }
    }, [otpSent, emailVerified]);

    const isEduPh = (value: string) => /\.edu\.ph$/i.test(value.trim());
    const hasValidSignupEmail = Boolean(signupEmail.trim()) && (roleState === 'company' || roleState === 'admin' || isEduPh(signupEmail));
    const canVerifyAndCreateAccount = Boolean(firstName.trim() && lastName.trim())
        && hasValidSignupEmail
        && passwordValidation.isValid
        && otpSent
        && otpDigits.every(d => d !== "");

    const validateSignup = () => {
        const e: Record<string, string> = {};
        if (!firstName.trim()) e.firstName = "First name is required";
        if (!lastName.trim()) e.lastName = "Last name is required";
        if (!signupEmail.trim()) e.signupEmail = "Email is required";
        else if (roleState !== 'company' && roleState !== 'admin' && !isEduPh(signupEmail)) e.signupEmail = "Email must end with .edu.ph";
        if (!signupPassword) e.signupPassword = "Password is required";
        else if (!passwordValidation.isValid) e.signupPassword = passwordRequirementsMessage;
        if (!signupConfirm) e.signupConfirm = "Please confirm your password";
        else if (signupPassword && signupConfirm && signupPassword !== signupConfirm) e.signupConfirm = "Passwords do not match";
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const validateLogin = () => {
        const e: Record<string, string> = {};
        if (!loginEmail.trim()) e.loginEmail = "Email is required";
        else if (roleState !== 'company' && roleState !== 'admin' && roleState !== 'coordinator' && !isEduPh(loginEmail)) {
            e.loginEmail = "Email must end with .edu.ph";
        }
        if (!password.trim()) e.password = "Password is required";
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSendVerification = async () => {
        if (roleState !== 'company' && roleState !== 'admin' && !isEduPh(signupEmail)) {
            setErrors(prev => ({ ...prev, signupEmail: "Enter a valid .edu.ph email before verifying" }));
            return;
        }
        setSendingOtp(true);
        setInfoMessage(null);
        setErrors(prev => ({ ...prev, signupEmail: '' }));
        try {
            const { error } = await supabase.auth.signInWithOtp({
                email: signupEmail.trim(),
                options: {
                    shouldCreateUser: true,
                    // Profile is created by the auth trigger at this moment.
                    // Include the registration name now so it is not stored as blank.
                    data: {
                        account_type: resolveAccountType(),
                        first_name: firstName.trim() || null,
                        middle_name: middleName.trim() || null,
                        last_name: lastName.trim() || null,
                    },
                },
            });
            if (error) throw error;
            saveRegistrationName({
                first_name: firstName.trim(),
                middle_name: middleName.trim(),
                last_name: lastName.trim(),
            });
            setOtpSent(true);
            setOtpDigits(["", "", "", "", "", ""]);
            setInfoMessage("A 6-digit code was sent to your email. Enter it.");
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

    const handleOtpChange = (index: number, value: string) => {
        const digit = value.replace(/\D/g, '').slice(0, 1);
        const newDigits = [...otpDigits];
        newDigits[index] = digit;
        setOtpDigits(newDigits);
        setErrors(prev => ({ ...prev, otp: '' }));

        if (digit && index < 5) {
            otpRefs.current[index + 1]?.focus();
        }
    };

    const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            return;
        }
        if (e.key === 'Backspace') {
            if (otpDigits[index] !== "") {
                const newDigits = [...otpDigits];
                newDigits[index] = "";
                setOtpDigits(newDigits);
            } else if (index > 0) {
                otpRefs.current[index - 1]?.focus();
            }
        }
    };

    const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (pasted.length === 0) return;
        const newDigits = [...otpDigits];
        for (let i = 0; i < pasted.length; i++) {
            newDigits[i] = pasted[i];
        }
        setOtpDigits(newDigits);
        setErrors(prev => ({ ...prev, otp: '' }));
        const nextIndex = Math.min(pasted.length, 5);
        otpRefs.current[nextIndex]?.focus();
    };

    const mapOtpError = (message: string) => {
        if (/expired/i.test(message)) {
            return "Your verification code has expired. Please request a new code.";
        }
        return "Invalid verification code. Please check the code sent to your email.";
    };

    const handleVerifyOtp = async () => {
        const combinedOtp = otpDigits.join("");
        if (combinedOtp.length !== 6 || !/^\d{6}$/.test(combinedOtp)) {
            setErrors(prev => ({ ...prev, otp: "Please enter the 6-digit verification code." }));
            return;
        }

        if (!validateSignup()) return;

        setIsSubmitting(true);
        setErrors(prev => ({ ...prev, otp: '' }));
        try {
            // Step 1: Verify OTP — this logs the user in with a magic-link session
            const { error: verifyError } = await supabase.auth.verifyOtp({
                email: signupEmail.trim(),
                token: combinedOtp,
                type: 'email',
            });
            if (verifyError) {
                throw verifyError;
            }

            const targetAccountType = resolveAccountType();
            const targetIsActive = targetAccountType === 'coordinator' ? false : true;
            const registrationName = {
                first_name: firstName.trim(),
                middle_name: middleName.trim(),
                last_name: lastName.trim(),
            };

            // Step 2: The Edge Function validates the password server-side before setting it.
            const { error: passwordError } = await supabase.functions.invoke('set-signup-password', {
                body: { password: signupPassword },
            });
            if (passwordError) throw passwordError;

            // Keep the registration name on the auth user so onboarding can recover it.
            const { error: metaError } = await supabase.auth.updateUser({
                data: {
                    account_type: targetAccountType,
                    first_name: registrationName.first_name,
                    middle_name: registrationName.middle_name || null,
                    last_name: registrationName.last_name,
                },
            });
            if (metaError) {
                console.warn('Unable to store registration name on auth user metadata:', metaError);
            }

            // Step 3: Persist the name onto the existing profile row created at Send code.
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                saveRegistrationName({ userId: user.id, ...registrationName });

                const profilePayload = {
                    email: signupEmail.trim().toLowerCase(),
                    first_name: registrationName.first_name,
                    middle_name: registrationName.middle_name || null,
                    last_name: registrationName.last_name,
                    account_type: targetAccountType,
                    is_active: targetIsActive,
                };

                const { data: updatedRows, error: updateError } = await supabase
                    .from('profiles')
                    .update(profilePayload)
                    .eq('auth_user_id', user.id)
                    .select('id');

                if (updateError || !updatedRows?.length) {
                    const { error: profileError } = await supabase.from('profiles').upsert(
                        {
                            auth_user_id: user.id,
                            ...profilePayload,
                        },
                        { onConflict: 'auth_user_id', ignoreDuplicates: false }
                    );
                    if (profileError) {
                        if (targetAccountType === 'company') {
                            throw new Error('Company onboarding is not enabled in the database yet. Please ask an administrator to apply the Company Portal migration, then try again.');
                        }
                        if (updateError) throw updateError;
                        throw profileError;
                    }
                }
            }

            // Session is now live — go straight to onboarding (student) or portal home
            setInfoMessage("✅ Account created! Redirecting...");
            setEmailVerified(true);
            sessionStorage.setItem('fresh_registration', '1');
            const redirectPath = targetAccountType === 'company'
                ? '/company'
                : targetAccountType === 'admin'
                    ? '/admin'
                    : targetAccountType === 'coordinator'
                        ? '/coordinator'
                        : '/';
            window.location.href = redirectPath;
        } catch (err: any) {
            setErrors(prev => ({ ...prev, otp: mapOtpError(err.message || '') }));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleLogin = async (ev: React.FormEvent) => {
        ev.preventDefault();
        setInfoMessage(null);
        if (!validateLogin()) return;
        setIsSubmitting(true);
        setErrors({});

        try {
            await signIn({ email: loginEmail, password, role: roleState as "student" | "coordinator" | "admin" | "company" | undefined });
            if (!roleState || roleState === 'student') sessionStorage.setItem('offer_passkey_enrollment', '1');
            window.location.href = roleState === 'company' ? '/company' : '/';
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

            // If signOut was called inside signIn (access denied, deactivated, locked),
            // the auth state change disrupts React Router and navigates away.
            // Force a hard redirect back to the same login portal with the error in sessionStorage.
            if (sessionStorage.getItem('portal_login_error')) {
                sessionStorage.setItem('portal_login_error', errorMsg);
                window.location.href = `/login${roleState ? `?portal=${roleState}` : ''}`;
                return;
            }

            setErrors(prev => ({ ...prev, general: errorMsg }));
            setIsSubmitting(false);
        }
    };

    const handlePasskeyLogin = async () => {
        if (!passkeySupported) return;
        setPasskeySigningIn(true);
        setErrors({});
        setInfoMessage(null);
        try {
            await signInWithPasskey();
            await validatePasskeyStudentSession();
            window.location.href = '/';
        } catch (err: unknown) {
            const message = formatPasskeyError(err, 'Passkey sign-in was not completed.');
            if (message) setErrors(prev => ({ ...prev, general: message }));
        } finally {
            setPasskeySigningIn(false);
        }
    };

    const handleForgotPassword = async (ev: React.FormEvent) => {
        ev.preventDefault();
        setInfoMessage(null);
        setErrors({});

        if (!forgotEmail.trim()) {
            setErrors({ forgotEmail: "Email is required" });
            return;
        } else if (roleState !== 'company' && roleState !== 'admin' && roleState !== 'coordinator' && !isEduPh(forgotEmail)) {
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
        <div className="auth-page" ref={authPageRef} onMouseMove={handleAuthMouseMove}>
            <div className="auth-card-shell">
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
                            {displayRole && <PortalBack />}
                            <div className="auth-card-header" style={{ marginBottom: '1.25rem' }}>
                                <h1>{displayRole ? `Create Account as ${displayRole}` : "Create Your Account"}</h1>
                                <p className="subtitle">Sign up using your {roleState === 'company' ? 'company' : <strong>.edu.ph</strong>} email.</p>
                            </div>

                            <form className="auth-form" onSubmit={(ev) => ev.preventDefault()} noValidate>
                                <div className="form-scrollable">
                                    <div className="form-row signup-name-section">
                                        <label>
                                            First Name *
                                            <input value={firstName} onChange={e => setFirstName(e.target.value.replace(/\b\w/g, c => c.toUpperCase()))} />
                                            {errors.firstName && <span className="error">{errors.firstName}</span>}
                                        </label>
                                        <label>
                                            Middle Name
                                            <input value={middleName} onChange={e => setMiddleName(e.target.value.replace(/\b\w/g, c => c.toUpperCase()))} />
                                        </label>
                                        <label>
                                            Last Name *
                                            <input value={lastName} onChange={e => setLastName(e.target.value.replace(/\b\w/g, c => c.toUpperCase()))} />
                                            {errors.lastName && <span className="error">{errors.lastName}</span>}
                                        </label>
                                    </div>

                                    <label className="full-width signup-email-section">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>Email Address *</span>
                                            {emailVerified && <span style={{ color: 'var(--success)', fontSize: '0.75rem' }}>Verified ✓</span>}
                                        </div>
                                        <div className="email-row">
                                            <input
                                                type="email"
                                                value={signupEmail}
                                                onChange={e => {
                                                    setSignupEmail(e.target.value);
                                                    setEmailVerified(false);
                                                    setErrors(prev => ({ ...prev, signupEmail: "" }));
                                                }}
                                                placeholder={roleState === 'company' ? "name@company.com" : "name@school.edu.ph"}
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
                                        <div id="email-note" className="muted" style={{ marginTop: '-0.3rem' }}>
                                            {roleState === 'company' ? "Please use your work or company email address." : <span>Only emails ending with <code>.edu.ph</code> are accepted.</span>}
                                        </div>
                                        {errors.signupEmail && <span className="error">{errors.signupEmail}</span>}
                                    </label>

                                    <div className="form-row signup-password-section form-row-2">
                                        <label>
                                            Password *
                                            <div className="password-input-wrapper">
                                                <input
                                                    type={showSignupPassword ? "text" : "password"}
                                                    value={signupPassword}
                                                    onChange={e => {
                                                        setSignupPassword(e.target.value);
                                                        setErrors(prev => ({ ...prev, signupPassword: "" }));
                                                    }}
                                                    onPaste={blockPaste}
                                                    placeholder="Min 8 chars"
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

                                        <label>
                                            Re-enter Password *
                                            <div className="password-input-wrapper">
                                                <input
                                                    type={showSignupConfirm ? "text" : "password"}
                                                    value={signupConfirm}
                                                    onChange={e => {
                                                        setSignupConfirm(e.target.value);
                                                        setErrors(prev => ({ ...prev, signupConfirm: "" }));
                                                    }}
                                                    onPaste={blockPaste}
                                                    placeholder="Confirm password"
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
                                    </div>

                                    <div className="password-requirements signup-password-requirements" aria-live="polite">
                                        <div className="password-strength"><span>Password Strength</span><strong className={`strength-${passwordValidation.strength.toLowerCase()}`}>{signupPassword ? passwordValidation.strength : '—'}</strong></div>
                                        <div className="password-strength-bars" aria-hidden="true">{[1, 2, 3, 4, 5].map(level => <span key={level} className={level <= passwordValidation.strengthScore ? `active strength-${passwordValidation.strength.toLowerCase()}` : ''} />)}</div>
                                        <div className="password-requirement-list">{(Object.keys(passwordRequirementLabels) as (keyof typeof passwordRequirementLabels)[]).map(key => <span key={key} className={passwordValidation.requirements[key] ? 'met' : 'unmet'}><b>{passwordValidation.requirements[key] ? '✓' : '○'}</b>{passwordRequirementLabels[key]}</span>)}</div>
                                    </div>

                                    {otpSent && !emailVerified && (
                                        <label className="full-width signup-otp-section" style={{ marginTop: '0.2rem' }}>
                                            Verification Code *
                                            <div className="otp-inputs">
                                                {otpDigits.map((digit, index) => (
                                                    <input
                                                        key={index}
                                                        type="text"
                                                        inputMode="numeric"
                                                        maxLength={1}
                                                        value={digit}
                                                        onChange={e => handleOtpChange(index, e.target.value)}
                                                        onKeyDown={e => handleOtpKeyDown(index, e)}
                                                        onPaste={index === 0 ? handleOtpPaste : undefined}
                                                        ref={el => { otpRefs.current[index] = el; }}
                                                        className="otp-input"
                                                    />
                                                ))}
                                            </div>
                                            {errors.otp && <span className="error">{errors.otp}</span>}
                                        </label>
                                    )}

                                    {errors.general && <div className="error signup-status">{errors.general}</div>}
                                    {infoMessage && <div className="info-msg signup-status">{infoMessage}</div>}

                                    <div className="cta-row signup-create-section">
                                        <button
                                            className="primary"
                                            type="button"
                                            disabled={isSubmitting || !canVerifyAndCreateAccount}
                                            onClick={handleVerifyOtp}
                                        >
                                            {isSubmitting ? "Creating account..." : "Create Account"}
                                        </button>
                                    </div>
                                </div>

                                <div className="auth-footer">
                                    <p className="foot muted">Secure {roleState === 'company' ? 'company' : '.edu.ph'} portal • Trusted by Asian College Dumaguete</p>
                                    <button type="button" className="muted switch-btn" onClick={() => { setMode("login"); setErrors({}); }}>
                                        Already have an account? Sign in
                                    </button>
                                </div>
                            </form>
                        </div>
                    ) : mode === "login" ? (
                        <div className="auth-form-wrapper">
                            {displayRole && <PortalBack />}
                            <div className="auth-card-header" style={{ marginBottom: '1.25rem' }}>
                                <h2>{displayRole ? `Login as ${displayRole}` : "Login"}</h2>
                                <p className="subtitle">SIL Monitoring System — sign in using your {roleState === 'company' ? 'company' : <strong>.edu.ph</strong>} email.</p>
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
                                        placeholder={roleState === 'company' ? "name@company.com" : "name@school.edu.ph"}
                                        aria-describedby="email-note"
                                    />
                                    <div id="email-note" className="muted">
                                        {roleState === 'company' ? "Use your work or company email address." : <span>Only emails ending with <code>.edu.ph</code> are accepted.</span>}
                                    </div>
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
                                                onPaste={blockPaste}
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
                                        {(!roleState || roleState === 'student') && passkeySupported && <>
                                            <div className="passkey-divider"><span>or</span></div>
                                            <button className="passkey-signin" type="button" disabled={isSubmitting || passkeySigningIn} onClick={() => void handlePasskeyLogin()}>
                                                <span aria-hidden="true"></span>{passkeySigningIn ? 'Checking passkey…' : 'Sign in with Passkey'}
                                            </button>
                                        </>}
                                    </div>
                                </div>

                                <div className="auth-footer">
                                    <p className="foot muted">Secure {roleState === 'company' ? 'company' : '.edu.ph'} portal • Trusted by Asian College Dumaguete.</p>
                                    {roleState !== 'admin' && (
                                        <button type="button" className="muted switch-btn" onClick={() => { setMode("signup"); setErrors({}); setInfoMessage(null); }}>
                                            Create an account
                                        </button>
                                    )}
                                </div>
                            </form>
                        </div>
                    ) : (
                        <div className="auth-form-wrapper">
                            {displayRole && <PortalBack />}
                            <div className="auth-card-header" style={{ marginBottom: '1.25rem' }}>
                                <h2>{displayRole ? `Reset ${displayRole} Password` : "Reset Password"}</h2>
                                <p className="subtitle">Enter your {roleState === 'company' ? 'company' : <strong>.edu.ph</strong>} email to receive a password reset link.</p>
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
                                            placeholder={roleState === 'company' ? "name@company.com" : "name@school.edu.ph"}
                                        />
                                        <div id="email-note" className="muted">
                                            {roleState === 'company' ? "Use your work or company email address." : <span>Only emails ending with <code>.edu.ph</code> are accepted.</span>}
                                        </div>
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
        </div>
    );
}
