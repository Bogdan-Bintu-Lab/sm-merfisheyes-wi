import os

# Path to the directory
directory = '/Users/kresnajenie/Programming/sm-merfisheyes-wi/genes_csv_gz_yinan'

# Get all filenames in the directory
filenames = os.listdir(directory)

# Extract the part before the first period for each filename
base_names = [filename.split('.')[0] for filename in filenames]

# Print the result
for name in base_names:
    print(name)

# Alternatively, if you want to save these names to a file:
# with open('gene_names.txt', 'w') as f:
#     for name in base_names:
#         f.write(name + '\n')
