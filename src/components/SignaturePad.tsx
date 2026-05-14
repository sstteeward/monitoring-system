import React, { useRef, useState, useEffect, useCallback } from 'react';

interface SignaturePadProps {
    onSave: (signatureDataUrl: string) => void;
    onCancel: () => void;
}

export function SignaturePad({ onSave, onCancel }: SignaturePadProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasDrawn, setHasDrawn] = useState(false);

    // Context needs to be stored to use it consistently
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

    /**
     * Synchronise the canvas pixel-buffer dimensions with its CSS layout size
     * so that 1 CSS-px === 1 canvas-px (at the current device pixel ratio).
     * Without this the drawing coordinates are offset from the pointer.
     */
    const syncCanvasSize = useCallback(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        // Set the internal pixel buffer to match the physical display pixels
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(200 * dpr);

        // Scale the CSS size to match the container exactly
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = '200px';

        const ctx = canvas.getContext('2d');
        if (ctx) {
            // Scale the context so drawing operations use CSS-pixel coordinates
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#000000';
            ctxRef.current = ctx;
        }
    }, []);

    useEffect(() => {
        // Small delay to let any modal/dialog animation finish before measuring
        const timer = setTimeout(() => syncCanvasSize(), 50);

        // Resize observer to handle layout changes (e.g. window resize, orientation change)
        const ro = new ResizeObserver(() => syncCanvasSize());
        if (containerRef.current) ro.observe(containerRef.current);

        return () => {
            clearTimeout(timer);
            ro.disconnect();
        };
    }, [syncCanvasSize]);

    const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return { offsetX: 0, offsetY: 0 };
        const rect = canvas.getBoundingClientRect();

        if ('touches' in e) {
            const touch = e.touches[0];
            if (!touch) return { offsetX: 0, offsetY: 0 };
            return {
                offsetX: touch.clientX - rect.left,
                offsetY: touch.clientY - rect.top,
            };
        } else {
            return {
                offsetX: e.clientX - rect.left,
                offsetY: e.clientY - rect.top,
            };
        }
    };

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        // Prevent page scroll / pull-to-refresh while drawing on touch devices
        if ('touches' in e) e.preventDefault();

        setIsDrawing(true);
        const { offsetX, offsetY } = getCoordinates(e);
        ctxRef.current?.beginPath();
        ctxRef.current?.moveTo(offsetX, offsetY);
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        // Prevent page scroll while drawing on touch devices
        if ('touches' in e) e.preventDefault();

        const { offsetX, offsetY } = getCoordinates(e);
        ctxRef.current?.lineTo(offsetX, offsetY);
        ctxRef.current?.stroke();
        setHasDrawn(true);
    };

    const stopDrawing = () => {
        setIsDrawing(false);
        ctxRef.current?.closePath();
    };

    const handleClear = () => {
        const canvas = canvasRef.current;
        if (!canvas || !ctxRef.current) return;
        // clearRect needs CSS-pixel dimensions (context is already scaled)
        const dpr = window.devicePixelRatio || 1;
        ctxRef.current.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
        setHasDrawn(false);
    };

    const handleSave = () => {
        if (!hasDrawn || !canvasRef.current) return;
        
        // We want to save the signature with a transparent background
        const dataUrl = canvasRef.current.toDataURL('image/png');
        onSave(dataUrl);
    };

    return (
        <div style={{
            background: 'var(--bg-elevated)',
            padding: '1.5rem',
            borderRadius: '16px',
            border: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            width: '100%',
            maxWidth: '500px',
            margin: '0 auto'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Draw Your Signature</h3>
                <button onClick={handleClear} disabled={!hasDrawn} style={{
                    background: 'transparent',
                    border: 'none',
                    color: hasDrawn ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontSize: '0.875rem',
                    cursor: hasDrawn ? 'pointer' : 'default',
                    textDecoration: 'underline'
                }}>
                    Clear
                </button>
            </div>

            <div ref={containerRef} style={{
                background: '#ffffff', // White background for the pad
                borderRadius: '8px',
                border: '2px dashed var(--border-strong)',
                overflow: 'hidden',
                cursor: 'crosshair',
                touchAction: 'none' // Prevent scrolling while drawing on mobile
            }}>
                <canvas
                    ref={canvasRef}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseOut={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    style={{ display: 'block' }}
                />
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <button onClick={onCancel} style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontWeight: 600
                }}>
                    Cancel
                </button>
                <button onClick={handleSave} disabled={!hasDrawn} style={{
                    flex: 1,
                    padding: '0.75rem',
                    background: hasDrawn ? 'var(--primary)' : 'var(--bg-muted)',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    cursor: hasDrawn ? 'pointer' : 'not-allowed',
                    fontWeight: 600,
                    opacity: hasDrawn ? 1 : 0.5
                }}>
                    Save Signature
                </button>
            </div>
        </div>
    );
}
