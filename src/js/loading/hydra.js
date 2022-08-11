import { GlbLoader } from './GlbLoader.js';
import { Triangle } from '../utilities/primitives.js';
import { BinaryBVH } from '../accel/BVHNode.js';
import { TextureAtlasBuilder } from '../utilities/TextureAtlasBuilder.js';
import { GL_CTX, UboBuilder, assert, createEnum } from '../utilities/util.js';

const hex = n => '0x' + n.toString(16).toUpperCase();

const MAGIC = createMagic('HYDRA');
const JSON_MAGIC = createMagic('JSON');
const BIN_MAGIC = createMagic('BIN');
const LITTLE_ENDIAN = true;

const HEADER_SIZE = 8;
const VERSION = 10;
const TEXTURE_ATLAS_SIZE = 2048;

export const NUM_LIGHTS = 33;
export const NUM_MATERIALS = 32;
export const NUM_TEXTURES = 32;
export const NUM_BLAS = 32;

// bytes
const SIZEOF_LIGHT = 16;
const SIZEOF_MATERIAL = 48;
const SIZEOF_TEXTURE = 32;

const DataType = createEnum(
  'Float16',
  'Float32',
  'Int32',
  'Uint32',
);

class BufferViewManager {
  constructor() {
    this.bufferViews = [];
    this.blobs = [];
    this.currentOffset = 0;
  }
  
  get size() {
    return this.blobs.reduce((totalSize, blob) => totalSize + blob.size, 0);
  }
  
  addBufferView(blob) {
    this.blobs.push(blob);
    this.bufferViews.push({
      offset: this.currentOffset,
      length: blob.size,
    });
    
    this.currentOffset += blob.size;
    return this.bufferViews.length - 1;
  }
}

// create binary .hydra asset
export async function encodeHydra(fileList) {
  const file = fileList.item(0);
  const loader = new GlbLoader();
  const state = new BufferViewManager();
  
  const {
    images,
    materials,
    emissivePrimitives: lights,
    meshDescriptors,
    indices,
    vertexAttribs,
    root,
  } = await loader.parse(file);
  
  // encode texture data
  const dataTextures = createDataTextureBuffer([
    {name: 'FACE',     dataType: DataType.Int32,    numComponents: 3, data: indices},
    {name: 'VERTEX',   dataType: DataType.Float32,  numComponents: 3, data: vertexAttribs.position},
    {name: 'NORMAL',   dataType: DataType.Float32,  numComponents: 3, data: vertexAttribs.normal},
    {name: 'TEXCOORD', dataType: DataType.Float32,  numComponents: 2, data: vertexAttribs.texCoord0},
    {name: 'MATERIAL', dataType: DataType.Int32,    numComponents: 1, data: vertexAttribs.materials},
  ], state);
  
  const textureDescriptors = [];
  const atlas = await createTextureAtlas(images, textureDescriptors, state);
  
  const uniformBuffers = createUniformBuffers([
    {
      name: 'Materials',
      capacity: NUM_MATERIALS * SIZEOF_MATERIAL,
      populate: builder => {
        for (const {emissiveFactor, baseColorFactor, metallicFactor, roughnessFactor, baseColorTexture, metallicRoughnessTexture} of materials) {
          builder.beginStruct();
          builder.pushFloats(...emissiveFactor);
          builder.pushFloats(...baseColorFactor);
          builder.pushFloats(metallicFactor);
          builder.pushFloats(roughnessFactor);
          builder.pushInts(baseColorTexture);
          builder.pushInts(metallicRoughnessTexture);
        }
      },
    },
    {
      name: 'TextureDescriptors',
      capacity: NUM_TEXTURES * SIZEOF_TEXTURE,
      populate: builder => {
        for (const {section, x, y, width, height} of textureDescriptors) {
          builder.beginStruct();
          builder.pushFloats(section);
          builder.pushFloats(x, y);
          builder.pushFloats(width, height);
        }
      },
    },
    {
      name: 'Lights',
      capacity: NUM_LIGHTS * SIZEOF_LIGHT,
      populate: builder => {
        builder.pushInts(lights.length);
        
        for (const {id, blasIndex} of lights) {
          builder.beginStruct();
          builder.pushInts(id);
          builder.pushInts(blasIndex);
        }
      },
    },
  ], state);
  
  const objectAccelStructs = createObjectAccelStructs(meshDescriptors, vertexAttribs, indices, state);
  
  // create JSON buffer data
  const json = JSON.stringify({
    bufferViews: state.bufferViews,
    uniformBuffers,
    dataTextures,
    atlas,
    meshDescriptors,
    objectAccelStructs,
    tree: root.serialize(),
  });
  
  const jsonBuffer = new TextEncoder().encode(json);
  
  /**
   * pack data into binary blob
   * order: primary header, JSON header, JSON buffer, BIN header, BIN buffer
   */
  const blob = new Blob([
    createHeader(MAGIC, VERSION),
    createHeader(JSON_MAGIC, jsonBuffer.byteLength),
    jsonBuffer,
    createHeader(BIN_MAGIC, state.size),
    ...state.blobs,
  ], {type: 'application/octet-stream'});
  
  return blob;
}

function createDataTextureBuffer(dataTextureInfo, state) {
  const descriptors = [];
  const buffers = [];
  let currentOffset = 0;
  
  for (const {name, data, numComponents, dataType} of dataTextureInfo) {
    const {type, format, internalFormat} = getTextureFormatting(dataType, numComponents);
    const typedArray = getTypedArrayConstructor(dataType);
    
    const size = Math.ceil(Math.sqrt(data.length / numComponents));
    const buffer = new typedArray(size ** 2 * numComponents);
    buffer.set(data);
    buffers.push(buffer);
    
    descriptors.push({
      name,
      type,
      format,
      internalFormat,
      numComponents,
      width: size,
      height: size,
      offset: currentOffset,
    });
    
    currentOffset += buffer.byteLength;
  }
  
  return {
    descriptors,
    bufferView: state.addBufferView(new Blob(buffers)),
  };
}

async function createTextureAtlas(images, textureDescriptors, state) {
  const atlasBuilder = new TextureAtlasBuilder(TEXTURE_ATLAS_SIZE, TEXTURE_ATLAS_SIZE);
  for (const image of images) {
    const textureDescriptor = atlasBuilder.insertImage(image);
    textureDescriptors.push(textureDescriptor);
  }
  
  const blob = await atlasBuilder.buildAtlas();
  
  return {
    bufferView: state.addBufferView(blob),
    mimeType: blob.type,
    size: {
      width: atlasBuilder.sectionWidth,
      height: atlasBuilder.sectionHeight,
      depth: atlasBuilder.sections.length,
    },
  };
}

function createUniformBuffers(bufferDescriptors, state) {
  const uniformBuffers = [];
  
  for (const {name, capacity, populate} of bufferDescriptors) {
    const builder = new UboBuilder(capacity);
    populate(builder);
    
    const blob = new Blob([builder.rawBuffer]);
    
    uniformBuffers.push({
      name,
      bufferView: state.addBufferView(blob),
    });
  }
  
  return uniformBuffers;
}

function createObjectAccelStructs(meshDescriptors, vertexAttribs, indices, state) {
  const objectAccelStructs = [];
  
  for (const {meshIndex, start, count} of meshDescriptors) {
    // build triangle list
    const triangles = [];
    const triStartIndex = start / 3;
    const triEndIndex = (start + count) / 3;
    
    for (let i = triStartIndex; i < triEndIndex; i++) {
      triangles.push(new Triangle(i, indices, vertexAttribs.position));
    }
    
    // build and serialize static hierarchy
    const accelStruct = new BinaryBVH(triangles);
    const data = new Blob([accelStruct._serialize()]);
    
    objectAccelStructs.push({
      meshIndex,
      bufferView: state.addBufferView(data),
    });
  }
  
  return objectAccelStructs;
}

function createHeader(magic, n) {
  const header = new DataView(new ArrayBuffer(HEADER_SIZE));
  header.setUint32(0, magic, true);
  header.setUint32(4, n, true);
  return header;
}

function createMagic(string) {
  const magicString = string.slice(0, 4).padEnd(4, '\0');
  const bytes = new TextEncoder().encode(magicString);
  const view = new DataView(bytes.buffer);
  return view.getUint32(0, true);
}

// import binary .hydra asset
export async function decodeHydra(files) {
  const file = files.item(0);
  const buffer = await file.arrayBuffer();
  
  // read GLB header
  const header = new DataView(buffer.slice(0, HEADER_SIZE));
  const magic = header.getUint32(0, LITTLE_ENDIAN);
  const version = header.getUint32(4, LITTLE_ENDIAN);
  
  assert(magic === MAGIC, `invalid magic '${hex(magic)}': expected ${hex(MAGIC)}`);
  assert(version === VERSION, `invalid version '${version}': expected ${VERSION}`);
  
  // read JSON header
  const jsonHeader = new DataView(buffer, HEADER_SIZE, HEADER_SIZE);
  const jsonMagic = jsonHeader.getUint32(0, LITTLE_ENDIAN);
  const jsonChunkLength = jsonHeader.getUint32(4, LITTLE_ENDIAN);
  
  assert(jsonMagic === JSON_MAGIC, `invalid JSON magic '${hex(jsonMagic)}': expected ${hex(JSON_MAGIC)}`);
  
  // read binary header
  const binaryHeader = new DataView(buffer, HEADER_SIZE + HEADER_SIZE + jsonChunkLength, HEADER_SIZE);
  const binaryMagic = binaryHeader.getUint32(0, LITTLE_ENDIAN);
  const binaryChunkLength = binaryHeader.getUint32(4, LITTLE_ENDIAN);
  
  assert(binaryMagic === BIN_MAGIC, `invalid binary magic '${hex(binaryMagic)}': expected ${hex(BIN_MAGIC)}`);
  
  // read chunks
  const jsonBytes = new Uint8Array(buffer, HEADER_SIZE + HEADER_SIZE, jsonChunkLength);
  const binaryChunk = buffer.slice(HEADER_SIZE + HEADER_SIZE + jsonChunkLength + HEADER_SIZE);
  
  const jsonText = new TextDecoder().decode(jsonBytes);
  const jsonChunk = JSON.parse(jsonText);
  
  return [jsonChunk, binaryChunk];
}

function getTextureFormatting(dataType, numComponents) {
  let formatPrefix = 'RGBA'.slice(0, numComponents);
  let formatSuffix = '';
  let internalFormatPrefix = formatPrefix;
  let type, internalFormatSuffix;
  
  switch (dataType) {
    case DataType.Float16:
      internalFormatSuffix = '16F';
      type = 'HALF_FLOAT';
      break;
    case DataType.Float32:
      internalFormatSuffix = '32F';
      type = 'FLOAT';
      break;
    case DataType.Int32:
      internalFormatSuffix = '32I';
      formatSuffix = '_INTEGER';
      type = 'INT';
      
      if (numComponents === 1) {
        formatPrefix = 'RED';
      }
      break;
    case DataType.Uint32:
      internalFormatSuffix = '32UI';
      formatSuffix = '_INTEGER';
      type = 'UNSIGNED_INT';
      
      if (numComponents === 1) {
        formatPrefix = 'RED';
      }
      break;
    default:
      throw new Error(`invalid data type '${dataType}'`);
  }
  
  const format = formatPrefix + formatSuffix;
  const internalFormat = internalFormatPrefix + internalFormatSuffix;
  
  return {
    type: GL_CTX[type],
    format: GL_CTX[format],
    internalFormat: GL_CTX[internalFormat],
  };
}

function getTypedArrayConstructor(dataType) {
  switch (dataType) {
    case DataType.Float16:
      return Uint16Array;
    case DataType.Float32:
      return Float32Array;
    case DataType.Int32:
      return Int32Array;
    case DataType.Uint32:
      return Uint32Array;
    default:
      throw new Error(`invalid data type '${dataType}'`);
  }
}