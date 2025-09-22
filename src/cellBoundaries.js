/**
 * CellBoundaries module for loading and managing cell boundary data
 * Redesigned to better handle multiple z-stack layers
 */

import * as THREE from "three";
import { config } from "./config.js";
import pako from "pako";
import { store } from "./store.js";
import { updateDataBounds } from "./utils.js";
import { loadingIndicator } from "./LoadingIndicator.js";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Palette and clusters are now loaded from store
import { ungzip } from "pako";

/**
 * BoundaryLayer class represents a single z-stack layer of cell boundaries or nuclei
 */
class BoundaryLayer {
  /**
   * Create a new boundary layer
   * @param {string} zstack - Z-stack identifier
   * @param {THREE.Scene} scene - Three.js scene to add the layer to
   * @param {string} type - Type of boundary ('boundaries' or 'nuclei')
   */
  constructor(zstack, scene, type = "boundaries") {
    this.zstack = zstack;
    this.scene = scene;
    this.type = type; // 'boundaries' or 'nuclei'
    this.group = new THREE.Group();
    this.loaded = false;
    this.loading = false;

    // Set visibility based on type
    if (this.type === "boundaries") {
      this.visible = store.get("showCellBoundaries");
      this.opacity = store.get("boundaryOpacity") || 1.0;
    } else if (this.type === "nuclei") {
      this.visible = store.get("showCellNuclei");
      this.opacity = store.get("nucleiOpacity") || 1.0;
    }

    this.group.visible = this.visible;

    // console.log(`Created ${this.type} layer for z-stack ${zstack}`);
  }

  /**
   * Load boundary data for this layer
   * @returns {Promise} Resolves when loading is complete
   */
  async load() {
    if (this.loaded || this.loading) return;

    this.loading = true;
    // console.log(`Loading ${this.type} layer for z-stack ${this.zstack}...`);

    try {
      // Format the z-stack number with leading zero if needed
      const formattedZstack = this.zstack;

      // Get the path to the compressed data based on type
      let gzipPath;
      if (this.type === "boundaries") {
        gzipPath = config.dataPaths.getCellBoundariesPath(formattedZstack);
      } else if (this.type === "nuclei") {
        gzipPath = config.dataPaths.getCellNucleiPath(formattedZstack);
      } else {
        throw new Error(`Unknown boundary type: ${this.type}`);
      }

      // console.log(`Loading gzipped data from: ${gzipPath}`);

      // Fetch the compressed data with progress tracking
      const label =
        this.type === "boundaries"
          ? "Loading Cell Boundaries"
          : "Loading Cell Nuclei";
      const gzipResponse = await loadingIndicator.fetchWithProgress(
        gzipPath,
        {
          headers: {
            "Accept-Encoding": "gzip",
            "Cache-Control": "no-cache",
          },
        },
        `${label} (Z=${this.zstack})`
      );

      if (!gzipResponse.ok) {
        throw new Error(
          `Failed to fetch gzipped data: ${gzipResponse.status} ${gzipResponse.statusText}`
        );
      }

      // Get the compressed data as an ArrayBuffer
      const compressedData = await gzipResponse.arrayBuffer();
      // console.log(`Got compressed data, size: ${compressedData.byteLength} bytes`);

      if (compressedData.byteLength === 0) {
        throw new Error("Received empty compressed data");
      }

      // Check the first bytes to determine the file format
      const dataView = new DataView(compressedData);
      const byte1 = dataView.getUint8(0);
      const byte2 = dataView.getUint8(1);
      // console.log(`First two bytes: 0x${byte1.toString(16)} 0x${byte2.toString(16)}`);

      let data;

      // Check if it's actually a JSON file (starts with '{")'
      if (byte1 === 0x7b && byte2 === 0x22) {
        // console.log(`File appears to be plain JSON despite .gz extension. File size: ${compressedData.byteLength} bytes`);
        try {
          const jsonString = new TextDecoder().decode(compressedData);
          data = JSON.parse(jsonString);
          // console.log(`Parsed JSON data directly, bypassing decompression. Data size: ${jsonString.length} characters`);
        } catch (parseError) {
          console.error("JSON parsing error:", parseError);
          throw new Error(`Failed to parse direct JSON: ${parseError.message}`);
        }
      } else if (byte1 === 0x1f && byte2 === 0x8b) {
        // It's a proper gzip file, decompress it
        try {
          // console.log(`Processing gzipped file. Compressed size: ${compressedData.byteLength} bytes`);
          const decompressedData = ungzip(new Uint8Array(compressedData));
          // console.log(`Decompression complete. Original size: ${compressedData.byteLength} bytes → Decompressed size: ${decompressedData.length} bytes (${(decompressedData.length / compressedData.byteLength).toFixed(2)}x larger)`);

          // Parse the JSON data
          const jsonString = new TextDecoder().decode(decompressedData);
          data = JSON.parse(jsonString);
          // console.log(`Parsed JSON data successfully. JSON string length: ${jsonString.length} characters`);
        } catch (error) {
          console.error("Decompression or parsing error:", error);
          throw new Error(`Failed to process gzipped data: ${error.message}`);
        }
      } else if (byte1 === 0x3c && byte2 === 0x21) {
        // This looks like an HTML document (starts with '<!'), likely an error page
        const htmlContent = new TextDecoder()
          .decode(compressedData)
          .substring(0, 200); // Get first 200 chars for debugging
        console.error(
          "Received HTML content instead of JSON or gzip data:",
          htmlContent
        );

        // Try to get a more specific error from the HTML content
        let errorMessage = "Received HTML error page instead of data";

        // Try to extract error status code if present
        const statusMatch = htmlContent.match(/status code (\d+)/);
        if (statusMatch && statusMatch[1]) {
          errorMessage += ` (Status: ${statusMatch[1]})`;
        }

        // Try to fall back to uncompressed path
        // console.log(`Attempting to load uncompressed data as fallback...`);
        try {
          // Get the uncompressed path based on type
          let jsonPath;
          if (this.type === "boundaries") {
            jsonPath =
              config.dataPaths.getCellBoundariesPathJSON(formattedZstack);
          } else if (this.type === "nuclei") {
            jsonPath = config.dataPaths.getCellNucleiPathJSON(formattedZstack);
          } else {
            throw new Error(`Unknown boundary type: ${this.type}`);
          }

          // console.log(`Loading uncompressed data from: ${jsonPath}`);

          // Fetch the uncompressed data
          const jsonResponse = await fetch(jsonPath, {
            headers: {
              "Cache-Control": "no-cache",
            },
          });

          if (!jsonResponse.ok) {
            throw new Error(
              `Failed to fetch uncompressed data: ${jsonResponse.status} ${jsonResponse.statusText}`
            );
          }

          // Parse the JSON data
          data = await jsonResponse.json();
          // console.log(`Successfully loaded uncompressed data as fallback`);
        } catch (fallbackError) {
          console.error("Fallback to uncompressed data failed:", fallbackError);
          throw new Error(
            `${errorMessage}. Fallback also failed: ${fallbackError.message}`
          );
        }
      } else {
        throw new Error(
          `Unknown file format. First bytes: 0x${byte1.toString(
            16
          )} 0x${byte2.toString(16)}`
        );
      }

      // Create visualization with the data
      this.createVisualization(data);

      // Add to scene
      this.scene.add(this.group);

      this.loaded = true;
      // console.log(`Loaded boundary layer for z-stack ${this.zstack}`);
    } catch (error) {
      console.error(
        `Error loading boundary layer for z-stack ${this.zstack}:`,
        error
      );
    } finally {
      this.loading = false;
    }
  }

  /**
   * Process the loaded data to create cell boundary visualizations
   * @param {Object} data - The loaded boundary data
   */
  processData(data) {
    if (!data || !data.cellOffsets || !data.points) {
      console.error("Invalid boundary data format");
      return;
    }

    // Store the JSON data for raycasting
    this.jsonData = data;

    // Log detailed information about the boundary data
    // console.log('%c BOUNDARY DATA STRUCTURE', 'background: #FF9800; color: white; padding: 2px 5px; border-radius: 2px;');
    // console.log('Boundary data overview:', {
    //     cellOffsetsLength: data.cellOffsets.length,
    //     pointsLength: data.points.length,
    //     hasClusters: !!data.clusters,
    //     clustersLength: data.clusters ? data.clusters.length : 0,
    //     dataKeys: Object.keys(data)
    // });

    // Log a sample of the data structure
    // if (data.cellOffsets.length > 0) {
    //     console.log('Sample cell offset:', data.cellOffsets[0]);
    // }
    // if (data.points.length > 0) {
    //     console.log('Sample point:', data.points[0]);
    // }
    // if (data.clusters && data.clusters.length > 0) {
    //     console.log('Sample cluster:', data.clusters[0]);
    // }

    // Create visualization with the data
    this.createVisualization(data);

    // Set this layer as loaded
    this.loaded = true;
    this.loading = false;

    // If we have a SceneManager reference and this layer is visible,
    // set the active spatial geometry for raycasting
    if (this.sceneManager && this.visible) {
      // console.log('Setting active spatial geometry after processing data');
      this.sceneManager.setActiveSpatialGeometry(
        this.boundaryLayers[zstack],
        this.jsonData,
        this.palette
      );
    }
  }

  /**
   * Set the active spatial geometry for raycasting
   */
  setActiveSpatialGeometry() {
    if (!this.sceneManager) {
      console.error(
        "%c NO SCENE MANAGER REFERENCE",
        "background: #F44336; color: white; padding: 2px 5px; border-radius: 2px;"
      );
      console.log("Call stack:", new Error().stack);
      return;
    }

    if (!this.group) {
      console.error(
        "%c NO GROUP AVAILABLE",
        "background: #F44336; color: white; padding: 2px 5px; border-radius: 2px;"
      );
      return;
    }

    if (!this.group.children || this.group.children.length === 0) {
      console.error(
        "%c NO CHILDREN IN GROUP",
        "background: #F44336; color: white; padding: 2px 5px; border-radius: 2px;"
      );
      console.log("Group details:", {
        type: this.group.type,
        uuid: this.group.uuid,
        visible: this.group.visible,
        childrenLength: this.group.children ? this.group.children.length : 0,
      });
      return;
    }

    console.log(
      "%c SETTING ACTIVE SPATIAL GEOMETRY (BOUNDARY LAYER)",
      "background: #4CAF50; color: white; padding: 2px 5px; border-radius: 2px;"
    );
    console.log("Group details:", {
      type: this.group.type,
      uuid: this.group.uuid,
      visible: this.group.visible,
      childrenCount: this.group.children.length,
      zstack: this.zstack,
      layerType: this.type,
    });

    // Log all children to see what's available
    console.log("All children in group:");
    this.group.children.forEach((child, index) => {
      console.log(`Child ${index}:`, {
        type: child.type,
        uuid: child.uuid.substring(0, 8) + "...", // Just show part of the UUID to keep logs cleaner
        hasUserData: !!child.userData,
        hasMetadata: child.userData && !!child.userData.chunkMetadata,
        isLineSegments: child instanceof THREE.LineSegments,
        isMesh: child instanceof THREE.Mesh,
        isVisible: child.visible,
      });
    });

    // Find the first child with userData.chunkMetadata (should be a line or fill chunk)
    const spatialGeometry = this.group.children.find(
      (child) => child.userData && child.userData.chunkMetadata
    );

    if (spatialGeometry) {
      console.log(
        "%c FOUND SPATIAL GEOMETRY",
        "background: #4CAF50; color: white; padding: 2px 5px; border-radius: 2px;"
      );
      console.log("Spatial geometry details:", {
        type: spatialGeometry.type,
        uuid: spatialGeometry.uuid,
        hasUserData: !!spatialGeometry.userData,
        hasMetadata:
          spatialGeometry.userData && !!spatialGeometry.userData.chunkMetadata,
        isVisible: spatialGeometry.visible,
        metadataKeys:
          spatialGeometry.userData && spatialGeometry.userData.chunkMetadata
            ? Object.keys(spatialGeometry.userData.chunkMetadata)
            : [],
      });

      // Set this as the active geometry for raycasting
      this.sceneManager.setActiveSpatialGeometry(
        spatialGeometry,
        this.jsonData,
        store.get("palette")
      );
    } else {
      console.error(
        "%c NO SUITABLE SPATIAL GEOMETRY",
        "background: #F44336; color: white; padding: 2px 5px; border-radius: 2px;"
      );
      console.log("Could not find any child with userData.chunkMetadata");
      console.log("Call stack:", new Error().stack);
    }
  }

  /**
   * Create visualization for this layer
   * @param {Object} data - Boundary data
   */
  createVisualization(data) {
    if (!data || !data.cellOffsets || !data.points) {
      console.error(`Invalid data for z-stack ${this.zstack}`);
      return;
    }

    // Track if this is the first time creating the visualization
    const isFirstLoad = this.group.children.length === 0;

    // Clear any existing content
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
      this.group.remove(child);
    }

    const opacity = this.opacity;
    const enableInnerColoring = store.get("innerColoring");
    const innerColoringOpacity = store.get("innerColoringOpacity");
    const { cellOffsets, points, cellIds } = data; // YINAN specific
    // const { cellOffsets, points} = data;
    const clusters = store.get("clusters");
    // console.log(clusters);
    const clusterData = cellIds.map((id) => clusters[id.toString()]); // assuming same ordering YINAN specific
    // const clusterData = clusters; // assuming same ordering
    // console.log(clusterData);

    const CHUNK_SIZE = 100; // Number of cells per chunk
    const MAX_POINTS_PER_CELL = 50; // Maximum points per cell when simplified
    let totalPoints = 0;
    const numCells = cellOffsets.length - 1;

    // Process cells in chunks
    for (let chunkStart = 0; chunkStart < numCells; chunkStart += CHUNK_SIZE) {
      const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, numCells);
      const lineGeometries = [];
      const fillGeometries = [];
      // Create a metadata object for this chunk with cluster information

      for (let index = chunkStart; index < chunkEnd; index++) {
        const start = cellOffsets[index] * 2; // YINAN specific
        const end = cellOffsets[index + 1] * 2; // YINAN specific
        // const start = cellOffsets[index] ;
        // const end = cellOffsets[index + 1] ;

        // Create array of points for this cell
        const boundary = [];
        for (let i = start; i < end; i += 2) {
          boundary.push({ x: points[i], y: points[i + 1] });
        }

        if (!boundary.length) continue;
        totalPoints += boundary.length;

        // Simplify points if needed
        const simplifiedBoundary =
          boundary.length > MAX_POINTS_PER_CELL
            ? boundary.filter(
                (_, i) =>
                  i % Math.ceil(boundary.length / MAX_POINTS_PER_CELL) === 0
              )
            : boundary;

        // Create line geometry with indices
        const numPoints = simplifiedBoundary.length;
        const positions = new Float32Array((numPoints + 1) * 3);

        simplifiedBoundary.forEach((pt, i) => {
          positions[i * 3] = pt.x;
          positions[i * 3 + 1] = pt.y;
          positions[i * 3 + 2] = 0;
        });

        // Close the loop
        positions[numPoints * 3] = simplifiedBoundary[0].x;
        positions[numPoints * 3 + 1] = simplifiedBoundary[0].y;
        positions[numPoints * 3 + 2] = 0;

        const lineGeometry = new THREE.BufferGeometry();
        lineGeometry.setAttribute(
          "position",
          new THREE.BufferAttribute(positions, 3)
        );

        // Create indices for line segments
        const indices = new Uint16Array(numPoints * 2);
        for (let i = 0; i < numPoints; i++) {
          indices[i * 2] = i;
          indices[i * 2 + 1] = i + 1;
        }
        lineGeometry.setIndex(new THREE.BufferAttribute(indices, 1));

        // Store metadata for this cell
        const cluster = clusterData[index];
        const clusterColor = store.get("palette")[cluster];

        // Store color for this cell
        const color = new THREE.Color(clusterColor || 0x000000);

        // Add this cell to the chunk metadata
        // if (cluster) {
        //     uniqueClusters.add(cluster);

        //         // Store the cluster value for this line geometry
        //     // We'll use the geometry index in the lineGeometries array as the key
        //     // This will help us identify which cluster a line belongs to when raycasting
        //     const geometryIndex = lineGeometries.length;
        //     clusterMap[geometryIndex] = cluster;

        //     // Also store by vertex indices for more precise lookups
        //     const vertexCount = lineGeometry.attributes.position.count;
        //     for (let i = 0; i < vertexCount; i++) {
        //         clusterMap[`v_${geometryIndex}_${i}`] = cluster;
        //     }
        // }

        // console.log(`Cell ${index} has cluster: ${cluster}`);
        lineGeometries.push(lineGeometry);

        const cellId = cellIds[index];

        // Create fill geometry if enabled
        if (enableInnerColoring && this.type === "boundaries") {
          const shape = new THREE.Shape();
          shape.moveTo(simplifiedBoundary[0].x, simplifiedBoundary[0].y);
          for (let i = 1; i < simplifiedBoundary.length; i++) {
            shape.lineTo(simplifiedBoundary[i].x, simplifiedBoundary[i].y);
          }
          shape.lineTo(simplifiedBoundary[0].x, simplifiedBoundary[0].y);

          const geometry = new THREE.ShapeGeometry(shape);

          // Create color array for all vertices of this shape
          const vertexCount = geometry.attributes.position.count;
          const colors = new Float32Array(vertexCount * 4); // Using RGBA
          for (let i = 0; i < vertexCount; i++) {
            colors[i * 4] = color.r;
            colors[i * 4 + 1] = color.g;
            colors[i * 4 + 2] = color.b;
            colors[i * 4 + 3] = opacity; // Add opacity
          }
          geometry.setAttribute("color", new THREE.BufferAttribute(colors, 4));
          // Create a Float32Array with the cluster value for this cell
          const clusterIdArray = new Float32Array(vertexCount);
          // Fill all vertices with the same cluster value for this cell
          for (let i = 0; i < vertexCount; i++) {
            ``;
            clusterIdArray[i] = cellId;
          }
          geometry.setAttribute(
            "clusterId",
            new THREE.BufferAttribute(clusterIdArray, 1)
          );

          // Add a custom attribute to store cluster IDs
          // Fill with appropriate cluster IDs - use the cluster for this specific cell
          // const cluster = clusterData[index];
          // console.log('Cluster for cell', index, 'is', cluster);
          // for (let i = 0; i < vertexCount; i++) {
          //     clusterIds[i] = clusterData[i];
          // }

          fillGeometries.push(geometry);
        }
      }

      // Process the fill geometries if available

      if (lineGeometries.length > 0) {
        // Create merged line geometry
        const mergedLineGeometry =
          BufferGeometryUtils.mergeGeometries(lineGeometries);
        const lineMaterial = new THREE.LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: opacity,
        });

        // For each mesh in the chunk, create a simple metadata object with just its cluster

        // Store metadata on the line chunk
        const lineChunk = new THREE.LineSegments(
          mergedLineGeometry,
          lineMaterial
        );

        // console.log('%c LINE CHUNK CREATED', 'background: #2196F3; color: white; padding: 2px 5px; border-radius: 2px;');
        // console.log('Line chunk details:', {
        //     type: lineChunk.type,
        //     uuid: lineChunk.uuid.substring(0, 8) + '...',
        //     hasUserData: !!lineChunk.userData,
        //     hasChunkMetadata: lineChunk.userData && !!lineChunk.userData.chunkMetadata,
        //     vertexCount: mergedLineGeometry.attributes.position.count,
        //     hasIndex: !!mergedLineGeometry.index,
        //     indexCount: mergedLineGeometry.index ? mergedLineGeometry.index.count : 0
        // });

        this.group.add(lineChunk);

        // Create merged fill geometry if needed
        if (fillGeometries.length > 0) {
          const mergedFillGeometry =
            BufferGeometryUtils.mergeGeometries(fillGeometries);

          // The colors are already assigned to each geometry before merging
          const fillMaterial = new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: innerColoringOpacity,
            side: THREE.DoubleSide,
          });

          const fillChunk = new THREE.Mesh(mergedFillGeometry, fillMaterial);

          // console.log('%c FILL CHUNK CREATED', 'background: #FF9800; color: white; padding: 2px 5px; border-radius: 2px;');
          // console.log('Fill chunk details:', {
          //     type: fillChunk.type,
          //     uuid: fillChunk.uuid.substring(0, 8) + '...',
          //     hasUserData: !!fillChunk.userData,
          //     hasChunkMetadata: fillChunk.userData && !!fillChunk.userData.chunkMetadata,
          //     vertexCount: mergedFillGeometry.attributes.position.count,
          //     hasIndex: !!mergedFillGeometry.index,
          //     indexCount: mergedFillGeometry.index ? mergedFillGeometry.index.count : 0
          // });

          this.group.add(fillChunk);
        }
      }
    }

    store.set("boundariesRendered", totalPoints);

    // If this was the first load, trigger a mouse move event to activate intersection checking
    if (isFirstLoad && this.sceneManager) {
      // Wait a short time to ensure everything is rendered
      setTimeout(() => {
        // Get the current mouse position from the scene manager
        const mouseX = this.sceneManager.mouse.x || 0;
        const mouseY = this.sceneManager.mouse.y || 0;

        // Create and dispatch a synthetic mousemove event to trigger intersection checking
        const event = new MouseEvent("mousemove", {
          clientX:
            ((mouseX + 1) * this.sceneManager.renderer.domElement.width) / 2,
          clientY:
            ((1 - mouseY) * this.sceneManager.renderer.domElement.height) / 2,
          bubbles: true,
        });

        this.sceneManager.renderer.domElement.dispatchEvent(event);

        // Also directly call the intersection check
        this.sceneManager.checkIntersections();
      }, 300);
    }
  }

  /**
   * Set visibility of this layer
   * @param {boolean} visible - Whether the layer should be visible
   */
  setVisible(visible) {
    this.visible = visible;
    this.group.visible = visible;
  }

  /**
   * Update opacity of this layer
   * @param {number} opacity - New opacity value
   */
  updateOpacity(opacity) {
    // Store the opacity value for future reference
    this.currentOpacity = opacity;

    this.group.traverse((object) => {
      // Only update visible lines and meshes, not the hit detection lines
      if (object instanceof THREE.Line || object instanceof THREE.Mesh) {
        // Skip invisible hit detection lines (they should always stay invisible)
        if (object.material && object.material.visible === false) {
          return;
        }

        // Update the opacity
        if (object.material) {
          object.material.opacity = opacity;

          // If opacity is 0, we still want to be able to make it visible again
          // So we keep the visible property true
          if (opacity === 0) {
            // We don't change visible property, just opacity
            object.material.transparent = true;
          }
        }
      }
    });
  }

  /**
   * Clean up resources used by this layer
   */
  dispose() {
    if (this.scene && this.group) {
      this.scene.remove(this.group);
    }

    if (this.group) {
      this.group.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach((material) => material.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
    }

    this.loaded = false;
    this.loading = false;
  }
}

/**
 * CellBoundaries class manages multiple boundary and nuclei layers
 */
export class CellBoundaries {
  // Static instance tracking for singleton pattern
  static instance = null;

  /**
   * Create a new CellBoundaries manager
   * @param {THREE.Scene} scene - Three.js scene to add boundaries to
   * @param {SceneManager} sceneManager - Reference to the SceneManager for raycasting
   */
  constructor(scene, sceneManager) {
    // Singleton pattern
    if (CellBoundaries.instance) {
      //   console.log(
      //     "CellBoundaries already instantiated, returning existing instance"
      //   );
      return CellBoundaries.instance;
    }

    CellBoundaries.instance = this;
    // console.log("CellBoundaries manager instantiated");

    this.scene = scene;
    this.sceneManager = sceneManager;
    this.boundaryLayers = {}; // Map of z-stack ID to boundary layers
    this.nucleiLayers = {}; // Map of z-stack ID to nuclei layers

    // Store for cluster data and palette
    this.jsonData = null;
    this.palette = null;

    // Subscribe to store changes
    store.subscribe("zstack", () => {
      //   console.log("Z-stack changed, updating boundaries");
      this.updateZStack();
    });

    // Cell boundaries subscriptions
    store.subscribe("showCellBoundaries", (visible) =>
      this.updateVisibility("boundaries", visible)
    );
    store.subscribe("boundaryOpacity", (opacity) =>
      this.updateOpacity("boundaries", opacity)
    );

    // Cell nuclei subscriptions
    store.subscribe("showCellNuclei", (visible) =>
      this.updateVisibility("nuclei", visible)
    );
    store.subscribe("nucleiOpacity", (opacity) =>
      this.updateOpacity("nuclei", opacity)
    );

    // Inner coloring subscriptions (for boundaries only)
    store.subscribe("innerColoring", () => {
      console.log("Inner coloring setting changed, updating all layers");
      this.refreshCurrentLayer("boundaries", true); // true = refresh all layers
    });
    store.subscribe("innerColoringOpacity", () => {
      console.log("Inner coloring opacity changed, updating all layers");
      this.refreshCurrentLayer("boundaries", true); // true = refresh all layers
    });

    // Load initial z-stack
    this.loadBoundaries(store.get("zstack").toString());

    // Load nuclei if supported for the current variant
    if (config.dataPaths.hasNucleiSupport()) {
      this.loadNuclei(store.get("zstack").toString());

      // Show nuclei controls in the UI
      const nucleiControls = document.getElementById("nuclei-controls");
      const nucleiOpacityControl = document.getElementById(
        "nuclei-opacity-control"
      );
      if (nucleiControls) nucleiControls.style.display = "block";
      if (nucleiOpacityControl) nucleiOpacityControl.style.display = "block";
    }

    // Find the appropriate geometry child with chunkMetadata to use for raycasting
    const zstack = store.get("zstack").toString();

    let children = null;
    const interval = setInterval(() => {
      children = this.boundaryLayers[zstack].group.children;
      if (children.length > 0) {
        const oddChildren = children.filter((_, i) => i % 2 !== 0);
        // console.log("Odd children are now available:", oddChildren);
        clearInterval(interval);
        this.sceneManager.setActiveSpatialGeometry(
          oddChildren,
          this.jsonData,
          this.palette
        );

        //   const meshes = children.filter(obj => obj.isMesh);
        //   console.log('Found meshes:', meshes);
      }
    }, 100);
  }

  /**
   * Update which z-stack layer is visible based on store value
   */
  async updateZStack() {
    const zstack = store.get("zstack").toString();
    // console.log(`Updating to z-stack ${zstack}`);

    // Hide all boundary layers
    Object.values(this.boundaryLayers).forEach((layer) => {
      layer.group.visible = false;
    });

    // Hide all nuclei layers
    Object.values(this.nucleiLayers).forEach((layer) => {
      layer.group.visible = false;
    });

    // Check if cell boundaries are enabled
    const showCellBoundaries = store.get("showCellBoundaries");

    // Only load boundaries if they're enabled
    if (showCellBoundaries) {
      // Load the current boundary layer
      await this.loadBoundaries(zstack);

      // Make the current boundary layer visible
      if (this.boundaryLayers[zstack]) {
        this.boundaryLayers[zstack].visible = true;
        this.boundaryLayers[zstack].group.visible = true;

        // Set the active spatial geometry for raycasting
        if (this.sceneManager) {
          //   console.log("Setting active spatial geometry for z-stack:", zstack);

          // Make sure the boundary layer has the sceneManager reference
          if (!this.boundaryLayers[zstack].sceneManager) {
            this.boundaryLayers[zstack].sceneManager = this.sceneManager;
          }

          // Find the appropriate geometry child with chunkMetadata to use for raycasting
          let children = null;
          const interval = setInterval(() => {
            children = this.boundaryLayers[zstack].group.children;
            if (children.length > 0) {
              const oddChildren = children.filter((_, i) => i % 2 !== 0);
              //   console.log("Odd children are now available:", oddChildren);
              clearInterval(interval);
              this.sceneManager.setActiveSpatialGeometry(
                oddChildren,
                this.jsonData,
                this.palette
              );
            }
          }, 100);
        }
      }
    } else {
      // Boundaries are disabled, clear active spatial geometry
      if (this.sceneManager) {
        console.log(
          "Cell boundaries disabled, clearing active spatial geometry"
        );
        this.sceneManager.setActiveSpatialGeometry(null, null, null);
      }
    }

    // Check if nuclei are enabled and supported
    const showCellNuclei = store.get("showCellNuclei");

    if (config.dataPaths.hasNucleiSupport() && showCellNuclei) {
      // Only load nuclei if they're enabled
      await this.loadNuclei(zstack);

      // Make the current nuclei layer visible
      if (this.nucleiLayers[zstack]) {
        this.nucleiLayers[zstack].visible = true;
        this.nucleiLayers[zstack].group.visible = true;
      }
    }
  }

  /**
   * Load boundaries for a specific z-stack
   * @param {number} zstack - The z-stack to load
   */
  loadBoundaries(zstack) {
    if (this.boundaryLayers[zstack]) {
      // Already loaded
      //   console.log(`Boundary layer for z-stack ${zstack} already loaded`);
      return;
    }

    // console.log(`Loading boundary layer for z-stack ${zstack}`);

    // Create a new boundary layer with the correct parameters
    this.boundaryLayers[zstack] = new BoundaryLayer(
      zstack,
      this.scene,
      "boundaries"
    );

    // Pass the sceneManager reference to the boundary layer
    this.boundaryLayers[zstack].sceneManager = this.sceneManager;

    // Load the layer data
    this.boundaryLayers[zstack]
      .load()
      .then(() => {
        // console.log(`Successfully loaded boundary data for z-stack ${zstack}`);

        // After loading, check if this is the current z-stack and update raycasting
        if (zstack === store.get("zstack") && store.get("showCellBoundaries")) {
          // console.log(
          //   "This is the current z-stack, updating active spatial geometry"
          //   );
          this.updateZStack(zstack);
        }
      })
      .catch((error) => {
        console.error(`Error loading boundaries for z-stack ${zstack}:`, error);
      });
  }

  /**
   * Load nuclei for a specific z-stack
   * @param {string} zstack - Z-stack identifier
   */
  loadNuclei(zstack) {
    // Skip if nuclei are not supported for the current variant
    if (!config.dataPaths.hasNucleiSupport()) {
      console.log("Nuclei not supported for current variant, skipping");
      return;
    }

    // console.log(`Loading nuclei for z-stack ${zstack}`);

    // Create a new layer if it doesn't exist
    if (!this.nucleiLayers[zstack]) {
      this.nucleiLayers[zstack] = new BoundaryLayer(
        zstack,
        this.scene,
        "nuclei"
      );
      this.scene.add(this.nucleiLayers[zstack].group);
    }

    // Load the layer data
    this.nucleiLayers[zstack].load();
  }

  /**
   * Update visibility of layers of a specific type
   * @param {string} type - Type of layer ('boundaries' or 'nuclei')
   * @param {boolean} visible - Whether to show or hide the layers
   */
  updateVisibility(type, visible) {
    console.log(`Updating visibility of ${type} to ${visible}`);

    const currentZstack = store.get("zstack").toString();
    if (type === "boundaries") {
      // Update all boundary layers
      Object.values(this.boundaryLayers).forEach((layer) => {
        if (visible == true) {
          if (layer.zstack == currentZstack) {
            layer.visible = visible;
            layer.group.visible = visible;
          }
        } else {
          layer.visible = visible;
          layer.group.visible = visible;
        }
      });

      // Update the active spatial geometry for raycasting
      if (visible && this.boundaryLayers[currentZstack] && this.sceneManager) {
        // Make sure the boundary layer has the sceneManager reference
        if (!this.boundaryLayers[currentZstack].sceneManager) {
          this.boundaryLayers[currentZstack].sceneManager = this.sceneManager;
        }

        console.log(
          "%c SETTING ACTIVE SPATIAL GEOMETRY IN updateVisibility",
          "background: #E91E63; color: white; padding: 2px 5px; border-radius: 2px;"
        );

        // Find the appropriate geometry child with chunkMetadata to use for raycasting
        if (
          this.boundaryLayers[currentZstack].group &&
          this.boundaryLayers[currentZstack].group.children
        ) {
          const spatialGeometry = this.boundaryLayers[
            currentZstack
          ].group.children.find(
            (child) => child.userData && child.userData.chunkMetadata
          );

          if (spatialGeometry) {
            console.log(
              "%c FOUND SPATIAL GEOMETRY FOR RAYCASTING",
              "background: #4CAF50; color: white; padding: 2px 5px; border-radius: 2px;"
            );
            console.log("Using geometry:", {
              type: spatialGeometry.type,
              uuid: spatialGeometry.uuid,
              hasUserData: !!spatialGeometry.userData,
              hasChunkMetadata:
                spatialGeometry.userData &&
                !!spatialGeometry.userData.chunkMetadata,
            });

            // Set the actual geometry object as the active spatial geometry
            this.sceneManager.setActiveSpatialGeometry(
              spatialGeometry,
              this.jsonData,
              this.palette
            );
          } else {
            console.error(
              "%c NO SUITABLE SPATIAL GEOMETRY FOUND",
              "background: #F44336; color: white; padding: 2px 5px; border-radius: 2px;"
            );
            console.log(
              "Group children:",
              this.boundaryLayers[currentZstack].group.children
            );
          }
        } else {
          console.error(
            "%c NO GROUP OR CHILDREN AVAILABLE",
            "background: #F44336; color: white; padding: 2px 5px; border-radius: 2px;"
          );
        }
      } else if (!visible && this.sceneManager) {
        // Clear the active spatial geometry when hiding boundaries
        this.sceneManager.setActiveSpatialGeometry(null, null, null);
        console.log("Cleared active spatial geometry due to visibility change");
      }
    } else if (type === "nuclei") {
      // Update all nuclei layers
      Object.values(this.nucleiLayers).forEach((layer) => {
        layer.visible = visible;
        layer.group.visible = visible;
      });
    }

    // Force a render update
    store.set("forceRender", true);
  }

  /**
   * Update opacity of all layers of a specific type
   * @param {string} type - Type of layer ('boundaries' or 'nuclei')
   * @param {number} opacity - Opacity value (0-1)
   */
  updateOpacity(type, opacity) {
    console.log(`Updating ${type} opacity to ${opacity}`);

    // Select the appropriate layer collection
    const layers =
      type === "boundaries" ? this.boundaryLayers : this.nucleiLayers;

    // Update all layers of this type
    Object.values(layers).forEach((layer) => {
      layer.updateOpacity(opacity);
    });
  }

  /**
   * Refresh layers of a specific type
   * @param {string} type - Type of layer ('boundaries' or 'nuclei')
   * @param {boolean} refreshAll - Whether to refresh all layers or just the current one
   */
  refreshCurrentLayer(type, refreshAll = false) {
    const zstack = store.get("zstack").toString();

    // Select the appropriate layer collection
    const layers =
      type === "boundaries" ? this.boundaryLayers : this.nucleiLayers;

    if (refreshAll) {
      console.log(`Refreshing all ${type} layers`);
      Object.values(layers).forEach((layer) => {
        if (layer.loaded) {
          layer.refresh();
        }
      });
    } else if (layers[zstack] && layers[zstack].loaded) {
      console.log(`Refreshing current ${type} layer (z-stack ${zstack})`);
      layers[zstack].refresh();
    }
  }

  /**
   * Get the number of boundaries rendered
   * @returns {number} Number of boundaries rendered
   */
  getBoundariesRendered() {
    const zstack = store.get("zstack").toString();
    let count = 0;

    // Count boundaries
    if (this.boundaryLayers[zstack] && this.boundaryLayers[zstack].loaded) {
      count += this.boundaryLayers[zstack].boundariesRendered;
    }

    // Count nuclei if supported
    if (
      config.dataPaths.hasNucleiSupport() &&
      this.nucleiLayers[zstack] &&
      this.nucleiLayers[zstack].loaded
    ) {
      count += this.nucleiLayers[zstack].boundariesRendered;
    }

    return count;
  }

  /**
   * Get all visible cell boundaries for interaction testing
   * @returns {Array} Array of all visible boundary objects
   */
  getVisibleBoundaries() {
    const zstack = store.get("zstack").toString();
    let boundaries = [];

    // Get boundaries
    if (this.boundaryLayers[zstack] && this.boundaryLayers[zstack].group) {
      boundaries = boundaries.concat(
        this.boundaryLayers[zstack].group.children
      );
    }

    // Get nuclei if supported
    if (
      config.dataPaths.hasNucleiSupport() &&
      this.nucleiLayers[zstack] &&
      this.nucleiLayers[zstack].group
    ) {
      boundaries = boundaries.concat(this.nucleiLayers[zstack].group.children);
    }

    return boundaries;
  }

  /**
   * Dispose of all layers
   */
  dispose() {
    // Dispose of all boundary layers
    Object.values(this.boundaryLayers).forEach((layer) => {
      layer.dispose();
    });

    // Dispose of all nuclei layers
    Object.values(this.nucleiLayers).forEach((layer) => {
      layer.dispose();
    });

    this.boundaryLayers = {};
    this.nucleiLayers = {};
    CellBoundaries.instance = null;
  }

  /**
   * Generate mock cell boundary data for testing
   * @param {number} numCells - Number of cells to generate
   * @returns {Object} Mock cell boundary data in the same format as the real data
   */
  static generateMockData(numCells = 10) {
    // Generate mock data in the format expected by BoundaryLayer
    const cellOffsets = new Array(numCells + 1);
    const points = [];

    for (let i = 0; i < numCells; i++) {
      cellOffsets[i] = points.length / 2;

      // Generate a random polygon with 5-15 points
      const numPoints = 5 + Math.floor(Math.random() * 10);
      const centerX = Math.random() * 10000;
      const centerY = Math.random() * 10000;
      const radius = 500 + Math.random() * 1000;

      for (let j = 0; j < numPoints; j++) {
        const angle = (j / numPoints) * Math.PI * 2;
        // Add some randomness to the radius for more natural shapes
        const r = radius * (0.8 + Math.random() * 0.4);

        points.push(centerX + Math.cos(angle) * r);
        points.push(centerY + Math.sin(angle) * r);
      }

      // Close the polygon
      points.push(points[cellOffsets[i] * 2]);
      points.push(points[cellOffsets[i] * 2 + 1]);
    }

    cellOffsets[numCells] = points.length / 2;

    return {
      cellOffsets: cellOffsets,
      points: points,
    };
  }
}
