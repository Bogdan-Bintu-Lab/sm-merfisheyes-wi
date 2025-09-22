/**
 * GeneUIManager.js
 * Handles gene-specific UI components and interactions
 */

import { store } from "./store.js";
import { config } from "./config.js";

export class GeneUIManager {
  constructor(uiManager) {
    this.uiManager = uiManager;
    this.currentCustomizeGene = null;

    // Initialize gene UI components
    this.initializeTooltipEventListeners();
  }

  /**
   * Opens the gene customization tooltip for a specific gene
   * @param {string} gene - Name of the gene to customize
   * @param {Event} event - The click event
   */
  openGeneCustomizationTooltip(gene, event) {
    // Prevent event bubbling
    event.stopPropagation();

    // Set the current gene being customized
    this.currentCustomizeGene = gene;

    // Get the tooltip elements
    const tooltip = document.getElementById("gene-customize-tooltip");
    const geneName = document.getElementById("customize-gene-name");
    const colorPicker = document.getElementById("gene-color-picker");
    const scaleSlider = document.getElementById("gene-scale-slider");
    const scaleValue = document.getElementById("gene-scale-value");

    // Set the gene name in the tooltip
    geneName.textContent = gene;

    // Get the current color and scale for this gene
    const geneColors = store.get("geneColors") || {};
    const geneCustomizations = store.get("geneCustomizations") || {};

    // Set the color picker value
    const currentColor = geneColors[gene] || "#e41a1c";
    colorPicker.value = currentColor;

    // Set the scale slider value
    const currentScale = geneCustomizations[gene]?.scale || 1.0;
    scaleSlider.value = currentScale;
    scaleValue.textContent = currentScale.toFixed(1);

    // Position the tooltip near the clicked element
    const geneItem = document.querySelector(
      `.active-gene-item[data-gene="${gene}"]`
    );
    if (geneItem) {
      const rect = geneItem.getBoundingClientRect();
      const tooltipWidth = 250; // Match the width from CSS
      const windowWidth = window.innerWidth;

      // Since the active genes are now in the top right, position the tooltip to the left
      // to avoid going off-screen
      if (rect.right + 10 + tooltipWidth > windowWidth) {
        // If there's not enough space on the right, position to the left
        tooltip.style.left = `${Math.max(10, rect.left - tooltipWidth - 10)}px`;
      } else {
        // If there's enough space, position to the right
        tooltip.style.left = `${rect.right + 10}px`;
      }

      // Position vertically centered with the gene item
      tooltip.style.top = `${rect.top - 10}px`;
    }

    // Show the tooltip
    tooltip.style.display = "block";
  }

  /**
   * Closes the gene customization tooltip
   */
  closeGeneCustomizationTooltip() {
    const tooltip = document.getElementById("gene-customize-tooltip");
    tooltip.style.display = "none";
    this.currentCustomizeGene = null;
  }

  /**
   * Applies the gene customization settings
   * @param {boolean} closeTooltip - Whether to close the tooltip after applying changes
   */
  applyGeneCustomization(closeTooltip = false) {
    if (!this.currentCustomizeGene) return;

    const colorPicker = document.getElementById("gene-color-picker");
    const scaleSlider = document.getElementById("gene-scale-slider");

    // Get the new color and scale
    const newColor = colorPicker.value;
    const newScale = parseFloat(scaleSlider.value);

    console.log(
      `Applying customization for gene ${this.currentCustomizeGene}: color=${newColor}, scale=${newScale}`
    );

    // Update the store
    const geneColors = store.get("geneColors") || {};
    const geneCustomizations = store.get("geneCustomizations") || {};

    // Update color
    geneColors[this.currentCustomizeGene] = newColor;

    // Update customizations
    geneCustomizations[this.currentCustomizeGene] = {
      ...geneCustomizations[this.currentCustomizeGene],
      color: newColor,
      scale: newScale,
    };

    // Update the color indicator in the active genes list
    const activeGeneItem = document.querySelector(
      `.active-gene-item[data-gene="${this.currentCustomizeGene}"]`
    );
    if (activeGeneItem) {
      activeGeneItem.style.backgroundColor = newColor;
    }

    // Update the color indicator in the gene selector
    const geneCheckboxItem = document.querySelector(
      `.gene-checkbox-item[data-gene="${this.currentCustomizeGene}"]`
    );
    if (geneCheckboxItem) {
      const colorIndicator = geneCheckboxItem.querySelector(
        ".gene-color-indicator"
      );
      if (colorIndicator) {
        colorIndicator.style.backgroundColor = newColor;
      }
    }

    // Set the store values after UI updates to trigger the subscriptions
    // This order is important to ensure all layers are updated properly
    store.set("geneCustomizations", geneCustomizations);
    store.set("geneColors", geneColors);

    // Force a render update to apply the changes
    store.set("forceRender", true);

    // Close the tooltip if requested
    if (closeTooltip) {
      this.closeGeneCustomizationTooltip();
    }
  }

  /**
   * Resets the gene customization to default values
   */
  resetGeneCustomization() {
    if (!this.currentCustomizeGene) return;

    // Generate the default color for this gene
    const genes = Object.keys(store.get("selectedGenes") || {});
    const index = genes.indexOf(this.currentCustomizeGene);
    const defaultColor = this.uiManager.generateGeneColor(
      this.currentCustomizeGene,
      index
    );

    // Update the color picker
    const colorPicker = document.getElementById("gene-color-picker");
    colorPicker.value = defaultColor;

    // Reset the scale slider
    const scaleSlider = document.getElementById("gene-scale-slider");
    const scaleValue = document.getElementById("gene-scale-value");
    scaleSlider.value = 1.0;
    // scaleValue.textContent = "1.0";

    // Apply the changes
    this.applyGeneCustomization();
  }

  /**
   * Initializes event listeners for the gene customization tooltip
   */
  initializeTooltipEventListeners() {
    // Get tooltip elements
    const tooltip = document.getElementById("gene-customize-tooltip");
    if (!tooltip) return;

    const closeBtn = tooltip.querySelector(".close-tooltip");
    const resetBtn = document.getElementById("reset-gene-customization");
    const colorPicker = document.getElementById("gene-color-picker");
    const scaleSlider = document.getElementById("gene-scale-slider");
    const scaleValue = document.getElementById("gene-scale-value");

    // Close button event listener
    if (closeBtn) {
      closeBtn.addEventListener("click", () =>
        this.closeGeneCustomizationTooltip()
      );
    }

    // Reset button event listener
    if (resetBtn) {
      resetBtn.addEventListener("click", () => this.resetGeneCustomization());
    }

    // Color picker event listener for instant updates
    if (colorPicker) {
      colorPicker.addEventListener("input", () => {
        this.applyGeneCustomization(false);
      });
    }

    // Scale slider event listener for instant updates
    if (scaleSlider && scaleValue) {
      scaleSlider.addEventListener("input", (e) => {
        const value = parseFloat(e.target.value);
        scaleValue.textContent = value.toFixed(1);
        this.applyGeneCustomization(false);
      });
    }

    // Close tooltip when clicking outside of it
    document.addEventListener("click", (e) => {
      if (
        tooltip.style.display === "block" &&
        !tooltip.contains(e.target) &&
        !e.target.closest(".active-gene-item")
      ) {
        this.closeGeneCustomizationTooltip();
      }
    });
  }

  /**
   * Adds a gene to the active genes list
   * @param {string} gene - Name of the gene
   * @param {string} color - Color of the gene
   */
  addToActiveGenesList(gene, color) {
    const activeGenesList = document.getElementById("active-genes-list");
    const emptyMessage = activeGenesList.querySelector(".empty-message");

    // Hide the empty message if it exists
    if (emptyMessage) {
      emptyMessage.style.display = "none";
    }

    // Check if this gene is already in the list
    const existingItem = activeGenesList.querySelector(`[data-gene="${gene}"]`);
    if (existingItem) {
      return; // Already in the list
    }

    // Create a new active gene item
    const activeGeneItem = document.createElement("div");
    activeGeneItem.className = "active-gene-item";
    activeGeneItem.setAttribute("data-gene", gene);
    activeGeneItem.style.backgroundColor = color;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `active-gene-${gene}`; // Use a different ID prefix to avoid conflicts
    checkbox.value = gene;
    checkbox.className = "gene-checkbox";
    checkbox.checked = true;

    // Add event listener to toggle gene visibility and update gene selector checkbox
    checkbox.addEventListener("change", (e) => {
      const isVisible = e.target.checked;

      // Update gene visibility
      const geneLoader = this.uiManager.geneLoader;
      if (geneLoader) {
        const geneObj = geneLoader.activeGenes.get(gene);
        if (geneObj) {
          geneObj.setVisible(isVisible);
        }
      }

      // Update the visibility state in the store
      const visibleGenes = store.get("visibleGenes") || {};
      visibleGenes[gene] = isVisible;
      store.set("visibleGenes", visibleGenes);

      // Update the corresponding checkbox in the gene selector
      const selectorCheckbox = document.getElementById(`gene-${gene}`);
      if (selectorCheckbox) {
        // Update the checkbox state without triggering its change event
        if (selectorCheckbox.checked !== isVisible) {
          selectorCheckbox.checked = isVisible;
        }
      }
    });

    // Create gene name
    const geneName = document.createElement("div");
    geneName.className = "active-gene-name";
    geneName.textContent = gene;

    // Create remove button
    const removeButton = document.createElement("div");
    removeButton.className = "active-gene-remove";
    removeButton.innerHTML = "&times;";
    removeButton.title = "Remove gene";
    removeButton.addEventListener("click", () => {
      // Update both selection and visibility states
      const selectedGenes = store.get("selectedGenes") || {};
      const visibleGenes = store.get("visibleGenes") || {};

      // Update selection state
      selectedGenes[gene] = false;
      store.set("selectedGenes", selectedGenes);

      // Update visibility state
      visibleGenes[gene] = false;
      store.set("visibleGenes", visibleGenes);

      // Find and uncheck the checkbox in the main gene selector list
      const selectorCheckbox = document.getElementById(`gene-${gene}`);
      if (selectorCheckbox) {
        selectorCheckbox.checked = false;
        // Don't dispatch an event to avoid infinite loops
        // The store update will trigger any necessary updates
      }

      // Hide the gene in the visualization
      const geneLoader = this.uiManager.geneLoader;
      if (geneLoader) {
        const geneObj = geneLoader.activeGenes.get(gene);
        if (geneObj) {
          geneObj.setVisible(false);
        }
      }

      // Remove from active genes list
      this.removeFromActiveGenesList(gene);
    });

    // Add click event listener for customization
    activeGeneItem.addEventListener("click", (event) => {
      // Don't trigger if clicking on the remove button or checkbox
      if (
        !event.target.classList.contains("active-gene-remove") &&
        !event.target.classList.contains("gene-checkbox")
      ) {
        this.openGeneCustomizationTooltip(gene, event);
      }
    });

    // Make sure the gene name is also clickable
    geneName.style.pointerEvents = "auto";

    // Assemble the item
    activeGeneItem.appendChild(checkbox);
    activeGeneItem.appendChild(geneName);
    activeGeneItem.appendChild(removeButton);

    // Add to the list
    activeGenesList.appendChild(activeGeneItem);

    // Update the list
    this.updateActiveGenesList();
  }

  /**
   * Removes a gene from the active genes list
   * @param {string} gene - Name of the gene to remove
   */
  removeFromActiveGenesList(gene) {
    const activeGenesList = document.getElementById("active-genes-list");
    const geneItem = activeGenesList.querySelector(`[data-gene="${gene}"]`);

    if (geneItem) {
      activeGenesList.removeChild(geneItem);
    }

    // Update the list
    this.updateActiveGenesList();
  }

  /**
   * Updates the active genes list based on the current state
   */
  updateActiveGenesList() {
    const activeGenesList = document.getElementById("active-genes-list");
    const activeGenesContainer = document.getElementById(
      "active-genes-container"
    );
    const emptyMessage = activeGenesList.querySelector(".empty-message");
    const activeGenes = activeGenesList.querySelectorAll(".active-gene-item");

    // Show or hide the active genes container based on whether there are any genes selected
    if (activeGenes.length === 0) {
      // If no empty message exists, create one
      if (!emptyMessage) {
        const newEmptyMessage = document.createElement("div");
        newEmptyMessage.className = "empty-message text-sm font-medium";
        newEmptyMessage.textContent = "No genes selected";
        activeGenesList.appendChild(newEmptyMessage);
      } else {
        emptyMessage.style.display = "block";
      }

      // Add a class to hide the container when empty
      activeGenesContainer.classList.add("empty");
    } else {
      if (emptyMessage) {
        emptyMessage.style.display = "none";
      }

      // Remove the empty class to show the container
      activeGenesContainer.classList.remove("empty");
    }
  }

  /**
   * Clears all genes from the active genes list
   */
  clearActiveGenesList() {
    const activeGenesList = document.getElementById("active-genes-list");

    // Close any open customization tooltip
    this.closeGeneCustomizationTooltip();

    // Remove all gene items
    const geneItems = activeGenesList.querySelectorAll(".active-gene-item");
    geneItems.forEach((item) => {
      activeGenesList.removeChild(item);
    });

    // Update the list to show the empty message
    this.updateActiveGenesList();
  }

  /**
   * Initializes the active genes list based on the store
   */
  initializeActiveGenesList() {
    const selectedGenes = store.get("selectedGenes") || {};
    const geneColors = store.get("geneColors") || {};

    // Add each selected gene to the active genes list
    Object.keys(selectedGenes).forEach((gene) => {
      if (selectedGenes[gene] && geneColors[gene]) {
        this.addToActiveGenesList(gene, geneColors[gene]);
      }
    });
  }

  /**
   * Dynamically populates the gene selector with checkboxes from the gene_list.json file
   */
  async populateGeneSelector() {
    // console.log('Populating gene selector...');

    try {
      // Get the gene selector container
      const geneSelector = document.getElementById("gene-selector");
      if (!geneSelector) {
        console.error("Gene selector element not found");
        return;
      }

      // Check if the selector has already been populated to prevent duplicates
      if (geneSelector.getAttribute("data-populated") === "true") {
        // console.log('Gene selector already populated, skipping');
        return;
      }

      // Clear existing content - important to prevent duplicates
      geneSelector.innerHTML = "";

      // Fetch the gene list from the JSON file using the config path
      const response = await fetch(config.dataPaths.getGeneListPath());

      if (!response.ok) {
        throw new Error(
          `Failed to fetch gene list: ${response.status} ${response.statusText}`
        );
      }

      const genes = await response.json();
      // console.log('Fetched genes:', genes.length);

      // Sort genes alphabetically (case insensitive)
      genes.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

      // Prepare all gene colors in a single batch to avoid multiple store updates
      const geneColors = store.get("geneColors") || {};
      let colorsUpdated = false;

      // Pre-compute all missing gene colors
      genes.forEach((gene, index) => {
        if (!geneColors[gene]) {
          geneColors[gene] = this.uiManager.generateGeneColor(gene, index);
          colorsUpdated = true;
        }
      });

      // Update store with all colors at once if any were added
      if (colorsUpdated) {
        store.set("geneColors", geneColors);
      }

      // Create document fragment for better performance
      const fragment = document.createDocumentFragment();

      // Add checkboxes for each gene
      genes.forEach((gene, index) => {
        // Create container for the checkbox item
        const checkboxItem = document.createElement("div");
        checkboxItem.className = "gene-checkbox-item";
        checkboxItem.setAttribute("data-gene", gene);

        // Create checkbox
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = `gene-${gene}`;
        checkbox.value = gene;
        checkbox.className = "gene-checkbox";

        // Create label
        const label = document.createElement("label");
        // label.htmlFor = `gene-${gene}` is intentionally commented out to avoid conflicts
        label.textContent = gene;

        // Create color indicator
        const colorIndicator = document.createElement("span");
        colorIndicator.className = "gene-color-indicator";
        colorIndicator.style.backgroundColor = geneColors[gene];

        // Make the entire item clickable
        checkboxItem.addEventListener("click", (event) => {
          // Don't toggle if clicking directly on the checkbox (it handles its own state)
          if (event.target !== checkbox) {
            checkbox.checked = !checkbox.checked;

            // Trigger the change event manually
            const changeEvent = new Event("change");
            checkbox.dispatchEvent(changeEvent);
          }
        });

        // Add event listener to checkbox
        checkbox.addEventListener("change", () => {
          // Update both selection and visibility state
          const selectedGenes = store.get("selectedGenes") || {};
          const visibleGenes = store.get("visibleGenes") || {};

          // Update selection state
          selectedGenes[gene] = checkbox.checked;
          store.set("selectedGenes", selectedGenes);

          // Update visibility state to match selection
          visibleGenes[gene] = checkbox.checked;
          store.set("visibleGenes", visibleGenes);

          if (checkbox.checked) {
            console.log(`Selected gene: ${gene}`);
            // Add to active genes list and ensure it's visible
            this.addToActiveGenesList(gene, geneColors[gene]);

            // Make sure the gene is visible when selected
            const geneLoader = this.uiManager.geneLoader;
            if (geneLoader) {
              const geneObj = geneLoader.activeGenes.get(gene);
              if (geneObj) {
                geneObj.setVisible(true);
              }
            }
          } else {
            console.log(`Unselected gene: ${gene}`);
            // Remove from active genes list
            this.removeFromActiveGenesList(gene);

            // Make sure the gene is hidden when deselected
            const geneLoader = this.uiManager.geneLoader;
            if (geneLoader) {
              const geneObj = geneLoader.activeGenes.get(gene);
              if (geneObj) {
                geneObj.setVisible(false);
              }
            }
          }

          // Force a render update
          store.set("forceRender", true);
        });

        // Check if this gene is already selected in the store
        const selectedGenes = store.get("selectedGenes") || {};
        if (selectedGenes[gene]) {
          checkbox.checked = true;
          checkboxItem.classList.add("selected");
          colorIndicator.style.display = "inline-block";
        } else {
          // Initially hide color indicator if not selected
          colorIndicator.style.display = "none";
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

      // console.log(`Populated gene selector with ${genes.length} genes from gene_list.json`);

      // Initialize the active genes list
      this.initializeActiveGenesList();

      // Mark the selector as populated with attribute
      geneSelector.setAttribute("data-populated", "true");

      // Set up search functionality
      const geneSearch = document.getElementById("gene-search");
      if (geneSearch) {
        // Clear any existing value
        geneSearch.value = "";

        // Remove existing listeners by cloning and replacing
        const newGeneSearch = geneSearch.cloneNode(true);
        geneSearch.parentNode.replaceChild(newGeneSearch, geneSearch);

        // Add the new event listener
        newGeneSearch.addEventListener("input", (event) => {
          const searchTerm = event.target.value.toLowerCase();

          // Get all checkbox items directly from the gene selector
          const checkboxItems = geneSelector.querySelectorAll(
            ".gene-checkbox-item"
          );

          // Simple filtering logic - show items that match, hide others
          checkboxItems.forEach((item) => {
            const geneName = item.getAttribute("data-gene").toLowerCase();
            if (geneName.includes(searchTerm)) {
              item.style.display = "flex";
            } else {
              item.style.display = "none";
            }
          });
        });
      }

      // Set up clear all button
      const clearGenesBtn = document.getElementById("clear-genes-btn");
      if (clearGenesBtn) {
        clearGenesBtn.addEventListener("click", () => {
          console.log("Clearing all genes by updating selectedGenes");

          // Get the current selectedGenes object
          const currentSelectedGenes = store.get("selectedGenes") || {};

          // Create a new object with all genes set to false
          const updatedSelectedGenes = {};
          Object.keys(currentSelectedGenes).forEach((gene) => {
            updatedSelectedGenes[gene] = false;
          });

          // Update the store with the new object
          // This will trigger the store subscription in GeneLoader which will
          // automatically remove all genes from the scene
          store.set("selectedGenes", updatedSelectedGenes);

          // Uncheck all checkboxes in the UI
          const checkboxes = geneSelector.querySelectorAll(".gene-checkbox");
          checkboxes.forEach((checkbox) => {
            checkbox.checked = false;
          });

          // Clear the active genes list
          this.clearActiveGenesList();

          // Hide all color indicators
          const colorIndicators = geneSelector.querySelectorAll(
            ".gene-color-indicator"
          );
          colorIndicators.forEach((indicator) => {
            indicator.style.display = "none";
          });

          // Force a render update
          store.set("forceRender", true);

          console.log("Cleared all selected genes");
        });
      }
    } catch (error) {
      console.error("Error populating gene selector:", error);
    }
  }
}
