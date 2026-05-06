import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from 'react-leaflet';
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
    geofenceRadius?: number;
}

interface PhotonResult {
    properties: {
        name: string;
        city?: string;
        country?: string;
        state?: string;
        street?: string;
    };
    geometry: {
        coordinates: [number, number];
    };
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

const LocationPickerMap: React.FC<LocationPickerMapProps> = ({ initialLat, initialLng, onLocationSelect, geofenceRadius = 100 }) => {
    const defaultCenter: [number, number] = [12.8797, 121.7740];
    const startingPos = (initialLat && initialLng) ? { lat: initialLat, lng: initialLng } : null;
    
    const [position, setPosition] = useState<L.LatLng | null>(startingPos as any);
    const [searchCenter, setSearchCenter] = useState<L.LatLng | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [suggestions, setSuggestions] = useState<PhotonResult[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>();

    useEffect(() => {
        if (initialLat && initialLng) {
            setPosition(L.latLng(initialLat, initialLng));
        } else {
            setPosition(null);
        }
    }, [initialLat, initialLng]);

    useEffect(() => {
        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
            }
        };
    }, []);

    // Photon geocoding API (free, no API key needed)
    const handleSearchChange = (query: string) => {
        setSearchQuery(query);
        
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
        
        if (!query.trim()) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        setIsSearching(true);
        searchTimeoutRef.current = setTimeout(() => {
            const fetchData = async () => {
                try {
                    const res = await fetch(
                        `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=8`
                    );
                    const data = await res.json();
                    setSuggestions(data.features || []);
                    setShowSuggestions((data.features || []).length > 0);
                } catch (err) {
                    console.error('Search failed:', err);
                    setSuggestions([]);
                } finally {
                    setIsSearching(false);
                }
            };
            fetchData();
        }, 300);
    };

    const selectSuggestion = (result: PhotonResult) => {
        const [lng, lat] = result.geometry.coordinates;
        const newPos = L.latLng(lat, lng);
        
        setPosition(newPos);
        setSearchCenter(newPos);
        onLocationSelect(lat, lng);

        // Format address for display
        const { name, city, state, country } = result.properties;
        const displayName = [name, city, state, country]
            .filter(Boolean)
            .join(', ');
        
        setSearchQuery(displayName);
        setShowSuggestions(false);
        setSuggestions([]);
    };

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim() || suggestions.length === 0) return;
        selectSuggestion(suggestions[0]);
    };

    return (
        <div style={{ height: '350px', width: '100%', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--admin-border)', position: 'relative', display: 'flex', flexDirection: 'column' }}>
            
            {/* Floating Search Bar */}
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
                    flexDirection: 'column'
                }}
            >
                <form onSubmit={handleSearch}>
                    <div
                        style={{ 
                            background: '#ffffff', 
                            borderRadius: '24px', 
                            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            border: '1px solid #e0e0e0',
                            transition: 'box-shadow 0.2s ease'
                        }}
                    >
                        <div style={{ padding: '0 0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5f6368' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        </div>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            onFocus={() => searchQuery && suggestions.length > 0 && setShowSuggestions(true)}
                            placeholder="Search location..."
                            style={{
                                flex: 1,
                                padding: '0.85rem 0.75rem',
                                border: 'none',
                                background: 'transparent',
                                color: '#202124',
                                fontSize: '0.95rem',
                                outline: 'none',
                                fontFamily: 'Inter, sans-serif'
                            }}
                        />
                        <button
                            type="submit"
                            disabled={isSearching || suggestions.length === 0}
                            style={{
                                padding: '0.5rem 0.8rem',
                                border: 'none',
                                background: 'transparent',
                                color: '#1a73e8',
                                cursor: (isSearching || suggestions.length === 0) ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity: (isSearching || suggestions.length === 0) ? 0.5 : 1,
                                transition: 'opacity 0.2s'
                            }}
                            title="Search Location"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                            </svg>
                        </button>
                    </div>
                </form>

                {/* Autocomplete Suggestions */}
                {showSuggestions && suggestions.length > 0 && (
                    <div style={{
                        marginTop: '4px',
                        background: '#ffffff',
                        borderRadius: '12px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        border: '1px solid #e0e0e0',
                        maxHeight: '300px',
                        overflowY: 'auto',
                        zIndex: 1001
                    }}>
                        {suggestions.map((result, idx) => (
                            <div
                                key={idx}
                                onClick={() => selectSuggestion(result)}
                                style={{
                                    padding: '0.75rem 1rem',
                                    borderBottom: idx < suggestions.length - 1 ? '1px solid #f0f0f0' : 'none',
                                    cursor: 'pointer',
                                    transition: 'background-color 0.15s',
                                    backgroundColor: idx === 0 ? '#f9f9f9' : 'transparent',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f0f0f0')}
                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = idx === 0 ? '#f9f9f9' : 'transparent')}
                            >
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5f6368" strokeWidth="2" style={{ marginTop: '2px', flexShrink: 0 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                                    <div style={{ flex: 1, overflow: 'hidden' }}>
                                        <div style={{ fontSize: '0.9rem', color: '#202124', fontWeight: 500, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                            {result.properties.name}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#80868b', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                            {[result.properties.street, result.properties.city, result.properties.state, result.properties.country]
                                                .filter(Boolean)
                                                .join(', ') || 'Location'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div style={{ flex: 1, width: '100%', position: 'relative', zIndex: 0 }}>
                <MapContainer 
                    center={startingPos || defaultCenter} 
                    zoom={startingPos ? 16 : 5} 
                    scrollWheelZoom={true} 
                    style={{ height: '100%', width: '100%', zIndex: 1 }}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {position && (
                        <>
                            <Circle 
                                center={position} 
                                radius={geofenceRadius} 
                                pathOptions={{ color: '#20c997', weight: 2, opacity: 0.3, fillOpacity: 0.1 }}
                            />
                            <Marker position={position} />
                        </>
                    )}
                    <LocationMarker position={position} setPosition={setPosition} onLocationSelect={onLocationSelect} />
                    <MapController center={searchCenter} />
                </MapContainer>
            </div>
            <div style={{ height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', background: 'var(--admin-bg)', borderTop: '1px solid var(--admin-border)', zIndex: 2 }}>
                Click anywhere on the map to set the exact company location.
            </div>
        </div>
    );
};

export default LocationPickerMap;
