/**
 * Main application file for MERFISH visualization
 * Sets up Three.js scene, camera, and renderer
 * Manages the visualization lifecycle
 * Optimized for rendering up to 8 million points efficiently
 */

// Import dependencies
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Stats from 'three/addons/libs/stats.module.js';
import { store } from './store.js';
import { GeneLoader } from './geneLoader.js';
import { CellBoundaries } from './cellBoundaries.js';
import { config } from './config.js';

// Initialize Three.js scene
let scene, camera, renderer, controls, stats;
let geneLoader, cellBoundaries;
let clock = new THREE.Clock();
let frameCount = 0; // Frame counter for performance optimizations

// Data bounds for centering
const dataBounds = {
    minX: 0,
    maxX: 10000,
    minY: 0,
    maxY: 10000
};

// Add tooltip container reference
let tooltipContainer = document.getElementById('tooltip-container');

// Mouse variables
let mouse = new THREE.Vector2();
let raycaster = new THREE.Raycaster();

// Create a single tooltip instance when the page loads
let tooltipElement = null;
let tooltipTimeout = null;

// Make sure the store has access to data bounds for transformations
store.set('dataBounds', dataBounds);


// Initialize the application
function init() {
    try {
        // Create scene
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000000);
        
        // Create camera - using orthographic camera for 2D view
        const container = document.getElementById('visualization');
        const aspect = container.clientWidth / container.clientHeight;
        
        // Calculate the center of the data
        const centerX = (dataBounds.minX + dataBounds.maxX) / 2;
        const centerY = (dataBounds.minY + dataBounds.maxY) / 2;
        const dataWidth = dataBounds.maxX - dataBounds.minX;
        const dataHeight = dataBounds.maxY - dataBounds.minY;

        
        
        // Use orthographic camera for 2D view
        const frustumSize = Math.max(dataWidth, dataHeight);
        camera = new THREE.OrthographicCamera(
            frustumSize * aspect / -2,
            frustumSize * aspect / 2,
            frustumSize / 2,
            frustumSize / -2,
            1,
            100000
        );
        
        // Position camera to look at the center of the data
        camera.position.set(centerX, centerY, 5000);
        camera.lookAt(centerX, centerY, 0);
        
        // Store the initial camera distance in the store
        store.set('cameraDistance', 5000);
        
        /* 3D camera code (commented out)
        // Use perspective camera for 3D view
        camera = new THREE.PerspectiveCamera(
            45, // Field of view
            aspect,
            1,
            100000
        );
        
        // Position camera to look at the center of the data
        // Position it at a distance that ensures the entire dataset is visible
        const cameraDistance = Math.max(dataWidth, dataHeight) * 1.5;
        camera.position.set(centerX, centerY, cameraDistance);
        camera.lookAt(centerX, centerY, 0);
        
        // Store the initial camera distance in the store
        store.set('cameraDistance', cameraDistance);
        */
        
        // Create renderer with optimizations for large point clouds
        renderer = new THREE.WebGLRenderer({ 
            antialias: false, // Disable antialiasing for better performance with millions of points
            powerPreference: 'high-performance' // Request high-performance GPU
        });
        renderer.setSize(container.clientWidth, container.clientHeight);
        // Limit pixel ratio for better performance with large point clouds
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        container.appendChild(renderer.domElement);

        
        
        // Add orbit controls but restrict to 2D movement (pan and zoom only)
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableRotate = false; // Disable rotation for 2D view
        controls.enableDamping = true;
        controls.dampingFactor = 0.8;
        controls.screenSpacePanning = true;
        controls.target.set(centerX, centerY, 0); // Set target to center of data
        
        // Configure mouse buttons for controls
        controls.mouseButtons = {
            LEFT: THREE.MOUSE.PAN,       // Use left mouse button for panning
            MIDDLE: THREE.MOUSE.DOLLY,   // Use middle mouse button (scroll wheel) for zooming
            RIGHT: THREE.MOUSE.ROTATE    // Right mouse button (not used since rotation is disabled)
        };
        
        // Add stats
        stats = new Stats();
        container.appendChild(stats.dom);
        
        // Initialize loaders
        geneLoader = new GeneLoader(scene);
        cellBoundaries = new CellBoundaries(scene);
        
        // Handle window resize
        window.addEventListener('resize', onWindowResize);
        
        // Subscribe to coordinate transformation changes
        store.subscribe('geneFlipX', () => updateCameraForTransformations());
        store.subscribe('geneFlipY', () => updateCameraForTransformations());
        store.subscribe('geneSwapXY', () => updateCameraForTransformations());
        
        // Populate gene selector from gene_list.json
        window.populateGeneSelector();
        
        // Start animation loop
        animate();
        
        console.log('MERFISH visualization initialized');
        
        // Add mouse move event listener
        document.addEventListener('mousemove', onDocumentMouseMove);
    } catch (error) {
        console.error('Error initializing visualization:', error);
        alert('There was an error initializing the visualization. Please check the console for details.');
    }
}

// Handle mouse move events
function onDocumentMouseMove(event) {
    // Calculate mouse position relative to visualization container
    const visualization = document.getElementById('visualization');
    const rect = visualization.getBoundingClientRect();
    
    // Get mouse position relative to visualization container
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Convert to normalized device coordinates
    mouse.x = (x / rect.width) * 2 - 1;
    mouse.y = -(y / rect.height) * 2 + 1;
    
    // Update raycaster
    raycaster.setFromCamera(mouse, camera);
    
    // Find intersections with cell centroid points
    if (cellBoundaries && cellBoundaries.boundariesGroup) {
        // Get all intersecting points
        const intersects = raycaster.intersectObjects(cellBoundaries.boundariesGroup.children, true);
        
        
        if (intersects.length > 0) {
            // sometimes there are two objects for the same cell point - no idea why.
            const intersectedObject = intersects[intersects.length-1].object;
            const userData = intersectedObject.userData;
            
            // Get or create tooltip container
            const tooltipContainer = document.getElementById('tooltip-container');
            if (!tooltipContainer) return;
            
            // Create tooltip element if it doesn't exist
            if (!tooltipElement) {
                tooltipElement = document.createElement('div');
                tooltipElement.className = 'tooltip';
                tooltipContainer.appendChild(tooltipElement);
            }
            
            // Update content
            tooltipElement.innerHTML = `
                <div class="tooltip-content">
                    <p>${userData.cellType || 'Unknown'} -- ${userData.cellId || 'Unknown'}</p>
                </div>
            `;
            
            // Clear any existing timeout
            if (tooltipTimeout) {
                clearTimeout(tooltipTimeout);
            }
            
            // Calculate position
            const containerRect = tooltipContainer.getBoundingClientRect();
            const x = event.clientX - containerRect.left + 15;
            const y = event.clientY - containerRect.top - tooltipElement.offsetHeight - 15;
            
            // Ensure tooltip stays within bounds
            const containerWidth = containerRect.width;
            const containerHeight = containerRect.height;
            
            // Adjust position if tooltip would go off screen
            if (x + tooltipElement.offsetWidth > containerWidth) {
                tooltipElement.style.left = (x - tooltipElement.offsetWidth - 30) + 'px';
            } else {
                tooltipElement.style.left = x + 'px';
            }
            
            if (y < 0) {
                tooltipElement.style.top = (event.clientY - containerRect.top + 15) + 'px';
            } else {
                tooltipElement.style.top = y + 'px';
            }
            
            // Show tooltip after a small delay to prevent flickering
            tooltipTimeout = setTimeout(() => {
                if (tooltipElement) {
                    tooltipElement.classList.add('visible');
                }
            }, 50);
        } else {
            // Hide tooltip with delay
            if (tooltipElement) {
                tooltipElement.classList.remove('visible');
                
                // Remove tooltip after it's hidden
                tooltipTimeout = setTimeout(() => {
                    if (tooltipElement) {
                        tooltipElement.remove();
                        tooltipElement = null;
                    }
                }, 300);
            }
        }
    }
}

/**
 * Generate a distinct color for a gene
 * @param {string} geneName - Name of the gene
 * @param {number} index - Index of the gene in the list
 * @returns {string} - Hex color code
 */
function generateGeneColor(geneName, index) {
    // Predefined colors for better visibility and distinction
    const colors = [
        '#e41a1c', // red
        '#377eb8', // blue
        '#4daf4a', // green
        '#984ea3', // purple
        '#ff7f00', // orange
        '#ffff33', // yellow
        '#a65628', // brown
        '#f781bf', // pink
        '#999999', // grey
        '#66c2a5', // teal
        '#fc8d62', // salmon
        '#8da0cb', // light blue
        '#e78ac3', // light purple
        '#a6d854', // light green
        '#ffd92f', // light yellow
        '#e5c494', // tan
        '#b3b3b3', // light grey
        '#8dd3c7', // mint
        '#bebada', // lavender
        '#fb8072'  // coral
    ];
    
    // Use index to cycle through colors, or hash the gene name if index is not provided
    if (index !== undefined) {
        return colors[index % colors.length];
    } else {
        // Simple hash function for the gene name
        let hash = 0;
        for (let i = 0; i < geneName.length; i++) {
            hash = ((hash << 5) - hash) + geneName.charCodeAt(i);
            hash = hash & hash; // Convert to 32bit integer
        }
        return colors[Math.abs(hash) % colors.length];
    }
}

/**
 * Dynamically populates the gene selector with checkboxes from the gene_list.json file
 * Exported to window to allow calling from store.js
 */
window.populateGeneSelector = async function() {
    try {
        // Get the gene selector container
        const geneSelector = document.getElementById('gene-selector');
        if (!geneSelector) {
            console.error('Gene selector element not found');
            return;
        }
        
        // Check if the selector has already been populated
        if (geneSelector.getAttribute('data-populated') === 'true') {
            console.log('Gene selector already populated, skipping');
            return;
        }
        
        // Clear existing content
        geneSelector.innerHTML = '';
        
        // Fetch the gene list from the JSON file using the config path
        const response = await fetch(config.dataPaths.getGeneListPath());
        
        if (!response.ok) {
            throw new Error(`Failed to fetch gene list: ${response.status} ${response.statusText}`);
        }
        
        const genes = await response.json();
        
        // Sort genes alphabetically (case insensitive)
        genes.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        
        // Add checkboxes for each gene
        genes.forEach((gene, index) => {
            // Create container for the checkbox item
            const checkboxItem = document.createElement('div');
            checkboxItem.className = 'gene-checkbox-item';
            checkboxItem.setAttribute('data-gene', gene);
            
            // Create checkbox
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `gene-${gene}`;
            checkbox.value = gene;
            checkbox.className = 'gene-checkbox';
            
            // Generate a color for this gene
            const geneColor = generateGeneColor(gene, index);
            
            // Store the color in the store
            if (!store.get('geneColors')[gene]) {
                const geneColors = store.get('geneColors') || {};
                geneColors[gene] = geneColor;
                store.set('geneColors', geneColors);
            }
            
            // Create label
            const label = document.createElement('label');
            label.htmlFor = `gene-${gene}`;
            label.textContent = gene;
            
            // Create color indicator
            const colorIndicator = document.createElement('span');
            colorIndicator.className = 'gene-color-indicator';
            colorIndicator.style.backgroundColor = geneColor;
            
            // Add event listener to checkbox
            checkbox.addEventListener('change', () => {
                const selectedGenes = store.get('selectedGenes') || {};
                selectedGenes[gene] = checkbox.checked;
                store.set('selectedGenes', selectedGenes);
                
                // Update color indicator visibility
                colorIndicator.style.display = checkbox.checked ? 'inline-block' : 'none';
                
                // If checked, load the gene data
                if (checkbox.checked) {
                    console.log(`Selected gene: ${gene}`);
                } else {
                    console.log(`Deselected gene: ${gene}`);
                    // Clear the gene data from the store
                    const geneData = store.get('geneData') || {};
                    if (geneData[gene]) {
                        delete geneData[gene];
                        store.set('geneData', geneData);
                    }
                }
                
                // Force a render update
                store.set('forceRender', !store.get('forceRender'));
            });
            
            // Initially hide color indicator
            colorIndicator.style.display = 'none';
            
            // Assemble the checkbox item
            checkboxItem.appendChild(checkbox);
            checkboxItem.appendChild(label);
            checkboxItem.appendChild(colorIndicator);
            geneSelector.appendChild(checkboxItem);
        });
        
        console.log(`Populated gene selector with ${genes.length} genes from gene_list.json`);
        
        // Mark the selector as populated
        geneSelector.setAttribute('data-populated', 'true');
        
        // Set up search functionality
        const geneSearch = document.getElementById('gene-search');
        if (geneSearch) {
            geneSearch.addEventListener('input', (event) => {
                const searchTerm = event.target.value.toLowerCase();
                const checkboxItems = geneSelector.querySelectorAll('.gene-checkbox-item');
                
                checkboxItems.forEach(item => {
                    const geneName = item.getAttribute('data-gene').toLowerCase();
                    if (geneName.includes(searchTerm)) {
                        item.style.display = 'flex';
                    } else {
                        item.style.display = 'none';
                    }
                });
            });
        }
        
        // Set up clear all button
        const clearGenesBtn = document.getElementById('clear-genes-btn');
        if (clearGenesBtn) {
            clearGenesBtn.addEventListener('click', () => {
                // Uncheck all checkboxes
                const checkboxes = geneSelector.querySelectorAll('.gene-checkbox');
                checkboxes.forEach(checkbox => {
                    checkbox.checked = false;
                });
                
                // Hide all color indicators
                const colorIndicators = geneSelector.querySelectorAll('.gene-color-indicator');
                colorIndicators.forEach(indicator => {
                    indicator.style.display = 'none';
                });
                
                // Clear selected genes in store
                store.set('selectedGenes', {});
                
                // Clear gene data in store
                store.set('geneData', {});
                
                // Force a render update
                store.set('forceRender', !store.get('forceRender'));
                
                console.log('Cleared all selected genes');
            });
        }
    } catch (error) {
        console.error('Error populating gene selector:', error);
    }
}

// Handle window resize
function onWindowResize() {
    const container = document.getElementById('visualization');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    const aspect = width / height;
    const frustumSize = Math.max(dataBounds.maxX - dataBounds.minX, dataBounds.maxY - dataBounds.minY);
    
    if (camera instanceof THREE.OrthographicCamera) {
        camera.left = frustumSize * aspect / -2;
        camera.right = frustumSize * aspect / 2;
        camera.top = frustumSize / 2;
        camera.bottom = frustumSize / -2;
    } else {
        camera.aspect = aspect;
    }
    
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    try {
        // Update controls
        controls.update();
        
        // Check if cell boundaries visibility needs to be updated
        if (cellBoundaries && cellBoundaries.boundariesGroup) {
            const shouldBeVisible = store.get('showCellBoundaries');
            if (cellBoundaries.boundariesGroup.visible !== shouldBeVisible) {
                console.log('Fixing cell boundaries visibility to:', shouldBeVisible);
                cellBoundaries.boundariesGroup.visible = shouldBeVisible;
            }
        }
        
        // Update camera distance for LOD calculations - only calculate every few frames for better performance
        if (frameCount % 10 === 0) { // Only update every 10 frames
            const cameraPosition = new THREE.Vector3();
            camera.getWorldPosition(cameraPosition);
            const distance = cameraPosition.distanceTo(new THREE.Vector3(
                (dataBounds.minX + dataBounds.maxX) / 2,
                (dataBounds.minY + dataBounds.maxY) / 2,
                0
            ));
            store.set('cameraDistance', distance);
        }
        
        // Update stats
        stats.update();
        
        // Update FPS display every 30 frames - calculate FPS manually instead of relying on stats
        if (frameCount % 30 === 0) {
            // Calculate FPS based on delta time from THREE.Clock
            const delta = clock.getDelta();
            const smoothingFactor = 0.9; // For smoother FPS display
            
            // Get current FPS or default to 60
            const currentFps = store.get('fps') || 60;
            
            // Calculate new FPS with smoothing
            const newFps = delta > 0 ? Math.round(smoothingFactor * currentFps + (1 - smoothingFactor) * (1 / delta)) : currentFps;
            
            // Update store with calculated FPS
            store.set('fps', newFps);
        }
        
        // Check if a force render is needed (e.g., after clearing gene data)
        const forceRender = store.get('forceRender');
        if (forceRender) {
            // Reset the flag
            store.set('forceRender', false);
            console.log('Forced render triggered');
        }
        
        // Render scene
        renderer.render(scene, camera);
        
        // Increment frame counter
        frameCount++;
    } catch (error) {
        console.error('Error in animation loop:', error);
    }
}

// Update camera position and target based on coordinate transformations
function updateCameraForTransformations() {
    if (!camera || !controls) return;
    
    // Get the original center of the data
    const originalCenterX = (dataBounds.minX + dataBounds.maxX) / 2;
    const originalCenterY = (dataBounds.minY + dataBounds.maxY) / 2;
    
    // Apply the same transformations to the center point as we do to the data
    const transformedCenter = store.transformGenePoint({
        x: originalCenterX,
        y: originalCenterY
    });
    
    // Update camera position and controls target
    camera.position.set(transformedCenter.x, transformedCenter.y, camera.position.z);
    controls.target.set(transformedCenter.x, transformedCenter.y, 0);
    
    // Update camera and controls
    camera.updateProjectionMatrix();
    controls.update();
    
    console.log(`Camera position updated for transformations: (${transformedCenter.x}, ${transformedCenter.y})`);
}

// Update data bounds based on loaded data
export function updateDataBounds(points) {
    if (!points || points.length === 0) return;
    
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    
    // Calculate bounds and sum for mean calculation
    points.forEach(point => {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
        
        sumX += point.x;
        sumY += point.y;
        sumZ += point.z || 0; // Use z if available, otherwise 0
    });
    
    // Calculate mean position
    const meanX = sumX / points.length;
    const meanY = sumY / points.length;
    const meanZ = sumZ / points.length;
    
    // Store mean position for potential future 3D visualization
    store.set('meanX', meanX);
    store.set('meanY', meanY);
    store.set('meanZ', meanZ);
    
    console.log(`Mean position: (${meanX.toFixed(2)}, ${meanY.toFixed(2)}, ${meanZ.toFixed(2)})`); 
    
    // Add padding
    const paddingX = (maxX - minX) * 0.1;
    const paddingY = (maxY - minY) * 0.1;
    
    dataBounds.minX = minX - paddingX;
    dataBounds.maxX = maxX + paddingX;
    dataBounds.minY = minY - paddingY;
    dataBounds.maxY = maxY + paddingY;
    
    // If camera exists, update its position and target
    if (camera) {
        // Use center of bounds for 2D view
        const centerX = (dataBounds.minX + dataBounds.maxX) / 2;
        const centerY = (dataBounds.minY + dataBounds.maxY) / 2;
        
        const transformedCenter = store.transformGenePoint({
            x: centerX,
            y: centerY
        });
        
        /* 3D view code (commented out)
        // Use mean position instead of center of bounds
        const transformedMean = store.transformGenePoint({
            x: meanX,
            y: meanY
        });
        */
        
        // Calculate the appropriate camera distance based on data bounds
        if (camera instanceof THREE.OrthographicCamera) {
            const frustumSize = Math.max(
                dataBounds.maxX - dataBounds.minX,
                dataBounds.maxY - dataBounds.minY
            );
            const aspect = renderer.domElement.width / renderer.domElement.height;
            
            camera.left = frustumSize * aspect / -2;
            camera.right = frustumSize * aspect / 2;
            camera.top = frustumSize / 2;
            camera.bottom = frustumSize / -2;
            camera.updateProjectionMatrix();
        }
        
        /* 3D camera code (commented out)
        else if (camera instanceof THREE.PerspectiveCamera) {
            // For perspective camera, adjust the distance to ensure the data fits in view
            const dataSize = Math.max(
                dataBounds.maxX - dataBounds.minX,
                dataBounds.maxY - dataBounds.minY
            );
            
            // Calculate distance needed to fit the data in the field of view
            const fov = camera.fov * (Math.PI / 180); // Convert to radians
            const cameraDistance = (dataSize / 2) / Math.tan(fov / 2) * 1.2; // Add 20% margin
            
            // Update camera z position and store the distance
            camera.position.z = meanZ + cameraDistance;
            store.set('cameraDistance', cameraDistance);
        }
        */
        
        // Update camera position for 2D view
        camera.position.set(transformedCenter.x, transformedCenter.y, 5000);
        
        // Set controls target to the center position
        controls.target.set(transformedCenter.x, transformedCenter.y, 0);
        controls.update();
        
        console.log(`Camera looking at: (${transformedCenter.x.toFixed(2)}, ${transformedCenter.y.toFixed(2)}, 0)`);
        
        /* 3D camera positioning code (commented out)
        // For perspective camera, we've already set the z position above
        // For orthographic camera or if we need to update x,y position
        if (camera instanceof THREE.OrthographicCamera) {
            camera.position.set(transformedMean.x, transformedMean.y, camera.position.z);
        } else {
            // For perspective camera, only update x and y, z was set above
            camera.position.x = transformedMean.x;
            camera.position.y = transformedMean.y;
        }
        
        // Set controls target to the mean position including Z
        controls.target.set(transformedMean.x, transformedMean.y, meanZ);
        controls.update();
        
        console.log(`Camera looking at: (${transformedMean.x.toFixed(2)}, ${transformedMean.y.toFixed(2)}, ${meanZ.toFixed(2)})`);
        */    }
}

// Initialize the application when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing application...');
    
    // Initialize store UI bindings first
    store.initUIBindings();
    
    // Then initialize the visualization
    init();
});
