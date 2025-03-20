# PDF MCP Server

Node.js server implementing Model Context Protocol (MCP) for PDF operations using the pdfme library.

## Features

- PDF Manipulation:
  - Merge multiple PDFs
  - Split PDF into multiple documents
  - Remove pages from PDF
  - Rotate PDF pages
  - Organize PDF (multiple operations)
  
- Format Conversion:
  - Convert PDF to JPG/PNG images
  - Convert JPG/PNG images to PDF

Note: The server will only allow operations within directories specified via command-line arguments.

## API

### Resources

- `pdf://operations`: PDF operations interface

### Tools

- **merge_pdfs**
  - Merge multiple PDF files into one
  - Input:
    - `paths` (string[]): Paths to PDF files to merge
    - `outputPath` (string): Path to save the merged PDF

- **split_pdf**
  - Split a PDF into multiple PDFs based on page ranges
  - Input:
    - `path` (string): Path to the PDF file to split
    - `ranges` (array): Array of page ranges, e.g., `[{start: 0, end: 2}, {start: 3, end: 5}]`
    - `outputPattern` (string): Pattern for output files, e.g., "/path/to/output_{index}.pdf"

- **remove_pages**
  - Remove specified pages from a PDF
  - Input:
    - `path` (string): Path to the PDF file
    - `pages` (number[]): Pages to remove (0-indexed)
    - `outputPath` (string): Path to save the modified PDF

- **rotate_pdf**
  - Rotate pages in a PDF
  - Input:
    - `path` (string): Path to the PDF file
    - `degrees` (0|90|180|270|360): Rotation angle
    - `pages` (number[]): Pages to rotate (0-indexed, optional - all pages if not specified)
    - `outputPath` (string): Path to save the rotated PDF

- **organize_pdf**
  - Perform multiple operations on a PDF
  - Input:
    - `path` (string): Path to the PDF file
    - `actions` (array): Array of operations (remove, insert, replace, rotate, move)
    - `outputPath` (string): Path to save the modified PDF

- **pdf_to_images**
  - Convert PDF to images (JPEG or PNG)
  - Input:
    - `path` (string): Path to the PDF file
    - `outputDir` (string): Directory to save the images
    - `outputFormat` (string): "jpeg" or "png"
    - `scale` (number): Scale factor (optional)
    - `range` (object): Page range to convert (optional)

- **images_to_pdf**
  - Convert images to PDF
  - Input:
    - `paths` (string[]): Paths to image files
    - `outputPath` (string): Path to save the PDF
    - `scale` (number): Scale factor (optional)
    - `size` (object): Page size in mm (optional)
    - `margin` (array): Margins in mm [top, right, bottom, left] (optional)

- **list_allowed_directories**
  - List all directories the server is allowed to access
  - No input required

## Setup for Claude Desktop Users

To use this MCP server with Claude Desktop:

1. Build the server (see Build section below)
2. Add the server configuration to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pdfme": {
      "command": "node",
      "args": [
        "/path/to/mcp-server-pdfme/dist/index.js",
        "/Users/username/Desktop",
        "/path/to/other/allowed/dir"
      ]
    }
  }
}
```

For more information on setting up MCP servers with Claude Desktop, visit: https://modelcontextprotocol.io/quickstart/user

## Build

```bash
npm install
npm run build
```

## Run

```bash
node dist/index.js /path/to/allowed/directory1 /path/to/allowed/directory2
```

## License

This MCP server is licensed under the ISC License.
