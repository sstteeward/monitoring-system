import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import UserClickableName from './UserClickableName';
import './AnnouncementsView.css';

interface GroupStudentsModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    filterType: 'company' | 'department';
    filterValue: string;
    currentUserId?: string;
}

const GroupStudentsModal: React.FC<GroupStudentsModalProps> = ({
    isOpen, onClose, title, filterType, filterValue, currentUserId
}) => {
    const [peers, setPeers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isOpen) return;
        [[]]
        const loadPeers = async () => {
            setLoading(true);
            try {
                const fetchColumn = filterType === 'company' ? 'company_id' : 'department';
                const { data, error } = await supabase
                    .from('profiles')
                    .select('id, first_name, last_name, avatar_url, account_type')
                    .eq(fetchColumn, filterValue)
                    .eq('account_type', 'student')
                    .order('first_name', { ascending: true });

                if (error) throw error;

                setPeers(data || []);
            } catch (err) {
                console.error('Error fetching peers:', err);
            } finally {
                setLoading(false);
            }
        };

        loadPeers();
    }, [isOpen, filterType, filterValue]);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="reactions-modal fade-in" onClick={e => e.stopPropagation()} style={{ width: '90%', maxWidth: 420 }}>
                <div className="modal-header" style={{ paddingBottom: '1rem', borderBottom: '1px solid var(--border)', marginBottom: '0.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-bright)' }}>
                        {title}
                    </h3>
                    <button className="close-btn" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                <div className="reactions-list custom-scrollbar" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
                    {loading ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
                    ) : peers.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No students assigned yet.</div>
                    ) : (
                        peers.map(peer => (
                            <div key={peer.id} className="reaction-user-item" style={{ padding: '0.85rem', display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border-light)' }}>
                                <div className="user-info" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%' }}>
                                    <div className="user-avatar" style={{
                                        width: 38, height: 38, borderRadius: '50%',
                                        backgroundImage: peer.avatar_url ? `url(${peer.avatar_url})` : 'none',
                                        backgroundColor: peer.avatar_url ? 'transparent' : 'rgba(59,130,246,0.15)',
                                        backgroundSize: 'cover',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: '#3b82f6', fontWeight: 600, fontSize: '0.9rem', flexShrink: 0
                                    }}>
                                        {!peer.avatar_url && (peer.first_name ? peer.first_name[0].toUpperCase() : '?')}
                                    </div>
                                    <span style={{ fontWeight: 600, color: 'var(--text-bright)', fontSize: '0.95rem' }}>
                                        <UserClickableName userId={peer.id} userName={`${peer.first_name || ''} ${peer.last_name || ''}`.trim() || 'Unnamed Student'} />
                                    </span>
                                    {currentUserId === peer.id && (
                                        <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: 12, background: 'rgba(59,130,246,0.15)', color: '#3b82f6', marginLeft: 'auto', fontWeight: 600 }}>
                                            You
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default GroupStudentsModal;
