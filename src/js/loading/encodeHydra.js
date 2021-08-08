import { BVH } from '../accel/BVHNode.js';
import { decodeGlb } from './decodeGlb.js';
import { Triangle } from '../utilities/primitives.js';
import { TextureAtlasBuilder } from '../utilities/TextureAtlasBuilder.js';
import { DATA_TYPE, getTextureFormatting, getTypedArrayConstructor, assert } from '../utilities/util.js';

const MAGIC = createMagic('HYDRA');
const JSON_MAGIC = createMagic('JSON');
const BIN_MAGIC = createMagic('BIN');

const HEADER_SIZE = 8;
const VERSION = 6;
const TEXTURE_ATLAS_SIZE = 2048;

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
  const data = await decodeGlb(fileList);
  
  // generate triangles from global vertex and face lists
  const triangles = [];
  for (let i = 0; i < data.globalIndexList.length / 4; i++) {
    triangles.push(new Triangle(i, data.globalIndexList, data.globalVertexList));
  }
  
  // encode texture data
  const dataTextures = createDataTextureBuffer([
    {name: 'ACCEL',    dataType: DATA_TYPE.float32, numComponents: 4, data: new BVH(triangles).serialize()},
    {name: 'FACE',     dataType: DATA_TYPE.int32,   numComponents: 4, data: data.globalIndexList},
    {name: 'VERTEX',   dataType: DATA_TYPE.float32, numComponents: 3, data: data.globalVertexList},
    {name: 'NORMAL',   dataType: DATA_TYPE.float32, numComponents: 3, data: data.globalNormalList},
    {name: 'TEXCOORD', dataType: DATA_TYPE.float32, numComponents: 2, data: data.globalTexCoordList},
  ], state);
  
  const textures = await createTextureAtlas(data.images, state);
  
  const json = JSON.stringify({
    image: { // REMOVE
      width: 300,
      height: 150,
    },
    bufferViews: state.bufferViews,
    dataTextures,
    textures,
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

async function createTextureAtlas(images, state) {
  const builder = new TextureAtlasBuilder(TEXTURE_ATLAS_SIZE, TEXTURE_ATLAS_SIZE);
  const textureDescriptors = [];
  
  for (const image of images) {
    const {section, x, y, width, height} = builder.insertImage(image);
    textureDescriptors.push(section, null, x, y, width, height, null, null);
  }
  
  const textureAtlasBlob = await builder.buildAtlas();
  const textureDescriptorBlob = new Blob([new Float32Array(textureDescriptors)]);
  
  return {
    atlas: {
      bufferView: state.addBufferView(textureAtlasBlob),
      mimeType: textureAtlasBlob.type,
      size: {
        width: builder.sectionWidth,
        height: builder.sectionHeight,
        depth: builder.sections.length,
      }
    },
    descriptors: {
      bufferView: state.addBufferView(textureDescriptorBlob),
    },
  };
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