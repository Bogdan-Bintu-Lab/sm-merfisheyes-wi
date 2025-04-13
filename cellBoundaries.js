/**
 * CellBoundaries class for loading and managing cell boundary data
 * Handles loading, processing, and level-of-detail for cell boundaries
 */

import * as THREE from 'three';
import { store } from './store.js';
import { config } from './config.js';
import palette from './data/pei/palette.json' assert { type: 'json' };
import clusterList from './data/pei/cluster_list.json' assert { type: 'json' };

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
        store.subscribe('showCellBoundaries', () => this.updateBoundaries());
        store.subscribe('boundaryOpacity', () => this.updateBoundaryOpacity(store.get('boundaryOpacity')));
        store.subscribe('boundarySubsample', () => this.updateBoundaries());
        
        // Subscribe to cell boundary coordinate transformation changes
        store.subscribe('boundaryFlipX', () => this.updateBoundaries());
        store.subscribe('boundaryFlipY', () => this.updateBoundaries());
        store.subscribe('boundarySwapXY', () => this.updateBoundaries());
        
        // Subscribe to inner coloring changes
        store.subscribe('innerColoring', () => this.updateBoundaries());
        store.subscribe('innerColoringOpacity', () => this.updateBoundaries());
        
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
                boundary: cellPoints,
                clusterId: index
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
     * Calculate centroid of a polygon
     * @param {Array} points - Array of points [{x, y}]
     * @returns {Object} Centroid point {x, y}
     */
    calculateCentroid(points) {
        let centerX = 0;
        let centerY = 0;
        
        // Calculate average of all points
        points.forEach(point => {
            centerX += point.x;
            centerY += point.y;
        });
        
        centerX /= points.length;
        centerY /= points.length;
        
        return { x: centerX, y: centerY };
    }

    /**
     * Create a point at the centroid position
     * @param {Object} centroid - Centroid position {x, y}
     * @param {string} color - Color for the point
     * @param {Object} cellData - Cell data for userData
     * @returns {THREE.Points} Point object
     */
    createCentroidPoint(centroid, color, cellData) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array([centroid.x, centroid.y, 0]);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const material = new THREE.PointsMaterial({
            color: color,
            size: 3,
            transparent: true,
            opacity: 1.0
        });
        
        const point = new THREE.Points(geometry, material);
        
        // Add cell data to userData
        point.userData = {
            cellType: cellData.cluster || 'Unknown',
            cellId: cellData.id,
            clusterId: cellData.clusterId
        };
        
        return point;
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
        const innerColoring = store.get('innerColoring');
        const innerColoringOpacity = store.get('innerColoringOpacity');

        this.processedBoundaries.forEach((cell, index) => {
            const boundary = cell.boundary;
            const cluster = clusterList[index];
            const clusterColor = palette[cluster];
            // Skip if no boundary points
            if (!boundary || !boundary.length) return;
            
            // Calculate centroid
            const centroid = this.calculateCentroid(boundary);
            
            // Create and add centroid point with cell data
            const point = this.createCentroidPoint(centroid, clusterColor, {
                cluster: cluster,
                id: cell.id,
                clusterId: cell.clusterId
            });
            this.boundariesGroup.add(point);
        });
        
        // Update store with boundaries rendered
        store.set('boundariesRendered', this.processedBoundaries.length);
    }
    
    /**
     * Update boundary opacity
     * @param {number} opacity - New opacity value
     */
    updateBoundaryOpacity(opacity) {
        if (!this.boundariesGroup) return;
        
        this.boundariesGroup.traverse(object => {
            if (object instanceof THREE.Points) {
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