import { useEffect, useState } from 'react';

export interface PsRegion {
  region_code: string;
  region_name: string;
}

export interface PsProvince {
  province_code: string;
  province_name: string;
  region_code: string;
}

export interface PsCityMunicipality {
  city_code: string;
  city_name: string;
  province_code: string;
  city_municipality_type: string;
}

export interface PsBarangay {
  barangay_code: string;
  barangay_name: string;
  city_code: string;
  municipality_code: string;
}

export interface PsLocationData {
  regions: PsRegion[];
  provinces: PsProvince[];
  cities: PsCityMunicipality[];
  barangays: PsBarangay[];
}

export interface UsePsLocationReturn {
  regions: PsRegion[];
  provinces: PsProvince[];
  cities: PsCityMunicipality[];
  barangays: PsBarangay[];
  loading: boolean;
  getProvincesByRegion: (regionCode: string) => PsProvince[];
  getCitiesByProvince: (provinceCode: string) => PsCityMunicipality[];
  getBarangaysByCity: (cityCode: string) => PsBarangay[];
  getRegionByCode: (code: string) => PsRegion | undefined;
  getProvinceByCode: (code: string) => PsProvince | undefined;
  getCityByCode: (code: string) => PsCityMunicipality | undefined;
  getBarangayByCode: (code: string) => PsBarangay | undefined;
  getRegionByName: (name: string) => PsRegion | undefined;
  getProvinceByName: (name: string) => PsProvince | undefined;
  getCityByName: (name: string) => PsCityMunicipality | undefined;
  getBarangayByName: (name: string) => PsBarangay | undefined;
}

const usePsLocation = (): UsePsLocationReturn => {
  const [data, setData] = useState<PsLocationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/psgc.json')
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to fetch PSGC data: ${response.status}`);
        }
        return response.json();
      })
      .then((rawData: any) => {
        const regionDisplayNames: Record<string, string> = {
          '170000000': 'Region IV-B — MIMAROPA',
          '130000000': 'National Capital Region — NCR',
          '140000000': 'Cordillera Administrative Region — CAR',
          '150000000': 'Bangsamoro Autonomous Region in Muslim Mindanao — BARMM',
          '180000000': 'Region 18 — Negros Island Region',
        };

        const mappedRegions = rawData.regions.map((r: any) => ({
          region_code: r.code,
          region_name: regionDisplayNames[r.code] || `${r.regionName} — ${r.name}`,
        }));

        const mappedProvinces = rawData.provinces.map((p: any) => ({
          province_code: p.code,
          province_name: p.name,
          region_code: p.regionCode,
        }));

        const mappedCities = rawData.cities.map((c: any) => ({
          city_code: c.code,
          city_name: c.name,
          province_code: c.provinceCode,
          city_municipality_type: c.isCity ? 'City' : 'Municipality',
        }));

        const mappedBarangays = rawData.barangays.map((b: any) => ({
          barangay_code: b.code,
          barangay_name: b.name,
          city_code: b.cityCode || '',
          municipality_code: b.municipalityCode || '',
        }));

        const psgcData: PsLocationData = {
          regions: mappedRegions,
          provinces: mappedProvinces,
          cities: mappedCities,
          barangays: mappedBarangays,
        };

        setData(psgcData);
        setLoading(false);
      })
      .catch(error => {
        console.error('Error loading PSGC data:', error);
        setLoading(false);
      });
  }, []);

  if (!data) {
    return {
      regions: [],
      provinces: [],
      cities: [],
      barangays: [],
      loading: true,
      getProvincesByRegion: () => [],
      getCitiesByProvince: () => [],
      getBarangaysByCity: () => [],
      getRegionByCode: () => undefined,
      getProvinceByCode: () => undefined,
      getCityByCode: () => undefined,
      getBarangayByCode: () => undefined,
      getRegionByName: () => undefined,
      getProvinceByName: () => undefined,
      getCityByName: () => undefined,
      getBarangayByName: () => undefined,
    };
  }

  const getProvincesByRegion = (regionCode: string): PsProvince[] => {
    return data.provinces.filter(province => province.region_code === regionCode);
  };

  const getCitiesByProvince = (provinceCode: string): PsCityMunicipality[] => {
    return data.cities.filter(city => city.province_code === provinceCode);
  };

  const getBarangaysByCity = (cityCode: string): PsBarangay[] => {
    return data.barangays.filter(barangay => barangay.city_code === cityCode || barangay.municipality_code === cityCode);
  };

  const getRegionByCode = (code: string): PsRegion | undefined => {
    return data.regions.find(r => r.region_code === code);
  };

  const getProvinceByCode = (code: string): PsProvince | undefined => {
    return data.provinces.find(p => p.province_code === code);
  };

  const getCityByCode = (code: string): PsCityMunicipality | undefined => {
    return data.cities.find(c => c.city_code === code);
  };

  const getBarangayByCode = (code: string): PsBarangay | undefined => {
    return data.barangays.find(b => b.barangay_code === code);
  };

  const getRegionByName = (name: string): PsRegion | undefined => {
    return data.regions.find(r => r.region_name === name);
  };

  const getProvinceByName = (name: string): PsProvince | undefined => {
    return data.provinces.find(p => p.province_name === name);
  };

  const getCityByName = (name: string): PsCityMunicipality | undefined => {
    return data.cities.find(c => c.city_name === name);
  };

  const getBarangayByName = (name: string): PsBarangay | undefined => {
    return data.barangays.find(b => b.barangay_name === name);
  };

  return {
    regions: data?.regions ?? [],
    provinces: data?.provinces ?? [],
    cities: data?.cities ?? [],
    barangays: data?.barangays ?? [],
    loading,
    getProvincesByRegion,
    getCitiesByProvince,
    getBarangaysByCity,
    getRegionByCode,
    getProvinceByCode,
    getCityByCode,
    getBarangayByCode,
    getRegionByName,
    getProvinceByName,
    getCityByName,
    getBarangayByName,
  };
};

export default usePsLocation;