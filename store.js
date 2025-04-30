/**
 * Simple reactive store for managing application state
 */
import { config } from './config.js';

export const store = {
    // Private state
    _state: {
        // Dataset settings
        currentDataset: config.dataPaths.currentDataset,
        
        // Visualization settings
        cameraDistance: 5000,
        pointSize: config.visualization.defaultPointSize,
        // lodThreshold removed - always showing all points
        boundaryOpacity: config.visualization.defaultBoundaryOpacity,
        boundarySubsample: config.visualization.defaultBoundarySubsample,
        innerColoring: config.visualization.defaultInnerColoring, // New state property
        innerColoringOpacity: config.visualization.defaultInnerColoringOpacity, // New state property
        useIntensityColor: true,
        intensityMin: 0,
        intensityMax: 255,
        
        // Gene data
        selectedGenes: {},  // Object with gene names as keys and boolean values
        geneData: {},       // Object with gene names as keys and point data as values
        pointsRendered: 0,
        geneColors: {},     // Object with gene names as keys and color values
        geneCustomizations: {}, // Object with gene names as keys and customization objects (color, scale)
        
        // Gene transformations
        geneFlipX: false,
        geneFlipY: false,
        geneSwapXY: false,
        
        // Cell boundary transformations
        boundaryFlipX: false,
        boundaryFlipY: false,
        boundarySwapXY: false,

        // Data bounds for centering
        dataBounds: {
            minX: 0,
            maxX: 10000,
            minY: 0,
            maxY: 10000
        },
        
        // UI state
        showCellBoundaries: true,
        showControls: true,
        
        // Render control
        forceRender: false,
        
        // Debounce control
        lastGeneChangeTime: 0,
        geneChangeDebounceMs: 300, // Debounce time in milliseconds
        
        // Z-Stack control
        zstack: 54
    },
    
    // Subscribers
    _subscribers: {},
    
    /**
     * Get a value from the store
     * @param {string} key - The key to get
     * @returns {*} The value
     */
    get(key) {
        return this._state[key];
    },
    
    /**
     * Set a value in the store and notify subscribers
     * @param {string} key - The key to set
     * @param {*} value - The value to set
     */
    set(key, value) {
        // Special handling for currentGene to prevent rapid changes
        if (key === 'currentGene') {
            const now = Date.now();
            const timeSinceLastChange = now - this._state.lastGeneChangeTime;
            
            // If we're changing to the same gene, ignore
            if (value === this._state.currentGene) {
                console.log(`Ignoring duplicate gene change to ${value}`);
                return;
            }
            
            // If we're changing too quickly, debounce
            if (timeSinceLastChange < this._state.geneChangeDebounceMs) {
                console.log(`Debouncing gene change to ${value}, too soon after last change`);
                return;
            }
            
            // Update the last change time
            this._state.lastGeneChangeTime = now;
            
            console.log(`Changing gene from ${this._state.currentGene} to ${value}`);
        }
        
        // Update the state
        this._state[key] = value;
        
        // Notify subscribers
        if (this._subscribers[key]) {
            this._subscribers[key].forEach(callback => callback(value));
        }
    },
    
    /**
     * Subscribe to changes in a key
     * @param {string} key - The key to subscribe to
     * @param {Function} callback - The callback to call when the key changes
     */
    subscribe(key, callback) {
        if (!this._subscribers[key]) {
            this._subscribers[key] = [];
        }
        this._subscribers[key].push(callback);
    },
    
    /**
     * Unsubscribe from changes in a key
     * @param {string} key - The key to unsubscribe from
     * @param {Function} callback - The callback to remove
     */
    unsubscribe(key, callback) {
        if (this._subscribers[key]) {
            this._subscribers[key] = this._subscribers[key].filter(cb => cb !== callback);
        }
    },
    
    /**
     * Initialize UI bindings for inputs and displays
     */
    initUIBindings() {
        // Ensure DOM is ready before binding UI elements
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this._initUIBindings();
            });
        } else {
            this._initUIBindings();
        }
    },
    
    /**
     * Internal method to initialize UI bindings
     * Called once DOM is ready
     */
    _initUIBindings() {
        try {
            console.log('Initializing UI bindings...');
            // Bind inputs with their value displays
            this.bindInputWithLabel('pointSize', 'point-size-input', 'point-size-value');
            // LOD threshold binding removed - always showing all points
            this.bindInputWithLabel('boundaryOpacity', 'boundary-opacity-input', 'boundary-opacity-value');
            this.bindInputWithLabel('boundarySubsample', 'boundary-subsample-input', 'boundary-subsample-value');
            this.bindInputWithLabel('intensityMin', 'intensity-min-input', 'intensity-min-value');
            this.bindInputWithLabel('intensityMax', 'intensity-max-input', 'intensity-max-value');
            this.bindInputWithLabel('innerColoringOpacity', 'inner-coloring-opacity-input', 'inner-coloring-opacity-value');
            
            // Dataset selector removed from UI, now using config.js
            // Subscribe to dataset changes
// this.subscribe('currentDataset', () => {
                //     // This will trigger reloading of gene list and data
//     window.populateGeneSelector();
// });
             
            // Initialize dataset from config
            this.set('currentDataset', config.dataPaths.currentDataset);
            
            // Bind checkboxes
            this.bindCheckbox('showCellBoundaries', 'show-boundaries-checkbox');
            this.bindCheckbox('useIntensityColor', 'use-intensity-color-checkbox');
            
            // Gene transformation checkboxes
            this.bindCheckbox('geneFlipX', 'gene-flip-x-checkbox');
            this.bindCheckbox('geneFlipY', 'gene-flip-y-checkbox');
            this.bindCheckbox('geneSwapXY', 'gene-swap-xy-checkbox');
            
            // Cell boundary transformation checkboxes
            this.bindCheckbox('boundaryFlipX', 'boundary-flip-x-checkbox');
            this.bindCheckbox('boundaryFlipY', 'boundary-flip-y-checkbox');
            this.bindCheckbox('boundarySwapXY', 'boundary-swap-xy-checkbox');
            
            // Bind inner coloring checkbox
            this.bindCheckbox('innerColoring', 'inner-coloring-checkbox');
            
            // Bind gene selection
            const geneSelect = document.getElementById('gene-select');
            if (geneSelect) {
                geneSelect.addEventListener('change', () => {
                    const newGene = geneSelect.value;
                    
                    // Only update if the gene has actually changed
                    if (newGene !== this.get('currentGene')) {
                        console.log(`Changing gene from ${this.get('currentGene')} to ${newGene}`);
                        
                        // Clear previous gene data from state
                        this.set('geneData', null);
                        
                        // Set new gene
                        this.set('currentGene', newGene);
                    }
                });
                
                // Update the dropdown to match the current gene in the store
                this.subscribe('currentGene', (geneName) => {
                    if (geneName && geneSelect.value !== geneName) {
                        geneSelect.value = geneName;
                    }
                });
            }
            
            // Subscribe to performance metrics for display
            this.subscribe('pointsRendered', points => this.updateMetric('points-rendered-value', points.toLocaleString()));
            
            console.log('UI bindings initialized');
        } catch (error) {
            console.error('Error initializing UI bindings:', error);
        }
        
        // Log the state of all checkboxes after binding
        console.log('UI Bindings initialized with state:', {
            showCellBoundaries: this.get('showCellBoundaries'),
            useIntensityColor: this.get('useIntensityColor'),
            geneFlipX: this.get('geneFlipX'),
            geneFlipY: this.get('geneFlipY'),
            geneSwapXY: this.get('geneSwapXY'),
            boundaryFlipX: this.get('boundaryFlipX'),
            boundaryFlipY: this.get('boundaryFlipY'),
            boundarySwapXY: this.get('boundarySwapXY')
        });
        
        // Populate gene selector - this is the ONE place it should be called
        // if (typeof window.populateGeneSelector === 'function') {
        //     window.populateGeneSelector();
        // }
    },
    
    /**
     * Bind an input element with its value display label
     * @param {string} key - Store key
     * @param {string} inputId - ID of input element
     * @param {string} labelId - ID of label element to display the value
     */
    bindInputWithLabel(key, inputId, labelId) {
        const input = document.getElementById(inputId);
        const label = document.getElementById(labelId);
        
        if (!input) return;
        
        // Get initial value with a fallback
        const initialValue = this.get(key);
        const defaultValues = {
            'pointSize': 1000.0,
            // lodThreshold removed - always showing all points
            'boundaryOpacity': 0.5,
            'boundarySubsample': 10,
            'intensityMin': 0,
            'intensityMax': 255,
            'innerColoringOpacity': 0.5
        };
        
        // Use default value if undefined
        if (initialValue === undefined || initialValue === null) {
            this.set(key, defaultValues[key] || 0);
        }
        
        // Set initial value
        input.value = this.get(key);
        
        // Update label with initial value
        if (label) {
            label.textContent = this.get(key);
        }
        
        // Listen for changes
        input.addEventListener('input', () => {
            const value = parseFloat(input.value);
            if (!isNaN(value)) {
                this.set(key, value);
                
                // Update label
                if (label) {
                    label.textContent = value;
                }
            }
        });
        
        // Update input and label when store changes
        this.subscribe(key, value => {
            if (input.value !== value.toString()) {
                input.value = value;
            }
            
            if (label) {
                label.textContent = value;
            }
        });
    },
    
    /**
     * Bind a checkbox element to a store value
     * @param {string} key - Store key
     * @param {string} checkboxId - ID of checkbox element
     */
    bindCheckbox(key, checkboxId) {
        const checkbox = document.getElementById(checkboxId);
        if (!checkbox) {
            console.warn(`Checkbox with ID ${checkboxId} not found for key ${key}`);
            return;
        }
        
        // Remove any existing event listeners to prevent duplicates
        const newCheckbox = checkbox.cloneNode(true);
        checkbox.parentNode.replaceChild(newCheckbox, checkbox);
        
        // Set initial value from store
        const initialValue = this.get(key);
        newCheckbox.checked = initialValue;
        console.log(`Initial ${key} value:`, initialValue);
        
        // Listen for changes
        newCheckbox.addEventListener('change', () => {
            const newValue = newCheckbox.checked;
            console.log(`${key} checkbox changed to:`, newValue);
            this.set(key, newValue);
            
            // Force a render update
            this.set('forceRender', !this.get('forceRender'));
        });
        
        // Update checkbox when store changes
        this.subscribe(key, value => {
            console.log(`${key} store value changed to:`, value);
            if (newCheckbox.checked !== value) {
                newCheckbox.checked = value;
            }
        });
    },
    
    /**
     * Update a metric display element
     * @param {string} elementId - ID of element to update
     * @param {string} value - Value to display
     */
    updateMetric(elementId, value) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
        }
    },
    
    /**
     * Apply gene coordinate transformations to a point
     * @param {Object} point - Point with x and y properties
     * @returns {Object} Transformed point
     */
    transformGenePoint(point) {
        const flipX = this.get('geneFlipX');
        const flipY = this.get('geneFlipY');
        const swapXY = this.get('geneSwapXY');
        
        // Get the data bounds from the store
        const dataBounds = this.get('dataBounds') || {
            minX: 0,
            maxX: 10000,
            minY: 0,
            maxY: 10000
        };
        
        // Create a copy to avoid modifying the original
        const result = { ...point };
        
        // Apply transformations in the correct order
        
        // 1. First apply swap if needed
        if (swapXY) {
            // Swap x and y
            const temp = result.x;
            result.x = result.y;
            result.y = temp;
        }
        
        // 2. Then apply flips
        if (flipX) {
            // Calculate the center of the X axis
            const centerX = (dataBounds.minX + dataBounds.maxX) / 2;
            // Flip around the center
            result.x = 2 * centerX - result.x;
        }
        
        if (flipY) {
            // Calculate the center of the Y axis
            const centerY = (dataBounds.minY + dataBounds.maxY) / 2;
            // Flip around the center
            result.y = 2 * centerY - result.y;
        }
        
        return result;
    },
    
    /**
     * Apply cell boundary coordinate transformations to a point
     * @param {Object} point - Point with x and y properties
     * @returns {Object} Transformed point
     */
    transformBoundaryPoint(point) {
        const flipX = this.get('boundaryFlipX');
        const flipY = this.get('boundaryFlipY');
        const swapXY = this.get('boundarySwapXY');
        
        // Get the data bounds from the store
        const dataBounds = this.get('dataBounds') || {
            minX: 0,
            maxX: 10000,
            minY: 0,
            maxY: 10000
        };
        
        // Create a copy to avoid modifying the original
        const result = { ...point };
        
        // Apply transformations in the correct order
        
        // 1. First apply swap if needed
        if (swapXY) {
            // Swap x and y
            const temp = result.x;
            result.x = result.y;
            result.y = temp;
        }
        
        // 2. Then apply flips
        if (flipX) {
            // Calculate the center of the X axis
            const centerX = (dataBounds.minX + dataBounds.maxX) / 2;
            // Flip around the center
            result.x = 2 * centerX - result.x;
        }
        
        if (flipY) {
            // Calculate the center of the Y axis
            const centerY = (dataBounds.minY + dataBounds.maxY) / 2;
            // Flip around the center
            result.y = 2 * centerY - result.y;
        }
        
        return result;
    }
};

// UI bindings are initialized in main.js when DOM is ready
