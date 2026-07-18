import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default Leaflet icon paths in React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface LocationMapModalProps {
    isOpen: boolean;
    onClose: () => void;
    alert: any; // The selected audit log object
}

const LocationMapModal: React.FC<LocationMapModalProps> = ({ isOpen, onClose, alert }) => {
    // Prevent background scrolling when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    if (!isOpen || !alert) return null;

    const lat = alert.latitude;
    const lng = alert.longitude;

    if (!lat || !lng) {
        return (
            <div 
                onClick={onClose}
                style={{
                    position: 'fixed', inset: 0, zIndex: 10000,
                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
            >
                <div 
                    className="glass-card"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        border: '1px solid var(--border-color)',
                        borderRadius: 20, padding: '24px', width: '90%', maxWidth: '420px',
                        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
                        animation: 'fadeIn 0.2s ease',
                        textAlign: 'center'
                    }}
                >
                    <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Location Data Unavailable</h3>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>No GPS coordinates were recorded for this event.</p>
                    <button 
                        onClick={onClose}
                        style={{ padding: '0.75rem 2rem', borderRadius: 12, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                    >
                        Close
                    </button>
                </div>
            </div>
        );
    }

    const eventName = alert.details?.event || alert.action || '';
    const reason = alert.details?.reason || 'Unknown Reason';
    const studentName = alert.profile_first_name 
        ? `${alert.profile_first_name} ${alert.profile_last_name}` 
        : (alert.details?.studentName || 'Unknown User');

    // Determine badge color
    let badgeColor = '#ef4444'; // Red
    let badgeBg = 'rgba(239, 68, 68, 0.1)';
    if (alert.action === 'successful_clock_in' || alert.action === 'successful_clock_out') {
        badgeColor = '#10b981'; // Green
        badgeBg = 'rgba(16, 185, 129, 0.1)';
    } else if (eventName?.toLowerCase().includes('warning')) {
        badgeColor = '#f59e0b'; // Orange
        badgeBg = 'rgba(245, 158, 11, 0.1)';
    }

    const userAgent = alert.details?.userAgent || '';
    let browserName = 'Unknown';
    let deviceType = 'Desktop';
    if (userAgent) {
        const ua = userAgent.toLowerCase();
        if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
            deviceType = 'Mobile';
        } else if (ua.includes('tablet') || ua.includes('ipad')) {
            deviceType = 'Tablet';
        }
        
        if (ua.includes('edg/') || ua.includes('edga/') || ua.includes('edgios/')) browserName = 'Edge';
        else if (ua.includes('opr/') || ua.includes('opera')) browserName = 'Opera';
        else if (ua.includes('chrome') || ua.includes('crios')) browserName = 'Chrome';
        else if (ua.includes('firefox') || ua.includes('fxios')) browserName = 'Firefox';
        else if (ua.includes('safari') && !ua.includes('chrome')) browserName = 'Safari';
    }

    const ipAddress = alert.ip_address || alert.details?.ip || 'Unknown';
    const timestamp = new Date(alert.created_at).toLocaleString();

    let detectionMethod = 'N/A';
    if (alert.accuracy) {
        if (alert.accuracy <= 150) detectionMethod = 'GPS (High Precision)';
        else detectionMethod = 'Network/Cellular (Low Precision)';
    }

    return (
        <div 
            onClick={onClose} 
            style={{
                position: 'fixed', inset: 0, zIndex: 10000,
                background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
        >
            <div 
                className="glass-card"
                onClick={(e) => e.stopPropagation()}
                style={{ 
                    border: '1px solid var(--border-color)',
                    borderRadius: 20, padding: '24px', width: '90%', maxWidth: '800px',
                    boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
                    animation: 'fadeIn 0.2s ease',
                    display: 'flex', flexDirection: 'column',
                    maxHeight: '90vh', overflowY: 'auto'
                }}
            >
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                    <div>
                        <h2 style={{ margin: '0 0 8px 0', fontSize: '1.4rem' }}>Attempt Location</h2>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                            <strong>{studentName}</strong> • {new Date(alert.created_at).toLocaleString()}
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem', padding: '4px' }}
                    >
                        ✕
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                    <div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Event</div>
                        <span style={{ 
                            display: 'inline-flex', padding: '4px 10px', borderRadius: '20px', 
                            fontSize: '0.85rem', fontWeight: 500, backgroundColor: badgeBg, color: badgeColor, whiteSpace: 'nowrap'
                        }}>{eventName}</span>
                    </div>
                    {alert.action === 'anti_cheat_flag' && (
                        <div style={{ gridColumn: 'span 2' }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Reason</div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 500 }}>{reason}</div>
                        </div>
                    )}
                    <div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Timestamp</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 500 }}>{timestamp}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Distance</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 500 }}>
                            {alert.distance_from_geofence !== undefined && alert.distance_from_geofence !== null ? `${(alert.distance_from_geofence / 1000).toFixed(2)} km` : 'N/A'}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Accuracy</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 500 }}>
                            {alert.accuracy ? `±${Math.round(alert.accuracy)} m` : 'N/A'}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Detection Method</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 500 }}>{detectionMethod}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Browser</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 500 }}>{browserName}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Device</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 500 }}>{deviceType}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>IP Address</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 500 }}>{ipAddress}</div>
                    </div>
                </div>

                <div style={{ height: '400px', width: '100%', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px', border: '1px solid var(--border-color)' }}>
                    <MapContainer center={[lat, lng]} zoom={17} style={{ height: '100%', width: '100%' }}>
                        <TileLayer
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        />
                        <Marker position={[lat, lng]}>
                            <Popup>
                                {studentName}'s location <br/>
                                {alert.accuracy ? `Accuracy: ±${Math.round(alert.accuracy)} m` : ''}
                            </Popup>
                        </Marker>
                    </MapContainer>
                </div>

                {alert.location_address && (
                    <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: 'var(--bg-panel)', borderRadius: '8px' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Approximate Address</div>
                        <div style={{ fontSize: '0.95rem' }}>{alert.location_address}</div>
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button 
                        onClick={onClose}
                        style={{ padding: '0.6rem 1.5rem', borderRadius: 12, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600 }}
                    >
                        Close
                    </button>
                    {alert.map_url && (
                        <a href={alert.map_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                            <button style={{ padding: '0.6rem 1.5rem', borderRadius: 12, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                Open in Google Maps
                            </button>
                        </a>
                    )}
                </div>

            </div>
        </div>
    );
};

export default LocationMapModal;
