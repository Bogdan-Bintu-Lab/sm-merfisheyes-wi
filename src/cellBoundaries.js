/**
 * CellBoundaries module for loading and managing cell boundary data
 * Redesigned to better handle multiple z-stack layers
 */

import * as THREE from 'three';
import { store } from './store.js';
import { config } from './config.js';
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Palette and clusters are now loaded from store
import { ungzip } from 'pako';

/**
 * BoundaryLayer class represents a single z-stack layer of cell boundaries or nuclei
 */
class BoundaryLayer {
    /**
     * Create a new boundary layer
     * @param {string} zstack - Z-stack identifier
     * @param {THREE.Scene} scene - Three.js scene to add the layer to
     * @param {string} type - Type of boundary ('boundaries' or 'nuclei')
     */
    constructor(zstack, scene, type = 'boundaries') {
        this.zstack = zstack;
        this.scene = scene;
        this.type = type; // 'boundaries' or 'nuclei'
        this.group = new THREE.Group();
        this.loaded = false;
        this.loading = false;
        
        // Set visibility based on type
        if (this.type === 'boundaries') {
            this.visible = store.get('showCellBoundaries');
            this.opacity = store.get('boundaryOpacity') || 1.0;
        } else if (this.type === 'nuclei') {
            this.visible = store.get('showCellNuclei');
            this.opacity = store.get('nucleiOpacity') || 1.0;
        } 
        
        this.group.visible = this.visible;
        
        console.log(`Created ${this.type} layer for z-stack ${zstack}`);
    }
    
    /**
     * Load boundary data for this layer
     * @returns {Promise} Resolves when loading is complete
     */
    async load() {
        if (this.loaded || this.loading) return;
        
        this.loading = true;
        console.log(`Loading ${this.type} layer for z-stack ${this.zstack}...`);
        
        try {
            // Format the z-stack number with leading zero if needed
            const formattedZstack = this.zstack;
            
            // Get the path to the compressed data based on type
            let gzipPath;
            if (this.type === 'boundaries') {
                gzipPath = config.dataPaths.getCellBoundariesPath(formattedZstack);
            } else if (this.type === 'nuclei') {
                gzipPath = config.dataPaths.getCellNucleiPath(formattedZstack);
            } else {
                throw new Error(`Unknown boundary type: ${this.type}`);
            }
            
            console.log(`Loading gzipped data from: ${gzipPath}`);
            
            // Fetch the compressed data
            const gzipResponse = await fetch(gzipPath, {
                headers: {
                    'Accept-Encoding': 'gzip',
                    'Cache-Control': 'no-cache'
                }
            });
            
            if (!gzipResponse.ok) {
                throw new Error(`Failed to fetch gzipped data: ${gzipResponse.status} ${gzipResponse.statusText}`);
            }
            
            // Get the compressed data as an ArrayBuffer
            const compressedData = await gzipResponse.arrayBuffer();
            console.log(`Got compressed data, size: ${compressedData.byteLength} bytes`);
            
            if (compressedData.byteLength === 0) {
                throw new Error('Received empty compressed data');
            }
            
            // Check the first bytes to determine the file format
            const dataView = new DataView(compressedData);
            const byte1 = dataView.getUint8(0);
            const byte2 = dataView.getUint8(1);
            console.log(`First two bytes: 0x${byte1.toString(16)} 0x${byte2.toString(16)}`);
            
            let data;
            
            // Check if it's actually a JSON file (starts with '{")'
            if (byte1 === 0x7B && byte2 === 0x22) {
                console.log(`File appears to be plain JSON despite .gz extension. File size: ${compressedData.byteLength} bytes`);
                try {
                    const jsonString = new TextDecoder().decode(compressedData);
                    data = JSON.parse(jsonString);
                    console.log(`Parsed JSON data directly, bypassing decompression. Data size: ${jsonString.length} characters`);
                } catch (parseError) {
                    console.error('JSON parsing error:', parseError);
                    throw new Error(`Failed to parse direct JSON: ${parseError.message}`);
                }
            } else if (byte1 === 0x1F && byte2 === 0x8B) {
                // It's a proper gzip file, decompress it
                try {
                    console.log(`Processing gzipped file. Compressed size: ${compressedData.byteLength} bytes`);
                    const decompressedData = ungzip(new Uint8Array(compressedData));
                    console.log(`Decompression complete. Original size: ${compressedData.byteLength} bytes → Decompressed size: ${decompressedData.length} bytes (${(decompressedData.length / compressedData.byteLength).toFixed(2)}x larger)`);
                    
                    // Parse the JSON data
                    const jsonString = new TextDecoder().decode(decompressedData);
                    data = JSON.parse(jsonString);
                    console.log(`Parsed JSON data successfully. JSON string length: ${jsonString.length} characters`);
                } catch (error) {
                    console.error('Decompression or parsing error:', error);
                    throw new Error(`Failed to process gzipped data: ${error.message}`);
                }
            } else if (byte1 === 0x3C && byte2 === 0x21) {
                // This looks like an HTML document (starts with '<!'), likely an error page
                const htmlContent = new TextDecoder().decode(compressedData).substring(0, 200); // Get first 200 chars for debugging
                console.error('Received HTML content instead of JSON or gzip data:', htmlContent);
                
                // Try to get a more specific error from the HTML content
                let errorMessage = 'Received HTML error page instead of data';
                
                // Try to extract error status code if present
                const statusMatch = htmlContent.match(/status code (\d+)/);
                if (statusMatch && statusMatch[1]) {
                    errorMessage += ` (Status: ${statusMatch[1]})`;
                }
                
                // Try to fall back to uncompressed path
                console.log(`Attempting to load uncompressed data as fallback...`);
                try {
                    // Get the uncompressed path based on type
                    let jsonPath;
                    if (this.type === 'boundaries') {
                        jsonPath = config.dataPaths.getCellBoundariesPathJSON(formattedZstack);
                    } else if (this.type === 'nuclei') {
                        jsonPath = config.dataPaths.getCellNucleiPathJSON(formattedZstack);
                    } else {
                        throw new Error(`Unknown boundary type: ${this.type}`);
                    }
                    
                    console.log(`Loading uncompressed data from: ${jsonPath}`);
                    
                    // Fetch the uncompressed data
                    const jsonResponse = await fetch(jsonPath, {
                        headers: {
                            'Cache-Control': 'no-cache'
                        }
                    });
                    
                    if (!jsonResponse.ok) {
                        throw new Error(`Failed to fetch uncompressed data: ${jsonResponse.status} ${jsonResponse.statusText}`);
                    }
                    
                    // Parse the JSON data
                    data = await jsonResponse.json();
                    console.log(`Successfully loaded uncompressed data as fallback`);
                } catch (fallbackError) {
                    console.error('Fallback to uncompressed data failed:', fallbackError);
                    throw new Error(`${errorMessage}. Fallback also failed: ${fallbackError.message}`);
                }
            } else {
                throw new Error(`Unknown file format. First bytes: 0x${byte1.toString(16)} 0x${byte2.toString(16)}`);
            }
            
            // Create visualization with the data
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
        
        const opacity = this.opacity;
        const enableInnerColoring = store.get('innerColoring');
        const innerColoringOpacity = store.get('innerColoringOpacity');
        const { cellOffsets, points, cellIds } = data;
        const clusters = store.get('clusters');
        console.log(cellOffsets, points, cellIds, clusters);
        const clusterData = cellIds.map(id => clusters[id.toString()]); // assuming same ordering
        
        const CHUNK_SIZE = 100; // Number of cells per chunk
        const MAX_POINTS_PER_CELL = 50; // Maximum points per cell when simplified
        let totalPoints = 0;
        const numCells = cellOffsets.length - 1;
        
        // Process cells in chunks
        for (let chunkStart = 0; chunkStart < numCells; chunkStart += CHUNK_SIZE) {
            const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, numCells);
            const lineGeometries = [];
            const fillGeometries = [];
            const chunkMetadata = [];
            
            for (let index = chunkStart; index < chunkEnd; index++) {
                const start = cellOffsets[index] * 2;
                const end = cellOffsets[index + 1] * 2;
                
                // Create array of points for this cell
                const boundary = [];
                for (let i = start; i < end; i += 2) {
                    boundary.push({ x: points[i], y: points[i + 1] });
                }
                
                if (!boundary.length) continue;
                totalPoints += boundary.length;
                
                // Simplify points if needed
                const simplifiedBoundary = boundary.length > MAX_POINTS_PER_CELL ?
                    boundary.filter((_, i) => i % Math.ceil(boundary.length / MAX_POINTS_PER_CELL) === 0) :
                    boundary;
                
                // Create line geometry with indices
                const numPoints = simplifiedBoundary.length;
                const positions = new Float32Array((numPoints + 1) * 3);
                
                simplifiedBoundary.forEach((pt, i) => {
                    positions[i * 3] = pt.x;
                    positions[i * 3 + 1] = pt.y;
                    positions[i * 3 + 2] = 0;
                });
                
                // Close the loop
                positions[numPoints * 3] = simplifiedBoundary[0].x;
                positions[numPoints * 3 + 1] = simplifiedBoundary[0].y;
                positions[numPoints * 3 + 2] = 0;
                
                const lineGeometry = new THREE.BufferGeometry();
                lineGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                
                // Create indices for line segments
                const indices = new Uint16Array(numPoints * 2);
                for (let i = 0; i < numPoints; i++) {
                    indices[i * 2] = i;
                    indices[i * 2 + 1] = i + 1;
                }
                lineGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
                
                // Store metadata for this cell
                const cluster = clusterData[index];
                const clusterColor = store.get('palette')[cluster];
                
                // Store color for this cell
                const color = new THREE.Color(clusterColor || 0x000000);
                const colorArray = [color.r, color.g, color.b];
                
                chunkMetadata.push({
                    cellType: cluster,
                    cellId: index,
                    zstack: this.zstack,
                    hoverable: true,
                    originalColor: clusterColor || 0x000000,
                    originalOpacity: innerColoringOpacity,
                    color: colorArray // Store the color array for easy access
                });
                
                lineGeometries.push(lineGeometry);
                
                // Create fill geometry if enabled
                if (enableInnerColoring && this.type === 'boundaries') {
                    const shape = new THREE.Shape();
                    shape.moveTo(simplifiedBoundary[0].x, simplifiedBoundary[0].y);
                    for (let i = 1; i < simplifiedBoundary.length; i++) {
                        shape.lineTo(simplifiedBoundary[i].x, simplifiedBoundary[i].y);
                    }
                    shape.lineTo(simplifiedBoundary[0].x, simplifiedBoundary[0].y);
                    
                    const geometry = new THREE.ShapeGeometry(shape);
                    
                    // Create color array for all vertices of this shape
                    const vertexCount = geometry.attributes.position.count;
                    const colors = new Float32Array(vertexCount * 4); // Using RGBA
                    for (let i = 0; i < vertexCount; i++) {
                        colors[i * 4] = color.r;
                        colors[i * 4 + 1] = color.g;
                        colors[i * 4 + 2] = color.b;
                        colors[i * 4 + 3] = opacity; // Add opacity
                    }
                    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
                    
                    fillGeometries.push(geometry);
                }
            }
            
            if (lineGeometries.length > 0) {
                // Create merged line geometry
                const mergedLineGeometry = BufferGeometryUtils.mergeGeometries(lineGeometries);
                const lineMaterial = new THREE.LineBasicMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: opacity
                });
                
                const lineChunk = new THREE.LineSegments(mergedLineGeometry, lineMaterial);
                lineChunk.userData = { chunkMetadata };
                this.group.add(lineChunk);
                
                // Create merged fill geometry if needed
                if (fillGeometries.length > 0) {
                    const mergedFillGeometry = BufferGeometryUtils.mergeGeometries(fillGeometries);
                    
                    // The colors are already assigned to each geometry before merging
                    const fillMaterial = new THREE.MeshBasicMaterial({
                        vertexColors: true,
                        transparent: true,
                        opacity: innerColoringOpacity,
                        side: THREE.DoubleSide
                    });
                    
                    const fillChunk = new THREE.Mesh(mergedFillGeometry, fillMaterial);
                    fillChunk.userData = { chunkMetadata };
                    this.group.add(fillChunk);
                }
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
 * CellBoundaries class manages multiple boundary and nuclei layers
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
        this.boundaryLayers = {}; // Map of z-stack ID to boundary layers
        this.nucleiLayers = {};   // Map of z-stack ID to nuclei layers
        
        // Subscribe to store changes
        store.subscribe('zstack', () => {
            console.log('Z-stack changed, updating boundaries');
            this.updateZStack();
        });
        
        // Cell boundaries subscriptions
        store.subscribe('showCellBoundaries', (visible) => this.updateVisibility('boundaries', visible));
        store.subscribe('boundaryOpacity', (opacity) => this.updateOpacity('boundaries', opacity));
        
        // Cell nuclei subscriptions
        store.subscribe('showCellNuclei', (visible) => this.updateVisibility('nuclei', visible));
        store.subscribe('nucleiOpacity', (opacity) => this.updateOpacity('nuclei', opacity));
        
        // Inner coloring subscriptions (for boundaries only)
        store.subscribe('innerColoring', () => {
            console.log('Inner coloring setting changed, updating all layers');
            this.refreshCurrentLayer('boundaries', true); // true = refresh all layers
        });
        store.subscribe('innerColoringOpacity', () => {
            console.log('Inner coloring opacity changed, updating all layers');
            this.refreshCurrentLayer('boundaries', true); // true = refresh all layers
        });
        
        // Load initial z-stack
        this.loadBoundaries(store.get('zstack').toString());
        
        // Load nuclei if supported for the current variant
        if (config.dataPaths.hasNucleiSupport()) {
            this.loadNuclei(store.get('zstack').toString());
            
            // Show nuclei controls in the UI
            const nucleiControls = document.getElementById('nuclei-controls');
            const nucleiOpacityControl = document.getElementById('nuclei-opacity-control');
            if (nucleiControls) nucleiControls.style.display = 'block';
            if (nucleiOpacityControl) nucleiOpacityControl.style.display = 'block';
        }
    }

    /**
     * Update which z-stack layer is visible based on store value
     */
    async updateZStack() {
    const zstack = store.get('zstack').toString();
        console.log(`Updating to z-stack ${zstack}`);
        
        // Hide all boundary layers
        Object.values(this.boundaryLayers).forEach(layer => {
            layer.group.visible = false;
        });
        
        // Hide all nuclei layers
        Object.values(this.nucleiLayers).forEach(layer => {
            layer.group.visible = false;
        });
        
        // Load and show the current boundary layer
        this.loadBoundaries(zstack);
        
        // Make the current boundary layer visible if boundaries are enabled
        if (this.boundaryLayers[zstack]) {
            this.boundaryLayers[zstack].visible = store.get('showCellBoundaries');
            this.boundaryLayers[zstack].group.visible = this.boundaryLayers[zstack].visible;
        }
        
        // Load and show the current nuclei layer if supported
        if (config.dataPaths.hasNucleiSupport()) {
            this.loadNuclei(zstack);
            
            // Make the current nuclei layer visible if nuclei are enabled
            if (this.nucleiLayers[zstack]) {
                this.nucleiLayers[zstack].visible = store.get('showCellNuclei');
                this.nucleiLayers[zstack].group.visible = this.nucleiLayers[zstack].visible;
            }
        }
    }
    
    /**
     * Load boundaries for a specific z-stack
     * @param {string} zstack - Z-stack identifier
     */
    loadBoundaries(zstack) {
        console.log(`Loading boundaries for z-stack ${zstack}`);
        
        // Create a new layer if it doesn't exist
        if (!this.boundaryLayers[zstack]) {
            this.boundaryLayers[zstack] = new BoundaryLayer(zstack, this.scene, 'boundaries');
        }
        
        // Load the layer data
        this.boundaryLayers[zstack].load();
    }
    
    /**
     * Load nuclei for a specific z-stack
     * @param {string} zstack - Z-stack identifier
     */
    loadNuclei(zstack) {
        // Skip if nuclei are not supported for the current variant
        if (!config.dataPaths.hasNucleiSupport()) {
            console.log('Nuclei not supported for current variant, skipping');
            return;
        }
        
        console.log(`Loading nuclei for z-stack ${zstack}`);
        
        // Create a new layer if it doesn't exist
        if (!this.nucleiLayers[zstack]) {
            this.nucleiLayers[zstack] = new BoundaryLayer(zstack, this.scene, 'nuclei');
            this.scene.add(this.nucleiLayers[zstack].group);
        }
        
        // Load the layer data
        this.nucleiLayers[zstack].load();
    }
    
    /**
     * Update visibility of layers of a specific type
     * @param {string} type - Type of layer ('boundaries' or 'nuclei')
     * @param {boolean} visible - Whether to show or hide the layers
     */
    updateVisibility(type, visible) {
        console.log(`Updating ${type} visibility to ${visible}`);
        
        // Get the current z-stack
        const currentZstack = store.get('zstack').toString();
        
        // Select the appropriate layer collection
        const layers = type === 'boundaries' ? this.boundaryLayers : this.nucleiLayers;
        
        // Only update the current layer's visibility
        if (layers[currentZstack]) {
            console.log(`Setting ${type} visibility for z-stack ${currentZstack} to ${visible}`);
            layers[currentZstack].visible = visible;
            layers[currentZstack].group.visible = visible;
        } else {
            console.log(`No ${type} layer found for z-stack ${currentZstack}`);
        }
        
        // Force a render update
        store.set('forceRender', true);
    }
    
    /**
     * Update opacity of all layers of a specific type
     * @param {string} type - Type of layer ('boundaries' or 'nuclei')
     * @param {number} opacity - Opacity value (0-1)
     */
    updateOpacity(type, opacity) {
        console.log(`Updating ${type} opacity to ${opacity}`);
        
        // Select the appropriate layer collection
        const layers = type === 'boundaries' ? this.boundaryLayers : this.nucleiLayers;
        
        // Update all layers of this type
        Object.values(layers).forEach(layer => {
            layer.updateOpacity(opacity);
        });
    }
    
    /**
     * Refresh layers of a specific type
     * @param {string} type - Type of layer ('boundaries' or 'nuclei')
     * @param {boolean} refreshAll - Whether to refresh all layers or just the current one
     */
    refreshCurrentLayer(type, refreshAll = false) {
        const zstack = store.get('zstack').toString();
        
        // Select the appropriate layer collection
        const layers = type === 'boundaries' ? this.boundaryLayers : this.nucleiLayers;
        
        if (refreshAll) {
            console.log(`Refreshing all ${type} layers`);
            Object.values(layers).forEach(layer => {
                if (layer.loaded) {
                    layer.refresh();
                }
            });
        } else if (layers[zstack] && layers[zstack].loaded) {
            console.log(`Refreshing current ${type} layer (z-stack ${zstack})`);
            layers[zstack].refresh();
        }
    }
    
    /**
     * Get the number of boundaries rendered
     * @returns {number} Number of boundaries rendered
     */
    getBoundariesRendered() {
        const zstack = store.get('zstack').toString();
        let count = 0;
        
        // Count boundaries
        if (this.boundaryLayers[zstack] && this.boundaryLayers[zstack].loaded) {
            count += this.boundaryLayers[zstack].boundariesRendered;
        }
        
        // Count nuclei if supported
        if (config.dataPaths.hasNucleiSupport() && 
            this.nucleiLayers[zstack] && 
            this.nucleiLayers[zstack].loaded) {
            count += this.nucleiLayers[zstack].boundariesRendered;
        }
        
        return count;
    }
    
    /**
     * Get all visible cell boundaries for interaction testing
     * @returns {Array} Array of all visible boundary objects
     */
    getVisibleBoundaries() {
        const zstack = store.get('zstack').toString();
        let boundaries = [];
        
        // Get boundaries
        if (this.boundaryLayers[zstack] && this.boundaryLayers[zstack].group) {
            boundaries = boundaries.concat(this.boundaryLayers[zstack].group.children);
        }
        
        // Get nuclei if supported
        if (config.dataPaths.hasNucleiSupport() && 
            this.nucleiLayers[zstack] && 
            this.nucleiLayers[zstack].group) {
            boundaries = boundaries.concat(this.nucleiLayers[zstack].group.children);
        }
        
        return boundaries;
    }
    
    /**
     * Dispose of all layers
     */
    dispose() {
        // Dispose of all boundary layers
        Object.values(this.boundaryLayers).forEach(layer => {
            layer.dispose();
        });
        
        // Dispose of all nuclei layers
        Object.values(this.nucleiLayers).forEach(layer => {
            layer.dispose();
        });
        
        this.boundaryLayers = {};
        this.nucleiLayers = {};
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
