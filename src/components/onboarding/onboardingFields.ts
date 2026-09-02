/**
 * Shared field contract for every onboarding / profile form
 * (Student, Adviser, Coordinator, Company).
 *
 * Adviser onboarding is the reference structure: names and addresses are always
 * captured "by level" — never as a single combined input. These helpers hold the
 * labels, placeholders and validation rules so all four forms stay identical.
 */
import type React from 'react';

/** Name captured by level. */
export interface NameLevels {
    firstName: string;
    middleName: string;
    lastName: string;
    suffix: string;
}

/** Address captured by level (PSGC). */
export interface AddressLevels {
    country: string;
    regionCode: string;
    regionName: string;
    provinceCode: string;
    provinceName: string;
    cityCode: string;
    cityMunicipalityName: string;
    barangayCode: string;
    barangayName: string;
    houseStreet: string;
}

export const EMPTY_NAME_LEVELS: NameLevels = {
    firstName: '',
    middleName: '',
    lastName: '',
    suffix: '',
};

export const EMPTY_ADDRESS_LEVELS: AddressLevels = {
    country: 'Philippines',
    regionCode: '',
    regionName: '',
    provinceCode: '',
    provinceName: '',
    cityCode: '',
    cityMunicipalityName: '',
    barangayCode: '',
    barangayName: '',
    houseStreet: '',
};

/**
 * Per-form styling hooks. Each form keeps its own look (Adviser uses CSS classes,
 * Student/Coordinator use inline styles) while sharing one structure.
 */
export interface FieldChrome {
    group?: string;
    field?: string;
    label?: string;
    input?: string;
    groupStyle?: React.CSSProperties;
    fieldStyle?: React.CSSProperties;
    labelStyle?: React.CSSProperties;
    inputStyle?: React.CSSProperties;
    /** Rendered after the label text for required fields. */
    requiredMark?: React.ReactNode;
}

/** Canonical labels — identical across all four forms. */
export const FIELD_LABELS = {
    firstName: 'First Name',
    middleName: 'Middle Name',
    lastName: 'Last Name',
    suffix: 'Suffix',
    country: 'Country',
    region: 'Region',
    province: 'Province',
    cityMunicipality: 'City / Municipality',
    barangay: 'Barangay',
    houseStreet: 'House No. / Street',
} as const;

/** Canonical placeholders — identical across all four forms. */
export const FIELD_PLACEHOLDERS = {
    firstName: 'First Name',
    middleName: 'Middle Name',
    lastName: 'Last Name',
    suffix: 'e.g. Jr., Sr., III',
    region: 'Select Region',
    regionLoading: 'Loading regions...',
    province: 'Select Province',
    provinceLocked: 'Select Region first',
    cityMunicipality: 'Select City / Municipality',
    cityMunicipalityLocked: 'Select Province first',
    barangay: 'Select Barangay',
    barangayLocked: 'Select city/municipality first',
    houseStreet: 'House number, street name',
} as const;

/** Suffixes recognised when splitting legacy combined names. */
export const KNOWN_NAME_SUFFIXES = ['Jr.', 'Jr', 'Sr.', 'Sr', 'II', 'III', 'IV', 'V'];

/** Title-cases as the user types, matching the existing onboarding inputs. */
export const toTitleCase = (value: string) => value.replace(/\b\w/g, c => c.toUpperCase());

/** Joins the address levels into the single display string stored in `address`. */
export function formatStructuredAddress(address: AddressLevels): string {
    const parts = [
        address.houseStreet.trim(),
        address.barangayName ? `Barangay ${address.barangayName}` : '',
        address.cityMunicipalityName,
        address.provinceName,
        address.country || 'Philippines',
    ];
    return parts.filter(Boolean).join(', ');
}

/** Human-readable date for the Review & Confirm step. */
export function formatDisplayDate(value: string | null | undefined): string {
    if (!value) return '';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** Joins the name levels into a single display string. */
export function formatFullName(name: NameLevels): string {
    return [name.firstName.trim(), name.middleName.trim(), name.lastName.trim(), name.suffix.trim()]
        .filter(Boolean)
        .join(' ');
}

// ── Shared validation ────────────────────────────────────────────────────────
// Every form uses these so the rules cannot drift apart.

export function validateNameLevels(name: NameLevels): string | null {
    if (!name.firstName.trim() || !name.lastName.trim()) {
        return 'Please enter your first and last name.';
    }
    return null;
}

export function validateAddressLevels(address: AddressLevels): string | null {
    if (
        !address.regionCode ||
        !address.provinceCode ||
        !address.cityCode ||
        !address.barangayCode ||
        !address.houseStreet.trim()
    ) {
        return 'Please complete all address fields.';
    }
    return null;
}

export function validateContactNumber(contactNumber: string): string | null {
    if (!contactNumber.trim()) {
        return 'Please enter your active contact number.';
    }
    const digits = contactNumber.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 13) {
        return 'Please enter a valid phone number (e.g. 09123456789).';
    }
    return null;
}

/** Date (yyyy-mm-dd) that a person turning 18 today would have been born on. */
export function getAgeCutoffDate(): string {
    const today = new Date();
    const cutoff = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
    const month = String(cutoff.getMonth() + 1).padStart(2, '0');
    const day = String(cutoff.getDate()).padStart(2, '0');
    return `${cutoff.getFullYear()}-${month}-${day}`;
}

export function isAtLeast18(value: string): boolean {
    if (!value) return false;
    const birthDate = new Date(`${value}T00:00:00`);
    if (Number.isNaN(birthDate.getTime())) return false;
    const today = new Date();
    const cutoff = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
    return birthDate <= cutoff;
}

export function validateBirthday(birthday: string): string | null {
    if (!birthday) {
        return 'Please provide your date of birth.';
    }
    if (!isAtLeast18(birthday)) {
        return 'Please enter a valid birthday (minimum age 18).';
    }
    return null;
}

/** Maps the name/address levels onto the `profiles` columns. */
export function nameLevelsToProfileColumns(name: NameLevels) {
    return {
        first_name: name.firstName.trim(),
        middle_name: name.middleName.trim() || null,
        last_name: name.lastName.trim(),
        suffix: name.suffix.trim() || null,
    };
}

export function addressLevelsToProfileColumns(address: AddressLevels) {
    return {
        address: formatStructuredAddress(address),
        country: address.country || 'Philippines',
        region: address.regionName.trim() || null,
        region_code: address.regionCode.trim() || null,
        province: address.provinceName.trim() || null,
        province_code: address.provinceCode.trim() || null,
        city_municipality: address.cityMunicipalityName.trim() || null,
        city_municipality_code: address.cityCode.trim() || null,
        barangay: address.barangayName.trim() || null,
        barangay_code: address.barangayCode.trim() || null,
        house_street: address.houseStreet.trim() || null,
    };
}
