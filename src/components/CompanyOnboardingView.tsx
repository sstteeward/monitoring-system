import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Profile } from '../services/profileService';
import './CompanyOnboardingView.css';

interface CompanyOnboardingViewProps {
    profile: Profile;
}

interface CompanyApplication {
    id: string;
    name: string;
    contact_email: string | null;
    status?: 'pending' | 'approved' | 'rejected';
    created_at: string;
}

interface Company {
    id: string;
    name: string;
    address?: string;
    industry?: string;
    latitude?: number | null;
    longitude?: number | null;
    geofence_radius?: number | null;
    geofence_polygon?: unknown;
}

interface CompanyRequest {
    id: string;
    name: string;
    address: string | null;
    industry: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    website: string | null;
    description: string | null;
    created_at: string;
    latitude?: number | null;
    longitude?: number | null;
    geofence_radius?: number | null;
    geofence_polygon?: unknown;
}

const steps = [1, 2];

const CompanyOnboardingView: React.FC<CompanyOnboardingViewProps> = ({ profile }) => {
    const [step, setStep] = useState(1);
    const [companyName, setCompanyName] = useState('');
    const [industry, setIndustry] = useState('');
    const [address, setAddress] = useState('');
    const [website, setWebsite] = useState('');
    const [contactName, setContactName] = useState(`${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim());
    const [contactPosition, setContactPosition] = useState('');
    const [contactEmail, setContactEmail] = useState(profile.email ?? '');
    const [contactPhone, setContactPhone] = useState('');
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const [accepted, setAccepted] = useState(false);
    const [pendingApplication, setPendingApplication] = useState<CompanyApplication | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Company dropdown data
    const [companies, setCompanies] = useState<Company[]>([]);
    const [companyRequests, setCompanyRequests] = useState<CompanyRequest[]>([]);
    const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
    const [companySearch, setCompanySearch] = useState('');
    const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');

    useEffect(() => {
        const loadData = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                setLoading(false);
                return;
            }

            // Load existing companies
            const { data: companyData } = await supabase
                .from('companies')
                .select('id, name, address, industry, latitude, longitude, geofence_radius, geofence_polygon')
                .order('name');
            setCompanies(companyData ?? []);

            // Load pending company requests from students
            const { data: requestData } = await supabase
                .from('company_requests')
                .select('*')
                .eq('status', 'pending')
                .order('created_at', { ascending: false });
            setCompanyRequests(requestData ?? []);

            // Check for an existing company account application by this user
            // (any status — pending/rejected so the right verification screen shows)
            const { data, error: requestError } = await supabase
                .from('company_requests')
                .select('id, name, contact_email, created_at, status')
                .eq('requested_by', user.id)
                .eq('request_type', 'company_account')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (!requestError && data) setPendingApplication(data as CompanyApplication);
            setLoading(false);
        };

        loadData();
    }, []);

    const filteredCompanies = [
        ...companies,
        ...companyRequests.map(r => ({
            id: `request-${r.id}`,
            name: r.name,
            address: r.address || undefined,
            industry: r.industry || undefined,
            latitude: r.latitude ?? null,
            longitude: r.longitude ?? null,
            geofence_radius: r.geofence_radius ?? null,
            geofence_polygon: r.geofence_polygon ?? null
        }))
    ].filter(c => c.name.toLowerCase().includes(companySearch.toLowerCase()));

    const handleCompanySelect = (company: Company) => {
        setCompanyName(company.name);
        if (company.address) setAddress(company.address);
        if (company.industry) setIndustry(company.industry);
        setCompanySearch(company.name);
        setShowCompanyDropdown(false);
        setSelectedCompanyId(company.id);
    };

    const handleLogoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setLogoFile(file);
        setLogoPreview(URL.createObjectURL(file));
    };

    const nextStep = (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);

        if (step === 1 && (!companyName.trim() || !industry.trim() || !address.trim() || !contactName.trim() || !contactPosition.trim() || !contactEmail.trim() || !contactPhone.trim())) {
            setError('Please complete the required company details before continuing.');
            return;
        }
        setShowCompanyDropdown(false);
        setStep(current => Math.min(current + 1, 2));
    };

    const submitApplication = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!accepted) {
            setError('Please confirm that the information provided is accurate.');
            return;
        }

        setSaving(true);
        setError(null);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Your session has expired. Please sign in again.');

            // Upload logo if provided (best-effort — a storage misconfiguration must not block the application)
            let logoUrl: string | null = null;
            if (logoFile) {
                const fileExt = logoFile.name.split('.').pop();
                const fileName = `logo-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
                const { error: uploadError } = await supabase.storage
                    .from('company_logos')
                    .upload(fileName, logoFile);
                if (uploadError) {
                    console.warn('Company logo upload skipped:', uploadError.message);
                } else {
                    const { data: publicData } = supabase.storage
                        .from('company_logos')
                        .getPublicUrl(fileName);
                    logoUrl = publicData.publicUrl;
                }
            }

            const selectedCompany =
                companies.find(c => c.id === selectedCompanyId) ??
                companyRequests.find(r => `request-${r.id}` === selectedCompanyId);

            const { data, error: requestError } = await supabase
                .from('company_requests')
                .insert({
                    name: companyName.trim(),
                    request_type: 'company_account',
                    requested_by: user.id,
                    student_name: contactName.trim(),
                    position: contactPosition.trim(),
                    contact_email: contactEmail.trim().toLowerCase(),
                    contact_phone: contactPhone.trim(),
                    address: address.trim(),
                    industry: industry.trim(),
                    website: website.trim() || null,
                    logo_url: logoUrl,
                    latitude: selectedCompany?.latitude ?? null,
                    longitude: selectedCompany?.longitude ?? null,
                    geofence_radius: selectedCompany?.geofence_radius ?? null,
                    geofence_polygon: selectedCompany?.geofence_polygon ?? null,
                    status: 'pending',
                })
                .select('id, name, contact_email, created_at, status')
                .single();

            if (requestError) throw requestError;
            setPendingApplication(data as CompanyApplication);
        } catch (submitError: unknown) {
            console.error('Company application submission failed:', submitError);
            const message = submitError instanceof Error
                ? submitError.message
                : typeof submitError === 'object' && submitError !== null && 'message' in submitError
                    ? String((submitError as { message: unknown }).message)
                    : 'We could not submit your application. Please try again.';
            setError(message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="company-onboarding-loading">Preparing your company application...</div>;

    if (pendingApplication) {
        const appStatus = pendingApplication.status ?? 'pending';

        if (appStatus === 'rejected') {
            return (
                <div className="company-onboarding-page">
                    <div className="company-onboarding-container">
                        <div className="company-onboarding-intro">
                            <div className="company-onboarding-icon company-onboarding-icon-rejected" aria-hidden="true">!</div>
                            <h1>Application not verified</h1>
                            <p>A coordinator reviewed your company application.</p>
                        </div>
                        <div className="company-onboarding-status-card company-onboarding-status-card-rejected">
                            <h1>Your application was not approved.</h1>
                            <p className="company-onboarding-status-copy">
                                Thanks for applying for <strong>{pendingApplication.name}</strong>. The coordinator was unable to verify your organization details at this time.
                            </p>
                            <div className="company-onboarding-status-meta">
                                <div><span>Submitted</span><strong>{new Date(pendingApplication.created_at).toLocaleDateString()}</strong></div>
                                <div><span>Contact email</span><strong>{pendingApplication.contact_email || 'Not provided'}</strong></div>
                            </div>
                            <div className="company-onboarding-next-steps">
                                <p>What can you do next?</p>
                                <div><span>1</span>Check the details you submitted for any errors.</div>
                                <div><span>2</span>Contact a coordinator for clarification.</div>
                                <div><span>3</span>Submit a new application once corrected.</div>
                            </div>
                            <div className="company-onboarding-actions">
                                <button type="button" className="company-onboarding-primary" onClick={() => setPendingApplication(null)}>Submit a new application <span>→</span></button>
                            </div>
                        </div>
                        <p className="company-onboarding-footnote">Sign in again anytime to check your application status.</p>
                    </div>
                </div>
            );
        }

        if (appStatus === 'approved') {
            return (
                <div className="company-onboarding-page">
                    <div className="company-onboarding-container">
                        <div className="company-onboarding-intro">
                            <div className="company-onboarding-icon" aria-hidden="true">✓</div>
                            <h1>Application verified</h1>
                            <p>Your company profile has been approved.</p>
                        </div>
                        <div className="company-onboarding-status-card">
                            <h1>Welcome to the Company Portal.</h1>
                            <p className="company-onboarding-status-copy">
                                <strong>{pendingApplication.name}</strong> has been verified by the coordinator. Your portal access is ready.
                            </p>
                            <div className="company-onboarding-actions">
                                <button type="button" className="company-onboarding-primary" onClick={() => window.location.reload()}>Open Company Portal <span>→</span></button>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="company-onboarding-page">
                <div className="company-onboarding-container">
                    <div className="company-onboarding-intro">
                        <div className="company-onboarding-icon" aria-hidden="true">✓</div>
                        <h1>Application submitted</h1>
                        <p>Your company profile is ready for review.</p>
                    </div>
                    <div className="company-onboarding-status-card">
                        <h1>Your company profile is under review.</h1>
                        <p className="company-onboarding-status-copy">
                            Thanks for registering <strong>{pendingApplication.name}</strong>. A coordinator will verify your organization details before enabling the Company Portal.
                        </p>
                        <div className="company-onboarding-status-meta">
                            <div><span>Submitted</span><strong>{new Date(pendingApplication.created_at).toLocaleDateString()}</strong></div>
                            <div><span>Contact email</span><strong>{pendingApplication.contact_email || 'Not provided'}</strong></div>
                        </div>
                        <div className="company-onboarding-next-steps">
                            <p>What happens next?</p>
                            <div><span>1</span>The coordinator reviews your company information.</div>
                            <div><span>2</span>Your company is added to the partner directory.</div>
                            <div><span>3</span>Your portal access is activated automatically.</div>
                        </div>
                        <p className="company-onboarding-footnote">You can safely close this page. Sign in again anytime to check your access.</p>
                    </div>
                </div>
            </div>
        );
    }

    const subtitle = step === 1
        ? "Let's set up your company profile."
        : 'Review your company application before submitting.';

    return (
        <div className="company-onboarding-page">
            <div className="company-onboarding-container">
                <div className="company-onboarding-intro">
                    <div className="company-onboarding-icon" aria-hidden="true">
                        <svg width="29" height="29" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="7" width="18" height="14" rx="2" />
                            <path d="M16 21V4.5A1.5 1.5 0 0 0 14.5 3h-5A1.5 1.5 0 0 0 8 4.5V21" />
                            <path d="M10.5 11h.01M13.5 11h.01M10.5 14.5h.01M13.5 14.5h.01" />
                        </svg>
                    </div>
                    <h1>Welcome to SIL Monitoring</h1>
                    <p>{subtitle}</p>
                </div>

                <div className="company-onboarding-progress-dots" aria-label={`Step ${step} of 2`}>
                    {steps.map(item => <span key={item} className={item <= step ? 'active' : ''} />)}
                </div>

                <div className="company-onboarding-card">
                    {error && <div className="company-onboarding-error" role="alert">{error}</div>}

                    {step < 2 ? (
                        <form onSubmit={nextStep} className="company-onboarding-form">
                            {step === 1 && (
                                <section className="company-onboarding-form-section">
                                    <div className="company-onboarding-section-heading">
                                        <span className="company-onboarding-section-icon">⌂</span>
                                        <div><h3>Company details</h3><p>These details will appear on your partner profile.</p></div>
                                    </div>
                                    <div className="company-onboarding-company-field">
                                        <label>Company name *</label>
                                        <input
                                            value={companySearch}
                                            onChange={e => { setCompanySearch(e.target.value); setCompanyName(e.target.value); }}
                                            onClick={() => setShowCompanyDropdown(true)}
                                            onFocus={() => setShowCompanyDropdown(true)}
                                            placeholder="Search or select a company…"
                                            autoComplete="off"
                                        />
                                        {showCompanyDropdown && (
                                            <>
                                                <div className="company-onboarding-dropdown-overlay" onClick={() => setShowCompanyDropdown(false)} />
                                                {filteredCompanies.length > 0 ? (
                                                    <div className="company-onboarding-dropdown" role="listbox">
                                                        {filteredCompanies.map(c => (
                                                            <div
                                                                key={c.id}
                                                                role="option"
                                                                aria-selected={selectedCompanyId === c.id}
                                                                className={`company-onboarding-dropdown-item${selectedCompanyId === c.id ? ' selected' : ''}`}
                                                                onClick={() => handleCompanySelect(c)}
                                                            >
                                                                <div className="company-onboarding-dropdown-name">
                                                                    {c.name}
                                                                    {c.id.startsWith('request-') && <span className="company-onboarding-dropdown-badge">Requested by student</span>}
                                                                </div>
                                                                {c.address && <div className="company-onboarding-dropdown-sub">{c.address}</div>}
                                                                {c.industry && <div className="company-onboarding-dropdown-meta">{c.industry}</div>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="company-onboarding-dropdown company-onboarding-dropdown-empty">
                                                        <div className="company-onboarding-dropdown-name">No matching companies</div>
                                                        <div className="company-onboarding-dropdown-sub">You can continue typing to register a new company.</div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                    <div className="company-onboarding-field-grid">
                                        <label>Industry *<input value={industry} onChange={event => setIndustry(event.target.value)} placeholder="e.g. Information Technology" /></label>
                                        <label>Website<input type="url" value={website} onChange={event => setWebsite(event.target.value)} placeholder="https://yourcompany.com" /></label>
                                    </div>
                                    <label>Office address *<input value={address} onChange={event => setAddress(event.target.value)} placeholder="Street, barangay, city, province" /></label>
                                    <label>Contact person *<input value={contactName} onChange={event => setContactName(event.target.value)} placeholder="Full name" /></label>
                                    <div className="company-onboarding-field-grid">
                                        <label>Position *<input value={contactPosition} onChange={event => setContactPosition(event.target.value)} placeholder="e.g. HR Manager" /></label>
                                        <label>Company email *<input type="email" value={contactEmail} onChange={event => setContactEmail(event.target.value)} placeholder="supervisor@company.com" /></label>
                                    </div>
                                    <label>Contact number *<input type="tel" value={contactPhone} onChange={event => setContactPhone(event.target.value)} placeholder="09XX XXX XXXX" /></label>
                                    <div className="company-onboarding-logo-upload">
                                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoChange} />
                                        {logoPreview ? (
                                            <button type="button" className="company-onboarding-logo-box" onClick={event => { event.preventDefault(); (event.currentTarget.previousElementSibling as HTMLInputElement)?.click(); }}>
                                                <img src={logoPreview} alt="Company logo" />
                                                <span>Click to change logo</span>
                                            </button>
                                        ) : (
                                            <button type="button" className="company-onboarding-logo-box" onClick={event => { event.preventDefault(); (event.currentTarget.previousElementSibling as HTMLInputElement)?.click(); }}>
                                                <span className="company-onboarding-logo-icon">
                                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                                                </span>
                                                <span>Upload company logo</span>
                                                <small>PNG or JPG, up to 2MB</small>
                                            </button>
                                        )}
                                    </div>
                                    <div className="company-onboarding-info-callout"><span>i</span><p>This account will become the primary supervisor login after your application is approved.</p></div>
                                </section>
                            )}
                            <div className="company-onboarding-actions"><button type="submit" className="company-onboarding-primary">Continue <span>→</span></button></div>
                        </form>
                    ) : (
                        <form onSubmit={submitApplication} className="company-onboarding-form">
                            <section className="company-onboarding-form-section">
                                <div className="company-onboarding-section-heading">
                                    <span className="company-onboarding-section-icon">✓</span>
                                    <div><h3>Review your application</h3><p>Make sure everything looks right before sending it.</p></div>
                                </div>
                                {logoPreview && (
                                    <div className="company-onboarding-review-logo">
                                        <img src={logoPreview} alt="Company logo" />
                                    </div>
                                )}
                                <div className="company-onboarding-review-grid">
                                    <div><span>Company</span><strong>{companyName}</strong></div>
                                    <div><span>Industry</span><strong>{industry}</strong></div>
                                    <div><span>Address</span><strong>{address}</strong></div>
                                    <div><span>Contact person</span><strong>{contactName}</strong></div>
                                    <div><span>Position</span><strong>{contactPosition}</strong></div>
                                    <div><span>Email</span><strong>{contactEmail}</strong></div>
                                    <div><span>Phone</span><strong>{contactPhone}</strong></div>
                                    {website && <div><span>Website</span><strong>{website}</strong></div>}
                                </div>
                                <label className="company-onboarding-checkbox"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} /><span>I confirm these details are accurate and authorize Asian College to review this company partnership application.</span></label>
                            </section>
                            <div className="company-onboarding-actions company-onboarding-actions-split"><button type="button" className="company-onboarding-back" onClick={(event) => { event.preventDefault(); event.stopPropagation(); console.log('[onboarding] back clicked', step); setStep(1); setShowCompanyDropdown(false); setError(null); }}>← Back</button><button type="submit" className="company-onboarding-primary" disabled={saving}>{saving ? 'Submitting...' : 'Submit application'} <span>→</span></button></div>
                        </form>
                    )}
                </div>
                <p className="company-onboarding-footnote">You can update these details later from your Company Profile page.</p>
            </div>
        </div>
    );
};

export default CompanyOnboardingView;
