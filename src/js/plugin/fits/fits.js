import { Node } from '../../utilities/SceneGraphNode.js';
import { ActiveNodeEditor } from '../../utilities/ActiveNodeEditor.js';
import { EventTarget, assert, canvasToBlob } from '../../utilities/util.js';
import { DisplayConsole } from '../../utilities/Console.js';
export { Node } from '../../utilities/SceneGraphNode.js';

const find = cmp => arr => {
  let candidate = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (cmp(arr[i], candidate)) {
      candidate = arr[i];
    }
  }
  return candidate;
}

const findMin = find((cur, min) => cur < min);
const findMax = find((cur, max) => cur > max);

export class Histogram extends EventTarget {
  constructor(hist) {
    super();
    this.repr = [...hist];
    this.maxFreq = findMax(this.repr);
  }
  
  get data() {
    return this.repr;
  }
  
  set data(hist) {
    this.repr = [...hist];
    this.maxFreq = findMax(this.repr);
    
    this.dispatchEvent('update');
  }
  
  static calcRaw(numBins, data, min, max, excludeZeros = true) {
    const binSize = (max - min) / numBins;
    const hist = new Array(numBins).fill(0);
    
    for (let i = 0; i < data.length; i++) {
      if (excludeZeros && data[i] <= 0) {
        continue;
      }
      
      for (let j = 0; j < numBins; j++) {
        if (data[i] >= j*binSize && data[i] < j*binSize+binSize) {
          hist[j]++;
        }
      }
    }
    
    return new Histogram(hist);
  }
  
  calcRaw(numBins, data, min, max, excludeZeros = true) {
    const binSize = (max - min) / numBins;
    this.repr.fill(0);
    
    for (let i = 0; i < data.length; i++) {
      if (excludeZeros && data[i] <= 0) {
        continue;
      }
      
      for (let j = 0; j < numBins; j++) {
        if (data[i] >= j*binSize && data[i] < j*binSize+binSize) {
          this.repr[j]++;
        }
      }
    }
    
    console.log(excludeZeros);
    
    this.maxFreq = findMax(this.repr);
    
    this.dispatchEvent('update');
  }
  
  get fmtStr() {
    return hist.map((f, v) => `${v/histBins}\t${f}`).join('\n');
  }
  
  toImage(title, width, height, color = '#2ba1ff') {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = window.devicePixelRatio * width;
    canvas.height = window.devicePixelRatio * height;
    
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    
    ctx.fillStyle = '#272727';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const margin = 10;
    const graphPadding = 5;
    
    const fontSize = 20;
    const tickWidth = 50;
    const tickLen = 10;
    
    const realWidth = canvas.width - 2 * (margin + graphPadding);
    const realHeight = canvas.height - 4*margin - 2*graphPadding - fontSize - tickWidth;
    
    const originX = graphPadding + margin;
    const originY = canvas.height - graphPadding - 2*margin - tickWidth;
    
    const binWidth = realWidth / this.repr.length;
    
    // ticks
    ctx.strokeStyle = '#EEEEEE';
    ctx.fillStyle = '#EEEEEE';
    ctx.lineWidth = 2;
    ctx.font = `${Math.round(0.9 * fontSize)}px Roboto Mono`;
    for (let i = 0; i < this.repr.length; i++) {
      if (i % 3 === 0) {
        const x = originX + Math.round(realWidth * (i / this.repr.length));
        const y = canvas.height - 2*margin - tickWidth;
        
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-tickLen, 0);
        ctx.stroke();
        ctx.fillText((i / this.repr.length).toFixed(2), +5, 0, tickWidth);
        ctx.restore();
      }
    }
    
    // histogram
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    for (let i = 0; i < this.repr.length; i++) {
      const x = originX + Math.round(realWidth * (i / this.repr.length));
      const y = originY - Math.round(realHeight * (this.repr[i] / this.maxFreq));
      
      if (i > 0) {
        ctx.lineTo(x, y);
        ctx.lineTo(x + binWidth, y);
      } else {
        ctx.moveTo(x, y);
        ctx.lineTo(x + binWidth, y);
      }
    }
    ctx.stroke();
    
    // title
    ctx.fillStyle = '#EEEEEE';
    ctx.font = `${fontSize}px Roboto`;
    ctx.fillText(title, margin, margin + fontSize, canvas.width - 2 * margin);
    
    // axes
    ctx.strokeStyle = '#EEEEEE';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(margin, 2 * margin + fontSize);
    ctx.lineTo(margin, canvas.height - 2 * margin - tickWidth);
    ctx.lineTo(canvas.width - margin, canvas.height - 2 * margin - tickWidth);
    ctx.stroke();
    
    return canvas;
  }
  
  getCumulative() {
    let integral = 0;
    const hist = new Array(this.repr.length);
    
    for (let i = 0; i < this.repr.length; i++) {
      integral += this.repr[i];
      hist[i] = integral;
    }
    
    return hist;
  }
  
  *[ActiveNodeEditor.createCustomDOM](mutable, displayName, updateCallback) {
    const row = document.createElement('div');
    
    row.classList.add('ui-content-row', 'image');
    row.appendChild(this.toImage(displayName, 256 * 1.5, 256));
    
    this.addEventListener('update', () => {
      row.lastChild.remove();
      row.appendChild(this.toImage(displayName, 256 * 1.5, 256));
    });
    
    yield row;
  }
}

export class Fits extends Node {
  static [ActiveNodeEditor.editableProperties] = [
    {prop: 'name', mutable: false, displayName: 'Name'},
    {prop: 'type', mutable: false},
    {prop: 'bitDepth', mutable: false, displayName: 'BITPIX', mono: true},
    {prop: 'dataMin', mutable: false, displayName: 'DATAMIN', mono: true},
    {prop: 'dataMax', mutable: false, displayName: 'DATAMAX', mono: true},
    {prop: 'dimensions', mutable: false, displayName: 'NAXIS', mono: true},
    {prop: 'bZero', mutable: false, displayName: 'BZERO', mono: true},
    {prop: 'bScale', mutable: false, displayName: 'BSCALE', mono: true},
    {prop: 'width', mutable: false},
    {prop: 'height', mutable: false},
    {prop: 'channel', mutable: true, triggerUpdate: true, displayName: 'Assigned Channel'},
    {prop: 'statistics.rawHistogram', mutable: false, bubble: true, displayName: 'Unstretched Histogram'},
    {prop: 'statistics.stretchedHistogram', mutable: false, bubble: true, displayName: 'Stretched Histogram'},
    {prop: 'statistics.cumulativeHistogram', mutable: false, bubble: true, displayName: 'Cumulative Histogram'},
    {prop: 'transferFunc.black', mutable: true, triggerUpdate: true, mono: true},
    {prop: 'transferFunc.white', mutable: true, triggerUpdate: true, mono: true},
    {prop: 'transferFunc.gamma', mutable: true, triggerUpdate: true, mono: true},
    {prop: 'filters.offsetX', mutable: true, triggerUpdate: true, mono: true},
    {prop: 'filters.offsetY', mutable: true, triggerUpdate: true, mono: true},
    {prop: 'statistics.suppressZeros', mutable: true, triggerUpdate: true, displayName: 'Suppress Zeros'},
    {prop: 'filters.hide', mutable: true, triggerUpdate: true, displayName: 'Hide'},
  ];
  
  static channel = 0;
  
  rawData = null;
  coercedData = null;
  axes = [];
  channel = 0;
  
  bZero = 0;
  bScale = 1;
  
  filters = {
    hide: true,
    offsetX: 0,
    offsetY: 0,
  }
  
  transferFunc = {
    black: 0,
    white: 1,
    gamma: 1,
  };
  
  statistics = {
    histTexSize: 6,
    suppressZeros: true,
  };
  
  get width() {
    return this.axes[0] ?? 0;
  }
  
  get height() {
    return this.axes[1] ?? 0;
  }
  
  constructor(name, buffer) {
    super();
    this.name = name;
    
    const decoder = new TextDecoder();
    
    // parse header unit (80-character records padded to 2880 bytes)
    let byteOffset = 0;
    for (let headerUnit = ''; !headerUnit.startsWith('END'); byteOffset += 80) {
      headerUnit = decoder.decode(buffer.slice(byteOffset, byteOffset + 80));
      
      // discard comments
      const [key, value = null] = headerUnit
        .split('/')
        .at(0)
        .trim() // trim comments
        .split(/\s*=\s*/); // isolate key/value pairs
      
      switch (key) {
        case 'XTENSION':
          DisplayConsole.getDefault().fatalError(`FITS plugin: unable to parse extension ('XTENSION')`);
        case 'SIMPLE':
          assert(value === 'T', `FITS plugin: SIMPLE field must contain value 'T'`);
          break;
        case 'BITPIX':
          const type = value < 0 ? 'Float' : 'Int';
          const bitDepth = Math.abs(parseInt(value));
          const unsigned = bitDepth == 8;
          
          this.bitDepth = bitDepth;
          this.type = (unsigned ? 'U' : '') + (unsigned ? type.toLowerCase() : type) + bitDepth;
          break;
        case 'BZERO':
          this.bZero = parseFloat(value);
          break;
        case 'BSCALE':
          this.bScale = parseFloat(value);
          break;
        default:
          if (key === 'NAXIS') {
            this.dimensions = parseInt(value);
            this.axes.length = this.dimensions;
            assert(this.dimensions === 2, 'FITS plugin: unable to process N-dimensionsal image');
          } else if (key.startsWith('NAXIS')) {
            // axes are 1-indexed, subtract 1
            const axis = parseInt(key.slice('NAXIS'.length)) - 1;
            this.axes[axis] = parseInt(value);
          }
      }
    }
    
    // skip padding (round to next multiple of 2880)
    byteOffset = 2880 * Math.ceil(byteOffset / 2880);
    
    // bytes-per-pixel
    const bpp = this.bitDepth / 8;
    const dataLen = this.axes.reduce((acc, cur) => acc * cur, 1);
    const dataSize = bpp * dataLen;
    
    this.rawData = new Float32Array(dataLen);
    const reader = new DataView(buffer.slice(byteOffset, byteOffset + dataSize));
    
    for (let i = 0; i < dataLen; i++) {
      // big endian
      const arrayValue = reader['get' + this.type](i * bpp, false);
      
      // spec: physical_value = BZERO + BSCALE * array_value
      this.rawData[i] = this.bZero + this.bScale * arrayValue;
    }
    
    // find min/max
    this.dataMin = findMin(this.rawData);
    this.dataMax = findMax(this.rawData);
    
    this.statistics.rawHistogram = Histogram.calcRaw(this.statistics.histTexSize**2, this.rawData, this.dataMin, this.dataMax);
    this.statistics.stretchedHistogram = new Histogram(this.statistics.rawHistogram.data);
    this.statistics.cumulativeHistogram = new Histogram(this.statistics.stretchedHistogram.getCumulative());
  }
  
  serialize() {
    return {
      name: this.name,
      filters: this.filters,
      transferFunc: this.transferFunc,
    };
  }
}