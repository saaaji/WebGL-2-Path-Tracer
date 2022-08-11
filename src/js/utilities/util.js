import { DisplayConsole } from './Console.js';

export const GL_CTX = document.createElement('canvas').getContext('webgl2');

// misc. utility functions
export const clamp = (n, min = -Infinity, max = Infinity) => Math.min(max, Math.max(min, n));

export const canvasToBlob = (canvas, mimeType = 'image/png', quality = 0.92) => new Promise(resolve => {
  canvas.toBlob(blob => resolve(blob), mimeType, quality);
});

export const createEnum = (...values) => Object.fromEntries(values.map(val => [val, Symbol(val)]));

// image (de)serialization
export const blobToImage = blob => new Promise(resolve => {
  const image = new Image();
  const url = URL.createObjectURL(blob);
  
  image.src = url;
  image.onload = () => resolve(image);
});

export const bufferToImage = buffer => blobToImage(new Blob([buffer]));

export const loadImage = src => new Promise(resolve => {
  const image = new Image();
  
  image.src = src;
  image.onload = () => resolve(image);
});

export function assert(boolean, message = 'assertion failed') {
  if (!boolean) {
    DisplayConsole.getDefault().fatalError(message);
    // throw new Error(message);
  }
}

export function chunkArray(a, size) {
  const dst = [];
  
  for(var i = 0; i < a.length; i += size) {
    dst.push(a.slice(i, i + size));
  }
  
  return dst;
}

// Uniform buffer utilities
export class UboBuilder {
  #byteOffset;
  #buffer;
  #view;
  
  constructor(byteLength) {
    this.#byteOffset = 0;
    this.#buffer = new ArrayBuffer(byteLength);
    this.#view = new DataView(this.#buffer);
  }
  
  #align(alignment) {
    while (this.#byteOffset % alignment !== 0) {
      this.#byteOffset += UboBuilder.SCALAR_SIZE;
    }
  }
  
  beginStruct() {
    this.#align(4 * UboBuilder.SCALAR_SIZE);
  }
  
  beginArrayElem() {
    this.#align(4 * UboBuilder.SCALAR_SIZE);
  }
  
  pushFloats(...vec) {
    const alignment = UboBuilder.getAlignment(vec);
    this.#align(alignment);
    
    for (const component of vec) {
      this.#view.setFloat32(this.#byteOffset, component, true);
      this.#byteOffset += UboBuilder.SCALAR_SIZE;
    }
  }
  
  pushInts(...vec) {
    const alignment = UboBuilder.getAlignment(vec);
    this.#align(alignment);
    
    for (const component of vec) {
      this.#view.setInt32(this.#byteOffset, component, true);
      this.#byteOffset += UboBuilder.SCALAR_SIZE;
    }
  }
  
  pushUints(...vec) {
    const alignment = UboBuilder.getAlignment(vec);
    this.#align(alignment);
    
    for (const component of vec) {
      this.#view.setUint32(this.#byteOffset, component, true);
      this.#byteOffset += UboBuilder.SCALAR_SIZE;
    }
  }
  
  get rawBuffer() {
    return this.#buffer;
  }
  
  static SCALAR_SIZE = Float32Array.BYTES_PER_ELEMENT;
  
  static getAlignment(vec) {
    return vec.length !== 3
      ? this.SCALAR_SIZE * vec.length
      : this.SCALAR_SIZE * 4;
  }
}