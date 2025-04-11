import os
import json

# Path to the directory
directory = 'C:\\Users\\Justin\\Documents\\fish_eyes\\sm-merfisheyes-wi\\data\\pei\\genes_csv_gz'

# Get all filenames in the directory
filenames = os.listdir(directory)

# Extract the part before the first period for each filename
base_names = [filename.split('.')[0] for filename in filenames]

# Print the result
for name in base_names:
    print(name)


with open('gene_list.json', 'w') as f:
    json.dump(base_names, f, indent=2)

print(f"Gene list saved to gene_list.json")
