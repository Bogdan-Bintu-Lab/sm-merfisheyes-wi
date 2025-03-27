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
        this.genePointsGroups = {}; // Object to store point groups for each gene
        this.loadedGenes = {}; // Track which genes are loaded
        this.originalPointsData = {}; // Store original points for each gene
        this.lodLevels = {}; // LOD levels for each gene
        this.currentLODLevels = {}; // Track current LOD level for each gene
        
        // Initialize transformation state to track changes
        this.transformationState = {
            flipX: false,
            flipY: false,
            swapXY: false
        };
        
        // Subscribe to store changes for selected genes
        store.subscribe('selectedGenes', (selectedGenes) => {
            if (!selectedGenes) return;
            
            // Process each gene selection change
            Object.entries(selectedGenes).forEach(([geneName, isSelected]) => {
                if (isSelected && !this.loadedGenes[geneName]) {
                    // Load newly selected gene
                    this.loadGeneData(geneName);
                } else if (!isSelected && this.loadedGenes[geneName]) {
                    // Remove deselected gene
                    this.removeGeneData(geneName);
                }
            });
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
     * Remove gene data for a specific gene
     * @param {string} geneName - Name of the gene to remove
     */
    removeGeneData(geneName) {
        if (!this.loadedGenes[geneName]) return;
        
        console.log(`Removing gene data for ${geneName}...`);
        
        // Remove the points group from the scene
        if (this.genePointsGroups[geneName]) {
            this.scene.remove(this.genePointsGroups[geneName]);
            this.genePointsGroups[geneName].clear();
            delete this.genePointsGroups[geneName];
        }
        
        // Clean up other data
        delete this.loadedGenes[geneName];
        delete this.originalPointsData[geneName];
        delete this.lodLevels[geneName];
        delete this.currentLODLevels[geneName];
        
        // Update store data
        const geneData = store.get('geneData') || {};
        delete geneData[geneName];
        store.set('geneData', geneData);
        
        console.log(`Removed gene data for ${geneName}`);
    }
    
    /**
     * Load gene data from gzipped CSV file
     * @param {string} geneName - Name of the gene to load
     */
    async loadGeneData(geneName) {
        try {
            console.log(`Loading gene data for ${geneName}...`);
            
            // If the gene name is empty or null, just return
            if (!geneName) {
                console.log('No gene name provided, skipping');
                return;
            }
            
            // Check if this gene is already loaded
            if (this.loadedGenes[geneName]) {
                console.log(`Gene ${geneName} is already loaded, skipping`);
                return;
            }
        }
        catch (error) {
            console.error('Error during gene data initialization:', error);
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
            
            // Store points for this gene
            this.originalPointsData[geneName] = pointsData;
            this.loadedGenes[geneName] = true;
            
            // Update data bounds to center the camera on all data
            this.updateDataBoundsForAllGenes();
            
            // Create LOD levels for this gene
            this.createLODLevels(geneName, pointsData);
            
            // Create a new group for this gene's points
            this.genePointsGroups[geneName] = new THREE.Group();
            this.scene.add(this.genePointsGroups[geneName]);
            
            // Get gene color from store
            const geneColor = store.get('geneColors')[geneName] || '#ffffff';
            
            // Update store with this gene's data
            const geneData = store.get('geneData') || {};
            geneData[geneName] = pointsData;
            store.set('geneData', geneData);
            
            // Initial LOD update for this gene
            this.updateLOD(geneName, geneColor);
            
            console.log(`Loaded ${pointsData.length} points for gene ${geneName}`);
        } catch (error) {
            console.error(`Error loading gene data for ${geneName}:`, error);
            
            // Generate mock data if loading fails
            console.log('Using mock gene data instead');
            const mockGeneData = generateMockGeneData(5000); // Smaller mock data for multiple genes
            
            // Store mock points for this gene
            this.originalPointsData[geneName] = mockGeneData;
            this.loadedGenes[geneName] = true;
            
            // Update data bounds to center the camera on all data
            this.updateDataBoundsForAllGenes();
            
            // Create LOD levels for this gene
            this.createLODLevels(geneName, mockGeneData);
            
            // Create a new group for this gene's points
            this.genePointsGroups[geneName] = new THREE.Group();
            this.scene.add(this.genePointsGroups[geneName]);
            
            // Get gene color from store
            const geneColor = store.get('geneColors')[geneName] || '#ffffff';
            
            // Update store with this gene's data
            const geneData = store.get('geneData') || {};
            geneData[geneName] = mockGeneData;
            store.set('geneData', geneData);
            
            // Initial LOD update for this gene
            this.updateLOD(geneName, geneColor);
        }
    }
    
    /**
     * Create different levels of detail for the points of a specific gene
     * Optimized for handling millions of points efficiently
     * @param {string} geneName - Name of the gene
     * @param {Array} points - Original point data
     */
    createLODLevels(geneName, points) {
        console.time(`createLODLevels-${geneName}`);
        
        // Initialize LOD levels for this gene if not already initialized
        if (!this.lodLevels[geneName]) {
            this.lodLevels[geneName] = {};
        }
        
        // Only create level 0 with all points (no LOD subsampling)
        this.lodLevels[geneName][0] = points;
        
        console.log(`Created points for ${geneName}: ${points.length} points (no LOD subsampling)`);
        console.timeEnd(`createLODLevels-${geneName}`);
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
     * Update points for all genes or a specific gene
     * Always renders all points without LOD subsampling
     * @param {string} [specificGene] - Optional gene name to update
     * @param {string} [geneColor] - Optional color for the gene points
     */
    updateLOD(specificGene, geneColor) {
        // Always use level 0 (full resolution) for all points
        const lodLevel = 0;
        
        // Get current transformation states
        const currentFlipX = store.get('geneFlipX');
        const currentFlipY = store.get('geneFlipY');
        const currentSwapXY = store.get('geneSwapXY');
        
        // Update transformation state
        this.transformationState.flipX = currentFlipX;
        this.transformationState.flipY = currentFlipY;
        this.transformationState.swapXY = currentSwapXY;
        
        // Determine which genes to update
        const genesToUpdate = specificGene ? [specificGene] : Object.keys(this.loadedGenes);
        let totalPointsRendered = 0;
        
        // Update each gene
        genesToUpdate.forEach(geneName => {
            // Skip if gene data doesn't exist
            if (!this.lodLevels[geneName] || !this.loadedGenes[geneName]) {
                return;
            }
            
            // Get points for this LOD level
            const pointsToRender = this.lodLevels[geneName][lodLevel];
            
            // Safety check - if no points are available for this LOD level, skip this gene
            if (!pointsToRender || pointsToRender.length === 0) {
                console.warn(`No points available for gene ${geneName} at LOD level ${lodLevel}`);
                return;
            }
            
            // Check if we need to update the points
            // Only skip update if LOD level hasn't changed AND this isn't a forced update
            if (this.currentLODLevels[geneName] === lodLevel && 
                this.genePointsGroups[geneName]?.children.length > 0 && 
                !specificGene) {
                // Add the points to the total count even if we're not updating
                totalPointsRendered += pointsToRender.length;
                return; // Skip update for this gene
            }
            
            // Update current LOD level for this gene
            this.currentLODLevels[geneName] = lodLevel;
            
            // Get the color for this gene
            const color = geneColor || store.get('geneColors')[geneName] || '#ffffff';
            
            // Log the update
            console.log(`Updating LOD for gene ${geneName} to level ${lodLevel} with ${pointsToRender.length} points`);
            
            // Clear previous points for this gene
            if (this.genePointsGroups[geneName]) {
                while (this.genePointsGroups[geneName].children.length > 0) {
                    const child = this.genePointsGroups[geneName].children[0];
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) child.material.dispose();
                    this.genePointsGroups[geneName].remove(child);
                }
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
                    // Parse the color string to RGB components
                    const hexColor = color.startsWith('#') ? color.substring(1) : color;
                    const r = parseInt(hexColor.substring(0, 2), 16) / 255;
                    const g = parseInt(hexColor.substring(2, 4), 16) / 255;
                    const b = parseInt(hexColor.substring(4, 6), 16) / 255;
                    
                    colors[idx] = r;
                    colors[idx + 1] = g;
                    colors[idx + 2] = b;
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
            this.genePointsGroups[geneName].add(points);
            
            // Add to total points rendered
            totalPointsRendered += pointsToRender.length;
        });
        
        // Update store with total points rendered
        store.set('pointsRendered', totalPointsRendered);
    }
    
    /**
     * Update point size for all loaded genes
     */
    updatePointSize() {
        const pointSize = store.get('pointSize');
        
        // Update point size for all gene groups
        Object.keys(this.genePointsGroups).forEach(geneName => {
            const geneGroup = this.genePointsGroups[geneName];
            if (!geneGroup) return;
            
            // Direct access to children is faster than traverse for simple hierarchies
            for (let i = 0; i < geneGroup.children.length; i++) {
                const object = geneGroup.children[i];
                if (object instanceof THREE.Points) {
                    object.material.size = pointSize;
                }
            }
        });
    }
    
    /**
     * Clears gene data and disposes of resources
     * @param {string} [geneName] - Optional gene name to clear. If not provided, clears all genes.
     */
    clearGeneData(geneName) {
        if (geneName) {
            console.log(`Clearing data for gene: ${geneName}`);
            
            // Remove points for this gene if they exist
            if (this.genePointsGroups[geneName]) {
                // Remove from scene
                this.scene.remove(this.genePointsGroups[geneName]);
                
                // Dispose of all geometries and materials
                this.genePointsGroups[geneName].traverse(object => {
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
                
                // Delete the reference
                delete this.genePointsGroups[geneName];
            }
            
            // Clean up data structures for this gene
            delete this.originalPointsData[geneName];
            delete this.lodLevels[geneName];
            delete this.currentLODLevels[geneName];
            delete this.loadedGenes[geneName];
            
            // Update the gene data in the store
            const geneData = store.get('geneData') || {};
            delete geneData[geneName];
            store.set('geneData', geneData);
            
            // Recalculate total points rendered
            this.updateTotalPointsRendered();
        } else {
            console.log('Clearing all gene data');
            
            // Remove all gene points groups
            Object.keys(this.genePointsGroups).forEach(gene => {
                if (this.genePointsGroups[gene]) {
                    // Remove from scene
                    this.scene.remove(this.genePointsGroups[gene]);
                    
                    // Dispose of all geometries and materials
                    this.genePointsGroups[gene].traverse(object => {
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
                }
            });
            
            // Reset all data structures
            this.genePointsGroups = {};
            this.originalPointsData = {};
            this.lodLevels = {};
            this.currentLODLevels = {};
            this.loadedGenes = {};
            
            // Reset transformation state tracking
            this.transformationState = {
                flipX: store.get('geneFlipX') || false,
                flipY: store.get('geneFlipY') || false,
                swapXY: store.get('geneSwapXY') || false
            };
            
            // Clear gene data in store
            store.set('geneData', {});
            
            // Update the store to reflect that no points are being rendered
            store.set('pointsRendered', 0);
        }
    }
    
    /**
     * Alias for clearGeneData() for backward compatibility
     */
    clearPreviousGeneData() {
        this.clearGeneData();
    }
    
    /**
     * Removes data for a specific gene
     * @param {string} geneName - Name of the gene to remove
     */
    removeGeneData(geneName) {
        console.log(`Removing gene data for ${geneName}`);
        
        // Clear the gene data
        this.clearGeneData(geneName);
        
        // Update the selected genes in the store
        const selectedGenes = store.get('selectedGenes') || {};
        if (selectedGenes[geneName]) {
            selectedGenes[geneName] = false;
            store.set('selectedGenes', selectedGenes);
        }
    }
    
    /**
     * Updates data bounds based on all loaded genes
     * This ensures the camera is centered on all visible gene data
     */
    updateDataBoundsForAllGenes() {
        // Skip if no genes are loaded
        if (Object.keys(this.loadedGenes).length === 0) {
            return;
        }
        
        // Initialize bounds with extreme values
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        
        // Calculate bounds across all loaded genes
        Object.keys(this.loadedGenes).forEach(geneName => {
            if (!this.loadedGenes[geneName] || !this.originalPointsData[geneName]) {
                return;
            }
            
            const points = this.originalPointsData[geneName];
            
            // Find min/max for this gene
            for (let i = 0; i < points.length; i++) {
                const point = points[i];
                minX = Math.min(minX, point.x);
                maxX = Math.max(maxX, point.x);
                minY = Math.min(minY, point.y);
                maxY = Math.max(maxY, point.y);
            }
        });
        
        // Only update if we found valid bounds
        if (minX !== Infinity && maxX !== -Infinity && minY !== Infinity && maxY !== -Infinity) {
            // Update store with new bounds
            store.set('dataBounds', { minX, maxX, minY, maxY });
            
            // Call external function to update camera and controls
            updateDataBounds();
        }
    }
    
    /**
     * Recalculates and updates the total number of points being rendered
     */
    updateTotalPointsRendered() {
        let totalPoints = 0;
        
        // Sum up points from all loaded genes
        Object.keys(this.loadedGenes).forEach(geneName => {
            if (this.loadedGenes[geneName] && this.currentLODLevels[geneName] !== undefined) {
                const lodLevel = this.currentLODLevels[geneName];
                if (this.lodLevels[geneName] && this.lodLevels[geneName][lodLevel]) {
                    totalPoints += this.lodLevels[geneName][lodLevel].length;
                }
            }
        });
        
        // Update store with total points rendered
        store.set('pointsRendered', totalPoints);
    }
    
    /**
     * Get color for a gene
     * @param {string} geneName - Name of the gene
     * @returns {string} Color as a hex string (e.g. '#ff0000')
     */
    getGeneColor(geneName) {
        // First check if there's a color defined in the store
        const geneColors = store.get('geneColors') || {};
        if (geneColors[geneName]) {
            return geneColors[geneName];
        }
        
        // If not, use the hash function to generate a color
        let hash = 0;
        for (let i = 0; i < geneName.length; i++) {
            hash = geneName.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        // Convert to hex color
        const hexColor = Math.abs(hash) % 0xFFFFFF;
        return `#${hexColor.toString(16).padStart(6, '0')}`;
    }
        
    /**
     * Get RGB color components for a gene
     * @param {string} geneName - Name of the gene
     * @returns {Object} RGB color components (values from 0-1)
     */
    getGeneColorRGB(geneName) {
        const color = this.getGeneColor(geneName);
        const hexColor = color.startsWith('#') ? color.substring(1) : color;
        
        return {
            r: parseInt(hexColor.substring(0, 2), 16) / 255,
            g: parseInt(hexColor.substring(2, 4), 16) / 255,
            b: parseInt(hexColor.substring(4, 6), 16) / 255
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
