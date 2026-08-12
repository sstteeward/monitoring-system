import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { coordinatorService, type CompanyRequest } from '../services/coordinatorService';
import type { GeoJSONPolygon } from '../utils/geoUtils';
import { supabase } from '../lib/supabaseClient';
import AdvancedLocationPickerMap from './AdvancedLocationPickerMap';
import { TableSkeleton } from './Skeletons';
import './CoordinatorDashboard.css';

const CompanyAccountRequestsView: React.FC = () => {
    const navigate = useNavigate();
    const [requests, setRequests] = useState<CompanyRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
    const [selectedRequest, setSelectedRequest] = useState<CompanyRequest | null>(null);
    const [reviewDepartmentId, setReviewDepartmentId] = useState('');
    const [reviewHandleCompany, setReviewHandleCompany] = useState(true);
    const [actionId, setActionId] = useState<string | null>(null);
    const [resolvedLocation, setResolvedLocation] = useState<{
        latitude?: number | null;
        longitude?: number | null;
        geofence_radius?: number | null;
        geofence_polygon?: GeoJSONPolygon | null;
    } | null>(null);

    const loadRequests = async () => {
        setLoading(true);
        try {
            const all = await coordinatorService.getPendingCompanyRequests();
            setRequests(all.filter(r => r.request_type === 'company_account'));
        } catch (err) {
            console.error('Failed to load company account requests:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadRequests();
        coordinatorService.getAllDepartments()
            .then(setDepartments)
            .catch(err => console.error('Failed to load departments:', err));
    }, []);

    const handleApprove = async (req: CompanyRequest, options?: { department_id?: string, handle_company?: boolean }) => {
        setActionId(req.id);
        try {
            await coordinatorService.approveCompanyAccountRequest(req.id, options);
            setRequests(prev => prev.filter(r => r.id !== req.id));
        } catch (err) {
            console.error('Failed to approve company account request:', err);
        } finally {
            setActionId(null);
        }
    };

    const handleReject = async (req: CompanyRequest) => {
        setActionId(req.id);
        try {
            await coordinatorService.rejectCompanyRequest(req.id);
            setRequests(prev => prev.filter(r => r.id !== req.id));
        } catch (err) {
            console.error('Failed to reject company account request:', err);
        } finally {
            setActionId(null);
        }
    };

    const openReview = async (req: CompanyRequest) => {
        setSelectedRequest(req);
        setResolvedLocation(null);
        setReviewDepartmentId('');
        setReviewHandleCompany(true);

        if (!req.latitude && !req.geofence_polygon) {
            try {
                const { data } = await supabase
                    .from('companies')
                    .select('id, name, latitude, longitude, geofence_radius, geofence_polygon')
                    .ilike('name', req.name.trim())
                    .limit(1)
                    .maybeSingle();
                if (data?.latitude || data?.geofence_polygon) {
                    setResolvedLocation(data);
                }
            } catch (err) {
                console.error('Failed to resolve existing company location:', err);
            }
        }
    };

    const inputStyle: React.CSSProperties = {
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '0.6rem 0.9rem',
        color: 'var(--text-primary)',
        fontSize: '0.9rem',
        width: '100%',
        outline: 'none',
    };

    return (
        <div className="view-container fade-in">
            {/* Header */}
            <div className="view-header">
                <div>
                    <h2 className="view-title">Company Account Requests</h2>
                    <p className="view-subtitle">Applications for new company portal accounts awaiting verification</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button
                        onClick={() => navigate('/coordinator/companies')}
                        className="btn btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', border: '1px solid var(--admin-border)', background: 'var(--admin-bg)', color: 'var(--admin-text-secondary)' }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                        Back to Companies
                    </button>
                </div>
            </div>

            {loading ? (
                <TableSkeleton rows={4} cols={4} />
            ) : requests.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-muted)' }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 1rem', display: 'block', opacity: 0.3 }}><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
                    <p style={{ fontWeight: 500, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>No pending company account requests</p>
                    <p style={{ fontSize: '0.9rem' }}>Applications will appear here when a company registers for a portal account.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {requests.map(req => (
                        <div key={req.id} className="glass-card" style={{
                            borderRadius: 12, padding: '1rem 1.25rem',
                            display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
                            border: '1px solid rgba(16,185,129,0.25)',
                            background: 'rgba(16,185,129,0.04)',
                        }}>
                            {req.logo_url ? (
                                <img src={req.logo_url} alt="" style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'contain', flexShrink: 0, background: 'var(--bg-elevated)', border: '1px solid var(--border)' }} />
                            ) : (
                                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(16,185,129,0.12)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
                                </div>
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--admin-text-primary)' }}>{req.name}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-secondary)', marginTop: '0.15rem' }}>
                                    Supervisor <strong>{req.student_name ?? 'Not provided'}</strong> &bull; Submitted {new Date(req.created_at).toLocaleDateString()}
                                </div>
                                {(req.industry || req.contact_email) && (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-secondary)', marginTop: '0.1rem' }}>
                                        {[req.industry, req.contact_email].filter(Boolean).join(' • ')}
                                    </div>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                                <button
                                    onClick={() => openReview(req)}
                                    className="btn btn-secondary"
                                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', borderRadius: '8px', border: '1px solid var(--admin-border)', background: 'var(--admin-bg)', color: 'var(--admin-text-primary)' }}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, display: 'inline-block', verticalAlign: 'text-bottom' }}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                    Review
                                </button>
                                <button
                                    disabled={actionId === req.id}
                                    onClick={() => handleApprove(req)}
                                    className="btn btn-approve"
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                    {actionId === req.id ? 'Processing…' : 'Approve'}
                                </button>
                                <button
                                    disabled={actionId === req.id}
                                    onClick={() => handleReject(req)}
                                    className="btn btn-reject"
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                    Reject
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Review modal */}
            {selectedRequest && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div className="glass-card fade-in company-review-modal" style={{
                        borderRadius: 20, padding: '2rem', width: '90%', maxWidth: 600,
                        boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
                        maxHeight: '90vh', overflowY: 'auto',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.25rem', fontWeight: 700 }}>Review Company Application</h3>
                            <button onClick={() => setSelectedRequest(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                            {selectedRequest.logo_url ? (
                                <img src={selectedRequest.logo_url} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'contain', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }} />
                            ) : (
                                <div style={{ width: 56, height: 56, borderRadius: 12, background: 'rgba(16,185,129,0.12)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
                                </div>
                            )}
                            <div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--admin-text-primary)' }}>{selectedRequest.name}</div>
                                <div style={{ fontSize: '0.9rem', color: 'var(--admin-text-secondary)', marginTop: '0.2rem' }}>
                                    Supervisor <strong>{selectedRequest.student_name ?? 'Not provided'}</strong>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
                            {[['Position', selectedRequest.position], ['Industry', selectedRequest.industry], ['Email', selectedRequest.contact_email], ['Phone', selectedRequest.contact_phone], ['Address', selectedRequest.address], ['Website', selectedRequest.website]].filter(([, value]) => value).map(([label, value]) => (
                                <div key={label} style={{ padding: '0.75rem', border: '1px solid var(--admin-border)', borderRadius: 10, background: 'var(--admin-bg)' }}>
                                    <div style={{ fontSize: '0.68rem', color: 'var(--admin-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>{label}</div>
                                    <div style={{ fontSize: '0.82rem', color: 'var(--admin-text-primary)', wordBreak: 'break-word' }}>{value}</div>
                                </div>
                            ))}
                            {selectedRequest.description && (
                                <div style={{ gridColumn: '1 / -1', padding: '0.75rem', border: '1px solid var(--admin-border)', borderRadius: 10, background: 'var(--admin-bg)' }}>
                                    <div style={{ fontSize: '0.68rem', color: 'var(--admin-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>About the company</div>
                                    <div style={{ fontSize: '0.82rem', color: 'var(--admin-text-primary)', lineHeight: 1.5 }}>{selectedRequest.description}</div>
                                </div>
                            )}
                        </div>

                        {(selectedRequest.latitude || selectedRequest.geofence_polygon || resolvedLocation) ? (
                            <div style={{ marginBottom: '1.5rem', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--admin-border)' }}>
                                <AdvancedLocationPickerMap
                                    initialLat={selectedRequest.latitude ?? resolvedLocation?.latitude ?? null}
                                    initialLng={selectedRequest.longitude ?? resolvedLocation?.longitude ?? null}
                                    initialPolygon={selectedRequest.geofence_polygon ?? resolvedLocation?.geofence_polygon ?? null}
                                    geofenceRadius={selectedRequest.geofence_radius ?? resolvedLocation?.geofence_radius ?? 100}
                                    onLocationSelect={() => {}}
                                    onPolygonChange={() => {}}
                                />
                                <div style={{ padding: '0.75rem', background: 'var(--admin-bg)', fontSize: '0.8rem', color: 'var(--admin-text-secondary)', display: 'flex', gap: '1rem', borderTop: '1px solid var(--admin-border)' }}>
                                    <span>Lat: {(selectedRequest.latitude ?? resolvedLocation?.latitude ?? null)?.toFixed(5) || 'N/A'}</span>
                                    <span>Lng: {(selectedRequest.longitude ?? resolvedLocation?.longitude ?? null)?.toFixed(5) || 'N/A'}</span>
                                    <span>Radius: {selectedRequest.geofence_radius ?? resolvedLocation?.geofence_radius ?? 100}m</span>
                                </div>
                            </div>
                        ) : (
                            <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--admin-bg)', borderRadius: '12px', border: '1px solid var(--admin-border)', marginBottom: '1.5rem', color: 'var(--admin-text-secondary)' }}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 0.5rem', opacity: 0.5 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                                <p style={{ margin: 0 }}>No location details provided with this request.</p>
                            </div>
                        )}

                        <div style={{ marginBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--admin-text-secondary)', marginBottom: '0.4rem' }}>Department Category (Optional)</label>
                                <select
                                    style={inputStyle}
                                    value={reviewDepartmentId}
                                    onChange={e => setReviewDepartmentId(e.target.value)}
                                >
                                    <option value="" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>Uncategorized</option>
                                    {departments.map(d => (
                                        <option key={d.id} value={d.id} style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>{d.name}</option>
                                    ))}
                                </select>
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--admin-text-primary)' }}>
                                <input
                                    type="checkbox"
                                    checked={reviewHandleCompany}
                                    onChange={e => setReviewHandleCompany(e.target.checked)}
                                    style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                                />
                                Handle this company immediately
                            </label>
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setSelectedRequest(null)}
                                style={{ padding: '0.75rem 1.25rem', borderRadius: 10, border: '1px solid var(--admin-border)', background: 'var(--admin-bg)', color: 'var(--admin-text-secondary)', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
                            >
                                Cancel
                            </button>
                            <button
                                disabled={actionId === selectedRequest.id}
                                onClick={() => {
                                    handleReject(selectedRequest);
                                    setSelectedRequest(null);
                                }}
                                className="btn btn-reject"
                                style={{ padding: '0.75rem 1.25rem' }}
                            >
                                Reject
                            </button>
                            <button
                                disabled={actionId === selectedRequest.id}
                                onClick={() => {
                                    handleApprove(selectedRequest, {
                                        department_id: reviewDepartmentId || undefined,
                                        handle_company: reviewHandleCompany,
                                    });
                                    setSelectedRequest(null);
                                }}
                                className="btn btn-approve"
                                style={{ padding: '0.75rem 1.25rem' }}
                            >
                                {actionId === selectedRequest.id ? 'Approving...' : 'Approve Application'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CompanyAccountRequestsView;
