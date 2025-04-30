import os
import pandas as pd
import json
import gzip
import numpy as np

# Create output directory for optimized gene files
output_dir = './data/yinan/genes_optimized'
os.makedirs(output_dir, exist_ok=True)

# List of genes to process
genes_to_process = [
    "ackr3b",
    "acvr1ba",
    "add3b",
    "adka",
    "admp",
    "ahi1",
    "akap12b"
]

# Dictionary to store data for each gene
gene_data = {gene: {"layers": {}} for gene in genes_to_process}

# Process each layer
for layer in range(43, 60):  # Layers 43-59
    print(f"Processing layer {layer}...")
    
    # Read the CSV file for this layer
    csv_path = f"./data/yinan/genes_raw/transcripts_z_{layer}.csv"
    if not os.path.exists(csv_path):
        print(f"Warning: File {csv_path} not found, skipping.")
        continue
    
    try:
        df = pd.read_csv(csv_path)
        
        # Check if required columns exist
        required_columns = ['gene', 'x', 'y']
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            print(f"Error: Missing columns in {csv_path}: {missing_columns}")
            print(f"Available columns: {df.columns.tolist()}")
            continue
        
        # Process each gene
        for gene in genes_to_process:
            # Filter data for this gene
            gene_df = df[df['gene'] == gene]
            
            if len(gene_df) == 0:
                # No data for this gene in this layer
                gene_data[gene]["layers"][str(layer)] = []
                continue
            
            # Extract x and y coordinates and flatten them
            coords = []
            for _, row in gene_df.iterrows():
                # Convert to integers if possible to save space
                x = int(row['x']) if row['x'].is_integer() else float(row['x'])
                y = int(row['y']) if row['y'].is_integer() else float(row['y'])
                coords.append(x)
                coords.append(y)
            
            # Store the coordinates for this layer
            gene_data[gene]["layers"][str(layer)] = coords
    except Exception as e:
        print(f"Error processing layer {layer}: {e}")

# Save each gene's data to a compressed JSON file
for gene, data in gene_data.items():
    # Skip genes with no data
    if all(len(coords) == 0 for coords in data["layers"].values()):
        print(f"Skipping {gene} - no data found")
        continue
    
    # Convert to JSON
    json_data = json.dumps(data)
    
    # Compress with gzip
    output_path = os.path.join(output_dir, f"{gene}.json.gz")
    with gzip.open(output_path, 'wt') as f:
        f.write(json_data)
    
    # Print file size
    file_size = os.path.getsize(output_path) / 1024  # KB
    print(f"Saved {gene}.json.gz ({file_size:.2f} KB)")

print("Processing complete!")
