import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { companyService } from '../services/companyService';
import { profileService } from '../services/profileService';
import AdvancedLocationPickerMap from './AdvancedLocationPickerMap';
import './CompanyProfileView.css';

interface CompanyData {
    name?: string;
    description?: string;
    address?: string;
    website?: string;
    industry?: string;
    contact_person?: string;
    contact_email?: string;
    contact_phone?: string;
    logo_url?: string;
    latitude?: number | null;
    longitude?: number | null;
    geofence_radius?: number | null;
    geofence_polygon?: any;
}

const CompanyProfileView: React.FC = () => {
    const [companyData, setCompanyData] = useState<CompanyData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [companyId, setCompanyId] = useState<string | null>(null);
    const [originalData, setOriginalData] = useState<CompanyData | null>(null);
    const [fetchingAddress, setFetchingAddress] = useState(false);
    const [showAdvancedLocation, setShowAdvancedLocation] = useState(false);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const [uploadingLogo, setUploadingLogo] = useState(false);

    useEffect(() => { loadProfile(); }, []);

    const loadProfile = async () => {
        setLoading(true);
        setError(null);
        try {
            const profile = await profileService.getCurrentProfile();
            if (!profile?.company_id) {
                throw new Error("You are not associated with any company.");
            }
            setCompanyId(profile.company_id);
            const data = await companyService.getCompanyInfo(profile.company_id);
            setCompanyData(data);
            setOriginalData(data);
            if (data?.latitude && data?.longitude && !data?.address) {
                fillAddressFromCoordinates(data.latitude, data.longitude);
            }
        } catch (err: any) {
            console.error('Failed to load company profile:', err);
            setError(err?.message || JSON.stringify(err));
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setCompanyData(prev => ({ ...prev!, [name]: value }));
    };

    const handleNumberChange = (name: string, value: string) => {
        const parsed = value.trim() === '' ? null : parseFloat(value);
        setCompanyData(prev => ({ ...prev!, [name]: isNaN(parsed as number) ? null : parsed }));
    };

    const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            setLogoFile(file);
            setLogoPreview(URL.createObjectURL(file));
        }
    };

    const uploadCompanyLogo = async (file: File): Promise<string> => {
        const fileExt = file.name.split('.').pop();
        const fileName = `logo-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
            .from('company_logos')
            .upload(fileName, file);
        if (uploadError) {
            console.error('Company logo upload failed:', uploadError);
            throw uploadError;
        }
        const { data } = supabase.storage
            .from('company_logos')
            .getPublicUrl(fileName);
        return data.publicUrl;
    };

    const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
        try {
            const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`);
            if (!res.ok) return null;
            const data = await res.json();
            const f = data?.features?.[0];
            if (!f?.properties) return null;
            const p = f.properties;
            const parts = [p.street || p.name, p.houseNumber, p.city || p.district, p.state, p.country]
                .filter((v, i, arr) => {
                    if (!v) return false;
                    return arr.indexOf(v) === i;
                });
            return parts.join(', ') || null;
        } catch (err) {
            console.error('Reverse geocoding failed:', err);
            return null;
        }
    };

    const fillAddressFromCoordinates = async (lat?: number | null, lng?: number | null) => {
        const latVal = lat ?? companyData?.latitude;
        const lngVal = lng ?? companyData?.longitude;
        if (latVal == null || lngVal == null) return;
        setFetchingAddress(true);
        const address = await reverseGeocode(Number(latVal), Number(lngVal));
        if (address) {
            setCompanyData(prev => ({ ...prev!, address }));
        }
        setFetchingAddress(false);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!companyId || !companyData) return;

        setSaving(true);
        setSuccessMessage(null);
        setError(null);

        try {
            let logoUrl = companyData.logo_url;
            if (logoFile) {
                setUploadingLogo(true);
                logoUrl = await uploadCompanyLogo(logoFile);
            }

            await companyService.updateCompanyInfo(companyId, {
                name: companyData.name,
                description: companyData.description,
                address: companyData.address,
                website: companyData.website,
                industry: companyData.industry,
                contact_person: companyData.contact_person,
                contact_email: companyData.contact_email,
                contact_phone: companyData.contact_phone,
                logo_url: logoUrl,
                latitude: companyData.latitude ?? null,
                longitude: companyData.longitude ?? null,
                geofence_polygon: companyData.geofence_polygon ?? null,
                geofence_radius: companyData.geofence_radius ?? 100,
                geofence_mode: companyData.geofence_polygon ? 'polygon' : 'circular'
            });
            const refreshed = await companyService.getCompanyInfo(companyId);
            setOriginalData(refreshed);
            setCompanyData(refreshed);
            setLogoFile(null);
            setLogoPreview(null);
            setSuccessMessage("Company profile updated successfully!");
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err: any) {
            console.error('Failed to update profile:', err);
            setError(`Failed to update profile: ${err.message}`);
        } finally {
            setUploadingLogo(false);
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setCompanyData(originalData);
        setLogoFile(null);
        setLogoPreview(null);
        setError(null);
    };

    const hasLocation = !!(companyData?.latitude && companyData?.longitude);
    const isDirty = JSON.stringify(companyData) !== JSON.stringify(originalData) || !!logoFile;

    const completionFields = [
        companyData?.name,
        companyData?.industry,
        companyData?.website,
        companyData?.description,
        companyData?.contact_person,
        companyData?.contact_email,
        companyData?.contact_phone,
        companyData?.address,
        hasLocation,
    ];
    const completion = Math.round(completionFields.filter(Boolean).length / completionFields.length * 100);
    const profileComplete = completion === 100;

    if (error && !companyData) return (
        <div className="view-container fade-in">
            <div className="cp-banner error" style={{ marginTop: '1rem' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                <strong>Error:</strong> {error}
            </div>
        </div>
    );

    if (loading && !companyData) return (
        <div className="view-container fade-in" style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <div style={{ color: 'var(--text-muted)' }}>Loading company profile...</div>
        </div>
    );

    return (
        <div className="view-container fade-in">
            <div className="view-header cp-page-header">
                <div>
                    <h2 className="view-title">Company Profile</h2>
                    <p className="view-subtitle">Manage your company's information, contact details, and office location</p>
                </div>
                <div className="cp-header-right">
                    <span className={`cp-profile-status${profileComplete ? '' : ' warn'}`}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            {profileComplete
                                ? <polyline points="20 6 9 17 4 12" />
                                : <path d="M12 9v4M12 17h.01" />}
                        </svg>
                        {profileComplete ? 'Profile Complete' : `${completion}% Complete`}
                    </span>
                </div>
            </div>

            <div className="cp-container">
                {/* Identity Hero */}
                <div className="cp-hero">
                    <div
                        className="cp-hero-logo"
                        onClick={() => document.getElementById('company-logo-upload')?.click()}
                        title="Click to change company logo"
                    >
                        {logoPreview ? (
                            <img src={logoPreview} alt="Company Logo" />
                        ) : companyData?.logo_url ? (
                            <img src={companyData.logo_url} alt="Company Logo" />
                        ) : (
                            <span>{companyData?.name?.charAt(0) || 'C'}</span>
                        )}
                        <span className="cp-logo-overlay">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                            Change Logo
                        </span>
                        <input
                            id="company-logo-upload"
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={handleLogoChange}
                        />
                    </div>
                    <div className="cp-hero-info">
                        <h3 className="cp-hero-name">{companyData?.name || 'Company'}</h3>
                        <div className="cp-hero-meta">
                            {companyData?.industry && <span className="cp-badge">{companyData.industry}</span>}
                            {companyData?.website && (
                                <span className="cp-badge neutral">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
                                    {companyData.website.replace(/^https?:\/\//, '')}
                                </span>
                            )}
                            {companyData?.address && (
                                <span className="cp-hero-location">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                                    <span>{companyData.address}</span>
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="cp-hero-right">
                        <span className={`cp-coord-chip${hasLocation ? ' set' : ''}`}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                            {hasLocation
                                ? `${companyData.latitude?.toFixed(4)}, ${companyData.longitude?.toFixed(4)}`
                                : 'No location set'}
                        </span>
                        {companyData?.contact_email && (
                            <span className="cp-badge neutral">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                                {companyData.contact_email}
                            </span>
                        )}
                    </div>
                </div>

                {successMessage && (
                    <div className="cp-banner success">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        {successMessage}
                    </div>
                )}

                {error && companyData && (
                    <div className="cp-banner error">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                        {error}
                    </div>
                )}

                {companyData && (
                    <form onSubmit={handleSave}>
                        <div className="cp-grid-2">
                            {/* Basic Information */}
                            <section className="cp-card">
                                <div className="cp-card-header">
                                    <div className="cp-card-icon">
                                        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                                    </div>
                                    <div>
                                        <h4 className="cp-card-title">Basic Information</h4>
                                        <p className="cp-card-sub">How your company is identified</p>
                                    </div>
                                </div>
                                <div className="cp-grid">
                                    <div className="full cp-field">
                                        <label>Company Name</label>
                                        <input type="text" name="name" className="cp-input" value={companyData.name || ''} onChange={handleChange} required placeholder="Company legal / trade name" />
                                    </div>
                                    <div className="cp-field">
                                        <label>Industry</label>
                                        <input type="text" name="industry" className="cp-input" value={companyData.industry || ''} onChange={handleChange} placeholder="e.g., IT" />
                                    </div>
                                    <div className="cp-field">
                                        <label>Website</label>
                                        <input type="url" name="website" className="cp-input" value={companyData.website || ''} onChange={handleChange} placeholder="https://..." />
                                    </div>
                                    <div className="cp-field">
                                        <label>Logo URL</label>
                                        <input type="url" name="logo_url" className="cp-input" value={companyData.logo_url || ''} onChange={handleChange} placeholder="https://example.com/logo.png" />
                                    </div>
                                    <div className="full cp-field">
                                        <label>Company Description</label>
                                        <textarea name="description" className="cp-input" value={companyData.description || ''} onChange={handleChange} placeholder="Brief description of the company and what your interns will do..." />
                                    </div>
                                </div>
                            </section>

                            {/* Contact Information */}
                            <section className="cp-card">
                                <div className="cp-card-header">
                                    <div className="cp-card-icon">
                                        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                                    </div>
                                    <div>
                                        <h4 className="cp-card-title">Contact Information</h4>
                                        <p className="cp-card-sub">Who interns and coordinators reach out to</p>
                                    </div>
                                </div>
                                <div className="cp-grid">
                                    <div className="full cp-field">
                                        <label>Primary Contact Person</label>
                                        <input type="text" name="contact_person" className="cp-input" value={companyData.contact_person || ''} onChange={handleChange} placeholder="Name of primary contact" />
                                    </div>
                                    <div className="full cp-field">
                                        <label>Contact Email</label>
                                        <input type="email" name="contact_email" className="cp-input" value={companyData.contact_email || ''} onChange={handleChange} placeholder="company@email.com" />
                                    </div>
                                    <div className="full cp-field">
                                        <label>Contact Phone</label>
                                        <input type="tel" name="contact_phone" className="cp-input" value={companyData.contact_phone || ''} onChange={handleChange} placeholder="(123) 456-7890" />
                                    </div>
                                    <div className="cp-field">
                                        <label>Profile Status</label>
                                        <input type="text" className="cp-input" readOnly value={profileComplete ? 'Complete' : `${completion}% complete`} style={{ color: profileComplete ? 'var(--primary)' : '#f59e0b', fontWeight: 600 }} />
                                    </div>
                                    <div className="cp-field">
                                        <label>Company ID</label>
                                        <input type="text" className="cp-input" readOnly value={companyId?.slice(0, 8) || '—'} style={{ color: 'var(--text-muted)' }} />
                                    </div>
                                </div>
                            </section>
                        </div>

                        {/* Location */}
                        <section className="cp-card" style={{ marginTop: '1.25rem' }}>
                            <div className="cp-card-header">
                                <div className="cp-card-icon">
                                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                                </div>
                                <div>
                                    <h4 className="cp-card-title">Company Location</h4>
                                    <p className="cp-card-sub">Your office address and map pin — used to anchor geofenced clock-ins for your interns</p>
                                </div>
                            </div>
                            <div className="cp-field" style={{ marginBottom: '1rem' }}>
                                <label>Street Address</label>
                                <input type="text" name="address" className="cp-input" value={companyData.address || ''} onChange={handleChange} placeholder="Company headquarters or main office address" />
                            </div>
                            <div className="cp-map-box">
                                <AdvancedLocationPickerMap
                                    initialLat={companyData.latitude ? Number(companyData.latitude) : null}
                                    initialLng={companyData.longitude ? Number(companyData.longitude) : null}
                                    initialPolygon={companyData.geofence_polygon || null}
                                    showPolygonControls={showAdvancedLocation}
                                    onLocationSelect={(lat, lng) => {
                                        setCompanyData(prev => ({
                                            ...prev!,
                                            latitude: parseFloat(lat.toFixed(6)),
                                            longitude: parseFloat(lng.toFixed(6))
                                        }));
                                        fillAddressFromCoordinates(lat, lng);
                                    }}
                                    onPolygonChange={(polygon) => {
                                        setCompanyData(prev => ({ ...prev!, geofence_polygon: polygon }));
                                    }}
                                />
                            </div>
                            <p className="cp-hint">Search for your address, then click the map to drop the pin on your exact office location.</p>

                            <button
                                type="button"
                                className={`cp-view-more${showAdvancedLocation ? ' open' : ''}`}
                                onClick={() => setShowAdvancedLocation(v => !v)}
                                aria-expanded={showAdvancedLocation}
                                aria-controls="cp-advanced-location"
                            >
                                {showAdvancedLocation ? 'View Less' : 'View More'}
                                <svg className="cp-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                            </button>

                            <div id="cp-advanced-location" className={`cp-advanced-location${showAdvancedLocation ? ' open' : ''}`}>
                                <div className="cp-advanced-inner">
                                    <div className="cp-advanced-head">
                                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                                        <div>
                                            <h5 className="cp-advanced-title">Advanced Location Settings</h5>
                                            <p className="cp-hint" style={{ margin: '0.1rem 0 0' }}>Coordinates, geofence radius, and polygon controls for precise clock-in areas.</p>
                                        </div>
                                    </div>

                                    <div className="cp-grid" style={{ marginTop: '1rem' }}>
                                        <div className="cp-field">
                                            <label>Latitude</label>
                                            <input type="number" step="any" name="latitude" className="cp-input" value={companyData.latitude ?? ''} onChange={e => handleNumberChange('latitude', e.target.value)} placeholder="9.6017" />
                                        </div>
                                        <div className="cp-field">
                                            <label>Longitude</label>
                                            <input type="number" step="any" name="longitude" className="cp-input" value={companyData.longitude ?? ''} onChange={e => handleNumberChange('longitude', e.target.value)} placeholder="123.3953" />
                                        </div>
                                        <div className="cp-field">
                                            <label>Geofence Radius (meters)</label>
                                            <input type="number" min="10" name="geofence_radius" className="cp-input" value={companyData.geofence_radius ?? 100} onChange={e => handleNumberChange('geofence_radius', e.target.value)} />
                                            <p className="cp-hint">Radius around the pin for clock-ins (used when no polygon is drawn).</p>
                                        </div>
                                    </div>

                                    <div className="cp-location-actions">
                                        <button
                                            type="button"
                                            className="cp-btn"
                                            onClick={() => fillAddressFromCoordinates()}
                                            disabled={fetchingAddress || !(companyData.latitude && companyData.longitude)}
                                        >
                                            {fetchingAddress ? (
                                                <>
                                                    <span className="cp-spinner" style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid var(--border-strong)', borderTopColor: 'var(--primary)', animation: 'spin 0.7s linear infinite' }} />
                                                    Finding address...
                                                </>
                                            ) : (
                                                <>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                                                    Fetch Address
                                                </>
                                            )}
                                        </button>
                                        <button type="button" className="cp-btn" onClick={() => {
                                            setCompanyData(prev => ({ ...prev!, latitude: null, longitude: null, geofence_polygon: null }));
                                        }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                            Clear Location
                                        </button>
                                    </div>

                                    <div className="cp-polygon-note">
                                        <strong>Polygon Controls</strong>
                                        <p className="cp-hint" style={{ margin: '0.25rem 0 0' }}>
                                            Use the Draw Polygon / Redraw / Clear buttons below the map to manage a custom geofence. When a polygon is set, it takes precedence over the radius.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Sticky Action Bar */}
                        <div className="cp-action-bar">
                            {isDirty ? (
                                <span className="cp-dirty">Unsaved changes</span>
                            ) : (
                                <span className="cp-coord-chip">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                    All changes saved
                                </span>
                            )}
                            <div className="cp-action-buttons">
                                <button type="button" className="cp-btn" onClick={handleCancel} disabled={saving || !isDirty}>
                                    Cancel Changes
                                </button>
                                <button type="submit" className="cp-btn cp-btn-primary" disabled={saving || !isDirty}>
                                    {saving ? (
                                        <>
                                            <span className="cp-spinner" style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }} />
                                            {uploadingLogo ? 'Uploading Logo...' : 'Saving...'}
                                        </>
                                    ) : (
                                        <>
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                            Save Profile
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default CompanyProfileView;
