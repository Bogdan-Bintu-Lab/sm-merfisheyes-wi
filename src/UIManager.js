/**
 * UIManager.js
 * Handles UI components and interactions for the MERFISH visualization
 */

import { store } from './store.js';
import { config } from './config.js';

export class UIManager {
    constructor() {
        this.tooltipContainer = document.getElementById('tooltip-container');
        this.currentCustomizeGene = null;
        
        // Initialize UI components
        // Tooltip event listeners are initialized in GeneUIManager
        this.initializeControlButtons();
        this.initializeVariantDropdown();
    }
    
    /**
     * Initialize control buttons (Genes, Display, etc.)
     */
    initializeControlButtons() {
        const controlCircles = document.querySelectorAll('.control-circle');

        controlCircles.forEach(circle => {
            circle.addEventListener('click', (e) => {
                // Don't toggle if clicking inside content area (except on icon/label)
                if (
                    e.target.closest('.control-content') &&
                    !e.target.closest('.control-icon') &&
                    !e.target.closest('.control-label')
                ) {
                    return;
                }

                // Toggle active state for the clicked control
                const wasActive = circle.classList.contains('active');

                // Close all controls first
                controlCircles.forEach(c => c.classList.remove('active'));

                // If the control wasn't active before, make it active
                if (!wasActive) {
                    circle.classList.add('active');
                }

                // Prevent event from bubbling
                e.stopPropagation();
            });
        });

        // Close all controls when clicking outside
        document.addEventListener('click', () => {
            controlCircles.forEach(c => c.classList.remove('active'));
        });
    }
    
    /**
     * Initialize the dataset variant dropdown
     */
    initializeVariantDropdown() {
        const variantSelect = document.getElementById('dataset-variant-select');
        
        // Check URL for data parameter
        const urlParams = new URLSearchParams(window.location.search);
        const dataParam = urlParams.get('data');
        
        if (variantSelect) {
            // Populate the dropdown when the app is ready
            const populateDropdown = () => {
                if (window.merfishApp && window.merfishApp.populateVariantDropdown) {
                    window.merfishApp.populateVariantDropdown(variantSelect);
                } else if (window.populateVariantDropdown) {
                    window.populateVariantDropdown(variantSelect);
                } else {
                    console.warn('No populateVariantDropdown function found');
                }
                
                // If data parameter exists in URL, set it as the selected variant
                if (dataParam) {
                    // Set the dropdown value if it exists in the options
                    const optionExists = Array.from(variantSelect.options).some(option => option.value === dataParam);
                    if (optionExists) {
                        variantSelect.value = dataParam;
                        
                        // Update config and trigger change
                        if (config && config.dataPaths) {
                            config.dataPaths.setVariant(dataParam);
                        }
                        
                        // Call the appropriate handler function
                        setTimeout(() => {
                            if (window.merfishApp && window.merfishApp.handleDatasetVariantChange) {
                                window.merfishApp.handleDatasetVariantChange();
                            } else if (window.handleDatasetVariantChange) {
                                window.handleDatasetVariantChange();
                            }
                        }, 100);
                    }
                }
            };
            
            // Try to populate now, or wait for app initialization
            if (window.merfishApp || window.populateVariantDropdown) {
                populateDropdown();
            } else {
                console.warn('MERFISHApp not initialized yet, variant dropdown will be populated later');
                // Add a listener to populate when the app is ready
                window.addEventListener('merfishAppReady', populateDropdown);
            }
            
            // Add change event listener
            variantSelect.addEventListener('change', () => {
                const selectedVariant = variantSelect.value;
                
                // Update URL with the selected variant and refresh the page
                const url = new URL(window.location);
                url.searchParams.set('data', selectedVariant);
                window.location.href = url.toString(); // This will refresh the page
            });
        }
    }
    
    /**
     * Initialize the Z-Stack slider
     */
    initializeZStackSlider() {
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
                store.set('zstackImmediate', val);
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
    }
    
    /**
     * Update the z-stack slider range based on the current dataset variant
     */
    updateZStackSliderRange() {
        const zstackSliderBottom = document.getElementById('zstack-slider-bottom');
        const zstackValueBottom = document.getElementById('zstack-value-bottom');
        
        if (zstackSliderBottom && zstackValueBottom) {
            const minLayer = config.dataPaths.getMinLayer();
            const maxLayer = config.dataPaths.getMaxLayer();
            
            // Update slider attributes
            zstackSliderBottom.min = minLayer;
            zstackSliderBottom.max = maxLayer;
            
            // Update display elements
            const layerMinElement = document.getElementById('layer-min');
            const layerMaxElement = document.getElementById('layer-max');
            if (layerMinElement) layerMinElement.textContent = minLayer;
            if (layerMaxElement) layerMaxElement.textContent = maxLayer;
            
            // Ensure current value is within new range
            const currentZ = parseInt(zstackSliderBottom.value, 10);
            const validZ = Math.max(minLayer, Math.min(currentZ, maxLayer));
            
            // Update slider and display if needed
            if (currentZ !== validZ) {
                zstackSliderBottom.value = validZ;
                zstackValueBottom.textContent = validZ;
                store.set('zstack', validZ);
            }
        }
    }
    
    /**
     * Create a tooltip element
     * @returns {HTMLElement} The tooltip element
     */
    createTooltip() {
        // Create a tooltip element
        const tooltip = document.createElement('div');
        tooltip.className = 'point-tooltip';
        tooltip.style.position = 'absolute';
        tooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        tooltip.style.color = 'white';
        tooltip.style.padding = '6px 10px';
        tooltip.style.borderRadius = '4px';
        tooltip.style.fontSize = '14px';
        tooltip.style.fontFamily = 'Arial, sans-serif';
        tooltip.style.pointerEvents = 'none';
        tooltip.style.display = 'none';
        tooltip.style.zIndex = '1000';
        tooltip.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
        tooltip.style.minWidth = '80px';
        
        // Add the tooltip to the document body
        document.body.appendChild(tooltip);
        
        return tooltip;
    }
    
    /**
     * Show tooltip at a specific position with cluster value
     * @param {THREE.Vector3} position - 3D position of the point
     * @param {string} clusterValue - Value to display in the tooltip
     * @param {THREE.Camera} camera - The camera for projection
     * @param {THREE.WebGLRenderer} renderer - The renderer for dimensions
     */
    showTooltip(position, clusterValue, camera, renderer) {
        // Convert 3D position to screen coordinates
        const vector = position.clone();
        vector.project(camera);
        const tooltip = this.tooltipContainer.querySelector('.tooltip');
        
        const x = (vector.x * 0.5 + 0.5) * renderer.domElement.clientWidth;
        const y = (-vector.y * 0.5 + 0.5) * renderer.domElement.clientHeight;
        
        // Get the color for this cluster from the palette
        const clusterColor = pallete[clusterValue] || '#5e5e5e';
        
        // Set the tooltip content with a colored circle and the cluster name
        tooltip.innerHTML = `
            <div style="display: flex; align-items: center;">
                <div style="
                    width: 12px; 
                    height: 12px; 
                    border-radius: 50%; 
                    background-color: ${clusterColor}; 
                    margin-right: 6px;
                "></div>
                <span>${clusterValue}</span>
            </div>
        `;
        
        tooltip.style.left = `${x + 10}px`;
        tooltip.style.top = `${y + 10}px`;
        tooltip.style.display = 'block';
    }
    
    /**
     * Hide the tooltip
     */
    hideTooltip() {
        const tooltip = this.tooltipContainer.querySelector('.tooltip');
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
    generateGeneColor(geneName, index) {
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
}
