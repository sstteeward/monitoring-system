/**
 * Address captured by level: Country / Region / Province / City-Municipality /
 * Barangay / House No. - Street, backed by the PSGC cascade.
 *
 * Shared by Student, Adviser, Coordinator and Company onboarding. Extracted from
 * AdviserOnboardingView, which is the reference structure.
 */
import React from 'react';
import CustomSelect from '../CustomSelect';
import { FIELD_LABELS, FIELD_PLACEHOLDERS, type FieldChrome } from './onboardingFields';
import type { UseAddressLevelsReturn } from './useAddressLevels';

interface AddressLevelsSelectorProps {
    levels: UseAddressLevelsReturn;
    chrome?: FieldChrome;
    disabled?: boolean;
}

const AddressLevelsSelector: React.FC<AddressLevelsSelectorProps> = ({
    levels,
    chrome = {},
    disabled = false,
}) => {
    const {
        address,
        setHouseStreet,
        selectRegion,
        selectProvince,
        selectCity,
        selectBarangay,
        regionOptions,
        provinceOptions,
        cityOptions,
        barangayOptions,
        loading,
    } = levels;

    const req = chrome.requiredMark ?? <span className="req"> *</span>;

    const field = (label: string, isRequired: boolean, control: React.ReactNode) => (
        <div className={chrome.field} style={chrome.fieldStyle}>
            <label className={chrome.label} style={chrome.labelStyle}>
                {label}{isRequired ? req : null}
            </label>
            {control}
        </div>
    );

    return (
        <>
            <div className={chrome.group} style={chrome.groupStyle}>
                {field(FIELD_LABELS.country, false, (
                    <input
                        type="text"
                        className={chrome.input}
                        style={chrome.inputStyle}
                        value={address.country}
                        disabled
                    />
                ))}
                {field(FIELD_LABELS.region, true, (
                    <CustomSelect
                        value={address.regionCode}
                        options={regionOptions}
                        placeholder={loading ? FIELD_PLACEHOLDERS.regionLoading : FIELD_PLACEHOLDERS.region}
                        disabled={disabled}
                        searchable
                        onChange={selectRegion}
                    />
                ))}
            </div>

            <div className={chrome.group} style={chrome.groupStyle}>
                {field(FIELD_LABELS.province, true, (
                    <CustomSelect
                        value={address.provinceCode}
                        options={provinceOptions}
                        placeholder={!address.regionCode ? FIELD_PLACEHOLDERS.provinceLocked : FIELD_PLACEHOLDERS.province}
                        disabled={disabled || !address.regionCode}
                        searchable
                        onChange={selectProvince}
                    />
                ))}
                {field(FIELD_LABELS.cityMunicipality, true, (
                    <CustomSelect
                        value={address.cityCode}
                        options={cityOptions}
                        placeholder={!address.provinceCode ? FIELD_PLACEHOLDERS.cityMunicipalityLocked : FIELD_PLACEHOLDERS.cityMunicipality}
                        disabled={disabled || !address.provinceCode}
                        searchable
                        onChange={selectCity}
                    />
                ))}
            </div>

            <div className={chrome.group} style={chrome.groupStyle}>
                {field(FIELD_LABELS.barangay, true, (
                    <CustomSelect
                        value={address.barangayCode}
                        options={barangayOptions}
                        placeholder={!address.cityCode ? FIELD_PLACEHOLDERS.barangayLocked : FIELD_PLACEHOLDERS.barangay}
                        disabled={disabled || !address.cityCode}
                        searchable
                        onChange={selectBarangay}
                    />
                ))}
                {field(FIELD_LABELS.houseStreet, true, (
                    <input
                        type="text"
                        className={chrome.input}
                        style={chrome.inputStyle}
                        value={address.houseStreet}
                        onChange={e => setHouseStreet(e.target.value)}
                        placeholder={FIELD_PLACEHOLDERS.houseStreet}
                        disabled={disabled}
                        required
                    />
                ))}
            </div>
        </>
    );
};

export default AddressLevelsSelector;
