const manipulator = require('@pdfme/manipulator');
const { readFileAsBuffer, writeBufferToFile } = require('./fileUtils');

/**
 * Merge multiple PDFs into one
 */
const merge = async (params) => {
  const { paths, outputPath } = params;

  const pdfBuffers = await Promise.all(paths.map(path => readFileAsBuffer(path)));
  const mergedPdf = await manipulator.merge(pdfBuffers);
  
  await writeBufferToFile(outputPath, mergedPdf);
  return outputPath;
};

/**
 * Split a PDF into multiple PDFs based on page ranges
 */
const split = async (params) => {
  const { path, ranges, outputPattern } = params;

  const pdfBuffer = await readFileAsBuffer(path);
  const splitPdfs = await manipulator.split(pdfBuffer, ranges);
  
  const outputPaths = [];
  
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
const remove = async (params) => {
  const { path, pages, outputPath } = params;

  const pdfBuffer = await readFileAsBuffer(path);
  const newPdf = await manipulator.remove(pdfBuffer, pages);
  
  await writeBufferToFile(outputPath, newPdf);
  return outputPath;
};

/**
 * Rotate pages in a PDF
 */
const rotate = async (params) => {
  const { path, degrees, pages, outputPath } = params;

  const pdfBuffer = await readFileAsBuffer(path);
  const rotatedPdf = await manipulator.rotate(pdfBuffer, degrees, pages);
  
  await writeBufferToFile(outputPath, rotatedPdf);
  return outputPath;
};

/**
 * Perform multiple operations on a PDF
 */
const organize = async (params) => {
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
  
  const organizedPdf = await manipulator.organize(pdfBuffer, processedActions);
  
  await writeBufferToFile(outputPath, organizedPdf);
  return outputPath;
};

module.exports = {
  merge,
  split,
  remove,
  rotate,
  organize
};
