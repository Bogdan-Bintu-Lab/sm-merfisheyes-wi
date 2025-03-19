/**
 * Main application file for MERFISH visualization
 * Sets up Three.js scene, camera, and renderer
 * Manages the visualization lifecycle
 */

// Import dependencies
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Stats from 'three/addons/libs/stats.module.js';
import { store } from './store.js';
import { GeneLoader } from './geneLoader.js';
import { CellBoundaries } from './cellBoundaries.js';

// Initialize Three.js scene
let scene, camera, renderer, controls, stats;
let geneLoader, cellBoundaries;
let clock = new THREE.Clock();

// Data bounds for centering
const dataBounds = {
    minX: 0,
    maxX: 10000,
    minY: 0,
    maxY: 10000
};

// Hover window variables
let hoverWindow = document.getElementById('hover-window');
let cellTypeElement = document.getElementById('cell-type');
let cellSubtypeElement = document.getElementById('cell-subtype');
let cellIdElement = document.getElementById('cell-id');
let mouse = new THREE.Vector2();
let raycaster = new THREE.Raycaster();

// Initialize the application
function init() {
    try {
        // Create scene
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000000);
        
        // Create camera - using orthographic camera for 2D view
        const container = document.getElementById('visualization');
        const aspect = container.clientWidth / container.clientHeight;
        
        // Calculate the center of the data
        const centerX = (dataBounds.minX + dataBounds.maxX) / 2;
        const centerY = (dataBounds.minY + dataBounds.maxY) / 2;
        const dataWidth = dataBounds.maxX - dataBounds.minX;
        const dataHeight = dataBounds.maxY - dataBounds.minY;
        
        // Use orthographic camera for 2D view
        const frustumSize = Math.max(dataWidth, dataHeight);
        camera = new THREE.OrthographicCamera(
            frustumSize * aspect / -2,
            frustumSize * aspect / 2,
            frustumSize / 2,
            frustumSize / -2,
            1,
            100000
        );
        
        // Position camera to look at the center of the data
        camera.position.set(centerX, centerY, 5000);
        camera.lookAt(centerX, centerY, 0);
        
        // Create renderer
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(renderer.domElement);
        
        // Add orbit controls but restrict to 2D movement (pan and zoom only)
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableRotate = false; // Disable rotation for 2D view
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.screenSpacePanning = true;
        controls.target.set(centerX, centerY, 0); // Set target to center of data
        
        // Configure mouse buttons for controls
        controls.mouseButtons = {
            LEFT: THREE.MOUSE.PAN,       // Use left mouse button for panning
            MIDDLE: THREE.MOUSE.DOLLY,   // Use middle mouse button (scroll wheel) for zooming
            RIGHT: THREE.MOUSE.ROTATE    // Right mouse button (not used since rotation is disabled)
        };
        
        // Add stats
        stats = new Stats();
        container.appendChild(stats.dom);
        
        // Initialize loaders
        geneLoader = new GeneLoader(scene);
        cellBoundaries = new CellBoundaries(scene);
        
        // Handle window resize
        window.addEventListener('resize', onWindowResize);
        
        // Start animation loop
        animate();
        
        // Load initial gene
        store.set('currentGene', 'Gad1');
        
        console.log('MERFISH visualization initialized');
        
        // Add mouse move event listener
        document.addEventListener('mousemove', onDocumentMouseMove);
    } catch (error) {
        console.error('Error initializing visualization:', error);
        alert('There was an error initializing the visualization. Please check the console for details.');
    }
}

// Handle mouse move events
function onDocumentMouseMove(event) {
    // Calculate mouse position in normalized device coordinates
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // Update raycaster
    raycaster.setFromCamera(mouse, camera);
    
    // Find intersections with cell boundaries only
    if (cellBoundaries && cellBoundaries.boundariesGroup) {
        const intersects = raycaster.intersectObjects(cellBoundaries.boundariesGroup.children, true);
        
        if (intersects.length > 0) {
            // Get the first intersection (closest object)
            const intersection = intersects[0];
            
            // Update hover window position
            hoverWindow.style.left = event.clientX + 10 + 'px';
            hoverWindow.style.top = event.clientY - 10 + 'px';
            
            // Update cell type information from the intersected object's userData
            const userData = intersection.object.userData;
            cellTypeElement.textContent = userData.cellType || 'Unknown';
            cellSubtypeElement.textContent = userData.cellSubtype || 'Unknown';
            cellIdElement.textContent = userData.cellId || 'Unknown';
            
            // Show the hover window
            hoverWindow.classList.remove('hidden');
            hoverWindow.classList.add('visible');
        } else {
            // Hide the hover window when not hovering over a boundary
            hoverWindow.classList.remove('visible');
            hoverWindow.classList.add('hidden');
        }
    }
}

// Handle window resize
function onWindowResize() {
    const container = document.getElementById('visualization');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    const aspect = width / height;
    const frustumSize = Math.max(dataBounds.maxX - dataBounds.minX, dataBounds.maxY - dataBounds.minY);
    
    if (camera instanceof THREE.OrthographicCamera) {
        camera.left = frustumSize * aspect / -2;
        camera.right = frustumSize * aspect / 2;
        camera.top = frustumSize / 2;
        camera.bottom = frustumSize / -2;
    } else {
        camera.aspect = aspect;
    }
    
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    try {
        // Update controls
        controls.update();
        
        // Update camera distance for LOD calculations
        const cameraPosition = new THREE.Vector3();
        camera.getWorldPosition(cameraPosition);
        const distance = cameraPosition.distanceTo(new THREE.Vector3(
            (dataBounds.minX + dataBounds.maxX) / 2,
            (dataBounds.minY + dataBounds.maxY) / 2,
            0
        ));
        store.set('cameraDistance', distance);
        
        // Update stats
        stats.update();
        store.set('fps', 1 / clock.getDelta());
        
        // Render scene
        renderer.render(scene, camera);
    } catch (error) {
        console.error('Error in animation loop:', error);
    }
}

// Update data bounds based on loaded data
export function updateDataBounds(points) {
    if (!points || points.length === 0) return;
    
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    
    points.forEach(point => {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
    });
    
    // Add padding
    const paddingX = (maxX - minX) * 0.1;
    const paddingY = (maxY - minY) * 0.1;
    
    dataBounds.minX = minX - paddingX;
    dataBounds.maxX = maxX + paddingX;
    dataBounds.minY = minY - paddingY;
    dataBounds.maxY = maxY + paddingY;
    
    // If camera exists, update its position and target
    if (camera) {
        const centerX = (dataBounds.minX + dataBounds.maxX) / 2;
        const centerY = (dataBounds.minY + dataBounds.maxY) / 2;
        
        if (camera instanceof THREE.OrthographicCamera) {
            const frustumSize = Math.max(
                dataBounds.maxX - dataBounds.minX,
                dataBounds.maxY - dataBounds.minY
            );
            const aspect = renderer.domElement.width / renderer.domElement.height;
            
            camera.left = frustumSize * aspect / -2;
            camera.right = frustumSize * aspect / 2;
            camera.top = frustumSize / 2;
            camera.bottom = frustumSize / -2;
            camera.updateProjectionMatrix();
        }
        
        camera.position.set(centerX, centerY, camera.position.z);
        controls.target.set(centerX, centerY, 0);
    }
}

// Initialize the application when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    init();
});
