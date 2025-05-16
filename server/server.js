const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3030;

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc)
    if (!origin) return callback(null, true);
    
    // List of allowed origins
    const allowedOrigins = [
      'http://localhost:5173',     // Vite dev server
      'http://localhost:3000',     // Another common local port
      'http://127.0.0.1:5173',     // Vite dev server alternative
      'http://127.0.0.1:3000',     // Another common local port
      // Add your production domains here
      'https://sm-schier.merfisheyes.com',
    ];
    
    // Check if the origin is allowed
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Length', 'Content-Type', 'Content-Encoding'],
  credentials: true,                // Allow cookies
  maxAge: 86400                     // Cache preflight requests for 24 hours
};

// Enable CORS with configuration
app.use(cors(corsOptions));

// Enable gzip compression
app.use(compression());

// Base directory for data
const BASE_DATA_DIR = process.env.BASE_DATA_DIR || path.join(__dirname, '../data');

// Route for data files (clusters.json, palette.json, etc)
app.get('/api/data/:dataset/:variant/:filename', (req, res) => {
    const { dataset, variant, filename } = req.params;
    
    // Security check - only allow specific files
    if (!['clusters.json', 'palette.json'].includes(filename)) {
        return res.status(400).json({ error: 'Invalid file requested' });
    }
    
    const filePath = path.join(BASE_DATA_DIR, dataset, variant, filename);
    
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error(`Error reading ${filename} for ${dataset}/${variant}:`, err);
            return res.status(500).json({ error: `Failed to read ${filename}` });
        }
        res.json(JSON.parse(data));
    });
});
const DEFAULT_DATASET = process.env.DEFAULT_DATASET || 'yinan';
const DEFAULT_VARIANT = process.env.DEFAULT_VARIANT || '50pe';

// Available dataset variants
const AVAILABLE_VARIANTS = ['50pe', '75pe', '6s'];

// Function to get the data directory for a specific dataset and variant
function getDataDir(dataset = DEFAULT_DATASET, variant = DEFAULT_VARIANT) {
  return path.join(BASE_DATA_DIR, dataset, variant);
}

// Middleware to log requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Helper function to get dataset and variant from request
function getDatasetInfo(req) {
  const dataset = req.query.dataset || DEFAULT_DATASET;
  // Support both 'data' and 'variant' parameters for backward compatibility
  const variant = req.query.data || req.query.variant || DEFAULT_VARIANT;
  
  // Validate variant
  if (!AVAILABLE_VARIANTS.includes(variant)) {
    return { 
      valid: false, 
      error: `Invalid dataset variant: ${variant}. Available variants: ${AVAILABLE_VARIANTS.join(', ')}` 
    };
  }
  
  return { 
    valid: true, 
    dataset, 
    variant, 
    dataDir: getDataDir(dataset, variant) 
  };
}

// Route to get gene list
app.get('/api/genes', (req, res) => {
  const datasetInfo = getDatasetInfo(req);
  
  if (!datasetInfo.valid) {
    return res.status(400).json({ error: datasetInfo.error });
  }
  
  const geneListPath = path.join(datasetInfo.dataDir, 'gene_list.json');
  
  fs.readFile(geneListPath, 'utf8', (err, data) => {
    if (err) {
      console.error(`Error reading gene list from ${geneListPath}:`, err);
      return res.status(500).json({ error: `Failed to read gene list for dataset ${datasetInfo.dataset}/${datasetInfo.variant}` });
    }
    
    try {
      const geneList = JSON.parse(data);
      res.json(geneList);
    } catch (parseErr) {
      console.error('Error parsing gene list JSON:', parseErr);
      res.status(500).json({ error: 'Failed to parse gene list' });
    }
  });
});

// Route to get gene data
app.get('/api/genes/:geneName', (req, res) => {
  const { geneName } = req.params;
  const datasetInfo = getDatasetInfo(req);
  
  if (!datasetInfo.valid) {
    return res.status(400).json({ error: datasetInfo.error });
  }
  
  const geneDataPath = path.join(datasetInfo.dataDir, 'genes_optimized', `${geneName}.json.gz`);
  
  // Check if file exists
  if (!fs.existsSync(geneDataPath)) {
    return res.status(404).json({ 
      error: `Gene data not found for ${geneName} in dataset ${datasetInfo.dataset}/${datasetInfo.variant}`,
      path: geneDataPath
    });
  }
  
  // Set appropriate headers for gzipped content
  res.setHeader('Content-Encoding', 'gzip');
  res.setHeader('Content-Type', 'application/json');
  
  // Stream the file directly to the response
  const fileStream = fs.createReadStream(geneDataPath);
  fileStream.pipe(res);
  
  // Handle errors
  fileStream.on('error', (err) => {
    console.error(`Error streaming gene data for ${geneName}:`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to read gene data' });
    }
  });
});

// Route to get cell boundary data
app.get('/api/contours/:zstack', (req, res) => {
  const { zstack } = req.params;
  const datasetInfo = getDatasetInfo(req);
  
  if (!datasetInfo.valid) {
    return res.status(400).json({ error: datasetInfo.error });
  }
  
  const contoursPath = path.join(datasetInfo.dataDir, 'contours/contours_processed_compressed', `contours_z_${zstack}_flat.json.gz`);
  
  // Check if file exists
  if (!fs.existsSync(contoursPath)) {
    // Try uncompressed version as fallback
    const uncompressedPath = path.join(datasetInfo.dataDir, 'contours/contours_processed_uncompressed', `contours_z_${zstack}_flat.json`);

    
    if (!fs.existsSync(uncompressedPath)) {
      return res.status(404).json({ 
        error: `Contour data not found for z-stack ${zstack} in dataset ${datasetInfo.dataset}/${datasetInfo.variant}`,
        compressedPath: contoursPath,
        uncompressedPath: uncompressedPath
      });
    }
    
    // Serve uncompressed file
    res.setHeader('Content-Type', 'application/json');
    const fileStream = fs.createReadStream(uncompressedPath);
    fileStream.pipe(res);
    
    fileStream.on('error', (err) => {
      console.error(`Error streaming uncompressed contour data for z-stack ${zstack}:`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to read contour data' });
      }
    });
    
    return;
  }
  
  // Set appropriate headers for gzipped content
  res.setHeader('Content-Encoding', 'gzip');
  res.setHeader('Content-Type', 'application/json');
  
  // Stream the file directly to the response
  const fileStream = fs.createReadStream(contoursPath);
  fileStream.pipe(res);
  
  // Handle errors
  fileStream.on('error', (err) => {
    console.error(`Error streaming contour data for z-stack ${zstack}:`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to read contour data' });
    }
  });
});

// Route to get cell nuclei data
app.get('/api/nuclei/:zstack', (req, res) => {
  const { zstack } = req.params;
  const datasetInfo = getDatasetInfo(req);
  
  if (!datasetInfo.valid) {
    return res.status(400).json({ error: datasetInfo.error });
  }
  
  // Check if nuclei data exists for this variant
  const nucleiDirCompressed = path.join(datasetInfo.dataDir, 'contours/contours_nuclei_processed_compressed');
  const nucleiDirUncompressed = path.join(datasetInfo.dataDir, 'contours/contours_nuclei_processed_uncompressed');
  
  // Check if the nuclei directories exist for this variant
  const hasNucleiData = fs.existsSync(nucleiDirCompressed) || fs.existsSync(nucleiDirUncompressed);
  
  if (!hasNucleiData) {
    return res.status(404).json({ 
      error: `Nuclei data not available for dataset variant: ${datasetInfo.variant}`,
      datasetInfo: datasetInfo
    });
  }
  
  // First try the compressed path
  const compressedPath = path.join(nucleiDirCompressed, `contours_nuclei_z_${zstack}_flat.json.gz`);
  
  // Check if compressed file exists
  if (fs.existsSync(compressedPath)) {
    // Serve compressed file
    try {
      console.log(`Serving compressed nuclei data from: ${compressedPath}`);
      const compressedData = fs.readFileSync(compressedPath);
      res.set('Content-Type', 'application/json');
      res.set('Content-Encoding', 'gzip');
      res.send(compressedData);
      return;
    } catch (error) {
      console.error('Error reading compressed nuclei file:', error);
      // Continue to try uncompressed version
    }
  }
  
  // Try uncompressed version as fallback
  const uncompressedPath = path.join(nucleiDirUncompressed, `contours_nuclei_z_${zstack}_flat.json`);
  
  if (fs.existsSync(uncompressedPath)) {
    // Serve uncompressed file
    try {
      console.log(`Serving uncompressed nuclei data from: ${uncompressedPath}`);
      const data = fs.readFileSync(uncompressedPath, 'utf8');
      res.json(JSON.parse(data));
      return;
    } catch (error) {
      console.error('Error reading uncompressed nuclei file:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to read nuclei data' });
      }
      return;
    }
  }
  
  // If we get here, neither file exists
  return res.status(404).json({ 
    error: `Nuclei data not found for z-stack ${zstack} in dataset ${datasetInfo.dataset}/${datasetInfo.variant}`,
    compressedPath: compressedPath,
    uncompressedPath: uncompressedPath
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Base data directory: ${BASE_DATA_DIR}`);
  console.log(`Default dataset: ${DEFAULT_DATASET}`);
  console.log(`Default variant: ${DEFAULT_VARIANT}`);
  console.log(`Available variants: ${AVAILABLE_VARIANTS.join(', ')}`);
});
