import * as converter from '@pdfme/converter';
import * as fs from 'fs';
import * as path from 'path';
import { readFileAsBuffer, writeBufferToFile } from './fileUtils';

export interface Pdf2ImgParams {
  path: string;
  outputDir: string;
  outputFormat: 'jpeg' | 'png';
  scale?: number;
  range?: {
    start?: number;
    end?: number;
  };
}

export interface Img2PdfParams {
  paths: string[];
  outputPath: string;
  scale?: number;
  size?: { height: number; width: number };
  margin?: [number, number, number, number];
}

/**
 * Convert PDF to images (JPEG or PNG)
 */
export const pdf2img = async (params: Pdf2ImgParams): Promise<string[]> => {
  const { path: pdfPath, outputDir, outputFormat, scale, range } = params;

  const pdfBuffer = await readFileAsBuffer(pdfPath);
  const imageBuffers = await converter.pdf2img(pdfBuffer, {
    scale,
    imageType: outputFormat,
    range
  });
  
  // Ensure output directory exists
  await fs.promises.mkdir(outputDir, { recursive: true });
  
  const outputPaths: string[] = [];
  
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
export const img2pdf = async (params: Img2PdfParams): Promise<string> => {
  const { paths, outputPath, scale, size, margin } = params;

  const imageBuffers = await Promise.all(paths.map(path => readFileAsBuffer(path)));
  
  // Only pass properties that are supported by the converter
  const options: any = {};
  if (scale !== undefined) options.scale = scale;
  if (margin !== undefined) options.margin = margin;
  
  const pdfBuffer = await converter.img2pdf(imageBuffers, options);
  
  await writeBufferToFile(outputPath, Buffer.from(pdfBuffer));
  return outputPath;
};
