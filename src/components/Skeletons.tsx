import React from 'react';

export const CardSkeleton: React.FC<{ height?: number | string }> = ({ height = 150 }) => (
    <div className="skeleton" style={{ height, borderRadius: '12px', width: '100%' }} />
);

export const CardGridSkeleton: React.FC<{ cards?: number, height?: number }> = ({ cards = 4, height = 150 }) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem', width: '100%' }}>
        {Array.from({ length: cards }).map((_, i) => (
            <CardSkeleton key={i} height={height} />
        ))}
    </div>
);

export const TableSkeleton: React.FC<{ rows?: number, cols?: number }> = ({ rows = 5, cols = 5 }) => (
    <div className="glass-card" style={{ borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '1rem' }}>
            {Array.from({ length: cols }).map((_, i) => (
                <div key={i} className="skeleton skeleton-text" style={{ flex: 1, margin: 0 }} />
            ))}
        </div>
        {Array.from({ length: rows }).map((_, ri) => (
            <div key={ri} style={{ padding: '1rem', display: 'flex', gap: '1rem', borderBottom: ri === rows - 1 ? 'none' : '1px solid var(--border)' }}>
                {Array.from({ length: cols }).map((_, ci) => (
                    <div key={ci} className="skeleton skeleton-text" style={{ flex: 1, margin: 0, opacity: 0.6 }} />
                ))}
            </div>
        ))}
    </div>
);

export const ListSkeleton: React.FC<{ items?: number }> = ({ items = 3 }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
        {Array.from({ length: items }).map((_, i) => (
            <div key={i} style={{ padding: '1.25rem', background: 'var(--bg-elevated)', borderRadius: '12px', display: 'flex', gap: '1rem' }}>
                <div className="skeleton skeleton-circle" style={{ width: 40, height: 40, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                    <div className="skeleton skeleton-title" style={{ width: '40%' }} />
                    <div className="skeleton skeleton-text" style={{ width: '80%', height: 8 }} />
                </div>
            </div>
        ))}
    </div>
);

export const FormSkeleton: React.FC = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="skeleton skeleton-text" style={{ width: '100px' }} />
            <div className="skeleton" style={{ height: '120px', borderRadius: '8px' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="skeleton skeleton-text" style={{ width: '150px' }} />
            <div className="skeleton" style={{ height: '120px', borderRadius: '8px' }} />
        </div>
        <div className="skeleton" style={{ width: '140px', height: '44px', borderRadius: '8px' }} />
    </div>
);
