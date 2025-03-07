# MERFISH Subcellular Visualization Tool

A high-performance web-based visualization tool for MERFISH subcellular data using Three.js.

## Features

- Visualize millions of gene expression points with high performance
- Display cell boundaries
- Level of Detail (LOD) system for improved performance during navigation
- Adjustable point size and boundary opacity
- Boundary subsampling for performance optimization
- Real-time performance metrics (FPS, points rendered)
- Robust error handling with fallback to mock data

## Data Structure

The visualization uses two main data sources:

1. **Gene Expression Data**: Located in the `genes/` directory with files named `[GeneName]_coords.json`. Each file contains an array of points with x,y coordinates.

2. **Cell Boundaries**: Located at `cell_boundaries/cell_boundaries.json`. Contains cell boundary polygon data.

## Implementation Details

- **Three.js**: Used for WebGL-based rendering of points and lines
- **Level of Detail**: Automatically adjusts the number of points rendered based on camera distance
- **Reactive Store**: Global state management with reactive updates to UI and visualization
- **Performance Optimizations**: 
  - Point subsampling for distant views
  - Boundary subsampling
  - Efficient buffer geometry usage
- **Error Handling**: Graceful fallback to mock data when real data cannot be loaded

## Getting Started

1. Clone the repository
2. Start a local HTTP server (e.g., `python -m http.server 8000`)
3. Open `http://localhost:8000` in a modern web browser
4. Select a gene from the dropdown to load it
5. Use mouse to navigate:
   - Left-click + drag to rotate
   - Right-click + drag to pan
   - Scroll to zoom

## Controls

- **Gene Selection**: Choose which gene to visualize
- **Show Cell Boundaries**: Toggle cell boundary visibility
- **Point Size**: Adjust the size of gene expression points
- **Boundary Opacity**: Change the opacity of cell boundaries
- **Level of Detail Threshold**: Control when LOD kicks in during zoom
- **Boundary Subsampling**: Adjust the level of detail for cell boundaries

## Performance Considerations

The visualization is optimized for handling millions of points by:

1. Using efficient Three.js buffer geometries
2. Implementing a Level of Detail system that reduces point count at distance
3. Subsampling boundary points to reduce geometry complexity
4. Using WebGL for hardware-accelerated rendering

## Error Handling

The application includes robust error handling:

1. Automatic fallback to mock data generation when real data fails to load
2. Comprehensive error logging to the console
3. Try-catch blocks around critical operations
4. Graceful degradation when components fail

## Future Improvements

- Add support for compressed data formats
- Implement spatial indexing for faster point lookup
- Add color mapping based on expression levels
- Support for multiple genes visualization simultaneously
- 3D visualization support
