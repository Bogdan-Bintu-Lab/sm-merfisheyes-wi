import * as THREE from 'three';
import { Gene } from './Gene';
import { store } from './store';
import { updateDataBounds } from './utils';
import {config} from './config';
import pako from 'pako';
import { loadingIndicator } from './LoadingIndicator.js';

/**
 * GeneLoader class for managing gene data visualization
 */
export class GeneLoader {
    /**
     * Create a new GeneLoader
     * @param {THREE.Scene} scene - The THREE.js scene
     */
    constructor(scene) {
        this.scene = scene;
        this.activeGenes = new Map();
        this.initializeSubscriptions();
    }
    
    /**
     * Initialize store subscriptions
     * @private
     */
    initializeSubscriptions() {
        // Z-stack changes
        store.subscribe('zstackImmediate', (newZStack) => {
            this.handleZStackChange(newZStack.toString());
        });
        
        // Global point size changes
        store.subscribe('pointSize', (newSize) => {
            this.handlePointSizeChange(newSize);
        });
        
        // Gene color changes
        store.subscribe('geneColors', (colors) => {
            this.handleGeneColorsChange(colors);
        });
        
        // Gene customizations
        store.subscribe('geneCustomizations', (customizations) => {
            this.handleGeneCustomizationsChange(customizations);
            // this.handlePointSizeChange(customizations);
        });
        
        // Gene selection changes
        store.subscribe('selectedGenes', (selectedGenes) => {
            this.handleGeneSelectionChange(selectedGenes);
        });
        
        // Gene visibility changes
        store.subscribe('visibleGenes', (visibleGenes) => {
            this.handleGeneVisibilityChange(visibleGenes);
        });
        
        // Transform changes
        store.subscribe('geneFlipX', (flipX) => this.updateTransforms());
        store.subscribe('geneFlipY', (flipY) => this.updateTransforms());
        store.subscribe('geneSwapXY', (swapXY) => this.updateTransforms());
    }
    
    /**
     * Load gene data
     * @param {string} geneName
     */
    async loadGene(geneName) {
        try {
            // Create new gene instance
            const gene = new Gene(geneName, this.scene);
            
            // Fetch gene data with progress tracking
            const geneDataPath = config.dataPaths.getGeneDataPath(geneName);
            const response = await loadingIndicator.fetchWithProgress(
                geneDataPath, 
                {}, 
                `Loading Gene: ${geneName}`
            );
            const data = await response.json();
            
            // Load data into gene
            await gene.loadData(data);
            
            // Add to active genes
            this.activeGenes.set(geneName, gene);
            
            // Set initial visibility based on current z-stack
            const currentZStack = store.get('zstack').toString();
            gene.setVisibleLayer(currentZStack);
            
            // Update bounds
            // this.updateDataBounds();
            
        } catch (error) {
            console.error(`Error loading gene ${geneName}:`, error);
        }
    }
    
    /**
     * Remove gene
     * @param {string} geneName
     */
    removeGene(geneName) {
        const gene = this.activeGenes.get(geneName);
        if (gene) {
            console.log(`Removing gene ${geneName}`);
            console.log(gene)
            gene.dispose();
            console.log(gene)
            this.activeGenes.delete(geneName);
            // this.updateDataBounds();
        }
    }
    
    /**
     * Clear all genes
     */
    clearAllGenes() {
        this.activeGenes.forEach(gene => gene.dispose());
        this.activeGenes.clear();
        // this.updateDataBounds();
    }
    
    /**
     * Handle z-stack changes
     * @private
     * @param {string} newZStack
     */
    handleZStackChange(newZStack) {
        this.activeGenes.forEach(gene => {
            gene.setVisibleLayer(newZStack);
        });
        // this.updateDataBounds();
    }
    
    /**
     * Handle point size changes
     * @private
     * @param {number} newSize
     */
    handlePointSizeChange(newSize) {
        console.log("New size: " + newSize);
        this.activeGenes.forEach(gene => {
            const customizations = store.get('geneCustomizations') || {};
            const geneScale = customizations[gene.getName()]?.scale || 1.0;
            gene.setScale(geneScale);
        });
    }
    
    /**
     * Handle gene color changes
     * @private
     * @param {Object} colors
     */
    handleGeneColorsChange(colors) {
        Object.entries(colors).forEach(([geneName, color]) => {
            const gene = this.activeGenes.get(geneName);
            if (gene) {
                gene.setColor(color);
            }
        });
    }
    
    /**
     * Handle gene customization changes
     * @private
     * @param {Object} customizations
     */
    handleGeneCustomizationsChange(customizations) {
        Object.entries(customizations).forEach(([geneName, settings]) => {
            const gene = this.activeGenes.get(geneName);
            if (gene && settings.scale !== undefined) {
                gene.setScale(settings.scale);
            }
        });
    }
    
    /**
     * Handle gene selection changes
     * @private
     * @param {Object} selectedGenes
     */
    handleGeneSelectionChange(selectedGenes) {
        // Load newly selected genes and unload deselected genes
        Object.entries(selectedGenes).forEach(([geneName, isSelected]) => {
            if (isSelected && !this.activeGenes.has(geneName)) {
                this.loadGene(geneName);
            } else if (!isSelected && this.activeGenes.has(geneName)) {
                this.removeGene(geneName);
            }
        });

        // Remove any genes that are no longer in selectedGenes
        this.activeGenes.forEach((gene, geneName) => {
            if (!(geneName in selectedGenes)) {
                this.removeGene(geneName);
            }
        });
    }
    
    /**
     * Handle changes to gene visibility state
     * @param {Object} visibleGenes - Object mapping gene names to visibility state
     * @private
     */
    handleGeneVisibilityChange(visibleGenes) {
        if (!visibleGenes) return;
        
        // Update visibility for all genes based on visibleGenes state
        this.activeGenes.forEach((gene, geneName) => {
            if (geneName in visibleGenes) {
                const isVisible = visibleGenes[geneName];
                gene.setVisible(isVisible);
            }
        });
    }
    
    /**
     * Update transforms for all genes
     * @private
     */
    updateTransforms() {
        const flipX = store.get('geneFlipX') || false;
        const flipY = store.get('geneFlipY') || false;
        const swapXY = store.get('geneSwapXY') || false;
        
        this.activeGenes.forEach(gene => {
            gene.updateTransforms(flipX, flipY, swapXY);
        });
    }
    
    /**
     * Update data bounds based on visible genes
     */
    updateDataBounds() {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        
        this.activeGenes.forEach(gene => {
            const bounds = gene.getBounds();
            minX = Math.min(minX, bounds.minX);
            maxX = Math.max(maxX, bounds.maxX);
            minY = Math.min(minY, bounds.minY);
            maxY = Math.max(maxY, bounds.maxY);
        });
        
        if (minX !== Infinity && maxX !== -Infinity && minY !== Infinity && maxY !== -Infinity) {
            const bounds = { minX, maxX, minY, maxY };
            store.set('dataBounds', bounds);
            // updateDataBounds(bounds);
        }
    }
    
    /**
     * Get total points being rendered
     * @returns {number}
     */
    getTotalPointsRendered() {
        let total = 0;
        this.activeGenes.forEach(gene => {
            const currentLayer = gene.getCurrentVisibleLayer();
            if (currentLayer) {
                const layer = gene.getLayer(currentLayer);
                if (layer) {
                    total += layer.getPointCount();
                }
            }
        });
        return total;
    }
    
    /**
     * Get active gene names
     * @returns {Array<string>}
     */
    getActiveGeneNames() {
        return Array.from(this.activeGenes.keys());
    }
}
