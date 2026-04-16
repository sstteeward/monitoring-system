import React, { useState, useEffect, useRef } from 'react';
import { documentService, type StudentDocument } from '../services/documentService';
import { supabase } from '../lib/supabaseClient';
import { CardGridSkeleton } from './Skeletons';
import './DocumentsView.css';

const DocumentsView: React.FC = () => {
    const [documents, setDocuments] = useState<StudentDocument[]>([]);
    const [title, setTitle] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewType, setPreviewType] = useState<string | null>(null);
    const [previewFileName, setPreviewFileName] = useState<string | null>(null);
    const [previewFilePath, setPreviewFilePath] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState<string | null>(null);
    const [documentToDelete, setDocumentToDelete] = useState<{ id: string, path: string, name: string } | null>(null);
    const [showUploadForm, setShowUploadForm] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadDocuments();
    }, []);

    const loadDocuments = async () => {
        try {
            setLoading(true);
            const data = await documentService.getDocuments();
            setDocuments(data);
        } catch (err) {
            console.error('Error loading documents:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file || !title.trim()) {
            setMessage({ type: 'error', text: 'Please provide both a title and a file.' });
            return;
        }

        setUploading(true);
        setMessage(null);

        try {
            await documentService.uploadDocument(file, title);
            setMessage({ type: 'success', text: 'Document uploaded successfully!' });
            setTitle('');
            setFile(null);
            setShowUploadForm(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            loadDocuments();
        } catch (err) {
            console.error('Upload failed:', err);
            setMessage({ type: 'error', text: 'Failed to upload document. Please try again.' });
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async () => {
        if (!documentToDelete) return;

        try {
            await documentService.deleteDocument(documentToDelete.id, documentToDelete.path);
            setDocumentToDelete(null);
            loadDocuments();
        } catch (err) {
            console.error('Delete failed:', err);
            alert('Failed to delete document.');
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

    return (
        <div className="documents-container">
            <header className="view-header">
                <h2 className="view-title">Documents</h2>
                <p className="view-subtitle">Upload and manage your OJT requirements and certifications.</p>
            </header>

            <div className="documents-list-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 className="section-title" style={{ margin: 0 }}>My Documents</h3>
                    {!showUploadForm && (
                        <button className="btn btn-primary" onClick={() => setShowUploadForm(true)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '0.5rem'}}><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            Add Document
                        </button>
                    )}
                </div>
                
                {loading ? (
                    <CardGridSkeleton cards={3} height={120} />
                ) : documents.length > 0 ? (
                    <div className="documents-grid">
                        {documents.map((doc) => (
                            <div
                                key={doc.id}
                                className="document-item-card glass-card"
                                onClick={() => handlePreview(doc.file_path, doc.file_name)}
                                style={{ cursor: 'pointer', position: 'relative' }}
                                title="Click to preview"
                            >
                                <div className="document-icon">
                                    {previewLoading === doc.file_path ? (
                                        <span className="preview-spinner" style={{ display: 'inline-block', width: '24px', height: '24px', border: '3px solid rgba(16, 185, 129, 0.2)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'cd-spin 0.7s linear infinite' }}></span>
                                    ) : (
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                                    )}
                                </div>
                                <div className="document-info">
                                    <div className="document-item-title">{doc.title}</div>
                                    <div className="document-filename">{doc.file_name}</div>
                                    <div className="document-meta">
                                        <span className={`status-badge ${doc.status}`}>{doc.status}</span>
                                        <span className="dot">•</span>
                                        <span className="doc-date">{new Date(doc.created_at).toLocaleDateString()}</span>
                                    </div>
                                </div>
                                <div className="document-actions">
                                    <button
                                        className="action-btn delete"
                                        onClick={(e) => { e.stopPropagation(); setDocumentToDelete({ id: doc.id, path: doc.file_path, name: doc.file_name }); }}
                                        title="Delete Document"
                                    >
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ff4d4d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                                            <polyline points="3 6 5 6 21 6" stroke="#ff4d4d" />
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="#ff4d4d" />
                                            <line x1="10" y1="11" x2="10" y2="17" stroke="#ff4d4d" />
                                            <line x1="14" y1="11" x2="14" y2="17" stroke="#ff4d4d" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="empty-state">No documents uploaded yet.</div>
                )}
            </div>

            {showUploadForm && (
                <div className="upload-card glass-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h3 className="section-title" style={{ margin: 0 }}>Upload New Document</h3>
                        <button className="btn btn-secondary" onClick={() => setShowUploadForm(false)} style={{ padding: '0.4rem' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                    </div>
                    <form onSubmit={handleUpload} className="upload-form">
                        <div className="form-group">
                            <label>Document Title</label>
                            <input
                                type="text"
                                placeholder="e.g., Medical Certificate, Weekly Report 1..."
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="form-input"
                                disabled={uploading}
                            />
                        </div>
                        <div className="form-group">
                            <label>Select File</label>
                            <input
                                type="file"
                                onChange={handleFileChange}
                                ref={fileInputRef}
                                className="file-input"
                                disabled={uploading}
                            />
                            <p className="file-hint">Supports any file type (PDF, Images, DOCX, etc.)</p>
                        </div>
                        <div className="form-actions">
                            <button type="submit" className="btn btn-primary" disabled={uploading}>
                                {uploading ? 'Uploading...' : 'Upload Document'}
                            </button>
                            {message && <div className={`upload-message ${message.type}`}>{message.text}</div>}
                        </div>
                    </form>
                </div>
            )}

            {/* Preview Modal */}
            {previewUrl && (
                <div className="preview-modal-overlay" onClick={closePreview}>
                    <div className="preview-modal-content glass-card" onClick={e => e.stopPropagation()}>
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

            {/* Delete Confirmation Modal */}
            {documentToDelete && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div className="glass-card" style={{
                        border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: 20, padding: '2rem', width: '90%', maxWidth: 420,
                        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
                        animation: 'fadeIn 0.2s ease',
                    }}>
                        {/* Icon */}
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6" /><path d="M14 11v6" />
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                            </svg>
                        </div>
                        <h3 style={{ textAlign: 'center', color: 'var(--text-primary)', margin: '0 0 0.5rem', fontSize: '1.2rem', fontWeight: 600 }}>Delete Document?</h3>
                        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0 0 1rem' }}>
                            Are you sure you want to permanently delete
                        </p>
                        <p style={{ textAlign: 'center', fontWeight: 600, color: '#ef4444', fontSize: '1.05rem', margin: '0 0 1.5rem', background: 'rgba(239,68,68,0.08)', borderRadius: 10, padding: '0.75rem 1rem', wordBreak: 'break-all' }}>
                            "{documentToDelete.name}"
                        </p>
                        <p style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem', margin: '0 0 1.75rem' }}>
                            This action cannot be undone.
                        </p>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button
                                onClick={() => setDocumentToDelete(null)}
                                style={{ flex: 1, padding: '0.75rem', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem', fontFamily: 'inherit', transition: 'background 0.15s' }}
                                onMouseOver={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                                onMouseOut={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                style={{ flex: 1, padding: '0.75rem', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem', fontFamily: 'inherit', boxShadow: '0 4px 16px rgba(239,68,68,0.35)', transition: 'opacity 0.15s' }}
                                onMouseOver={e => e.currentTarget.style.opacity = '0.9'}
                                onMouseOut={e => e.currentTarget.style.opacity = '1'}
                            >
                                Yes, Delete It
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DocumentsView;
