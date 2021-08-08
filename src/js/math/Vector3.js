export class Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  
  setFromArray(array, offset = 0) {
    this.x = array[offset];
    this.y = array[offset + 1];
    this.z = array[offset + 2];
    return this;
  }
  
  get [0]() {
    return this.x;
  }
  
  get [1]() {
    return this.y;
  }
  get [2]() {
    return this.z;
  }
  
  set [0](value) {
    this.x = value;
  }
  
  set [1](value) {
    this.y = value;
  }
  
  set [2](value) {
    this.z = value;
  }
  
  get length() {
    return Math.sqrt(this.x ** 2 + this.y ** 2 + this.z ** 2);
  }
  
  clone() {
    return new Vector3(this.x, this.y, this.z);
  }
  
  copy(a) {
    this.x = a.x;
    this.y = a.y;
    this.z = a.z;
    return this;
  }
  
  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  
  minVectors(a, b) {
    this.x = Math.min(a.x, b.x);
    this.y = Math.min(a.y, b.y);
    this.z = Math.min(a.z, b.z);
    return this;
  }
  
  maxVectors(a, b) {
    this.x = Math.max(a.x, b.x);
    this.y = Math.max(a.y, b.y);
    this.z = Math.max(a.z, b.z);
    return this;
  }
  
  min(v) {
    this.x = Math.min(this.x, v.x);
    this.y = Math.min(this.y, v.y);
    this.z = Math.min(this.z, v.z);
    return this;
  }
  
  max(v) {
    this.x = Math.max(this.x, v.x);
    this.y = Math.max(this.y, v.y);
    this.z = Math.max(this.z, v.z);
    return this;
  }
  
  subVectors(a, b) {
    this.x = a.x - b.x;
    this.y = a.y - b.y;
    this.z = a.z - b.z;
    return this;
  }
  
  addVectors(a, b) {
    this.x = a.x + b.x;
    this.y = a.y + b.y;
    this.z = a.z + b.z;
    return this;
  }
  
  applyMatrix4(transform, w = 1, perspectiveDivide = false) {
    const x = this.x;
    const y = this.y;
    const z = this.z;
    
    this.x = transform.m11 * x + transform.m12 * y + transform.m13 * z + transform.m14 * w;
    this.y = transform.m21 * x + transform.m22 * y + transform.m23 * z + transform.m24 * w;
    this.z = transform.m31 * x + transform.m32 * y + transform.m33 * z + transform.m34 * w;
    
    if (perspectiveDivide) {
      const invW = 1 / (transform.m41 * x + transform.m42 * y + transform.m43 * z + transform.m44 * w);
      this.scale(invW);
    }
    
    return this;
  }
  
  scale(scalar) {
    this.x *= scalar;
    this.y *= scalar;
    this.z *= scalar;
    return this;
  }
  
  normalize() {
    const length = this.length;
    return this.scale(1 / length);
  }
  
  
  
  *[Symbol.iterator]() {
    yield this.x;
    yield this.y;
    yield this.z;
  }
}