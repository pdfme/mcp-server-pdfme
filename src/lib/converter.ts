const converter = require('@pdfme/converter');
const fs = require('fs');
const path = require('path');
const { readFileAsBuffer, writeBufferToFile } = require('./fileUtils');

/**
 * Convert PDF to images (JPEG or PNG)
 */
const pdf2img = async (params) => {
  const { path: pdfPath, outputDir, outputFormat, scale, range } = params;

  const pdfBuffer = await readFileAsBuffer(pdfPath);
  const imageBuffers = await converter.pdf2img(pdfBuffer, {
    scale,
    imageType: outputFormat,
    range
  });
  
  // Ensure output directory exists
  await fs.promises.mkdir(outputDir, { recursive: true });
  
  const outputPaths = [];
  
  for (let i = 0; i < imageBuffers.length; i++) {
    const imagePath = `${outputDir}/page-${i + 1}.${outputFormat}`;
    await writeBufferToFile(imagePath, Buffer.from(imageBuffers[i]));
    outputPaths.push(imagePath);
  }
  
  return outputPaths;
};

/**
 * Convert images to PDF
 */
const img2pdf = async (params) => {
  const { paths, outputPath, scale, size, margin } = params;

  const imageBuffers = await Promise.all(paths.map(path => readFileAsBuffer(path)));
  
  // Only pass properties that are supported by the converter
  const options = {} as any;
  if (scale !== undefined) options.scale = scale;
  if (margin !== undefined) options.margin = margin;
  
  const pdfBuffer = await converter.img2pdf(imageBuffers, options);
  
  await writeBufferToFile(outputPath, Buffer.from(pdfBuffer));
  return outputPath;
};

module.exports = {
  pdf2img,
  img2pdf
};
