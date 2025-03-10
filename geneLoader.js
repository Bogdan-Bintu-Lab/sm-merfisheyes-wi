/**
 * GeneLoader class for loading and managing gene data
 * Handles loading, processing, and level-of-detail for gene data points
 */

import * as THREE from 'three';
import { store } from './store.js';
import { updateDataBounds } from './main.js';

export class GeneLoader {
    constructor(scene) {
        this.scene = scene;
        this.genePointsGroup = null;
        this.loadedGene = null;
        this.originalPoints = null;
        this.lodLevels = {};
        
        // Subscribe to store changes
        store.subscribe('currentGene', (geneName) => {
            if (geneName && geneName !== this.loadedGene) {
                this.loadGeneData(geneName);
            }
        });
        
        store.subscribe('pointSize', () => this.updatePointSize());
        store.subscribe('cameraDistance', () => this.updateLOD());
        store.subscribe('lodThreshold', () => this.updateLOD());
        
        // Subscribe to gene coordinate transformation changes
        store.subscribe('geneFlipX', () => this.updateLOD());
        store.subscribe('geneFlipY', () => this.updateLOD());
        store.subscribe('geneSwapXY', () => this.updateLOD());
    }
    
    /**
     * Load gene data from JSON file
     * @param {string} geneName - Name of the gene to load
     */
    async loadGeneData(geneName) {
        try {
            // Remove previous points if they exist
            if (this.genePointsGroup) {
                this.scene.remove(this.genePointsGroup);
                this.genePointsGroup.traverse(object => {
                    if (object.geometry) object.geometry.dispose();
                    if (object.material) object.material.dispose();
                });
            }
            
            console.log(`Loading gene data for ${geneName}...`);
            
            // Fetch gene data
            const response = await fetch(`genes/${geneName}_coords.json`);
            if (!response.ok) {
                throw new Error(`Failed to load gene data for ${geneName}: ${response.status} ${response.statusText}`);
            }
            
            const pointsData = await response.json();
            
            // Store original points
            this.originalPoints = pointsData;
            this.loadedGene = geneName;
            
            // Update data bounds to center the camera on the data
            updateDataBounds(pointsData);
            
            // Create LOD levels
            this.createLODLevels(pointsData);
            
            // Create initial visualization
            this.genePointsGroup = new THREE.Group();
            this.scene.add(this.genePointsGroup);
            
            // Update store
            store.set('geneData', pointsData);
            
            // Initial LOD update
            this.updateLOD();
            
            console.log(`Loaded ${pointsData.length} points for gene ${geneName}`);
        } catch (error) {
            console.error(`Error loading gene data for ${geneName}:`, error);
            
            // Generate mock data if loading fails
            console.log('Using mock gene data instead');
            const mockGeneData = generateMockGeneData(10000);
            
            // Store mock points
            this.originalPoints = mockGeneData;
            this.loadedGene = geneName;
            
            // Update data bounds to center the camera on the data
            updateDataBounds(mockGeneData);
            
            // Create LOD levels
            this.createLODLevels(mockGeneData);
            
            // Create initial visualization
            this.genePointsGroup = new THREE.Group();
            this.scene.add(this.genePointsGroup);
            
            // Update store
            store.set('geneData', mockGeneData);
            
            // Initial LOD update
            this.updateLOD();
        }
    }
    
    /**
     * Create different levels of detail for the points
     * @param {Array} points - Original point data
     */
    createLODLevels(points) {
        // Reset LOD levels
        this.lodLevels = {};
        
        // Create different LOD levels by subsampling
        // Level 0: Full resolution (all points)
        this.lodLevels[0] = points;
        
        // Level 1: ~50% of points
        this.lodLevels[1] = this.subsamplePoints(points, 2);
        
        // Level 2: ~25% of points
        this.lodLevels[2] = this.subsamplePoints(points, 4);
        
        // Level 3: ~10% of points
        this.lodLevels[3] = this.subsamplePoints(points, 10);
        
        // Level 4: ~5% of points
        this.lodLevels[4] = this.subsamplePoints(points, 20);
        
        // Level 5: ~1% of points (for very far away)
        this.lodLevels[5] = this.subsamplePoints(points, 100);
        
        console.log('Created LOD levels:', Object.keys(this.lodLevels).map(key => 
            `Level ${key}: ${this.lodLevels[key].length} points`
        ).join(', '));
    }
    
    /**
     * Subsample points by taking every nth point
     * @param {Array} points - Original point data
     * @param {number} n - Take every nth point
     * @returns {Array} Subsampled points
     */
    subsamplePoints(points, n) {
        return points.filter((_, index) => index % n === 0);
    }
    
    /**
     * Update the level of detail based on camera distance
     */
    updateLOD() {
        if (!this.originalPoints || !this.genePointsGroup) return;
        
        const cameraDistance = store.get('cameraDistance');
        const lodThreshold = store.get('lodThreshold');
        
        // Determine which LOD level to use based on camera distance and threshold
        let lodLevel = 0;
        
        // When lodThreshold is at maximum (5.0), always use full resolution (level 0)
        if (lodThreshold < 5.0) {
            if (cameraDistance > 10000 * lodThreshold) lodLevel = 5;
            else if (cameraDistance > 5000 * lodThreshold) lodLevel = 4;
            else if (cameraDistance > 2500 * lodThreshold) lodLevel = 3;
            else if (cameraDistance > 1000 * lodThreshold) lodLevel = 2;
            else if (cameraDistance > 500 * lodThreshold) lodLevel = 1;
        }
        
        // Get points for this LOD level
        const pointsToRender = this.lodLevels[lodLevel];
        
        // Clear previous points
        while (this.genePointsGroup.children.length > 0) {
            const child = this.genePointsGroup.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            this.genePointsGroup.remove(child);
        }
        
        // Create new points with transformations applied
        const pointSize = store.get('pointSize');
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(pointsToRender.length * 3);
        
        pointsToRender.forEach((point, i) => {
            // Apply gene-specific coordinate transformations
            const transformedPoint = store.transformGenePoint(point);
            
            positions[i * 3] = transformedPoint.x;
            positions[i * 3 + 1] = transformedPoint.y;
            positions[i * 3 + 2] = 0; // Z-coordinate is 0 for 2D visualization
        });
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const material = new THREE.PointsMaterial({
            color: this.getGeneColor(this.loadedGene),
            size: pointSize,
            sizeAttenuation: true
        });
        
        const points = new THREE.Points(geometry, material);
        this.genePointsGroup.add(points);
        
        // Update store with points rendered
        store.set('pointsRendered', pointsToRender.length);
    }
    
    /**
     * Update point size from store
     */
    updatePointSize() {
        if (!this.genePointsGroup) return;
        
        const pointSize = store.get('pointSize');
        
        this.genePointsGroup.traverse(object => {
            if (object instanceof THREE.Points) {
                object.material.size = pointSize;
            }
        });
    }
    
    /**
     * Get a consistent color for a gene
     * @param {string} geneName - Name of the gene
     * @returns {number} - Color as a hex number
     */
    getGeneColor(geneName) {
        // Map gene names to specific colors
        const colorMap = {
            'Abi3': 0xFF0000, 'Acan': 0xFF0033, 'Ace': 0xFF0066, 'Adam10': 0xFF0099, 'Adam17': 0xFF00CC,
            'Adarb2': 0xFF00FF, 'Adgra1': 0xFF33FF, 'Adgrg7': 0xFF66FF, 'Adrb1': 0xFF99FF, 'Agtr1a': 0xFFCCFF,
            'Aldh1l1': 0xFFFFFF, 'Anpep': 0xFFFFCC, 'Aph1b': 0xFFFF99, 'Apoe': 0xFFFF66, 'App': 0xFFFF33,
            'Aqp4': 0xFFFF00, 'Bace1': 0xFFCC00, 'Bcan': 0xFF9900, 'Bcl11b': 0xFF6600, 'Bdkrb1': 0xFF3300,
            'Bdnf': 0xFF0000, 'Bgn': 0xCC0000, 'Bin1': 0x990000, 'Blank-0': 0x660000, 'Blank-1': 0x330000,
            'Blank-10': 0x000000, 'Blank-11': 0x003300, 'Blank-12': 0x006600, 'Blank-13': 0x009900, 'Blank-14': 0x00CC00,
            'Blank-2': 0x00FF00, 'Blank-3': 0x00FF33, 'Blank-4': 0x00FF66, 'Blank-5': 0x00FF99, 'Blank-6': 0x00FFCC,
            'Blank-7': 0x00FFFF, 'Blank-8': 0x00CCFF, 'Blank-9': 0x0099FF, 'Bmp2': 0x0066FF, 'C1qa': 0x0033FF,
            'C3': 0x0000FF, 'C4b': 0x0000CC, 'Cacng5': 0x000099, 'Calb1': 0x000066, 'Calb2': 0x000033,
            'Camk2a': 0x330033, 'Camk2g': 0x660066, 'Car12': 0x990099, 'Cars': 0xCC00CC, 'Casp8': 0xFF00FF,
            'Cass4': 0xFF00CC, 'Cbln4': 0xFF0099, 'Cck': 0xFF0066, 'Cckbr': 0xFF0033, 'Ccl3': 0xFF0000,
            'Ccl6': 0xCC0000, 'Ccr6': 0x990000, 'Cd2ap': 0x660000, 'Cd4': 0x330000, 'Cd74': 0x000000,
            'Cd8a': 0x003300, 'Cdh12': 0x006600, 'Cdh7': 0x009900, 'Celsr1': 0x00CC00, 'Chat': 0x00FF00,
            'Chodl': 0x00FF33, 'Chrm4': 0x00FF66, 'Chrna5': 0x00FF99, 'Chrna7': 0x00FFCC, 'Cldn5': 0x00FFFF,
            'Clu': 0x00CCFF, 'Cnr1': 0x0099FF, 'Coch': 0x0066FF, 'Col11a1': 0x0033FF, 'Col5a2': 0x0000FF,
            'Cplx1': 0x0000CC, 'Creb1': 0x000099, 'Crebbp': 0x000066, 'Crh': 0x000033, 'Crtac1': 0x330033,
            'Csf1': 0x660066, 'Csf1r': 0x990099, 'Cspg4': 0xCC00CC, 'Cspg5': 0xFF00FF, 'Cst7': 0xFF00CC,
            'Ctnna3': 0xFF0099, 'Ctnnb1': 0xFF0066, 'Ctss': 0xFF0033, 'Cux2': 0xFF0000, 'Cx3cl1': 0xCC0000,
            'Cxcl10': 0x990000, 'Cxcr4': 0x660000, 'Dbh': 0x330000, 'Dcn': 0x000000, 'Ddit4l': 0x003300,
            'Deptor': 0x006600, 'Dkk3': 0x009900, 'Dlg4': 0x00CC00, 'Dlk1': 0x00FF00, 'Drd1': 0x00FF33,
            'Drd2': 0x00FF66, 'Drd5': 0x00FF99, 'Echdc3': 0x00FFCC, 'Elfn1': 0x00FFFF, 'Epha1': 0x00CCFF,
            'Epha10': 0x0099FF, 'Epha7': 0x0066FF, 'Erbb2': 0x0033FF, 'Erbb4': 0x0000FF, 'Etv1': 0x0000CC,
            'Fermt2': 0x000099, 'Fev': 0x000066, 'Fezf2': 0x000033, 'Fibcd1': 0x330033, 'Flt1': 0x660066,
            'Fmo1': 0x990099, 'Fn1': 0xCC00CC, 'Fos': 0xFF00FF, 'Foxp2': 0xFF00CC, 'Gad1': 0xFF0099,
            'Gad2': 0xFF0066, 'Gfap': 0xFF0033, 'Glp2r': 0xFF0000, 'Gng2': 0xCC0000, 'Gpc3': 0x990000,
            'Gphn': 0x660000, 'Gpr15': 0x330000, 'Gpr158': 0x000000, 'Gpr37': 0x003300, 'Gpr55': 0x006600,
            'Gpr63': 0x009900, 'Grb2': 0x00CC00, 'Gria1': 0x00FF00, 'Gria2': 0x00FF33, 'Gria3': 0x00FF66,
            'Gria4': 0x00FF99, 'Grin1': 0x00FFCC, 'Grin2a': 0x00FFFF, 'Grin2b': 0x00CCFF, 'Grin2c': 0x0099FF,
            'Grin3a': 0x0066FF, 'Grin3b': 0x0033FF, 'Grm1': 0x0000FF, 'Grm2': 0x0000CC, 'Grm3': 0x000099,
            'Grm4': 0x000066, 'Grm5': 0x000033, 'Grp': 0x330033, 'Gsto1': 0x660066, 'Hcn1': 0x990099,
            'Hrh3': 0xCC00CC, 'Hs3st1': 0xFF00FF, 'Htr1a': 0xFF00CC, 'Htr1f': 0xFF0099, 'Htr2c': 0xFF0066,
            'Htr3a': 0xFF0033, 'Htr5a': 0xFF0000, 'Icam1': 0xCC0000, 'Id4': 0x990000, 'Ifng': 0x660000,
            'Igf1': 0x330000, 'Igf2': 0x000000, 'Il10': 0x003300, 'Il1b': 0x006600, 'Inpp5d': 0x009900,
            'Iqck': 0x00CC00, 'Itga7': 0x00FF00, 'Itgal': 0x00FF33, 'Itgax': 0x00FF66, 'Iyd': 0x00FF99,
            'Kcnc1': 0x00FFCC, 'Kcnd2': 0x00FFFF, 'Kcnh7': 0x00CCFF, 'Kcnq1': 0x0099FF, 'Kctd4': 0x0066FF,
            'Lamp5': 0x0033FF, 'Lcn2': 0x0000FF, 'Lct': 0x0000CC, 'Lgals3': 0x000099, 'Lhx6': 0x000066,
            'Lmna': 0x000033, 'Lratd2': 0x330033, 'Lrpprc': 0x660066, 'Ly6g6e': 0x990099, 'Ly9': 0xCC00CC,
            'Lynx1': 0xFF00FF, 'Map4k3': 0xFF00CC, 'Mapk1': 0xFF0099, 'Mapt': 0xFF0066, 'Mas1': 0xFF0033,
            'Mink1': 0xFF0000, 'Mki67': 0xCC0000, 'Mmp14': 0x990000, 'Mmp9': 0x660000, 'Mrc1': 0x330000,
            'Mrc2': 0x000000, 'Mrgprb1': 0x003300, 'Ms4a4a': 0x006600, 'Ms4a7': 0x009900, 'Mtor': 0x00CC00,
            'Musk': 0x00FF00, 'Ndnf': 0x00FF33, 'Ndst4': 0x00FF66, 'Negr1': 0x00FF99, 'Neto1': 0x00FFCC,
            'Ngf': 0x00FFFF, 'Nmbr': 0x00CCFF, 'Nnat': 0x0099FF, 'Nos1': 0x0066FF, 'Nos3': 0x0033FF,
            'Npas1': 0x0000FF, 'Nptx1': 0x0000CC, 'Nptx2': 0x000099, 'Nptxr': 0x000066, 'Npy1r': 0x000033,
            'Nr2f2': 0x330033, 'Nrg1': 0x660066, 'Nrg2': 0x990099, 'Nrg3': 0xCC00CC, 'Ntf3': 0xFF00FF,
            'Ntng2': 0xFF00CC, 'Ntrk2': 0xFF0099, 'Nts': 0xFF0066, 'Ntsr1': 0xFF0033, 'Nxph4': 0xFF0000,
            'Olig1': 0xCC0000, 'Opn3': 0x990000, 'Oprm1': 0x660000, 'Oxgr1': 0x330000, 'P2ry12': 0x000000,
            'Pax6': 0x003300, 'Pcp4': 0x006600, 'Pdgfa': 0x009900, 'Pdgfra': 0x00CC00, 'Pdgfrb': 0x00FF00,
            'Pdyn': 0x00FF33, 'Penk': 0x00FF66, 'Pilra': 0x00FF99, 'Pkp2': 0x00FFCC, 'Plagl1': 0x00FFFF,
            'Plcg2': 0x00CCFF, 'Pomc': 0x0099FF, 'Prkcd': 0x0066FF, 'Prox1': 0x0033FF, 'Prss12': 0x0000FF,
            'Psen1': 0x0000CC, 'Psen2': 0x000099, 'Pten': 0x000066, 'Ptgds': 0x000033, 'Ptk2b': 0x330033,
            'Ptpru': 0x660066, 'Pvalb': 0x990099, 'Reln': 0xCC00CC, 'Rims1': 0xFF00FF, 'Rims2': 0xFF00CC,
            'Robo1': 0xFF0099, 'Rorb': 0xFF0066, 'Ros1': 0xFF0033, 'Rph3a': 0xFF0000, 'S100b': 0xCC0000,
            'Scimp': 0x990000, 'Scn4b': 0x660000, 'Sctr': 0x330000, 'Sema5b': 0x000000, 'Serpinf1': 0x003300,
            'Sharpin': 0x006600, 'Siglech': 0x009900, 'Slc17a6': 0x00CC00, 'Slc17a7': 0x00FF00, 'Slc29a1': 0x00FF33,
            'Slc29a2': 0x00FF66, 'Slc2a4': 0x00FF99, 'Slc30a3': 0x00FFCC, 'Slc32a1': 0x00FFFF, 'Slc6a3': 0x00CCFF,
            'Slc6a4': 0x0099FF, 'Snca': 0x0066FF, 'Sncg': 0x0033FF, 'Sorl1': 0x0000FF, 'Sox10': 0x0000CC,
            'Sox8': 0x000099, 'Spi1': 0x000066, 'Src': 0x000033, 'Sst': 0x330033, 'Sstr3': 0x660066,
            'Sulf2': 0x990099, 'Syn1': 0xCC00CC, 'Syngap1': 0xFF00FF, 'Syp': 0xFF00CC, 'Syt6': 0xFF0099,
            'Taar9': 0xFF0066, 'Tac1': 0xFF0033, 'Tacr2': 0xFF0000, 'Tek': 0xCC0000, 'Th': 0x990000,
            'Tlr4': 0x660000, 'Tmem119': 0x330000, 'Tmem150a': 0x000000, 'Tnf': 0x003300, 'Tpbg': 0x006600,
            'Trem2': 0x009900, 'Trhr': 0x00CC00, 'Trib2': 0x00FF00, 'Trpm4': 0x00FF33, 'Tshr': 0x00FF66,
            'Tshz1': 0x00FF99, 'Tshz2': 0x00FFCC, 'Ube3a': 0x00FFFF, 'Vcam1': 0x00CCFF, 'Vip': 0x0099FF,
            'Vipr2': 0x0066FF, 'Vtn': 0x0033FF, 'Wfs1': 0x0000FF, 'Wnt2': 0x0000CC, 'Zbtb20': 0x000099
        };
        
        return colorMap[geneName] || 0xffffff; // Default to white
    }
}

/**
 * Generate mock gene data for testing
 * @param {number} numPoints - Number of points to generate
 * @returns {Array} Mock gene data
 */
export function generateMockGeneData(numPoints) {
    const points = [];
    
    for (let i = 0; i < numPoints; i++) {
        points.push({
            x: Math.random() * 10000,
            y: Math.random() * 10000
        });
    }
    
    return points;
}
