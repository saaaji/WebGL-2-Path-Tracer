import { assert } from '../utilities/util.js';

const NEWLINE = '\n'.charCodeAt(0);
const IDENTIFIER = '#?RADIANCE';
const VARIABLE_DECLARATION = /(.+)=(.+)/;
const RESOLUTION = /-Y ([0-9]+) \+X ([0-9]+)/;

export class HdrLoader {
  // parse input HDR file
  async parse(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const decoder = new TextDecoder();
    
    // parse information header
    let start = 0;
    let end = 0;
    while (bytes[end++] !== undefined)
      if (bytes[end] === NEWLINE && bytes[end + 1] === NEWLINE)
        break;
    
    const informationHeader = decoder.decode(buffer.slice(start, end));
    const [identifier, ...variableDeclarations] = informationHeader.split('\n');
    
    assert(identifier === IDENTIFIER, `invalid HDR identifier '${identifier}': expected '${IDENTIFIER}'`);
    
    for (const variableDeclaration of variableDeclarations) {
      if (VARIABLE_DECLARATION.test(variableDeclaration)) {
        const [, name, value] = variableDeclaration.match(/(.+)=(.+)/);
        
        switch (name) {
          case 'FORMAT':
            assert(value === '32-bit_rle_rgbe', `unsupported HDR format '${value}': expected '32-bit_rle_rgbe'`);
        }
      }
    }
    
    // parse resolution string
    start = end += 2;
    while (bytes[end++] !== undefined)
      if (bytes[end] === NEWLINE)
        break;
    
    const resolutionString = decoder.decode(buffer.slice(start, end));
    
    assert(RESOLUTION.test(resolutionString), `unsupported HDR resolution '${resolutionString}'`);
    
    let [, height, width] = resolutionString.match(RESOLUTION);
    
    width = parseInt(width);
    height = parseInt(height);
    
    // read HDR values
    const view = new DataView(buffer, end + 1);
    const record = new Uint8Array(width * 4);
    const hdrData = new Float32Array(width * height * 3);
    
    let srcOffset = 0;
    let dstOffset = 0;
    
    for (let i = 0; i < height; i++) {
      assert(view.getUint8(srcOffset++) === 2 && view.getUint8(srcOffset++) === 2, 'unsupported scanline format: expected two bytes equal to 2');
      assert(view.getInt16(srcOffset) === width, 'scanline width does not match image width');
      
      srcOffset += 2;
      
      let total = 0;
      let locOffset = 0;
  
      while (total < width * 4) {
        let count = view.getUint8(srcOffset++);
        
        if (count > 128) {
          const value = view.getUint8(srcOffset++);
          
          count = count - 128;
          for (let j = 0; j < count; j++) {
            record[locOffset++] = value;
          }
        } else {
          for (let j = 0; j < count; j++) {
            const value = view.getUint8(srcOffset++);
            record[locOffset++] = value;
          }
        }
        
        total += count;
      }
      
      // convert to RGB
      for (let j = 0; j < width; j++) {
        const exponent = record[j + width * 3];
        // const scale = Math.pow(2, exponent * 255 - 136);
        const scale = Math.pow(2, exponent - 136);
        
        for (let k = 0; k < 3; k++) {
          hdrData[dstOffset + k] = (record[j + width * k] + 0.5) * scale;
        }
        
        dstOffset += 3;
      }
    }
    
    return {
      width,
      height,
      data: hdrData,
    };
  }
}

// HDR Utilities
export function computeHdrSamplingDistributions(width, height, data) {
  const conditionalCdfArray = [];
  const conditionalPdfArray = [];
  const marginalCdf = new Float32Array(height);
  const marginalPdf = new Float32Array(height);
  const marginalDistribution = new Float32Array(height * 2);
  const conditionalDistribution = new Float32Array(width * height * 2);
  
  let colIntegral = 0;
  for (let j = 0; j < height; j++) {
    const conditionalCdf = new Float32Array(width);
    const conditionalPdf = new Float32Array(width);
    
    conditionalCdfArray.push(conditionalCdf);
    conditionalPdfArray.push(conditionalPdf);
    
    let rowIntegral = 0;
    for (let i = 0; i < width; i++) {
      const brightness = brightnessHeuristic(data, j * width + i);
      rowIntegral += brightness;
      conditionalPdf[i] = brightness;
      conditionalCdf[i] = rowIntegral;
    }
    
    for (let i = 0; i < width; i++) {
      conditionalPdf[i] /= rowIntegral;
      conditionalCdf[i] /= rowIntegral;
    }
    
    colIntegral += rowIntegral;
    
    marginalPdf[j] = rowIntegral;
    marginalCdf[j] = colIntegral;
  }
  
  for (let j = 0; j < height; j++) {
    marginalPdf[j] /= colIntegral;
    marginalCdf[j] /= colIntegral;
  }
  
  for (let j = 0; j < height; j++) {
    const v = (j + 1) / height;
    const rowIndex = upperBound(marginalCdf, v);
    
    marginalDistribution[j * 2 + 0] = rowIndex / height;
    marginalDistribution[j * 2 + 1] = marginalPdf[j];
  }
  
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const u = (i + 1) / width;
      const colIndex = upperBound(conditionalCdfArray[j], u);
      
      const index = j * width + i;
      conditionalDistribution[index * 2 + 0] = colIndex / width;
      conditionalDistribution[index * 2 + 1] = conditionalPdfArray[j][i];
    }
  }
  
  return { marginalDistribution, conditionalDistribution };
}

function brightnessHeuristic(data, index) {
  const r = data[index * 3 + 0];
  const g = data[index * 3 + 1];
  const b = data[index * 3 + 2];
  
  return r * 0.3 + g * 0.6 + b * 0.1;
}

function upperBound(array, value, start = 0, end = array.length - 1) {
  let low = start;
  let high = end;
  
  while (low < high) {
    const mid = Math.floor(low + (high - low) / 2);
    
    if (array[mid] < value) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  
  return low;
}