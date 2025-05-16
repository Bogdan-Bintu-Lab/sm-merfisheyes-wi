/**
 * Configuration settings for the application
 * Edit this file to change data paths and other settings
 */

// Environment configuration
const ENV = {
    LOCAL: 'local',      // Local filesystem access
    DEV: 'development',  // Development server
    PROD: 'production'   // Production server
};

// Get current environment from URL parameter, build mode, or hostname
function getEnvironment() {
    // Check if this is a production build
    try {
        // This will be defined in Vite builds
        if (import.meta.env.PROD) {
            console.log('Production build detected, using production environment');
            return ENV.PROD;
        }
    } catch (e) {
        // import.meta might not be available in some contexts
        console.log('Not running in Vite context');
    }
    
    // Check for URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const envParam = urlParams.get('env');
    
    if (envParam && Object.values(ENV).includes(envParam)) {
        console.log(`Environment set via URL parameter: ${envParam}`);
        return envParam;
    }
    
    // Check for hostname-based environment detection
    const hostname = window.location.hostname;
    if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
        console.log('Localhost detected, using local environment');
        return ENV.LOCAL;
    } else if (hostname.includes('dev.') || hostname.includes('staging.')) {
        console.log('Development hostname detected, using development environment');
        return ENV.DEV;
    } else if (hostname.includes('prod.') || hostname.includes('merfisheyes.com') || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
        console.log('Production hostname detected, using production environment');
        return ENV.PROD;
    }
    
    console.log('No environment detected, defaulting to local');
    return ENV.LOCAL; // Default to local
}

// Server URLs for different environments
const SERVER_URLS = {
    [ENV.LOCAL]: '',  // Empty means use relative paths (local filesystem)
    [ENV.DEV]: 'http://localhost:3030',  // Development server
    [ENV.PROD]: 'https://smol-merfish-be.merfisheyes.com'  // Production server (replace with actual URL)
};

// Current environment
const currentEnv = getEnvironment();
console.log(`Running in ${currentEnv} environment`);

export const config = {
    // Environment settings
    environment: {
        current: currentEnv,
        isLocal: currentEnv === ENV.LOCAL,
        isDev: currentEnv === ENV.DEV,
        isProd: currentEnv === ENV.PROD,
        serverUrl: SERVER_URLS[currentEnv]
    },
    
    // Data paths
    dataPaths: {
        // Base path for all data
        basePath: './data',
        
        // Current dataset to use
        currentDataset: 'yinan',
        // Current dataset variant (50pe, 75pe, etc.)
        currentVariant: '50pe',  // Default to 50pe
        // Available variants
        availableVariants: ['50pe', '75pe', '6s'],
        
        // Layer ranges for each variant
        variantLayers: {
            '50pe': { min: 0, max: 59 },
            '75pe': { min: 0, max: 60 },
            '6s': { min: 0, max: 79 }
        },
        
        // Nuclei visualization support for each variant
        nucleiSupport: {
            '50pe': true,
            '75pe': true,
            '6s': true
        },
        
        // Check if nuclei visualization is supported for the current variant
        hasNucleiSupport: function() {
            return this.nucleiSupport[this.currentVariant] || false;
        },
        
        // Get the number of layers for the current variant
        getLayerCount: function() {
            const range = this.variantLayers[this.currentVariant] || { min: 0, max: 0 };
            return range.max - range.min + 1;
        },
        
        // Get the min layer for the current variant
        getMinLayer: function() {
            const range = this.variantLayers[this.currentVariant] || { min: 0, max: 0 };
            return range.min;
        },
        
        // Get the max layer for the current variant
        getMaxLayer: function() {
            const range = this.variantLayers[this.currentVariant] || { min: 0, max: 0 };
            return range.max;
        },
        
        // Initialize dataset variant from URL parameter if present
        initVariantFromURL: function() {
            // Check for 'data' parameter in URL
            const urlParams = new URLSearchParams(window.location.search);
            const dataParam = urlParams.get('data');
            
            if (dataParam && this.availableVariants.includes(dataParam)) {
                console.log(`Setting dataset variant from URL parameter: ${dataParam}`);
                this.currentVariant = dataParam;
                return true;
            }
            return false;
        },
        
        // Function to get the full path to a dataset
        getDatasetPath: function() {
            return `${this.basePath}/${this.currentDataset}/${this.currentVariant}`;
        },
        
        // Function to set the current variant
        setVariant: function(variant) {
            if (this.availableVariants.includes(variant)) {
                this.currentVariant = variant;
                console.log(`Dataset variant set to: ${variant}`);
                return true;
            } else {
                console.error(`Invalid variant: ${variant}. Available variants: ${this.availableVariants.join(', ')}`);
                return false;
            }
        },
        
        // Function to get the gene list path
        getGeneListPath: function() {
            if (config.environment.isLocal) {
                return `${this.getDatasetPath()}/gene_list.json`;
            } else {
                return `${config.environment.serverUrl}/api/genes?data=${this.currentVariant}`;
            }
        },
        
        // Function to get the gene data path
        getGeneDataPath: function(geneName) {
            if (config.environment.isLocal) {
                return `${this.getDatasetPath()}/genes_optimized/${geneName}.json.gz`;
            } else {
                return `${config.environment.serverUrl}/api/genes/${geneName}?data=${this.currentVariant}`;
            }
        },

        // Function to get the clusters data path
        getClustersPath: function() {
            if (config.environment.isLocal) {
                return `${this.getDatasetPath()}/clusters.json`;
            } else {
                return `${config.environment.serverUrl}/api/data/${this.currentDataset}/${this.currentVariant}/clusters.json`;
            }
        },

        // Function to get the palette data path
        getPalettePath: function() {
            if (config.environment.isLocal) {
                return `${this.getDatasetPath()}/palette.json`;
            } else {
                return `${config.environment.serverUrl}/api/data/${this.currentDataset}/${this.currentVariant}/palette.json`;
            }
        },
        
        // Function to get the cell boundaries path (compressed)
        getCellBoundariesPath: function(layer) {
            if (config.environment.isLocal) {
                return `${this.getDatasetPath()}/contours/contours_processed_compressed/contours_z_${layer}_flat.json.gz`;
            } else {
                return `${config.environment.serverUrl}/api/contours/${layer}?data=${this.currentVariant}`;
            }
        },
        
        // Function to get the cell boundaries path (uncompressed JSON)
        getCellBoundariesPathJSON: function(layer) {
            if (config.environment.isLocal) {
                // Since we don't have an uncompressed directory, we'll use the raw contours as fallback
                return `${this.getDatasetPath()}/contours/contours_raw/contours_z_${layer}_flat.json`;
            } else {
                return `${config.environment.serverUrl}/api/contours/${layer}?data=${this.currentVariant}`;
            }
        },
        
        // Function to get the cell nuclei path (compressed)
        getCellNucleiPath: function(layer) {
            if (config.environment.isLocal) {
                return `${this.getDatasetPath()}/contours/contours_nuclei_processed_compressed/contours_nuclei_z_${layer}_flat.json.gz`;
            } else {
                return `${config.environment.serverUrl}/api/nuclei/${layer}?data=${this.currentVariant}`;
            }
        },
        
        // Function to get the cell nuclei path (uncompressed JSON)
        getCellNucleiPathJSON: function(layer) {
            if (config.environment.isLocal) {
                return `${this.getDatasetPath()}/contours/contours_nuclei_processed_uncompressed/contours_nuclei_z_${layer}_flat.json`;
            } else {
                return `${config.environment.serverUrl}/api/nuclei/${layer}?data=${this.currentVariant}`;
            }
        },
    },
    
    // Visualization settings
    visualization: {
        defaultPointSize: 1.0,
        pointSizeRange: {
            min: 0.1,
            max: 3.0,
            step: 0.1
        },
        // defaultLodThreshold removed - always showing all points
        defaultBoundaryOpacity: 0.5,
        defaultBoundarySubsample: 10,
        defaultInnerColoring: true,
        defaultInnerColoringOpacity: 0.5
    }
};
