/**
 * SceneManager.js
 * Handles Three.js scene initialization and management
 * Responsible for camera, renderer, and scene setup
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import Stats from "three/examples/jsm/libs/stats.module.js";
import { store } from "./store.js";
import { config } from "./config.js";

export class SceneManager {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.stats = null;
    this.clock = new THREE.Clock();
    this.frameCount = 0;

    // Data bounds for centering
    this.dataBounds = {
      minX: 0,
      maxX: 2000,
      minY: 0,
      maxY: 2000,
    };

    // Check if device is mobile
    this.isMobile = this.checkIfMobile();

    // Mouse variables
    this.mouse = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.hoveredPoint = null;
    this.lastCameraPosition = new THREE.Vector3();

    // Disable raycaster on mobile devices
    this.raycasterEnabled = !this.isMobile;

    // Active spatial geometry for raycasting
    this.activeSpatialGeometry = null;

    // Tooltip for displaying cluster information
    this.tooltip = this.createTooltip();

    // JSON data for the active spatial geometry
    this.jsonData = null;

    // Palette for cluster colors
    this.pallete = {};

    // Store the data bounds in the store for transformations
    store.set("dataBounds", this.dataBounds);
  }

  /**
   * Check if the current device is mobile
   * @returns {boolean} True if the device is mobile
   */
  checkIfMobile() {
    // Check for mobile user agent
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const mobileRegex =
      /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino|android|ipad|playbook|silk/i;
    const mobileCheck =
      mobileRegex.test(userAgent) ||
      /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(
        userAgent.substr(0, 4)
      );

    // Also check for touch capability as a secondary indicator
    const touchCapable =
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      navigator.msMaxTouchPoints > 0;

    // console.log(`Device detected as ${mobileCheck || touchCapable ? 'mobile' : 'desktop'}`);
    return mobileCheck || touchCapable;
  }

  /**
   * Initialize the Three.js scene, camera, and renderer
   */
  initialize() {
    // console.log('Initializing SceneManager');
    try {
      this.initScene();
      this.initCamera();
      this.initRenderer();
      this.initControls();
      this.initStats();

      // Handle window resize
      window.addEventListener("resize", () => this.onWindowResize());

      // console.log('SceneManager initialized');
      return true;
    } catch (error) {
      console.error("Error initializing SceneManager:", error);
      return false;
    }
  }

  /**
   * Initialize the Three.js scene
   */
  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
  }

  /**
   * Initialize the camera with orthographic projection for 2D view
   */
  initCamera() {
    const aspect = this.container.clientWidth / this.container.clientHeight;

    // Calculate the center of the data
    const centerX = (this.dataBounds.minX + this.dataBounds.maxX) / 2;
    const centerY = (this.dataBounds.minY + this.dataBounds.maxY) / 2;
    const dataWidth = this.dataBounds.maxX - this.dataBounds.minX;
    const dataHeight = this.dataBounds.maxY - this.dataBounds.minY;

    // Use orthographic camera for 2D view
    const frustumSize = Math.max(dataWidth, dataHeight);
    this.camera = new THREE.OrthographicCamera(
      (frustumSize * aspect) / -2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      frustumSize / -2,
      1,
      10000
    );

    // Position camera to look at the center of the data
    // console.log(`Camera looking at: (${centerX.toFixed(2)}, ${centerY.toFixed(2)}, 0)`);
    this.camera.position.set(centerX, centerY, 5000);
    this.camera.lookAt(centerX, centerY, 0);

    // Store the initial camera distance in the store
    store.set("cameraDistance", 5000);
  }

  /**
   * Initialize the renderer with optimizations for large point clouds
   */
  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(
      this.container.clientWidth,
      this.container.clientHeight
    );
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);

    // Add mouse move event listener for raycasting
    this.renderer.domElement.addEventListener("mousemove", (event) => {
      // Calculate mouse position in normalized device coordinates (-1 to +1)
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    });
  }

  /**
   * Initialize orbit controls with restrictions for 2D view
   */
  initControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableRotate = false; // Disable rotation for 2D view
    this.controls.enableDamping = false;
    this.controls.screenSpacePanning = true;

    // Set target to center of data
    const centerX = (this.dataBounds.minX + this.dataBounds.maxX) / 2;
    const centerY = (this.dataBounds.minY + this.dataBounds.maxY) / 2;
    this.controls.target.set(centerX, centerY, 0);

    // Configure mouse buttons for controls
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN, // Use left mouse button for panning
      MIDDLE: THREE.MOUSE.DOLLY, // Use middle mouse button (scroll wheel) for zooming
      RIGHT: THREE.MOUSE.ROTATE, // Right mouse button (not used since rotation is disabled)
    };
  }

  /**
   * Initialize stats for performance monitoring
   */
  initStats() {
    this.stats = new Stats();
    // Uncomment to show stats panel
    // this.container.appendChild(this.stats.dom);
  }

  /**
   * Handle window resize events
   */
  onWindowResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    const aspect = width / height;
    const frustumSize = Math.max(
      this.dataBounds.maxX - this.dataBounds.minX,
      this.dataBounds.maxY - this.dataBounds.minY
    );

    if (this.camera instanceof THREE.OrthographicCamera) {
      this.camera.left = (frustumSize * aspect) / -2;
      this.camera.right = (frustumSize * aspect) / 2;
      this.camera.top = frustumSize / 2;
      this.camera.bottom = frustumSize / -2;
    } else {
      this.camera.aspect = aspect;
    }

    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * Animation loop
   */
  animate() {
    requestAnimationFrame(() => this.animate());

    try {
      // Update controls
      this.controls.update();

      // Update camera distance for LOD calculations - only calculate every few frames for better performance
      if (this.frameCount % 10 === 0) {
        // Only update every 10 frames
        const cameraPosition = new THREE.Vector3();
        this.camera.getWorldPosition(cameraPosition);
        const distance = cameraPosition.distanceTo(
          new THREE.Vector3(
            (this.dataBounds.minX + this.dataBounds.maxX) / 2,
            (this.dataBounds.minY + this.dataBounds.maxY) / 2,
            0
          )
        );
        store.set("cameraDistance", distance);
      }

      // Check for raycaster intersections if we have a mouse position
      if (this.mouse.x !== 0 || this.mouse.y !== 0) {
        if (this.activeSpatialGeometry) {
          // Only log every 300 frames to reduce console spam
          // if (this.frameCount % 300 === 0) {
          //     console.log(this.activeSpatialGeometry)
          //     console.log('%c ACTIVE SPATIAL GEOMETRY PRESENT', 'background: #4CAF50; color: white; padding: 2px 5px; border-radius: 2px;');
          //     console.log('Active spatial geometry details:', {
          //         type: this.activeSpatialGeometry.type,
          //         uuid: this.activeSpatialGeometry.uuid,
          //         visible: this.activeSpatialGeometry.visible,
          //         hasUserData: this.activeSpatialGeometry.userData ? true : false,
          //         hasChunkMetadata: this.activeSpatialGeometry.userData &&
          //                           this.activeSpatialGeometry.userData.chunkMetadata ? true : false
          //     });
          // }
          this.checkIntersections();
        }
      }

      // Update stats
      this.stats.update();

      // Render scene
      this.renderer.render(this.scene, this.camera);

      // Increment frame counter
      this.frameCount++;
    } catch (error) {
      console.error("Error in animation loop:", error);
    }
  }

  /**
   * Start the animation loop
   */
  start() {
    this.animate();
  }

  /**
   * Set the active spatial geometry for raycasting
   * @param {THREE.Object3D|Object|Array} geometry - The geometry to use for raycasting
   * @param {Object} jsonData - The JSON data containing cluster information
   * @param {Object} palette - The color palette for clusters
   */
  setActiveSpatialGeometry(geometry, jsonData, palette) {
    // console.log('%c SETTING ACTIVE SPATIAL GEOMETRY', 'background: #4CAF50; color: white; padding: 2px 5px; border-radius: 2px;');

    // Validate inputs
    if (!geometry) {
      // console.log('Clearing active spatial geometry');
      this.activeSpatialGeometry = null;
      this.jsonData = null;
      this.pallete = null;
      this.hideTooltip();
      return;
    }

    // Store the geometry for raycasting
    this.activeSpatialGeometry = geometry;
    this.jsonData = jsonData;
    this.pallete = palette;

    // console.log('Active spatial geometry set successfully');

    // Trigger an initial intersection check to activate hover functionality immediately
    // Use setTimeout to ensure the geometry is fully processed before checking
    setTimeout(() => {
      // Only check if we have mouse position data
      if (this.mouse.x !== undefined && this.mouse.y !== undefined) {
        this.checkIntersections();
      }
    }, 100);
  }

  /**
   * Initialize stats for performance monitoring
   */
  initStats() {
    this.stats = new Stats();
    // Uncomment to show stats panel
    // this.container.appendChild(this.stats.dom);
  }

  /**
   * Handle window resize events
   */
  onWindowResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.left = -width / 2;
    this.camera.right = width / 2;
    this.camera.top = height / 2;
    this.camera.bottom = -height / 2;

    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * Check for intersections between the raycaster and the active spatial geometry
   * Disabled on mobile devices
   */
  checkIntersections() {
    // Skip if no active spatial geometry is set or if raycaster is disabled (mobile)
    if (!this.activeSpatialGeometry || !this.raycasterEnabled) {
      if (this.hoveredPoint) {
        this.hoveredPoint = null;
        this.hideTooltip();
      }
      return;
    }

    // Log every 60 frames to avoid console spam
    // const shouldLog = this.frameCount % 60 === 0;
    const shouldLog = null;

    if (shouldLog) {
      console.log(
        "%c CHECKING INTERSECTIONS",
        "background: #FF9800; color: white; padding: 2px 5px; border-radius: 2px;"
      );
      console.log("Mouse position:", this.mouse);
      console.log("Active spatial geometry status:", {
        type: this.activeSpatialGeometry.type,
        uuid: this.activeSpatialGeometry.uuid,
        hasUserData: this.activeSpatialGeometry.userData ? true : false,
        isVisible: this.activeSpatialGeometry.visible,
        childCount:
          this.activeSpatialGeometry instanceof THREE.Group
            ? this.activeSpatialGeometry.children.length
            : "not a group",
      });
    }

    // Get current camera position to check if we've moved
    const currentCameraPosition = this.camera.position.clone();
    this.lastCameraPosition.copy(currentCameraPosition);

    // Calculate camera distance to determine raycaster parameters
    const cameraDistance = this.camera.position.z;

    // Set adaptive thresholds for raycasting based on zoom level
    const minThreshold = 0.2; // When zoomed in very close
    const maxThreshold = 2.0; // When zoomed out far

    // Calculate adaptive threshold based on camera distance
    let threshold;
    if (cameraDistance < 50) {
      threshold = minThreshold;
    } else if (cameraDistance > 500) {
      threshold = maxThreshold;
    } else {
      const t = (cameraDistance - 50) / (500 - 50); // Normalized distance (0-1)
      threshold = minThreshold + t * t * (maxThreshold - minThreshold);
    }

    // Update the point threshold
    if (!this.raycaster.params.Points) this.raycaster.params.Points = {};
    this.raycaster.params.Points.threshold = threshold;

    // Update the raycaster with the current mouse position and camera
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Increase threshold for line segments to make them easier to hit
    const originalLineThreshold = this.raycaster.params.Line
      ? this.raycaster.params.Line.threshold
      : 1;
    if (!this.raycaster.params.Line) this.raycaster.params.Line = {};
    this.raycaster.params.Line.threshold = 5; // Larger threshold for lines

    // Perform raycasting against all objects in the active spatial geometry
    let intersects = [];
    try {
      intersects = this.raycaster.intersectObjects(
        Array.isArray(this.activeSpatialGeometry)
          ? this.activeSpatialGeometry
          : [this.activeSpatialGeometry],
        true
      );
    } catch (error) {
      console.error("Error during raycasting:", error);
      return;
    } finally {
      // Restore original threshold
      this.raycaster.params.Line.threshold = originalLineThreshold;
    }

    // if (shouldLog) {
    //     console.log('Intersection results:', {
    //         count: intersects.length,
    //         first: intersects.length > 0 ? {
    //             distance: intersects[0].distance,
    //             objectType: intersects[0].object.type
    //         } : null
    //     });
    // }

    // Process the first intersection if any
    if (intersects.length > 0) {
      const intersection = intersects[0];
      const object = intersection.object;
      const position = intersection.point;

      // Try to get the cluster ID from the object's userData

      // Check if the geometry has the clusterId attribute
      if (
        object.geometry &&
        object.geometry.attributes &&
        object.geometry.attributes.clusterId
      ) {
        // Get the cell ID from the clusterId attribute using the face index
        const cellId =
          object.geometry.attributes.clusterId.array[intersection.face.a];

        // Look up the cluster using the cell ID
        const clusters = store.get("clusters");
        const cluster = clusters[cellId];

        // If we have a valid cluster, show the tooltip
        if (cluster !== undefined && cluster !== null) {
          this.showTooltip(position, cluster);
          this.hoveredPoint = intersection.face.a;
          return; // Exit early since we've handled the tooltip
        }
      }

      // If we got here, we didn't find a valid cluster ID
      // Hide the tooltip if it's currently shown
      if (this.hoveredPoint !== null) {
        this.hoveredPoint = null;
        this.hideTooltip();
      }
    } else {
      // No intersections found, hide tooltip
      if (this.hoveredPoint !== null) {
        this.hoveredPoint = null;
        this.hideTooltip();
      }
    }
  }

  /**
   * Create a tooltip element for displaying cluster information
   * @returns {HTMLElement} The tooltip element
   */
  createTooltip() {
    // Create a tooltip element
    const tooltip = document.createElement("div");
    tooltip.className = "point-tooltip";
    tooltip.style.position = "absolute";
    tooltip.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
    tooltip.style.color = "white";
    tooltip.style.padding = "6px 10px";
    tooltip.style.borderRadius = "4px";
    tooltip.style.fontSize = "14px";
    tooltip.style.fontFamily = "Arial, sans-serif";
    tooltip.style.pointerEvents = "none";
    tooltip.style.display = "none";
    tooltip.style.zIndex = "1000";
    tooltip.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";
    tooltip.style.minWidth = "80px";

    // Add the tooltip to the document body
    document.body.appendChild(tooltip);

    return tooltip;
  }

  /**
   * Show the tooltip with cluster information
   * @param {THREE.Vector3} position - The 3D position to show the tooltip at
   * @param {string} clusterValue - The cluster value to display
   */
  showTooltip(position, clusterValue) {
    // Validate inputs
    if (!position || clusterValue === undefined || clusterValue === null) {
      console.warn("Invalid inputs for showTooltip:", {
        position,
        clusterValue,
      });
      return;
    }

    // Create the tooltip if it doesn't exist
    if (!this.tooltip) {
      this.tooltip = this.createTooltip();
    }

    try {
      // Get the screen position for the tooltip
      const screenPosition = position.clone().project(this.camera);
      const x =
        (screenPosition.x * 0.5 + 0.5) * this.renderer.domElement.clientWidth;
      const y =
        (-(screenPosition.y * 0.5) + 0.5) *
        this.renderer.domElement.clientHeight;

      // Check if the position is valid (on screen)
      // if (isNaN(x) || isNaN(y) || x < 0 || x > this.renderer.domElement.clientWidth ||
      //     y < 0 || y > this.renderer.domElement.clientHeight) {
      //     console.warn('Tooltip position is off-screen:', { x, y });
      //     return;
      // }

      // Get the color for this cluster from the palette
      // First try the palette passed to setActiveSpatialGeometry, then fall back to store
      const palette = this.pallete || store.get("palette") || {};
      const clusterColor = palette[clusterValue] || "#CCCCCC";

      // Set the tooltip content
      this.tooltip.innerHTML = `
                <div style="display: flex; align-items: center;">
                    <div style="width: 12px; height: 12px; border-radius: 50%; background-color: ${clusterColor}; margin-right: 6px;"></div>
                    <span>${clusterValue}</span>
                </div>
            `;

      // Position the tooltip
      this.tooltip.style.left = `${x + 15}px`; // Offset to not cover the point
      this.tooltip.style.top = `${y - 15}px`; // Offset to not cover the point

      // Show the tooltip
      this.tooltip.style.display = "block";
    } catch (error) {
      console.error("Error showing tooltip:", error);
    }
  }

  /**
   * Hide the tooltip
   */
  hideTooltip() {
    if (!this.tooltip) {
      return;
    }

    this.tooltip.style.display = "none";
    this.hoveredPoint = null;
  }

  /**
   * Update camera position and target based on coordinate transformations
   */
  updateCameraForTransformations() {
    if (!this.camera || !this.controls) return;

    // Get the original center of the data
    const originalCenterX = (this.dataBounds.minX + this.dataBounds.maxX) / 2;
    const originalCenterY = (this.dataBounds.minY + this.dataBounds.maxY) / 2;

    // Apply the same transformations to the center point as we do to the data
    const transformedCenter = store.transformGenePoint({
      x: originalCenterX,
      y: originalCenterY,
    });

    // Update camera position and controls target
    this.camera.position.set(
      transformedCenter.x,
      transformedCenter.y,
      this.camera.position.z
    );
    this.controls.target.set(transformedCenter.x, transformedCenter.y, 0);

    // Update camera and controls
    this.camera.updateProjectionMatrix();
    this.controls.update();

    // console.log(`Camera position updated for transformations: (${transformedCenter.x}, ${transformedCenter.y})`);
  }

  /**
   * Update data bounds based on loaded data
   * @param {Array} points - Array of points with x, y, z coordinates
   */
  updateDataBounds(points) {
    if (!points || points.length === 0) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;

    // Calculate bounds and sum for mean calculation
    points.forEach((point) => {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);

      sumX += point.x;
      sumY += point.y;
      sumZ += point.z || 0; // Use z if available, otherwise 0
    });

    // Calculate mean position
    const meanX = sumX / points.length;
    const meanY = sumY / points.length;
    const meanZ = sumZ / points.length;

    // Store mean position for potential future 3D visualization
    store.set("meanX", meanX);
    store.set("meanY", meanY);
    store.set("meanZ", meanZ);

    // console.log(`Mean position: (${meanX.toFixed(2)}, ${meanY.toFixed(2)}, ${meanZ.toFixed(2)})`);

    // Add padding
    const paddingX = (maxX - minX) * 0.1;
    const paddingY = (maxY - minY) * 0.1;

    this.dataBounds.minX = minX - paddingX;
    this.dataBounds.maxX = maxX + paddingX;
    this.dataBounds.minY = minY - paddingY;
    this.dataBounds.maxY = maxY + paddingY;

    // Update store with new bounds
    store.set("dataBounds", this.dataBounds);

    // If camera exists, update its position and target
    if (this.camera) {
      // Use center of bounds for 2D view
      const centerX = (this.dataBounds.minX + this.dataBounds.maxX) / 2;
      const centerY = (this.dataBounds.minY + this.dataBounds.maxY) / 2;

      const transformedCenter = store.transformGenePoint({
        x: centerX,
        y: centerY,
      });

      // Calculate the appropriate camera distance based on data bounds
      if (this.camera instanceof THREE.OrthographicCamera) {
        const frustumSize = Math.max(
          this.dataBounds.maxX - this.dataBounds.minX,
          this.dataBounds.maxY - this.dataBounds.minY
        );
        const aspect =
          this.renderer.domElement.width / this.renderer.domElement.height;

        this.camera.left = (frustumSize * aspect) / -2;
        this.camera.right = (frustumSize * aspect) / 2;
        this.camera.top = frustumSize / 2;
        this.camera.bottom = frustumSize / -2;
        this.camera.updateProjectionMatrix();
      }

      // Update camera position
      this.camera.position.set(
        transformedCenter.x,
        transformedCenter.y,
        this.camera.position.z
      );
      this.camera.lookAt(transformedCenter.x, transformedCenter.y, 0);

      // Update controls target
      if (this.controls) {
        this.controls.target.set(transformedCenter.x, transformedCenter.y, 0);
        this.controls.update();
      }
    }
  }

  /**
   * Get the scene object
   * @returns {THREE.Scene} The Three.js scene
   */
  getScene() {
    return this.scene;
  }

  /**
   * Get the camera object
   * @returns {THREE.Camera} The Three.js camera
   */
  getCamera() {
    return this.camera;
  }

  /**
   * Get the renderer object
   * @returns {THREE.WebGLRenderer} The Three.js renderer
   */
  getRenderer() {
    return this.renderer;
  }

  /**
   * Get the controls object
   * @returns {OrbitControls} The orbit controls
   */
  getControls() {
    return this.controls;
  }
}
