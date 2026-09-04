/**
 * Student onboarding.
 *
 * Personal → Address → Academic Information → Internship Company → Review & Confirm,
 * built on the shared onboarding wizard (OnboardingShell) so it matches the
 * Adviser, Coordinator and Company flows.
 *
 * The Internship Company step is student-only: a student profile is not complete
 * until `company_id` is set (or a company request is pending), so it keeps its
 * own step rather than being folded into the academic fields.
 */
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { adminService } from '../services/adminService';
import type { Profile } from '../services/profileService';
import { profileService } from '../services/profileService';
import CustomSelect from './CustomSelect';
import AdvancedLocationPickerMap from './AdvancedLocationPickerMap';
import type { GeoJSONPolygon } from '../utils/geoUtils';
import { clearRegistrationName, namesFromUserMetadata, pickNameField, readRegistrationName } from '../utils/registrationName';
import NameFieldsGroup from './onboarding/NameFieldsGroup';
import AddressLevelsSelector from './onboarding/AddressLevelsSelector';
import OnboardingShell, { OnboardingActions } from './onboarding/OnboardingShell';
import { ONB_ADDRESS_CHROME, ONB_NAME_CHROME } from './onboarding/onboardingChrome';
import ReviewSummary, { type ReviewSectionData } from './onboarding/ReviewSummary';
import { addressLevelsFromProfile, useAddressLevels } from './onboarding/useAddressLevels';
import {
    addressLevelsToProfileColumns,
    formatDisplayDate,
    formatFullName,
    formatStructuredAddress,
    getAgeCutoffDate,
    isAtLeast18,
    nameLevelsToProfileColumns,
    validateAddressLevels,
    validateContactNumber,
    validateNameLevels,
    type NameLevels,
} from './onboarding/onboardingFields';
import { YEAR_LEVELS, buildSectionOptions } from '../utils/sections';

const STEPS =['Personal', 'Address', 'Academic', 'Company', 'Review'];

const SUBTITLES = [
    "Let's confirm your information before we get started.",
    'Where are you currently residing?',
    'Tell us about your program and section.',
    'Where are you doing your internship?',
    'Check everything over before we finish your profile.',
];

const AGE_MESSAGE = '⚠️ You must be at least 18 years old to participate in the SIL/OJT program.';

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

const resolveOnboardingNames = (profile: Profile, metadata?: Record<string, unknown> | null): NameLevels => {
    const stored = readRegistrationName(profile.auth_user_id);
    const meta = namesFromUserMetadata(metadata);
    return {
        firstName: pickNameField(profile.first_name, meta.first_name, stored?.first_name),
        middleName: pickNameField(profile.middle_name, meta.middle_name, stored?.middle_name),
        lastName: pickNameField(profile.last_name, meta.last_name, stored?.last_name),
        suffix: profile.suffix ?? '',
    };
};

const OnboardingView: React.FC<OnboardingViewProps> = ({ profile, onComplete }) => {
    const [step, setStep] = useState(1);

    // ── Step 1: Personal Information ──
    const [name, setName] = useState<NameLevels>(() => resolveOnboardingNames(profile));
    const [birthday, setBirthday] = useState(profile.birthday ?? '');
    const [birthdayError, setBirthdayError] = useState<string | null>(null);
    const [contactNumber, setContactNumber] = useState(profile.contact_number ?? '');
    const [requiredHours, setRequiredHours] = useState(profile.required_ojt_hours ?? 500);

    // ── Step 2: Address by level — shared with Adviser, Coordinator and Company ──
    const addressLevels = useAddressLevels(addressLevelsFromProfile(profile));

    // ── Step 3: Academic Information ──
    const [yearLevel, setYearLevel] = useState(profile.year_level ?? '');
    const [section, setSection] = useState(profile.section ?? '');
    const [course, setCourse] = useState(profile.course ?? '');
    const [department, setDepartment] = useState(profile.department ?? '');
    const [availableSections, setAvailableSections] = useState<{ id: string; name: string; course_code: string }[]>([]);
    const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
    const [courses, setCourses] = useState<{ id: string; name: string; code: string; description?: string | null }[]>([]);

    // ── Step 4: Internship Company ──
    const [companies, setCompanies] = useState<Company[]>([]);
    const [selectedCompanyId, setSelectedCompanyId] = useState('');
    const [search, setSearch] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [requestedName, setRequestedName] = useState('');
    const [showNewCompanyForm, setShowNewCompanyForm] = useState(false);
    const [newCompanyLat, setNewCompanyLat] = useState<number | null>(null);
    const [newCompanyLng, setNewCompanyLng] = useState<number | null>(null);
    const [newCompanyRadius] = useState<number>(100);
    const [newCompanyPolygon, setNewCompanyPolygon] = useState<GeoJSONPolygon | null>(null);
    const [pendingRequest, setPendingRequest] = useState<{ name: string; status: string; requested_by: string } | null>(null);

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!birthday) {
            setBirthdayError(null);
            return;
        }
        setBirthdayError(isAtLeast18(birthday) ? null : AGE_MESSAGE);
    }, [birthday]);

    useEffect(() => {
        let isMounted = true;

        const applyNames = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!isMounted) return;
            const names = resolveOnboardingNames(profile, user?.user_metadata);
            setName(prev => ({
                firstName: pickNameField(names.firstName, prev.firstName),
                middleName: names.middleName || prev.middleName,
                lastName: pickNameField(names.lastName, prev.lastName),
                suffix: names.suffix || prev.suffix,
            }));
        };

        setName(prev => ({
            firstName: pickNameField(profile.first_name, prev.firstName),
            middleName: pickNameField(profile.middle_name, prev.middleName),
            lastName: pickNameField(profile.last_name, prev.lastName),
            suffix: profile.suffix || prev.suffix,
        }));
        setBirthday(profile.birthday ?? '');
        setContactNumber(profile.contact_number ?? '');
        setYearLevel(profile.year_level ?? '');
        setSection(profile.section ?? '');
        setCourse(profile.course ?? '');
        setDepartment(profile.department ?? '');
        setRequiredHours(profile.required_ojt_hours ?? 500);
        addressLevels.setAddress(addressLevelsFromProfile(profile));
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
                    .select('first_name, middle_name, last_name, suffix, birthday, address, country, region, region_code, province, province_code, city_municipality, city_municipality_code, barangay, barangay_code, house_street, contact_number, year_level, section, course, department, required_ojt_hours')
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

                setName(prev => ({
                    firstName: pickNameField(names.firstName, prev.firstName),
                    middleName: names.middleName || prev.middleName,
                    lastName: pickNameField(names.lastName, prev.lastName),
                    suffix: names.suffix || prev.suffix,
                }));

                if (!data) return;

                setBirthday(data.birthday ?? '');
                addressLevels.setAddress(addressLevelsFromProfile(data));
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
        // Only active courses are offered, but the value this profile has
        // already saved stays selectable so deactivating a course never blanks
        // an existing student's record mid-onboarding.
        adminService.getSelectableCourses(profile.course).then(setCourses);
        supabase.from('sections').select('id, name, course_code').order('name').then(({ data }) => {
            if (data && data.length > 0) {
                setAvailableSections(data);
            }
        });

        return () => {
            isMounted = false;
        };
    }, [profile.auth_user_id]);

    const filtered = companies.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase())
    );

    const selectedCompany = companies.find(c => c.id === selectedCompanyId);

    const matchedCompany = selectedCompanyId
        ? companies.find(c => c.id === selectedCompanyId)
        : companies.find(c => c.name.trim().toLowerCase() === search.trim().toLowerCase());
    const companyIdToSave = selectedCompanyId || matchedCompany?.id || '';

    /**
     * Section names embed the course and year (DIT-3A), so changing either can
     * invalidate the current choice. Clear it only when it no longer belongs,
     * so returning from a later step never loses a still-valid section.
     */
    const clearSectionIfStale = (nextCourse: string, nextYearLevel: string) => {
        if (!section) return;
        const stillValid = buildSectionOptions({
            course: nextCourse,
            yearLevel: nextYearLevel,
            sections: availableSections,
        }).some(option => option.value === section);
        if (!stillValid) setSection('');
    };

    const handleCourseChange = (next: string) => {
        setCourse(next);
        clearSectionIfStale(next, yearLevel);
    };

    const handleYearLevelChange = (next: string) => {
        setYearLevel(next);
        clearSectionIfStale(course, next);
    };

    const handleSelectCompany = (c: Company) => {
        setSelectedCompanyId(c.id);
        setSearch(c.name);
        setShowDropdown(false);
        setShowNewCompanyForm(false);
    };

    const handleRequestCompanyClick = () => {
        const requested = search.trim();
        if (!requested) return;
        setRequestedName(requested);
        setShowNewCompanyForm(true);
        setSelectedCompanyId('');
        setShowDropdown(false);
    };

    // ── Per-step validation. Shared rules match Adviser/Coordinator/Company. ──

    const validateStep1 = () => {
        if (!birthday || !isAtLeast18(birthday)) {
            setBirthdayError(AGE_MESSAGE);
            setError(AGE_MESSAGE);
            return false;
        }
        const message = validateNameLevels(name) ?? validateContactNumber(contactNumber);
        setError(message);
        return message === null;
    };

    const validateStep2 = () => {
        const message = validateAddressLevels(addressLevels.address);
        setError(message);
        return message === null;
    };

    const validateStep3 = () => {
        if (!course.trim() || !department.trim() || !yearLevel.trim() || !section.trim()) {
            setError('Please complete your course, department, year level and section.');
            return false;
        }
        setError(null);
        return true;
    };

    const validateStep4 = () => {
        if (!companyIdToSave && !showNewCompanyForm) {
            setError('Please select your internship company or request a new one.');
            return false;
        }
        setError(null);
        return true;
    };

    const canReach = (target: number) => {
        if (target > 1 && !validateStep1()) return false;
        if (target > 2 && !validateStep2()) return false;
        if (target > 3 && !validateStep3()) return false;
        if (target > 4 && !validateStep4()) return false;
        return true;
    };

    const goTo = (target: number) => {
        setShowDropdown(false);
        if (target <= step) {
            setError(null);
            setStep(target);
            return;
        }
        if (canReach(target)) setStep(target);
    };

    const handleNext = (e: React.FormEvent) => {
        e.preventDefault();
        goTo(step + 1);
    };

    const handleBack = () => {
        setError(null);
        setShowDropdown(false);
        setStep(current => Math.max(1, current - 1));
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
                student_name: formatFullName(name),
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
                student_name: formatFullName(name),
                requested_by: authId,
                status: 'pending',
                request_type: 'student_company',
            },
            {
                name: requestedName.trim() || search.trim(),
                student_name: formatFullName(name),
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

        // Re-check every step so an incomplete profile can never be submitted.
        if (!validateStep1()) { setStep(1); return; }
        if (!validateStep2()) { setStep(2); return; }
        if (!validateStep3()) { setStep(3); return; }
        if (!validateStep4()) { setStep(4); return; }

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
                setBirthdayError(AGE_MESSAGE);
                setError(AGE_MESSAGE);
                setStep(1);
                return;
            }

            const selectedDept = departments.find(d => d.name === department.trim());
            const addressColumns = addressLevelsToProfileColumns(addressLevels.address);

            if (showNewCompanyForm) {
                await submitCompanyRequest(authId);
            }

            const profilePayload: Record<string, unknown> = {
                ...nameLevelsToProfileColumns(name),
                birthday: birthday || null,
                ...addressColumns,
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
                // Fallback for databases that have not run the by-level migration yet.
                const fallbackPayload: Record<string, unknown> = {
                    first_name: name.firstName.trim(),
                    last_name: name.lastName.trim(),
                    birthday: birthday || null,
                    address: addressColumns.address || null,
                    contact_number: contactNumber.trim() || null,
                    year_level: yearLevel.trim() || null,
                    section: section.trim() || null,
                    course: course.trim() || null,
                    department: department.trim() || null,
                    required_ojt_hours: Number.isFinite(requiredHours) ? requiredHours : 500,
                };
                if (name.middleName.trim()) fallbackPayload.middle_name = name.middleName.trim();
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
                setBirthdayError(AGE_MESSAGE);
                setError(AGE_MESSAGE);
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

    // Letters A–J for the chosen course + year level, whichever rows the
    // `sections` table happens to hold. See src/utils/sections.ts.
    const sectionOptions = buildSectionOptions({
        course,
        yearLevel,
        sections: availableSections,
        currentValue: section,
    });

    const companySummary = showNewCompanyForm
        ? `${requestedName || search} (new company request)`
        : (selectedCompany?.name ?? matchedCompany?.name ?? '');

    const reviewSections: ReviewSectionData[] = [
        {
            title: 'Personal Information',
            step: 1,
            rows: [
                { label: 'Full Name', value: formatFullName(name), full: true },
                { label: 'Birthday', value: formatDisplayDate(birthday) },
                { label: 'Contact Number', value: contactNumber },
                { label: 'Required SIL/OJT Hours', value: `${requiredHours} hours` },
            ],
        },
        {
            title: 'Address',
            step: 2,
            rows: [
                { label: 'Country', value: addressLevels.address.country },
                { label: 'Region', value: addressLevels.address.regionName },
                { label: 'Province', value: addressLevels.address.provinceName },
                { label: 'City / Municipality', value: addressLevels.address.cityMunicipalityName },
                { label: 'Barangay', value: addressLevels.address.barangayName },
                { label: 'House No. / Street', value: addressLevels.address.houseStreet },
                { label: 'Full Address', value: formatStructuredAddress(addressLevels.address), full: true },
            ],
        },
        {
            title: 'Academic Information',
            step: 3,
            rows: [
                { label: 'Course', value: course },
                { label: 'Department', value: department },
                { label: 'Year Level', value: yearLevel },
                { label: 'Section', value: section },
            ],
        },
        {
            title: 'Internship Company',
            step: 4,
            rows: [
                { label: 'Company', value: companySummary, full: true },
            ],
        },
    ];

    return (
        <OnboardingShell
            icon={(
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
            )}
            title="Welcome to SIL Monitoring"
            subtitle={SUBTITLES[step - 1]}
            steps={STEPS}
            current={step}
            onStepSelect={goTo}
            error={error}
            footnote="You can update this later from your Profile page."
        >
            {/* ══ STEP 1: Personal Information ══ */}
            {step === 1 && (
                <form onSubmit={handleNext} className="onb-form">
                    <div className="onb-notice">
                        <p>✓ Your name from account creation is shown below. You can edit if needed.</p>
                    </div>

                    <NameFieldsGroup value={name} onChange={setName} chrome={ONB_NAME_CHROME} />

                    <div className="onb-grid-3">
                        <div className="onb-field">
                            <label className="onb-label">Birthday <span className="req">*</span></label>
                            <input
                                type="date"
                                className={`onb-input${birthdayError ? ' invalid' : ''}`}
                                value={birthday}
                                max={getAgeCutoffDate()}
                                onChange={e => setBirthday(e.target.value)}
                                required
                            />
                            {birthdayError && <div className="onb-field-error">{birthdayError}</div>}
                        </div>
                        <div className="onb-field">
                            <label className="onb-label">Contact No. <span className="req">*</span></label>
                            <input
                                type="tel"
                                className="onb-input"
                                value={contactNumber}
                                onChange={e => setContactNumber(e.target.value)}
                                placeholder="e.g. 0912..."
                                required
                            />
                        </div>
                        <div className="onb-field">
                            <label className="onb-label">Required Hours</label>
                            <input
                                type="number"
                                className="onb-input"
                                min={0}
                                value={requiredHours}
                                onChange={e => setRequiredHours(Number(e.target.value))}
                            />
                        </div>
                    </div>

                    <OnboardingActions />
                </form>
            )}

            {/* ══ STEP 2: Address ══ */}
            {step === 2 && (
                <form onSubmit={handleNext} className="onb-form">
                    <AddressLevelsSelector levels={addressLevels} chrome={ONB_ADDRESS_CHROME} />
                    <OnboardingActions onBack={handleBack} />
                </form>
            )}

            {/* ══ STEP 3: Academic Information ══ */}
            {step === 3 && (
                <form onSubmit={handleNext} className="onb-form">
                    <div className="onb-grid-2">
                        <div className="onb-field">
                            <label className="onb-label">Course <span className="req">*</span></label>
                            <CustomSelect
                                value={course}
                                onChange={handleCourseChange}
                                placeholder="Select Course"
                                options={courses.map(c => ({
                                    // The code is what profiles.course stores —
                                    // see adminService.Course.
                                    value: c.code,
                                    label: c.name === c.code ? c.code : `${c.code} — ${c.name}`,
                                }))}
                            />
                        </div>
                        <div className="onb-field">
                            <label className="onb-label">Department <span className="req">*</span></label>
                            <CustomSelect
                                value={department}
                                onChange={setDepartment}
                                placeholder="Select Department"
                                options={departments.map(d => ({ value: d.name, label: d.name }))}
                            />
                        </div>
                    </div>

                    <div className="onb-grid-2">
                        <div className="onb-field">
                            <label className="onb-label">Year Level <span className="req">*</span></label>
                            <CustomSelect
                                value={yearLevel}
                                onChange={handleYearLevelChange}
                                placeholder="Select Year"
                                options={YEAR_LEVELS.map(y => ({ value: y, label: y }))}
                            />
                        </div>
                        <div className="onb-field">
                            <label className="onb-label">Section <span className="req">*</span></label>
                            <CustomSelect
                                value={section}
                                onChange={setSection}
                                placeholder="Select Section"
                                options={sectionOptions}
                            />
                        </div>
                    </div>

                    <OnboardingActions onBack={handleBack} />
                </form>
            )}

            {/* ══ STEP 4: Internship Company ══ */}
            {step === 4 && (
                <form onSubmit={handleNext} className="onb-form">
                    {/* Click anywhere outside to close the company dropdown. */}
                    {showDropdown && (
                        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setShowDropdown(false)} />
                    )}
                    <div className="onb-field" style={{ position: 'relative', zIndex: showDropdown ? 60 : undefined, marginBottom: showDropdown ? '13rem' : 0 }}>
                        <label className="onb-label">Internship Company <span className="req">*</span></label>
                        <input
                            className="onb-input"
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
                                            background: selectedCompanyId === c.id ? 'rgba(16,185,129,0.1)' : 'transparent',
                                        }}
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
                                        cursor: 'pointer', color: '#10b981', fontSize: '0.88rem', fontWeight: 600,
                                        fontFamily: 'inherit', textAlign: 'left',
                                    }}
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
                            borderRadius: 12, padding: '1.25rem'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem' }}>
                                <span style={{ fontSize: '0.92rem', color: '#10b981', fontWeight: 600 }}>
                                    New Company Request: {requestedName}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setShowNewCompanyForm(false)}
                                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                                    aria-label="Cancel company request"
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                </button>
                            </div>

                            <label className="onb-label" style={{ marginBottom: '0.5rem' }}>Company Location &amp; Geofence (Optional)</label>
                            <p className="onb-hint" style={{ marginBottom: '1rem' }}>
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
                        <div className="onb-field">
                            <label className="onb-label">Company Location</label>
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

                    <OnboardingActions onBack={handleBack} />
                </form>
            )}

            {/* ══ STEP 5: Review & Confirm ══ */}
            {step === 5 && (
                <form onSubmit={handleSubmit} className="onb-form">
                    <ReviewSummary sections={reviewSections} onEdit={goTo} />
                    {showNewCompanyForm && (
                        <div className="onb-notice">
                            <p>Your company is not in the directory yet, so submitting will send a request to your coordinator for approval.</p>
                        </div>
                    )}
                    <OnboardingActions
                        onBack={handleBack}
                        busy={saving}
                        nextLabel={saving
                            ? 'Submitting...'
                            : showNewCompanyForm ? 'Confirm & Submit Request' : 'Confirm & Complete Onboarding'}
                    />
                </form>
            )}
        </OnboardingShell>
    );
};

export default OnboardingView;
