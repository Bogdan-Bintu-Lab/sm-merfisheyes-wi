/**
 * GeneLoader class for loading and managing gene data
 * Handles loading, processing, and level-of-detail for gene data points
 * Optimized for rendering up to 8 million points efficiently
 */

import * as THREE from 'three';
import { store } from './store.js';
import { updateDataBounds } from './main.js';
import pako from 'pako';
import { config } from './config.js';

export class GeneLoader {
    constructor(scene) {
        this.scene = scene;
        this.genePointsGroup = null;
        this.loadedGene = null;
        this.originalPoints = null;
        this.lodLevels = {};
        this.currentLODLevel = -1; // Track current LOD level to avoid unnecessary updates
        
        // Initialize transformation state to track changes
        this.transformationState = {
            flipX: false,
            flipY: false,
            swapXY: false
        };
        
        // Subscribe to store changes
        store.subscribe('currentGene', (geneName) => {
            if (geneName && geneName !== this.loadedGene) {
                this.loadGeneData(geneName);
            }
        });
        
        store.subscribe('pointSize', () => this.updatePointSize());
        
        // Use debounced update for camera distance to avoid too frequent updates
        let lodUpdateTimeout;
        store.subscribe('cameraDistance', () => {
            clearTimeout(lodUpdateTimeout);
            lodUpdateTimeout = setTimeout(() => this.updateLOD(), 100);
        });
        
        store.subscribe('lodThreshold', () => this.updateLOD());
        
        // Subscribe to intensity settings changes
        store.subscribe('useIntensityColor', () => this.updateLOD());
        store.subscribe('intensityMin', () => this.updateLOD());
        store.subscribe('intensityMax', () => this.updateLOD());
        
        // Subscribe to gene coordinate transformation changes
        store.subscribe('geneFlipX', () => {
            this.transformationState.flipX = store.get('geneFlipX');
            // Force update by resetting current LOD level
            this.currentLODLevel = -1;
            this.updateLOD();
            console.log('Gene flip X changed, updating visualization');
        });
        store.subscribe('geneFlipY', () => {
            this.transformationState.flipY = store.get('geneFlipY');
            // Force update by resetting current LOD level
            this.currentLODLevel = -1;
            this.updateLOD();
            console.log('Gene flip Y changed, updating visualization');
        });
        store.subscribe('geneSwapXY', () => {
            this.transformationState.swapXY = store.get('geneSwapXY');
            // Force update by resetting current LOD level
            this.currentLODLevel = -1;
            this.updateLOD();
            console.log('Gene swap XY changed, updating visualization');
        });
        
        // Initialize transformation state
        this.transformationState = {
            flipX: store.get('geneFlipX') || false,
            flipY: store.get('geneFlipY') || false,
            swapXY: store.get('geneSwapXY') || false
        };
    }
    
    /**
     * Load gene data from gzipped CSV file
     * @param {string} geneName - Name of the gene to load
     */
    async loadGeneData(geneName) {
        try {
            console.log(`Loading gene data for ${geneName}...`);
            
            // Track the gene we're currently loading
            this.loadingGene = geneName;
            
            // Clear any previous data
            this.clearPreviousGeneData();
            
            // If the gene name is empty or null, just clear and return
            if (!geneName) {
                console.log('No gene name provided, clearing visualization');
                return;
            }
        }
        catch (error) {
            console.error('Error during gene data cleanup:', error);
        }
        
        try {
            
            console.log(`Loading gene data for ${geneName}...`);
            
            // Fetch gzipped CSV data using the config path
            const response = await fetch(config.dataPaths.getGeneDataPath(geneName));
            if (!response.ok) {
                throw new Error(`Failed to load gene data for ${geneName}: ${response.status} ${response.statusText}`);
            }
            
            // Get the compressed data as an ArrayBuffer
            const compressedData = await response.arrayBuffer();
            // console.log(`Received compressed data, size: ${compressedData.byteLength} bytes`);
            // console.log('First 100 bytes:', new Uint8Array(compressedData).slice(0, 4));

            const unzippedData = new Uint8Array(compressedData);
            // console.log(`Unzipped data size: ${unzippedData.length} bytes`);

            const decompressed = new TextDecoder().decode(unzippedData);
            // console.log(`Decompressed text length: ${decompressed.length} characters`);
            // console.log('First 100 characters:', decompressed.substring(0, 100));
            
            // Parse CSV data
            const lines = decompressed.split('\n');
            const pointsData = [];
            
            // Skip header row and process data rows
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                
                const parts = line.split(',');
                if (parts.length >= 2) {
                // if (parts.length >= 4) {
                    const x = parseFloat(parts[0]);
                    const y = parseFloat(parts[1]);
                    // const z = parseFloat(parts[2]);
                    // const intensity = parseFloat(parts[3]);
                    
                    if (!isNaN(x) && !isNaN(y)) {
                    // if (!isNaN(x) && !isNaN(y) && !isNaN(z) && !isNaN(intensity)) {
                        // pointsData.push({ x, y, z, intensity });
                        pointsData.push({ x, y });
                    }
                }
            }
            
            // Store points
            this.originalPoints = pointsData;
            this.loadedGene = geneName;
            
            // Update data bounds to center the camera on the data
            updateDataBounds(pointsData);
            
            // Create LOD levels
            this.createLODLevels(pointsData);
            
            // Create a new group for this gene's points
            this.genePointsGroup = new THREE.Group();
            this.scene.add(this.genePointsGroup);
            
            // Update store
            store.set('geneData', pointsData);
            
            // Initial LOD update
            this.updateLOD();
            
            console.log(`Loaded ${pointsData.length} points for gene ${geneName}`);
        } catch (error) {
            console.error(`Error loading gene data for ${geneName}:`, error);
            
            // Generate mock data if loading fails
            console.log('Using mock gene data instead');
            const mockGeneData = generateMockGeneData(10000);
            
            // Store mock points
            this.originalPoints = mockGeneData;
            this.loadedGene = geneName;
            
            // Update data bounds to center the camera on the data
            updateDataBounds(mockGeneData);
            
            // Create LOD levels
            this.createLODLevels(mockGeneData);
            
            // Create a new group for this gene's points
            this.genePointsGroup = new THREE.Group();
            this.scene.add(this.genePointsGroup);
            
            // Update store
            store.set('geneData', mockGeneData);
            
            // Initial LOD update
            this.updateLOD();
        }
    }
    
    /**
     * Create different levels of detail for the points
     * Optimized for handling millions of points efficiently
     * @param {Array} points - Original point data
     */
    createLODLevels(points) {
        console.time('createLODLevels');
        // Reset LOD levels
        this.lodLevels = {};
        
        // For extremely large datasets (>1M points), use more aggressive subsampling
        const isLargeDataset = points.length > 1000000;
        
        // Create different LOD levels by subsampling
        // Level 0: Full resolution (all points)
        this.lodLevels[0] = points;
        
        // For large datasets, create more aggressive LOD levels
        if (isLargeDataset) {
            // Level 1: ~25% of points
            this.lodLevels[1] = this.subsamplePoints(points, 4);
            
            // Level 2: ~10% of points
            this.lodLevels[2] = this.subsamplePoints(points, 10);
            
            // Level 3: ~4% of points
            this.lodLevels[3] = this.subsamplePoints(points, 25);
            
            // Level 4: ~1% of points
            this.lodLevels[4] = this.subsamplePoints(points, 100);
            
            // Level 5: ~0.1% of points (for very far away)
            this.lodLevels[5] = this.subsamplePoints(points, 1000);
        } else {
            // Level 1: ~50% of points
            this.lodLevels[1] = this.subsamplePoints(points, 2);
            
            // Level 2: ~25% of points
            this.lodLevels[2] = this.subsamplePoints(points, 4);
            
            // Level 3: ~10% of points
            this.lodLevels[3] = this.subsamplePoints(points, 10);
            
            // Level 4: ~5% of points
            this.lodLevels[4] = this.subsamplePoints(points, 20);
            
            // Level 5: ~1% of points (for very far away)
            this.lodLevels[5] = this.subsamplePoints(points, 100);
        }
        
        console.log('Created LOD levels:', Object.keys(this.lodLevels).map(key => 
            `Level ${key}: ${this.lodLevels[key].length} points`
        ).join(', '));
        console.timeEnd('createLODLevels');
    }
    
    /**
     * Subsample points by taking every nth point
     * Optimized for handling millions of points efficiently
     * @param {Array} points - Original point data
     * @param {number} n - Take every nth point
     * @returns {Array} Subsampled points
     */
    subsamplePoints(points, n) {
        // For large arrays, direct iteration is faster than filter
        if (points.length > 100000) {
            const result = new Array(Math.ceil(points.length / n));
            let j = 0;
            for (let i = 0; i < points.length; i += n) {
                result[j++] = points[i];
            }
            // Trim the array to the actual size used
            return result.slice(0, j);
        } else {
            return points.filter((_, index) => index % n === 0);
        }
    }
    
    /**
     * Update the level of detail based on camera distance
     * Optimized for handling millions of points efficiently
     */
    updateLOD() {
        // Skip if we don't have the necessary data
        if (!this.originalPoints || !this.genePointsGroup || !this.lodLevels) {
            return;
        }
        
        const cameraDistance = store.get('cameraDistance');
        const lodThreshold = store.get('lodThreshold');
        
        // Determine which LOD level to use based on camera distance and threshold
        let lodLevel = 0;
        
        // When lodThreshold is at maximum (5.0), always use full resolution (level 0)
        if (lodThreshold < 5.0) {
            if (cameraDistance > 10000 * lodThreshold) lodLevel = 5;
            else if (cameraDistance > 5000 * lodThreshold) lodLevel = 4;
            else if (cameraDistance > 2500 * lodThreshold) lodLevel = 3;
            else if (cameraDistance > 1000 * lodThreshold) lodLevel = 2;
            else if (cameraDistance > 500 * lodThreshold) lodLevel = 1;
        }
        
        // Get points for this LOD level
        const pointsToRender = this.lodLevels[lodLevel];
        
        // Safety check - if no points are available for this LOD level, return
        if (!pointsToRender || pointsToRender.length === 0) {
            console.warn(`No points available for LOD level ${lodLevel}`);
            return;
        }
        
        // Check if we need to update the points
        // Only skip update if LOD level hasn't changed AND transformations haven't changed
        const currentFlipX = store.get('geneFlipX');
        const currentFlipY = store.get('geneFlipY');
        const currentSwapXY = store.get('geneSwapXY');
        
        const transformationsChanged = 
            currentFlipX !== this.transformationState.flipX ||
            currentFlipY !== this.transformationState.flipY ||
            currentSwapXY !== this.transformationState.swapXY;
            
        if (this.currentLODLevel === lodLevel && 
            this.genePointsGroup.children.length > 0 && 
            !transformationsChanged) {
            return; // Skip update if LOD level and transformations haven't changed
        }
        
        // Update transformation state
        this.transformationState.flipX = currentFlipX;
        this.transformationState.flipY = currentFlipY;
        this.transformationState.swapXY = currentSwapXY;
        
        // Only log when LOD level actually changes
        if (this.currentLODLevel !== lodLevel) {
            console.log(`Updating LOD to level ${lodLevel} with ${pointsToRender.length} points`);
        }
        
        this.currentLODLevel = lodLevel;
        
        // Clear previous points
        while (this.genePointsGroup.children.length > 0) {
            const child = this.genePointsGroup.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            this.genePointsGroup.remove(child);
        }
        
        // Create new points with transformations applied
        const pointSize = store.get('pointSize');
        const geometry = new THREE.BufferGeometry();
        
        // For large datasets, use typed arrays directly for better performance
        const positions = new Float32Array(pointsToRender.length * 3);
        const colors = new Float32Array(pointsToRender.length * 3);
        
        // Use direct array access instead of forEach for better performance
        for (let i = 0; i < pointsToRender.length; i++) {
            // Apply gene-specific coordinate transformations
            const point = pointsToRender[i];
            const transformedPoint = store.transformGenePoint(point);
            
            const idx = i * 3;
            positions[idx] = transformedPoint.x;
            positions[idx + 1] = transformedPoint.y;
            positions[idx + 2] = point.z || 0; // Use z-coordinate from data if available
            
            // Check if we should use intensity-based coloring
            const useIntensityColor = store.get('useIntensityColor');
            
            if (useIntensityColor && point.intensity !== undefined) {
                // Get intensity range from store
                const intensityMin = store.get('intensityMin') || 0;
                const intensityMax = store.get('intensityMax') || 255;
                
                // Normalize intensity to a value between 0 and 1 based on the range
                const normalizedIntensity = Math.min(1, Math.max(0, 
                    (point.intensity - intensityMin) / (intensityMax - intensityMin)
                ));
                
                // Create a color gradient from blue (low) to red (high)
                colors[idx] = normalizedIntensity; // Red increases with intensity
                colors[idx + 1] = 0; // Green stays at 0
                colors[idx + 2] = 1 - normalizedIntensity; // Blue decreases with intensity
            } else {
                // Use gene color if not using intensity or if intensity not available
                const color = this.getGeneColorRGB(this.loadedGene);
                colors[idx] = color.r;
                colors[idx + 1] = color.g;
                colors[idx + 2] = color.b;
            }
        }
        
        // Set attributes
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        // Create material
        const material = new THREE.PointsMaterial({
            size: pointSize,
            vertexColors: true,
            sizeAttenuation: false
        });
        
        // Create points object
        const points = new THREE.Points(geometry, material);
        this.genePointsGroup.add(points);
        
        // Update store with points rendered
        store.set('pointsRendered', pointsToRender.length);
    }
    
    /**
     * Update point size from store
     */
    updatePointSize() {
        if (!this.genePointsGroup) return;
        
        const pointSize = store.get('pointSize');
        
        // Direct access to children is faster than traverse for simple hierarchies
        for (let i = 0; i < this.genePointsGroup.children.length; i++) {
            const object = this.genePointsGroup.children[i];
            if (object instanceof THREE.Points) {
                object.material.size = pointSize;
            }
        }
    }
    
    /**
     * Clears previous gene data and disposes of resources
     * Called before loading a new gene to prevent memory leaks
     */
    clearPreviousGeneData() {
        console.log('Clearing previous gene data');
        
        // Remove previous points if they exist
        if (this.genePointsGroup) {
            // Remove from scene
            this.scene.remove(this.genePointsGroup);
            
            // Dispose of all geometries and materials
            this.genePointsGroup.traverse(object => {
                if (object.geometry) {
                    object.geometry.dispose();
                }
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => material.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            });
            
            // Clear the reference
            this.genePointsGroup = null;
        }
        
        // Reset data structures
        this.originalPoints = [];
        this.lodLevels = {};
        this.currentLODLevel = -1;
        this.loadedGene = null;
        
        // Reset transformation state tracking
        this.transformationState = {
            flipX: store.get('geneFlipX') || false,
            flipY: store.get('geneFlipY') || false,
            swapXY: store.get('geneSwapXY') || false
        };
        
        // Update the store to reflect that no points are being rendered
        store.set('pointsRendered', 0);
    }
    
    /**
     * Get a consistent color for a gene
     * @param {string} geneName - Name of the gene
     * @returns {number} - Color as a hex number
     */
    /**
     * Get color for a gene
     * @param {string} geneName - Name of the gene
     * @returns {number} Color as a hex value
     */
    getGeneColor(geneName) {
        // Simple hash function to generate a color from the gene name
        let hash = 0;
        for (let i = 0; i < geneName.length; i++) {
            hash = geneName.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        // Convert to hex color
        let color = Math.abs(hash) % 0xFFFFFF;
        return color;
    }

    /**
     * Get a consistent color for a gene
     * @param {string} geneName - Name of the gene
     * @returns {number} - Color as a hex number
     */
    getGeneColor(geneName) {
        // Define the color map properly
        
        // If not, use the hash function to generate a color
        let hash = 0;
        for (let i = 0; i < geneName.length; i++) {
            hash = geneName.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        // Convert to hex color
        let color = Math.abs(hash) % 0xFFFFFF;
        return color;
    }
        
    /**
     * Get RGB color components for a gene
     * @param {string} geneName - Name of the gene
     * @returns {Object} RGB color components
     */
    getGeneColorRGB(geneName) {
        const hexColor = this.getGeneColor(geneName);
        return {
            r: ((hexColor >> 16) & 255) / 255,
            g: ((hexColor >> 8) & 255) / 255,
            b: (hexColor & 255) / 255
        };
    }
        
}

/**
 * Generate mock gene data for testing
 * @param {number} numPoints - Number of points to generate
 * @returns {Array} Mock gene data
 */
export function generateMockGeneData(numPoints) {
    const points = [];
    
    for (let i = 0; i < numPoints; i++) {
        points.push({
            x: Math.random() * 10000,
            y: Math.random() * 10000
        });
    }
    
    return points;
}
