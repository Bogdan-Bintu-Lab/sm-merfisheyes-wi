/**
 * Simple reactive store for managing global state
 * Provides methods for getting, setting, and subscribing to state changes
 */
class Store {
    constructor() {
        // Initialize state
        this.state = {
            // Visualization settings
            pointSize: 2,
            boundaryOpacity: 0.5,
            boundarySubsample: 10,
            showCellBoundaries: true,
            lodThreshold: 1.0,
            
            // Gene coordinate transformations
            geneFlipX: false,
            geneFlipY: false,
            geneSwapXY: false,
            
            // Cell boundary coordinate transformations
            boundaryFlipX: false,
            boundaryFlipY: false,
            boundarySwapXY: false,
            
            // Current state
            currentGene: null,
            geneData: null,
            cellBoundaries: null,
            cameraDistance: 5000,
            
            // Performance metrics
            fps: 0,
            pointsRendered: 0,
            boundariesRendered: 0
        };
        
        // Subscribers
        this.subscribers = {};
        
        // Initialize UI bindings
        this.initUIBindings();
        
        console.log('Store initialized');
    }
    
    /**
     * Get a value from the store
     * @param {string} key - Key to get
     * @returns {*} Value for the key
     */
    get(key) {
        return this.state[key];
    }
    
    /**
     * Set a value in the store and notify subscribers
     * @param {string} key - Key to set
     * @param {*} value - Value to set
     */
    set(key, value) {
        try {
            // Update state
            this.state[key] = value;
            
            // Notify subscribers
            if (this.subscribers[key]) {
                this.subscribers[key].forEach(callback => {
                    try {
                        callback(value);
                    } catch (error) {
                        console.error(`Error in subscriber callback for ${key}:`, error);
                    }
                });
            }
            
            // Update UI if element exists
            this.updateUI(key, value);
        } catch (error) {
            console.error(`Error setting store value for ${key}:`, error);
        }
    }
    
    /**
     * Subscribe to changes for a specific key
     * @param {string} key - Key to subscribe to
     * @param {Function} callback - Callback function to call when key changes
     */
    subscribe(key, callback) {
        if (!this.subscribers[key]) {
            this.subscribers[key] = [];
        }
        
        this.subscribers[key].push(callback);
        
        // Immediately call callback with current value
        callback(this.state[key]);
    }
    
    /**
     * Initialize UI bindings for inputs and displays
     */
    initUIBindings() {
        try {
            // Bind inputs with their value displays
            this.bindInputWithLabel('pointSize', 'point-size-input', 'point-size-value');
            this.bindInputWithLabel('boundaryOpacity', 'boundary-opacity-input', 'boundary-opacity-value');
            this.bindInputWithLabel('boundarySubsample', 'boundary-subsample-input', 'boundary-subsample-value');
            this.bindInputWithLabel('lodThreshold', 'lod-threshold-input', 'lod-threshold-value');
            
            // Bind checkboxes
            this.bindCheckbox('showCellBoundaries', 'show-boundaries-checkbox');
            
            // Gene transformation checkboxes
            this.bindCheckbox('geneFlipX', 'gene-flip-x-checkbox');
            this.bindCheckbox('geneFlipY', 'gene-flip-y-checkbox');
            this.bindCheckbox('geneSwapXY', 'gene-swap-xy-checkbox');
            
            // Cell boundary transformation checkboxes
            this.bindCheckbox('boundaryFlipX', 'boundary-flip-x-checkbox');
            this.bindCheckbox('boundaryFlipY', 'boundary-flip-y-checkbox');
            this.bindCheckbox('boundarySwapXY', 'boundary-swap-xy-checkbox');
            
            // Bind gene selection
            const geneSelect = document.getElementById('gene-select');
            if (geneSelect) {
                geneSelect.addEventListener('change', () => {
                    this.set('currentGene', geneSelect.value);
                });
            }
            
            // Subscribe to performance metrics for display
            this.subscribe('fps', fps => this.updateMetric('fps-value', fps.toFixed(1)));
            this.subscribe('pointsRendered', points => this.updateMetric('points-rendered-value', points.toLocaleString()));
            this.subscribe('boundariesRendered', points => this.updateMetric('boundaries-rendered-value', points.toLocaleString()));
            
            console.log('UI bindings initialized');
        } catch (error) {
            console.error('Error initializing UI bindings:', error);
        }
    }
    
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
        
        // Set initial value
        input.value = this.state[key];
        
        // Update label with initial value
        if (label) {
            label.textContent = this.state[key];
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
    }
    
    /**
     * Bind a checkbox element to a store value
     * @param {string} key - Store key
     * @param {string} checkboxId - ID of checkbox element
     */
    bindCheckbox(key, checkboxId) {
        const checkbox = document.getElementById(checkboxId);
        if (!checkbox) return;
        
        // Set initial value
        checkbox.checked = this.state[key];
        
        // Listen for changes
        checkbox.addEventListener('change', () => {
            this.set(key, checkbox.checked);
        });
        
        // Update checkbox when store changes
        this.subscribe(key, value => {
            if (checkbox.checked !== value) {
                checkbox.checked = value;
            }
        });
    }
    
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
    }
    
    /**
     * Update UI element based on store key
     * @param {string} key - Store key
     * @param {*} value - New value
     */
    updateUI(key, value) {
        // Handle specific UI updates based on key
        switch (key) {
            case 'currentGene':
                const geneSelect = document.getElementById('gene-select');
                if (geneSelect && geneSelect.value !== value) {
                    geneSelect.value = value;
                }
                break;
                
            // Add more specific UI updates as needed
        }
    }
    
    /**
     * Apply gene coordinate transformations to a point
     * @param {Object} point - Point with x and y properties
     * @returns {Object} Transformed point
     */
    transformGenePoint(point) {
        const flipX = this.state.geneFlipX;
        const flipY = this.state.geneFlipY;
        const swapXY = this.state.geneSwapXY;
        
        // Create a copy to avoid modifying the original
        const result = { ...point };
        
        // Apply transformations
        if (swapXY) {
            // Swap x and y
            const temp = result.x;
            result.x = result.y;
            result.y = temp;
        }
        
        // Apply flips after potential swap
        if (flipX) {
            // Flip x-axis (use data bounds from main.js)
            const minX = 0;
            const maxX = 10000;
            result.x = maxX - (result.x - minX);
        }
        
        if (flipY) {
            // Flip y-axis
            const minY = 0;
            const maxY = 10000;
            result.y = maxY - (result.y - minY);
        }
        
        return result;
    }
    
    /**
     * Apply cell boundary coordinate transformations to a point
     * @param {Object} point - Point with x and y properties
     * @returns {Object} Transformed point
     */
    transformBoundaryPoint(point) {
        const flipX = this.state.boundaryFlipX;
        const flipY = this.state.boundaryFlipY;
        const swapXY = this.state.boundarySwapXY;
        
        // Create a copy to avoid modifying the original
        const result = { ...point };
        
        // Apply transformations
        if (swapXY) {
            // Swap x and y
            const temp = result.x;
            result.x = result.y;
            result.y = temp;
        }
        
        // Apply flips after potential swap
        if (flipX) {
            // Flip x-axis (use data bounds from main.js)
            const minX = 0;
            const maxX = 10000;
            result.x = maxX - (result.x - minX);
        }
        
        if (flipY) {
            // Flip y-axis
            const minY = 0;
            const maxY = 10000;
            result.y = maxY - (result.y - minY);
        }
        
        return result;
    }
}

// Create global store instance
export const store = new Store();
