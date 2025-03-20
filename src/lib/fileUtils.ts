const fs = require('fs');
const pathModule = require('path');

/**
 * Validates if a path is safe to read/write based on allowed directories
 */
const validatePath = (filePath, allowedDirs) => {
  const normalizedPath = pathModule.normalize(filePath);
  
  return allowedDirs.some((dir) => {
    const normalizedDir = pathModule.normalize(dir);
    return normalizedPath.startsWith(normalizedDir);
  });
};

/**
 * Read a file as buffer
 */
const readFileAsBuffer = async (filePath) => {
  return fs.promises.readFile(filePath);
};

/**
 * Write buffer to a file
 */
const writeBufferToFile = async (filePath, data) => {
  const dir = pathModule.dirname(filePath);
  
  // Ensure directory exists
  await fs.promises.mkdir(dir, { recursive: true });
  
  return fs.promises.writeFile(filePath, data);
};

module.exports = {
  validatePath,
  readFileAsBuffer,
  writeBufferToFile
};
