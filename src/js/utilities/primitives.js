import { AABB } from '../accel/AABB.js';

const GLSL_EPSILON = 1e-3;
const TOLERANCE = Number.EPSILON;

const approxEquals = (a, b, tolerance) => Math.abs(a - b) < tolerance;

export class Triangle {
  #id;
  #boundingBox;
  
  constructor(triangleIndex, indices, vertices) {
    const realIndex = triangleIndex * 4;
    
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
      approxEquals(aX, bX, TOLERANCE) && approxEquals(aX, cX, TOLERANCE) ||
      approxEquals(aY, bY, TOLERANCE) && approxEquals(aY, cY, TOLERANCE) ||
      approxEquals(aZ, bZ, TOLERANCE) && approxEquals(aZ, cZ, TOLERANCE)
    );
    
    if (needsEpsilon) console.log("NEEDS EPSILON");
    
    this.#id = triangleIndex;
    this.#boundingBox = new AABB(
      Math.min(aX, bX, cX),
      Math.min(aY, bY, cY),
      Math.min(aZ, bZ, cZ),
      Math.max(aX, bX, cX) + (needsEpsilon ? GLSL_EPSILON : 0),
      Math.max(aY, bY, cY) + (needsEpsilon ? GLSL_EPSILON : 0),
      Math.max(aZ, bZ, cZ) + (needsEpsilon ? GLSL_EPSILON : 0),
    );
  }
  
  get id() {
    return this.#id;
  }
  
  get boundingBox() {
    return this.#boundingBox;
  }
}