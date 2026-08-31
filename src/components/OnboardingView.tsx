import React, { useEffect, useMemo, useState } from 'react';
import usePsLocation from '../hooks/usePsLocation';
import { supabase } from '../lib/supabaseClient';
import { adminService } from '../services/adminService';
import type { Profile } from '../services/profileService';
import { profileService } from '../services/profileService';
import CustomSelect from './CustomSelect';
import AdvancedLocationPickerMap from './AdvancedLocationPickerMap';
import type { GeoJSONPolygon } from '../utils/geoUtils';
import { clearRegistrationName, namesFromUserMetadata, pickNameField, readRegistrationName } from '../utils/registrationName';
import './OnboardingView.css';

interface Company { 
    id: string; 
    name: string; 
    address?: string;
    latitude?: number | null;
    longitude?: number | null;
    geofence_polygon?: GeoJSONPolygon | null;
    geofence_radius?: number | null;
}

interface OnboardingViewProps {
    profile: Profile;
    onComplete: (options?: { showWelcome?: boolean }) => void;
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

const OnboardingView: React.FC<OnboardingViewProps> = ({ profile, onComplete }) => {
    const initialNames = resolveOnboardingNames(profile);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [selectedCompanyId, setSelectedCompanyId] = useState('');
    const [search, setSearch] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [firstName, setFirstName] = useState(initialNames.firstName);
    const [middleName, setMiddleName] = useState(initialNames.middleName);
    const [lastName, setLastName] = useState(initialNames.lastName);
    const [birthday, setBirthday] = useState(profile.birthday ?? '');
    const [birthdayError, setBirthdayError] = useState<string | null>(null);
    const [contactNumber, setContactNumber] = useState(profile.contact_number ?? '');
    const [yearLevel, setYearLevel] = useState(profile.year_level ?? '');
    const [section, setSection] = useState(profile.section ?? '');
    const [course, setCourse] = useState(profile.course ?? '');
    const [department, setDepartment] = useState(profile.department ?? '');
    const [requiredHours, setRequiredHours] = useState(profile.required_ojt_hours ?? 500);
    const [saving, setSaving] = useState(false);
    const [requestedName, setRequestedName] = useState('');
    const [country, setCountry] = useState(profile.country ?? 'Philippines');
    const [regionCode, setRegionCode] = useState(profile.region_code ?? '');
    const [regionName, setRegionName] = useState(profile.region ?? '');
    const [provinceCode, setProvinceCode] = useState(profile.province_code ?? '');
    const [provinceName, setProvinceName] = useState(profile.province ?? '');
    const [cityCode, setCityCode] = useState(profile.city_municipality_code ?? '');
    const [cityMunicipalityName, setCityMunicipalityName] = useState(profile.city_municipality ?? '');
    const [barangayCode, setBarangayCode] = useState(profile.barangay_code ?? '');
    const [barangayName, setBarangayName] = useState(profile.barangay ?? '');
    const [houseStreet, setHouseStreet] = useState(profile.house_street ?? '');
    
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

    // CustomSelect options
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
        const parts = [houseStreet, barangayName ? `Barangay ${barangayName}` : '', cityMunicipalityName, provinceName, country || 'Philippines'];
        return parts.filter(Boolean).join(', ');
    };

    const getAgeCutoffDate = (): string => {
        const today = new Date();
        const cutoff = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
        const year = cutoff.getFullYear();
        const month = String(cutoff.getMonth() + 1).padStart(2, '0');
        const day = String(cutoff.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const isAtLeast18 = (value: string): boolean => {
        if (!value) return false;
        const birthDate = new Date(`${value}T00:00:00`);
        if (Number.isNaN(birthDate.getTime())) return false;

        const today = new Date();
        const cutoffDate = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
        return birthDate <= cutoffDate;
    };

    const birthdayMaxDate = getAgeCutoffDate();

    useEffect(() => {
        if (!birthday) {
            setBirthdayError(null);
            return;
        }
        setBirthdayError(isAtLeast18(birthday)
            ? null
            : '⚠️ You must be at least 18 years old to participate in the SIL/OJT program.');
    }, [birthday]);

    useEffect(() => {
        let isMounted = true;

        const applyNames = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!isMounted) return;
            const names = resolveOnboardingNames(profile, user?.user_metadata);
            setFirstName(prev => pickNameField(names.firstName, prev));
            setMiddleName(prev => names.middleName || prev);
            setLastName(prev => pickNameField(names.lastName, prev));
        };

        setFirstName(prev => pickNameField(profile.first_name, prev));
        setMiddleName(prev => pickNameField(profile.middle_name, prev));
        setLastName(prev => pickNameField(profile.last_name, prev));
        setBirthday(profile.birthday ?? '');
        setContactNumber(profile.contact_number ?? '');
        setYearLevel(profile.year_level ?? '');
        setSection(profile.section ?? '');
        setCourse(profile.course ?? '');
        setDepartment(profile.department ?? '');
        setRequiredHours(profile.required_ojt_hours ?? 500);
        setCountry(profile.country ?? 'Philippines');
        setRegionCode(profile.region_code ?? '');
        setRegionName(profile.region ?? '');
        setProvinceCode(profile.province_code ?? '');
        setProvinceName(profile.province ?? '');
        setCityCode(profile.city_municipality_code ?? '');
        setCityMunicipalityName(profile.city_municipality ?? '');
        setBarangayCode(profile.barangay_code ?? '');
        setBarangayName(profile.barangay ?? '');
        setHouseStreet(profile.house_street ?? '');
        void applyNames();

        return () => {
            isMounted = false;
        };
    }, [profile]);

    useEffect(() => {
        let isMounted = true;

        const reloadLatestProfile = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user?.id || !isMounted) return;

                const { data, error } = await supabase
                    .from('profiles')
                    .select('first_name, middle_name, last_name, birthday, address, country, region, region_code, province, province_code, city_municipality, city_municipality_code, barangay, barangay_code, house_street, contact_number, year_level, section, course, department, required_ojt_hours')
                    .eq('auth_user_id', user.id)
                    .maybeSingle();

                if (error || !isMounted) return;

                const names = resolveOnboardingNames(
                    {
                        ...profile,
                        ...(data ?? {}),
                    } as Profile,
                    user.user_metadata
                );

                setFirstName(prev => pickNameField(names.firstName, prev));
                setMiddleName(prev => names.middleName || prev);
                setLastName(prev => pickNameField(names.lastName, prev));

                if (!data) return;

                setBirthday(data.birthday ?? '');
                setCountry(data.country ?? 'Philippines');
                setRegionCode(data.region_code ?? '');
                setRegionName(data.region ?? '');
                setProvinceCode(data.province_code ?? '');
                setProvinceName(data.province ?? '');
                setCityCode(data.city_municipality_code ?? '');
                setCityMunicipalityName(data.city_municipality ?? '');
                setBarangayCode(data.barangay_code ?? '');
                setBarangayName(data.barangay ?? '');
                setHouseStreet(data.house_street ?? '');
                setContactNumber(data.contact_number ?? '');
                setYearLevel(data.year_level ?? '');
                setSection(data.section ?? '');
                setCourse(data.course ?? '');
                setDepartment(data.department ?? '');
                setRequiredHours(data.required_ojt_hours ?? 500);
            } catch (err) {
                console.warn('[Onboarding] Unable to refresh latest profile from DB:', err);
            }
        };

        void reloadLatestProfile();
        return () => {
            isMounted = false;
        };
    }, [profile?.auth_user_id, profile?.id]);
    
    // New Geofence state for company request
    const [showNewCompanyForm, setShowNewCompanyForm] = useState(false);
    const [newCompanyLat, setNewCompanyLat] = useState<number | null>(null);
    const [newCompanyLng, setNewCompanyLng] = useState<number | null>(null);
    const [newCompanyRadius] = useState<number>(100);
    const [newCompanyPolygon, setNewCompanyPolygon] = useState<GeoJSONPolygon | null>(null);
    const [pendingRequest, setPendingRequest] = useState<{ name: string; status: string; requested_by: string } | null>(null);

    const [error, setError] = useState<string | null>(null);
    const [step, setStep] = useState<1 | 2>(1);
    const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
    const [courses, setCourses] = useState<{ id: string; name: string; description?: string }[]>([]);

    useEffect(() => {
        let isMounted = true;

        const checkCompanyRequestStatus = async () => {
            const authId = (await supabase.auth.getUser()).data.user?.id;
            if (!authId || !isMounted) return;

            const { data: pending } = await supabase
                .from('company_requests')
                .select('*')
                .eq('requested_by', authId)
                .eq('status', 'pending')
                .limit(1)
                .maybeSingle();

            if (!isMounted) return;

            if (pending) {
                setPendingRequest(pending);
                return;
            }

            const academicComplete = Boolean(profile.course && profile.department && profile.year_level);
            if (!academicComplete) return;

            const healed = await profileService.attachApprovedCompanyIfNeeded(profile, authId);
            if (isMounted && healed.company_id) {
                onComplete({ showWelcome: false });
            }
        };

        void checkCompanyRequestStatus();

        supabase.from('companies').select('id, name, address, latitude, longitude, geofence_polygon, geofence_radius').order('name').then(({ data }) => {
            setCompanies(data ?? []);
        });
        adminService.getDepartments().then(setDepartments);
        adminService.getCourses().then(setCourses);

        return () => {
            isMounted = false;
        };
    }, [profile.auth_user_id]);

    const filtered = companies.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase())
    );

    const selectedCompany = companies.find(c => c.id === selectedCompanyId);

    const handleSelectCompany = (c: Company) => {
        setSelectedCompanyId(c.id);
        setSearch(c.name);
        setShowDropdown(false);
    };

    const handleRequestCompanyClick = () => {
        const name = search.trim();
        if (!name) return;
        setRequestedName(name);
        setShowNewCompanyForm(true);
        setSelectedCompanyId('');
        setShowDropdown(false);
    };


    const handleNext = (e: React.FormEvent) => {
        e.preventDefault();

        if (!birthday) {
            setBirthdayError('⚠️ You must be at least 18 years old to participate in the SIL/OJT program.');
            setError('Please fill in all required fields.');
            return;
        }

        if (!isAtLeast18(birthday)) {
            setBirthdayError('⚠️ You must be at least 18 years old to participate in the SIL/OJT program.');
            setError('⚠️ You must be at least 18 years old to participate in the SIL/OJT program.');
            return;
        }

        if (!country.trim() || !regionCode.trim() || !provinceCode.trim() || !cityCode.trim() || !barangayCode.trim() || !houseStreet.trim() || !contactNumber.trim() || !yearLevel.trim() || !section.trim() || !course.trim() || !department.trim()) {
            setError('Please fill in all required fields.');
            return;
        }
        setError(null);
        setShowDropdown(false);
        setStep(2);
    };

    const getErrorMessage = (err: unknown) => {
        if (!err) return 'Failed to save. Please try again.';
        if (typeof err === 'string' && err.trim()) return err;
        if (err instanceof Error && err.message.trim()) return err.message;
        if (typeof err === 'object') {
            const e = err as { message?: string; details?: string; hint?: string; error?: string };
            const text = [e.message, e.details, e.hint, e.error].filter(value => typeof value === 'string' && value.trim()).join(' — ');
            if (text) return text;
        }
        return 'Failed to save. Please try again.';
    };

    const isMissingColumnError = (message: string) =>
        /could not find the .* column|schema cache|column .* does not exist/i.test(message);

    const submitCompanyRequest = async (authId: string) => {
        const payloads: Record<string, unknown>[] = [
            {
                name: requestedName.trim() || search.trim(),
                student_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
                requested_by: authId,
                status: 'pending',
                request_type: 'student_company',
                latitude: newCompanyLat,
                longitude: newCompanyLng,
                geofence_radius: newCompanyRadius,
                geofence_polygon: newCompanyPolygon,
            },
            {
                name: requestedName.trim() || search.trim(),
                student_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
                requested_by: authId,
                status: 'pending',
                request_type: 'student_company',
            },
            {
                name: requestedName.trim() || search.trim(),
                student_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
                requested_by: authId,
                status: 'pending',
            },
        ];

        let lastError: unknown = null;
        for (const payload of payloads) {
            const { error } = await supabase.from('company_requests').insert(payload);
            if (!error) return;
            lastError = error;
            if (!isMissingColumnError(getErrorMessage(error))) throw error;
        }
        throw lastError;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const matchedCompany = selectedCompanyId
            ? companies.find(c => c.id === selectedCompanyId)
            : companies.find(c => c.name.trim().toLowerCase() === search.trim().toLowerCase());
        const companyIdToSave = selectedCompanyId || matchedCompany?.id || '';

        if (!companyIdToSave && !showNewCompanyForm) {
            setError('Please select your internship company or request a new one.');
            return;
        }

        if (!birthday || !isAtLeast18(birthday)) {
            setBirthdayError('⚠️ You must be at least 18 years old to participate in the SIL/OJT program.');
            setError('⚠️ You must be at least 18 years old to participate in the SIL/OJT program.');
            return;
        }

        if (!country.trim() || !regionCode.trim() || !provinceCode.trim() || !cityCode.trim() || !barangayCode.trim() || !houseStreet.trim()) {
            setError('Please complete your address information before continuing.');
            return;
        }

        setSaving(true);
        setError(null);
        try {
            const authId = (await supabase.auth.getUser()).data.user?.id;
            if (!authId) {
                throw new Error('Your session is no longer valid. Please log in again.');
            }

            const { data: ageCheck, error: ageCheckError } = await supabase.rpc('validate_student_age_eligibility', {
                p_birth_date: birthday,
            });

            if (ageCheckError) {
                console.warn('[Onboarding] DB age validation unavailable or failed:', ageCheckError);
            }

            if (ageCheck === false || (typeof ageCheck === 'boolean' && !ageCheck)) {
                setBirthdayError('⚠️ You must be at least 18 years old to participate in the SIL/OJT program.');
                setError('⚠️ You must be at least 18 years old to participate in the SIL/OJT program.');
                return;
            }

            const selectedDept = departments.find(d => d.name === department.trim());
            const fullAddress = formatStructuredAddress();

            if (showNewCompanyForm) {
                await submitCompanyRequest(authId);
            }

            const profilePayload: Record<string, unknown> = {
                first_name: firstName.trim(),
                middle_name: middleName.trim() || null,
                last_name: lastName.trim(),
                birthday: birthday || null,
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
                address: fullAddress || null,
                contact_number: contactNumber.trim() || null,
                year_level: yearLevel.trim() || null,
                section: section.trim() || null,
                course: course.trim() || null,
                department: department.trim() || null,
                required_ojt_hours: Number.isFinite(requiredHours) ? requiredHours : 500,
            };
            if (selectedDept?.id) profilePayload.department_id = selectedDept.id;
            if (companyIdToSave) profilePayload.company_id = companyIdToSave;

            const saveProfile = async (payload: Record<string, unknown>) => {
                const { data, error } = await supabase
                    .from('profiles')
                    .update(payload)
                    .eq('auth_user_id', authId)
                    .select('id');
                if (error) throw error;
                if (!data?.length) {
                    throw new Error('Your profile could not be updated. Please try again.');
                }
            };

            try {
                await saveProfile(profilePayload);
            } catch (profileErr) {
                const message = getErrorMessage(profileErr);
                const fallbackPayload: Record<string, unknown> = {
                    first_name: firstName.trim(),
                    last_name: lastName.trim(),
                    birthday: birthday || null,
                    address: fullAddress || null,
                    contact_number: contactNumber.trim() || null,
                    year_level: yearLevel.trim() || null,
                    section: section.trim() || null,
                    course: course.trim() || null,
                    department: department.trim() || null,
                    required_ojt_hours: Number.isFinite(requiredHours) ? requiredHours : 500,
                };
                if (middleName.trim()) fallbackPayload.middle_name = middleName.trim();
                if (companyIdToSave) fallbackPayload.company_id = companyIdToSave;

                try {
                    await saveProfile(isMissingColumnError(message) ? fallbackPayload : { ...profilePayload, department_id: undefined });
                } catch (retryErr) {
                    if (!isMissingColumnError(getErrorMessage(retryErr))) throw retryErr;
                    await saveProfile(fallbackPayload);
                }
            }

            clearRegistrationName();

            if (showNewCompanyForm && !companyIdToSave) {
                setPendingRequest({ name: requestedName.trim() || search.trim(), status: 'pending', requested_by: authId || '' });
            } else {
                await onComplete({ showWelcome: true });
            }
        } catch (err: unknown) {
            console.error('[Onboarding] save failed:', err);
            const message = getErrorMessage(err);
            if (/at least 18 years old|under 18|18 years old/i.test(message)) {
                setBirthdayError('⚠️ You must be at least 18 years old to participate in the SIL/OJT program.');
                setError('⚠️ You must be at least 18 years old to participate in the SIL/OJT program.');
            } else {
                setError(message || 'Failed to save. Please try again.');
            }
        } finally {
            setSaving(false);
        }
    };

    if (pendingRequest) {
        return (
            <div style={{
                minHeight: '100vh', height: '100%', width: '100%',
                background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
            }}>
                <div className="glass-card" style={{ maxWidth: 450, padding: '2rem', textAlign: 'center', borderRadius: 20 }}>
                    <div style={{
                        width: 64, height: 64, borderRadius: '50%', background: 'rgba(245, 158, 11, 0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem'
                    }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                    </div>
                    <h2 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-bright)', fontSize: '1.4rem' }}>Pending Approval</h2>
                    <p style={{ color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '1.5rem', fontSize: '0.95rem' }}>
                        Your request to add the company <strong style={{ color: 'var(--text-bright)' }}>{pendingRequest.name}</strong> is currently pending approval by the coordinator.
                    </p>
                    <p style={{ color: 'var(--text-muted)', lineHeight: 1.5, fontSize: '0.95rem' }}>
                        You will be able to access your dashboard and start logging time once it is approved. We will notify you when that happens!
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div style={{
            minHeight: '100vh',
            height: '100%',
            width: '100%',
            background: 'var(--bg-page)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '1rem',
            overflowY: 'auto'
        }}>
            <div style={{ width: '100%', maxWidth: 520, margin: 'auto' }}>

                {/* Logo */}
                <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                    <div style={{
                        width: 60, height: 60, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        boxShadow: '0 8px 32px rgba(16,185,129,0.35)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 1rem',
                    }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                    </div>
                    <h1 style={{ fontSize: 'clamp(1.2rem, 6vw, 1.6rem)', lineHeight: 1.2, fontWeight: 800, color: 'var(--text-bright)', margin: 0, wordWrap: 'break-word' }}>
                        Welcome to SIL Monitoring
                    </h1>
                    <p style={{ color: 'var(--text-muted)', marginTop: '0.4rem', fontSize: 'clamp(0.8rem, 4vw, 0.9rem)', wordWrap: 'break-word' }}>
                        {step === 1 ? "Let's confirm your information before we get started." : "Where are you doing your internship?"}
                    </p>
                </div>

                {/* Progress dots */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '2rem' }}>
                    {[1, 2].map(s => (
                        <div key={s} style={{
                            width: s === step ? 28 : 10,
                            height: 10, borderRadius: 10,
                            background: s <= step ? '#10b981' : 'var(--bg-elevated)',
                            transition: 'width 0.3s, background 0.3s',
                        }} />
                    ))}
                </div>

                {/* Card */}
                <div className="glass-card" style={{
                    borderRadius: 20,
                    padding: '1.5rem 2rem',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
                    position: 'relative',
                    zIndex: 60,
                }}>
                    {error && (
                        <div style={{
                            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                            borderRadius: 10, padding: '0.7rem 1rem', marginBottom: '1.25rem',
                            color: '#f87171', fontSize: '0.85rem',
                        }}>{error}</div>
                    )}

                    {/* ── Step 1: Personal Info ── */}
                    {step === 1 && (
                        <form onSubmit={handleNext}>
                            <div className="onboarding-form-stack">
                                <div style={{ 
                                    background: 'rgba(16, 185, 129, 0.05)', 
                                    border: '1px solid rgba(16, 185, 129, 0.15)',
                                    borderRadius: 10,
                                    padding: '0.75rem 1rem',
                                }}>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                        ✓ Your name from account creation is shown below. You can edit if needed.
                                    </p>
                                </div>
                                
                                <div className="form-field-row">
                                    <div className="onboarding-field">
                                        <label style={labelSt}>First Name *</label>
                                        <input style={inputSt} value={firstName} onChange={e => setFirstName(e.target.value.replace(/\b\w/g, c => c.toUpperCase()))} placeholder="First" required />
                                    </div>
                                    <div className="onboarding-field">
                                        <label style={labelSt}>Middle Name</label>
                                        <input style={inputSt} value={middleName} onChange={e => setMiddleName(e.target.value.replace(/\b\w/g, c => c.toUpperCase()))} placeholder="Middle (Opt)" />
                                    </div>
                                    <div className="onboarding-field">
                                        <label style={labelSt}>Last Name *</label>
                                        <input style={inputSt} value={lastName} onChange={e => setLastName(e.target.value.replace(/\b\w/g, c => c.toUpperCase()))} placeholder="Last" required />
                                    </div>
                                </div>

                                <div className="form-field-row">
                                    <div className="onboarding-field">
                                        <label style={labelSt}>Birthday *</label>
                                        <input
                                            style={{ ...inputSt, borderColor: birthdayError ? '#f87171' : 'var(--border)' }}
                                            type="date"
                                            value={birthday}
                                            max={birthdayMaxDate}
                                            onChange={e => setBirthday(e.target.value)}
                                            required
                                        />
                                        {birthdayError && (
                                            <div style={{
                                                marginTop: '0.5rem',
                                                color: '#f87171',
                                                fontSize: '0.78rem',
                                                lineHeight: 1.4,
                                                fontWeight: 600,
                                            }}>
                                                {birthdayError}
                                            </div>
                                        )}
                                    </div>
                                    <div className="onboarding-field">
                                        <label style={labelSt}>Contact No. *</label>
                                        <input style={inputSt} type="tel" value={contactNumber} onChange={e => setContactNumber(e.target.value)} placeholder="e.g. 0912..." required />
                                    </div>
                                    <div className="onboarding-field">
                                        <label style={labelSt}>Required Hours</label>
                                        <input style={inputSt} type="number" min={0} value={requiredHours} onChange={e => setRequiredHours(Number(e.target.value))} />
                                    </div>
                                </div>

                                <div>
                                    <label style={labelSt}>Address *</label>

                                    <div className="onboarding-form-stack">
                                        <div>
                                            <label style={{ ...labelSt, textTransform: 'none', letterSpacing: '0.02em' }}>Country</label>
                                            <div style={{ ...inputWrapSt }}>
                                                <input value="Philippines" readOnly style={{ ...inputSt, background: 'var(--bg-elevated)', cursor: 'default', border: 'none', paddingLeft: 0, paddingRight: 0 }} />
                                            </div>
                                        </div>

                                        <div>
                                            <label style={{ ...labelSt, textTransform: 'none', letterSpacing: '0.02em' }}>Region</label>
                                            <CustomSelect
                                                value={regionCode}
                                                onChange={(val) => {
                                                    setRegionCode(val);
                                                    setRegionName(getRegionByCode(val)?.region_name ?? '');
                                                    setProvinceCode('');
                                                    setProvinceName('');
                                                    setCityCode('');
                                                    setCityMunicipalityName('');
                                                    setBarangayCode('');
                                                    setBarangayName('');
                                                }}
                                                options={regionSelectOptions}
                                                placeholder="Select Region"
                                                searchable={true}
                                                searchPlaceholder="Search region..."
                                                disabled={locationLoading || !regions.length}
                                                showClear
                                            />
                                        </div>

                                        <div className="form-field-row cols-2">
                                            <div>
                                                <label style={{ ...labelSt, textTransform: 'none', letterSpacing: '0.02em' }}>Province</label>
                                                <CustomSelect
                                                    value={provinceCode}
                                                    onChange={(val) => {
                                                        setProvinceCode(val);
                                                        setProvinceName(getProvinceByCode(val)?.province_name ?? '');
                                                        setCityCode('');
                                                        setCityMunicipalityName('');
                                                        setBarangayCode('');
                                                        setBarangayName('');
                                                    }}
                                                    options={provinceSelectOptions}
                                                    placeholder="Select Province"
                                                    searchable={true}
                                                    searchPlaceholder="Search province..."
                                                    disabled={!regionCode || locationLoading || !provinceOptions.length}
                                                    showClear
                                                />
                                            </div>
                                            <div>
                                                <label style={{ ...labelSt, textTransform: 'none', letterSpacing: '0.02em' }}>City / Municipality</label>
                                                <CustomSelect
                                                    value={cityCode}
                                                    onChange={(val) => {
                                                        setCityCode(val);
                                                        setCityMunicipalityName(getCityByCode(val)?.city_name ?? '');
                                                        setBarangayCode('');
                                                        setBarangayName('');
                                                    }}
                                                    options={citySelectOptions}
                                                    placeholder="Select City / Municipality"
                                                    searchable={true}
                                                    searchPlaceholder="Search city/municipality..."
                                                    disabled={!provinceCode || locationLoading || !cityOptions.length}
                                                    showClear
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label style={{ ...labelSt, textTransform: 'none', letterSpacing: '0.02em' }}>Barangay</label>
                                            <CustomSelect
                                                value={barangayCode}
                                                onChange={(val) => {
                                                    setBarangayCode(val);
                                                    setBarangayName(getBarangayByCode(val)?.barangay_name ?? '');
                                                }}
                                                options={barangaySelectOptions}
                                                placeholder={!cityCode ? "Select a city/municipality first" : "Select Barangay"}
                                                searchable={!!cityCode}
                                                searchPlaceholder="Search barangay..."
                                                disabled={!cityCode || locationLoading || !barangayOptions.length}
                                                showClear
                                            />
                                        </div>

                                        <div>
                                            <label style={{ ...labelSt, textTransform: 'none', letterSpacing: '0.02em' }}>House No. / Street</label>
                                            <div style={{ ...inputWrapSt }}>
                                                <input
                                                    value={houseStreet}
                                                    onChange={e => setHouseStreet(e.target.value)}
                                                    placeholder="House number, street name"
                                                    style={{ ...inputSt, border: 'none', paddingLeft: 0, paddingRight: 0 }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="form-field-row cols-2">
                                    <div>
                                        <label style={labelSt}>Course *</label>
                                        <CustomSelect
                                            value={course}
                                            onChange={setCourse}
                                            placeholder="Select Course"
                                            options={courses.map(c => ({
                                                value: c.description || c.name,
                                                label: c.description ? `${c.description} — ${c.name}` : c.name,
                                            }))}
                                        />
                                    </div>
                                    <div>
                                        <label style={labelSt}>Department *</label>
                                        <CustomSelect
                                            value={department}
                                            onChange={setDepartment}
                                            placeholder="Select Department"
                                            options={departments.map(d => ({ value: d.name, label: d.name }))}
                                        />
                                    </div>
                                </div>

                                <div className="form-field-row cols-2">
                                    <div>
                                        <label style={labelSt}>Year Level *</label>
                                        <CustomSelect
                                            value={yearLevel}
                                            onChange={setYearLevel}
                                            placeholder="Select Year"
                                            options={[
                                                { value: '1st Year', label: '1st Year' },
                                                { value: '2nd Year', label: '2nd Year' },
                                                { value: '3rd Year', label: '3rd Year' },
                                                { value: '4th Year', label: '4th Year' },
                                            ]}
                                        />
                                    </div>
                                    <div>
                                        <label style={labelSt}>Section *</label>
                                        <CustomSelect
                                            value={section}
                                            onChange={setSection}
                                            placeholder="Select Section"
                                            options={[
                                                { value: 'A', label: 'A' },
                                                { value: 'B', label: 'B' },
                                                { value: 'C', label: 'C' },
                                                { value: 'D', label: 'D' },
                                                { value: 'E', label: 'E' },
                                                { value: 'F', label: 'F' },
                                                { value: 'G', label: 'G' },
                                                { value: 'H', label: 'H' },
                                                { value: 'I', label: 'I' },
                                                { value: 'J', label: 'J' },
                                            ]}
                                        />
                                    </div>
                                </div>
                            </div>
                            <button
                                type="submit"
                                className="onboarding-continue-btn"
                                style={{
                                    ...btnPrimary,
                                    opacity: !birthday || !isAtLeast18(birthday) || !country.trim() || !regionCode.trim() || !provinceCode.trim() || !cityCode.trim() || !barangayCode.trim() || !houseStreet.trim() || !contactNumber.trim() || !yearLevel.trim() || !section.trim() || !course.trim() || !department.trim() ? 0.6 : 1,
                                    cursor: !birthday || !isAtLeast18(birthday) || !country.trim() || !regionCode.trim() || !provinceCode.trim() || !cityCode.trim() || !barangayCode.trim() || !houseStreet.trim() || !contactNumber.trim() || !yearLevel.trim() || !section.trim() || !course.trim() || !department.trim() ? 'not-allowed' : 'pointer',
                                }}
                                disabled={!birthday || !isAtLeast18(birthday) || !country.trim() || !regionCode.trim() || !provinceCode.trim() || !cityCode.trim() || !barangayCode.trim() || !houseStreet.trim() || !contactNumber.trim() || !yearLevel.trim() || !section.trim() || !course.trim() || !department.trim()}
                            >
                                Continue →
                            </button>
                        </form>
                    )}

                    {/* ── Step 2: Company ── */}
                    {step === 2 && (
                        <form onSubmit={handleSubmit}>
                            <div style={{ marginBottom: showDropdown ? '14rem' : '1.5rem', position: 'relative', transition: 'margin-bottom 0.2s' }}>
                                <label style={labelSt}>Internship Company</label>
                                <input
                                    style={inputSt}
                                    value={search}
                                    onChange={e => { 
                                        setSearch(e.target.value.replace(/\b\w/g, c => c.toUpperCase())); 
                                        setShowDropdown(true); 
                                        setSelectedCompanyId(''); 
                                    }}
                                    onFocus={() => setShowDropdown(true)}
                                    placeholder="Search or select a company…"
                                    autoComplete="off"
                                />
                                {/* Dropdown */}
                                {showDropdown && filtered.length > 0 && (
                                    <div style={{
                                        position: 'absolute', top: '100%', left: 0, right: 0,
                                        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                                        borderRadius: 12, zIndex: 100, maxHeight: 220, overflowY: 'auto',
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 4,
                                    }}>
                                        {filtered.map(c => (
                                            <div
                                                key={c.id}
                                                onClick={() => handleSelectCompany(c)}
                                                style={{
                                                    padding: '0.75rem 1rem', cursor: 'pointer',
                                                    borderBottom: '1px solid var(--border)',
                                                    transition: 'background 0.12s',
                                                    background: selectedCompanyId === c.id ? 'rgba(16,185,129,0.1)' : 'transparent',
                                                }}
                                                onMouseOver={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.08)')}
                                                onMouseOut={e => (e.currentTarget.style.background = selectedCompanyId === c.id ? 'rgba(16,185,129,0.1)' : 'transparent')}
                                            >
                                                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-bright)' }}>{c.name}</div>
                                                {c.address && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{c.address}</div>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {showDropdown && filtered.length === 0 && search.length > 0 && (
                                    <div style={{
                                        position: 'absolute', top: '100%', left: 0, right: 0,
                                        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                                        borderRadius: 12, zIndex: 100, marginTop: 4,
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden',
                                    }}>
                                        <div style={{ padding: '0.6rem 1rem', fontSize: '0.75rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                                            No companies match &ldquo;{search}&rdquo;
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleRequestCompanyClick}
                                            style={{
                                                width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem',
                                                padding: '0.75rem 1rem', background: 'transparent', border: 'none',
                                                cursor: 'pointer',
                                                color: '#10b981', fontSize: '0.88rem', fontWeight: 600,
                                                fontFamily: 'Inter, sans-serif', textAlign: 'left',
                                            }}
                                            onMouseOver={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.08)')}
                                            onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                                            Request &ldquo;{search}&rdquo;
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Request new company sub-form */}
                            {showNewCompanyForm && (
                                <div style={{
                                    background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)',
                                    borderRadius: 12, padding: '1.25rem', marginBottom: '1.25rem'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                                <circle cx="8.5" cy="7" r="4" />
                                                <line x1="20" y1="8" x2="20" y2="14" />
                                                <line x1="23" y1="11" x2="17" y2="11" />
                                            </svg>
                                            <span style={{ fontSize: '0.95rem', color: '#10b981', fontWeight: 600 }}>
                                                New Company Request: {requestedName}
                                            </span>
                                        </div>
                                        <button 
                                            type="button" 
                                            onClick={() => setShowNewCompanyForm(false)}
                                            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                                        >
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                        </button>
                                    </div>

                                    <label style={{ ...labelSt, marginBottom: '0.5rem', display: 'block' }}>Company Location & Geofence (Optional)</label>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.4 }}>
                                        Help your coordinator by drawing the company location on the map. This ensures you can clock in properly once approved.
                                    </p>
                                    
                                    <AdvancedLocationPickerMap
                                        initialLat={newCompanyLat}
                                        initialLng={newCompanyLng}
                                        initialPolygon={newCompanyPolygon}
                                        geofenceRadius={newCompanyRadius}
                                        onLocationSelect={(lat, lng) => {
                                            setNewCompanyLat(lat);
                                            setNewCompanyLng(lng);
                                        }}
                                        onPolygonChange={(poly) => setNewCompanyPolygon(poly)}
                                    />
                                </div>
                            )}

                            {selectedCompany && !showNewCompanyForm && (
                                <div style={{ marginBottom: '1.25rem' }}>
                                    <label style={{ ...labelSt, marginBottom: '0.5rem', display: 'block' }}>Company Location</label>
                                    <div style={{ pointerEvents: 'none', opacity: 0.9 }}>
                                        <AdvancedLocationPickerMap
                                            initialLat={selectedCompany.latitude}
                                            initialLng={selectedCompany.longitude}
                                            initialPolygon={selectedCompany.geofence_polygon}
                                            geofenceRadius={selectedCompany.geofence_radius || 100}
                                            onLocationSelect={() => {}}
                                            onPolygonChange={() => {}}
                                        />
                                    </div>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button
                                    type="button"
                                    onClick={() => { setShowDropdown(false); setStep(1); }}
                                    style={{ ...btnPrimary, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', flex: '0 0 auto', width: 'auto', padding: '0.75rem 1.25rem', position: 'relative', zIndex: 60 }}
                                >
                                    ← Back
                                </button>
                                <button type="submit" style={{ ...btnPrimary, flex: 1, position: 'relative', zIndex: 60 }} disabled={saving || (!selectedCompanyId && !showNewCompanyForm)}>
                                    {saving ? 'Submitting...' : showNewCompanyForm ? 'Submit Request' : 'Complete Profile'}
                                </button>
                            </div>
                        </form>
                    )}
                </div>

                <p style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.75rem', marginTop: '1.5rem' }}>
                    You can update this later from your Profile page.
                </p>
            </div>

            {/* Click outside to close dropdown */}
            {showDropdown && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setShowDropdown(false)} />
            )}
        </div>
    );
};


// Shared micro-styles
const labelSt: React.CSSProperties = {
    display: 'block', fontSize: '0.78rem', fontWeight: 600,
    color: 'var(--text-muted)', marginBottom: 'var(--form-label-gap)',
    textTransform: 'uppercase', letterSpacing: '0.05em',
};
const inputWrapSt: React.CSSProperties = {
    display: 'flex', alignItems: 'center',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '0 0.75rem',
    minHeight: '2.8rem',
};
const inputSt: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    padding: '0.55rem 0.8rem',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--text-primary)',
    fontSize: '0.9rem', fontFamily: 'Inter, sans-serif', outline: 'none',
};
const btnPrimary: React.CSSProperties = {
    width: '100%', padding: '0.85rem 1.5rem',
    background: 'linear-gradient(135deg, #10b981, #059669)',
    border: 'none', borderRadius: 12,
    color: '#fff', fontWeight: 700, fontSize: '0.95rem',
    cursor: 'pointer', fontFamily: 'Inter, sans-serif',
    boxShadow: '0 4px 16px rgba(16,185,129,0.35)',
    transition: 'opacity 0.15s',
};

export default OnboardingView;
