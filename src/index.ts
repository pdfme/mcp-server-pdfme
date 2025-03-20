#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ToolSchema
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// Get allowed directories from command line arguments
const allowedDirectories = process.argv.slice(2);

if (allowedDirectories.length === 0) {
  console.error("Usage: mcp-server-pdfme <allowed-directory> [additional-directories...]");
  process.exit(1);
}

// Redirect console.log to stderr to avoid interfering with JSON-RPC
console.error('Starting PDF MCP Server with allowed directories:');
for (const dir of allowedDirectories) {
  console.error(` - ${dir}`);
}
console.error('PDF MCP Server started and listening for commands');

// Validate that all directories exist and are accessible
(async () => {
  for (const dir of allowedDirectories) {
    try {
      const stats = await fs.stat(dir);
      if (!stats.isDirectory()) {
        console.error(`Error: ${dir} is not a directory`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error accessing directory ${dir}:`, error);
      process.exit(1);
    }
  }
})();

// Function to validate if a path is within allowed directories
async function validatePath(requestedPath) {
  const absolute = path.isAbsolute(requestedPath)
    ? path.resolve(requestedPath)
    : path.resolve(process.cwd(), requestedPath);

  const normalizedRequested = path.normalize(absolute);

  // Check if path is within allowed directories
  const isAllowed = allowedDirectories.some(dir => {
    const normalizedDir = path.normalize(dir);
    return normalizedRequested.startsWith(normalizedDir);
  });

  if (!isAllowed) {
    throw new Error(`Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectories.join(', ')}`);
  }

  // Handle symlinks by checking their real path
  try {
    const realPath = await fs.realpath(absolute);
    const normalizedReal = path.normalize(realPath);
    const isRealPathAllowed = allowedDirectories.some(dir => {
      const normalizedDir = path.normalize(dir);
      return normalizedReal.startsWith(normalizedDir);
    });
    
    if (!isRealPathAllowed) {
      throw new Error("Access denied - symlink target outside allowed directories");
    }
    return realPath;
  } catch (error) {
    // For new files that don't exist yet, verify parent directory
    const parentDir = path.dirname(absolute);
    try {
      const realParentPath = await fs.realpath(parentDir);
      const normalizedParent = path.normalize(realParentPath);
      const isParentAllowed = allowedDirectories.some(dir => {
        const normalizedDir = path.normalize(dir);
        return normalizedParent.startsWith(normalizedDir);
      });
      
      if (!isParentAllowed) {
        throw new Error("Access denied - parent directory outside allowed directories");
      }
      return absolute;
    } catch {
      throw new Error(`Parent directory does not exist: ${parentDir}`);
    }
  }
}

// Import manipulator and converter modules
const manipulator = require('./lib/manipulator');
const converter = require('./lib/converter');

// Define common schemas
const PathSchema = z.string().describe("File path");
const OutputPathSchema = z.string().describe("Path to save the output file");

// Define tool schemas
const MergePdfsSchema = z.object({
  paths: z.array(PathSchema).describe("Paths to PDF files to merge"),
  outputPath: OutputPathSchema.describe("Path to save the merged PDF")
});

const SplitPdfSchema = z.object({
  path: PathSchema.describe("Path to the PDF file to split"),
  ranges: z.array(
    z.object({
      start: z.number(),
      end: z.number()
    })
  ).describe("Array of page ranges, e.g., [{start: 0, end: 2}, {start: 3, end: 5}]"),
  outputPattern: z.string().describe("Pattern for output files, e.g., \"/path/to/output_{index}.pdf\"")
});

const RemovePagesSchema = z.object({
  path: PathSchema.describe("Path to the PDF file"),
  pages: z.array(z.number()).describe("Pages to remove (0-indexed)"),
  outputPath: OutputPathSchema.describe("Path to save the modified PDF")
});

const RotatePdfSchema = z.object({
  path: PathSchema.describe("Path to the PDF file"),
  degrees: z.number().describe("Rotation angle").refine(val => [0, 90, 180, 270, 360].includes(val), {
    message: "Degrees must be one of: 0, 90, 180, 270, 360"
  }),
  pages: z.array(z.number()).describe("Pages to rotate (0-indexed, optional - all pages if not specified)").optional(),
  outputPath: OutputPathSchema.describe("Path to save the rotated PDF")
});

const OrganizePdfSchema = z.object({
  path: PathSchema.describe("Path to the PDF file"),
  actions: z.array(z.any()).describe("Array of operations (remove, insert, replace, rotate, move)"),
  outputPath: OutputPathSchema.describe("Path to save the modified PDF")
});

const PdfToImagesSchema = z.object({
  path: PathSchema.describe("Path to the PDF file"),
  outputDir: z.string().describe("Directory to save the images"),
  outputFormat: z.enum(["jpeg", "png"]).describe("Output image format"),
  scale: z.number().describe("Scale factor (optional)").optional(),
  range: z.object({
    start: z.number(),
    end: z.number()
  }).describe("Page range to convert (optional)").optional()
});

const ImagesToPdfSchema = z.object({
  paths: z.array(PathSchema).describe("Paths to image files"),
  outputPath: OutputPathSchema.describe("Path to save the PDF"),
  scale: z.number().describe("Scale factor (optional)").optional(),
  size: z.object({
    width: z.number(),
    height: z.number()
  }).describe("Page size in mm (optional)").optional(),
  margin: z.array(z.number()).describe("Margins in mm [top, right, bottom, left] (optional)").optional()
});

const ListAllowedDirectoriesSchema = z.object({});

const ToolInputSchema = ToolSchema.shape.inputSchema;
type ToolInput = z.infer<typeof ToolInputSchema>;

// Server setup
const server = new Server(
  {
    name: "pdfme-mcp-server",
    version: "1.0.0"
  },
  {
    capabilities: {
      tools: {},
      resources: {}
    }
  }
);

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "merge_pdfs",
        description: "Merge multiple PDF files into one",
        inputSchema: zodToJsonSchema(MergePdfsSchema) as ToolInput
      },
      {
        name: "split_pdf",
        description: "Split a PDF into multiple PDFs based on page ranges",
        inputSchema: zodToJsonSchema(SplitPdfSchema) as ToolInput
      },
      {
        name: "remove_pages",
        description: "Remove specified pages from a PDF",
        inputSchema: zodToJsonSchema(RemovePagesSchema) as ToolInput
      },
      {
        name: "rotate_pdf",
        description: "Rotate pages in a PDF",
        inputSchema: zodToJsonSchema(RotatePdfSchema) as ToolInput
      },
      {
        name: "organize_pdf",
        description: "Perform multiple operations on a PDF",
        inputSchema: zodToJsonSchema(OrganizePdfSchema) as ToolInput
      },
      {
        name: "pdf_to_images",
        description: "Convert PDF to images (JPEG or PNG)",
        inputSchema: zodToJsonSchema(PdfToImagesSchema) as ToolInput
      },
      {
        name: "images_to_pdf",
        description: "Convert images to PDF",
        inputSchema: zodToJsonSchema(ImagesToPdfSchema) as ToolInput
      },
      {
        name: "list_allowed_directories",
        description: "List all directories the server is allowed to access",
        inputSchema: zodToJsonSchema(ListAllowedDirectoriesSchema) as ToolInput
      }
    ]
  };
});

// Register resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        id: "pdf://operations",
        title: "PDF Operations",
        description: "Interface for PDF manipulation and conversion operations"
      }
    ]
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { resourceId } = request.params;
  
  if (resourceId === "pdf://operations") {
    return {
      resource: {
        id: "pdf://operations",
        title: "PDF Operations",
        description: "Interface for PDF manipulation and conversion operations",
        tools: ["merge_pdfs", "split_pdf", "remove_pages", "rotate_pdf", "organize_pdf", 
                "pdf_to_images", "images_to_pdf", "list_allowed_directories"]
      }
    };
  }
  
  throw new Error(`Resource not found: ${resourceId}`);
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "merge_pdfs": {
        const parsed = MergePdfsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for merge_pdfs: ${parsed.error}`);
        }
        
        // Validate paths
        const validPaths = await Promise.all(parsed.data.paths.map(p => validatePath(p)));
        const validOutputPath = await validatePath(parsed.data.outputPath);
        
        // Call the tool function
        const result = await manipulator.merge({
          ...parsed.data,
          paths: validPaths,
          outputPath: validOutputPath
        });
        
        return {
          content: [{ type: "text", text: `Successfully merged PDFs to ${result}` }]
        };
      }
      
      case "split_pdf": {
        const parsed = SplitPdfSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for split_pdf: ${parsed.error}`);
        }
        
        // Validate paths
        const validPath = await validatePath(parsed.data.path);
        // Validate output pattern by checking a sample path
        const sampleOutputPath = parsed.data.outputPattern.replace("{index}", "0");
        await validatePath(sampleOutputPath);
        
        // Call the tool function
        const result = await manipulator.split({
          ...parsed.data,
          path: validPath
        });
        
        return {
          content: [{ type: "text", text: `Successfully split PDF into ${result.length} files: ${result.join(", ")}` }]
        };
      }
      
      case "remove_pages": {
        const parsed = RemovePagesSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for remove_pages: ${parsed.error}`);
        }
        
        // Validate paths
        const validPath = await validatePath(parsed.data.path);
        const validOutputPath = await validatePath(parsed.data.outputPath);
        
        // Call the tool function
        const result = await manipulator.remove({
          ...parsed.data,
          path: validPath,
          outputPath: validOutputPath
        });
        
        return {
          content: [{ type: "text", text: `Successfully removed pages from PDF: ${result}` }]
        };
      }
      
      case "rotate_pdf": {
        const parsed = RotatePdfSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for rotate_pdf: ${parsed.error}`);
        }
        
        // Validate paths
        const validPath = await validatePath(parsed.data.path);
        const validOutputPath = await validatePath(parsed.data.outputPath);
        
        // Call the tool function
        const result = await manipulator.rotate({
          ...parsed.data,
          path: validPath,
          outputPath: validOutputPath
        });
        
        return {
          content: [{ type: "text", text: `Successfully rotated PDF: ${result}` }]
        };
      }
      
      case "organize_pdf": {
        const parsed = OrganizePdfSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for organize_pdf: ${parsed.error}`);
        }
        
        // Validate paths
        const validPath = await validatePath(parsed.data.path);
        const validOutputPath = await validatePath(parsed.data.outputPath);
        
        // Call the tool function
        const result = await manipulator.organize({
          ...parsed.data,
          path: validPath,
          outputPath: validOutputPath
        });
        
        return {
          content: [{ type: "text", text: `Successfully organized PDF: ${result}` }]
        };
      }
      
      case "pdf_to_images": {
        const parsed = PdfToImagesSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for pdf_to_images: ${parsed.error}`);
        }
        
        // Validate paths
        const validPath = await validatePath(parsed.data.path);
        const validOutputDir = await validatePath(parsed.data.outputDir);
        
        // Call the tool function
        const result = await converter.pdf2img({
          ...parsed.data,
          path: validPath,
          outputDir: validOutputDir
        });
        
        return {
          content: [{ type: "text", text: `Successfully converted PDF to images: ${result.join(", ")}` }]
        };
      }
      
      case "images_to_pdf": {
        const parsed = ImagesToPdfSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for images_to_pdf: ${parsed.error}`);
        }
        
        // Validate paths
        const validPaths = await Promise.all(parsed.data.paths.map(p => validatePath(p)));
        const validOutputPath = await validatePath(parsed.data.outputPath);
        
        // Call the tool function
        const result = await converter.img2pdf({
          ...parsed.data,
          paths: validPaths,
          outputPath: validOutputPath
        });
        
        return {
          content: [{ type: "text", text: `Successfully converted images to PDF: ${result}` }]
        };
      }
      
      case "list_allowed_directories": {
        return {
          content: [{ 
            type: "text", 
            text: `Allowed directories:\n${allowedDirectories.join('\n')}` 
          }]
        };
      }
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true
    };
  }
});

// Start the server
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("PDF MCP Server running on stdio");
  console.error("Allowed directories:", allowedDirectories);
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
