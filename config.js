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
    [ENV.DEV]: 'http://localhost:3000',  // Development server
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
        layers:1,
        
        // Function to get the full path to a dataset
        getDatasetPath: function() {
            return `${this.basePath}/${this.currentDataset}`;
        },
        
        // Function to get the gene list path
        getGeneListPath: function() {
            if (config.environment.isLocal) {
                return `${this.getDatasetPath()}/gene_list.json`;
            } else {
                return `${config.environment.serverUrl}/api/genes`;
            }
        },
        
        // Function to get the gene data path
        getGeneDataPath: function(geneName) {
            if (config.environment.isLocal) {
                return `${this.getDatasetPath()}/genes_optimized/${geneName}.json.gz`;
            } else {
                return `${config.environment.serverUrl}/api/genes/${geneName}`;
            }
        },
        
        // Function to get the cell boundaries path (compressed)
        getCellBoundariesPath: function(layer) {
            if (config.environment.isLocal) {
                return `${this.getDatasetPath()}/contours/contours_processed_compressed/contours_z_${layer}_flat.json.gz`;
            } else {
                return `${config.environment.serverUrl}/api/contours/${layer}`;
            }
        },
        
        // Function to get the cell boundaries path (uncompressed JSON)
        getCellBoundariesPathJSON: function(layer) {
            if (config.environment.isLocal) {
                return `${this.getDatasetPath()}/contours/contours_processed_uncompressed/contours_z_${layer}_flat.json`;
            } else {
                return `${config.environment.serverUrl}/api/contours/${layer}`;
            }
        }
    },
    
    // Visualization settings
    visualization: {
        defaultPointSize: 10.0,
        // defaultLodThreshold removed - always showing all points
        defaultBoundaryOpacity: 0.5,
        defaultBoundarySubsample: 10,
        defaultInnerColoring: false,
        defaultInnerColoringOpacity: 0.5
    }
};
