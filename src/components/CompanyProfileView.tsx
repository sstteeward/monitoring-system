import React, { useEffect, useState } from 'react';
import { companyService } from '../services/companyService';
import { profileService } from '../services/profileService';

const CompanyProfileView: React.FC = () => {
    const [companyData, setCompanyData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [companyId, setCompanyId] = useState<string | null>(null);
    
    // For storing the original data to cancel changes
    const [originalData, setOriginalData] = useState<any>(null);

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
        } catch (err: any) {
            console.error('Failed to load company profile:', err);
            setError(err?.message || JSON.stringify(err));
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setCompanyData({ ...companyData, [name]: value });
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!companyId || !companyData) return;
        
        setSaving(true);
        setSuccessMessage(null);
        setError(null);
        
        try {
            await companyService.updateCompanyInfo(companyId, {
                name: companyData.name,
                description: companyData.description,
                address: companyData.address,
                website: companyData.website,
                industry: companyData.industry,
                contact_person: companyData.contact_person,
                contact_email: companyData.contact_email,
                contact_phone: companyData.contact_phone,
                logo_url: companyData.logo_url
            });
            setOriginalData(companyData);
            setSuccessMessage("Company profile updated successfully!");
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err: any) {
            console.error('Failed to update profile:', err);
            setError(`Failed to update profile: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setCompanyData(originalData);
    };

    if (error && !companyData) return (
        <div className="view-container fade-in">
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '1.5rem 2rem', color: '#f87171' }}>
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
        <div className="view-container fade-in" style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div className="view-header" style={{ marginBottom: '2rem' }}>
                <h2 className="view-title" style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>Company Profile</h2>
                <p className="view-subtitle" style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0', fontSize: '0.95rem' }}>
                    Manage your company's information and contact details
                </p>
            </div>

            {successMessage && (
                <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 8, padding: '1rem 1.5rem', color: '#10b981', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    {successMessage}
                </div>
            )}
            
            {error && companyData && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '1rem 1.5rem', color: '#ef4444', marginBottom: '1.5rem' }}>
                    {error}
                </div>
            )}

            {companyData && (
                <form className="glass-card" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }} onSubmit={handleSave}>
                    
                    {/* Logo & Basic Info */}
                    <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div style={{ 
                            width: 120, height: 120, 
                            borderRadius: '12px', 
                            background: 'var(--bg-elevated)', 
                            border: '1px solid var(--border)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            overflow: 'hidden', flexShrink: 0
                        }}>
                            {companyData.logo_url ? (
                                <img src={companyData.logo_url} alt="Company Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '0.5rem' }} />
                            ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: '2rem', fontWeight: 'bold' }}>{companyData.name?.charAt(0) || 'C'}</span>
                            )}
                        </div>
                        
                        <div style={{ flex: 1, minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Company Name</label>
                                <input type="text" name="name" className="form-input" style={{ width: '100%' }} value={companyData.name || ''} onChange={handleChange} required />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Logo URL (Optional)</label>
                                <input type="url" name="logo_url" className="form-input" style={{ width: '100%' }} value={companyData.logo_url || ''} onChange={handleChange} placeholder="https://example.com/logo.png" />
                            </div>
                        </div>
                    </div>

                    <div style={{ height: '1px', background: 'var(--border)' }}></div>

                    {/* About Company */}
                    <div>
                        <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem' }}>About the Company</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Industry</label>
                                <input type="text" name="industry" className="form-input" style={{ width: '100%' }} value={companyData.industry || ''} onChange={handleChange} placeholder="e.g., Information Technology" />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Website</label>
                                <input type="url" name="website" className="form-input" style={{ width: '100%' }} value={companyData.website || ''} onChange={handleChange} placeholder="https://..." />
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Description</label>
                                <textarea name="description" className="form-input" style={{ width: '100%', minHeight: '100px', resize: 'vertical' }} value={companyData.description || ''} onChange={handleChange} placeholder="Brief description of the company..." />
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Address</label>
                                <input type="text" name="address" className="form-input" style={{ width: '100%' }} value={companyData.address || ''} onChange={handleChange} placeholder="Company headquarters or main office address" />
                            </div>
                        </div>
                    </div>

                    <div style={{ height: '1px', background: 'var(--border)' }}></div>

                    {/* Contact Information */}
                    <div>
                        <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.1rem' }}>Contact Information</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Primary Contact Person</label>
                                <input type="text" name="contact_person" className="form-input" style={{ width: '100%' }} value={companyData.contact_person || ''} onChange={handleChange} placeholder="Name of primary contact" />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Contact Email</label>
                                <input type="email" name="contact_email" className="form-input" style={{ width: '100%' }} value={companyData.contact_email || ''} onChange={handleChange} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Contact Phone</label>
                                <input type="tel" name="contact_phone" className="form-input" style={{ width: '100%' }} value={companyData.contact_phone || ''} onChange={handleChange} />
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                        <button 
                            type="button" 
                            className="btn-secondary" 
                            onClick={handleCancel} 
                            disabled={saving || JSON.stringify(companyData) === JSON.stringify(originalData)}
                        >
                            Cancel Changes
                        </button>
                        <button 
                            type="submit" 
                            className="btn-primary" 
                            disabled={saving || JSON.stringify(companyData) === JSON.stringify(originalData)}
                        >
                            {saving ? 'Saving...' : 'Save Profile'}
                        </button>
                    </div>

                </form>
            )}
        </div>
    );
};

export default CompanyProfileView;
