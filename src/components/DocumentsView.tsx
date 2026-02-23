import React, { useState, useEffect, useRef } from 'react';
import { documentService, type StudentDocument } from '../services/documentService';
import { CardGridSkeleton } from './Skeletons';
import './DocumentsView.css';

const DocumentsView: React.FC = () => {
    const [documents, setDocuments] = useState<StudentDocument[]>([]);
    const [title, setTitle] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
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
            if (fileInputRef.current) fileInputRef.current.value = '';
            loadDocuments();
        } catch (err) {
            console.error('Upload failed:', err);
            setMessage({ type: 'error', text: 'Failed to upload document. Please try again.' });
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (id: string, filePath: string) => {
        if (!window.confirm('Are you sure you want to delete this document?')) return;

        try {
            await documentService.deleteDocument(id, filePath);
            loadDocuments();
        } catch (err) {
            console.error('Delete failed:', err);
            alert('Failed to delete document.');
        }
    };

    const handleDownload = async (filePath: string) => {
        try {
            const url = await documentService.getDownloadUrl(filePath);
            window.open(url, '_blank');
        } catch (err) {
            console.error('Download failed:', err);
            alert('Failed to get download link.');
        }
    };

    return (
        <div className="documents-container">
            <header className="view-header">
                <h2 className="view-title">Documents</h2>
                <p className="view-subtitle">Upload and manage your OJT requirements and certifications.</p>
            </header>

            <div className="documents-list-section">
                <h3 className="section-title">My Documents</h3>
                {loading ? (
                    <CardGridSkeleton cards={3} height={120} />
                ) : documents.length > 0 ? (
                    <div className="documents-grid">
                        {documents.map((doc) => (
                            <div key={doc.id} className="document-item-card">
                                <div className="document-icon">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                                </div>
                                <div className="document-info">
                                    <h4 className="document-item-title">{doc.title}</h4>
                                    <p className="document-filename">{doc.file_name}</p>
                                    <div className="document-meta">
                                        <span className={`status-badge ${doc.status}`}>{doc.status}</span>
                                        <span className="dot">•</span>
                                        <span className="doc-date">{new Date(doc.created_at).toLocaleDateString()}</span>
                                    </div>
                                </div>
                                <div className="document-actions">
                                    <button className="action-btn" onClick={() => handleDownload(doc.file_path)} title="Download">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                    </button>
                                    <button className="action-btn delete" onClick={() => handleDelete(doc.id, doc.file_path)} title="Delete">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="empty-state">No documents uploaded yet.</div>
                )}
            </div>

            <div className="upload-card">
                <h3 className="section-title">Upload New Document</h3>
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
        </div>
    );
};

export default DocumentsView;
