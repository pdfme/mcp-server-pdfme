import * as manipulator from '@pdfme/manipulator';
import { readFileAsBuffer, writeBufferToFile } from './fileUtils';

export interface MergeParams {
  paths: string[];
  outputPath: string;
}

export interface SplitParams {
  path: string;
  ranges: { start?: number; end?: number }[];
  outputPattern: string;
}

export interface RemoveParams {
  path: string;
  pages: number[];
  outputPath: string;
}

export interface RotateParams {
  path: string;
  degrees: 0 | 90 | 180 | 270 | 360;
  pages?: number[];
  outputPath: string;
}

export interface OrganizeParams {
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

/**
 * Merge multiple PDFs into one
 */
export const merge = async (params: MergeParams): Promise<string> => {
  const { paths, outputPath } = params;

  const pdfBuffers = await Promise.all(paths.map(path => readFileAsBuffer(path)));
  const mergedPdf = await manipulator.merge(pdfBuffers);
  
  await writeBufferToFile(outputPath, mergedPdf);
  return outputPath;
};

/**
 * Split a PDF into multiple PDFs based on page ranges
 */
export const split = async (params: SplitParams): Promise<string[]> => {
  const { path, ranges, outputPattern } = params;

  const pdfBuffer = await readFileAsBuffer(path);
  const splitPdfs = await manipulator.split(pdfBuffer, ranges);
  
  const outputPaths: string[] = [];
  
  for (let i = 0; i < splitPdfs.length; i++) {
    const rangePath = outputPattern.replace('{index}', i.toString());
    await writeBufferToFile(rangePath, splitPdfs[i]);
    outputPaths.push(rangePath);
  }
  
  return outputPaths;
};

/**
 * Remove specified pages from a PDF
 */
export const remove = async (params: RemoveParams): Promise<string> => {
  const { path, pages, outputPath } = params;

  const pdfBuffer = await readFileAsBuffer(path);
  const newPdf = await manipulator.remove(pdfBuffer, pages);
  
  await writeBufferToFile(outputPath, newPdf);
  return outputPath;
};

/**
 * Rotate pages in a PDF
 */
export const rotate = async (params: RotateParams): Promise<string> => {
  const { path, degrees, pages, outputPath } = params;

  const pdfBuffer = await readFileAsBuffer(path);
  const rotatedPdf = await manipulator.rotate(pdfBuffer, degrees, pages);
  
  await writeBufferToFile(outputPath, rotatedPdf);
  return outputPath;
};

/**
 * Perform multiple operations on a PDF
 */
export const organize = async (params: OrganizeParams): Promise<string> => {
  const { path, actions, outputPath } = params;

  const pdfBuffer = await readFileAsBuffer(path);
  
  // Transform actions to include file buffers instead of paths
  const processedActions = await Promise.all(
    actions.map(async (action) => {
      if (action.type === 'insert' || action.type === 'replace') {
        const pdfInsertBuffer = await readFileAsBuffer(action.data.pdf);
        return {
          ...action,
          data: {
            ...action.data,
            pdf: pdfInsertBuffer
          }
        };
      }
      return action;
    })
  );
  
  const organizedPdf = await manipulator.organize(pdfBuffer, processedActions as any);
  
  await writeBufferToFile(outputPath, organizedPdf);
  return outputPath;
};
