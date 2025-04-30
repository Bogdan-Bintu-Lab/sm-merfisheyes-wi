/**
 * CellBoundaries module for loading and managing cell boundary data
 * Redesigned to better handle multiple z-stack layers
 */

import * as THREE from 'three';
import { store } from './store.js';
import { config } from './config.js';
import palette from './data/pei/palette.json' assert { type: 'json' };
import clusterList from './data/pei/cluster_list.json' assert { type: 'json' };
import { ungzip } from 'pako';

/**
 * BoundaryLayer class represents a single z-stack layer of cell boundaries
 */
class BoundaryLayer {
    /**
     * Create a new boundary layer
     * @param {string} zstack - Z-stack identifier
     * @param {THREE.Scene} scene - Three.js scene to add the layer to
     */
    constructor(zstack, scene) {
        this.zstack = zstack;
        this.scene = scene;
        this.group = new THREE.Group();
        this.loaded = false;
        this.loading = false;
        this.visible = store.get('showCellBoundaries');
        this.group.visible = this.visible;
        
        console.log(`Created boundary layer for z-stack ${zstack}`);
    }
    
    /**
     * Load boundary data for this layer
     * @returns {Promise} Resolves when loading is complete
     */
    async load() {
        if (this.loaded || this.loading) return;
        
        this.loading = true;
        console.log(`Loading boundary layer for z-stack ${this.zstack}...`);
        
        try {
            let data;
            
            try {
                // First try to fetch and decompress the gzipped data
                console.log(`Trying to load gzipped data from: ${config.dataPaths.getCellBoundariesPath(this.zstack)}`);
                const gzipResponse = await fetch(config.dataPaths.getCellBoundariesPath(this.zstack));
                
                if (!gzipResponse.ok) {
                    throw new Error(`Failed to fetch gzipped data: ${gzipResponse.status} ${gzipResponse.statusText}`);
                }
                
                const compressedData = await gzipResponse.arrayBuffer();
                console.log(`Got compressed data, size: ${compressedData.byteLength} bytes`);
                
                // Decompress the data using Pako
                const decompressedData = ungzip(new Uint8Array(compressedData));
                console.log(`Decompressed data successfully`);
                
                // Parse the JSON data
                const jsonString = new TextDecoder().decode(decompressedData);
                data = JSON.parse(jsonString);
                console.log(`Parsed JSON data successfully`);
            } catch (gzipError) {
                // If gzip decompression fails, fall back to direct JSON loading
                console.warn(`Failed to load or decompress gzipped data: ${gzipError.message}. Falling back to JSON.`);
                
                console.log(`Trying to load JSON data from: ${config.dataPaths.getCellBoundariesPathJSON(this.zstack)}`);
                const jsonResponse = await fetch(config.dataPaths.getCellBoundariesPathJSON(this.zstack));
                
                if (!jsonResponse.ok) {
                    throw new Error(`Failed to fetch JSON data: ${jsonResponse.status} ${jsonResponse.statusText}`);
                }
                
                data = await jsonResponse.json();
                console.log(`Loaded JSON data successfully`);
            }
            
            // Create visualization with the data (from either method)
            this.createVisualization(data);
            
            // Add to scene
            this.scene.add(this.group);
            
            this.loaded = true;
            console.log(`Loaded boundary layer for z-stack ${this.zstack}`);
        } catch (error) {
            console.error(`Error loading boundary layer for z-stack ${this.zstack}:`, error);
        } finally {
            this.loading = false;
        }
    }
    
    /**
     * Create visualization for this layer
     * @param {Object} data - Boundary data
     */
    createVisualization(data) {
        if (!data || !data.cellOffsets || !data.points) {
            console.error(`Invalid data for z-stack ${this.zstack}`);
            return;
        }
        
        // Clear any existing content
        while (this.group.children.length > 0) {
            const child = this.group.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            this.group.remove(child);
        }
        
        const opacity = store.get('boundaryOpacity');
        const enableInnerColoring = store.get('innerColoring');
        const innerColoringOpacity = store.get('innerColoringOpacity');
        
        const { cellOffsets, points } = data;
        const clusterData = clusterList[this.zstack]; // assuming same ordering
        
        let totalPoints = 0;
        const numCells = cellOffsets.length - 1;
        
        for (let index = 0; index < numCells; index++) {
            const start = cellOffsets[index] * 2;
            const end = cellOffsets[index + 1] * 2;
            
            const boundary = [];
            for (let i = start; i < end; i += 2) {
                boundary.push({ x: points[i], y: points[i + 1] });
            }
            
            if (!boundary.length) continue;
            
            const cluster = clusterData[index];
            const clusterColor = palette[cluster];
            
            totalPoints += boundary.length;
            
            // Create line geometry
            const linePositions = new Float32Array(boundary.length * 3);
            boundary.forEach((pt, i) => {
                linePositions[i * 3] = pt.x;
                linePositions[i * 3 + 1] = pt.y;
                linePositions[i * 3 + 2] = 0;
            });
            
            const lineGeometry = new THREE.BufferGeometry();
            lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
            
            const lineMaterial = new THREE.LineBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: opacity
            });
            
            const visibleLine = new THREE.Line(lineGeometry, lineMaterial);
            
            // Hit area for better interaction
            const hitGeometry = new THREE.BufferGeometry();
            const expandedPositions = new Float32Array(linePositions.length);
            for (let i = 0; i < linePositions.length; i += 3) {
                expandedPositions[i] = linePositions[i] + 0.0005;
                expandedPositions[i + 1] = linePositions[i + 1] + 0.0005;
                expandedPositions[i + 2] = linePositions[i + 2];
            }
            
            hitGeometry.setAttribute('position', new THREE.BufferAttribute(expandedPositions, 3));
            const hitMaterial = new THREE.LineBasicMaterial({
                visible: false,
                transparent: true,
                opacity: 0
            });
            
            const hitLine = new THREE.Line(hitGeometry, hitMaterial);
            
            // Attach metadata
            const userData = {
                cellType: cluster,
                cellId: index,
                zstack: this.zstack
            };
            visibleLine.userData = userData;
            hitLine.userData = userData;
            
            this.group.add(visibleLine);
            this.group.add(hitLine);
            
            // Optional fill
            if (enableInnerColoring) {
                const shape = new THREE.Shape(boundary.map(p => new THREE.Vector2(p.x, p.y)));
                const fillGeometry = new THREE.ShapeGeometry(shape);
                const fillMaterial = new THREE.MeshBasicMaterial({
                    color: clusterColor,
                    transparent: true,
                    opacity: innerColoringOpacity
                });
                const fillMesh = new THREE.Mesh(fillGeometry, fillMaterial);
                fillMesh.userData = userData;
                this.group.add(fillMesh);
            }
        }
        
        store.set('boundariesRendered', totalPoints);
    }
    
    /**
     * Set visibility of this layer
     * @param {boolean} visible - Whether the layer should be visible
     */
    setVisible(visible) {
        this.visible = visible;
        this.group.visible = visible;
    }
    
    /**
     * Update opacity of this layer
     * @param {number} opacity - New opacity value
     */
    updateOpacity(opacity) {
        // Store the opacity value for future reference
        this.currentOpacity = opacity;
        
        this.group.traverse(object => {
            // Only update visible lines and meshes, not the hit detection lines
            if (object instanceof THREE.Line || object instanceof THREE.Mesh) {
                // Skip invisible hit detection lines (they should always stay invisible)
                if (object.material && object.material.visible === false) {
                    return;
                }
                
                // Update the opacity
                if (object.material) {
                    object.material.opacity = opacity;
                    
                    // If opacity is 0, we still want to be able to make it visible again
                    // So we keep the visible property true
                    if (opacity === 0) {
                        // We don't change visible property, just opacity
                        object.material.transparent = true;
                    }
                }
            }
        });
    }
    
    /**
     * Clean up resources used by this layer
     */
    dispose() {
        if (this.scene && this.group) {
            this.scene.remove(this.group);
        }
        
        if (this.group) {
            this.group.traverse(object => {
                if (object.geometry) object.geometry.dispose();
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => material.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            });
        }
        
        this.loaded = false;
        this.loading = false;
    }
}

/**
 * CellBoundaries class manages multiple boundary layers
 */
export class CellBoundaries {
    // Static instance tracking for singleton pattern
    static instance = null;
    
    /**
     * Create a new CellBoundaries manager
     * @param {THREE.Scene} scene - Three.js scene to add boundaries to
     */
    constructor(scene) {
        // Singleton pattern
        if (CellBoundaries.instance) {
            console.log("CellBoundaries already instantiated, returning existing instance");
            return CellBoundaries.instance;
        }
        
        CellBoundaries.instance = this;
        console.log("CellBoundaries manager instantiated");
        
        this.scene = scene;
        this.layers = {}; // Map of z-stack ID to BoundaryLayer
        
        // Subscribe to store changes
        store.subscribe('zstack', () => this.updateZStack());
        store.subscribe('showCellBoundaries', (visible) => this.updateVisibility(visible));
        store.subscribe('boundaryOpacity', (opacity) => this.updateOpacity(opacity));
        store.subscribe('innerColoring', () => {
            console.log('Inner coloring setting changed, updating all layers');
            this.refreshCurrentLayer(true); // true = refresh all layers
        });
        store.subscribe('innerColoringOpacity', () => {
            console.log('Inner coloring opacity changed, updating all layers');
            this.refreshCurrentLayer(true); // true = refresh all layers
        });
        
        // Load initial z-stack
        this.loadBoundaries(store.get('zstack').toString());
    }

    /**
     * Update which z-stack layer is visible based on store value
     */
    async updateZStack() {
        const zstack = store.get('zstack').toString();
        console.log(`Updating active z-stack to ${zstack}`);
        
        // Hide all layers except the current one
        Object.keys(this.layers).forEach(key => {
            const layer = this.layers[key];
            const isCurrentLayer = (key === zstack);
            
            // Set visibility based on whether this is the current layer
            // and the global visibility setting
            const shouldBeVisible = isCurrentLayer && store.get('showCellBoundaries');
            layer.setVisible(shouldBeVisible);
            
            // Only keep the current layer in the scene
            if (isCurrentLayer) {
                if (!this.scene.children.includes(layer.group)) {
                    this.scene.add(layer.group);
                }
            } else {
                if (this.scene.children.includes(layer.group)) {
                    this.scene.remove(layer.group);
                }
            }
        });
        
        // Load the requested layer if it doesn't exist
        if (!this.layers[zstack]) {
            await this.loadBoundaries(zstack);
        }
    }
    
    /**
     * Load cell boundary data for a specific z-stack
     * @param {string} zstack - Z-stack identifier
     * @returns {Promise} Resolves when loading is complete
     */
    async loadBoundaries(zstack) {
        console.log(`Loading boundaries for z-stack ${zstack}`);
        
        // Check if layer already exists
        if (this.layers[zstack]) {
            console.log(`Layer ${zstack} already exists, making it visible`);
            const isVisible = store.get('showCellBoundaries');
            this.layers[zstack].setVisible(isVisible);
            return;
        }
        
        // Create new layer
        const layer = new BoundaryLayer(zstack, this.scene);
        this.layers[zstack] = layer;
        
        // Load the layer data
        await layer.load();
        
        // Make sure it's the only visible layer if it's the current z-stack
        const currentZstack = store.get('zstack').toString();
        if (zstack === currentZstack) {
            this.updateZStack();
        }
    }
    
    /**
     * Update visibility of all layers based on global setting
     * @param {boolean} visible - Whether boundaries should be visible
     */
    updateVisibility(visible) {
        console.log(`Updating all boundary layers visibility to ${visible}`);
        
        // Only update visibility for the current z-stack layer
        const currentZstack = store.get('zstack').toString();
        if (this.layers[currentZstack]) {
            this.layers[currentZstack].setVisible(visible);
        }
        
        // Force a render update
        store.set('forceRender', !store.get('forceRender'));
    }
    
    /**
     * Update opacity of all boundary layers
     * @param {number} opacity - New opacity value
     */
    updateOpacity(opacity) {
        console.log(`Updating boundary opacity to ${opacity} for all layers`);
        
        // Update opacity for all loaded layers
        Object.keys(this.layers).forEach(zstack => {
            if (this.layers[zstack]) {
                console.log(`Setting opacity ${opacity} for layer ${zstack}`);
                this.layers[zstack].updateOpacity(opacity);
            }
        });
        
        // Force a render update
        store.set('forceRender', !store.get('forceRender'));
    }
    
    /**
     * Refresh layers when inner coloring settings change
     * @param {boolean} [refreshAllLayers=false] - Whether to refresh all layers or just the current one
     */
    refreshCurrentLayer(refreshAllLayers = true) {
        if (refreshAllLayers) {
            console.log('Refreshing all boundary layers for inner coloring changes');
            // Get the current z-stack to ensure it's reloaded last (and thus visible)
            const currentZstack = store.get('zstack').toString();
            const allLayers = Object.keys(this.layers);
            
            // First refresh all non-current layers
            allLayers.filter(zstack => zstack !== currentZstack).forEach(zstack => {
                if (this.layers[zstack]) {
                    console.log(`Refreshing layer ${zstack} for inner coloring changes`);
                    this.layers[zstack].dispose();
                    delete this.layers[zstack];
                    this.loadBoundaries(zstack);
                }
            });
            
            // Then refresh the current layer to ensure it's visible
            if (this.layers[currentZstack]) {
                console.log(`Refreshing current layer ${currentZstack} for inner coloring changes`);
                this.layers[currentZstack].dispose();
                delete this.layers[currentZstack];
                this.loadBoundaries(currentZstack);
            }
        } else {
            // Only refresh the current layer (original behavior)
            const currentZstack = store.get('zstack').toString();
            if (this.layers[currentZstack]) {
                console.log(`Refreshing only current layer ${currentZstack} for inner coloring changes`);
                this.layers[currentZstack].dispose();
                delete this.layers[currentZstack];
                this.loadBoundaries(currentZstack);
            }
        }
    }
    
    /**
     * Get all visible cell boundaries for interaction testing
     * @returns {Array} Array of all visible boundary objects
     */
    getVisibleBoundaries() {
        const currentZstack = store.get('zstack').toString();
        if (!this.layers[currentZstack] || !this.layers[currentZstack].group) {
            return [];
        }
        
        return this.layers[currentZstack].group.children;
    }
    
    /**
     * Clean up resources used by all layers
     */
    dispose() {
        Object.values(this.layers).forEach(layer => {
            layer.dispose();
        });
        
        this.layers = {};
        CellBoundaries.instance = null;
    }
    
    /**
     * Generate mock cell boundary data for testing
     * @param {number} numCells - Number of cells to generate
     * @returns {Object} Mock cell boundary data in the same format as the real data
     */
    static generateMockData(numCells = 10) {
        // Generate mock data in the format expected by BoundaryLayer
        const cellOffsets = new Array(numCells + 1);
        const points = [];
        
        for (let i = 0; i < numCells; i++) {
            cellOffsets[i] = points.length / 2;
            
            // Generate a random polygon with 5-15 points
            const numPoints = 5 + Math.floor(Math.random() * 10);
            const centerX = Math.random() * 10000;
            const centerY = Math.random() * 10000;
            const radius = 500 + Math.random() * 1000;
            
            for (let j = 0; j < numPoints; j++) {
                const angle = (j / numPoints) * Math.PI * 2;
                // Add some randomness to the radius for more natural shapes
                const r = radius * (0.8 + Math.random() * 0.4);
                
                points.push(centerX + Math.cos(angle) * r);
                points.push(centerY + Math.sin(angle) * r);
            }
            
            // Close the polygon
            points.push(points[cellOffsets[i] * 2]);
            points.push(points[cellOffsets[i] * 2 + 1]);
        }
        
        cellOffsets[numCells] = points.length / 2;
        
        return {
            cellOffsets: cellOffsets,
            points: points
        };
    }
}
