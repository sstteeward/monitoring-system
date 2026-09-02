/**
 * Coordinator onboarding — Personal → Address → Coordinator Info → Review.
 *
 * Uses the shared onboarding wizard (OnboardingShell + the by-level name and
 * address components), so it is the same experience as Student, Adviser and
 * Company onboarding with coordinator-specific fields only. No student academic
 * fields (course / year level / section) are collected here.
 */
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { adminService } from '../services/adminService';
import type { Profile } from '../services/profileService';
import { clearRegistrationName, namesFromUserMetadata, pickNameField, readRegistrationName } from '../utils/registrationName';
import CustomSelect from './CustomSelect';
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
    nameLevelsToProfileColumns,
    validateAddressLevels,
    validateBirthday,
    validateContactNumber,
    validateNameLevels,
    type NameLevels,
} from './onboarding/onboardingFields';

const STEPS = ['Personal', 'Address', 'Coordinator Info', 'Review'];

const SUBTITLES = [
    "Let's confirm your personal information before we get started.",
    'Where are you currently residing?',
    'Which department or office do you coordinate for?',
    'Check everything over before we finish your profile.',
];

interface CoordinatorOnboardingViewProps {
    profile: Profile;
    onComplete: () => void | Promise<void>;
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

const isMissingColumnError = (err: unknown) => {
    const msg = (err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err ?? '')).toLowerCase();
    return msg.includes('could not find') || msg.includes('schema cache') || msg.includes('does not exist');
};

const CoordinatorOnboardingView: React.FC<CoordinatorOnboardingViewProps> = ({ profile, onComplete }) => {
    const [step, setStep] = useState(1);

    // ── Step 1: Personal Information ──
    const [name, setName] = useState<NameLevels>(() => resolveOnboardingNames(profile));
    const [birthday, setBirthday] = useState(profile.birthday ?? '');
    const [contactNumber, setContactNumber] = useState(profile.contact_number ?? '');

    // ── Step 2: Address (by level, PSGC cascade) ──
    const addressLevels = useAddressLevels(addressLevelsFromProfile(profile));

    // ── Step 3: Coordinator Information ──
    const [department, setDepartment] = useState(profile.department ?? '');
    const [position, setPosition] = useState('SIL Coordinator');
    const [employeeId, setEmployeeId] = useState('');
    const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let mounted = true;

        adminService.getDepartments()
            .then(list => { if (mounted) setDepartments(list ?? []); })
            .catch(err => console.warn('[CoordinatorOnboarding] Unable to load departments:', err));

        // Fall back to the name captured at registration when the profile row is bare.
        supabase.auth.getUser().then(({ data }) => {
            if (!mounted) return;
            const resolved = resolveOnboardingNames(profile, data.user?.user_metadata);
            setName(prev => ({
                firstName: pickNameField(prev.firstName, resolved.firstName),
                middleName: prev.middleName || resolved.middleName,
                lastName: pickNameField(prev.lastName, resolved.lastName),
                suffix: prev.suffix || resolved.suffix,
            }));
        });

        return () => { mounted = false; };
    }, [profile.auth_user_id]);

    // Shared validation rules — identical to Student, Adviser and Company.
    const validateStep1 = () => {
        const message = validateNameLevels(name)
            ?? validateBirthday(birthday)
            ?? validateContactNumber(contactNumber);
        setError(message);
        return message === null;
    };

    const validateStep2 = () => {
        const message = validateAddressLevels(addressLevels.address);
        setError(message);
        return message === null;
    };

    const validateStep3 = () => {
        if (!department.trim()) {
            setError('Please select or enter the department / office you coordinate for.');
            return false;
        }
        if (!position.trim()) {
            setError('Please enter your position or role.');
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
        setStep(current => Math.max(1, current - 1));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateStep1() || !validateStep2() || !validateStep3()) return;

        setSaving(true);
        setError(null);

        try {
            const authId = profile.auth_user_id;
            const addressColumns = addressLevelsToProfileColumns(addressLevels.address);
            const matchedDepartment = departments.find(d => d.name === department.trim());

            const basePayload: Record<string, unknown> = {
                ...nameLevelsToProfileColumns(name),
                birthday: birthday || null,
                contact_number: contactNumber.trim(),
                department: department.trim(),
                account_type: 'coordinator',
            };
            if (matchedDepartment?.id) basePayload.department_id = matchedDepartment.id;

            const saveProfile = async (payload: Record<string, unknown>) => {
                const { data, error: updateError } = await supabase
                    .from('profiles')
                    .update(payload)
                    .eq('auth_user_id', authId)
                    .select('id');
                if (updateError) throw updateError;
                if (!data?.length) {
                    const { error: upsertError } = await supabase
                        .from('profiles')
                        .upsert({ auth_user_id: authId, ...payload }, { onConflict: 'auth_user_id' });
                    if (upsertError) throw upsertError;
                }
            };

            // Try the richest payload first, then degrade for databases that have
            // not run the by-level / position migrations yet.
            const attempts: Record<string, unknown>[] = [
                { ...basePayload, ...addressColumns, position: position.trim() },
                { ...basePayload, ...addressColumns },
                { ...basePayload, address: addressColumns.address },
            ];

            let lastError: unknown = null;
            let saved = false;
            for (const payload of attempts) {
                try {
                    await saveProfile(payload);
                    saved = true;
                    break;
                } catch (attemptError) {
                    lastError = attemptError;
                    if (!isMissingColumnError(attemptError)) throw attemptError;
                }
            }
            if (!saved) throw lastError;

            clearRegistrationName();
            await onComplete();
        } catch (err: unknown) {
            console.error('Error saving coordinator onboarding:', err);
            const message = err instanceof Error ? err.message : 'Failed to complete your coordinator profile. Please try again.';
            setError(message);
        } finally {
            setSaving(false);
        }
    };

    const reviewSections: ReviewSectionData[] = [
        {
            title: 'Personal Information',
            step: 1,
            rows: [
                { label: 'Full Name', value: formatFullName(name), full: true },
                { label: 'Birthday', value: formatDisplayDate(birthday) },
                { label: 'Contact Number', value: contactNumber },
                { label: 'Email', value: profile.email ?? '' },
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
            title: 'Coordinator Information',
            step: 3,
            rows: [
                { label: 'Department / Office', value: department },
                { label: 'Position / Role', value: position },
                { label: 'Employee ID', value: employeeId },
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
            title="Welcome, Coordinator!"
            subtitle={SUBTITLES[step - 1]}
            steps={STEPS}
            current={step}
            onStepSelect={goTo}
            error={error}
            footnote="You can update these details later from your Profile page."
        >
            {/* ══ STEP 1: Personal Information ══ */}
            {step === 1 && (
                <form onSubmit={handleNext} className="onb-form">
                    <div className="onb-notice">
                        <p>✓ Your name from account creation is shown below. You can edit if needed.</p>
                    </div>

                    <NameFieldsGroup value={name} onChange={setName} chrome={ONB_NAME_CHROME} />

                    <div className="onb-grid-2">
                        <div className="onb-field">
                            <label className="onb-label">Birthday <span className="req">*</span></label>
                            <input
                                type="date"
                                className="onb-input"
                                value={birthday}
                                max={getAgeCutoffDate()}
                                onChange={e => setBirthday(e.target.value)}
                                required
                            />
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
                    </div>

                    <div className="onb-field">
                        <label className="onb-label">Email Address</label>
                        <input className="onb-input" value={profile.email ?? ''} disabled />
                        <p className="onb-hint">Managed by your account sign-in and cannot be changed here.</p>
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

            {/* ══ STEP 3: Coordinator Information ══ */}
            {step === 3 && (
                <form onSubmit={handleNext} className="onb-form">
                    <div className="onb-grid-2">
                        <div className="onb-field">
                            <label className="onb-label">Department / Office <span className="req">*</span></label>
                            {departments.length > 0 ? (
                                <CustomSelect
                                    value={department}
                                    onChange={setDepartment}
                                    placeholder="Select Department / Office"
                                    options={departments.map(d => ({ value: d.name, label: d.name }))}
                                    searchable
                                />
                            ) : (
                                <input
                                    type="text"
                                    className="onb-input"
                                    value={department}
                                    onChange={e => setDepartment(e.target.value)}
                                    placeholder="e.g. Information Technology"
                                    required
                                />
                            )}
                        </div>
                        <div className="onb-field">
                            <label className="onb-label">Position / Role <span className="req">*</span></label>
                            <input
                                type="text"
                                className="onb-input"
                                value={position}
                                onChange={e => setPosition(e.target.value)}
                                placeholder="e.g. SIL Coordinator"
                                required
                            />
                        </div>
                    </div>

                    <div className="onb-field">
                        <label className="onb-label">Employee ID <span className="onb-optional">(Optional)</span></label>
                        <input
                            type="text"
                            className="onb-input"
                            value={employeeId}
                            onChange={e => setEmployeeId(e.target.value)}
                            placeholder="e.g. EMP-2026-014"
                        />
                    </div>

                    <div className="onb-notice">
                        <p><strong>Scope:</strong> Your department determines the students, advisers and company partners you oversee in the coordinator portal.</p>
                    </div>

                    <OnboardingActions onBack={handleBack} />
                </form>
            )}

            {/* ══ STEP 4: Review & Confirm ══ */}
            {step === 4 && (
                <form onSubmit={handleSubmit} className="onb-form">
                    <ReviewSummary sections={reviewSections} onEdit={goTo} />
                    <OnboardingActions
                        onBack={handleBack}
                        busy={saving}
                        nextLabel={saving ? 'Completing Profile...' : 'Confirm & Complete Onboarding'}
                    />
                </form>
            )}
        </OnboardingShell>
    );
};

export default CoordinatorOnboardingView;
