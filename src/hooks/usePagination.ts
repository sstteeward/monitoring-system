import { useState, useEffect } from 'react';

export function usePagination<T>(items: T[], itemsPerPage: number = 10) {
    const [currentPage, setCurrentPage] = useState(1);

    const totalPages = Math.max(1, Math.ceil(items.length / itemsPerPage));

    // Reset to last valid page if items are removed
    useEffect(() => {
        if (currentPage > totalPages && totalPages > 0) {
            setCurrentPage(totalPages);
        }
    }, [items.length, totalPages, currentPage]);

    // Reset to page 1 if the filter changes significantly (optional, but standard)
    // Actually, letting the caller handle explicit page resets is usually better,
    // but the above useEffect handles out of bounds.

    const paginatedItems = items.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    return {
        currentPage,
        setCurrentPage,
        totalPages,
        paginatedItems,
        totalItems: items.length,
        itemsPerPage
    };
}
