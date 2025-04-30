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
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,                // Allow cookies
  maxAge: 86400                     // Cache preflight requests for 24 hours
};

// Enable CORS with configuration
app.use(cors(corsOptions));

// Enable gzip compression
app.use(compression());

// Base directory for data
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data/yinan');

// Middleware to log requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Route to get gene list
app.get('/api/genes', (req, res) => {
  const geneListPath = path.join(DATA_DIR, 'gene_list.json');
  
  fs.readFile(geneListPath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading gene list:', err);
      return res.status(500).json({ error: 'Failed to read gene list' });
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
  const geneDataPath = path.join(DATA_DIR, 'genes_optimized', `${geneName}.json.gz`);
  
  // Check if file exists
  if (!fs.existsSync(geneDataPath)) {
    return res.status(404).json({ error: `Gene data not found for ${geneName} for ${geneDataPath}` });
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
  const contoursPath = path.join(DATA_DIR, 'contours/contours_processed_compressed', `contours_z_${zstack}_flat.json.gz`);
  
  // Check if file exists
  if (!fs.existsSync(contoursPath)) {
    // Try uncompressed version as fallback
    const uncompressedPath = path.join(DATA_DIR, 'contours/contours_processed_uncompressed', `contours_z_${zstack}_flat.json`);
    
    if (!fs.existsSync(uncompressedPath)) {
      return res.status(404).json({ error: `Contour data not found for z-stack ${zstack}` });
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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Serving data from ${DATA_DIR}`);
});
