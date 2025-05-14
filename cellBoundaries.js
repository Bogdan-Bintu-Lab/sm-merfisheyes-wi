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
        try {
            const status = document.querySelector('#loading-status').querySelector('p');
            status.textContent = 'Loading cell boundaries...';
            
            const response = await fetch(config.dataPaths.getCellBoundariesPath());
            const allBoundaryData = await response.json();
            console.log(allBoundaryData);
            
            // Store original data
            this.originalBoundaries = allBoundaryData;
            
            // Process boundaries in manageable chunks for performance ---
            // Use chunking to avoid UI freezing and memory issues with large datasets
            const chunkSize = 1000;
            // The number of cells is one less than the length of the cellOffsets array
            const totalCells = allBoundaryData.cellOffsets.length - 1; // Last offset is end marker
            
            for (let i = 0; i < totalCells; i += chunkSize) {
                // Determine the end index for this chunk (ensure we don't go out of bounds)
                const endIdx = Math.min(i + chunkSize, totalCells);
                status.textContent = `Processing boundaries ${i} to ${endIdx} of ${totalCells}...`;
                
                // Slice offsets for this chunk, but use the full points array ---
                // Each chunk gets its own cellOffsets slice, but all points are shared
                // The chunkOffsets array must include one extra element to mark the end
                const chunkOffsets = allBoundaryData.cellOffsets.slice(i, endIdx + 1);
                const chunkData = {
                    cellOffsets: chunkOffsets,
                    points: allBoundaryData.points
                };
                
                //  Yield to event loop to keep UI responsive ---
                // This allows the browser to process other events and keep the UI responsive
                await new Promise(resolve => setTimeout(resolve, 0));
                // Process the chunk into boundary objects
                const processedChunk = this.processBoundaryData(chunkData);
                
                //  Accumulate processed boundaries for later use ---
                // Store the processed boundaries in an array for later visualization
                if (!this.processedBoundaries) {
                    this.processedBoundaries = [];
                }
                this.processedBoundaries.push(...processedChunk);
                
                //  Batch visualize this chunk for efficiency ---
                // Create a batched visualization for this chunk to improve performance
                this.createBatchedVisualization(processedChunk);
            }
            
            store.set('cellBoundaries', allBoundaryData);
            store.set('boundariesRendered', this.processedBoundaries.length);
            status.textContent = 'Cell boundary loading complete.';
            
        } catch (error) {
            console.error('Error loading cell boundaries:', error);
            const mockBoundaries = CellBoundaries.generateMockData(20);
            this.processedBoundaries = this.processBoundaryData(mockBoundaries);
            this.createBatchedVisualization(this.processedBoundaries);
        }
    }

    /**
     * Batch renders cell boundaries and (optionally) fills them using efficient BufferGeometry.
     * Each boundary is drawn as a closed polygon with a white outline. If inner coloring is enabled,
     * the polygon is triangulated and filled with the cluster color. Centroid points are added for interaction but hidden.
     * @param {Array} boundaries - Array of processed cell boundary objects
     */
    createBatchedVisualization(boundaries) {
        // Prepare arrays for batched geometry
        const positions = [];
        const colors = [];
        const indices = [];
        let vertexIndex = 0;
        
        // Prepare arrays for inner fill geometry
        const fillPositions = [];
        const fillColors = [];
        const fillIndices = [];
        let fillVertexIndex = 0;
        
        // Iterate over each cell boundary in this chunk
        boundaries.forEach(cell => {
            const boundary = cell.points || cell;
            const cluster = clusterList[cell.clusterId] || 'default';
            const clusterColor = new THREE.Color(palette[cluster] || 0x00ff00);
            
            // Add boundary lines - make sure to close the polygon
            // Loop through each point, connecting to the next and looping back to the first to close the polygon
            for (let i = 0; i < boundary.length; i++) {
                const currentPoint = boundary[i];
                const nextPoint = boundary[(i + 1) % boundary.length]; // Loop back to first point
                
                positions.push(
                    currentPoint.x, currentPoint.y, 0,
                    nextPoint.x, nextPoint.y, 0
                );
                
                // White color for boundary lines
                colors.push(
                    1, 1, 1,  // white
                    1, 1, 1   // white
                );
                
                indices.push(vertexIndex, vertexIndex + 1);
                vertexIndex += 2;
            }
            
            // Add fill if enabled
            const innerColoring = store.get('innerColoring');
            const innerColoringOpacity = store.get('innerColoringOpacity') || 0.2;
            
            if (innerColoring) {
                // Create a shape for triangulation
                const shape = new THREE.Shape();
                shape.moveTo(boundary[0].x, boundary[0].y);
                for (let i = 1; i < boundary.length; i++) {
                    shape.lineTo(boundary[i].x, boundary[i].y);
                }
                shape.lineTo(boundary[0].x, boundary[0].y); // Close the shape
                
                // Get triangulated geometry
                const shapeGeometry = new THREE.ShapeGeometry(shape);
                const shapePositions = shapeGeometry.attributes.position.array;
                const shapeIndices = shapeGeometry.index.array;
                
                // Add positions
                // Add triangulated vertices and color for the fill mesh
                for (let i = 0; i < shapePositions.length; i += 3) {
                    fillPositions.push(
                        shapePositions[i],
                        shapePositions[i + 1],
                        0
                    );
                    fillColors.push(
                        clusterColor.r,
                        clusterColor.g,
                        clusterColor.b
                    );
                }
                
                // Add indices
                // Add indices for the fill mesh triangles
                for (let i = 0; i < shapeIndices.length; i++) {
                    fillIndices.push(fillVertexIndex + shapeIndices[i]);
                }
                fillVertexIndex += shapePositions.length / 3;
                
                // Clean up temporary geometry
                shapeGeometry.dispose(); // Free up memory from temporary geometry
            }
            
            // Add centroid point for raycasting (keep this individual for interaction)
            const centroid = this.calculateCentroid(boundary);
            const point = this.createCentroidPoint(centroid, clusterColor, {
                cluster: cluster,
                id: cell.id,
                clusterId: cell.clusterId
            });
            point.visible = false; // Hide the centroid point but keep for raycasting
            this.boundariesGroup.add(point);
        });
        
        // --- Create batched line geometry for all boundaries in this chunk ---
        const lineGeometry = new THREE.BufferGeometry();
        lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        lineGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        lineGeometry.setIndex(indices);
        
        const lineMaterial = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: store.get('boundaryOpacity') || 1.0
        });
        
        const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
        this.boundariesGroup.add(lines);
        
        // --- Create batched fill geometry for all filled polygons in this chunk ---
        if (fillPositions.length > 0) {
            const fillGeometry = new THREE.BufferGeometry();
            fillGeometry.setAttribute('position', new THREE.Float32BufferAttribute(fillPositions, 3));
            fillGeometry.setAttribute('color', new THREE.Float32BufferAttribute(fillColors, 3));
            fillGeometry.setIndex(fillIndices);
            
            const fillMaterial = new THREE.MeshBasicMaterial({
                vertexColors: true,
                transparent: true,
                opacity: store.get('innerColoringOpacity') || 0.2,
                side: THREE.DoubleSide // Make sure fill is visible from both sides
            });
            
            const fillMesh = new THREE.Mesh(fillGeometry, fillMaterial);
            this.boundariesGroup.add(fillMesh);
        }
    }

    /**
     * Triangulate a polygon using a simple ear clipping algorithm. Used as a fallback or for testing.
     * @param {Array} points - Array of {x, y} points representing a polygon
     * @returns {Array} Array of triangles (each triangle is an array of 3 points)
     */
    triangulatePolygon(points) {
        // Simple ear clipping triangulation
        const triangles = [];
        const vertices = [...points];
        
        while (vertices.length > 3) {
            for (let i = 0; i < vertices.length; i++) {
                const a = vertices[i];
                const b = vertices[(i + 1) % vertices.length];
                const c = vertices[(i + 2) % vertices.length];
                
                if (this.isEar(vertices, a, b, c)) {
                    triangles.push([a, b, c]);
                    vertices.splice((i + 1) % vertices.length, 1);
                    break;
                }
            }
        }
        
        if (vertices.length === 3) {
            triangles.push(vertices);
        }
        
        return triangles;
    }

    /**
     * Checks if the triangle (a, b, c) is an "ear" (i.e., can be clipped off without containing other vertices).
     * @param {Array} vertices - Remaining polygon vertices
     * @param {Object} a - First vertex of triangle
     * @param {Object} b - Second vertex of triangle
     * @param {Object} c - Third vertex of triangle
     * @returns {boolean} True if (a, b, c) is an ear
     */
    isEar(vertices, a, b, c) {
        // Check if triangle abc is an ear
        const triangle = [a, b, c];
        
        // Check if any other vertex is inside this triangle
        for (const v of vertices) {
            if (v === a || v === b || v === c) continue;
            if (this.pointInTriangle(v, triangle)) {
                return false;
            }
        }
        
        return true;
    }

    /**
     * Checks if point p is inside the triangle defined by [a, b, c] using barycentric coordinates.
     * @param {Object} p - Point to test
     * @param {Array} triangle - Array of 3 points [a, b, c]
     * @returns {boolean} True if p is inside the triangle
     */
    pointInTriangle(p, triangle) {
        const [a, b, c] = triangle;
        
        const area = 0.5 * (-b.y * c.x + a.y * (-b.x + c.x) + a.x * (b.y - c.y) + b.x * c.y);
        const s = 1 / (2 * area) * (a.y * c.x - a.x * c.y + (c.y - a.y) * p.x + (a.x - c.x) * p.y);
        const t = 1 / (2 * area) * (a.x * b.y - a.y * b.x + (a.y - b.y) * p.x + (b.x - a.x) * p.y);
        
        return s >= 0 && t >= 0 && (1 - s - t) >= 0;
    }

    /**
     * Process boundary data into a format suitable for visualization
     * @param {Object} boundaryData - Object containing points array and cell offsets
     * @returns {Array} Processed boundary data
     */
    processBoundaryData(boundaryData) {
        const cellBoundaries = [];
        const { points, cellOffsets } = boundaryData;
        
        // Process each cell's boundaries using the offset array
        for (let i = 0; i < cellOffsets.length - 1; i++) {
            const start = cellOffsets[i];
            const end = cellOffsets[i + 1];
            
            // Extract the points for this cell
            const cellPoints = [];
            for (let j = start; j < end; j += 2) {
                cellPoints.push({
                    x: points[j],
                    y: points[j + 1]
                });
            }
            
            // Only add valid cells (must have at least 3 points to form a polygon)
            if (cellPoints.length >= 3) {
                cellBoundaries.push({
                    id: `cell-${i}`,
                    points: cellPoints,
                    clusterId: i
                });
            }
        }
        
        return cellBoundaries;
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
            const boundary = cell.points || cell;
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