/**
 * Updates camera and controls based on data bounds
 * @param {{minX: number, maxX: number, minY: number, maxY: number}} bounds
 */
export function updateDataBounds(bounds) {
    const center = {
        x: (bounds.minX + bounds.maxX) / 2,
        y: (bounds.minY + bounds.maxY) / 2
    };
    
    const size = {
        width: bounds.maxX - bounds.minX,
        height: bounds.maxY - bounds.minY
    };
    
    // Update store with center position
    store.set('center', center);
    
    // Emit bounds update event for camera adjustment
    const event = new CustomEvent('boundsUpdated', {
        detail: { center, size }
    });
    window.dispatchEvent(event);
}
