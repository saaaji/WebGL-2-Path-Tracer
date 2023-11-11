import { enumerate, zip } from '../util.js';
import { Matrix4 } from '../../math/Matrix4.js';

// Uniform buffer utilities
export class SequentialUboBuilder {
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
      this.#byteOffset += this.constructor.SCALAR_SIZE;
    }
  }
  
  beginStruct() {
    this.#align(4 * this.constructor.SCALAR_SIZE);
  }
  
  beginArrayElem() {
    this.#align(4 * this.constructor.SCALAR_SIZE);
  }
  
  pushFloats(...vec) {
    const alignment = this.constructor.getAlignment(vec);
    this.#align(alignment);
    
    for (const component of vec) {
      this.#view.setFloat32(this.#byteOffset, component, true);
      this.#byteOffset += this.constructor.SCALAR_SIZE;
    }
  }
  
  pushInts(...vec) {
    const alignment = this.constructor.getAlignment(vec);
    this.#align(alignment);
    
    for (const component of vec) {
      this.#view.setInt32(this.#byteOffset, component, true);
      this.#byteOffset += this.constructor.SCALAR_SIZE;
    }
  }
  
  pushUints(...vec) {
    const alignment = this.constructor.getAlignment(vec);
    this.#align(alignment);
    
    for (const component of vec) {
      this.#view.setUint32(this.#byteOffset, component, true);
      this.#byteOffset += this.constructor.SCALAR_SIZE;
    }
  }
  
  get rawBuffer() {
    return this.#buffer;
  }
  
  static SCALAR_SIZE = Float32Array.BYTES_PER_ELEMENT;
  
  static getAlignment(vec, half = false) {
    const divisor = half ? 2 : 1;

    return vec.length !== 3
      ? (this.SCALAR_SIZE / divisor) * vec.length
      : (this.SCALAR_SIZE / divisor) * 4;
  }
}

const [floatBytes, intBytes, uintBytes] = (function() {
  const buffer = new ArrayBuffer(4);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  function* iterBytes(bytes, len) {
    for (let i = 0; i < len; i++) {
      yield bytes[i];
    }
  };

  return [
    function*(f32) {
      view.setFloat32(0, f32, true);
      yield* iterBytes(bytes, 4);
    },
    function*(i32) {
      view.setInt32(0, i32, true);
      yield* iterBytes(bytes, 4);
    },
    function*(u32) {
      view.setUint32(0, u32, true);
      yield* iterBytes(bytes, 4);
    },
  ];
})();

// better for wgpu alignments (growable vector)
export class DynamicBuffer {
  static GROW_FACTOR = 2;
  
  #capacity;
  #buffer;
  #bytes;
  #writeIndex = 0;

  constructor(initialCapacity) {
    this.#capacity = initialCapacity;
    this.#buffer = new ArrayBuffer(this.#capacity);
    this.#bytes = new Uint8Array(this.#buffer);
  }

  #grow() {
    const tmp = this.#bytes;
    this.#capacity *= this.constructor.GROW_FACTOR;
    this.#buffer = new ArrayBuffer(this.#capacity);
    this.#bytes = new Uint8Array(this.#buffer);

    // copy bytes
    this.#bytes.set(tmp, 0);
  }

  pushByte(byte) {
    if (this.#writeIndex >= this.#capacity) {
      this.#grow();
    }
    
    this.#bytes[this.#writeIndex++] = byte;
  }

  get size() {
    return this.#writeIndex;
  }
}

export class HalfFloat {
  #value;
  
  constructor(value = 0) {
    this.#value = value;
  }

  get isHalf() {
    return true;
  }

  get value() {
    return this.#value;
  }

  set value(v) { 
    this.#value = v;
  }
}

export class ScalarArray {
  #array;

  constructor(array) {
    this.#array = array;
  }

  get isScalarArray() {
    return true;
  }

  get array() {
    return this.#array;
  }
}

// https://www.w3.org/TR/WGSL/#memory-layouts
function wgslAlignOf(t) {
  if (t.isHalf) { // f16
    return 2;
  } else if (typeof t === 'number') { // f32, i32, u32
    return 4;
  } else if ( // vecN<f16/f32/i32/u32>
    t.isVector || 
    (Array.isArray(t) && t.length >= 2 && t.length <= 4 && t.every(e => typeof e === 'number' || e.isHalf))
  ) { 
    return t.length === 3
      ? 4 * wgslAlignOf(t[0])
      : t.length * wgslAlignOf(t[0]);
  } else if (t.isMatrix) { // mat4x4<f32>
    return 16;
  } else if (typeof t === 'object' && !t.isScalarArray)  { // struct
    return Math.max(...Object.values(t).map(value => wgslAlignOf(value)));
  } else if (Array.isArray(t) || t.isScalarArray) { // array
    return wgslAlignOf(t.array?.at(0) ?? t.at(0));
  }

  return 0; // invalid
}

function wgslSizeOf(t) {
  if (t.isHalf) { // f16
    return 2;
  } else if (typeof t === 'number') { // f32, i32, u32
    return 4;
  } else if (
    t.isVector || 
    (Array.isArray(t) && t.length >= 2 && t.length <= 4 && t.every(e => typeof e === 'number' || e.isHalf))
  ) { // vecN<f16/f32/i32/u32>
    const e = t[0];
    return t.length * wgslSizeOf(e);
  } else if (t.isMatrix) { // mat4x4<f32>
    return 64;
  } else if (typeof t === 'object' && !t.isScalarArray)  { // struct
    const members = Object.values(t);
    const n = members.length - 1;
    const justPastLastMember = wgslOffsetOfMember(members, n) + wgslSizeOf(members[n]);
    return wgslRoundUp(wgslAlignOf(t), justPastLastMember);
  } else if (Array.isArray(t) || t.isScalarArray) { // array
    const e = t.array?.at(0) ?? t.at(0);
    const n = t.array?.length ?? t.length;
    return n * wgslRoundUp(wgslAlignOf(e), wgslSizeOf(e));
  }

  return 0; // invalid
}

function wgslOffsetOfMember(members, i) {
  if (i == 0) {
    return 0;
  } else {
    return wgslRoundUp(wgslAlignOf(members[i]), wgslOffsetOfMember(members, i-1) + wgslSizeOf(members[i-1]));
  }
}

function wgslRoundUp(k, n) {
  return Math.ceil(n / k) * k;
}

export function buildRuleBasedGpuBuffer(struct, genReport = false) {
  const buffer = new DynamicBuffer(1024);
  const names = Object.keys(struct);
  const members = Object.values(struct);
  const layout = new Array(wgslSizeOf(struct) / 4).fill('pad');

  for (const [[name, member], i] of enumerate(zip(names, members))) {
    const sz = wgslSizeOf(member) / 4;
    const o = wgslOffsetOfMember(members, i) / 4;

    console.log(name, o, sz);

    for (let j = o; j < o+sz; j++) layout[j] = name;
  }

  names.sort((a, b) => b.length - a.length);
  const len = names[0].length;
  const padding = 1;  

  let debugStr = '|_WGPU_MMAP'.padEnd(8 + 4*(len + 2*padding), '_') + '|\n';
  for (let i = 0; i < layout.length; i++) {
    if (i % 4 == 0) {
      debugStr += `|${(i * 4).toString().padEnd(3, ' ')}`;
    }

    debugStr += '|' + ' '.repeat(padding) + layout[i].padEnd(len + padding, ' ');
    
    if ((i+1) % 4 == 0) {
      debugStr += '|\n';
    }
  }
  
  console.log(debugStr);
}