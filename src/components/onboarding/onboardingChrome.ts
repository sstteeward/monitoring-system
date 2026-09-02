/**
 * Styling hooks passed into the shared field components (NameFieldsGroup,
 * AddressLevelsSelector) by every onboarding flow, so Student, Adviser,
 * Coordinator and Company render identical inputs.
 *
 * The classes live in OnboardingShell.css.
 */
import type { FieldChrome } from './onboardingFields';

/** First / Middle / Last / Suffix — four columns, suffix narrower. */
export const ONB_NAME_CHROME: FieldChrome = {
    group: 'onb-grid-4',
    field: 'onb-field',
    label: 'onb-label',
    input: 'onb-input',
};

/** Country / Region / Province / City / Barangay / Street — two per row. */
export const ONB_ADDRESS_CHROME: FieldChrome = {
    group: 'onb-grid-2',
    field: 'onb-field',
    label: 'onb-label',
    input: 'onb-input',
};
