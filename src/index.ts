// MCP Server for PDF operations
import { createMcpServer } from '@modelcontextprotocol/sdk';
import * as path from 'path';
import * as manipulator from './lib/manipulator';
import * as converter from './lib/converter';
import { validatePath } from './lib/fileUtils';

// Get allowed directories from command line arguments
const allowedDirs = process.argv.slice(2).map((dir: string) => path.resolve(dir));

if (allowedDirs.length === 0) {
  console.error('Error: No allowed directories specified. Please provide at least one directory path.');
  process.exit(1);
}

console.log('Starting PDF MCP Server with allowed directories:');
allowedDirs.forEach((dir: string) => console.log(` - ${dir}`));

const validatePaths = (paths: string | string[]): boolean => {
  const pathsArray = Array.isArray(paths) ? paths : [paths];
  return pathsArray.every(p => validatePath(p, allowedDirs));
};

// Define interfaces for tool parameters
interface MergePdfsParams {
  paths: string[];
  outputPath: string;
}

interface SplitPdfParams {
  path: string;
  ranges: { start?: number; end?: number }[];
  outputPattern: string;
}

interface RemovePagesParams {
  path: string;
  pages: number[];
  outputPath: string;
}

interface RotatePdfParams {
  path: string;
  degrees: 0 | 90 | 180 | 270 | 360;
  pages?: number[];
  outputPath: string;
}

interface OrganizePdfParams {
  path: string;
  actions: Array<
    | { type: 'remove'; data: { position: number } }
    | { type: 'insert'; data: { pdf: string; position: number } }
    | { type: 'replace'; data: { pdf: string; position: number } }
    | { type: 'rotate'; data: { position: number; degrees: 0 | 90 | 180 | 270 | 360 } }
    | { type: 'move'; data: { from: number; to: number } }
  >;
  outputPath: string;
}

interface Pdf2ImgParams {
  path: string;
  outputDir: string;
  outputFormat: 'jpeg' | 'png';
  scale?: number;
  range?: {
    start?: number;
    end?: number;
  };
}

interface Img2PdfParams {
  paths: string[];
  outputPath: string;
  scale?: number;
  size?: { height: number; width: number };
  margin?: [number, number, number, number];
}

// Create MCP server
const server = createMcpServer();

// Register PDF resource
server.registerResource('pdf://operations', async () => {
  return {
    merge_pdfs: {
      description: 'Merge multiple PDF files into one',
      fn: async ({ paths, outputPath }: MergePdfsParams) => {
        if (!validatePaths([...paths, outputPath])) {
          throw new Error('Access denied: One or more paths are outside allowed directories');
        }
        return await manipulator.merge({ paths, outputPath });
      }
    },
    split_pdf: {
      description: 'Split a PDF into multiple PDFs based on page ranges',
      fn: async ({ path: pdfPath, ranges, outputPattern }: SplitPdfParams) => {
        if (!validatePath(pdfPath, allowedDirs) || !validatePath(outputPattern, allowedDirs)) {
          throw new Error('Access denied: Path is outside allowed directories');
        }
        return await manipulator.split({ path: pdfPath, ranges, outputPattern });
      }
    },
    remove_pages: {
      description: 'Remove specified pages from a PDF',
      fn: async ({ path: pdfPath, pages, outputPath }: RemovePagesParams) => {
        if (!validatePaths([pdfPath, outputPath])) {
          throw new Error('Access denied: Path is outside allowed directories');
        }
        return await manipulator.remove({ path: pdfPath, pages, outputPath });
      }
    },
    rotate_pdf: {
      description: 'Rotate pages in a PDF',
      fn: async ({ path: pdfPath, degrees, pages, outputPath }: RotatePdfParams) => {
        if (!validatePaths([pdfPath, outputPath])) {
          throw new Error('Access denied: Path is outside allowed directories');
        }
        return await manipulator.rotate({ path: pdfPath, degrees, pages, outputPath });
      }
    },
    organize_pdf: {
      description: 'Perform multiple operations on a PDF',
      fn: async ({ path: pdfPath, actions, outputPath }: OrganizePdfParams) => {
        if (!validatePaths([pdfPath, outputPath])) {
          throw new Error('Access denied: Path is outside allowed directories');
        }
        
        // Validate all PDF paths in actions
        const pdfPaths = actions
          .filter(action => action.type === 'insert' || action.type === 'replace')
          .map(action => {
            if (action.type === 'insert' || action.type === 'replace') {
              return action.data.pdf;
            }
            return '';
          })
          .filter(path => path !== '');
        
        if (!validatePaths(pdfPaths)) {
          throw new Error('Access denied: One or more PDF paths in actions are outside allowed directories');
        }
        
        return await manipulator.organize({ path: pdfPath, actions, outputPath });
      }
    },
    pdf_to_images: {
      description: 'Convert PDF to images (JPEG or PNG)',
      fn: async ({ path: pdfPath, outputDir, outputFormat, scale, range }: Pdf2ImgParams) => {
        if (!validatePaths([pdfPath, outputDir])) {
          throw new Error('Access denied: Path is outside allowed directories');
        }
        return await converter.pdf2img({ 
          path: pdfPath, 
          outputDir, 
          outputFormat, 
          scale, 
          range 
        });
      }
    },
    images_to_pdf: {
      description: 'Convert images to PDF',
      fn: async ({ paths, outputPath, scale, size, margin }: Img2PdfParams) => {
        if (!validatePaths([...paths, outputPath])) {
          throw new Error('Access denied: One or more paths are outside allowed directories');
        }
        return await converter.img2pdf({ 
          paths, 
          outputPath, 
          scale, 
          size, 
          margin 
        });
      }
    },
    list_allowed_directories: {
      description: 'List all directories the server is allowed to access',
      fn: async () => {
        return allowedDirs;
      }
    }
  };
});

// Start listening on stdin/stdout
server.listen({
  stdin: process.stdin,
  stdout: process.stdout,
  stderr: process.stderr
});

console.log('PDF MCP Server started and listening for commands');
