#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { pdf2img, img2pdf } from '@pdfme/converter';
import { merge, split } from '@pdfme/manipulator';

const ToolInputSchema = ToolSchema.shape.inputSchema;
type ToolInput = z.infer<typeof ToolInputSchema>;

// Schema definitions
const TestArgsSchema = z.object({
  test: z.string(),
});

const tools = {
  test: {
    description: "Test tool",
    schema: TestArgsSchema,
    handler: (args: z.infer<typeof TestArgsSchema>) => {
      return { content: [{ type: "text", text: args.test }] };
    },
  },
  // Add other tools to this object
} as const;

// Server setup
const server = new Server({ name: "mcp-server-pdfme", version: "0.0.1" });

// Call tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;
    const tool = tools[name as keyof typeof tools];

    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const parsed = tool.schema.safeParse(args);
    if (!parsed.success) {
      throw new Error(`Invalid arguments for ${name}: ${parsed.error}`);
    }

    return tool.handler(parsed.data);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: Object.entries(tools).map(([name, tool]) => ({
      name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.schema) as ToolInput,
    })),
  };
});

// Start server
async function runServer() {
  console.log('pdf2img', pdf2img);
  console.log('img2pdf', img2pdf);
  console.log('merge', merge);
  console.log('split', split);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log("Server started!");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
