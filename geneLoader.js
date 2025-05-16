/**
 * GeneLoader class for loading and managing gene data
 * Handles loading, processing, and level-of-detail for gene data points
 * Optimized for rendering up to 8 million points efficiently
 * Now supports multi-layer gene data
 */

import * as THREE from 'three';
import { store } from './src/store.js';
import { updateDataBounds } from './src/main.js';
import pako from 'pako';
import { config } from './src/config.js';

export class GeneLoader {
    constructor(scene) {
        this.scene = scene;
        this.genePointsGroups = {}; // Object to store point groups for each gene
        this.loadedGenes = {}; // Track which genes are loaded
        this.originalPointsData = {}; // Store original points for each gene and layer
        this.lodLevels = {}; // LOD levels for each gene and layer
        this.currentLODLevels = {}; // Track current LOD level for each gene
        
        // Initialize transformation state to track changes
        this.transformationState = {
            flipX: false,
            flipY: false,
            swapXY: false
        };
        
        // Subscribe to store changes for selected genes
        store.subscribe('selectedGenes', (selectedGenes) => {
            console.log('Selected genes changed:', selectedGenes);
            
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
        
        // Subscribe to z-stack changes
        store.subscribe('zstack', () => {
            this.updateVisibleLayers();
        });
        
        store.subscribe('pointSize', () => this.updatePointSize());
        
        // Use debounced update for camera distance to avoid too frequent updates
        // let lodUpdateTimeout;
        // store.subscribe('cameraDistance', () => {
        //     clearTimeout(lodUpdateTimeout);
        //     lodUpdateTimeout = setTimeout(() => this.updateLOD(), 100);
        // });
        
        // Subscribe to intensity settings changes
        // store.subscribe('useIntensityColor', () => this.updateLOD());
        // store.subscribe('intensityMin', () => this.updateLOD());
        // store.subscribe('intensityMax', () => this.updateLOD());
        
        // Subscribe to gene customization changes
        store.subscribe('geneCustomizations', (customizations) => {
            console.log('Gene customizations changed, updating all layers');
            this.updateAllLayersForCustomizedGenes(customizations);
        });
        
        // Subscribe to gene color changes with debouncing
        let geneColorsUpdateTimeout;
        store.subscribe('geneColors', (colors) => {
            // Clear any pending updates
            clearTimeout(geneColorsUpdateTimeout);
            
            // Set a timeout to update colors after a delay
            geneColorsUpdateTimeout = setTimeout(() => {
                console.log('Gene colors changed, updating all layers (debounced)');
                this.updateAllLayersForColorChanges(colors);
            }, 300); // 300ms delay to batch updates
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
            // Remove all layer groups
            Object.keys(this.genePointsGroups[geneName]).forEach(layer => {
                this.scene.remove(this.genePointsGroups[geneName][layer]);
                this.genePointsGroups[geneName][layer].clear();
            });
            
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
     * Load gene data from gzipped JSON file
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
            
            // Fetch gzipped JSON data using the config path
            const response = await fetch(config.dataPaths.getGeneDataPath(geneName));
            if (!response.ok) {
                throw new Error(`Failed to load gene data for ${geneName}: ${response.status} ${response.statusText}`);
            }
            
            // Get the compressed data as an ArrayBuffer
            const compressedData = await response.arrayBuffer();
            
            // Decompress the data
            let jsonData;
            try {
                // Try to decompress with pako
                const decompressedData = pako.inflate(new Uint8Array(compressedData));
                const jsonText = new TextDecoder().decode(decompressedData);
                
                // Check if the response looks like HTML (indicating an error page)
                if (jsonText.trim().startsWith('<!DOCTYPE') || jsonText.trim().startsWith('<html')) {
                    console.error(`Received HTML instead of JSON for ${geneName}. URL: ${config.dataPaths.getGeneDataPath(geneName)}`);
                    console.log('First 200 characters of response:', jsonText.substring(0, 200));
                    throw new Error('Received HTML instead of JSON data');
                }
                
                jsonData = JSON.parse(jsonText);
            } catch (error) {
                console.warn(`Failed to decompress with pako, trying as regular JSON: ${error}`);
                // If decompression fails, try parsing as regular JSON
                const jsonText = new TextDecoder().decode(new Uint8Array(compressedData));
                
                // Check if the response looks like HTML (indicating an error page)
                if (jsonText.trim().startsWith('<!DOCTYPE') || jsonText.trim().startsWith('<html')) {
                    console.error(`Received HTML instead of JSON for ${geneName}. URL: ${config.dataPaths.getGeneDataPath(geneName)}`);
                    console.log('First 200 characters of response:', jsonText.substring(0, 200));
                    throw new Error('Received HTML instead of JSON data');
                }
                
                jsonData = JSON.parse(jsonText);
            }
            
            // Process the data - convert from optimized format to point objects
            const processedData = {};
            
            // Process each layer
            Object.entries(jsonData.layers).forEach(([layer, coordinates]) => {
                const points = [];
                // Convert flat array to point objects
                for (let i = 0; i < coordinates.length; i += 2) {
                    points.push({
                        x: coordinates[i],
                        y: coordinates[i + 1]
                    });
                }
                processedData[layer] = points;
            });
            
            // Store points for this gene
            this.originalPointsData[geneName] = processedData;
            this.loadedGenes[geneName] = true;
            
            // Update data bounds to center the camera on all data
            this.updateDataBoundsForAllGenes();
            
            // Create LOD levels for this gene (for each layer)
            Object.keys(processedData).forEach(layer => {
                this.createLODLevels(geneName, layer, processedData[layer]);
            });
            
            // Initialize the gene points groups structure
            this.genePointsGroups[geneName] = {};
            
            // Get gene color from store
            const geneColor = store.get('geneColors')[geneName] || '#ffffff';
            
            // Update store with this gene's data
            const geneData = store.get('geneData') || {};
            geneData[geneName] = processedData;
            store.set('geneData', geneData);
            
            // Get current z-stack
            const currentZstack = store.get('zstack').toString();
            
            // Only create points for current z-stack initially
            this.updateLOD(geneName, geneColor, currentZstack);
            
            // Update visible layers
            this.updateVisibleLayers();
            
            console.log(`Loaded gene ${geneName} with layers: ${Object.keys(processedData).join(', ')}`);
        } catch (error) {
            console.error(`Error loading gene data for ${geneName}:`, error);
            
            // Generate mock data if loading fails
            console.log('Using mock gene data instead');
            
            // Create mock data for multiple layers
            const mockData = {};
            const currentZstack = store.get('zstack').toString();
            
            // Create mock data for layers around the current z-stack
            for (let layer = Math.max(0, parseInt(currentZstack) - 2); 
                 layer <= Math.min(59, parseInt(currentZstack) + 2); 
                 layer++) {
                mockData[layer.toString()] = generateMockGeneData(1000); // Smaller mock data for multiple layers
            }
            
            // Store mock points for this gene
            this.originalPointsData[geneName] = mockData;
            this.loadedGenes[geneName] = true;
            
            // Update data bounds to center the camera on all data
            this.updateDataBoundsForAllGenes();
            
            // Create LOD levels for this gene (for each layer)
            Object.keys(mockData).forEach(layer => {
                this.createLODLevels(geneName, layer, mockData[layer]);
            });
            
            // Initialize the gene points groups structure
            this.genePointsGroups[geneName] = {};
            
            // Get gene color from store
            const geneColor = store.get('geneColors')[geneName] || '#ffffff';
            
            // Update store with this gene's data
            const geneData = store.get('geneData') || {};
            geneData[geneName] = mockData;
            store.set('geneData', geneData);
            
            // Initial LOD update for this gene
            this.updateLOD(geneName, geneColor);
            
            // Update visible layers based on current z-stack
            this.updateVisibleLayers();
        }
    }
    
    /**
     * Create different levels of detail for the points of a specific gene and layer
     * @param {string} geneName - Name of the gene
     * @param {string} layer - Layer identifier
     * @param {Array} points - Original point data for this layer
     */
    createLODLevels(geneName, layer, points) {
        console.time(`createLODLevels-${geneName}-${layer}`);
        
        // Initialize LOD levels for this gene if not already initialized
        if (!this.lodLevels[geneName]) {
            this.lodLevels[geneName] = {};
        }
        
        // Initialize LOD levels for this layer if not already initialized
        if (!this.lodLevels[geneName][layer]) {
            this.lodLevels[geneName][layer] = {};
        }
        
        // Only create level 0 with all points (no LOD subsampling)
        this.lodLevels[geneName][layer][0] = points;
        
        console.log(`Created points for ${geneName} layer ${layer}: ${points.length} points (no LOD subsampling)`);
        console.timeEnd(`createLODLevels-${geneName}-${layer}`);
    }
    
    /**
     * Update which layers are visible based on the current z-stack
     */
    updateVisibleLayers() {
        const currentZstack = store.get('zstack').toString();
        console.log(`Updating visible layers for z-stack ${currentZstack}`);
        
        // For each loaded gene
        Object.keys(this.loadedGenes).forEach(geneName => {
            if (!this.loadedGenes[geneName]) return;
            
            // Skip if gene points groups not initialized
            if (!this.genePointsGroups[geneName]) {
                // Initialize the gene points groups structure if needed
                this.genePointsGroups[geneName] = {};
            }
            
            // First, hide all layers for this gene
            Object.keys(this.genePointsGroups[geneName]).forEach(layer => {
                if (this.genePointsGroups[geneName][layer]) {
                    this.genePointsGroups[geneName][layer].visible = false;
                }
            });
            
            // Check if we have the points group for this z-stack
            if (this.genePointsGroups[geneName][currentZstack]) {
                // If we have the points group, make it visible
                this.genePointsGroups[geneName][currentZstack].visible = true;
            } else if (this.originalPointsData[geneName] && 
                      this.originalPointsData[geneName][currentZstack] &&
                      !this.genePointsGroups[geneName][currentZstack]) {
                // Only create new points group if we have original data and haven't created it yet
                const geneColor = store.get('geneColors')[geneName] || '#ffffff';
                this.updateLOD(geneName, geneColor, currentZstack);
            } else {
                // If we don't have data for this z-stack, log it
                console.log(`No data available for gene ${geneName} at z-stack ${currentZstack}`);
                
                // For now, we'll keep the gene hidden until data is loaded
                // The gene will become visible when the data is loaded and processed
            }
        });
        
        // Update total points rendered
        this.updateTotalPointsRendered();
    }
    
    /**
     * Update points for all genes or a specific gene
     * Always renders all points without LOD subsampling
     * Uses shader-based rendering for more efficient color and size updates
     * @param {string} [specificGene] - Optional gene name to update
     * @param {string} [geneColor] - Optional color for the gene points
     * @param {string} [specificLayer] - Optional layer to update
     */
    updateLOD(specificGene, geneColor, specificLayer) {
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
        
        // Get current z-stack
        const currentZstack = specificLayer || store.get('zstack').toString();
        
        // Determine which genes to update
        const genesToUpdate = specificGene ? [specificGene] : Object.keys(this.loadedGenes);
        let totalPointsRendered = 0;
        
        // Update each gene
        genesToUpdate.forEach(geneName => {
            if (!this.loadedGenes[geneName] || !this.originalPointsData[geneName]) return;
            
            // Skip if we don't have data for this layer
            if (!this.originalPointsData[geneName][currentZstack]) {
                console.log(`No data for gene ${geneName} at layer ${currentZstack}`);
                return;
            }
            
            // Get points for this gene and layer
            const pointsToRender = this.originalPointsData[geneName][currentZstack];
            
            // Safety check - if no points are available, skip this gene/layer
            if (!pointsToRender || pointsToRender.length === 0) {
                console.warn(`No points available for gene ${geneName} at layer ${currentZstack}`);
                return;
            }
            
            // Initialize gene points group structure if needed
            if (!this.genePointsGroups[geneName]) {
                this.genePointsGroups[geneName] = {};
            }
            
            // Get the color for this gene
            const color = geneColor || store.get('geneColors')[geneName] || '#ffffff';
            
            // Apply gene-specific scale if available
            const geneCustomizations = store.get('geneCustomizations') || {};
            const geneScale = geneCustomizations[geneName]?.scale || 1.0;
            const basePointSize = store.get('pointSize');
            const pointSize = basePointSize * geneScale;
            
            // If no specific layer is provided, use current z-stack
            if (!specificLayer) {
                specificLayer = store.get('zstack').toString();
            }
            
            // If the points for this gene and layer already exist, just update their color and size
            if (this.genePointsGroups[geneName][currentZstack]) {
                // If we're explicitly updating this gene or layer, or if the color or size has changed
                if (specificGene || specificLayer || geneColor) {
                    console.log(`Updating color/size for gene ${geneName} layer ${currentZstack}`);
                    
                    // Update all points in this group
                    this.genePointsGroups[geneName][currentZstack].traverse(object => {
                        if (object instanceof THREE.Points) {
                            // Update the color attribute
                            if (geneColor) {
                                const colorAttribute = object.geometry.getAttribute('color');
                                const colorArray = colorAttribute.array;
                                
                                // Parse the color string to RGB components
                                const hexColor = color.startsWith('#') ? color.substring(1) : color;
                                const r = parseInt(hexColor.substring(0, 2), 16) / 255;
                                const g = parseInt(hexColor.substring(2, 4), 16) / 255;
                                const b = parseInt(hexColor.substring(4, 6), 16) / 255;
                                
                                // Update all points to the new color
                                for (let i = 0; i < colorArray.length; i += 3) {
                                    colorArray[i] = r;     // R
                                    colorArray[i + 1] = g; // G
                                    colorArray[i + 2] = b; // B
                                }
                                
                                // Mark the attribute as needing an update
                                colorAttribute.needsUpdate = true;
                            }
                            
                            // Update the point size
                            if (object.material.uniforms && object.material.uniforms.dotSize) {
                                object.material.uniforms.dotSize.value = pointSize;
                            }
                        }
                    });
                    
                    // Set visibility based on current z-stack
                    this.genePointsGroups[geneName][currentZstack].visible = 
                        (currentZstack === store.get('zstack').toString());
                    
                    // Add to total points rendered
                    totalPointsRendered += pointsToRender.length;
                    return; // Skip full regeneration
                }
            } else {
                // Need to create the points from scratch
                console.log(`Creating new points for gene ${geneName} layer ${currentZstack} with ${pointsToRender.length} points`);
                
                // Create a new group for this gene/layer's points
                this.genePointsGroups[geneName][currentZstack] = new THREE.Group();
                this.scene.add(this.genePointsGroups[geneName][currentZstack]);
                
                // Create buffer geometry
                const geometry = new THREE.BufferGeometry();
                
                // For large datasets, use typed arrays directly for better performance
                const positions = new Float32Array(pointsToRender.length * 3);
                const colors = new Float32Array(pointsToRender.length * 3);
                const sizes = new Float32Array(pointsToRender.length);
                const alphas = new Float32Array(pointsToRender.length);
                
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
                    
                    // Set default size and alpha
                    sizes[i] = store.get('pointSize'); // Will be scaled by the shader
                    alphas[i] = 1.0; // Fully opaque
                }
                
                // Set attributes
                geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
                geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
                
                // Define custom shaders for better control over point rendering
                const vertexShader = `
                    attribute float size;
                    attribute vec3 color;
                    attribute float alpha;
                    uniform float dotSize;
                    varying vec3 vColor;
                    varying float vAlpha;
                    varying float vDistance;

                    void main() {
                        vColor = color;
                        vAlpha = alpha;
                        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                        
                        // Calculate distance from camera
                        float distance = -mvPosition.z;
                        vDistance = distance;
                        
                        // Get base size from the size attribute, scaled by the dotSize uniform
                        float baseSize = size * dotSize * 1.0; // Scale factor to make it reasonable
                        
                        // Dynamic sizing based on distance with smoother transitions
                        float minSize = max(1.0, dotSize * 5.0); // Minimum size scales with dotSize
                        float maxSize = min(50.0, dotSize * 0.5); // Maximum size scales with dotSize
                        float zoomFactor = 1.0; // LOWER value makes points shrink faster when zooming in
                        
                        // Use a smooth curve for size transition based on distance
                        // This creates a more natural zoom feeling
                        float distanceRatio = zoomFactor / distance;
                        
                        // Smooth adaptive sizing with cubic easing
                        float t = clamp((distance - 100.0) / 200.0, 0.0, 1.0); // Shorter distance range for faster transition
                        float easedT = 1.0 - (1.0 - t) * (1.0 - t) * (1.0 - t); // Cubic ease-out
                        
                        // Blend between close-up and far-away behaviors
                        float closeUpFactor = 1.0;  // Size multiplier when close to camera
                        float farAwayFactor = 2.0;   // Size multiplier when far from camera
                        float scaleFactor = mix(closeUpFactor, farAwayFactor, easedT);
                        
                        // Calculate final adaptive size
                        float adaptiveSize = baseSize * distanceRatio * scaleFactor;
                        
                        // Clamp size between min and max
                        gl_PointSize = clamp(adaptiveSize, minSize, maxSize);
                        gl_Position = projectionMatrix * mvPosition;
                    }
                `;

                const fragmentShader = `
                    varying vec3 vColor;
                    varying float vAlpha;
                    varying float vDistance;

                    void main() {
                        // Create circular points instead of squares
                        float dist = length(gl_PointCoord - vec2(0.5, 0.5));
                        if (dist > 0.5) {
                            discard;
                        }
                        
                        // Enhanced edge effect for all points
                        float edgeWidth = 0.15;  // Wider edge
                        float distFromCenter = dist;
                        
                        // Smooth edge effect that transitions based on distance
                        float edgeEffect = 1.0;
                        float edgeFactor = smoothstep(0.5 - edgeWidth, 0.5, distFromCenter);
                        
                        // Transition edge effect based on distance
                        float distanceFactor = smoothstep(150.0, 50.0, vDistance);
                        edgeEffect = mix(1.0, 0.7, edgeFactor * distanceFactor);
                        
                        // Add subtle anti-aliasing at the edge
                        float alpha = vAlpha;
                        if (dist > 0.48) {
                            alpha *= smoothstep(0.5, 0.48, dist);
                        }
                        
                        // Apply edge effect to color
                        vec3 finalColor = vColor * edgeEffect;
                        gl_FragColor = vec4(finalColor, alpha);
                    }
                `;
                
                // Create custom shader material with uniforms for dynamic updates
                const material = new THREE.ShaderMaterial({
                    uniforms: {
                        dotSize: { value: pointSize }
                    },
                    vertexShader: vertexShader,
                    fragmentShader: fragmentShader,
                    transparent: true
                });
                
                // Create points mesh
                const points = new THREE.Points(geometry, material);
                this.genePointsGroups[geneName][currentZstack].add(points);
                
                // Set visibility based on current z-stack
                this.genePointsGroups[geneName][currentZstack].visible = 
                    (currentZstack === store.get('zstack').toString());
            }
            
            // Add to total points rendered
            totalPointsRendered += pointsToRender.length;
        });
        
        // Update store with total points rendered
        store.set('pointsRendered', totalPointsRendered);
        
        // Force a render update
        store.set('forceRender', true);
    }
    
    /**
     * Update point size for all loaded genes
     * Efficiently updates shader uniforms without recreating geometries
     * @param {string} [specificGene] - Optional gene name to update specifically
     */
    updatePointSize(specificGene) {
        const basePointSize = store.get('pointSize');
        const geneCustomizations = store.get('geneCustomizations') || {};
        let updatedAnyPoints = false;
        
        // Determine which genes to update
        const genesToUpdate = specificGene ? [specificGene] : Object.keys(this.genePointsGroups);
        
        console.log(`Updating point size with base value: ${basePointSize} for genes:`, genesToUpdate);
        
        // Update point size for specified gene groups
        genesToUpdate.forEach(geneName => {
            const geneLayers = this.genePointsGroups[geneName];
            if (!geneLayers) return;
            
            // Apply gene-specific scale if available
            const geneScale = geneCustomizations[geneName]?.scale || 1.0;
            const pointSize = basePointSize * geneScale;
            
            console.log(`Setting point size for gene ${geneName} to ${pointSize} (base: ${basePointSize}, scale: ${geneScale})`);
            
            // Update each layer
            Object.keys(geneLayers).forEach(layer => {
                const layerGroup = geneLayers[layer];
                if (!layerGroup) return;
                
                // Update all points in this group
                layerGroup.traverse(object => {
                    if (object instanceof THREE.Points) {
                        // Update the point size uniform if using shader material
                        if (object.material.uniforms && object.material.uniforms.dotSize) {
                            object.material.uniforms.dotSize.value = pointSize;
                            updatedAnyPoints = true;
                        } 
                        // Fall back to updating material size if not using shader material
                        else if (object.material.size !== undefined) {
                            object.material.size = pointSize;
                            object.material.needsUpdate = true;
                            updatedAnyPoints = true;
                        }
                    }
                });
            });
        });
        
        // Force a render update if any points were updated
        if (updatedAnyPoints) {
            store.set('forceRender', true);
        }
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
                // Remove each layer
                Object.keys(this.genePointsGroups[geneName]).forEach(layer => {
                    const layerGroup = this.genePointsGroups[geneName][layer];
                    if (!layerGroup) return;
                    
                    // Remove from scene
                    this.scene.remove(layerGroup);
                    
                    // Dispose of all geometries and materials
                    layerGroup.traverse(object => {
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
            // Clear all genes
            Object.keys(this.genePointsGroups).forEach(gene => {
                this.clearGeneData(gene);
            });
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
        
        // Calculate bounds across all loaded genes for the current layer
        Object.keys(this.loadedGenes).forEach(geneName => {
            if (!this.loadedGenes[geneName] || 
                !this.originalPointsData[geneName] || 
                !this.originalPointsData[geneName][currentZstack]) {
                return;
            }
            
            const points = this.originalPointsData[geneName][currentZstack];
            
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
        const currentZstack = store.get('zstack').toString();
        
        // Sum up points from all loaded genes for the current layer
        Object.keys(this.loadedGenes).forEach(geneName => {
            if (this.loadedGenes[geneName] && 
                this.lodLevels[geneName] && 
                this.lodLevels[geneName][currentZstack]) {
                
                const lodLevel = this.currentLODLevels[geneName] || 0;
                if (this.lodLevels[geneName][currentZstack][lodLevel]) {
                    totalPoints += this.lodLevels[geneName][currentZstack][lodLevel].length;
                }
            }
        });
        
        // Update store with total points rendered
        store.set('pointsRendered', totalPoints);
    }
    
    /**
     * Updates all layers for genes with customization changes
     * Efficiently updates scales using shader uniforms without recreating geometries
     * @param {Object} customizations - The updated gene customizations
     */
    updateAllLayersForCustomizedGenes(customizations) {
        if (!customizations) return;
        console.log('Efficiently updating customizations for genes:', Object.keys(customizations));
        
        // Get the genes that have customizations
        const customizedGenes = Object.keys(customizations);
        let updatedAnyPoints = false;
        
        // For each customized gene that is loaded
        customizedGenes.forEach(geneName => {
            if (!this.loadedGenes[geneName]) return;
            
            // Get the customization for this gene
            const geneCustomization = customizations[geneName];
            if (!geneCustomization) return;
            
            // Get the scale factor
            const geneScale = geneCustomization.scale || 1.0;
            const basePointSize = store.get('pointSize');
            const pointSize = basePointSize * geneScale;
            
            // Get all available layers for this gene
            const availableLayers = Object.keys(this.genePointsGroups[geneName] || {});
            
            // Update each layer for this gene
            availableLayers.forEach(layer => {
                const layerGroup = this.genePointsGroups[geneName][layer];
                if (!layerGroup) return;
                
                console.log(`Updating scale for gene ${geneName} layer ${layer} to ${geneScale}`);
                
                // Update all points in this group
                layerGroup.traverse(object => {
                    if (object instanceof THREE.Points) {
                        // Update the point size uniform if using shader material
                        if (object.material.uniforms && object.material.uniforms.dotSize) {
                            object.material.uniforms.dotSize.value = pointSize;
                            updatedAnyPoints = true;
                        } 
                        // Fall back to updating material size if not using shader material
                        else if (object.material.size !== undefined) {
                            object.material.size = pointSize;
                            object.material.needsUpdate = true;
                            updatedAnyPoints = true;
                        }
                    }
                });
            });
        });
        
        // Force a render update if any points were updated
        if (updatedAnyPoints) {
            store.set('forceRender', true);
        }
    }
    
    /**
     * Updates all layers for genes with color changes
     * Efficiently updates colors using shader attributes without recreating geometries
     * @param {Object} colors - The updated gene colors
     */
    updateAllLayersForColorChanges(colors) {
        if (!colors) return;
        // console.log('Efficiently updating colors for genes:', Object.keys(colors));
        
        // Get the genes that have color changes
        const coloredGenes = Object.keys(colors);
        let updatedAnyPoints = false;
        
        // For each colored gene that is loaded
        coloredGenes.forEach(geneName => {
            if (!this.loadedGenes[geneName]) return;
            
            // Get the gene color
            const geneColor = colors[geneName];
            if (!geneColor) return;
            
            // Parse the color string to RGB components
            const hexColor = geneColor.startsWith('#') ? geneColor.substring(1) : geneColor;
            const r = parseInt(hexColor.substring(0, 2), 16) / 255;
            const g = parseInt(hexColor.substring(2, 4), 16) / 255;
            const b = parseInt(hexColor.substring(4, 6), 16) / 255;
            
            // Get all available layers for this gene
            const availableLayers = Object.keys(this.genePointsGroups[geneName] || {});
            
            // Update each layer for this gene
            availableLayers.forEach(layer => {
                const layerGroup = this.genePointsGroups[geneName][layer];
                if (!layerGroup) return;
                
                console.log(`Updating color for gene ${geneName} layer ${layer} to ${geneColor}`);
                
                // Update all points in this group
                layerGroup.traverse(object => {
                    if (object instanceof THREE.Points) {
                        const colorAttribute = object.geometry.getAttribute('color');
                        if (!colorAttribute) return;
                        
                        const colorArray = colorAttribute.array;
                        
                        // Update all points to the new color
                        for (let i = 0; i < colorArray.length; i += 3) {
                            colorArray[i] = r;     // R
                            colorArray[i + 1] = g; // G
                            colorArray[i + 2] = b; // B
                        }
                        
                        // Mark the attribute as needing an update
                        colorAttribute.needsUpdate = true;
                        updatedAnyPoints = true;
                    }
                });
            });
        });
        
        // Force a render update if any points were updated
        if (updatedAnyPoints) {
            store.set('forceRender', true);
        }
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