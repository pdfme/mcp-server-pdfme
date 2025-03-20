const fs = require('fs');
const path = require('path');
const { validatePath } = require('./lib/fileUtils');
const manipulator = require('./lib/manipulator');
const converter = require('./lib/converter');

// Custom MCP server implementation
function createMcpServer() {
  const resources = {};
  const tools = {};
  
  return {
    registerResource: (resourceId, resourceFn) => {
      resources[resourceId] = resourceFn;
    },
    
    registerTool: (toolId, toolFn, schema) => {
      tools[toolId] = { fn: toolFn, schema };
    },
    
    listen: ({ stdin, stdout }) => {
      // Redirect console.log to stderr to avoid interfering with JSON-RPC
      const originalConsoleLog = console.log;
      console.log = (...args) => {
        process.stderr.write(args.join(' ') + '\n');
      };
      
      // Log to stderr only
      console.log('Starting PDF MCP Server with allowed directories:');
      for (const dir of allowedDirectories) {
        console.log(` - ${dir}`);
      }
      console.log('PDF MCP Server started and listening for commands');
      
      // Set up message handling
      stdin.setEncoding('utf8');
      
      let buffer = '';
      
      stdin.on('data', (chunk) => {
        buffer += chunk;
        
        try {
          // Try to parse complete JSON messages
          const messages = tryParseMessages(buffer);
          
          if (messages.length > 0) {
            // Update buffer to contain only unparsed content
            const lastNewlinePos = buffer.lastIndexOf('\n');
            if (lastNewlinePos !== -1) {
              buffer = buffer.substring(lastNewlinePos + 1);
            } else {
              buffer = '';
            }
            
            // Process each complete message
            for (const message of messages) {
              handleMessage(message, stdout, resources, tools);
            }
          }
        } catch (error) {
          console.log(`Error processing message: ${error.message}`);
        }
      });
    }
  };
}

// Try to parse complete JSON-RPC messages from buffer
function tryParseMessages(buffer) {
  const messages = [];
  const lines = buffer.split('\n');
  
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    if (line) {
      try {
        const message = JSON.parse(line);
        messages.push(message);
      } catch (error) {
        console.log(`Error parsing JSON: ${error.message}`);
      }
    }
  }
  
  return messages;
}

// Handle incoming JSON-RPC messages
function handleMessage(message, stdout, resources, tools) {
  if (!message.jsonrpc || message.jsonrpc !== '2.0') {
    sendErrorResponse(stdout, message.id, -32600, 'Invalid Request');
    return;
  }
  
  switch (message.method) {
    case 'initialize':
      handleInitialize(message, stdout);
      break;
    case 'resources/list':
      handleResourcesList(message, stdout);
      break;
    case 'resources/get':
      handleResourcesGet(message, stdout, resources);
      break;
    case 'tools/list':
      handleToolsList(message, stdout, tools);
      break;
    case 'tools/call':
      handleToolsCall(message, stdout, tools);
      break;
    case 'prompts/list':
      handlePromptsList(message, stdout);
      break;
    case 'notifications/initialized':
      // No response needed for notifications
      break;
    default:
      sendErrorResponse(stdout, message.id, -32601, `Method not found: ${message.method}`);
  }
}

// Handle initialize request
function handleInitialize(message, stdout) {
  const response = {
    jsonrpc: '2.0',
    id: message.id,
    result: {
      protocolVersion: '2024-11-05',
      serverInfo: {
        name: 'mcp-server-pdfme',
        version: '1.0.0'
      },
      capabilities: {}
    }
  };
  
  sendResponse(stdout, response);
}

// Handle resources/list request
function handleResourcesList(message, stdout) {
  const response = {
    jsonrpc: '2.0',
    id: message.id,
    result: {
      resources: [
        {
          id: 'pdf://operations',
          title: 'PDF Operations',
          description: 'Interface for PDF manipulation and conversion operations'
        }
      ]
    }
  };
  
  sendResponse(stdout, response);
}

// Handle resources/get request
function handleResourcesGet(message, stdout, resources) {
  const resourceId = message.params?.resourceId;
  
  if (resourceId === 'pdf://operations') {
    const response = {
      jsonrpc: '2.0',
      id: message.id,
      result: {
        resource: {
          id: 'pdf://operations',
          title: 'PDF Operations',
          description: 'Interface for PDF manipulation and conversion operations',
          tools: [
            'merge_pdfs',
            'split_pdf',
            'remove_pages',
            'rotate_pdf',
            'organize_pdf',
            'pdf_to_images',
            'images_to_pdf',
            'list_allowed_directories'
          ]
        }
      }
    };
    
    sendResponse(stdout, response);
  } else {
    sendErrorResponse(stdout, message.id, -32602, `Resource not found: ${resourceId}`);
  }
}

// Handle tools/list request
function handleToolsList(message, stdout, tools) {
  const response = {
    jsonrpc: '2.0',
    id: message.id,
    result: {
      tools: [
        {
          id: 'merge_pdfs',
          title: 'Merge PDFs',
          description: 'Merge multiple PDF files into one',
          schema: {
            type: 'object',
            properties: {
              paths: {
                type: 'array',
                items: { type: 'string' },
                description: 'Paths to PDF files to merge'
              },
              outputPath: {
                type: 'string',
                description: 'Path to save the merged PDF'
              }
            },
            required: ['paths', 'outputPath']
          }
        },
        {
          id: 'split_pdf',
          title: 'Split PDF',
          description: 'Split a PDF into multiple PDFs based on page ranges',
          schema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to the PDF file to split'
              },
              ranges: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    start: { type: 'number' },
                    end: { type: 'number' }
                  }
                },
                description: 'Array of page ranges, e.g., [{start: 0, end: 2}, {start: 3, end: 5}]'
              },
              outputPattern: {
                type: 'string',
                description: 'Pattern for output files, e.g., "/path/to/output_{index}.pdf"'
              }
            },
            required: ['path', 'ranges', 'outputPattern']
          }
        },
        {
          id: 'remove_pages',
          title: 'Remove Pages',
          description: 'Remove specified pages from a PDF',
          schema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to the PDF file'
              },
              pages: {
                type: 'array',
                items: { type: 'number' },
                description: 'Pages to remove (0-indexed)'
              },
              outputPath: {
                type: 'string',
                description: 'Path to save the modified PDF'
              }
            },
            required: ['path', 'pages', 'outputPath']
          }
        },
        {
          id: 'rotate_pdf',
          title: 'Rotate PDF',
          description: 'Rotate pages in a PDF',
          schema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to the PDF file'
              },
              degrees: {
                type: 'number',
                enum: [0, 90, 180, 270, 360],
                description: 'Rotation angle'
              },
              pages: {
                type: 'array',
                items: { type: 'number' },
                description: 'Pages to rotate (0-indexed, optional - all pages if not specified)'
              },
              outputPath: {
                type: 'string',
                description: 'Path to save the rotated PDF'
              }
            },
            required: ['path', 'degrees', 'outputPath']
          }
        },
        {
          id: 'organize_pdf',
          title: 'Organize PDF',
          description: 'Perform multiple operations on a PDF',
          schema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to the PDF file'
              },
              actions: {
                type: 'array',
                description: 'Array of operations (remove, insert, replace, rotate, move)'
              },
              outputPath: {
                type: 'string',
                description: 'Path to save the modified PDF'
              }
            },
            required: ['path', 'actions', 'outputPath']
          }
        },
        {
          id: 'pdf_to_images',
          title: 'PDF to Images',
          description: 'Convert PDF to images (JPEG or PNG)',
          schema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to the PDF file'
              },
              outputDir: {
                type: 'string',
                description: 'Directory to save the images'
              },
              outputFormat: {
                type: 'string',
                enum: ['jpeg', 'png'],
                description: 'Output image format'
              },
              scale: {
                type: 'number',
                description: 'Scale factor (optional)'
              },
              range: {
                type: 'object',
                properties: {
                  start: { type: 'number' },
                  end: { type: 'number' }
                },
                description: 'Page range to convert (optional)'
              }
            },
            required: ['path', 'outputDir', 'outputFormat']
          }
        },
        {
          id: 'images_to_pdf',
          title: 'Images to PDF',
          description: 'Convert images to PDF',
          schema: {
            type: 'object',
            properties: {
              paths: {
                type: 'array',
                items: { type: 'string' },
                description: 'Paths to image files'
              },
              outputPath: {
                type: 'string',
                description: 'Path to save the PDF'
              },
              scale: {
                type: 'number',
                description: 'Scale factor (optional)'
              },
              size: {
                type: 'object',
                properties: {
                  width: { type: 'number' },
                  height: { type: 'number' }
                },
                description: 'Page size in mm (optional)'
              },
              margin: {
                type: 'array',
                items: { type: 'number' },
                description: 'Margins in mm [top, right, bottom, left] (optional)'
              }
            },
            required: ['paths', 'outputPath']
          }
        },
        {
          id: 'list_allowed_directories',
          title: 'List Allowed Directories',
          description: 'List all directories the server is allowed to access',
          schema: {
            type: 'object',
            properties: {}
          }
        }
      ]
    }
  };
  
  sendResponse(stdout, response);
}

// Handle tools/call request
function handleToolsCall(message, stdout, tools) {
  const { toolId, params } = message.params || {};
  
  if (!toolId) {
    sendErrorResponse(stdout, message.id, -32602, 'Missing toolId parameter');
    return;
  }
  
  // Validate paths in params
  if (!validateToolParams(toolId, params)) {
    sendErrorResponse(stdout, message.id, -32602, 'Invalid parameters or unauthorized path');
    return;
  }
  
  // Call the appropriate tool function
  try {
    callTool(toolId, params)
      .then(result => {
        const response = {
          jsonrpc: '2.0',
          id: message.id,
          result
        };
        sendResponse(stdout, response);
      })
      .catch(error => {
        sendErrorResponse(stdout, message.id, -32603, `Error calling tool: ${error.message}`);
      });
  } catch (error) {
    sendErrorResponse(stdout, message.id, -32603, `Error calling tool: ${error.message}`);
  }
}

// Handle prompts/list request
function handlePromptsList(message, stdout) {
  const response = {
    jsonrpc: '2.0',
    id: message.id,
    result: {
      prompts: []
    }
  };
  
  sendResponse(stdout, response);
}

// Validate tool parameters, especially paths
function validateToolParams(toolId, params) {
  if (!params) return false;
  
  switch (toolId) {
    case 'merge_pdfs':
      return params.paths && 
             params.paths.every(p => validatePath(p, allowedDirectories)) && 
             validatePath(params.outputPath, allowedDirectories);
    
    case 'split_pdf':
      return params.path && 
             validatePath(params.path, allowedDirectories) && 
             params.outputPattern && 
             validatePath(params.outputPattern.replace('{index}', '0'), allowedDirectories);
    
    case 'remove_pages':
    case 'rotate_pdf':
      return params.path && 
             validatePath(params.path, allowedDirectories) && 
             validatePath(params.outputPath, allowedDirectories);
    
    case 'organize_pdf':
      return params.path && 
             validatePath(params.path, allowedDirectories) && 
             validatePath(params.outputPath, allowedDirectories);
    
    case 'pdf_to_images':
      return params.path && 
             validatePath(params.path, allowedDirectories) && 
             validatePath(params.outputDir, allowedDirectories);
    
    case 'images_to_pdf':
      return params.paths && 
             params.paths.every(p => validatePath(p, allowedDirectories)) && 
             validatePath(params.outputPath, allowedDirectories);
    
    case 'list_allowed_directories':
      return true;
    
    default:
      return false;
  }
}

// Call the appropriate tool function
async function callTool(toolId, params) {
  switch (toolId) {
    case 'merge_pdfs':
      return await manipulator.merge(params);
    
    case 'split_pdf':
      return await manipulator.split(params);
    
    case 'remove_pages':
      return await manipulator.remove(params);
    
    case 'rotate_pdf':
      return await manipulator.rotate(params);
    
    case 'organize_pdf':
      return await manipulator.organize(params);
    
    case 'pdf_to_images':
      return await converter.pdf2img(params);
    
    case 'images_to_pdf':
      return await converter.img2pdf(params);
    
    case 'list_allowed_directories':
      return allowedDirectories;
    
    default:
      throw new Error(`Unknown tool: ${toolId}`);
  }
}

// Send JSON-RPC response
function sendResponse(stdout, response) {
  stdout.write(JSON.stringify(response) + '\n');
}

// Send JSON-RPC error response
function sendErrorResponse(stdout, id, code, message) {
  const response = {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message
    }
  };
  
  sendResponse(stdout, response);
}

// Get allowed directories from command line arguments
const allowedDirectories = process.argv.slice(2);

// Create and start the MCP server
const server = createMcpServer();

// Register the PDF operations resource
server.registerResource('pdf://operations', async () => {
  return {
    id: 'pdf://operations',
    title: 'PDF Operations',
    description: 'Interface for PDF manipulation and conversion operations',
    tools: [
      'merge_pdfs',
      'split_pdf',
      'remove_pages',
      'rotate_pdf',
      'organize_pdf',
      'pdf_to_images',
      'images_to_pdf',
      'list_allowed_directories'
    ]
  };
});

// Register all tools
server.registerTool('merge_pdfs', async (params) => {
  return await manipulator.merge(params);
}, {
  type: 'object',
  properties: {
    paths: {
      type: 'array',
      items: { type: 'string' },
      description: 'Paths to PDF files to merge'
    },
    outputPath: {
      type: 'string',
      description: 'Path to save the merged PDF'
    }
  },
  required: ['paths', 'outputPath']
});

server.registerTool('split_pdf', async (params) => {
  return await manipulator.split(params);
}, {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description: 'Path to the PDF file to split'
    },
    ranges: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          start: { type: 'number' },
          end: { type: 'number' }
        }
      },
      description: 'Array of page ranges, e.g., [{start: 0, end: 2}, {start: 3, end: 5}]'
    },
    outputPattern: {
      type: 'string',
      description: 'Pattern for output files, e.g., "/path/to/output_{index}.pdf"'
    }
  },
  required: ['path', 'ranges', 'outputPattern']
});

server.registerTool('remove_pages', async (params) => {
  return await manipulator.remove(params);
}, {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description: 'Path to the PDF file'
    },
    pages: {
      type: 'array',
      items: { type: 'number' },
      description: 'Pages to remove (0-indexed)'
    },
    outputPath: {
      type: 'string',
      description: 'Path to save the modified PDF'
    }
  },
  required: ['path', 'pages', 'outputPath']
});

server.registerTool('rotate_pdf', async (params) => {
  return await manipulator.rotate(params);
}, {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description: 'Path to the PDF file'
    },
    degrees: {
      type: 'number',
      enum: [0, 90, 180, 270, 360],
      description: 'Rotation angle'
    },
    pages: {
      type: 'array',
      items: { type: 'number' },
      description: 'Pages to rotate (0-indexed, optional - all pages if not specified)'
    },
    outputPath: {
      type: 'string',
      description: 'Path to save the rotated PDF'
    }
  },
  required: ['path', 'degrees', 'outputPath']
});

server.registerTool('organize_pdf', async (params) => {
  return await manipulator.organize(params);
}, {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description: 'Path to the PDF file'
    },
    actions: {
      type: 'array',
      description: 'Array of operations (remove, insert, replace, rotate, move)'
    },
    outputPath: {
      type: 'string',
      description: 'Path to save the modified PDF'
    }
  },
  required: ['path', 'actions', 'outputPath']
});

server.registerTool('pdf_to_images', async (params) => {
  return await converter.pdf2img(params);
}, {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description: 'Path to the PDF file'
    },
    outputDir: {
      type: 'string',
      description: 'Directory to save the images'
    },
    outputFormat: {
      type: 'string',
      enum: ['jpeg', 'png'],
      description: 'Output image format'
    },
    scale: {
      type: 'number',
      description: 'Scale factor (optional)'
    },
    range: {
      type: 'object',
      properties: {
        start: { type: 'number' },
        end: { type: 'number' }
      },
      description: 'Page range to convert (optional)'
    }
  },
  required: ['path', 'outputDir', 'outputFormat']
});

server.registerTool('images_to_pdf', async (params) => {
  return await converter.img2pdf(params);
}, {
  type: 'object',
  properties: {
    paths: {
      type: 'array',
      items: { type: 'string' },
      description: 'Paths to image files'
    },
    outputPath: {
      type: 'string',
      description: 'Path to save the PDF'
    },
    scale: {
      type: 'number',
      description: 'Scale factor (optional)'
    },
    size: {
      type: 'object',
      properties: {
        width: { type: 'number' },
        height: { type: 'number' }
      },
      description: 'Page size in mm (optional)'
    },
    margin: {
      type: 'array',
      items: { type: 'number' },
      description: 'Margins in mm [top, right, bottom, left] (optional)'
    }
  },
  required: ['paths', 'outputPath']
});

server.registerTool('list_allowed_directories', async () => {
  return allowedDirectories;
}, {
  type: 'object',
  properties: {}
});

// Start listening for commands
server.listen({
  stdin: process.stdin,
  stdout: process.stdout
});
