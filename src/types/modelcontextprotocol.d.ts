declare module '@modelcontextprotocol/sdk' {
  export function createMcpServer(): {
    registerResource: (resourceId: string, resourceFn: () => Promise<any>) => void;
    listen: (options: { stdin: NodeJS.ReadStream; stdout: NodeJS.WriteStream; stderr: NodeJS.WriteStream }) => void;
  };
}
