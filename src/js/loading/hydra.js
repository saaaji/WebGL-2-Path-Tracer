import { BVH } from '../accel/BVHNode.js';
import { decodeGlb } from './decodeGlb.js';
import { Triangle } from '../utilities/primitives.js';
import { GL_CTX, TextureAtlasBuilder, UboBuilder, assert } from '../utilities/util.js';

const hex = n => '0x' + n.toString(16).toUpperCase();
  
const MAGIC = createMagic('HYDRA');
const JSON_MAGIC = createMagic('JSON');
const BIN_MAGIC = createMagic('BIN');
const LITTLE_ENDIAN = true;

const HEADER_SIZE = 8;
const VERSION = 7;
const TEXTURE_ATLAS_SIZE = 2048;

const DATA_TYPE = {
  float16: Symbol(),
  float32: Symbol(),
  int32: Symbol(),
};

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
  const state = new BufferViewManager();
  
  const {
    indices,
    vertices,
    texCoords,
    normals,
    materials,
    images,
    camera,
  } = await decodeGlb(fileList);
  
  // generate triangles from global vertex and face lists
  const triangles = [];
  for (let i = 0; i < indices.length / 4; i++) {
    triangles.push(new Triangle(i, indices, vertices));
  }
  
  const bvh = new BVH(triangles);
  
  // bvh.serialize_DEBUG();
  
  // encode texture data
  const dataTextures = createDataTextureBuffer([
    {name: 'ACCEL',    dataType: DATA_TYPE.float32, numComponents: 4, data: bvh.serialize()},
    {name: 'FACE',     dataType: DATA_TYPE.int32,   numComponents: 4, data: indices},
    {name: 'VERTEX',   dataType: DATA_TYPE.float32, numComponents: 3, data: vertices},
    {name: 'NORMAL',   dataType: DATA_TYPE.float32, numComponents: 3, data: normals},
    {name: 'TEXCOORD', dataType: DATA_TYPE.float32, numComponents: 2, data: texCoords},
  ], state);
  
  const textureDescriptors = [];
  const atlas = await createTextureAtlas(images, textureDescriptors, state);
  
  const uniformBuffers = createUniformBuffers([
    {
      name: 'Materials',
      data: materials,
      capacity: 32 * 32,
      callback: ({emissiveFactor, baseColorTexture, metallicRoughnessTexture}, builder) => {
        builder.beginStruct();
        builder.pushFloats(...emissiveFactor);
        builder.pushInts(baseColorTexture);
        builder.pushInts(metallicRoughnessTexture);
      },
    },
    {
      name: 'TextureDescriptors',
      data: textureDescriptors,
      capacity: 32 * 32,
      callback: ({section, x, y, width, height}, builder) => {
        builder.beginStruct();
        
        console.log(section, x, y, width, height);
        builder.pushFloats(section);
        builder.pushFloats(x, y);
        builder.pushFloats(width, height);
      },
    },
  ], state);
  
  const json = JSON.stringify({
    bufferViews: state.bufferViews,
    uniformBuffers,
    dataTextures,
    atlas,
    camera,
  });
  
  const jsonBuffer = new TextEncoder().encode(json);
  
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
  
  for (const {name, data, capacity, callback} of bufferDescriptors) {
    const builder = new UboBuilder(capacity);
    
    for (const item of data) {
      callback(item, builder);
    }
    
    const blob = new Blob([builder.rawBuffer]);
    
    uniformBuffers.push({
      name,
      bufferView: state.addBufferView(blob),
    });
  }
  
  return uniformBuffers;
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
  const formatPrefix = 'RGBA'.slice(0, numComponents);
  
  let type, internalFormatSuffix, formatSuffix = '';
  switch (dataType) {
    case DATA_TYPE.float16:
      internalFormatSuffix = '16F';
      type = 'HALF_FLOAT';
      break;
    case DATA_TYPE.float32:
      internalFormatSuffix = '32F';
      type = 'FLOAT';
      break;
    case DATA_TYPE.int32:
      internalFormatSuffix = '32I';
      formatSuffix = '_INTEGER';
      type = 'INT';
      break;
    default:
      throw new Error(`invalid data type '${dataType}'`);
  }
  
  const format = formatPrefix + formatSuffix;
  const internalFormat = formatPrefix + internalFormatSuffix;
  
  return {
    type: GL_CTX[type],
    format: GL_CTX[format],
    internalFormat: GL_CTX[internalFormat],
  };
}

function getTypedArrayConstructor(dataType) {
  switch (dataType) {
    case DATA_TYPE.float16:
      return Uint16Array;
    case DATA_TYPE.float32:
      return Float32Array;
    case DATA_TYPE.int32:
      return Int32Array;
    default:
      throw new Error(`invalid data type '${dataType}'`);
  }
}