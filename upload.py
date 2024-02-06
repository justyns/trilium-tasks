import sys
import os
from trilium_py.client import ETAPI


TRILIUM_URL = os.environ['TRILIUM_URL']
API_TOKEN = os.environ['TRILIUM_TOKEN']

def upload_to_trilium(note_id, file_path):
    ea = ETAPI(TRILIUM_URL, API_TOKEN)

    with open(file_path, 'r') as file:
        file_content = file.read()

    ea.update_note_content(note_id, file_content)

def main():
    if len(sys.argv) < 3 or len(sys.argv) % 2 == 0:
        print("Usage: python upload_script.py <note_id1> <file_path1> [<note_id2> <file_path2> ...]")
        return

    # Process pairs of note IDs and file paths
    for i in range(1, len(sys.argv), 2):
        note_id = sys.argv[i]
        file_path = sys.argv[i + 1]
        upload_to_trilium(note_id, file_path)
        print(f"Uploaded {file_path} to note {note_id}")

if __name__ == "__main__":
    main()
