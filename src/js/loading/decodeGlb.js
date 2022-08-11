/**
 * DEPRECATED LOADER (use GlbLoader)
 */

import { Matrix4 } from '../math/Matrix4.js';
import { Vector3 } from '../math/Vector3.js';
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

export async function decodeGlb(files) {
  // read file
  const file = files.item(0);
  const [gltf, binaryChunk] = await getChunks(file);
  
  // parse scene
  const cameraWorldMatrix = new Matrix4();
  
  const vertices = [];
  const indices = [];
  const texCoords = [];
  const normals = [];
  const images = [];
  const materials = [];
  const lights = [];
  const rawElements = [];
  
  const scene = gltf.scenes[gltf.scene ?? DEFAULT_SCENE];
  
  if (!scene) {
    throw new Error('asset must contain at least one scene');
  }
  
  // process materials
  for (const material of [...gltf.materials, {}]) {
    const pbrMetallicRoughness = material.pbrMetallicRoughness ?? {};
    
    const baseColorTextureInfo = pbrMetallicRoughness.baseColorTexture;
    const metallicRoughnessTextureInfo = pbrMetallicRoughness.metallicRoughnessTexture;
    const normalTextureInfo = material.normalTexture;
    
    const metallicFactor = pbrMetallicRoughness.metallicFactor ?? 1;
    const roughnessFactor = pbrMetallicRoughness.roughnessFactor ?? 1;
    const baseColorFactor = pbrMetallicRoughness.baseColorFactor ?? [1, 1, 1, 1];
    const emissiveFactor = material.emissiveFactor ?? [0, 0, 0];
    
    const baseColorTexture = await getPbrMap(gltf, binaryChunk, baseColorTextureInfo, [1, 1, 1, 1]);
    const metallicRoughnessTexture = await getPbrMap(gltf, binaryChunk, metallicRoughnessTextureInfo, [1, 1, 1, 1]);
    // const normalTexture = await getPbrMap(gltf, binaryChunk, normalTextureInfo, [0, 0, 1, 1]);
    
    materials.push({
      emissiveFactor,
      baseColorFactor,
      metallicFactor,
      roughnessFactor,
      baseColorTexture: images.push(baseColorTexture) - 1,
      metallicRoughnessTexture: images.push(metallicRoughnessTexture) - 1,
      // normalTexture: images.push(normalTexture) - 1,
    });
  }
  
  // process geometries
  const nodeStack = [{
    parentMatrix: new Matrix4(),
    children: scene.nodes
  }];
  
  while (nodeStack.length) {
    const {parentMatrix, children} = nodeStack.pop();
    
    for (const childIndex of children) {
      const childNode = gltf.nodes[childIndex];
      const worldMatrix = new Matrix4();
      
      if (childNode.matrix) {
        worldMatrix.setFromArray(childNode.matrix);
      } else {
        worldMatrix.compose(
          childNode.translation ?? [0, 0, 0],
          childNode.rotation ?? [0, 0, 0, 1],
          childNode.scale ?? [1, 1, 1],
        );
      }
      
      worldMatrix.premultiply(parentMatrix);
      const normalMatrix = worldMatrix.normalMatrix;
      
      if ('mesh' in childNode) {
        const mesh = gltf.meshes[childNode.mesh];
        
        for (const primitive of mesh.primitives) {
          if ('mode' in primitive && primitive.mode === 4 || !('mode' in primitive)) {
            const materialIndex = primitive.material ?? materials.length - 1;
            const material = materials[materialIndex];
            
            assert(['POSITION', 'NORMAL'].every(attrib => attrib in primitive.attributes));
            
            const attributes = {};
            for (const attribName in primitive.attributes) {
              const accessorIndex = primitive.attributes[attribName];
              const attribArray = getAccessor(gltf, binaryChunk, accessorIndex);
              
              attributes[attribName] = attribArray;
            }
            
            const offset = vertices.length / 3;
            const triangleOffset = indices.length / 4;
            const v = new Vector3();
            
            const isLight = material.emissiveFactor.some(channel => channel > 0);
            
            // parse indices
            if ('indices' in primitive) {
              const rawIndices = getAccessor(gltf, binaryChunk, primitive.indices);
              for (let i = 0; i < rawIndices.length / 3; i++) {
                indices.push(
                  offset + rawIndices[i * 3 + 0],
                  offset + rawIndices[i * 3 + 1],
                  offset + rawIndices[i * 3 + 2],
                  materialIndex,
                );
                
                if (isLight) {
                  lights.push(triangleOffset + i);
                }
              }
            } else {
              const numTriangles = attributes['POSITION'].length / 3 / 3;
              for (let i = 0; i < numTriangles; i++) {
                indices.push(
                  offset + i * 3 + 0,
                  offset + i * 3 + 1,
                  offset + i * 3 + 2,
                  materialIndex,
                );
                
                if (isLight) {
                  lights.push(triangleOffset + i);
                }
              }
            }
            
            // parse texture coordinates
            if ('TEXCOORD_0' in attributes) {
              for (const texCoord of attributes['TEXCOORD_0']) {
                texCoords.push(texCoord);
              }
            } else {
              const texCoordOffset = texCoords.length;
              texCoords.length += 2 * attributes['POSITION'].length / 3;
              texCoords.fill(0, texCoordOffset);
            }
            
            // parse vertices
            for (let i = 0; i < attributes['POSITION'].length; i += 3) {
              v.setFromArray(attributes['POSITION'], i).applyMatrix4(worldMatrix);
              vertices.push(...v);
            }
            
            // parse normals
            for (let i = 0; i < attributes['NORMAL'].length; i += 3) {
              v.setFromArray(attributes['NORMAL'], i).applyMatrix4(normalMatrix).normalize();
              normals.push(...v);
            }
          }
        }
      } else if (childNode.camera === DEFAULT_CAMERA) {
        cameraWorldMatrix.copy(worldMatrix);
      }
      
      if ('children' in childNode) {
        nodeStack.push({
          parentMatrix: worldMatrix,
          children: childNode.children,
        });
      }
    }
  }
  
  const camera = getCamera(gltf, cameraWorldMatrix);
  
  return {
    indices,
    vertices,
    texCoords,
    normals,
    images,
    camera,
    materials,
    lights,
    rawElements,
  };
}

function getCamera(json, worldMatrix) {
  const camera = json.cameras[DEFAULT_CAMERA];
  
  if (!camera) {
    throw new Error('asset must contain at least 1 camera');
  }
  
  if (camera.type === 'perspective') {
    const {
      yfov: fov,
      znear: near,
      zfar: far = near + 2, // arbitrary offset
    } = camera.perspective;
    
    return {
      type: camera.type,
      parameters: { fov, near, far },
      worldMatrix: Array.from(worldMatrix),
    };
  } else if (type === 'orthographic') {
    debugger;
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

async function getPbrMap(json, binary, textureInfo, factors) {
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