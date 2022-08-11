import { Matrix4 } from '../math/Matrix4.js';
import { Vector3 } from '../math/Vector3.js';
import { SceneGraphNode } from '../utilities/SceneGraphNode.js';
import { AABB } from '../accel/AABB.js';
import { Triangle } from '../utilities/primitives.js';
import { GL_CTX, assert, loadImage } from '../utilities/util.js';

const hex = n => '0x' + n.toString(16).toUpperCase().padStart(8, '0');

const DEFAULT_SCENE = 0;
const DEFAULT_CAMERA = 0;
const LITTLE_ENDIAN = true;
const DEFAULT_IMAGE_SIZE = 8;

const MAGIC = 0x46546C67;
const JSON_MAGIC = 0x4E4F534A;
const BIN_MAGIC = 0x004E4942;
const VERSION = 2;
const HEADER_SIZE = 12;
const CHUNK_HEADER_SIZE = 8;

const COMPONENT_TYPE_TO_COMPONENT_SIZE = {
  [GL_CTX.BYTE]: 1,
  [GL_CTX.UNSIGNED_BYTE]: 1,
  [GL_CTX.SHORT]: 2,
  [GL_CTX.UNSIGNED_SHORT]: 2,
  [GL_CTX.UNSIGNED_INT]: 4,
  [GL_CTX.FLOAT]: 4,
};

const COMPONENT_TYPE_TO_GET_METHOD = {
  [GL_CTX.BYTE]: 'getInt8',
  [GL_CTX.UNSIGNED_BYTE]: 'getUint8',
  [GL_CTX.SHORT]: 'getInt16',
  [GL_CTX.UNSIGNED_SHORT]: 'getUint16',
  [GL_CTX.UNSIGNED_INT]: 'getUint32',
  [GL_CTX.FLOAT]: 'getFloat32',
};

const TYPE_TO_NUM_COMPONENTS = {
  'SCALAR': 1,
  'VEC2': 2,
  'VEC3': 3,
  'VEC4': 4,
  'MAT2': 4,
  'MAT3': 9,
  'MAT4': 16,
};

export class GlbLoader {
  async parse(file) {
    const [json, bin] = await getChunks(file);
    
    // extract scene
    const scene = json.scenes[json.scene ?? DEFAULT_SCENE];
    
    if (!scene) {
      throw new Error('asset must contain at least one scene');
    }
    
    // process materials
    const images = [];
    const materials = [];
    
    // append {} to material list to account for default material
    for (const {pbrMetallicRoughness = {}, emissiveFactor = [0, 0, 0]} of [...json.materials, {}]) {
      // extract map indices
      const {baseColorTexture, metallicRoughnessTexture} = pbrMetallicRoughness;
      
      // extract map factors
      const {
        metallicFactor = 1,
        roughnessFactor = 1,
        baseColorFactor = [1, 1, 1, 1],
      } = pbrMetallicRoughness;
      
      // extract map images
      const baseColorImage = await getPbrMap(json, bin, baseColorTexture);
      const metallicRoughnessImage = await getPbrMap(json, bin, metallicRoughnessTexture);
      
      // append material data
      materials.push({
        emissiveFactor,
        baseColorFactor,
        metallicFactor,
        roughnessFactor,
        baseColorTexture: images.push(baseColorImage) - 1,
        metallicRoughnessTexture: images.push(metallicRoughnessImage) - 1,
      });
    }
    
    // accumulate geometry data
    const root = SceneGraphNode.fromGltf(json, scene);
    const meshNodes = root.nodes.filter(node => node.type === 'MeshNode');
    
    const meshDescriptors = [];
    const indices = [];
    const vertexAttribs = {
      position: [],
      normal: [],
      texCoord0: [],
      materials: [],
    };
    
    // store emissive primitives for NEE
    const emissivePrimitives = [];
    
    let meshIndex = 0;
    meshNodes.forEach(({mesh}) => {
      const {index} = mesh;
      const {primitives} = json.meshes[index];
      
      // determine if mesh is renderable
      if (primitives.every(({mode}) => mode !== 4)) {
        mesh.renderable = false;
        return;
      }
      
      mesh.renderable = true;
      mesh.index = meshIndex;
      
      // begin unpacking geometry data
      const start = indices.length;
      let runningCount = 0;
      
      for (const {attributes, material = materials.length - 1, mode = 4, ...primitive} of primitives) {
        if (mode !== 4) {
          continue;
        }
        
        const isEmissive = materials[material].emissiveFactor.some(channel => channel > 0);
        
        // required vertex attributes
        assert(['POSITION', 'NORMAL'].every(name => name in attributes));
        
        // extract attribute data
        const attribData = {};
        for (const name in attributes) {
          attribData[name] = getAccessor(json, bin, attributes[name]);
        }
        
        const vertexOffset = vertexAttribs.position.length / 3;
        const triangleOffset = indices.length / 3;
        
        // indices are required
        assert('indices' in primitive, `expected primitive to contain field 'indices': 'glDrawArrays' functionality is unsupported`);
        
        // fix pointers
        const rawIndices = getAccessor(json, bin, primitive.indices);
        const count = rawIndices.length / 3;
        
        runningCount += rawIndices.length;
        
        for (let i = 0; i < count; i++) {
          indices.push(
            vertexOffset + rawIndices[i * 3 + 0],
            vertexOffset + rawIndices[i * 3 + 1],
            vertexOffset + rawIndices[i * 3 + 2],
          );
          
          if (isEmissive) {
            emissivePrimitives.push({
              id: triangleOffset + i,
              blasIndex: meshIndex,
            });
          }
        }
        
        const numVertices = attribData['POSITION'].length / 3;
        const offset = vertexAttribs.materials.length;
        vertexAttribs.materials.length += numVertices;
        vertexAttribs.materials.fill(material, offset);
        
        // append geometry data
        if ('TEXCOORD_0' in attribData) {
          for (const texCoord of attribData['TEXCOORD_0']) {
            vertexAttribs.texCoord0.push(texCoord);
          }
        } else {
          const offset = vertexAttribs.texCoord0.length;
          vertexAttribs.texCoord0.length += 2 * numVertices;
          vertexAttribs.texCoord0.fill(0, offset);
        }
        
        for (const position of attribData['POSITION']) {
          vertexAttribs.position.push(position);
        }
        
        for (const normal of attribData['NORMAL']) {
          vertexAttribs.normal.push(normal);
        }
      }
      
      meshDescriptors.push({
        start,
        count: runningCount,
        meshIndex: meshIndex++,
      });
    });
    
    return {
      images,
      materials,
      emissivePrimitives,
      meshDescriptors,
      indices,
      vertexAttribs,
      root,
    };
  }
}

function getImage(json, binary, index) {
  const {
    mimeType: type,
    bufferView: bufferViewIndex,
  } = json.images[index];
  
  const {
    byteLength,
    byteOffset = 0,
  } = json.bufferViews[bufferViewIndex];
  
  const bufferView = binary.slice(byteOffset, byteOffset + byteLength);
  const blob = new Blob([bufferView], {type});
  const src = URL.createObjectURL(blob);
  
  return loadImage(src);
}

function getAccessor(json, binary, index) {
  const {
    count,
    componentType,
    type,
    bufferView,
    byteOffset: additionalByteOffset = 0
  } = json.accessors[index];
  
  const getComponent = COMPONENT_TYPE_TO_GET_METHOD[componentType];
  const componentSize = COMPONENT_TYPE_TO_COMPONENT_SIZE[componentType];
  const numComponents = TYPE_TO_NUM_COMPONENTS[type];
  
  const {
    byteLength,
    byteOffset = 0,
    byteStride = numComponents * componentSize,
  } = json.bufferViews[bufferView];
  
  const array = [];
  
  const view = new DataView(binary);
  for (let i = 0; i < count; i++) {
    const attribOffset = byteOffset + additionalByteOffset + i * byteStride;
    
    for (let j = 0; j < numComponents; j++) {
      array.push(view[getComponent](attribOffset + j * componentSize, LITTLE_ENDIAN));
    }
  }
  
  return array;
}

// read and validate headers and chunks
async function getChunks(file) {
  const buffer = await file.arrayBuffer();
  
  // read GLB header
  const header = new DataView(buffer.slice(0, HEADER_SIZE));
  const magic = header.getUint32(0, LITTLE_ENDIAN);
  const version = header.getUint32(4, LITTLE_ENDIAN);
  const length = header.getUint32(8, LITTLE_ENDIAN);
  
  assert(magic === MAGIC, `invalid magic '${hex(magic)}': expected ${hex(MAGIC)}`);
  assert(version === VERSION, `invalid version '${version}': expected ${VERSION}`);
  assert(length === buffer.byteLength, `invalid length '${length}': expected ${buffer.byteLength}`);
  
  // read JSON header
  const jsonHeader = new DataView(buffer, HEADER_SIZE, CHUNK_HEADER_SIZE);
  const jsonChunkLength = jsonHeader.getUint32(0, LITTLE_ENDIAN);
  const jsonMagic = jsonHeader.getUint32(4, LITTLE_ENDIAN);
  
  assert(jsonMagic === JSON_MAGIC, `invalid JSON magic '${hex(jsonMagic)}': expected ${hex(JSON_MAGIC)}`);
  
  // read binary header
  const binaryHeader = new DataView(buffer, HEADER_SIZE + CHUNK_HEADER_SIZE + jsonChunkLength, CHUNK_HEADER_SIZE);
  const binaryChunkLength = binaryHeader.getUint32(0, LITTLE_ENDIAN);
  const binaryMagic = binaryHeader.getUint32(4, LITTLE_ENDIAN);
  
  assert(binaryMagic === BIN_MAGIC, `invalid binary magic '${hex(binaryMagic)}': expected ${hex(BIN_MAGIC)}`);
  
  // read chunks
  const jsonBytes = new Uint8Array(buffer, HEADER_SIZE + CHUNK_HEADER_SIZE, jsonChunkLength);
  const binaryChunk = buffer.slice(HEADER_SIZE + CHUNK_HEADER_SIZE + jsonChunkLength + CHUNK_HEADER_SIZE);
  
  const jsonText = new TextDecoder().decode(jsonBytes);
  const jsonChunk = JSON.parse(jsonText);
  
  return [jsonChunk, binaryChunk];
}

async function getPbrMap(json, binary, textureInfo, factors = [1, 1, 1, 1]) {
  if (textureInfo) {
    const { index } = textureInfo;
    const { source } = json.textures[index];
    
    const image = await getImage(json, binary, source);
    return image;
  } else {
    const image = await createImage(factors, DEFAULT_IMAGE_SIZE);
    return image;
  }
}

async function createImage(color, size) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  canvas.width = canvas.height = size;
  
  const [r, g, b, a] = color.map(channel => Math.floor(channel * 255));
  
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
  ctx.fillRect(0, 0, size, size);
  
  const blob = await new Promise(resolve => canvas.toBlob(resolve));
  const url = URL.createObjectURL(blob);
  const image = await loadImage(url);
  
  return image;
}