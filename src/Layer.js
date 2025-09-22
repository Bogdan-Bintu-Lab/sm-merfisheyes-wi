import * as THREE from 'three';
import { config } from './config.js';
import { store } from './store.js';

/**
 * Layer class for managing points in a specific z-stack of a gene
 */
export class Layer {
    /**
     * Create a new Layer
     * @param {string} zStack - The z-stack identifier
     * @param {Array<{x: number, y: number, intensity?: number}>} points - Array of point data
     * @param {THREE.Scene} scene - The THREE.js scene
     */
    constructor(zStack, points, scene) {
        this.zStack = zStack;
        this.scene = scene;
        this.points = points;
        this.isVisible = false;
        this.pointsGroup = new THREE.Group();
        this.scene.add(this.pointsGroup);
        
        // Get initial point size from store or config default
        const initialPointSize = store.get('pointSize') * 2
        this.currentPointSize = initialPointSize;
        
        // Create the points geometry
        this.createPointsGeometry(points);
    }
    
    /**
     * Create THREE.js points geometry from point data
     * @private
     * @param {Array<{x: number, y: number, intensity?: number}>} points
     */
    createPointsGeometry(points) {
        const geometry = new THREE.BufferGeometry();
        
        // Create typed arrays for better performance
        const positions = new Float32Array(points.length * 3);
        const colors = new Float32Array(points.length * 3);
        const sizes = new Float32Array(points.length);
        const alphas = new Float32Array(points.length);
        
        // Fill arrays directly for better performance
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            const idx = i * 3;
            
            positions[idx] = point.x;
            positions[idx + 1] = point.y;
            positions[idx + 2] = 1;
            
            // Default white color, will be updated by updateColor
            colors[idx] = 1;
            colors[idx + 1] = 1;
            colors[idx + 2] = 1;
            
            sizes[i] = this.currentPointSize; // Use stored point size
            alphas[i] = 1.0; // Fully opaque
        }
        
        // Set attributes
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
        
        // Define custom shaders
        const vertexShader = `
            attribute float size;
            attribute vec3 color;
            attribute float alpha;
            uniform float dotSize;
            varying vec3 vColor;
            varying float vAlpha;
            varying float vDistance;

            void main() {
                vColor = color;
                vAlpha = alpha;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                
                // Calculate distance from camera
                float distance = -mvPosition.z;
                vDistance = distance;
                
                // Base size is controlled by the size attribute and dotSize uniform
                float baseSize = dotSize * 5.0; // Multiply by 10 for larger base size
                
                // Dynamic sizing based on distance
                float minSize = baseSize * 0.1; // Minimum size is half of base
                float maxSize = baseSize * 2.0; // Maximum size is double of base
                
                // Simple distance-based scaling
                float distanceScale = 100.0 / distance; // Scale inversely with distance
                float finalSize = baseSize * distanceScale;
                
                // Clamp to our size range
                // gl_PointSize = clamp(finalSize, minSize, maxSize);
                gl_PointSize = dotSize*1.7;
                gl_Position = projectionMatrix * mvPosition;
            }
        `;

        const fragmentShader = `
            varying vec3 vColor;
            varying float vAlpha;
            varying float vDistance;

            void main() {
                // Create circular points
                float dist = length(gl_PointCoord - vec2(0.5, 0.5));
                if (dist > 0.5) discard;
                
                // Enhanced edge effect
                float edgeWidth = 0.15;
                float distFromCenter = dist;
                float edgeEffect = 1.0;
                float edgeFactor = smoothstep(0.5 - edgeWidth, 0.5, distFromCenter);
                
                // Distance-based edge effect
                float distanceFactor = smoothstep(150.0, 50.0, vDistance);
                edgeEffect = mix(1.0, 0.7, edgeFactor * distanceFactor);
                
                // Anti-aliasing at edges
                float alpha = vAlpha;
                if (dist > 0.48) {
                    alpha *= smoothstep(0.5, 0.48, dist);
                }
                
                // Final color with edge effect
                vec3 finalColor = vColor * edgeEffect;
                gl_FragColor = vec4(finalColor, alpha);
            }
        `;
        
        // Create shader material with uniforms
        const material = new THREE.ShaderMaterial({
            uniforms: {
                dotSize: { value: this.currentPointSize }
            },
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            transparent: true
        });
        
        this.pointsMesh = new THREE.Points(geometry, material);
        this.pointsGroup.add(this.pointsMesh);
        this.setVisible(false); // Initially hidden
    }
    
    /**
     * Set layer visibility
     * @param {boolean} visible
     */
    setVisible(visible) {
        this.isVisible = visible;
        this.pointsGroup.visible = visible;
    }
    
    /**
     * Update point colors
     * @param {string} color - Hex color string
     */
    updateColor(color) {
        const colorAttribute = this.pointsMesh.geometry.getAttribute('color');
        const colorArray = colorAttribute.array;
        
        // Parse the color string to RGB components
        const hexColor = color.startsWith('#') ? color.substring(1) : color;
        const r = parseInt(hexColor.substring(0, 2), 16) / 255;
        const g = parseInt(hexColor.substring(2, 4), 16) / 255;
        const b = parseInt(hexColor.substring(4, 6), 16) / 255;
        
        // Update all points to the new color
        for (let i = 0; i < colorArray.length; i += 3) {
            colorArray[i] = r;
            colorArray[i + 1] = g;
            colorArray[i + 2] = b;
        }
        
        colorAttribute.needsUpdate = true;
    }
    
    /**
     * Update point size
     * @param {number} size
     */
    updatePointSize(size) {
        if (this.pointsMesh && this.pointsMesh.material.uniforms) {
            this.pointsMesh.material.uniforms.dotSize.value = size;
        }
    }
    
    /**
     * Hide layer and trigger render update
     */
    dispose() {
        this.setVisible(false);
        // Force a render update
        if (this.pointsGroup) {
            this.pointsGroup.visible = false;
        }
    }
    
    /**
     * Update point transformations
     * @param {boolean} flipX
     * @param {boolean} flipY
     * @param {boolean} swapXY
     */
    updateTransforms(flipX, flipY, swapXY) {
        const positions = this.pointsMesh.geometry.getAttribute('position');
        const array = positions.array;
        
        for (let i = 0; i < array.length; i += 3) {
            let x = this.points[i / 3].x;
            let y = this.points[i / 3].y;
            
            if (swapXY) {
                [x, y] = [y, x];
            }
            if (flipX) {
                x = -x;
            }
            if (flipY) {
                y = -y;
            }
            
            array[i] = x;
            array[i + 1] = y;
        }
        
        positions.needsUpdate = true;
    }
    
    /**
     * Get the number of points in this layer
     * @returns {number}
     */
    getPointCount() {
        return this.points.length;
    }
    
    /**
     * Get the bounds of points in this layer
     * @returns {{minX: number, maxX: number, minY: number, maxY: number}}
     */
    getBounds() {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        
        this.points.forEach(point => {
            minX = Math.min(minX, point.x);
            maxX = Math.max(maxX, point.x);
            minY = Math.min(minY, point.y);
            maxY = Math.max(maxY, point.y);
        });
        
        return { minX, maxX, minY, maxY };
    }
    
    /**
     * Get the z-stack identifier
     * @returns {string}
     */
    getZStack() {
        return this.zStack;
    }
    
    /**
     * Clean up THREE.js resources
     */
    dispose() {
        if (this.pointsMesh) {
            this.pointsMesh.geometry.dispose();
            this.pointsMesh.material.dispose();
            this.pointsGroup.remove(this.pointsMesh);
        }
        this.scene.remove(this.pointsGroup);
    }
}
