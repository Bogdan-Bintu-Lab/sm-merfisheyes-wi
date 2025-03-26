/**
 * CellBoundaries class for loading and managing cell boundary data
 * Handles loading, processing, and level-of-detail for cell boundaries
 */

import * as THREE from 'three';
import { store } from './store.js';
import { config } from './config.js';

export class CellBoundaries {
    constructor(scene) {
        this.scene = scene;
        this.boundariesGroup = null;
        this.originalBoundaries = null;
        this.processedBoundaries = null;
        
        // Create a boundaries group immediately
        this.boundariesGroup = new THREE.Group();
        
        // Set initial visibility based on store value
        const initialVisibility = store.get('showCellBoundaries');
        this.boundariesGroup.visible = initialVisibility;
        console.log('Initial cell boundaries visibility:', initialVisibility);
        
        // Add to scene
        this.scene.add(this.boundariesGroup);
        
        // Subscribe to store changes
        store.subscribe('showCellBoundaries', (visible) => {
            console.log('showCellBoundaries changed to:', visible);
            if (this.boundariesGroup) {
                this.boundariesGroup.visible = visible;
                // Force a render to update the display
                store.set('forceRender', !store.get('forceRender'));
            }
        });
        
        store.subscribe('boundaryOpacity', (opacity) => {
            this.updateBoundaryOpacity(opacity);
        });
        
        store.subscribe('boundarySubsample', () => {
            this.updateBoundaries();
        });
        
        // Subscribe to cell boundary coordinate transformation changes
        store.subscribe('boundaryFlipX', () => this.updateBoundaries());
        store.subscribe('boundaryFlipY', () => this.updateBoundaries());
        store.subscribe('boundarySwapXY', () => this.updateBoundaries());
        
        // Load boundaries on initialization
        this.loadBoundaries();
    }
    
    /**
     * Load cell boundary data from JSON file
     */
    async loadBoundaries() {
        // Set initial visibility based on store value before loading
        const shouldShowBoundaries = store.get('showCellBoundaries');
        console.log('Loading boundaries with visibility:', shouldShowBoundaries);
        try {
            console.log('Loading cell boundaries...');
            
            // Fetch boundary data using the config path
            const response = await fetch(config.dataPaths.getCellBoundariesPath());
            const boundaryData = await response.json();
            
            // Store original boundaries
            this.originalBoundaries = boundaryData;
            
            // Process boundaries
            this.processedBoundaries = this.processBoundaryData(boundaryData);
            
            // Create visualization
            this.createBoundaryVisualization();
            
            // Update store
            store.set('cellBoundaries', boundaryData);
            
            console.log(`Loaded cell boundaries with ${this.processedBoundaries.length} cells`);
        } catch (error) {
            console.error('Error loading cell boundaries:', error);
            // Use mock data if loading fails
            const mockBoundaries = CellBoundaries.generateMockData(20);
            this.originalBoundaries = mockBoundaries;
            this.processedBoundaries = this.processBoundaryData(mockBoundaries);
            this.createBoundaryVisualization();
            console.log('Using mock cell boundary data instead');
        }
    }
    
    /**
     * Process boundary data into a format suitable for visualization
     * @param {Array} boundaryData - Original boundary data
     * @returns {Array} Processed boundary data
     */
    processBoundaryData(boundaryData) {
        // Based on the observed structure, the cell_boundaries.json file contains an array of arrays,
        // where each inner array represents a cell boundary as a list of points
        return boundaryData.map((cellPoints, index) => {
            return {
                id: `cell-${index}`,
                boundary: cellPoints
            };
        });
    }
    
    /**
     * Create or update the boundary visualization
     */
    createBoundaryVisualization() {
        // Clear previous boundaries if they exist
        while (this.boundariesGroup.children.length > 0) {
            const child = this.boundariesGroup.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            this.boundariesGroup.remove(child);
        }
        
        // Make sure visibility is set correctly
        const shouldShow = store.get('showCellBoundaries');
        this.boundariesGroup.visible = shouldShow;
        console.log('Setting boundary group visibility to:', shouldShow);
        
        // Update boundaries
        this.updateBoundaries();
    }
    
    /**
     * Update boundaries based on current settings
     */
    updateBoundaries() {
        if (!this.processedBoundaries || !this.boundariesGroup) return;
        
        // Clear previous boundaries
        while (this.boundariesGroup.children.length > 0) {
            const child = this.boundariesGroup.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            this.boundariesGroup.remove(child);
        }
        
        const subsampleFactor = store.get('boundarySubsample');
        const opacity = store.get('boundaryOpacity');
        let totalPoints = 0;
        
        // Create line segments and optionally fill polygons
        this.processedBoundaries.forEach(cell => {
            const boundary = cell.boundary;
            
            // Skip if no boundary points
            if (!boundary || !boundary.length) return;
            
            // Subsample boundary points
            const subsampledBoundary = this.subsampleBoundary(boundary, subsampleFactor);
            totalPoints += subsampledBoundary.length;
            
            // Apply boundary-specific coordinate transformations to each point
            const transformedBoundary = subsampledBoundary.map(point => store.transformBoundaryPoint(point));
            
            // Create geometry for the boundary line
            const lineGeometry = new THREE.BufferGeometry();
            const linePositions = new Float32Array(transformedBoundary.length * 3);
            transformedBoundary.forEach((point, i) => {
                linePositions[i * 3] = point.x;
                linePositions[i * 3 + 1] = point.y;
                linePositions[i * 3 + 2] = 0;
            });
            lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));

            // Create line material
            const lineMaterial = new THREE.LineBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: store.get('boundaryOpacity')
            });

            // Create line and add to group
            const line = new THREE.Line(lineGeometry, lineMaterial);
            this.boundariesGroup.add(line);

            // Add inner coloring if enabled
            if (store.get('innerColoring')) {
                console.log("Inner coloring enabled");
                const fillGeometry = new THREE.ShapeGeometry(
                    new THREE.Shape(transformedBoundary.map(p => new THREE.Vector2(p.x, p.y)))
                );
                const fillMaterial = new THREE.MeshBasicMaterial({
                    color: 0x00ff00, // Green color
                    transparent: false,
                });
                const fillMesh = new THREE.Mesh(fillGeometry, fillMaterial);
                this.boundariesGroup.add(fillMesh);
            }
        });
        
        // Update store with boundaries rendered
        store.set('boundariesRendered', totalPoints);
    }
    
    /**
     * Subsample boundary points to improve performance
     * @param {Array} boundary - Array of boundary points
     * @param {number} factor - Subsample factor (take every nth point)
     * @returns {Array} Subsampled boundary points
     */
    subsampleBoundary(boundary, factor) {
        // Ensure we always include the first and last points to close the boundary
        if (factor <= 1) return boundary;
        
        const result = [];
        for (let i = 0; i < boundary.length; i += factor) {
            result.push(boundary[i]);
        }
        
        // Ensure the boundary is closed by adding the first point again if needed
        if (result.length > 1 && 
            (result[0].x !== result[result.length - 1].x || 
             result[0].y !== result[result.length - 1].y)) {
            result.push(result[0]);
        }
        
        return result;
    }
    
    /**
     * Update boundary opacity
     * @param {number} opacity - New opacity value
     */
    updateBoundaryOpacity(opacity) {
        if (!this.boundariesGroup) return;
        
        this.boundariesGroup.traverse(object => {
            if (object instanceof THREE.Line) {
                object.material.opacity = opacity;
            }
        });
    }
    
    /**
     * Generate mock cell boundary data for testing
     * @param {number} numCells - Number of cells to generate
     * @returns {Array} Mock cell boundary data
     */
    static generateMockData(numCells = 10) {
        // Generate mock data in the same format as the real data
        // An array of arrays, where each inner array contains points
        const mockData = [];
        
        for (let i = 0; i < numCells; i++) {
            // Generate a random polygon with 5-15 points
            const numPoints = 5 + Math.floor(Math.random() * 10);
            const centerX = Math.random() * 10000;
            const centerY = Math.random() * 10000;
            const radius = 500 + Math.random() * 1000;
            
            const boundary = [];
            
            for (let j = 0; j < numPoints; j++) {
                const angle = (j / numPoints) * Math.PI * 2;
                // Add some randomness to the radius for more natural shapes
                const r = radius * (0.8 + Math.random() * 0.4);
                
                boundary.push({
                    x: centerX + Math.cos(angle) * r,
                    y: centerY + Math.sin(angle) * r
                });
            }
            
            // Close the polygon
            boundary.push({...boundary[0]});
            
            mockData.push(boundary);
        }
        
        return mockData;
    }
}