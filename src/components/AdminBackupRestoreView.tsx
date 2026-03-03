import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { adminService } from '../services/adminService';

const AdminBackupRestoreView: React.FC = () => {
    const [exporting, setExporting] = useState(false);
    const [exportLog, setExportLog] = useState<string[]>([]);

    // In a real enterprise app, you'd use Supabase Management API for true pg_dump backups.
    // Here we implement a manual JSON export of critical tables as a starting point.
    const handleExport = async () => {
        if (!confirm('This will download a JSON backup of core system tables. Proceed?')) return;

        setExporting(true);
        setExportLog(['Starting export process...']);

        try {
            const backupData: Record<string, any> = {};
            const tablesToExport = ['profiles', 'companies', 'departments', 'system_settings', 'audit_logs'];

            for (const table of tablesToExport) {
                setExportLog(prev => [...prev, `Fetching data from ${table}...`]);
                const { data, error } = await supabase.from(table).select('*');

                if (error) {
                    setExportLog(prev => [...prev, `ERROR exporting ${table}: ${error.message}`]);
                    throw error;
                }

                backupData[table] = data;
                setExportLog(prev => [...prev, `Successfully exported ${data.length} rows from ${table}.`]);
            }

            // Generate JSON blob and trigger download
            const jsonString = JSON.stringify(backupData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `monitoring-system-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            setExportLog(prev => [...prev, 'Export complete! File downloaded.']);
            await adminService.logAction('system_backup', 'multiple', null, { tables: tablesToExport });

        } catch (error) {
            setExportLog(prev => [...prev, `Export failed. Check console for details.`]);
            console.error(error);
        } finally {
            setExporting(false);
        }
    };

    const handleRestoreClick = () => {
        alert("Restore functionality is disabled for safety. In production, restoring from a backup should be done directly via the Supabase database dashboard to maintain referential integrity.");
    };

    return (
        <div className="fade-in">
            <div className="admin-table-card">
                <div className="admin-table-header">
                    <div className="admin-table-title">Backup & Restore</div>
                    <div style={{ color: 'var(--admin-text-secondary)', fontSize: '0.875rem' }}>Manually export database state or trigger system snapshots.</div>
                </div>

                <div style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>

                    {/* Export Section */}
                    <div style={{ background: 'var(--admin-bg)', padding: '1.5rem', borderRadius: 12, border: '1px solid var(--admin-border)' }}>
                        <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem', color: 'var(--admin-text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            Manual JSON Export
                        </h3>
                        <p style={{ color: 'var(--admin-text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                            Download a JSON snapshot of the core database tables (Profiles, Companies, Departments, System Settings, Audit Logs). Does not include large files or timesheets.
                        </p>
                        <button className="primary" onClick={handleExport} disabled={exporting} style={{ width: '100%' }}>
                            {exporting ? 'Exporting...' : 'Generate JSON Backup'}
                        </button>
                    </div>

                    {/* Restore Section */}
                    <div style={{ background: 'rgba(244, 63, 94, 0.05)', padding: '1.5rem', borderRadius: 12, border: '1px solid rgba(244, 63, 94, 0.2)' }}>
                        <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem', color: '#f43f5e', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                            Restore from Backup
                        </h3>
                        <p style={{ color: '#fca5a5', fontSize: '0.85rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                            Restoring data from a JSON backup is a destructive operation that drops current data. It is highly recommended to perform this operation directly via Supabase CLI.
                        </p>
                        <button className="role-select" onClick={handleRestoreClick} style={{ width: '100%', borderColor: 'rgba(244, 63, 94, 0.5)', color: '#fca5a5' }}>
                            Upload Backup File
                        </button>
                    </div>
                </div>

                {/* Log Output */}
                {exportLog.length > 0 && (
                    <div style={{ margin: '0 1.5rem 1.5rem', padding: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: 8, border: '1px solid var(--admin-border)' }}>
                        <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: 'var(--admin-text-secondary)' }}>Export Process Log</h4>
                        <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#10b981', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            {exportLog.map((log, i) => (
                                <div key={i}>{log}</div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminBackupRestoreView;
