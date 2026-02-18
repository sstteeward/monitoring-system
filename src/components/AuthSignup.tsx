import React, { useEffect, useRef, useState } from "react";
import "./AuthSignup.css";
import leftPhoto from "../assets/dumaguete (1).jpg";
import { signUp, signIn } from "../services/auth";

export const AuthSignup: React.FC = () => {
    const [mode, setMode] = useState<"signup" | "login">("signup");
    const leftRef = useRef<HTMLDivElement | null>(null);
    const leftImgRef = useRef<HTMLImageElement | null>(null);
    const cardRef = useRef<HTMLFormElement | null>(null);

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

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [infoMessage, setInfoMessage] = useState<string | null>(null);

    useEffect(() => {
        document.title = mode === "signup" ? "Create Your Account | SIL Monitoring System" : "Login | SIL Monitoring System";
    }, [mode]);

    // helper to set left panel height to match the card
    const updateHeight = () => {
        const card = cardRef.current;
        const left = leftRef.current;
        if (!card || !left) return;
        const rect = card.getBoundingClientRect();
        left.style.height = `${Math.round(rect.height)}px`;
    };

    // keep the left panel height synced to the form card
    useEffect(() => {
        updateHeight();

        const ro = new ResizeObserver(() => updateHeight());
        if (cardRef.current) ro.observe(cardRef.current);
        if (leftImgRef.current) leftImgRef.current.addEventListener("load", updateHeight);
        window.addEventListener("resize", updateHeight);

        // extra calls after mode change to catch asynchronous layout changes
        const raf = requestAnimationFrame(updateHeight);
        const t = setTimeout(updateHeight, 120);

        return () => {
            ro.disconnect();
            if (leftImgRef.current) leftImgRef.current.removeEventListener("load", updateHeight);
            window.removeEventListener("resize", updateHeight);
            cancelAnimationFrame(raf);
            clearTimeout(t);
        };
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
        else if (!isEduPh(loginEmail)) e.loginEmail = "Email must end with .edu.ph";
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
            accountType
        }).then(() => {
            setInfoMessage("Sign-up successful. Please check your email to verify your account.");
            // switch to login so user can sign in after verification
            setMode("login");
        }).catch(err => {
            setErrors(prev => ({ ...prev, general: err.message || String(err) }));
        }).finally(() => setIsSubmitting(false));
    };

    const handleLogin = (ev: React.FormEvent) => {
        ev.preventDefault();
        setInfoMessage(null);
        if (!validateLogin()) return;
        setIsSubmitting(true);
        setErrors({});
        signIn({ email: loginEmail, password }).then((data) => {
            setInfoMessage("Signed in successfully.");
            // TODO: redirect to dashboard or update app state
            console.log("session", data);
        }).catch(err => {
            setErrors(prev => ({ ...prev, general: err.message || String(err) }));
        }).finally(() => setIsSubmitting(false));
    };

    return (
        <div className="auth-split">
            <div
                className="auth-left"
                role="img"
                aria-label="Campus photo"
                ref={leftRef}
            >
                <img ref={leftImgRef} src={leftPhoto} className="left-img" alt="Asian College campus" />
                <div className="auth-left-overlay">
                    <h1 className="left-title"><span className="asian">Asian</span> <span className="college">College</span></h1>
                    <p className="left-sub">SIL Monitoring System</p>
                </div>
            </div>

            <main className="auth-right">
                {mode === "signup" ? (
                    <form ref={cardRef} className="glass-card" onSubmit={handleSignup} noValidate>
                        <div className="card-header">
                            <h1>Create Your Account</h1>
                            <p className="subtitle">Sign up using your <strong>.edu.ph</strong> email.</p>
                        </div>

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
                        {infoMessage && <div className="muted" style={{textAlign: 'center'}}>{infoMessage}</div>}
                        <div className="cta-row">
                            <button className="primary" type="submit" disabled={isSubmitting}>
                                {isSubmitting ? "Signing up..." : "Sign Up"}
                            </button>
                        </div>

                        <p className="foot muted">Secure .edu.ph portal • Trusted by Asian College Dumaguete</p>

                        <div style={{ textAlign: "center", marginTop: 8 }}>
                            <button type="button" className="muted" onClick={() => { setMode("login"); setErrors({}); }}>
                                Already have an account? Sign in
                            </button>
                        </div>
                    </form>
                ) : (
                    <form ref={cardRef} className="glass-card" onSubmit={handleLogin} noValidate>
                        <div className="card-header">
                            <h2>Login</h2>
                            <p className="subtitle">SIL Monitoring System — sign in using your <strong>.edu.ph</strong> email.</p>
                        </div>

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
                            <a className="muted" href="#" onClick={(e) => e.preventDefault()}>Forgot password?</a>
                            <div style={{ flex: 1 }} />
                        </div>

                        {errors.general && <div className="error">{errors.general}</div>}
                        {infoMessage && <div className="muted" style={{textAlign: 'center'}}>{infoMessage}</div>}
                        <div className="cta-row">
                            <button className="primary" type="submit" disabled={isSubmitting}>
                                {isSubmitting ? "Signing in..." : "Sign In"}
                            </button>
                        </div>

                        <p className="foot muted">Secure .edu.ph portal • Trusted by Asian College Dumaguete.</p>

                        <div style={{ textAlign: "center", marginTop: 8 }}>
                            <button type="button" className="muted" onClick={() => { setMode("signup"); setErrors({}); }}>
                                Create an account
                            </button>
                        </div>
                    </form>
                )}
            </main>
        </div>
    );
};

export default AuthSignup;