/**
 * Main application file for MERFISH visualization
 * Sets up Three.js scene, camera, and renderer
 * Manages the visualization lifecycle
 * Optimized for rendering up to 8 million points efficiently
 * Refactored to use class-based architecture
 */

import { store } from "./store.js";
import { GeneLoader } from "./GeneLoader.js";
import { CellBoundaries } from "./cellBoundaries.js";
import { config } from "./config.js";
import { initializeCircularControls } from "./controls.js";
import { SceneManager } from "./SceneManager.js";
import { UIManager } from "./UIManager.js";
import { GeneUIManager } from "./GeneUIManager.js";

/**
 * Main application class for MERFISH visualization
 * Orchestrates the interaction between scene, UI, and data components
 */
class MERFISHApp {
  constructor() {
    // Initialize managers
    this.sceneManager = null;
    this.uiManager = null;
    this.geneUIManager = null;

    // Initialize loaders
    this.geneLoader = null;
    this.cellBoundaries = null;

    // Flag to track if initialization has occurred
    this.hasInitialized = false;
  }

  /**
   * Initialize the application
   * @returns {Promise<boolean>} - True if initialization was successful
   */
  async initialize() {
    if (this.hasInitialized) {
      // console.log('Application already initialized, skipping');
      return true;
    }

    try {
      // console.log('Initializing MERFISH application...');

      // Initialize dataset variant from URL parameter if present
      config.dataPaths.initVariantFromURL();
      // console.log(`Using dataset variant: ${config.dataPaths.currentVariant}`);

      // Load palette and clusters for initial variant
      await store.loadPaletteAndClusters();

      // Initialize scene manager
      this.sceneManager = new SceneManager("visualization");
      const initialized = this.sceneManager.initialize();
      if (!initialized) {
        throw new Error("Failed to initialize SceneManager");
      }

      // Initialize UI managers
      this.uiManager = new UIManager();
      this.geneUIManager = new GeneUIManager(this.uiManager);

      // Initialize loaders
      this.geneLoader = new GeneLoader(this.sceneManager.getScene());
      window.geneLoader = this.geneLoader; // Set global reference for backward compatibility
      this.cellBoundaries = new CellBoundaries(
        this.sceneManager.getScene(),
        this.sceneManager
      );

      // Initialize UI components
      this.uiManager.initializeZStackSlider();
      this.handleDatasetVariantChange();

      // Populate the gene selector
      await this.geneUIManager.populateGeneSelector();

      // Start animation loop
      this.sceneManager.start();

      // Set initialization flag
      this.hasInitialized = true;

      // console.log('MERFISH visualization initialized successfully');
      return true;
    } catch (error) {
      console.error("Error initializing visualization:", error);
      alert(
        "There was an error initializing the visualization. Please check the console for details."
      );
      return false;
    }
  }

  /**
   * Update data bounds for all genes
   * Delegates to the scene manager
   */
  updateDataBoundsForAllGenes() {
    if (!this.geneLoader) return;

    // Get all points from all genes
    const allPoints = this.geneLoader.getAllPoints();
    if (allPoints && allPoints.length > 0) {
      this.sceneManager.updateDataBounds(allPoints);
    }
  }

  /**
   * Handle dataset variant change
   */
  handleDatasetVariantChange() {
    // Update z-stack slider range
    this.uiManager.updateZStackSliderRange();

    // Clear any loaded genes and reset UI
    if (this.geneLoader) {
      this.geneLoader.clearAllGenes();
    }

    // Get the gene selector and reset its populated state
    const geneSelector = document.getElementById("gene-selector");
    if (geneSelector) {
      // Only repopulate if we've already initialized
      if (this.hasInitialized) {
        geneSelector.setAttribute("data-populated", "false");
        geneSelector.innerHTML = "";
        // Reset the gene selector
        this.geneUIManager.populateGeneSelector();
      }
      // Otherwise, it will be populated during initialization
    }
  }

  /**
   * Populate the dataset variant dropdown with options from config
   * @param {HTMLSelectElement} selectElement - The select element to populate
   */
  populateVariantDropdown(selectElement) {
    if (!selectElement) return;

    // Clear existing options
    selectElement.innerHTML = "";

    // Get variants from config's availableVariants array
    const availableVariants = config.dataPaths.availableVariants;

    // Add options for each variant
    availableVariants.forEach((variantId) => {
      const option = document.createElement("option");
      option.value = variantId;
      option.textContent = variantId; // Using the ID as the display name
      selectElement.appendChild(option);
    });

    // Set the selected option based on the current variant
    const currentVariant = config.dataPaths.currentVariant;
    if (currentVariant) {
      selectElement.value = currentVariant;
    }

    // Add change event listener
    selectElement.addEventListener("change", (e) => {
      const variantId = e.target.value;
      config.dataPaths.setCurrentVariant(variantId);
      this.handleDatasetVariantChange();
    });
  }
}

// Initialize the application when the DOM is ready
document.addEventListener("DOMContentLoaded", async () => {
  // Only initialize once
  if (hasInitialized) {
    console.log(
      "Application already initialized, skipping duplicate initialization"
    );
    return;
  }

  console.log("DOM loaded, initializing application...");
  hasInitialized = true;

  // Create a loading indicator
  const loadingIndicator = document.createElement("div");
  loadingIndicator.style.position = "fixed";
  loadingIndicator.style.top = "50%";
  loadingIndicator.style.left = "50%";
  loadingIndicator.style.transform = "translate(-50%, -50%)";
  loadingIndicator.style.padding = "20px";
  loadingIndicator.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
  loadingIndicator.style.color = "white";
  loadingIndicator.style.borderRadius = "5px";
  loadingIndicator.style.zIndex = "9999";
  loadingIndicator.textContent = "Initializing...";
  document.body.appendChild(loadingIndicator);

  try {
    // Initialize store UI bindings first
    await Promise.resolve(store.initUIBindings());
    loadingIndicator.textContent = "Initializing UI...";

    // Initialize the MERFISH application with all managers
    window.merfishApp = new MERFISHApp();
    // console.log("merfishApp", window.merfishApp);
    await window.merfishApp.initialize();
    loadingIndicator.textContent = "Loading visualization...";

    // Remove loading indicator after a short delay
    setTimeout(() => {
      document.body.removeChild(loadingIndicator);
    }, 1000);
  } catch (error) {
    console.error("Error during initialization:", error);
    loadingIndicator.textContent = "Error initializing application";
    loadingIndicator.style.backgroundColor = "rgba(255, 0, 0, 0.8)";
  }
});
/**
 * Update camera position and rotation based on data transformations
 * This is kept for backward compatibility
 */
window.updateCameraForTransformations = function () {
  if (window.merfishApp && window.merfishApp.sceneManager) {
    window.merfishApp.sceneManager.updateCameraForTransformations();
  }
};

/**
 * Update data bounds for all genes
 * This is kept for backward compatibility
 */
window.updateDataBoundsForAllGenes = function () {
  if (window.merfishApp) {
    window.merfishApp.updateDataBoundsForAllGenes();
  }
};

/**
 * Populate gene selector
 * This is kept for backward compatibility
 */
window.populateGeneSelector = async function () {
  if (window.merfishApp && window.merfishApp.geneUIManager) {
    // Check if already populated to prevent duplicates
    const geneSelector = document.getElementById("gene-selector");
    if (
      geneSelector &&
      geneSelector.getAttribute("data-populated") === "true"
    ) {
      console.log("Gene selector already populated, skipping");
      return;
    }
    return window.merfishApp.geneUIManager.populateGeneSelector();
  }
};

/**
 * Create tooltip
 * This is kept for backward compatibility
 */
window.createTooltip = function () {
  if (window.merfishApp && window.merfishApp.uiManager) {
    return window.merfishApp.uiManager.createTooltip();
  }
  return null;
};

/**
 * Update tooltip
 * This is kept for backward compatibility
 */
window.updateTooltip = function (tooltip, x, y, content) {
  if (window.merfishApp && window.merfishApp.uiManager) {
    window.merfishApp.uiManager.updateTooltip(tooltip, x, y, content);
  }
};

/**
 * Hide tooltip
 * This is kept for backward compatibility
 */
window.hideTooltip = function (tooltip) {
  if (window.merfishApp && window.merfishApp.uiManager) {
    window.merfishApp.uiManager.hideTooltip(tooltip);
  }
};

/**
 * Generate a distinct color for a gene
 * This is kept for backward compatibility
 */
window.generateGeneColor = function (geneName, index) {
  if (window.merfishApp && window.merfishApp.uiManager) {
    return window.merfishApp.uiManager.generateGeneColor(geneName, index);
  }
  // Fallback implementation if app is not initialized
  return "#FF0000"; // Default red color
};

/**
 * Convert a hex color string to RGB values
 * This is kept for backward compatibility
 */
window.hexToRgb = function (hex) {
  if (window.merfishApp && window.merfishApp.uiManager) {
    return window.merfishApp.uiManager.hexToRgb(hex);
  }
  // Fallback implementation if app is not initialized
  return { r: 1, g: 0, b: 0 }; // Default red color
};

/**
 * Opens the gene customization tooltip for a specific gene
 * This is kept for backward compatibility
 * @param {string} gene - Name of the gene to customize
 * @param {Event} event - The click event
 */
window.openGeneCustomizationTooltip = function (gene, event) {
  if (window.merfishApp && window.merfishApp.geneUIManager) {
    window.merfishApp.geneUIManager.openGeneCustomizationTooltip(gene, event);
  }
};

/**
 * Closes the gene customization tooltip
 * This is kept for backward compatibility
 */
window.closeGeneCustomizationTooltip = function () {
  if (window.merfishApp && window.merfishApp.geneUIManager) {
    window.merfishApp.geneUIManager.closeGeneCustomizationTooltip();
  }
};

/**
 * Applies the gene customization settings
 * This is kept for backward compatibility
 * @param {boolean} closeTooltip - Whether to close the tooltip after applying changes
 */
window.applyGeneCustomization = function (closeTooltip = false) {
  if (window.merfishApp && window.merfishApp.geneUIManager) {
    window.merfishApp.geneUIManager.applyGeneCustomization(closeTooltip);
  }
};

/**
 * Resets the gene customization to default values
 * This is kept for backward compatibility
 */
window.resetGeneCustomization = function () {
  if (window.merfishApp && window.merfishApp.geneUIManager) {
    window.merfishApp.geneUIManager.resetGeneCustomization();
  }
};

/**
 * Initializes event listeners for the gene customization tooltip
 * This is kept for backward compatibility
 */
window.initializeTooltipEventListeners = function () {
  if (window.merfishApp && window.merfishApp.geneUIManager) {
    window.merfishApp.geneUIManager.initializeTooltipEventListeners();
  }
};

/**
 * Adds a gene to the active genes list
 * This is kept for backward compatibility
 * @param {string} gene - Name of the gene
 * @param {string} color - Color of the gene
 */
window.addToActiveGenesList = function (gene, color) {
  if (window.merfishApp && window.merfishApp.geneUIManager) {
    window.merfishApp.geneUIManager.addToActiveGenesList(gene, color);
  }
};

/**
 * Removes a gene from the active genes list
 * This is kept for backward compatibility
 * @param {string} gene - Name of the gene to remove
 */
window.removeFromActiveGenesList = function (gene) {
  if (window.merfishApp && window.merfishApp.geneUIManager) {
    window.merfishApp.geneUIManager.removeFromActiveGenesList(gene);
  }
};

/**
 * Updates the active genes list based on the current state
 * This is kept for backward compatibility
 */
window.updateActiveGenesList = function () {
  if (window.merfishApp && window.merfishApp.geneUIManager) {
    window.merfishApp.geneUIManager.updateActiveGenesList();
  }
};

/**
 * Clears all genes from the active genes list
 * This is kept for backward compatibility
 */
window.clearActiveGenesList = function () {
  if (window.merfishApp && window.merfishApp.geneUIManager) {
    window.merfishApp.geneUIManager.clearActiveGenesList();
  }
};

/**
 * Initializes the active genes list based on the store
 * This is kept for backward compatibility
 */
window.initializeActiveGenesList = function () {
  if (window.merfishApp && window.merfishApp.geneUIManager) {
    window.merfishApp.geneUIManager.initializeActiveGenesList();
  }
};

// This duplicate definition has been removed and consolidated with the one above

/**
 * Handle window resize
 * This is kept for backward compatibility
 */
window.onWindowResize = function () {
  if (window.merfishApp && window.merfishApp.sceneManager) {
    window.merfishApp.sceneManager.onWindowResize();
  }
};

/**
 * Animation loop
 * This is kept for backward compatibility
 */
window.animate = function () {
  if (window.merfishApp && window.merfishApp.sceneManager) {
    window.merfishApp.sceneManager.animate();
  } else {
    // If the app isn't initialized yet, request the next frame
    requestAnimationFrame(window.animate);
  }
};

// Legacy animation function has been replaced by SceneManager.animate()

/**
 * Update camera position and target based on coordinate transformations
 * This is kept for backward compatibility
 */
window.updateCameraForTransformations = function () {
  if (window.merfishApp && window.merfishApp.sceneManager) {
    window.merfishApp.sceneManager.updateCameraForTransformations();
  }
};

/**
 * Update data bounds based on loaded data
 * This is kept for backward compatibility
 * @param {Array} points - Array of points with x, y, z coordinates
 */
window.updateDataBounds = function (points) {
  if (window.merfishApp && window.merfishApp.sceneManager) {
    window.merfishApp.sceneManager.updateDataBounds(points);
  }
};

/**
 * Update data bounds for all genes
 * This is kept for backward compatibility
 */
window.updateDataBoundsForAllGenes = function () {
  if (window.merfishApp && window.merfishApp.sceneManager) {
    window.merfishApp.sceneManager.updateDataBoundsForAllGenes();
  }
};
/**
 * Update the z-stack slider range based on the current dataset variant
 * This is kept for backward compatibility
 */
window.updateZStackSliderRange = function () {
  if (window.merfishApp && window.merfishApp.uiManager) {
    window.merfishApp.uiManager.updateZStackSliderRange();
  }
};
/**
 * Handle window resize event
 * This is kept for backward compatibility
 */
window.onWindowResize = function () {
  if (window.merfishApp && window.merfishApp.sceneManager) {
    window.merfishApp.sceneManager.onWindowResize();
  }
};

/**
 * Handle dataset variant change
 * This is kept for backward compatibility
 */
window.handleDatasetVariantChange = async function () {
  if (window.merfishApp) {
    await window.merfishApp.handleDatasetVariantChange();
  }
};

/**
 * Populate the dataset variant dropdown with options from config
 * This is kept for backward compatibility
 */
window.populateDatasetVariantDropdown = function (selectElement) {
  if (window.merfishApp) {
    window.merfishApp.populateVariantDropdown(selectElement);
  }
};

/**
 * Populate the variant dropdown with options from config
 * This is kept for backward compatibility
 * @param {HTMLSelectElement} selectElement - The select element to populate
 */
window.populateVariantDropdown = function (selectElement) {
  if (window.merfishApp && window.merfishApp.uiManager) {
    window.merfishApp.uiManager.populateVariantDropdown(selectElement);
  }
};

// Flag to track if initialization has occurred
let hasInitialized = false;

// Initialize the application when the DOM is ready
document.addEventListener("DOMContentLoaded", async () => {
  // Only initialize once
  //   if (hasInitialized) {
  //     console.log(
  //       "Application already initialized, skipping duplicate initialization"
  //     );
  //     return;
  //   }

  //   console.log("DOM loaded, initializing application...");
  hasInitialized = true;

  // Create a loading indicator
  const loadingIndicator = document.createElement("div");
  loadingIndicator.style.position = "fixed";
  loadingIndicator.style.top = "50%";
  loadingIndicator.style.left = "50%";
  loadingIndicator.style.transform = "translate(-50%, -50%)";
  loadingIndicator.style.padding = "20px";
  loadingIndicator.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
  loadingIndicator.style.color = "white";
  loadingIndicator.style.borderRadius = "5px";
  loadingIndicator.style.zIndex = "9999";
  loadingIndicator.textContent = "Initializing...";
  document.body.appendChild(loadingIndicator);

  try {
    // Initialize dataset variant from URL parameter if present
    config.dataPaths.initVariantFromURL();
    console.log(`Using dataset variant: ${config.dataPaths.currentVariant}`);
    loadingIndicator.textContent = "Loading configuration...";

    // Load palette and clusters for initial variant
    await store.loadPaletteAndClusters();

    // Initialize store UI bindings first
    await Promise.resolve(store.initUIBindings());
    loadingIndicator.textContent = "Initializing UI...";

    // Initialize the MERFISH application with all managers
    window.merfishApp = new MERFISHApp();
    await window.merfishApp.initialize();
    loadingIndicator.textContent = "Loading visualization...";

    // Remove loading indicator after a short delay
    setTimeout(() => {
      document.body.removeChild(loadingIndicator);
    }, 1000);
  } catch (error) {
    console.error("Error during initialization:", error);
    loadingIndicator.textContent = "Error initializing application";
    loadingIndicator.style.backgroundColor = "rgba(255, 0, 0, 0.8)";
    setTimeout(() => {
      document.body.removeChild(loadingIndicator);
    }, 3000);
  }
});
