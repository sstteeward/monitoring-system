import React, { useMemo, useState } from 'react';
import usePsLocation from '../hooks/usePsLocation';
import { supabase } from '../lib/supabaseClient';
import type { Profile } from '../services/profileService';
import CustomSelect from './CustomSelect';
import { clearRegistrationName, namesFromUserMetadata, pickNameField, readRegistrationName } from '../utils/registrationName';
import './AdviserOnboardingView.css';

interface AdviserOnboardingViewProps {
    profile: Profile;
    onComplete: () => void | Promise<void>;
}

const resolveOnboardingNames = (profile: Profile, metadata?: Record<string, unknown> | null) => {
    const stored = readRegistrationName(profile.auth_user_id);
    const meta = namesFromUserMetadata(metadata);
    return {
        firstName: pickNameField(profile.first_name, meta.first_name, stored?.first_name),
        middleName: pickNameField(profile.middle_name, meta.middle_name, stored?.middle_name),
        lastName: pickNameField(profile.last_name, meta.last_name, stored?.last_name),
    };
};

export default function AdviserOnboardingView({ profile, onComplete }: AdviserOnboardingViewProps) {
    const initialNames = resolveOnboardingNames(profile);
    const [step, setStep] = useState<1 | 2 | 3>(1);

    // ── Step 1: Personal Info ──
    const [firstName, setFirstName] = useState(initialNames.firstName);
    const [middleName, setMiddleName] = useState(initialNames.middleName);
    const [lastName, setLastName] = useState(initialNames.lastName);
    const [suffix, _setSuffix] = useState('');
    const [birthday, setBirthday] = useState(profile.birthday ?? '');
    const [contactNumber, setContactNumber] = useState(profile.contact_number ?? '');

    // ── Step 2: Address Info ──
    const [country] = useState(profile.country ?? 'Philippines');
    const [regionCode, setRegionCode] = useState(profile.region_code ?? '');
    const [regionName, setRegionName] = useState(profile.region ?? '');
    const [provinceCode, setProvinceCode] = useState(profile.province_code ?? '');
    const [provinceName, setProvinceName] = useState(profile.province ?? '');
    const [cityCode, setCityCode] = useState(profile.city_municipality_code ?? '');
    const [cityMunicipalityName, setCityMunicipalityName] = useState(profile.city_municipality ?? '');
    const [barangayCode, setBarangayCode] = useState(profile.barangay_code ?? '');
    const [barangayName, setBarangayName] = useState(profile.barangay ?? '');
    const [houseStreet, setHouseStreet] = useState(profile.house_street ?? '');

    // ── Step 3: Professional / Adviser Info ──
    const [adviserType, setAdviserType] = useState<'HT Adviser' | 'IT Adviser'>(
        (profile.adviser_type as 'HT Adviser' | 'IT Adviser') || (profile.course === 'DHT' ? 'HT Adviser' : 'IT Adviser')
    );
    const [department, setDepartment] = useState(
        profile.department || (adviserType === 'HT Adviser' ? 'Hospitality Management' : 'Information Technology')
    );
    const [position, setPosition] = useState('Faculty / Adviser');
    const [employeeId, setEmployeeId] = useState('');

    // Status / Errors
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // PSGC cascading location
    const {
        regions,
        loading: locationLoading,
        getProvincesByRegion,
        getCitiesByProvince,
        getBarangaysByCity,
        getRegionByCode,
        getProvinceByCode,
        getCityByCode,
        getBarangayByCode,
    } = usePsLocation();

    const provinceOptions = useMemo(() => regionCode ? getProvincesByRegion(regionCode) : [], [regionCode, getProvincesByRegion]);
    const cityOptions = useMemo(() => provinceCode ? getCitiesByProvince(provinceCode) : [], [provinceCode, getCitiesByProvince]);
    const barangayOptions = useMemo(() => cityCode ? getBarangaysByCity(cityCode) : [], [cityCode, getBarangaysByCity]);

    const regionSelectOptions = useMemo(() =>
        regions.map(r => ({ value: r.region_code, label: r.region_name, code: r.region_code })),
        [regions]
    );

    const provinceSelectOptions = useMemo(() =>
        provinceOptions.map(p => ({ value: p.province_code, label: p.province_name, code: p.province_code })),
        [provinceOptions]
    );

    const citySelectOptions = useMemo(() =>
        cityOptions.map(c => ({ value: c.city_code, label: c.city_name, code: c.city_code })),
        [cityOptions]
    );

    const barangaySelectOptions = useMemo(() =>
        barangayOptions.map(b => ({ value: b.barangay_code, label: b.barangay_name, code: b.barangay_code })),
        [barangayOptions]
    );

    const formatStructuredAddress = () => {
        const parts = [
            houseStreet.trim(),
            barangayName ? `Barangay ${barangayName}` : '',
            cityMunicipalityName,
            provinceName,
            country || 'Philippines'
        ];
        return parts.filter(Boolean).join(', ');
    };

    const handleAdviserTypeChange = (type: 'HT Adviser' | 'IT Adviser') => {
        setAdviserType(type);
        if (type === 'HT Adviser') {
            setDepartment('Hospitality Management');
        } else {
            setDepartment('Information Technology');
        }
    };

    const validateStep1 = () => {
        if (!firstName.trim() || !lastName.trim()) {
            setError('Please enter your first and last name.');
            return false;
        }
        if (!birthday) {
            setError('Please provide your date of birth.');
            return false;
        }
        const bdate = new Date(birthday);
        const today = new Date();
        const age = today.getFullYear() - bdate.getFullYear();
        if (isNaN(bdate.getTime()) || bdate > today || age < 18) {
            setError('Please enter a valid birthday (minimum age 18).');
            return false;
        }
        if (!contactNumber.trim()) {
            setError('Please enter your active contact number.');
            return false;
        }
        const cleanPhone = contactNumber.replace(/\D/g, '');
        if (cleanPhone.length < 10 || cleanPhone.length > 13) {
            setError('Please enter a valid phone number (e.g. 09123456789).');
            return false;
        }
        setError(null);
        return true;
    };

    const validateStep2 = () => {
        if (!regionCode || !provinceCode || !cityCode || !barangayCode || !houseStreet.trim()) {
            setError('Please complete all address fields.');
            return false;
        }
        setError(null);
        return true;
    };

    const validateStep3 = () => {
        if (!adviserType) {
            setError('Please select your adviser specialization.');
            return false;
        }
        if (!department.trim()) {
            setError('Please enter or confirm your department.');
            return false;
        }
        if (!position.trim()) {
            setError('Please enter your academic title or position.');
            return false;
        }
        setError(null);
        return true;
    };

    const handleNext = (e: React.FormEvent) => {
        e.preventDefault();
        if (step === 1) {
            if (validateStep1()) setStep(2);
        } else if (step === 2) {
            if (validateStep2()) setStep(3);
        }
    };

    const handleBack = () => {
        setError(null);
        if (step === 3) setStep(2);
        else if (step === 2) setStep(1);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateStep3()) return;

        setSaving(true);
        setError(null);

        try {
            const authId = profile.auth_user_id;
            const fullAddress = formatStructuredAddress();
            const courseCode = adviserType === 'HT Adviser' ? 'DHT' : 'DIT';

            const basePayload: Record<string, any> = {
                first_name: firstName.trim(),
                middle_name: middleName.trim() || null,
                last_name: lastName.trim() + (suffix.trim() ? ` ${suffix.trim()}` : ''),
                birthday: birthday || null,
                contact_number: contactNumber.trim(),
                address: fullAddress,
                adviser_type: adviserType,
                course: courseCode,
                department: department.trim(),
                account_type: 'adviser',
            };

            const saveProfile = async (payload: Record<string, any>) => {
                const { data, error: updateError } = await supabase
                    .from('profiles')
                    .update(payload)
                    .eq('auth_user_id', authId)
                    .select('id');

                if (updateError) {
                    throw updateError;
                }

                if (!data?.length) {
                    const { error: upsertError } = await supabase
                        .from('profiles')
                        .upsert({ auth_user_id: authId, ...payload }, { onConflict: 'auth_user_id' });
                    if (upsertError) throw upsertError;
                }
            };

            const isMissingColumnError = (err: any) => {
                const msg = (err?.message || String(err || '')).toLowerCase();
                return msg.includes('could not find') || msg.includes('schema cache') || msg.includes('does not exist');
            };

            try {
                // First try saving with granular location fields
                await saveProfile({
                    ...basePayload,
                    country: country || 'Philippines',
                    region: regionName.trim() || null,
                    region_code: regionCode.trim() || null,
                    province: provinceName.trim() || null,
                    province_code: provinceCode.trim() || null,
                    city_municipality: cityMunicipalityName.trim() || null,
                    city_municipality_code: cityCode.trim() || null,
                    barangay: barangayName.trim() || null,
                    barangay_code: barangayCode.trim() || null,
                    house_street: houseStreet.trim() || null,
                });
            } catch (err: any) {
                if (isMissingColumnError(err)) {
                    // Fallback to base profile columns
                    await saveProfile(basePayload);
                } else {
                    throw err;
                }
            }

            clearRegistrationName();
            await onComplete();
        } catch (err: any) {
            console.error('Error saving adviser onboarding:', err);
            setError(err.message || 'Failed to complete adviser profile. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="adviser-onboarding-page">
            <div className="adviser-onboarding-container">
                {/* Brand Header with standard circular icon (matching Student & Company onboarding) */}
                <div className="adviser-onboarding-header">
                    <div className="adviser-onboarding-top-icon">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                            <circle cx="8.5" cy="7" r="4" />
                            <polyline points="17 11 19 13 23 9" />
                        </svg>
                    </div>
                    <h1 className="adviser-onboarding-title">Welcome, Adviser!</h1>
                    <p className="adviser-onboarding-subtitle">
                        {step === 1 && "Let's confirm your personal information before we get started."}
                        {step === 2 && "Where are you currently residing?"}
                        {step === 3 && "What is your adviser specialization?"}
                    </p>
                </div>

                {/* Progress Dots (Matching other onboarding screens) */}
                <div className="adviser-onboarding-progress-dots">
                    {[1, 2, 3].map(s => (
                        <div
                            key={s}
                            className={`adviser-progress-pill ${s <= step ? 'active' : ''} ${s === step ? 'current' : ''}`}
                        />
                    ))}
                </div>

                {/* Main Card */}
                <div className="adviser-onboarding-card">
                    {error && (
                        <div className="adviser-error-banner" role="alert">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                            <span>{error}</span>
                        </div>
                    )}

                    {/* ══ STEP 1: Personal Information ══ */}
                    {step === 1 && (
                        <form onSubmit={handleNext} className="adviser-form-stack">
                            <div className="adviser-info-notice">
                                <p>✓ Your name from account creation is shown below. You can edit if needed.</p>
                            </div>

                            <div className="adviser-form-grid-3">
                                <div className="adviser-form-field">
                                    <label className="adviser-form-label">
                                        First Name <span className="req">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        className="adviser-form-input"
                                        value={firstName}
                                        onChange={e => setFirstName(e.target.value.replace(/\b\w/g, c => c.toUpperCase()))}
                                        placeholder="First Name"
                                        required
                                    />
                                </div>
                                <div className="adviser-form-field">
                                    <label className="adviser-form-label">Middle Name</label>
                                    <input
                                        type="text"
                                        className="adviser-form-input"
                                        value={middleName}
                                        onChange={e => setMiddleName(e.target.value.replace(/\b\w/g, c => c.toUpperCase()))}
                                        placeholder="Middle Name"
                                    />
                                </div>
                                <div className="adviser-form-field">
                                    <label className="adviser-form-label">
                                        Last Name <span className="req">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        className="adviser-form-input"
                                        value={lastName}
                                        onChange={e => setLastName(e.target.value.replace(/\b\w/g, c => c.toUpperCase()))}
                                        placeholder="Last Name"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="adviser-form-grid-2">
                                <div className="adviser-form-field">
                                    <label className="adviser-form-label">
                                        Birthday <span className="req">*</span>
                                    </label>
                                    <input
                                        type="date"
                                        className="adviser-form-input"
                                        value={birthday}
                                        onChange={e => setBirthday(e.target.value)}
                                        max={new Date().toISOString().split('T')[0]}
                                        required
                                    />
                                </div>
                                <div className="adviser-form-field">
                                    <label className="adviser-form-label">
                                        Contact No. <span className="req">*</span>
                                    </label>
                                    <input
                                        type="tel"
                                        className="adviser-form-input"
                                        value={contactNumber}
                                        onChange={e => setContactNumber(e.target.value)}
                                        placeholder="e.g. 0912..."
                                        required
                                    />
                                </div>
                            </div>

                            <div className="adviser-onboarding-actions" style={{ justifyContent: 'flex-end' }}>
                                <button type="submit" className="adviser-btn-next">
                                    Continue →
                                </button>
                            </div>
                        </form>
                    )}

                    {/* ══ STEP 2: Address Information ══ */}
                    {step === 2 && (
                        <form onSubmit={handleNext} className="adviser-form-stack">
                            <div className="adviser-form-grid-2">
                                <div className="adviser-form-field">
                                    <label className="adviser-form-label">Country</label>
                                    <input type="text" className="adviser-form-input" value={country} disabled />
                                </div>
                                <div className="adviser-form-field">
                                    <label className="adviser-form-label">
                                        Region <span className="req">*</span>
                                    </label>
                                    <CustomSelect
                                        value={regionCode}
                                        options={regionSelectOptions}
                                        placeholder={locationLoading ? "Loading regions..." : "Select Region"}
                                        searchable
                                        onChange={(val) => {
                                            setRegionCode(val);
                                            const r = getRegionByCode(val);
                                            setRegionName(r?.region_name ?? '');
                                            setProvinceCode('');
                                            setProvinceName('');
                                            setCityCode('');
                                            setCityMunicipalityName('');
                                            setBarangayCode('');
                                            setBarangayName('');
                                        }}
                                    />
                                </div>
                            </div>

                            <div className="adviser-form-grid-2">
                                <div className="adviser-form-field">
                                    <label className="adviser-form-label">
                                        Province <span className="req">*</span>
                                    </label>
                                    <CustomSelect
                                        value={provinceCode}
                                        options={provinceSelectOptions}
                                        placeholder={!regionCode ? "Select Region first" : "Select Province"}
                                        disabled={!regionCode}
                                        searchable
                                        onChange={(val) => {
                                            setProvinceCode(val);
                                            const p = getProvinceByCode(val);
                                            setProvinceName(p?.province_name ?? '');
                                            setCityCode('');
                                            setCityMunicipalityName('');
                                            setBarangayCode('');
                                            setBarangayName('');
                                        }}
                                    />
                                </div>
                                <div className="adviser-form-field">
                                    <label className="adviser-form-label">
                                        City / Municipality <span className="req">*</span>
                                    </label>
                                    <CustomSelect
                                        value={cityCode}
                                        options={citySelectOptions}
                                        placeholder={!provinceCode ? "Select Province first" : "Select City / Municipality"}
                                        disabled={!provinceCode}
                                        searchable
                                        onChange={(val) => {
                                            setCityCode(val);
                                            const c = getCityByCode(val);
                                            setCityMunicipalityName(c?.city_name ?? '');
                                            setBarangayCode('');
                                            setBarangayName('');
                                        }}
                                    />
                                </div>
                            </div>

                            <div className="adviser-form-grid-2">
                                <div className="adviser-form-field">
                                    <label className="adviser-form-label">
                                        Barangay <span className="req">*</span>
                                    </label>
                                    <CustomSelect
                                        value={barangayCode}
                                        options={barangaySelectOptions}
                                        placeholder={!cityCode ? "Select city/municipality first" : "Select Barangay"}
                                        disabled={!cityCode}
                                        searchable
                                        onChange={(val) => {
                                            setBarangayCode(val);
                                            const b = getBarangayByCode(val);
                                            setBarangayName(b?.barangay_name ?? '');
                                        }}
                                    />
                                </div>
                                <div className="adviser-form-field">
                                    <label className="adviser-form-label">
                                        House No. / Street <span className="req">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        className="adviser-form-input"
                                        value={houseStreet}
                                        onChange={e => setHouseStreet(e.target.value)}
                                        placeholder="House number, street name"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="adviser-onboarding-actions">
                                <button type="button" className="adviser-btn-back" onClick={handleBack}>
                                    ← Back
                                </button>
                                <button type="submit" className="adviser-btn-next">
                                    Continue →
                                </button>
                            </div>
                        </form>
                    )}

                    {/* ══ STEP 3: Professional / Adviser Information ══ */}
                    {step === 3 && (
                        <form onSubmit={handleSubmit} className="adviser-form-stack">
                            <div className="adviser-form-field">
                                <label className="adviser-form-label">
                                    Adviser Specialization <span className="req">*</span>
                                </label>
                                <div className="adviser-type-cards">
                                    <div
                                        className={`adviser-type-card ${adviserType === 'HT Adviser' ? 'selected' : ''}`}
                                        onClick={() => handleAdviserTypeChange('HT Adviser')}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleAdviserTypeChange('HT Adviser'); }}
                                    >
                                        <div className="adviser-type-title">HT Adviser</div>
                                        <div className="adviser-type-badge">Hospitality Technology</div>
                                        <p className="adviser-type-desc">
                                            Assigned to DHT sections.
                                        </p>
                                    </div>

                                    <div
                                        className={`adviser-type-card ${adviserType === 'IT Adviser' ? 'selected' : ''}`}
                                        onClick={() => handleAdviserTypeChange('IT Adviser')}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleAdviserTypeChange('IT Adviser'); }}
                                    >
                                        <div className="adviser-type-title">IT Adviser</div>
                                        <div className="adviser-type-badge">Information Technology</div>
                                        <p className="adviser-type-desc">
                                            Assigned to DIT sections.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="adviser-form-grid-2">
                                <div className="adviser-form-field">
                                    <label className="adviser-form-label">
                                        Department <span className="req">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        className="adviser-form-input"
                                        value={department}
                                        onChange={e => setDepartment(e.target.value)}
                                        placeholder="e.g. Hospitality Management"
                                        required
                                    />
                                </div>
                                <div className="adviser-form-field">
                                    <label className="adviser-form-label">
                                        Position / Title <span className="req">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        className="adviser-form-input"
                                        value={position}
                                        onChange={e => setPosition(e.target.value)}
                                        placeholder="e.g. Section Adviser"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="adviser-form-field">
                                <label className="adviser-form-label">
                                    Faculty ID <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(Optional)</span>
                                </label>
                                <input
                                    type="text"
                                    className="adviser-form-input"
                                    value={employeeId}
                                    onChange={e => setEmployeeId(e.target.value)}
                                    placeholder="e.g. FAC-2026-089"
                                />
                            </div>

                            {/* Section Assignment Notice */}
                            <div className="adviser-info-notice">
                                <p><strong>Section Assignment:</strong> Advisers do not choose sections during onboarding. The SIL Coordinator will assign your handled section(s) upon review and activation.</p>
                            </div>

                            <div className="adviser-onboarding-actions">
                                <button type="button" className="adviser-btn-back" onClick={handleBack} disabled={saving}>
                                    ← Back
                                </button>
                                <button type="submit" className="adviser-btn-next" disabled={saving}>
                                    {saving ? 'Completing Profile...' : 'Complete Onboarding →'}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
