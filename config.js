/**
 * Configuration settings for the application
 * Edit this file to change data paths and other settings
 */

export const config = {
    // Data paths
    dataPaths: {
        // Base path for all data
        basePath: './data',
        
        // Current dataset to use (options: 'yiqun', 'pei', etc.)
        currentDataset: 'pei',
        
        // Function to get the full path to a dataset
        getDatasetPath: function() {
            return `${this.basePath}/${this.currentDataset}`;
        },
        
        // Function to get the gene list path
        getGeneListPath: function() {
            return `${this.getDatasetPath()}/gene_list.json`;
        },
        
        // Function to get the gene data path
        getGeneDataPath: function(geneName) {
            return `${this.getDatasetPath()}/genes_csv_gz/${geneName}.csv.gz`;
        },
        
        // Function to get the cell boundaries path
        getCellBoundariesPath: function() {
            return `${this.getDatasetPath()}/cell_boundaries.json`;
        }
    },
    
    // Visualization settings
    visualization: {
        defaultPointSize: 2.0,
        // defaultLodThreshold removed - always showing all points
        defaultBoundaryOpacity: 0.5,
        defaultBoundarySubsample: 10,
        defaultInnerColoring: true,
        defaultInnerColoringOpacity: 0.5
    }
};
