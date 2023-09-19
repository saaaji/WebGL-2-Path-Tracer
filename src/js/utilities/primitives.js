import { Matrix4 } from '../math/Matrix4.js';
import { Vector3 } from '../math/Vector3.js';
import { AABB } from '../accel/AABB.js';

const GLSL_EPSILON = 1e-3;

export class Triangle {
  #id;
  #boundingBox = new AABB();
  
  constructor(triangleIndex, indices, vertices, stride = 3) {
    const realIndex = triangleIndex * stride;
    
    const a = indices[realIndex] * 3,
      b = indices[realIndex + 1] * 3,
      c = indices[realIndex + 2] * 3;
    
    const aX = vertices[a],
      aY = vertices[a + 1],
      aZ = vertices[a + 2];
    
    const bX = vertices[b],
      bY = vertices[b + 1],
      bZ = vertices[b + 2];
    
    const cX = vertices[c],
      cY = vertices[c + 1],
      cZ = vertices[c + 2];
    
    const needsEpsilon = (
      aX == bX && aX == cX ||
      aY == bY && aY == cY ||
      aZ == bZ && aZ == cZ
    );
    
    const offset = needsEpsilon ? GLSL_EPSILON : 0;
    
    this.#id = triangleIndex;
    this.#boundingBox.set(
      Math.min(aX, bX, cX),
      Math.min(aY, bY, cY),
      Math.min(aZ, bZ, cZ),
      Math.max(aX, bX, cX) + offset,
      Math.max(aY, bY, cY) + offset,
      Math.max(aZ, bZ, cZ) + offset,
    );
    this.#boundingBox.update();
  }
  
  get id() {
    return this.#id;
  }
  
  get boundingBox() {
    return this.#boundingBox;
  }
}

export class MeshBlas {
  #id;
  #boundingBox = new AABB();
  #name;
  #reference;
  
  constructor(meshNode, index) {
    const {mesh: {boundingBox}, worldMatrix, name} = meshNode;
    const min = boundingBox.min.clone();
    const max = boundingBox.max.clone();
    
    /**
     *    /*------*
     *  /  |    / |
     * *------#   |
     * |   |  |   |
     * |  /#------*
     * |/     | /
     * *------*
     */
     
    const vertexList = [
      min,
      max,
      new Vector3(max.x, min.y, min.z),
      new Vector3(max.x, max.y, min.z),
      new Vector3(min.x, max.y, min.z),
      new Vector3(min.x, min.y, max.z),
      new Vector3(max.x, min.y, max.z),
      new Vector3(min.x, max.y, max.z),
    ];
    
    vertexList.forEach(vertex => this.#boundingBox.addPoint(vertex.applyMatrix4(worldMatrix)));
    
    this.#id = index;
    this.#boundingBox.update();
    this.#name = name;
    this.#reference = meshNode;
  }
  
  get id() {
    return this.#id;
  }
  
  get boundingBox() {
    return this.#boundingBox;
  }

  get name() {
    return this.#name;
  }

  get reference() {
    return this.#reference;
  }
}