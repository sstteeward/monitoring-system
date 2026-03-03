import React, { useEffect, useState } from 'react';
import { coordinatorService } from '../services/coordinatorService';
import { supabase } from '../lib/supabaseClient';
import { TableSkeleton } from './Skeletons';
import './CoordinatorDashboard.css';

const ApprovalsView: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'documents' | 'journals' | 'dtr'>('documents');
    const [documents, setDocuments] = useState<any[]>([]);
    const [journals, setJournals] = useState<any[]>([]);
    const [timesheets, setTimesheets] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewType, setPreviewType] = useState<string | null>(null);
    const [previewFileName, setPreviewFileName] = useState<string | null>(null);
    const [previewFilePath, setPreviewFilePath] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState<string | null>(null);
    const [previewJournal, setPreviewJournal] = useState<any | null>(null);

    useEffect(() => {
        if (activeTab === 'documents') loadPendingDocuments();
        else if (activeTab === 'journals') loadPendingJournals();
        else if (activeTab === 'dtr') loadPendingTimesheets();
    }, [activeTab]);

    const loadPendingDocuments = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await coordinatorService.getPendingDocuments();
            setDocuments(data || []);
        } catch (err: any) {
            console.error("Failed to load documents:", err);
            setError(err?.message || JSON.stringify(err));
        } finally {
            setLoading(false);
        }
    };

    const loadPendingJournals = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await coordinatorService.getPendingJournals();
            setJournals(data || []);
        } catch (err: any) {
            console.error("Failed to load journals:", err);
            setError(err?.message || JSON.stringify(err));
        } finally {
            setLoading(false);
        }
    };

    const loadPendingTimesheets = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await coordinatorService.getPendingTimesheets();
            setTimesheets(data || []);
        } catch (err: any) {
            console.error("Failed to load timesheets:", err);
            setError(err?.message || JSON.stringify(err));
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (id: string, status: 'approved' | 'rejected') => {
        setActionLoading(id);
        try {
            if (activeTab === 'documents') {
                await coordinatorService.updateDocumentStatus(id, status);
                setDocuments(prev => prev.filter(d => d.id !== id));
            } else if (activeTab === 'journals') {
                await coordinatorService.updateJournalStatus(id, status);
                setJournals(prev => prev.filter(d => d.id !== id));
            } else if (activeTab === 'dtr') {
                await coordinatorService.updateTimesheetStatus(id, status);
                setTimesheets(prev => prev.filter(d => d.id !== id));
            }
        } catch (err) {
            console.error(`Failed to mark item as ${status}:`, err);
            alert(`Error: Could not mark item as ${status}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDownload = async (filePath: string, fileName: string) => {
        try {
            const { data, error } = await supabase.storage.from('documents').download(filePath);
            if (error) throw error;

            const url = window.URL.createObjectURL(data);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error downloading file:', error);
            alert('Could not download file.');
        }
    };

    const handlePreview = async (filePath: string, fileName: string) => {
        setPreviewLoading(filePath);
        try {
            const { data, error } = await supabase.storage.from('documents').createSignedUrl(filePath, 3600);
            if (error) throw error;

            const fileExtension = fileName.split('.').pop()?.toLowerCase();
            const mimeType = fileExtension === 'pdf' ? 'application/pdf' :
                ['png', 'jpg', 'jpeg', 'webp'].includes(fileExtension || '') ? `image/${fileExtension === 'jpg' ? 'jpeg' : fileExtension}` :
                    'application/octet-stream';

            setPreviewUrl(data.signedUrl);
            setPreviewFileName(fileName);
            setPreviewFilePath(filePath);
            setPreviewType(mimeType);
            console.log('Preview URL set:', data.signedUrl);
        } catch (error) {
            console.error('Error previewing file:', error);
            alert('Could not preview file.');
        } finally {
            setPreviewLoading(null);
        }
    };

    const closePreview = () => {
        setPreviewUrl(null);
        setPreviewFileName(null);
        setPreviewFilePath(null);
        setPreviewType(null);
        setPreviewJournal(null);
    };

    // Removal of old simple loading state return
    if (error) return (
        <div className="view-container">
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '1.5rem 2rem', color: '#f87171' }}>
                <strong>Supabase Error:</strong> {error}
                <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>This is usually an RLS policy issue. Run the coordinator RLS SQL in Supabase and refresh.</p>
            </div>
        </div>
    );

    return (
        <div className="view-container fade-in">
            <div className="view-header" style={{ flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h2 className="view-title">Pending Approvals</h2>
                    <p className="view-subtitle">Review student requirement submissions</p>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '1.5rem', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem' }}>
                {(['documents', 'journals', 'dtr'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                            background: 'none',
                            border: 'none',
                            padding: '0.5rem 0',
                            fontSize: '0.95rem',
                            fontWeight: activeTab === tab ? 600 : 500,
                            color: activeTab === tab ? 'var(--primary)' : 'var(--text-muted)',
                            borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
                            cursor: 'pointer',
                            textTransform: 'capitalize',
                            transition: 'all 0.2s',
                        }}
                    >
                        {tab === 'dtr' ? 'DTR (Timesheets)' : tab}
                    </button>
                ))}
            </div>

            {activeTab === 'documents' && (
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Student</th>
                                <th>Requirement</th>
                                <th>File Name</th>
                                <th>Submitted Date</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <TableSkeleton rows={5} cols={5} />
                            ) : documents.length > 0 ? (
                                documents.map(doc => (
                                    <tr
                                        key={doc.id}
                                        onClick={() => handlePreview(doc.file_path, doc.file_name)}
                                        style={{ cursor: 'pointer', transition: 'background 0.2s' }}
                                        className="hover-row"
                                        title="Click to preview document"
                                    >
                                        <td style={{ fontWeight: '500', color: 'var(--text-bright)' }}>
                                            {doc.profiles?.first_name} {doc.profiles?.last_name}
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
                                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="var(--primary)" />
                                                    <polyline points="14 2 14 8 20 8" stroke="var(--primary)" />
                                                </svg>
                                                {doc.title}
                                            </div>
                                        </td>
                                        <td>
                                            <button
                                                className="btn btn-secondary"
                                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', background: 'transparent', border: '1px solid var(--border)' }}
                                                onClick={(e) => { e.stopPropagation(); handlePreview(doc.file_path, doc.file_name); }}
                                                title="Preview File"
                                                disabled={previewLoading === doc.file_path}
                                            >
                                                {previewLoading === doc.file_path ? (
                                                    <span className="preview-spinner" style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(124, 58, 237, 0.3)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'cd-spin 0.7s linear infinite', marginRight: '4px' }}></span>
                                                ) : (
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
                                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="var(--primary)" />
                                                        <circle cx="12" cy="12" r="3" stroke="var(--primary)" />
                                                    </svg>
                                                )}
                                                {doc.file_name}
                                            </button>
                                        </td>
                                        <td>{new Date(doc.created_at).toLocaleDateString()}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button
                                                    className="btn btn-primary"
                                                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', minHeight: 'auto', background: '#10b981', borderColor: '#10b981', color: '#fff' }}
                                                    onClick={(e) => { e.stopPropagation(); handleAction(doc.id, 'approved'); }}
                                                    disabled={actionLoading === doc.id}
                                                >
                                                    {actionLoading === doc.id ? '...' : (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                                            Approve
                                                        </div>
                                                    )}
                                                </button>
                                                <button
                                                    className="btn btn-secondary"
                                                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', minHeight: 'auto', color: '#ef4444', borderColor: '#ef4444' }}
                                                    onClick={(e) => { e.stopPropagation(); handleAction(doc.id, 'rejected'); }}
                                                    disabled={actionLoading === doc.id}
                                                >
                                                    {actionLoading === doc.id ? '...' : (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                                            Reject
                                                        </div>
                                                    )}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={5} style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}>
                                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke="#10b981" />
                                                <polyline points="22 4 12 14.01 9 11.01" stroke="#10b981" />
                                            </svg>
                                            <div>
                                                <p style={{ fontWeight: '500', color: 'var(--text-bright)' }}>All Caught Up!</p>
                                                <p style={{ fontSize: '0.9rem' }}>There are no pending documents to review right now.</p>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'journals' && (
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Student</th>
                                <th>Date</th>
                                <th>Tasks/Learnings</th>
                                <th style={{ width: '200px' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <TableSkeleton rows={5} cols={4} />
                            ) : journals.length > 0 ? (
                                journals.map(j => (
                                    <tr
                                        key={j.id}
                                        className="hover-row"
                                        onClick={() => setPreviewJournal(j)}
                                        style={{ cursor: 'pointer', transition: 'background 0.2s' }}
                                        title="Click to view full journal entry"
                                    >
                                        <td style={{ fontWeight: '500', color: 'var(--text-bright)' }}>
                                            {j.profiles?.first_name} {j.profiles?.last_name}
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap' }}>{new Date(j.entry_date).toLocaleDateString()}</td>
                                        <td>
                                            <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}><strong>Tasks:</strong> <span style={{ color: 'var(--text-muted)' }}>{j.tasks}</span></div>
                                            <div style={{ fontSize: '0.85rem' }}><strong>Learnings:</strong> <span style={{ color: 'var(--text-muted)' }}>{j.learnings}</span></div>
                                            {j.photo_urls && j.photo_urls.length > 0 && (
                                                <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                                                    {j.photo_urls.map((url: string, i: number) => (
                                                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontSize: '0.8rem', textDecoration: 'none' }}>
                                                            [Photo {i + 1}]
                                                        </a>
                                                    ))}
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button className="btn btn-primary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', minHeight: 'auto', background: '#10b981', borderColor: '#10b981', color: '#fff' }} onClick={(e) => { e.stopPropagation(); handleAction(j.id, 'approved'); }} disabled={actionLoading === j.id}>
                                                    {actionLoading === j.id ? '...' : (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>Approve</div>
                                                    )}
                                                </button>
                                                <button className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', minHeight: 'auto', color: '#ef4444', borderColor: '#ef4444' }} onClick={(e) => { e.stopPropagation(); handleAction(j.id, 'rejected'); }} disabled={actionLoading === j.id}>
                                                    {actionLoading === j.id ? '...' : (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>Reject</div>
                                                    )}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={4} style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                                            <div>
                                                <p style={{ fontWeight: '500', color: 'var(--text-bright)' }}>All Caught Up!</p>
                                                <p style={{ fontSize: '0.9rem' }}>There are no pending journals to review right now.</p>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'dtr' && (
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Student</th>
                                <th>Clock In</th>
                                <th>Clock Out</th>
                                <th>Time Worked</th>
                                <th style={{ width: '200px' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <TableSkeleton rows={5} cols={5} />
                            ) : timesheets.length > 0 ? (
                                timesheets.map(t => {
                                    const tsStart = new Date(t.clock_in);
                                    const tsEnd = t.clock_out ? new Date(t.clock_out) : null;
                                    let hrsHrsStr = '-';
                                    if (tsStart && tsEnd) {
                                        const hrs = (tsEnd.getTime() - tsStart.getTime()) / (1000 * 3600);
                                        hrsHrsStr = hrs > 0 ? hrs.toFixed(1) + ' hrs' : '-';
                                    }

                                    return (
                                        <tr key={t.id} className="hover-row">
                                            <td style={{ fontWeight: '500', color: 'var(--text-bright)' }}>
                                                {t.profiles?.first_name} {t.profiles?.last_name}
                                            </td>
                                            <td style={{ whiteSpace: 'nowrap' }}>{tsStart.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</td>
                                            <td style={{ whiteSpace: 'nowrap' }}>{tsEnd ? tsEnd.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'N/A'}</td>
                                            <td style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{hrsHrsStr}</td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button className="btn btn-primary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', minHeight: 'auto', background: '#10b981', borderColor: '#10b981', color: '#fff' }} onClick={(e) => { e.stopPropagation(); handleAction(t.id, 'approved'); }} disabled={actionLoading === t.id}>
                                                        {actionLoading === t.id ? '...' : (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>Approve</div>
                                                        )}
                                                    </button>
                                                    <button className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', minHeight: 'auto', color: '#ef4444', borderColor: '#ef4444' }} onClick={(e) => { e.stopPropagation(); handleAction(t.id, 'rejected'); }} disabled={actionLoading === t.id}>
                                                        {actionLoading === t.id ? '...' : (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>Reject</div>
                                                        )}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={5} style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                                            <div>
                                                <p style={{ fontWeight: '500', color: 'var(--text-bright)' }}>All Caught Up!</p>
                                                <p style={{ fontSize: '0.9rem' }}>There are no pending timesheets to review right now.</p>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Document Preview Modal */}
            {previewUrl && (
                <div className="preview-modal-overlay" onClick={closePreview}>
                    <div className="preview-modal-content" onClick={e => e.stopPropagation()}>
                        <div className="preview-modal-header">
                            <h3 className="preview-modal-title">{previewFileName}</h3>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="btn btn-secondary" style={{ padding: '0.4rem' }} onClick={() => previewFilePath && previewFileName && handleDownload(previewFilePath, previewFileName)}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                                </button>
                                <button className="btn btn-secondary" style={{ padding: '0.4rem', color: '#ef4444' }} onClick={closePreview}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                </button>
                            </div>
                        </div>
                        <div className="preview-modal-body">
                            {previewType?.startsWith('image/') ? (
                                <img src={previewUrl} alt={previewFileName || 'Preview'} className="preview-image" />
                            ) : previewType === 'application/pdf' ? (
                                <iframe src={`${previewUrl}#toolbar=0`} className="preview-pdf" title="PDF Preview" />
                            ) : (
                                <div className="preview-unsupported">
                                    <p>Preview not available for this file type.</p>
                                    <button className="btn btn-primary" onClick={() => previewFilePath && previewFileName && handleDownload(previewFilePath, previewFileName)}>Download to View</button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Journal Preview Modal */}
            {previewJournal && (
                <div className="preview-modal-overlay" onClick={closePreview}>
                    <div className="preview-modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', height: 'auto', maxHeight: '90vh' }}>
                        <div className="preview-modal-header">
                            <h3 className="preview-modal-title">
                                Journal Entry - {previewJournal.profiles?.first_name} {previewJournal.profiles?.last_name}
                            </h3>
                            <button className="btn btn-secondary" style={{ padding: '0.4rem', color: '#ef4444' }} onClick={closePreview}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                        </div>
                        <div className="preview-modal-body" style={{ padding: '1.5rem', overflowY: 'auto', display: 'block' }}>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Date</div>
                                <div style={{ color: 'var(--text-bright)', fontSize: '1.05rem' }}>{new Date(previewJournal.entry_date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Tasks Completed</div>
                                <div style={{ background: 'var(--bg-elevated)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                    {previewJournal.tasks}
                                </div>
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Learnings</div>
                                <div style={{ background: 'var(--bg-elevated)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border)', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                    {previewJournal.learnings}
                                </div>
                            </div>

                            {previewJournal.photo_urls && previewJournal.photo_urls.length > 0 && (
                                <div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Attached Photos</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.75rem' }}>
                                        {previewJournal.photo_urls.map((url: string, i: number) => (
                                            <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', aspectRatio: '1/1' }}>
                                                <img src={url} alt={`Journal attach ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div style={{ padding: '1.25rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '1rem', justifyContent: 'flex-end', background: 'var(--bg-card)' }}>
                            <button
                                className="btn btn-secondary"
                                style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                                onClick={() => {
                                    handleAction(previewJournal.id, 'rejected');
                                    closePreview();
                                }}
                                disabled={actionLoading === previewJournal.id}
                            >
                                Reject Summary
                            </button>
                            <button
                                className="btn btn-primary"
                                style={{ background: '#10b981', borderColor: '#10b981', color: 'white' }}
                                onClick={() => {
                                    handleAction(previewJournal.id, 'approved');
                                    closePreview();
                                }}
                                disabled={actionLoading === previewJournal.id}
                            >
                                Approve Summary
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ApprovalsView;
