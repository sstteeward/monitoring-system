/**
 * Holds the by-level address state and the PSGC cascade resets that every
 * onboarding form needs. Extracted from AdviserOnboardingView (the reference
 * implementation) so Student, Coordinator and Company share the exact behaviour.
 */
import { useCallback, useMemo, useState } from 'react';
import usePsLocation from '../../hooks/usePsLocation';
import type { CustomSelectOption } from '../CustomSelect';
import { EMPTY_ADDRESS_LEVELS, type AddressLevels } from './onboardingFields';

export interface UseAddressLevelsReturn {
    address: AddressLevels;
    setAddress: React.Dispatch<React.SetStateAction<AddressLevels>>;
    /** Replaces the whole address, e.g. when a profile row loads. */
    resetAddress: (next: Partial<AddressLevels>) => void;
    setHouseStreet: (value: string) => void;
    /** Selecting a level clears every level below it. */
    selectRegion: (code: string) => void;
    selectProvince: (code: string) => void;
    selectCity: (code: string) => void;
    selectBarangay: (code: string) => void;
    regionOptions: CustomSelectOption[];
    provinceOptions: CustomSelectOption[];
    cityOptions: CustomSelectOption[];
    barangayOptions: CustomSelectOption[];
    loading: boolean;
}

/** Builds the address levels from a profile-shaped row. */
/** Any row carrying the by-level address columns (profiles, companies, company_requests). */
export interface AddressLevelRow {
    country?: string | null;
    region?: string | null;
    region_code?: string | null;
    province?: string | null;
    province_code?: string | null;
    city_municipality?: string | null;
    city_municipality_code?: string | null;
    barangay?: string | null;
    barangay_code?: string | null;
    house_street?: string | null;
}

export function addressLevelsFromProfile(row: AddressLevelRow | null | undefined): AddressLevels {
    const str = (key: keyof AddressLevelRow, fallback = '') => {
        const value = row?.[key];
        return typeof value === 'string' && value ? value : fallback;
    };
    return {
        country: str('country', 'Philippines'),
        regionCode: str('region_code'),
        regionName: str('region'),
        provinceCode: str('province_code'),
        provinceName: str('province'),
        cityCode: str('city_municipality_code'),
        cityMunicipalityName: str('city_municipality'),
        barangayCode: str('barangay_code'),
        barangayName: str('barangay'),
        houseStreet: str('house_street'),
    };
}

export function useAddressLevels(initial?: Partial<AddressLevels>): UseAddressLevelsReturn {
    const [address, setAddress] = useState<AddressLevels>({ ...EMPTY_ADDRESS_LEVELS, ...initial });

    const {
        regions,
        loading,
        getProvincesByRegion,
        getCitiesByProvince,
        getBarangaysByCity,
        getRegionByCode,
        getProvinceByCode,
        getCityByCode,
        getBarangayByCode,
    } = usePsLocation();

    const resetAddress = useCallback((next: Partial<AddressLevels>) => {
        setAddress(prev => ({ ...prev, ...next }));
    }, []);

    const setHouseStreet = useCallback((value: string) => {
        setAddress(prev => ({ ...prev, houseStreet: value }));
    }, []);

    const selectRegion = useCallback((code: string) => {
        const region = getRegionByCode(code);
        setAddress(prev => ({
            ...prev,
            regionCode: code,
            regionName: region?.region_name ?? '',
            // Clear every level below.
            provinceCode: '', provinceName: '',
            cityCode: '', cityMunicipalityName: '',
            barangayCode: '', barangayName: '',
        }));
    }, [getRegionByCode]);

    const selectProvince = useCallback((code: string) => {
        const province = getProvinceByCode(code);
        setAddress(prev => ({
            ...prev,
            provinceCode: code,
            provinceName: province?.province_name ?? '',
            cityCode: '', cityMunicipalityName: '',
            barangayCode: '', barangayName: '',
        }));
    }, [getProvinceByCode]);

    const selectCity = useCallback((code: string) => {
        const city = getCityByCode(code);
        setAddress(prev => ({
            ...prev,
            cityCode: code,
            cityMunicipalityName: city?.city_name ?? '',
            barangayCode: '', barangayName: '',
        }));
    }, [getCityByCode]);

    const selectBarangay = useCallback((code: string) => {
        const barangay = getBarangayByCode(code);
        setAddress(prev => ({
            ...prev,
            barangayCode: code,
            barangayName: barangay?.barangay_name ?? '',
        }));
    }, [getBarangayByCode]);

    const regionOptions = useMemo(
        () => regions.map(r => ({ value: r.region_code, label: r.region_name, code: r.region_code })),
        [regions]
    );

    const provinceOptions = useMemo(
        () => (address.regionCode ? getProvincesByRegion(address.regionCode) : [])
            .map(p => ({ value: p.province_code, label: p.province_name, code: p.province_code })),
        [address.regionCode, getProvincesByRegion]
    );

    const cityOptions = useMemo(
        () => (address.provinceCode ? getCitiesByProvince(address.provinceCode) : [])
            .map(c => ({ value: c.city_code, label: c.city_name, code: c.city_code })),
        [address.provinceCode, getCitiesByProvince]
    );

    const barangayOptions = useMemo(
        () => (address.cityCode ? getBarangaysByCity(address.cityCode) : [])
            .map(b => ({ value: b.barangay_code, label: b.barangay_name, code: b.barangay_code })),
        [address.cityCode, getBarangaysByCity]
    );

    return {
        address,
        setAddress,
        resetAddress,
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
    };
}
