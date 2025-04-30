# MERFISH Visualization Backend Server

This is a simple Express.js server that serves gene and cell boundary data for the MERFISH visualization application.

## Setup

1. Install dependencies:
   ```
   cd server
   npm install
   ```

2. Start the server:
   ```
   npm start
   ```

   For development with auto-restart:
   ```
   npm run dev
   ```

## Configuration

The server can be configured using environment variables:

- `PORT`: The port to run the server on (default: 3000)
- `DATA_DIR`: The directory containing the data files (default: '../data/yinan')

Example:
```
PORT=4000 DATA_DIR=/path/to/data npm start
```

## API Endpoints

### Get Gene List
```
GET /api/genes
```
Returns the list of available genes.

### Get Gene Data
```
GET /api/genes/:geneName
```
Returns the data for a specific gene. The data is served as gzipped JSON.

### Get Cell Boundary Data
```
GET /api/contours/:zstack
```
Returns the cell boundary data for a specific z-stack layer. The data is served as gzipped JSON if available, or regular JSON as fallback.

### Health Check
```
GET /api/health
```
Returns a simple health check response to verify the server is running.

## Frontend Integration

The frontend can be configured to use this server by setting the environment parameter in the URL:

- Local filesystem (default): `?env=local`
- Development server: `?env=development`
- Production server: `?env=production`

The server URLs for each environment can be configured in the `config.js` file.
