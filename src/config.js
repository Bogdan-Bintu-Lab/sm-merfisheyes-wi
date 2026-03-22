/**
 * Configuration settings for the application
 * Data is served from S3 static files
 */

const S3_BASE = "https://single-cell-data-yinan.s3.us-west-2.amazonaws.com";

export const config = {
    // Data paths
    dataPaths: {
        // Current dataset variant (50pe, 75pe, etc.)
        currentVariant: '6s',
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
            const urlParams = new URLSearchParams(window.location.search);
            const dataParam = urlParams.get('data');

            if (dataParam && this.availableVariants.includes(dataParam)) {
                console.log(`Setting dataset variant from URL parameter: ${dataParam}`);
                this.currentVariant = dataParam;
                return true;
            }
            return false;
        },

        // Get the S3 base path for the current variant
        getDatasetPath: function() {
            return `${S3_BASE}/sm-${this.currentVariant}`;
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
            return `${this.getDatasetPath()}/gene_list.json`;
        },

        // Function to get the gene data path (.json.gz)
        getGeneDataPath: function(geneName) {
            return `${this.getDatasetPath()}/genes_optimized/${geneName}.json.gz`;
        },

        // Function to get the clusters data path
        getClustersPath: function() {
            return `${this.getDatasetPath()}/clusters.json`;
        },

        // Function to get the palette data path
        getPalettePath: function() {
            return `${this.getDatasetPath()}/palette.json`;
        },

        // Function to get the cell boundaries path (compressed)
        getCellBoundariesPath: function(layer) {
            return `${this.getDatasetPath()}/contours/contours_processed_compressed/contours_z_${layer}_flat.json.gz`;
        },

        // Function to get the cell nuclei path (compressed)
        getCellNucleiPath: function(layer) {
            return `${this.getDatasetPath()}/contours/contours_nuclei_processed_compressed/contours_nuclei_z_${layer}_flat.json.gz`;
        },
    },

    // Visualization settings
    visualization: {
        defaultPointSize: 3.0,
        pointSizeRange: {
            min: 0.1,
            max: 10.0,
            step: 0.1
        },
        defaultBoundaryOpacity: 0.5,
        defaultBoundarySubsample: 10,
        defaultInnerColoring: true,
        defaultInnerColoringOpacity: 0.5
    }
};
