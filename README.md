# MERFISHEYES — Single Molecule MERFISH Visualization

A high-performance, web-based visualization tool for **single-molecule MERFISH subcellular data** in zebrafish embryos, built with [Three.js](https://threejs.org/).
This repository accompanies the paper **"Whole-embryo Spatial Transcriptomics at Subcellular Resolution from Gastrulation to Organogenesis"** ([Wan et al., Science, 2024](https://doi.org/10.1126/science.adt3439)).

**Live:** [sm-schier.merfisheyes.com](https://sm-schier.merfisheyes.com)

## Features

- **Scalable Visualization** — Render millions of gene expression points smoothly
- **Cell Boundary & Nuclei Overlay** — Display segmented cell and nuclei boundaries per z-stack
- **Interactive Controls** — Adjustable point size, boundary opacity, and per-gene color/scale customization
- **Multi-gene Selection** — Load and visualize multiple genes simultaneously
- **Z-Stack Navigation** — Slide through z-stack layers with real-time updates
- **Three Dataset Variants** — 50% epiboly, 75% epiboly, and 6 somite stages

## Architecture

The frontend is a Vite + Three.js application deployed on **Vercel**. All data is served as static files from **AWS S3**.

```
Browser → S3 (static .json.gz / .json files)
         ↓
   Pako decompression (client-side)
         ↓
   Three.js point cloud rendering
```

### Data on S3

Data is stored in the `single-cell-data-yinan` S3 bucket under `sm-{variant}/` prefixes:

```
s3://single-cell-data-yinan/
  ├── sm-50pe/
  │   ├── gene_list.json
  │   ├── clusters.json
  │   ├── palette.json
  │   ├── genes_optimized/{GENE}.json.gz
  │   └── contours/
  │       ├── contours_processed_compressed/contours_z_{N}_flat.json.gz
  │       └── contours_nuclei_processed_compressed/contours_nuclei_z_{N}_flat.json.gz
  ├── sm-75pe/
  └── sm-6s/
```

## Getting Started

```bash
# Clone the repository
git clone https://github.com/Bogdan-Bintu-Lab/sm-merfisheyes-wi.git
cd sm-merfisheyes-wi

# Install dependencies
npm install

# Start development server
npm run dev
```

Open `http://localhost:5173` in your browser.

## Citation

If you use this tool or data in your research, please cite:

```bibtex
@article{wan2024whole,
  title={Whole-embryo spatial transcriptomics at subcellular resolution from gastrulation to organogenesis},
  author={Wan, Yinan and others},
  journal={Science},
  year={2026},
  doi={10.1126/science.adt3439}
}
```

## License

This project is licensed under the **MIT License** — see the [LICENSE](./LICENSE) file for details.
