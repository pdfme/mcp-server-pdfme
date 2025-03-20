import fs from 'fs';
import path from 'path';

/**
 * Validates if a path is safe to read/write based on allowed directories
 */
export const validatePath = (filePath: string, allowedDirs: string[]): boolean => {
  const normalizedPath = path.normalize(filePath);
  
  return allowedDirs.some(dir => {
    const normalizedDir = path.normalize(dir);
    return normalizedPath.startsWith(normalizedDir);
  });
};

/**
 * Read a file as buffer
 */
export const readFileAsBuffer = async (filePath: string): Promise<Buffer> => {
  return fs.promises.readFile(filePath);
};

/**
 * Write buffer to a file
 */
export const writeBufferToFile = async (filePath: string, data: Buffer | Uint8Array): Promise<void> => {
  const dir = path.dirname(filePath);
  
  // Ensure directory exists
  await fs.promises.mkdir(dir, { recursive: true });
  
  return fs.promises.writeFile(filePath, data);
};
