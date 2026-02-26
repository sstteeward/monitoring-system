import React, { useEffect, useState } from 'react';
import { coordinatorService } from '../services/coordinatorService';
import { supabase } from '../lib/supabaseClient';
import { TableSkeleton } from './Skeletons';
import './CoordinatorDashboard.css';

const ApprovalsView: React.FC = () => {
    const [documents, setDocuments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewType, setPreviewType] = useState<string | null>(null);
    const [previewFileName, setPreviewFileName] = useState<string | null>(null);
    const [previewFilePath, setPreviewFilePath] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState<string | null>(null);

    useEffect(() => {
        loadPendingDocuments();
    }, []);

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

    const handleAction = async (docId: string, status: 'approved' | 'rejected') => {
        setActionLoading(docId);
        try {
            await coordinatorService.updateDocumentStatus(docId, status);
            // Remove the processed document from the list
            setDocuments(prev => prev.filter(d => d.id !== docId));

            // Optional: You could notify the user via the `user_notifications` table here

        } catch (err) {
            console.error(`Failed to mark document as ${status}:`, err);
            alert(`Error: Could not mark document as ${status}`);
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
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
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
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
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
                                                {actionLoading === doc.id ? '...' : 'Approve'}
                                            </button>
                                            <button
                                                className="btn btn-secondary"
                                                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', minHeight: 'auto', color: '#ef4444', borderColor: '#ef4444' }}
                                                onClick={(e) => { e.stopPropagation(); handleAction(doc.id, 'rejected'); }}
                                                disabled={actionLoading === doc.id}
                                            >
                                                {actionLoading === doc.id ? '...' : 'Reject'}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={5} style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#10b981', opacity: 0.5 }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
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

            {/* Preview Modal */}
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
        </div>
    );
};

export default ApprovalsView;
