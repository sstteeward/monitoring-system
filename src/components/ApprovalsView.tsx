import React, { useEffect, useState } from 'react';
import { coordinatorService } from '../services/coordinatorService';
import { supabase } from '../lib/supabaseClient';
import { TableSkeleton } from './Skeletons';
import UserClickableName from './UserClickableName';
import { departmentRequestService, type DepartmentChangeRequest } from '../services/departmentRequestService';
import './CoordinatorDashboard.css';

interface ApprovalsViewProps {
    initialTab?: 'documents' | 'journals' | 'dtr' | 'dept_changes';
}

const ApprovalsView: React.FC<ApprovalsViewProps> = ({ initialTab = 'documents' }) => {
    const [activeTab, setActiveTab] = useState<'documents' | 'journals' | 'dtr' | 'dept_changes'>(initialTab);
    const [documents, setDocuments] = useState<any[]>([]);
    const [journals, setJournals] = useState<any[]>([]);
    const [timesheets, setTimesheets] = useState<any[]>([]);
    const [deptRequests, setDeptRequests] = useState<DepartmentChangeRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewType, setPreviewType] = useState<string | null>(null);
    const [previewFileName, setPreviewFileName] = useState<string | null>(null);
    const [previewJournal, setPreviewJournal] = useState<any | null>(null);
    const [departmentId, setDepartmentId] = useState<string | undefined>(undefined);
    const [isInitialLoad, setIsInitialLoad] = useState(true);

    // Remarks Modal State
    const [showRemarksModal, setShowRemarksModal] = useState(false);
    const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
    const [remarks, setRemarks] = useState('');
    const [pendingAction, setPendingAction] = useState<'approved' | 'rejected' | null>(null);

    useEffect(() => {
        const fetchDept = async () => {
            try {
                const dept = await coordinatorService.getMyDepartment();
                if (dept) setDepartmentId(dept.id);
            } catch (err) {
                console.error("Error fetching department:", err);
            } finally {
                setIsInitialLoad(false);
            }
        };
        fetchDept();
    }, []);

    useEffect(() => {
        if (isInitialLoad) return;
        if (activeTab === 'documents') loadPendingDocuments();
        else if (activeTab === 'journals') loadPendingJournals();
        else if (activeTab === 'dtr') loadPendingTimesheets();
        else if (activeTab === 'dept_changes') loadPendingDepartmentRequests();
    }, [activeTab, departmentId, isInitialLoad]);

    const loadPendingDocuments = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await coordinatorService.getPendingDocuments(departmentId);
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
            const data = await coordinatorService.getPendingJournals(departmentId);
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
            const data = await coordinatorService.getPendingTimesheets(departmentId);
            setTimesheets(data || []);
        } catch (err: any) {
            console.error("Failed to load timesheets:", err);
            setError(err?.message || JSON.stringify(err));
        } finally {
            setLoading(false);
        }
    };

    const loadPendingDepartmentRequests = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await departmentRequestService.getPendingRequests(departmentId);
            setDeptRequests(data || []);
        } catch (err: any) {
            console.error("Failed to load dept requests:", err);
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
            } else if (activeTab === 'dept_changes') {
                await departmentRequestService.actionRequest(id, status, remarks);
                setDeptRequests(prev => prev.filter(d => d.id !== id));
            }
        } catch (err) {
            console.error(`Failed to mark item as ${status}:`, err);
            alert(`Error: Could not mark item as ${status}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handlePreview = async (filePath: string, fileName: string) => {
        try {
            const { data, error } = await supabase.storage.from('documents').createSignedUrl(filePath, 3600);
            if (error) throw error;

            const fileExtension = fileName.split('.').pop()?.toLowerCase();
            const mimeType = fileExtension === 'pdf' ? 'application/pdf' :
                ['png', 'jpg', 'jpeg', 'webp'].includes(fileExtension || '') ? `image/${fileExtension === 'jpg' ? 'jpeg' : fileExtension}` :
                    'application/octet-stream';

            setPreviewUrl(data.signedUrl);
            setPreviewFileName(fileName);
            setPreviewType(mimeType);
        } catch (error) {
            console.error('Error previewing file:', error);
            alert('Could not preview file.');
        }
    };

    const closePreview = () => {
        setPreviewUrl(null);
        setPreviewFileName(null);
        setPreviewType(null);
        setPreviewJournal(null);
    };

    if (error) return (
        <div className="view-container">
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '1.5rem 2rem', color: '#f87171' }}>
                <strong>Error:</strong> {error}
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

            <div style={{ display: 'flex', gap: '1.5rem', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '2px' }}>
                {(['documents', 'journals', 'dtr', 'dept_changes'] as const).map(tab => (
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
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {tab === 'dtr' ? 'DTR (Timesheets)' : tab === 'journals' ? 'Daily Summary' : tab === 'dept_changes' ? 'Dept Changes' : tab}
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
                                    >
                                        <td style={{ fontWeight: '500', color: 'var(--text-primary)' }}>
                                            <UserClickableName 
                                                userId={doc.user_id} 
                                                userName={`${doc.profiles?.first_name} ${doc.profiles?.last_name}`} 
                                            />
                                        </td>
                                        <td>{doc.title}</td>
                                        <td>{doc.file_name}</td>
                                        <td>{new Date(doc.created_at).toLocaleDateString()}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button className="btn btn-approve" onClick={(e) => { e.stopPropagation(); handleAction(doc.id, 'approved'); }} disabled={actionLoading === doc.id}>Approve</button>
                                                <button className="btn btn-reject" onClick={(e) => { e.stopPropagation(); handleAction(doc.id, 'rejected'); }} disabled={actionLoading === doc.id}>Reject</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '3rem' }}>All caught up!</td></tr>
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
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <TableSkeleton rows={5} cols={4} />
                            ) : journals.length > 0 ? (
                                journals.map(j => (
                                    <tr key={j.id} className="hover-row" onClick={() => setPreviewJournal(j)}>
                                        <td>
                                            <UserClickableName 
                                                userId={j.user_id} 
                                                userName={`${j.profiles?.first_name} ${j.profiles?.last_name}`} 
                                            />
                                        </td>
                                        <td>{new Date(j.entry_date).toLocaleDateString()}</td>
                                        <td>{j.tasks?.substring(0, 50)}...</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button className="btn btn-approve" onClick={(e) => { e.stopPropagation(); handleAction(j.id, 'approved'); }} disabled={actionLoading === j.id}>Approve</button>
                                                <button className="btn btn-reject" onClick={(e) => { e.stopPropagation(); handleAction(j.id, 'rejected'); }} disabled={actionLoading === j.id}>Reject</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan={4} style={{ textAlign: 'center', padding: '3rem' }}>All caught up!</td></tr>
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
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <TableSkeleton rows={5} cols={4} />
                            ) : timesheets.length > 0 ? (
                                timesheets.map(t => (
                                    <tr key={t.id} className="hover-row">
                                        <td>
                                            <UserClickableName 
                                                userId={t.user_id} 
                                                userName={`${t.profiles?.first_name} ${t.profiles?.last_name}`} 
                                            />
                                        </td>
                                        <td>{new Date(t.clock_in).toLocaleString()}</td>
                                        <td>{t.clock_out ? new Date(t.clock_out).toLocaleString() : 'N/A'}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button className="btn btn-approve" onClick={(e) => { e.stopPropagation(); handleAction(t.id, 'approved'); }} disabled={actionLoading === t.id}>Approve</button>
                                                <button className="btn btn-reject" onClick={(e) => { e.stopPropagation(); handleAction(t.id, 'rejected'); }} disabled={actionLoading === t.id}>Reject</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan={4} style={{ textAlign: 'center', padding: '3rem' }}>All caught up!</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'dept_changes' && (
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Student</th>
                                <th>Transfer Flow</th>
                                <th>Request Date</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <TableSkeleton rows={3} cols={4} />
                            ) : deptRequests.length > 0 ? (
                                deptRequests.map(req => (
                                    <tr key={req.id} className="hover-row">
                                        <td>
                                            <UserClickableName 
                                                userId={req.user_id} 
                                                userName={`${req.profiles?.first_name} ${req.profiles?.last_name}`} 
                                            />
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{ color: 'var(--text-muted)', textDecoration: 'line-through' }}>{req.current_dept?.name}</span>
                                                <span>→</span>
                                                <span style={{ color: '#10b981', fontWeight: 600 }}>{req.requested_dept?.name}</span>
                                            </div>
                                        </td>
                                        <td>{new Date(req.created_at).toLocaleDateString()}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button className="btn btn-approve" onClick={() => { setSelectedRequestId(req.id); setPendingAction('approved'); setShowRemarksModal(true); setRemarks(''); }}>Approve</button>
                                                <button className="btn btn-reject" onClick={() => { setSelectedRequestId(req.id); setPendingAction('rejected'); setShowRemarksModal(true); setRemarks(''); }}>Reject</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan={4} style={{ textAlign: 'center', padding: '3rem' }}>No pending transfers.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modals */}
            {previewUrl && (
                <div className="preview-modal-overlay" onClick={closePreview}>
                    <div className="preview-modal-content" onClick={e => e.stopPropagation()}>
                        <div className="preview-modal-header">
                            <h3 className="preview-modal-title">{previewFileName}</h3>
                            <button className="btn btn-secondary" onClick={closePreview}>Close</button>
                        </div>
                        <div className="preview-modal-body">
                            {previewType?.startsWith('image/') ? <img src={previewUrl} alt="Preview" style={{ maxWidth: '100%' }} /> : <iframe src={previewUrl} style={{ width: '100%', height: '500px' }} />}
                        </div>
                    </div>
                </div>
            )}

            {previewJournal && (
                <div className="preview-modal-overlay" onClick={closePreview}>
                    <div className="preview-modal-content" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
                        <div className="preview-modal-header">
                            <h3>Journal Detail</h3>
                            <button className="btn btn-secondary" onClick={closePreview}>Close</button>
                        </div>
                        <div className="preview-modal-body" style={{ padding: '1.5rem' }}>
                            <p><strong>Tasks:</strong> {previewJournal.tasks}</p>
                            <p><strong>Learnings:</strong> {previewJournal.learnings}</p>
                        </div>
                        <div className="preview-modal-footer" style={{ padding: '1rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                            <button className="btn btn-reject" onClick={() => { handleAction(previewJournal.id, 'rejected'); closePreview(); }}>Reject</button>
                            <button className="btn btn-approve" onClick={() => { handleAction(previewJournal.id, 'approved'); closePreview(); }}>Approve</button>
                        </div>
                    </div>
                </div>
            )}

            {showRemarksModal && (
                <div className="preview-modal-overlay" style={{ zIndex: 1100 }}>
                    <div className="preview-modal-content" style={{ maxWidth: '400px' }}>
                        <div className="preview-modal-header">
                            <h3>{pendingAction === 'approved' ? 'Approve' : 'Reject'} Request</h3>
                        </div>
                        <div className="preview-modal-body" style={{ padding: '1.5rem' }}>
                            <textarea
                                value={remarks}
                                onChange={e => setRemarks(e.target.value)}
                                placeholder="Add remarks..."
                                style={{ width: '100%', minHeight: '100px', padding: '0.75rem', borderRadius: '8px' }}
                            />
                        </div>
                        <div style={{ padding: '1.25rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary" onClick={() => setShowRemarksModal(false)}>Cancel</button>
                            <button className={`btn ${pendingAction === 'approved' ? 'btn-approve' : 'btn-reject'}`} onClick={() => { if (selectedRequestId && pendingAction) handleAction(selectedRequestId, pendingAction); setShowRemarksModal(false); }}>Confirm</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ApprovalsView;
