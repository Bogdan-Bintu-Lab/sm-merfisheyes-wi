// A minimal example rendering many weird shapes using instancing in Three.js with ShaderMaterial and OrthographicCamera
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.1/examples/jsm/controls/OrbitControls.js?module';
import * as BufferGeometryUtils from 'https://unpkg.com/three@0.160.1/examples/jsm/utils/BufferGeometryUtils.js?module';

const scene = new THREE.Scene();
const aspect = window.innerWidth / window.innerHeight;
const camera = new THREE.OrthographicCamera(
  -2000 * aspect, 2000 * aspect,
  2000, -2000,
  0.1, 10000
);
camera.position.z = 10;

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableRotate = false;
controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
controls.enableZoom = true;
controls.zoomSpeed = 1.2;
controls.panSpeed = 0.8;

const CHUNK_SIZE = 100; // Number of cells per chunk
const MAX_POINTS_PER_CELL = 50; // Maximum points to use for cell outline when zoomed out

function simplifyPoints(points, maxPoints) {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  return points.filter((_, i) => i % step === 0);
}

function createChunkMaterial(isOutline = false) {
  return new THREE.ShaderMaterial({
    uniforms: {
      zoom: { value: 1.0 },
      alpha: { value: isOutline ? 0.8 : 0.3 }
    },
    vertexShader: `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float zoom;
      uniform float alpha;
      void main() {
        // Maintain visibility by clamping the minimum opacity
        float minOpacity = alpha * 0.3;
        float zoomFactor = max(minOpacity, alpha * (1.0 / zoom));
        gl_FragColor = vec4(0.3, 0.8, 1.0, zoomFactor);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide
  });
}

async function loadAndCreateShapesFromFile(url) {
  const response = await fetch(url);
  const data = await response.json();
  const numCells = data.cellOffsets.length - 1;
  
  // Create chunks of cells
  const chunks = [];
  for (let chunkStart = 0; chunkStart < numCells; chunkStart += CHUNK_SIZE) {
    const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, numCells);
    const fillGeometries = [];
    const lineGeometries = [];
    
    for (let index = chunkStart; index < chunkEnd; index++) {
      const start = data.cellOffsets[index] * 2;
      const end = data.cellOffsets[index + 1] * 2;
      
      // Create array of points for this cell
      const boundary = [];
      for (let i = start; i < end; i += 2) {
        boundary.push({ x: data.points[i], y: data.points[i + 1] });
      }
      
      if (!boundary.length) continue;
      
      // Simplify points based on current view
      const simplifiedBoundary = simplifyPoints(boundary, MAX_POINTS_PER_CELL);
      
      // Create shape for fill
      const shape = new THREE.Shape();
      shape.moveTo(simplifiedBoundary[0].x, simplifiedBoundary[0].y);
      for (let i = 1; i < simplifiedBoundary.length; i++) {
        shape.lineTo(simplifiedBoundary[i].x, simplifiedBoundary[i].y);
      }
      shape.lineTo(simplifiedBoundary[0].x, simplifiedBoundary[0].y);
      
      fillGeometries.push(new THREE.ShapeGeometry(shape));
      
      // Create outline geometry for this cell
      const numPoints = simplifiedBoundary.length;
      const lineGeometry = new THREE.BufferGeometry();
      
      // Create a closed loop for this cell
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
      
      lineGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      
      // Create indices to draw the line as segments
      const indices = new Uint16Array(numPoints * 2);
      for (let i = 0; i < numPoints; i++) {
        indices[i * 2] = i;
        indices[i * 2 + 1] = i + 1;
      }
      
      lineGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
      lineGeometries.push(lineGeometry);
    }
    
    // Merge geometries for this chunk
    if (fillGeometries.length > 0) {
      const mergedFillGeometry = BufferGeometryUtils.mergeGeometries(fillGeometries);
      const mergedLineGeometry = BufferGeometryUtils.mergeGeometries(lineGeometries);
      
      const fillMesh = new THREE.Mesh(mergedFillGeometry, createChunkMaterial(false));
      const lineMesh = new THREE.LineSegments(mergedLineGeometry, createChunkMaterial(true));
      
      // Create bounding box for frustum culling
      fillMesh.geometry.computeBoundingBox();
      lineMesh.geometry.computeBoundingBox();
      
      chunks.push({ fill: fillMesh, line: lineMesh });
      scene.add(fillMesh);
      scene.add(lineMesh);
    }
  }
  
  // Update materials on zoom
  controls.addEventListener('change', () => {
    const zoom = camera.zoom;
    chunks.forEach(chunk => {
      chunk.fill.material.uniforms.zoom.value = zoom;
      chunk.line.material.uniforms.zoom.value = zoom;
    });
  });
}

loadAndCreateShapesFromFile('shapes.json'); // Make sure this JSON file exists and follows the format

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();
