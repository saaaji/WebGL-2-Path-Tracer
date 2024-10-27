import { DisplayConsole } from './Console.js';

export const GL_CTX = document.createElement('canvas').getContext('webgl2');

// misc. utility functions
export function* enumerate(iterable) {
  const iter = iterable[Symbol.iterator]();
  let item = iter.next();
  let index = 0;

  while (!item.done) {
    yield [item.value, index++];
    item = iter.next();
  }
}

export function* zip(...arrays) {
  const iters = arrays
    .map(array => array[Symbol.iterator]())
  let items = iters.map(iter => iter.next());

  while (items.every(item => !item.done)) {
    yield items.map(item => item.value);
    items = iters.map(iter => iter.next());
  }
}

export const lowQualityId = () => Math
  .random()
  .toString(36)
  .substr(2, 9)
  .toUpperCase();

export const clamp = (n, min = -Infinity, max = Infinity) => Math.min(max, Math.max(min, n));

export const canvasToBlob = (canvas, mimeType = 'image/png', quality = 1) => new Promise(resolve => {
  canvas.toBlob(blob => resolve(blob), mimeType, quality);
});

export const jsonToBlob = json => new Blob(
  [new TextEncoder().encode(json)], 
  {
    type: 'application/json;charset=utf-8'
  }
);

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
    DisplayConsole.getDefault()?.fatalError(message);
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

export function generateUv(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const u = (clientX - rect.left) / canvas.width;
  const v = (rect.bottom - clientY) / canvas.height;
  return [u, v];
}

export class EventTarget {
  #listeners = new Map();
  
  addEventListener(name, listener) {
    if (!this.#listeners.has(name)) {
      this.#listeners.set(name, new Set());
    }
    
    this.#listeners.get(name).add(listener);
  }
  
  removeEventListener(name, listener) {
    this.#listeners.get(name)?.delete(listener);
    
    if (this.#listeners.get(name)?.size === 0) {
      this.#listeners.delete(name);
    }
  }
  
  dispatchEvent(name, data = null) {
    this.#listeners.get(name)?.forEach(listener => listener.call(this, data));
  }
}