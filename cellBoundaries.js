/**
 * CellBoundaries class for loading and managing cell boundary data
 * Handles loading, processing, and level-of-detail for cell boundaries
 */

import * as THREE from 'three';
import { store } from './store.js';

export class CellBoundaries {
    constructor(scene) {
        this.scene = scene;
        this.boundariesGroup = null;
        this.originalBoundaries = null;
        this.processedBoundaries = null;
        
        // Subscribe to store changes
        store.subscribe('showCellBoundaries', (visible) => {
            if (this.boundariesGroup) {
                this.boundariesGroup.visible = visible;
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
        try {
            console.log('Loading cell boundaries...');
            
            // Fetch boundary data
            const response = await fetch('cell_boundaries/cell_boundaries.json');
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
        // Remove previous boundaries if they exist
        if (this.boundariesGroup) {
            this.scene.remove(this.boundariesGroup);
            this.boundariesGroup.traverse(object => {
                if (object.geometry) object.geometry.dispose();
                if (object.material) object.material.dispose();
            });
        }
        
        // Create new group for boundaries
        this.boundariesGroup = new THREE.Group();
        this.scene.add(this.boundariesGroup);
        
        // Set visibility based on store
        this.boundariesGroup.visible = store.get('showCellBoundaries');
        
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
        
        // Create line segments for each cell boundary
        this.processedBoundaries.forEach(cell => {
            const boundary = cell.boundary;
            
            // Skip if no boundary points
            if (!boundary || !boundary.length) return;
            
            // Subsample boundary points
            const subsampledBoundary = this.subsampleBoundary(boundary, subsampleFactor);
            totalPoints += subsampledBoundary.length;
            
            // Apply boundary-specific coordinate transformations to each point
            const transformedBoundary = subsampledBoundary.map(point => store.transformBoundaryPoint(point));
            
            // Create line geometry
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(transformedBoundary.length * 3);
            
            transformedBoundary.forEach((point, i) => {
                positions[i * 3] = point.x;
                positions[i * 3 + 1] = point.y;
                positions[i * 3 + 2] = 0; // Z-coordinate is 0 for 2D visualization
            });
            
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            
            // Create visible line material
            const visibleMaterial = new THREE.LineBasicMaterial({
                color: 0x0000ff,
                transparent: true,
                opacity: opacity
            });

            // Create invisible line material for better hover detection
            const hitAreaMaterial = new THREE.LineBasicMaterial({
                visible: false,
                transparent: true,
                opacity: 0
            });

            // Create visible line
            const visibleLine = new THREE.Line(geometry, visibleMaterial);
            
            // Create invisible line with wider geometry for hit detection
            const hitGeometry = new THREE.BufferGeometry();
            const expandedPositions = new Float32Array(positions.length);
            
            // Create slightly offset positions for a wider hit area
            for (let i = 0; i < positions.length; i += 3) {
                expandedPositions[i] = positions[i] + 0.0005;
                expandedPositions[i + 1] = positions[i + 1] + 0.0005;
                expandedPositions[i + 2] = positions[i + 2];
            }
            hitGeometry.setAttribute('position', new THREE.BufferAttribute(expandedPositions, 3));
            const hitLine = new THREE.Line(hitGeometry, hitAreaMaterial);

            // Add cell type information to both lines
            const userData = {
                cellType: 'Neuron',  // This will be replaced with actual cell type data
                cellSubtype: 'Type ' + (Math.floor(Math.random() * 3) + 1),  // Mock subtype for now
                cellId: cell.id
            };
            visibleLine.userData = userData;
            hitLine.userData = userData;
            
            // Add both lines to the group
            this.boundariesGroup.add(visibleLine);
            this.boundariesGroup.add(hitLine);
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
