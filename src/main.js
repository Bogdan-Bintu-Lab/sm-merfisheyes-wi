/**
 * Main application file for MERFISH visualization
 * Sets up Three.js scene, camera, and renderer
 * Manages the visualization lifecycle
 * Optimized for rendering up to 8 million points efficiently
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Stats from 'three/examples/jsm/libs/stats.module.js';
import { store } from './store.js';
import { GeneLoader } from './GeneLoader.js';
import { CellBoundaries } from './cellBoundaries.js';
import { config } from './config.js';

// Initialize Three.js scene
let scene, camera, renderer, controls, stats;
// Make geneLoader accessible globally
let geneLoader, cellBoundaries;
window.geneLoader = null; // Global reference for access from other functions
let clock = new THREE.Clock();
let frameCount = 0; // Frame counter for performance optimizations

// Data bounds for centering
const dataBounds = {
    minX: 0,
    maxX: 2000,
    minY: 0,
    maxY: 2000
};

// Add tooltip container reference
let tooltipContainer = document.getElementById('tooltip-container');

// Mouse variables
let mouse = new THREE.Vector2();
let raycaster = new THREE.Raycaster();

// Make sure the store has access to data bounds for transformations
store.set('dataBounds', dataBounds);


// Initialize the application
function init() {
    // In your init function, after initializing the scene and before starting the animation loop
// Make sure tooltip container exists
    // tooltipContainer = document.createElement('div');
    // tooltipContainer.id = 'tooltip-container';
    // tooltipContainer.style.position = 'absolute';
    // tooltipContainer.style.pointerEvents = 'none';
    // tooltipContainer.style.zIndex = '1000';
    // document.body.appendChild(tooltipContainer);
    // console.log("Created tooltip container");


    console.log('INIT CALLED - STACK TRACE:', new Error().stack);
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
            10000
        );
        
        // Position camera to look at the center of the data
        console.log(`Camera looking at: (${centerX.toFixed(2)}, ${centerY.toFixed(2)}, 0)`);
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
        controls.enableDamping = false;
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
        window.geneLoader = geneLoader; // Set global reference
        cellBoundaries = new CellBoundaries(scene);
        
        // Handle window resize
        window.addEventListener('resize', onWindowResize);
        
        // Subscribe to coordinate transformation changes
        store.subscribe('geneFlipX', () => updateCameraForTransformations());
        store.subscribe('geneFlipY', () => updateCameraForTransformations());
        store.subscribe('geneSwapXY', () => updateCameraForTransformations());
        // Subscribe to z-stack changes to reset hover states
        // store.subscribe('zstack', () => {
        //     // Clear any existing hover states
        //     resetAllHoverStates();
        // });
        
        // Start animation loop
        animate();
        
        console.log('MERFISH visualization initialized');
        
        // Populate the gene selector
        window.populateGeneSelector();
        
        // Add mouse move event listener
        // document.addEventListener('mousemove', onMouseMove);

        // Initialize Z-Stack slider at the bottom
        const zstackSliderBottom = document.getElementById('zstack-slider-bottom');
        const zstackValueBottom = document.getElementById('zstack-value-bottom');
        if (zstackSliderBottom && zstackValueBottom) {
            // Set initial value from store if available
            const initialZ = store.get('zstack');
            
            // Make sure the initial z-stack is within the valid range for the current variant
            const minLayer = config.dataPaths.getMinLayer();
            const maxLayer = config.dataPaths.getMaxLayer();
            const validZ = Math.max(minLayer, Math.min(initialZ, maxLayer));
            
            // Update the slider attributes based on the current variant
            zstackSliderBottom.min = minLayer;
            zstackSliderBottom.max = maxLayer;
            
            // Update the display elements
            const layerMinElement = document.getElementById('layer-min');
            const layerMaxElement = document.getElementById('layer-max');
            if (layerMinElement) layerMinElement.textContent = minLayer;
            if (layerMaxElement) layerMaxElement.textContent = maxLayer;
            
            // Set the slider value and display
            zstackSliderBottom.value = validZ;
            zstackValueBottom.textContent = validZ;
            
            // Update the store if the value was adjusted
            if (validZ !== initialZ) {
                store.set('zstack', validZ);
            }

            // Add debouncing for z-stack slider to prevent rendering crashes
            let zstackUpdateTimeout;
            let lastZstackValue = validZ;
            
            // Update the display immediately but debounce the actual data loading
            zstackSliderBottom.addEventListener('input', (e) => {
                const val = parseInt(e.target.value, 10);
                
                // Update the display immediately for better UX
                zstackValueBottom.textContent = val;
                
                // Clear any pending updates
                clearTimeout(zstackUpdateTimeout);
                
                // Set a timeout to update the actual z-stack after a delay
                zstackUpdateTimeout = setTimeout(() => {
                    // Only update if the value has changed
                    if (val !== lastZstackValue) {
                        console.log(`Updating z-stack to ${val} (debounced)`);
                        lastZstackValue = val;
                        store.set('zstack', val);
                    }
                }, 100); // 100ms delay - adjust as needed for performance vs. responsiveness
            });
            
            // Also handle the change event to ensure the final value is applied
            zstackSliderBottom.addEventListener('change', (e) => {
                const val = parseInt(e.target.value, 10);
                
                // Clear any pending updates
                clearTimeout(zstackUpdateTimeout);
                
                // Apply the final value immediately
                if (val !== lastZstackValue) {
                    console.log(`Updating z-stack to ${val} (final)`);
                    lastZstackValue = val;
                    store.set('zstack', val);
                }
            });
        }
    } catch (error) {
        console.error('Error initializing visualization:', error);
        alert('There was an error initializing the visualization. Please check the console for details.');
    }
}

// In your mouse move event handler
function onMouseMove(event) {
    // Calculate mouse position in normalized device coordinates
    const container = document.getElementById('visualization');
    const rect = container.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Update the raycaster
    raycaster.setFromCamera(mouse, camera);
    
    // Find all hoverable objects from current z-stack
    const currentZstack = store.get('zstack');
    const hoverableObjects = [];
    scene.traverse(object => {
        if (object.userData && object.userData.hoverable) {
            // console.log('Found hoverable object with zstack:', object.userData.zstack);
            if (object.userData.zstack === currentZstack) {
                hoverableObjects.push(object);
            }
        }
    });
    
    // Log how many hoverable objects were found
    if (hoverableObjects.length > 0 && Math.random() < 0.01) { // Log occasionally to avoid console spam
        console.log(`Found ${hoverableObjects.length} hoverable objects`);
    }
    
    // Check for intersections
    const intersects = raycaster.intersectObjects(hoverableObjects);
    
    // Reset all previously hovered objects
    hoverableObjects.forEach(obj => {
        if (obj.material && obj.userData.isHovered) {
            obj.material.opacity = obj.userData.originalOpacity;
            obj.material.color.set(obj.userData.originalColor);
            obj.userData.isHovered = false;
        }
    });
    
    // Handle new hover
    if (intersects.length > 0) {
        const hoveredObject = intersects[0].object;
        hoveredObject.material.opacity = Math.min(1.0, hoveredObject.userData.originalOpacity * 1.5);
        hoveredObject.material.color.set(new THREE.Color(hoveredObject.userData.originalColor).lerp(new THREE.Color(0xffffff), 0.3));
        hoveredObject.userData.isHovered = true;
        
        console.log("Intersection found:", hoveredObject.userData);
        
        // Show tooltip if needed
        showTooltip(hoveredObject.userData, event.clientX, event.clientY);
    } else {
        // Hide tooltip
        hideTooltip();
    }
}

// Helper function to reset all hover states
function resetAllHoverStates() {
    scene.traverse(object => {
        if (object.userData && object.userData.isHovered) {
            object.material.opacity = object.userData.originalOpacity;
            object.material.color.set(object.userData.originalColor);
            object.userData.isHovered = false;
        }
    });
    
    // Hide tooltip
    hideTooltip();
}

// Show tooltip with cell information
function showTooltip(userData, x, y) {
    if (!tooltipContainer) {
        console.error("Tooltip container not found!");
        return;
    }
    
    let tooltip = tooltipContainer.querySelector('.tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        tooltip.style.color = 'white';
        tooltip.style.padding = '10px';
        tooltip.style.borderRadius = '5px';
        tooltip.style.position = 'absolute';
        tooltip.style.zIndex = '1000';
        tooltip.style.pointerEvents = 'none';
        tooltip.style.fontSize = '14px';
        tooltip.style.boxShadow = '0 2px 5px rgba(0,0,0,0.5)';
        tooltipContainer.appendChild(tooltip);
    }
    
    // Update tooltip content
    tooltip.innerHTML = `
        <div class="tooltip-content">
            <h3 style="margin-top: 0; margin-bottom: 8px;">Cell Information</h3>
            <p style="margin: 4px 0;">Cell Type: <span style="font-weight: bold;">${userData.cellType || 'Unknown'}</span></p>
            <p style="margin: 4px 0;">Cell ID: <span style="font-weight: bold;">${userData.cellId || 'Unknown'}</span></p>
            <p style="margin: 4px 0;">Z-Stack: <span style="font-weight: bold;">${userData.zstack || 'Unknown'}</span></p>
        </div>
    `;
    
    // Position tooltip near mouse
    tooltip.style.left = `${x + 15}px`;
    tooltip.style.top = `${y + 15}px`;
    tooltip.style.display = 'block';
}

// Hide tooltip
function hideTooltip() {
    const tooltip = tooltipContainer.querySelector('.tooltip');
    if (tooltip) {
        tooltip.style.display = 'none';
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

// Current gene being customized
let currentCustomizeGene = null;

/**
 * Opens the gene customization tooltip for a specific gene
 * @param {string} gene - Name of the gene to customize
 * @param {Event} event - The click event
 */
function openGeneCustomizationTooltip(gene, event) {
    // Prevent event bubbling
    event.stopPropagation();
    
    // Set the current gene being customized
    currentCustomizeGene = gene;
    
    // Get the tooltip elements
    const tooltip = document.getElementById('gene-customize-tooltip');
    const geneName = document.getElementById('customize-gene-name');
    const colorPicker = document.getElementById('gene-color-picker');
    const scaleSlider = document.getElementById('gene-scale-slider');
    const scaleValue = document.getElementById('gene-scale-value');
    
    // Set the gene name in the tooltip
    geneName.textContent = gene;
    
    // Get the current color and scale for this gene
    const geneColors = store.get('geneColors') || {};
    const geneCustomizations = store.get('geneCustomizations') || {};
    
    // Set the color picker value
    const currentColor = geneColors[gene] || '#e41a1c';
    colorPicker.value = currentColor;
    
    // Set the scale slider value
    const currentScale = geneCustomizations[gene]?.scale || 1.0;
    scaleSlider.value = currentScale;
    scaleValue.textContent = currentScale.toFixed(1);
    
    // Position the tooltip below the clicked element
    const geneItem = document.querySelector(`.active-gene-item[data-gene="${gene}"]`);
    if (geneItem) {
        const rect = geneItem.getBoundingClientRect();
        const tooltipWidth = 250; // Match the width from CSS
        
        // Center the tooltip horizontally under the gene item
        tooltip.style.left = `${rect.left + (rect.width / 2) - (tooltipWidth / 2)}px`;
        tooltip.style.top = `${rect.bottom + 5}px`;
    }
    
    // Show the tooltip
    tooltip.style.display = 'block';
}

/**
 * Closes the gene customization tooltip
 */
function closeGeneCustomizationTooltip() {
    const tooltip = document.getElementById('gene-customize-tooltip');
    tooltip.style.display = 'none';
    currentCustomizeGene = null;
}

/**
 * Applies the gene customization settings
 * @param {boolean} closeTooltip - Whether to close the tooltip after applying changes
 */
function applyGeneCustomization(closeTooltip = false) {
    if (!currentCustomizeGene) return;
    
    const colorPicker = document.getElementById('gene-color-picker');
    const scaleSlider = document.getElementById('gene-scale-slider');
    
    // Get the new color and scale
    const newColor = colorPicker.value;
    const newScale = parseFloat(scaleSlider.value);
    
    console.log(`Applying customization for gene ${currentCustomizeGene}: color=${newColor}, scale=${newScale}`);
    
    // Update the store
    const geneColors = store.get('geneColors') || {};
    const geneCustomizations = store.get('geneCustomizations') || {};
    
    // Update color
    geneColors[currentCustomizeGene] = newColor;
    
    // Update customizations
    geneCustomizations[currentCustomizeGene] = {
        ...geneCustomizations[currentCustomizeGene],
        color: newColor,
        scale: newScale
    };
    
    // Update the color indicator in the active genes list
    const activeGeneItem = document.querySelector(`.active-gene-item[data-gene="${currentCustomizeGene}"]`);
    if (activeGeneItem) {
        const colorIndicator = activeGeneItem.querySelector('.active-gene-color');
        if (colorIndicator) {
            colorIndicator.style.backgroundColor = newColor;
        }
    }
    
    // Update the color indicator in the gene selector
    const geneCheckboxItem = document.querySelector(`.gene-checkbox-item[data-gene="${currentCustomizeGene}"]`);
    if (geneCheckboxItem) {
        const colorIndicator = geneCheckboxItem.querySelector('.gene-color-indicator');
        if (colorIndicator) {
            colorIndicator.style.backgroundColor = newColor;
        }
    }
    
    // Set the store values after UI updates to trigger the subscriptions
    // This order is important to ensure all layers are updated properly
    store.set('geneCustomizations', geneCustomizations);
    store.set('geneColors', geneColors);
    
    // Force a render update to apply the changes
    store.set('forceRender', true);
    
    // Close the tooltip if requested
    if (closeTooltip) {
        closeGeneCustomizationTooltip();
    }
}

/**
 * Resets the gene customization to default values
 */
function resetGeneCustomization() {
    if (!currentCustomizeGene) return;
    
    // Generate the default color for this gene
    const genes = Object.keys(store.get('selectedGenes') || {});
    const index = genes.indexOf(currentCustomizeGene);
    const defaultColor = generateGeneColor(currentCustomizeGene, index);
    
    // Update the color picker
    const colorPicker = document.getElementById('gene-color-picker');
    colorPicker.value = defaultColor;
    
    // Reset the scale slider
    const scaleSlider = document.getElementById('gene-scale-slider');
    const scaleValue = document.getElementById('gene-scale-value');
    scaleSlider.value = 1.0;
    scaleValue.textContent = '1.0';
    
    // Apply the changes
    applyGeneCustomization();
}

/**
 * Initializes event listeners for the gene customization tooltip
 */
function initializeTooltipEventListeners() {
    // Get tooltip elements
    const tooltip = document.getElementById('gene-customize-tooltip');
    const closeBtn = tooltip.querySelector('.close-tooltip');
    const resetBtn = document.getElementById('reset-gene-customization');
    const colorPicker = document.getElementById('gene-color-picker');
    const scaleSlider = document.getElementById('gene-scale-slider');
    const scaleValue = document.getElementById('gene-scale-value');
    
    // Close button event listener
    closeBtn.addEventListener('click', closeGeneCustomizationTooltip);
    
    // Reset button event listener
    resetBtn.addEventListener('click', resetGeneCustomization);
    
    // Color picker event listener for instant updates
    colorPicker.addEventListener('input', () => {
        applyGeneCustomization(false);
    });
    
    // Scale slider event listener for instant updates
    scaleSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        scaleValue.textContent = value.toFixed(1);
        applyGeneCustomization(false);
    });
    
    // Close tooltip when clicking outside of it
    document.addEventListener('click', (e) => {
        if (tooltip.style.display === 'block' && 
            !tooltip.contains(e.target) && 
            !e.target.closest('.active-gene-item')) {
            closeGeneCustomizationTooltip();
        }
    });
}

/**
 * Adds a gene to the active genes list
 * @param {string} gene - Name of the gene
 * @param {string} color - Color of the gene
 */
function addToActiveGenesList(gene, color) {
    const activeGenesList = document.getElementById('active-genes-list');
    const emptyMessage = activeGenesList.querySelector('.empty-message');
    
    // Hide the empty message if it exists
    if (emptyMessage) {
        emptyMessage.style.display = 'none';
    }
    
    // Check if this gene is already in the list
    const existingItem = activeGenesList.querySelector(`[data-gene="${gene}"]`);
    if (existingItem) {
        return; // Already in the list
    }
    
    // Create a new active gene item
    const activeGeneItem = document.createElement('div');
    activeGeneItem.className = 'active-gene-item';
    activeGeneItem.setAttribute('data-gene', gene);
    
    // Create color indicator
    const colorIndicator = document.createElement('div');
    colorIndicator.className = 'active-gene-color';
    colorIndicator.style.backgroundColor = color;
    
    // Create gene name
    const geneName = document.createElement('div');
    geneName.className = 'active-gene-name';
    geneName.textContent = gene;
    
    // Create remove button
    const removeButton = document.createElement('div');
    removeButton.className = 'active-gene-remove';
    removeButton.innerHTML = '&times;';
    removeButton.title = 'Remove gene';
    removeButton.addEventListener('click', () => {
        // Find and uncheck the checkbox in the main list
        const checkbox = document.getElementById(`gene-${gene}`);
        if (checkbox) {
            checkbox.checked = false;
            checkbox.dispatchEvent(new Event('change'));
        }
    });
    
    // Add click event listener for customization
    activeGeneItem.addEventListener('click', (event) => {
        openGeneCustomizationTooltip(gene, event);
    });
    
    // Assemble the item
    activeGeneItem.appendChild(colorIndicator);
    activeGeneItem.appendChild(geneName);
    activeGeneItem.appendChild(removeButton);
    
    // Add to the list
    activeGenesList.appendChild(activeGeneItem);
    
    // Update the list
    updateActiveGenesList();
}

/**
 * Removes a gene from the active genes list
 * @param {string} gene - Name of the gene to remove
 */
function removeFromActiveGenesList(gene) {
    const activeGenesList = document.getElementById('active-genes-list');
    const geneItem = activeGenesList.querySelector(`[data-gene="${gene}"]`);
    
    if (geneItem) {
        activeGenesList.removeChild(geneItem);
    }
    
    // Update the list
    updateActiveGenesList();
}

/**
 * Updates the active genes list based on the current state
 */
function updateActiveGenesList() {
    const activeGenesList = document.getElementById('active-genes-list');
    const emptyMessage = activeGenesList.querySelector('.empty-message');
    const activeGenes = activeGenesList.querySelectorAll('.active-gene-item');
    
    // Show or hide the empty message
    if (activeGenes.length === 0) {
        // If no empty message exists, create one
        if (!emptyMessage) {
            const newEmptyMessage = document.createElement('div');
            newEmptyMessage.className = 'empty-message';
            newEmptyMessage.textContent = 'No genes selected';
            activeGenesList.appendChild(newEmptyMessage);
        } else {
            emptyMessage.style.display = 'block';
        }
    } else if (emptyMessage) {
        emptyMessage.style.display = 'none';
    }
}

/**
 * Clears all genes from the active genes list
 */
function clearActiveGenesList() {
    const activeGenesList = document.getElementById('active-genes-list');
    
    // Close any open customization tooltip
    closeGeneCustomizationTooltip();
    
    // Remove all gene items
    const geneItems = activeGenesList.querySelectorAll('.active-gene-item');
    geneItems.forEach(item => {
        activeGenesList.removeChild(item);
    });
    
    // Update the list to show the empty message
    updateActiveGenesList();
}

/**
 * Initializes the active genes list based on the store
 */
function initializeActiveGenesList() {
    const selectedGenes = store.get('selectedGenes') || {};
    const geneColors = store.get('geneColors') || {};
    
    // Add each selected gene to the active genes list
    Object.keys(selectedGenes).forEach(gene => {
        if (selectedGenes[gene] && geneColors[gene]) {
            addToActiveGenesList(gene, geneColors[gene]);
        }
    });
}

/**
 * Dynamically populates the gene selector with checkboxes from the gene_list.json file
 * Exported to window to allow calling from store.js
 */
window.populateGeneSelector = (function() {
    // Closure variable to track if the function has run
    let hasRun = false;
    
    // Return the actual function that will be assigned to window.populateGeneSelector
    return async function() {
        // If the function has already run, exit immediately
        if (hasRun) {
            console.log('Gene selector population already executed, skipping duplicate call');
            return;
        }
        
        console.log('Populating gene selector...');
        hasRun = true; // Mark as run immediately to prevent race conditions
        
        try {
            // Get the gene selector container
            const geneSelector = document.getElementById('gene-selector');
            if (!geneSelector) {
                console.error('Gene selector element not found');
                return;
            }
            
            // Clear existing content - important to prevent duplicates
            geneSelector.innerHTML = '';
            
            // Fetch the gene list from the JSON file using the config path
            const response = await fetch(config.dataPaths.getGeneListPath());
            
            if (!response.ok) {
                throw new Error(`Failed to fetch gene list: ${response.status} ${response.statusText}`);
            }
            
            const genes = await response.json();
            console.log('Fetched genes:', genes.length);
            
            // Sort genes alphabetically (case insensitive)
            genes.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
            
            // Prepare all gene colors in a single batch to avoid multiple store updates
            const geneColors = store.get('geneColors') || {};
            let colorsUpdated = false;
            
            // Pre-compute all missing gene colors
            genes.forEach((gene, index) => {
                if (!geneColors[gene]) {
                    geneColors[gene] = generateGeneColor(gene, index);
                    colorsUpdated = true;
                }
            });
            
            // Update store with all colors at once if any were added
            if (colorsUpdated) {
                store.set('geneColors', geneColors);
            }
            
            // Create document fragment for better performance
            const fragment = document.createDocumentFragment();
            
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
                
                // Create label
                const label = document.createElement('label');
                label.htmlFor = `gene-${gene}`;
                label.textContent = gene;
                
                // Create color indicator
                const colorIndicator = document.createElement('span');
                colorIndicator.className = 'gene-color-indicator';
                colorIndicator.style.backgroundColor = geneColors[gene];
                
                // Add event listener to checkbox
                checkbox.addEventListener('change', () => {
                    const selectedGenes = store.get('selectedGenes') || {};
                    selectedGenes[gene] = checkbox.checked;
                    store.set('selectedGenes', selectedGenes);
                    
                    if (checkbox.checked) {
                        console.log(`Selected gene: ${gene}`);
                        addToActiveGenesList(gene, geneColors[gene]);
                    } else {
                        console.log(`Unselected gene: ${gene}`);
                        removeFromActiveGenesList(gene);
                    }
                    
                    // Force a render update
                    store.set('forceRender', true);
                });
                
                // Check if this gene is already selected in the store
                const selectedGenes = store.get('selectedGenes') || {};
                if (selectedGenes[gene]) {
                    checkbox.checked = true;
                    checkboxItem.classList.add('selected');
                    colorIndicator.style.display = 'inline-block';
                } else {
                    // Initially hide color indicator if not selected
                    colorIndicator.style.display = 'none';
                }
                
                // Assemble the checkbox item
                checkboxItem.appendChild(checkbox);
                checkboxItem.appendChild(label);
                checkboxItem.appendChild(colorIndicator);
                
                // Add to fragment instead of directly to DOM
                fragment.appendChild(checkboxItem);
            });
            
            // Append the entire fragment to the DOM at once (single reflow)
            geneSelector.appendChild(fragment);
            
            console.log(`Populated gene selector with ${genes.length} genes from gene_list.json`);
            
            // Initialize the active genes list
            initializeActiveGenesList();
            
            // Mark the selector as populated with attribute
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
                    console.log('Clearing all genes by updating selectedGenes');
                    
                    // Get the current selectedGenes object
                    const currentSelectedGenes = store.get('selectedGenes') || {};
                    
                    // Create a new object with all genes set to false
                    const updatedSelectedGenes = {};
                    Object.keys(currentSelectedGenes).forEach(gene => {
                        updatedSelectedGenes[gene] = false;
                    });
                    
                    // Update the store with the new object
                    // This will trigger the store subscription in GeneLoader which will
                    // automatically remove all genes from the scene
                    store.set('selectedGenes', updatedSelectedGenes);
                    
                    // Uncheck all checkboxes in the UI
                    const checkboxes = geneSelector.querySelectorAll('.gene-checkbox');
                    checkboxes.forEach(checkbox => {
                        checkbox.checked = false;
                    });
                    
                    // Clear the active genes list
                    clearActiveGenesList();
                    
                    // Hide all color indicators
                    const colorIndicators = geneSelector.querySelectorAll('.gene-color-indicator');
                    colorIndicators.forEach(indicator => {
                        indicator.style.display = 'none';
                    });
                    
                    // Force a render update
                    store.set('forceRender', true);
                    
                    console.log('Cleared all selected genes');
                });
            }
        } catch (error) {
            console.error('Error populating gene selector:', error);
        }
    };
})();

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
        // if (cellBoundaries && cellBoundaries.boundariesGroup) {
        //     const shouldBeVisible = store.get('showCellBoundaries');
        //     if (cellBoundaries.boundariesGroup.visible !== shouldBeVisible) {
        //         console.log('Fixing cell boundaries visibility to:', shouldBeVisible);
        //         cellBoundaries.boundariesGroup.visible = shouldBeVisible;
        //     }
        // }
        
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
        // if (frameCount % 30 === 0) {
        //     // Calculate FPS based on delta time from THREE.Clock
        //     const delta = clock.getDelta();
        //     const smoothingFactor = 0.9; // For smoother FPS display
            
        //     // Get current FPS or default to 60
        //     const currentFps = store.get('fps') || 60;
            
        //     // Calculate new FPS with smoothing
        //     const newFps = delta > 0 ? Math.round(smoothingFactor * currentFps + (1 - smoothingFactor) * (1 / delta)) : currentFps;
            
        //     // Update store with calculated FPS
        //     store.set('fps', newFps);
        // }
        
        // Check if a force render is needed (e.g., after clearing gene data)
        const forceRender = store.get('forceRender');
        if (forceRender) {
            // Reset the flag
            store.set('forceRender', false);
            // console.log('Forced render triggered');
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

/**
 * Update the z-stack slider range based on the current dataset variant
 */
function updateZStackSliderRange() {
    const zstackSlider = document.getElementById('zstack-slider-bottom');
    const layerMinElement = document.getElementById('layer-min');
    const layerMaxElement = document.getElementById('layer-max');
    
    if (!zstackSlider || !layerMinElement || !layerMaxElement) return;
    
    // Get the layer range for the current variant
    const minLayer = config.dataPaths.getMinLayer();
    const maxLayer = config.dataPaths.getMaxLayer();
    
    // Update the slider attributes
    zstackSlider.min = minLayer;
    zstackSlider.max = maxLayer;
    
    // Update the display elements
    layerMinElement.textContent = minLayer;
    layerMaxElement.textContent = maxLayer;
    
    // Adjust the current z-stack value if needed
    let currentZ = store.get('zstack');
    if (currentZ < minLayer) {
        currentZ = minLayer;
        store.set('zstack', currentZ);
    } else if (currentZ > maxLayer) {
        currentZ = maxLayer;
        store.set('zstack', currentZ);
    }
    
    // Update the slider value and display
    zstackSlider.value = currentZ;
    const zstackValueBottom = document.getElementById('zstack-value-bottom');
    if (zstackValueBottom) {
        zstackValueBottom.textContent = currentZ;
    }
    
    console.log(`Updated z-stack slider range to ${minLayer}-${maxLayer} for variant ${config.dataPaths.currentVariant}`);
}

/**
 * Handle dataset variant change
 */
async function handleDatasetVariantChange() {
    const variantSelect = document.getElementById('dataset-variant-select');
    if (!variantSelect) {
        console.error('Dataset variant select not found');
        return;
    }
    
    // Get all available variants from config
    const variants = config.dataPaths.availableVariants;
    if (!variants || variants.length === 0) {
        console.error('No variants available in config');
        return;
    }
    
    console.log('Setting up variant dropdown with variants:', variants);
    
    // Clear existing options and event listeners
    variantSelect.innerHTML = '';
    const newSelect = variantSelect.cloneNode(true);
    variantSelect.parentNode.replaceChild(newSelect, variantSelect);
    
    // Add options
    variants.forEach(variant => {
        const option = document.createElement('option');
        option.value = variant;
        option.textContent = variant;
        option.selected = variant === config.dataPaths.currentVariant;
        newSelect.appendChild(option);
    });
    
    // Add change handler
    newSelect.addEventListener('change', (e) => {
        const newVariant = e.target.value;
        console.log(`Switching to variant: ${newVariant}`);
        
        // Update URL and reload page
        const url = new URL(window.location.href);
        url.searchParams.set('data', newVariant);
        console.log(`Redirecting to: ${url.toString()}`);
        window.location.href = url.toString();
    });
}

/**
 * Populate the dataset variant dropdown with options from config
 * @param {HTMLSelectElement} selectElement - The select element to populate
 */
function populateVariantDropdown(selectElement) {
    if (!selectElement) {
        console.error('Select element is null');
        return;
    }
    
    // Clear existing options
    selectElement.innerHTML = '';
    
    // Get available variants from config
    const variants = config.dataPaths.availableVariants;
    if (!variants || variants.length === 0) {
        console.error('No variants available in config');
        return;
    }
    
    const currentVariant = config.dataPaths.currentVariant;
    console.log('Available variants:', variants);
    console.log('Current variant:', currentVariant);
    
    // Add an option for each variant
    variants.forEach(variant => {
        const option = document.createElement('option');
        option.value = variant;
        option.textContent = variant;
        if (variant === currentVariant) {
            option.selected = true;
        }
        selectElement.appendChild(option);
        console.log(`Added variant option: ${variant}`);
    });
    
    console.log(`Populated variant dropdown with ${variants.length} options: ${variants.join(', ')}`);
}

// Flag to track if initialization has occurred
let hasInitialized = false;

// Initialize the application when the DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    // Only initialize once
    if (hasInitialized) {
        console.log('Application already initialized, skipping duplicate initialization');
        return;
    }
    
    console.log('DOM loaded, initializing application...');
    hasInitialized = true;
    
    // Create a loading indicator
    const loadingIndicator = document.createElement('div');
    loadingIndicator.style.position = 'fixed';
    loadingIndicator.style.top = '50%';
    loadingIndicator.style.left = '50%';
    loadingIndicator.style.transform = 'translate(-50%, -50%)';
    loadingIndicator.style.padding = '20px';
    loadingIndicator.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    loadingIndicator.style.color = 'white';
    loadingIndicator.style.borderRadius = '5px';
    loadingIndicator.style.zIndex = '9999';
    loadingIndicator.textContent = 'Initializing...';
    document.body.appendChild(loadingIndicator);
    
    try {
        // Initialize dataset variant from URL parameter if present
        config.dataPaths.initVariantFromURL();
        console.log(`Using dataset variant: ${config.dataPaths.currentVariant}`);
        loadingIndicator.textContent = 'Loading configuration...';
        
        // Load palette and clusters for initial variant
        await store.loadPaletteAndClusters();
        
        // Initialize store UI bindings first
        await Promise.resolve(store.initUIBindings());
        loadingIndicator.textContent = 'Initializing UI...';
        
        // Initialize tooltip event listeners
        await Promise.resolve(initializeTooltipEventListeners());
        
        // Initialize dataset variant handler
        await Promise.resolve(handleDatasetVariantChange());
        loadingIndicator.textContent = 'Loading dataset...';
        
        // Update z-stack slider range based on the current variant
        updateZStackSliderRange();
        
        // Then initialize the visualization
        init();
        loadingIndicator.textContent = 'Loading visualization...';
        
        // Remove loading indicator after a short delay
        setTimeout(() => {
            document.body.removeChild(loadingIndicator);
        }, 1000);
    } catch (error) {
        console.error('Error during initialization:', error);
        loadingIndicator.textContent = 'Error initializing application';
        loadingIndicator.style.backgroundColor = 'rgba(255, 0, 0, 0.8)';
        setTimeout(() => {
            document.body.removeChild(loadingIndicator);
        }, 3000);
    }
});
