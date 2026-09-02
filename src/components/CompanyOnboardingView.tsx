/**
 * Company account onboarding.
 *
 * Company Details → Company Address → Supervisor / Contact → Review & Confirm,
 * built on the shared onboarding wizard (OnboardingShell) so it matches the
 * Student, Adviser and Coordinator flows.
 *
 * Company accounts are not people: no birthday or SIL/OJT hours are collected —
 * the personal step is replaced by the company's own contact information.
 * The application payloads and `company_requests` relationships are unchanged.
 */
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Profile } from '../services/profileService';
import NameFieldsGroup from './onboarding/NameFieldsGroup';
import AddressLevelsSelector from './onboarding/AddressLevelsSelector';
import OnboardingShell, { OnboardingActions } from './onboarding/OnboardingShell';
import { ONB_ADDRESS_CHROME, ONB_NAME_CHROME } from './onboarding/onboardingChrome';
import ReviewSummary, { type ReviewSectionData } from './onboarding/ReviewSummary';
import { addressLevelsFromProfile, useAddressLevels, type AddressLevelRow } from './onboarding/useAddressLevels';
import {
    formatFullName,
    formatStructuredAddress,
    validateAddressLevels,
    validateContactNumber,
    validateNameLevels,
    type NameLevels,
} from './onboarding/onboardingFields';
import './CompanyOnboardingView.css';

const STEPS = ['Company', 'Address', 'Supervisor', 'Review'];

const SUBTITLES = [
    "Let's set up your company profile.",
    'Where is your office located?',
    'Who will supervise the SIL/OJT students?',
    'Review your company application before submitting.',
];

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

interface Company extends AddressLevelRow {
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

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const CompanyOnboardingView: React.FC<CompanyOnboardingViewProps> = ({ profile }) => {
    const [step, setStep] = useState(1);

    // ── Step 1: Company details ──
    const [companyName, setCompanyName] = useState('');
    const [industry, setIndustry] = useState('');
    const [website, setWebsite] = useState('');
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);

    // ── Step 2: Office address by level (PSGC) ──
    const addressLevels = useAddressLevels(addressLevelsFromProfile(null));
    const address = formatStructuredAddress(addressLevels.address);

    // ── Step 3: Supervisor / contact person ──
    const [contactName, setContactName] = useState<NameLevels>({
        firstName: profile.first_name ?? '',
        middleName: profile.middle_name ?? '',
        lastName: profile.last_name ?? '',
        suffix: profile.suffix ?? '',
    });
    const [contactPosition, setContactPosition] = useState('');
    const [contactEmail, setContactEmail] = useState(profile.email ?? '');
    const [contactPhone, setContactPhone] = useState('');

    // ── Step 4: Review ──
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
        // Prefill the address levels when the stored company already has them.
        // A legacy company with only a combined `address` cannot be split reliably,
        // so the applicant re-picks the levels instead of us guessing.
        addressLevels.setAddress(addressLevelsFromProfile(company));
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

    // ── Per-step validation ──

    const validateStep1 = () => {
        if (!companyName.trim()) {
            setError('Please enter or select your company name.');
            return false;
        }
        if (!industry.trim()) {
            setError('Please enter your company type or industry.');
            return false;
        }
        setError(null);
        return true;
    };

    const validateStep2 = () => {
        const message = validateAddressLevels(addressLevels.address);
        setError(message);
        return message === null;
    };

    const validateStep3 = () => {
        // Shared rules — identical to Student, Adviser and Coordinator onboarding.
        const nameError = validateNameLevels(contactName);
        if (nameError) {
            setError(nameError);
            return false;
        }
        if (!contactPosition.trim()) {
            setError('Please enter the contact person’s position.');
            return false;
        }
        if (!isValidEmail(contactEmail)) {
            setError('Please enter a valid company email address.');
            return false;
        }
        const phoneError = validateContactNumber(contactPhone);
        if (phoneError) {
            setError(phoneError);
            return false;
        }
        setError(null);
        return true;
    };

    const canReach = (target: number) => {
        if (target > 1 && !validateStep1()) return false;
        if (target > 2 && !validateStep2()) return false;
        if (target > 3 && !validateStep3()) return false;
        return true;
    };

    const goTo = (target: number) => {
        setShowCompanyDropdown(false);
        if (target <= step) {
            setError(null);
            setStep(target);
            return;
        }
        if (canReach(target)) setStep(target);
    };

    const nextStep = (event: React.FormEvent) => {
        event.preventDefault();
        goTo(step + 1);
    };

    const handleBack = () => {
        setError(null);
        setShowCompanyDropdown(false);
        setStep(current => Math.max(1, current - 1));
    };

    const submitApplication = async (event: React.FormEvent) => {
        event.preventDefault();

        // Re-check every step so an incomplete application can never be sent.
        if (!validateStep1()) { setStep(1); return; }
        if (!validateStep2()) { setStep(2); return; }
        if (!validateStep3()) { setStep(3); return; }
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

            // Legacy columns keep the combined display values; the by-level columns
            // are the source of truth going forward.
            const legacyPayload = {
                name: companyName.trim(),
                request_type: 'company_account',
                requested_by: user.id,
                student_name: formatFullName(contactName),
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
            };

            const byLevelPayload = {
                ...legacyPayload,
                contact_first_name: contactName.firstName.trim(),
                contact_middle_name: contactName.middleName.trim() || null,
                contact_last_name: contactName.lastName.trim(),
                contact_suffix: contactName.suffix.trim() || null,
                country: addressLevels.address.country || 'Philippines',
                region: addressLevels.address.regionName || null,
                region_code: addressLevels.address.regionCode || null,
                province: addressLevels.address.provinceName || null,
                province_code: addressLevels.address.provinceCode || null,
                city_municipality: addressLevels.address.cityMunicipalityName || null,
                city_municipality_code: addressLevels.address.cityCode || null,
                barangay: addressLevels.address.barangayName || null,
                barangay_code: addressLevels.address.barangayCode || null,
                house_street: addressLevels.address.houseStreet.trim() || null,
            };

            const isMissingColumnError = (err: unknown) => {
                const msg = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
                return msg.includes('could not find') || msg.includes('schema cache') || msg.includes('does not exist');
            };

            const insertRequest = (payload: Record<string, unknown>) =>
                supabase
                    .from('company_requests')
                    .insert(payload)
                    .select('id, name, contact_email, created_at, status')
                    .single();

            let { data, error: requestError } = await insertRequest(byLevelPayload);
            if (requestError && isMissingColumnError(requestError)) {
                // Database has not run the by-level migration yet.
                ({ data, error: requestError } = await insertRequest(legacyPayload));
            }

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
                                <button type="button" className="company-onboarding-primary" onClick={() => { setPendingApplication(null); setStep(1); setAccepted(false); }}>Submit a new application <span>→</span></button>
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

    const reviewSections: ReviewSectionData[] = [
        {
            title: 'Company Information',
            step: 1,
            rows: [
                { label: 'Company Name', value: companyName },
                { label: 'Company Type / Industry', value: industry },
                { label: 'Website', value: website, full: true },
            ],
        },
        {
            title: 'Company Address',
            step: 2,
            rows: [
                { label: 'Country', value: addressLevels.address.country },
                { label: 'Region', value: addressLevels.address.regionName },
                { label: 'Province', value: addressLevels.address.provinceName },
                { label: 'City / Municipality', value: addressLevels.address.cityMunicipalityName },
                { label: 'Barangay', value: addressLevels.address.barangayName },
                { label: 'Company Address / Street', value: addressLevels.address.houseStreet },
                { label: 'Full Address', value: address, full: true },
            ],
        },
        {
            title: 'Supervisor / Contact Person',
            step: 3,
            rows: [
                { label: 'Contact Person', value: formatFullName(contactName), full: true },
                { label: 'Position', value: contactPosition },
                { label: 'Email', value: contactEmail },
                { label: 'Contact Number', value: contactPhone },
            ],
        },
    ];

    return (
        <OnboardingShell
            icon={(
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="7" width="18" height="14" rx="2" />
                    <path d="M16 21V4.5A1.5 1.5 0 0 0 14.5 3h-5A1.5 1.5 0 0 0 8 4.5V21" />
                    <path d="M10.5 11h.01M13.5 11h.01M10.5 14.5h.01M13.5 14.5h.01" />
                </svg>
            )}
            title="Welcome to SIL Monitoring"
            subtitle={SUBTITLES[step - 1]}
            steps={STEPS}
            current={step}
            onStepSelect={goTo}
            error={error}
            footnote="You can update these details later from your Company Profile page."
        >
            {/* ══ STEP 1: Company details ══ */}
            {step === 1 && (
                <form onSubmit={nextStep} className="onb-form">
                    <div className="onb-field company-onboarding-company-field">
                        <label className="onb-label">Company Name <span className="req">*</span></label>
                        <input
                            className="onb-input"
                            value={companySearch}
                            onChange={e => { setCompanySearch(e.target.value); setCompanyName(e.target.value); setSelectedCompanyId(''); }}
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

                    <div className="onb-grid-2">
                        <div className="onb-field">
                            <label className="onb-label">Company Type / Industry <span className="req">*</span></label>
                            <input
                                className="onb-input"
                                value={industry}
                                onChange={event => setIndustry(event.target.value)}
                                placeholder="e.g. Information Technology"
                                required
                            />
                        </div>
                        <div className="onb-field">
                            <label className="onb-label">Website <span className="onb-optional">(Optional)</span></label>
                            <input
                                type="url"
                                className="onb-input"
                                value={website}
                                onChange={event => setWebsite(event.target.value)}
                                placeholder="https://yourcompany.com"
                            />
                        </div>
                    </div>

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

                    <OnboardingActions />
                </form>
            )}

            {/* ══ STEP 2: Company address ══ */}
            {step === 2 && (
                <form onSubmit={nextStep} className="onb-form">
                    <p className="onb-section-title">Office address</p>
                    <AddressLevelsSelector levels={addressLevels} chrome={ONB_ADDRESS_CHROME} />
                    <OnboardingActions onBack={handleBack} />
                </form>
            )}

            {/* ══ STEP 3: Supervisor / contact person ══ */}
            {step === 3 && (
                <form onSubmit={nextStep} className="onb-form">
                    <p className="onb-section-title">Contact person</p>
                    <NameFieldsGroup value={contactName} onChange={setContactName} chrome={ONB_NAME_CHROME} />

                    <div className="onb-grid-2">
                        <div className="onb-field">
                            <label className="onb-label">Position <span className="req">*</span></label>
                            <input
                                className="onb-input"
                                value={contactPosition}
                                onChange={event => setContactPosition(event.target.value)}
                                placeholder="e.g. HR Manager"
                                required
                            />
                        </div>
                        <div className="onb-field">
                            <label className="onb-label">Company Email <span className="req">*</span></label>
                            <input
                                type="email"
                                className="onb-input"
                                value={contactEmail}
                                onChange={event => setContactEmail(event.target.value)}
                                placeholder="supervisor@company.com"
                                required
                            />
                        </div>
                    </div>

                    <div className="onb-field">
                        <label className="onb-label">Contact Number <span className="req">*</span></label>
                        <input
                            type="tel"
                            className="onb-input"
                            value={contactPhone}
                            onChange={event => setContactPhone(event.target.value)}
                            placeholder="09XX XXX XXXX"
                            required
                        />
                    </div>

                    <div className="onb-notice">
                        <p>This account will become the primary supervisor login after your application is approved.</p>
                    </div>

                    <OnboardingActions onBack={handleBack} />
                </form>
            )}

            {/* ══ STEP 4: Review & Confirm ══ */}
            {step === 4 && (
                <form onSubmit={submitApplication} className="onb-form">
                    {logoPreview && (
                        <div className="company-onboarding-review-logo">
                            <img src={logoPreview} alt="Company logo" />
                        </div>
                    )}

                    <ReviewSummary sections={reviewSections} onEdit={goTo} />

                    <label className="onb-checkbox">
                        <input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} />
                        <span>I confirm these details are accurate and authorize Asian College to review this company partnership application.</span>
                    </label>

                    <OnboardingActions
                        onBack={handleBack}
                        busy={saving}
                        nextLabel={saving ? 'Submitting...' : 'Confirm & Submit Application'}
                    />
                </form>
            )}
        </OnboardingShell>
    );
};

export default CompanyOnboardingView;
