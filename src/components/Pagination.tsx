import React from 'react';

interface PaginationProps {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    onPageChange: (page: number) => void;
    itemName?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    onPageChange,
    itemName = 'items'
}) => {
    if (totalPages <= 1) return null;

    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '1.5rem',
            padding: '1rem',
            background: 'var(--bg-elevated)',
            borderRadius: 12,
            border: '1px solid var(--border)'
        }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Showing {startItem} to {endItem} of {totalItems} {itemName}
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                    onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    style={{
                        padding: '0.4rem 0.8rem',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: currentPage === 1 ? 'var(--bg-secondary)' : 'var(--bg-elevated)',
                        color: currentPage === 1 ? 'var(--text-muted)' : 'var(--text-bright)',
                        cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                        fontSize: '0.85rem'
                    }}
                >
                    Previous
                </button>
                
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                        key={page}
                        onClick={() => onPageChange(page)}
                        style={{
                            padding: '0.4rem 0.8rem',
                            borderRadius: 8,
                            border: page === currentPage ? 'none' : '1px solid var(--border)',
                            background: page === currentPage ? 'var(--primary)' : 'var(--bg-elevated)',
                            color: page === currentPage ? '#fff' : 'var(--text-bright)',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: page === currentPage ? 600 : 400
                        }}
                    >
                        {page}
                    </button>
                ))}

                <button
                    onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    style={{
                        padding: '0.4rem 0.8rem',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: currentPage === totalPages ? 'var(--bg-secondary)' : 'var(--bg-elevated)',
                        color: currentPage === totalPages ? 'var(--text-muted)' : 'var(--text-bright)',
                        cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                        fontSize: '0.85rem'
                    }}
                >
                    Next
                </button>
            </div>
        </div>
    );
};
