/**
 * Name captured by level: First / Middle / Last / Suffix.
 * Shared by Student, Adviser, Coordinator and Company onboarding so the field
 * order, labels, placeholders and casing behaviour cannot drift apart.
 */
import React from 'react';
import {
    FIELD_LABELS,
    FIELD_PLACEHOLDERS,
    toTitleCase,
    type FieldChrome,
    type NameLevels,
} from './onboardingFields';

interface NameFieldsGroupProps {
    value: NameLevels;
    onChange: (next: NameLevels) => void;
    chrome?: FieldChrome;
    disabled?: boolean;
    /** Set false on forms where the name is optional (none today). */
    required?: boolean;
}

const NameFieldsGroup: React.FC<NameFieldsGroupProps> = ({
    value,
    onChange,
    chrome = {},
    disabled = false,
    required = true,
}) => {
    const set = (key: keyof NameLevels) => (e: React.ChangeEvent<HTMLInputElement>) =>
        onChange({ ...value, [key]: toTitleCase(e.target.value) });

    const req = required ? chrome.requiredMark ?? <span className="req"> *</span> : null;

    const field = (
        key: keyof NameLevels,
        label: string,
        placeholder: string,
        isRequired: boolean
    ) => (
        <div className={chrome.field} style={chrome.fieldStyle}>
            <label className={chrome.label} style={chrome.labelStyle}>
                {label}{isRequired ? req : null}
            </label>
            <input
                type="text"
                className={chrome.input}
                style={chrome.inputStyle}
                value={value[key]}
                onChange={set(key)}
                placeholder={placeholder}
                disabled={disabled}
                required={isRequired}
            />
        </div>
    );

    return (
        <div className={chrome.group} style={chrome.groupStyle}>
            {field('firstName', FIELD_LABELS.firstName, FIELD_PLACEHOLDERS.firstName, required)}
            {field('middleName', FIELD_LABELS.middleName, FIELD_PLACEHOLDERS.middleName, false)}
            {field('lastName', FIELD_LABELS.lastName, FIELD_PLACEHOLDERS.lastName, required)}
            {field('suffix', FIELD_LABELS.suffix, FIELD_PLACEHOLDERS.suffix, false)}
        </div>
    );
};

export default NameFieldsGroup;
