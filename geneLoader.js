/**
 * GeneLoader class for loading and managing gene data
 * Handles loading, processing, and level-of-detail for gene data points
 */

import * as THREE from 'three';
import { store } from './store.js';
import { updateDataBounds } from './main.js';

export class GeneLoader {
    constructor(scene) {
        this.scene = scene;
        this.genePointsGroup = null;
        this.loadedGene = null;
        this.originalPoints = null;
        this.lodLevels = {};
        
        // Subscribe to store changes
        store.subscribe('currentGene', (geneName) => {
            if (geneName && geneName !== this.loadedGene) {
                this.loadGeneData(geneName);
            }
        });
        
        store.subscribe('pointSize', () => this.updatePointSize());
        store.subscribe('cameraDistance', () => this.updateLOD());
        store.subscribe('lodThreshold', () => this.updateLOD());
        
        // Subscribe to gene coordinate transformation changes
        store.subscribe('geneFlipX', () => this.updateLOD());
        store.subscribe('geneFlipY', () => this.updateLOD());
        store.subscribe('geneSwapXY', () => this.updateLOD());
    }
    
    /**
     * Load gene data from JSON file
     * @param {string} geneName - Name of the gene to load
     */
    async loadGeneData(geneName) {
        try {
            // Remove previous points if they exist
            if (this.genePointsGroup) {
                this.scene.remove(this.genePointsGroup);
                this.genePointsGroup.traverse(object => {
                    if (object.geometry) object.geometry.dispose();
                    if (object.material) object.material.dispose();
                });
            }
            
            console.log(`Loading gene data for ${geneName}...`);
            
            // Fetch gene data
            const response = await fetch(`genes/${geneName}_coords.json`);
            if (!response.ok) {
                throw new Error(`Failed to load gene data for ${geneName}: ${response.status} ${response.statusText}`);
            }
            
            const pointsData = await response.json();
            
            // Store original points
            this.originalPoints = pointsData;
            this.loadedGene = geneName;
            
            // Update data bounds to center the camera on the data
            updateDataBounds(pointsData);
            
            // Create LOD levels
            this.createLODLevels(pointsData);
            
            // Create initial visualization
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
            
            // Create initial visualization
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
     * @param {Array} points - Original point data
     */
    createLODLevels(points) {
        // Reset LOD levels
        this.lodLevels = {};
        
        // Create different LOD levels by subsampling
        // Level 0: Full resolution (all points)
        this.lodLevels[0] = points;
        
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
        
        console.log('Created LOD levels:', Object.keys(this.lodLevels).map(key => 
            `Level ${key}: ${this.lodLevels[key].length} points`
        ).join(', '));
    }
    
    /**
     * Subsample points by taking every nth point
     * @param {Array} points - Original point data
     * @param {number} n - Take every nth point
     * @returns {Array} Subsampled points
     */
    subsamplePoints(points, n) {
        return points.filter((_, index) => index % n === 0);
    }
    
    /**
     * Update the level of detail based on camera distance
     */
    updateLOD() {
        if (!this.originalPoints || !this.genePointsGroup) return;
        
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
        const positions = new Float32Array(pointsToRender.length * 3);
        
        pointsToRender.forEach((point, i) => {
            // Apply gene-specific coordinate transformations
            const transformedPoint = store.transformGenePoint(point);
            
            positions[i * 3] = transformedPoint.x;
            positions[i * 3 + 1] = transformedPoint.y;
            positions[i * 3 + 2] = 0; // Z-coordinate is 0 for 2D visualization
        });
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const material = new THREE.PointsMaterial({
            color: this.getGeneColor(this.loadedGene),
            size: pointSize,
            sizeAttenuation: true
        });
        
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
        
        this.genePointsGroup.traverse(object => {
            if (object instanceof THREE.Points) {
                object.material.size = pointSize;
            }
        });
    }
    
    /**
     * Get a consistent color for a gene
     * @param {string} geneName - Name of the gene
     * @returns {number} - Color as a hex number
     */
    getGeneColor(geneName) {
        // Map gene names to specific colors
        const colorMap = {
            'Gad1': 0xff0000,      // Red
            'Itgax': 0x00ff00,     // Green
            'Slc17a7': 0x0000ff,   // Blue
            'Tmem119': 0xffff00,   // Yellow
            'Trem2': 0xff00ff      // Magenta
        };
        
        return colorMap[geneName] || 0xffffff; // Default to white
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
