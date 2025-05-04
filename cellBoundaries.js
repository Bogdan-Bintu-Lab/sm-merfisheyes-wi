/**
 * CellBoundaries class for loading and managing cell boundary data
 * Handles loading, processing, and level-of-detail for cell boundaries
 */

import * as THREE from 'three';
import { store } from './store.js';
import { config } from './config.js';
import palette from './data/pei/palette.json' assert { type: 'json' };
import clusterList from './data/pei/cluster_list.json' assert { type: 'json' };
import pako from 'pako';

export class CellBoundaries {
    constructor(scene) {
        this.scene = scene;
        this.boundariesGroup = null;
        this.originalBoundaries = null;
        this.processedBoundaries = null;
        this.visibleCellTypes = new Set();
        
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
        store.subscribe('flipX', () => this.updateBoundaries());
        store.subscribe('flipY', () => this.updateBoundaries());
        store.subscribe('swapXY', () => this.updateBoundaries());
        
        // Subscribe to inner coloring changes
        store.subscribe('innerColoring', () => this.updateBoundaries());
        store.subscribe('innerColoringOpacity', () => this.updateBoundaries());
        
        // Subscribe to cell type filter changes
        store.subscribe('visibleCellTypes', () => this.updateBoundaries());
        
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
            document.querySelector('#loading-status').querySelector('p').textContent = 'Loading cell boundaries...';
            console.log('Loading cell boundaries...');
            
            // Fetch boundary data using the config path
            document.querySelector('#loading-status').querySelector('p').textContent = 'Loading cell boundaries...';
            const response = await fetch(config.dataPaths.getCellBoundariesPath());
            const boundaryData = await response.json();
            document.querySelector('#loading-status').querySelector('p').textContent = 'Boundaries loaded. Processing...';
            
            // Store original boundaries
            this.originalBoundaries = boundaryData;
            
            // Process boundaries
            this.processedBoundaries = this.processBoundaryData(boundaryData);
            
            // Create visualization
            this.createBoundaryVisualization();
            
            // Update store
            store.set('cellBoundaries', boundaryData);
            
            console.log(`Loaded cell boundaries with ${this.processedBoundaries.length} cells`);
            document.querySelector('#loading-status').querySelector('p').textContent = 'Cell boundary loading complete.';
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
        // Process the flattened coordinates with offsets
        console.log(boundaryData)
        const cellBoundaries = [];
        const points = boundaryData.points;
        const offsets = boundaryData.cellOffsets;
        
        for (let i = 0; i < offsets.length - 1; i++) {
            const start = offsets[i];
            const end = offsets[i + 1];
            
            // Extract the points for this cell
            const cellPoints = [];
            for (let j = start; j < end; j += 2) {
                cellPoints.push({
                    x: points[j],
                    y: points[j + 1]
                });
            }
            
            cellBoundaries.push({
                id: `cell-${i}`,
                boundary: cellPoints,
                clusterId: i
            });
        }
        
        return cellBoundaries;
    }
    
    /**
     * Create or update the boundary visualization
     */
    createBoundaryVisualization() {
        // Clear previous boundaries if they exist
        while (this.boundariesGroup.children.length > 0) {
            const child = this.boundariesGroup.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (child.material instanceof Array) {
                    child.material.forEach(mat => mat.dispose());
                } else {
                    child.material.dispose();
                }
            }
            this.boundariesGroup.remove(child);
        }
        
        // Make sure visibility is set correctly
        const shouldShow = store.get('showCellBoundaries');
        this.boundariesGroup.visible = shouldShow;
        document.querySelector('#loading-status').querySelector('p').textContent = `Setting boundary group visibility to: ${shouldShow}`;
        console.log('Setting boundary group visibility to:', shouldShow);
        
        // Update boundaries
        this.updateBoundaries();
        document.querySelector('#loading-status').querySelector('p').textContent = `Boundary visibility updated`;
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
        // Create a small sphere geometry for raycasting
        const sphereGeometry = new THREE.SphereGeometry(1.5, 6, 6); // Small sphere with low detail
        const sphereMaterial = new THREE.MeshBasicMaterial({ visible: false });
        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        sphere.position.set(centroid.x, centroid.y, 0);
        
        // Create the visual point
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array([centroid.x, centroid.y, 0]);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const material = new THREE.PointsMaterial({
            color: color,
            size: 5,
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
        
        // Add the sphere as a child for raycasting
        point.add(sphere);
        
        return point;
    }

    /**
     * Initialize cell type selector UI
     */
    initializeCellTypeSelector() {
        const container = document.getElementById('cell-type-checkboxes');
        const clusters = new Set(clusterList);
        
        // Create checkboxes for each cell type
        clusters.forEach(cellType => {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = false;
            checkbox.addEventListener('change', () => this.handleCellTypeChange(cellType, checkbox.checked));
            
            const label = document.createElement('label');
            label.textContent = cellType;
            
            const wrapper = document.createElement('div');
            wrapper.className = 'cell-type-option';
            wrapper.appendChild(checkbox);
            wrapper.appendChild(label);
            container.appendChild(wrapper);
        });

        // Initialize with empty visible cell types
        this.visibleCellTypes.clear();
        store.set('visibleCellTypes', []);
    }

    /**
     * Handle cell type checkbox changes
     * @param {string} cellType - The cell type being toggled
     * @param {boolean} isChecked - Whether the checkbox is checked
     */
    handleCellTypeChange(cellType, isChecked) {
        if (isChecked) {
            this.visibleCellTypes.add(cellType);
        } else {
            this.visibleCellTypes.delete(cellType);
        }
        store.set('visibleCellTypes', Array.from(this.visibleCellTypes));
        document.querySelector('#loading-status').querySelector('p').textContent = `Cell cluster ${cellType} is now ${isChecked ? 'visible' : 'hidden'}`;
    }
    
    /**
     * Update boundaries based on current settings
     */
    updateBoundaries() {
        if (!this.processedBoundaries || !this.boundariesGroup) return;
        document.querySelector('#loading-status').querySelector('p').textContent = 'Updating cell boundary display...';
        // Clear previous boundaries
        while (this.boundariesGroup.children.length > 0) {
            const child = this.boundariesGroup.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (child.material instanceof Array) {
                    child.material.forEach(mat => mat.dispose());
                } else {
                    child.material.dispose();
                }
            }
            this.boundariesGroup.remove(child);
        }

        const subsampleFactor = store.get('boundarySubsample');
        const opacity = store.get('boundaryOpacity');
        const innerColoring = store.get('innerColoring');
        const innerColoringOpacity = store.get('innerColoringOpacity');
        const visibleCellTypes = store.get('visibleCellTypes') || [];

        // Store reusable line material only
        let lineMaterial = null;

        this.processedBoundaries.forEach((cell, index) => {
            const boundary = cell.boundary;
            const cluster = clusterList[index];
            const clusterColor = palette[cluster];
            
            // Skip if no boundary points
            if (!boundary || !boundary.length) return;

            // Skip cell if it's not in the visible cell types
            if (visibleCellTypes.length > 0 && !visibleCellTypes.includes(cluster)) {
                return;
            }

            // Apply boundary-specific coordinate transformations to each point
            const transformedBoundary = boundary.map(point => store.transformBoundaryPoint(point));
            
            // Create geometry for the boundary line
            const lineGeometry = new THREE.BufferGeometry();
            const linePositions = new Float32Array(transformedBoundary.length * 3);
            transformedBoundary.forEach((point, i) => {
                linePositions[i * 3] = point.x;
                linePositions[i * 3 + 1] = point.y;
                linePositions[i * 3 + 2] = 0;
            });

            lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));

            // Reuse line material if possible
            if (!lineMaterial) {
                lineMaterial = new THREE.LineBasicMaterial({
                    color: 0xffffff,
                    transparent: true,
                    opacity: opacity
                });
            } else {
                lineMaterial.color.set(0xffffff);
                lineMaterial.opacity = opacity;
            }

            // Create visible line
            const visibleLine = new THREE.Line(lineGeometry, lineMaterial);
            
            // Add cell type information
            const userData = {
                cellType: cluster,
                cellId: cell.id
            };
            visibleLine.userData = userData;
            
            this.boundariesGroup.add(visibleLine);

            // Add inner coloring if enabled (purely cosmetic)
            if (innerColoring) {
                const fillGeometry = new THREE.ShapeGeometry(
                    new THREE.Shape(transformedBoundary.map(p => new THREE.Vector2(p.x, p.y)))
                );
                
                // Create new material for each cell since colors are different
                const fillMaterial = new THREE.MeshBasicMaterial({
                    color: clusterColor,
                    transparent: true,
                    opacity: innerColoringOpacity
                });
                const fillMesh = new THREE.Mesh(fillGeometry, fillMaterial);
                this.boundariesGroup.add(fillMesh);
            }

            // Add centroid point for raycasting
            const centroid = this.calculateCentroid(boundary);
            const point = this.createCentroidPoint(centroid, clusterColor, {
                cluster: cluster,
                id: cell.id,
                clusterId: cell.clusterId
            });
            
            // Make the centroid invisible but still detectable
            point.material.visible = false;
            point.material.transparent = true;
            point.material.opacity = 0;
            
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