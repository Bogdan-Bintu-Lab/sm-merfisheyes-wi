import { Layer } from './Layer';
import { store } from './store';

/**
 * Gene class for managing individual gene data and its layers
 */
export class Gene {
    /**
     * Create a new Gene
     * @param {string} name - Gene name
     * @param {THREE.Scene} scene - The THREE.js scene
     */
    constructor(name, scene) {
        this.name = name;
        this.scene = scene;
        this.layers = new Map();
        this.color = '#ffffff';
        this.scale = 1.0;
        this.isVisible = true;
        this.currentVisibleLayer = null;
    }
    
    /**
     * Load and process gene data
     * @param {Object} data - Gene data object with layers containing coordinates
     */
    async loadData(data) {
        // Process each layer in the data
        const dataLayers = data["layers"];
        Object.entries(dataLayers).forEach(([layer, coordinates]) => {
            // Convert flat array to point objects
            const points = [];
            for (let i = 0; i < coordinates.length; i += 2) {
                points.push({
                    x: coordinates[i],
                    y: coordinates[i + 1]
                });
            }
            this.addLayer(layer, points);
        });
        
        // Set initial color from store if available
        const geneColors = store.get('geneColors');
        if (geneColors && geneColors[this.name]) {
            this.setColor(geneColors[this.name]);
        }
        
        // Set initial scale from customizations if available
        const customizations = store.get('geneCustomizations');
        if (customizations && customizations[this.name]?.scale) {
            this.setScale(customizations[this.name].scale);
        }
    }
    
    /**
     * Add a new layer
     * @param {string} zStack - Z-stack identifier
     * @param {Array} points - Point data for the layer
     */
    addLayer(zStack, points) {
        const layer = new Layer(zStack, points, this.scene);
        this.layers.set(zStack, layer);
        
        // Apply current color and scale
        layer.updateColor(this.color);
        layer.updatePointSize(this.scale * store.get('pointSize'));
    }
    
    /**
     * Remove a layer
     * @param {string} zStack
     */
    removeLayer(zStack) {
        const layer = this.layers.get(zStack);
        if (layer) {
            layer.dispose();
            this.layers.delete(zStack);
            if (this.currentVisibleLayer === zStack) {
                this.currentVisibleLayer = null;
            }
        }
    }
    
    /**
     * Get a specific layer
     * @param {string} zStack
     * @returns {Layer|null}
     */
    getLayer(zStack) {
        return this.layers.get(zStack) || null;
    }
    
    /**
     * Set which layer should be visible
     * @param {string|null} layer - Z-stack identifier or null to hide all
     */
    setVisibleLayer(layer) {
        // Guard: If we're already showing this layer, do nothing
        if (this.currentVisibleLayer === layer) {
            console.log(`[Gene ${this.name}] setVisibleLayer(${layer}) - SKIPPED (already showing ${layer})`);
            return;
        }

        console.log(`[Gene ${this.name}] setVisibleLayer(${layer}) - current visible: ${this.currentVisibleLayer}, total layers: ${this.layers.size}`);

        // Hide current visible layer if exists
        if (this.currentVisibleLayer && this.layers.has(this.currentVisibleLayer)) {
            console.log(`[Gene ${this.name}] Hiding previous layer: ${this.currentVisibleLayer}`);
            this.layers.get(this.currentVisibleLayer).setVisible(false);
        }

        // Show new layer if specified and exists
        if (layer && this.layers.has(layer)) {
            console.log(`[Gene ${this.name}] Showing new layer: ${layer}, gene visible: ${this.isVisible}`);
            const newLayer = this.layers.get(layer);
            newLayer.setVisible(this.isVisible);
            this.currentVisibleLayer = layer;
        } else {
            console.log(`[Gene ${this.name}] No layer to show (layer=${layer}, exists=${this.layers.has(layer)})`);
            this.currentVisibleLayer = null;
        }
    }
    
    /**
     * Set gene visibility
     * @param {boolean} visible
     */
    setVisible(visible) {
        this.isVisible = visible;
        if (this.currentVisibleLayer) {
            this.layers.get(this.currentVisibleLayer).setVisible(visible);
        }
    }
    
    /**
     * Set gene color
     * @param {string} color - Hex color string
     */
    setColor(color) {
        this.color = color;
        this.layers.forEach(layer => layer.updateColor(color));
    }
    
    /**
     * Set gene scale
     * @param {number} scale
     */
    setScale(scale) {
        this.scale = scale;
        const globalSize = store.get('pointSize');
        console.log("Global size: " + globalSize);
        console.log("Scale: " + scale);
        console.log("Scale * globalSize: " + scale * globalSize);
        this.layers.forEach(layer => layer.updatePointSize(scale * globalSize));
    }
    
    /**
     * Update transforms for all layers
     * @param {boolean} flipX
     * @param {boolean} flipY
     * @param {boolean} swapXY
     */
    updateTransforms(flipX, flipY, swapXY) {
        this.layers.forEach(layer => layer.updateTransforms(flipX, flipY, swapXY));
    }
    
    /**
     * Get all layer keys
     * @returns {Array<string>}
     */
    getLayerKeys() {
        return Array.from(this.layers.keys());
    }
    
    /**
     * Get currently visible layer
     * @returns {string|null}
     */
    getCurrentVisibleLayer() {
        return this.currentVisibleLayer;
    }
    
    /**
     * Get total point count across all layers
     * @returns {number}
     */
    getPointCount() {
        let count = 0;
        this.layers.forEach(layer => {
            count += layer.getPointCount();
        });
        return count;
    }
    
    /**
     * Get bounds across all layers
     * @returns {{minX: number, maxX: number, minY: number, maxY: number}}
     */
    getBounds() {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        
        this.layers.forEach(layer => {
            const bounds = layer.getBounds();
            minX = Math.min(minX, bounds.minX);
            maxX = Math.max(maxX, bounds.maxX);
            minY = Math.min(minY, bounds.minY);
            maxY = Math.max(maxY, bounds.maxY);
        });
        
        return { minX, maxX, minY, maxY };
    }
    
    /**
     * Check if layer exists
     * @param {string} layer
     * @returns {boolean}
     */
    hasLayer(layer) {
        return this.layers.has(layer);
    }
    
    /**
     * Get number of layers
     * @returns {number}
     */
    getLayerCount() {
        return this.layers.size;
    }
    
    /**
     * Get gene name
     * @returns {string}
     */
    getName() {
        return this.name;
    }
    
    /**
     * Get adjacent layer keys
     * @param {string} currentLayer
     * @param {number} range
     * @returns {Array<string>}
     */
    getAdjacentLayers(currentLayer, range = 1) {
        const layerNum = parseInt(currentLayer);
        const adjacentLayers = [];
        for (let i = -range; i <= range; i++) {
            const targetLayer = (layerNum + i).toString();
            if (this.layers.has(targetLayer)) {
                adjacentLayers.push(targetLayer);
            }
        }
        return adjacentLayers;
    }
    
    /**
     * Clean up resources
     */
    dispose() {
        console.log(`[Gene ${this.name}] dispose() called - total layers: ${this.layers.size}`);
        let layerCount = 0;
        this.layers.forEach((layer, zStack) => {
            console.log(`[Gene ${this.name}] Disposing layer ${zStack}`);
            layer.dispose();
            layerCount++;
        });
        console.log(`[Gene ${this.name}] Disposed ${layerCount} layers, clearing map`);
        this.layers.clear();
        this.currentVisibleLayer = null;
        console.log(`[Gene ${this.name}] dispose() complete`);
    }
}
