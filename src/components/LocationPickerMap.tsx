import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet's default icon issue with bundlers
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface LocationPickerMapProps {
    initialLat?: number | null;
    initialLng?: number | null;
    onLocationSelect: (lat: number, lng: number) => void;
}

const LocationMarker = ({ position, setPosition, onLocationSelect }: any) => {
    const map = useMapEvents({
        click(e) {
            setPosition(e.latlng);
            onLocationSelect(e.latlng.lat, e.latlng.lng);
            map.flyTo(e.latlng, map.getZoom());
        },
    });

    return position === null ? null : (
        <Marker position={position}></Marker>
    );
};

const MapController = ({ center }: { center: L.LatLng | null }) => {
    const map = useMap();
    useEffect(() => {
        if (center) {
            map.flyTo(center, 16);
        }
    }, [center, map]);
    return null;
};

const LocationPickerMap: React.FC<LocationPickerMapProps> = ({ initialLat, initialLng, onLocationSelect }) => {
    // Default to Philippines if no initial coords
    const defaultCenter: [number, number] = [12.8797, 121.7740]; 
    
    const startingPos = (initialLat && initialLng) ? { lat: initialLat, lng: initialLng } : null;
    
    const [position, setPosition] = useState<L.LatLng | null>(startingPos as any);
    const [searchCenter, setSearchCenter] = useState<L.LatLng | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        if (initialLat && initialLng) {
            setPosition(L.latLng(initialLat, initialLng));
        } else {
            setPosition(null);
        }
    }, [initialLat, initialLng]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;
        
        setIsSearching(true);
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
            const data = await res.json();
            
            if (data && data.length > 0) {
                const result = data[0];
                const lat = parseFloat(result.lat);
                const lng = parseFloat(result.lon);
                const newPos = L.latLng(lat, lng);
                
                setPosition(newPos);
                setSearchCenter(newPos);
                onLocationSelect(lat, lng);
            } else {
                alert('Location not found. Try a different search query.');
            }
        } catch (err) {
            console.error('Search failed:', err);
            alert('Search failed. Please try again.');
        } finally {
            setIsSearching(false);
        }
    };

    return (
        <div style={{ height: '350px', width: '100%', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--admin-border)', position: 'relative', display: 'flex', flexDirection: 'column' }}>
            
            {/* Floating Search Bar like Google Maps */}
            {/* Floating Search Bar like Google Maps */}
            <div 
                style={{ 
                    position: 'absolute', 
                    top: '12px', 
                    left: '50%', 
                    transform: 'translateX(-50%)',
                    width: '90%',
                    maxWidth: '400px',
                    zIndex: 1000, 
                    display: 'flex', 
                    background: '#ffffff', 
                    borderRadius: '24px', 
                    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                    overflow: 'hidden',
                    alignItems: 'center'
                }}
            >
                <div style={{ padding: '0 0.5rem 0 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5f6368' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </div>
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSearch(e as any);
                        }
                    }}
                    placeholder="Search Google Maps..."
                    style={{
                        flex: 1,
                        padding: '0.8rem 0.5rem',
                        border: 'none',
                        background: 'transparent',
                        color: '#202124',
                        fontSize: '1rem',
                        outline: 'none',
                        fontFamily: 'Inter, sans-serif'
                    }}
                />
                <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        handleSearch(e as any);
                    }}
                    disabled={isSearching}
                    style={{
                        padding: '0 1rem',
                        border: 'none',
                        background: 'transparent',
                        color: '#1a73e8',
                        cursor: isSearching ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: isSearching ? 0.5 : 1
                    }}
                    title="Search Location"
                >
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#e8f0fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                        </svg>
                    </div>
                </button>
            </div>

            <div style={{ flex: 1, width: '100%', position: 'relative', zIndex: 0 }}>
                <MapContainer 
                    center={startingPos || defaultCenter} 
                    zoom={startingPos ? 16 : 5} 
                    scrollWheelZoom={true} 
                    style={{ height: '100%', width: '100%', zIndex: 1 }}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <LocationMarker position={position} setPosition={setPosition} onLocationSelect={onLocationSelect} />
                    <MapController center={searchCenter} />
                </MapContainer>
            </div>
            <div style={{ height: '35px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', background: 'var(--admin-bg)', borderTop: '1px solid var(--admin-border)', zIndex: 2 }}>
                Click anywhere on the map to set the exact company location.
            </div>
        </div>
    );
};

export default LocationPickerMap;
