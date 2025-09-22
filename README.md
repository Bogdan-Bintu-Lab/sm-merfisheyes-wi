# MERFISH Subcellular Visualization Tool

A high-performance, web-based visualization tool for **MERFISH subcellular data** built with [Three.js](https://threejs.org/).  
This repository accompanies the paper **"Whole-embryo Spatial Transcriptomics at Subcellular Resolution from Gastrulation to Organogenesis"**.

## Features

- **Scalable Visualization** — Render millions of gene expression points smoothly
- **Cell Boundary \* Nuclei Overlay** — Display segmented cell and nuclei boundaries
- **Interactive Controls** — Adjustable point size and boundary opacity

## Data Structure

The visualization expects two main data sources:

1. **Gene Expression Data**  
   Located in `genes/` with files named `[GeneName]_coords.json`.  
   Each file contains an array of points with **x, y** coordinates.

2. **Cell Boundaries**  
   Located in `cell_boundaries/cell_boundaries.json`.  
   Contains polygon data describing cell boundaries.

## Implementation Details

- **Three.js** — WebGL-based rendering for efficient display of points and lines
- **Reactive Store** — Global state management for real-time UI updates
- **Performance Optimizations**:
  - Point subsampling for distant views
  - Boundary subsampling to simplify geometry
  - Efficient usage of buffer geometries to reduce memory footprint

## Getting Started

```bash
# Clone the repository
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>

# Install dependencies
npm install

# Start development server
npm run dev
```

Open `http://localhost:5173` in your browser.

## Citation

If you use this code in your research, please cite:

```
@software{merfish_subcellular_vis,
  author = {Ignatius Kresnathan Sjahnir Jenie},
  title = {MERFISH Subcellular Visualization Tool},
  year = {2025},
  url = {https://github.com/Bogdan-Bintu-Lab/sm-merfisheyes-wi},
  doi = {10.1101/2024.08.27.609868},
  version = {1.0.0}
}
```

## License

This project is licensed under the **MIT License** — see the [LICENSE](./LICENSE) file for details.
