import { ActiveNodeEditor } from '../utilities/ActiveNodeEditor.js';

export class Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    this._x = x;
    this._y = y;
    this._z = z;
    this.onchange = function(){};
  }
  
  setFromArray(array, offset = 0) {
    this._x = array[offset];
    this._y = array[offset + 1];
    this._z = array[offset + 2];
    
    this.onchange();
    
    return this;
  }
  
  get isVector() {
    return true;
  }
  
  get [0]() {
    return this._x;
  }
  
  get [1]() {
    return this._y;
  }
  get [2]() {
    return this._z;
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
    return Math.sqrt(this._x ** 2 + this._y ** 2 + this._z ** 2);
  }
  
  clone() {
    return new Vector3(this._x, this._y, this._z);
  }
  
  copy(a) {
    this._x = a.x;
    this._y = a.y;
    this._z = a.z;
    
    this.onchange();
    
    return this;
  }
  
  set(x, y, z) {
    this._x = x;
    this._y = y;
    this._z = z;
    
    this.onchange();
    
    return this;
  }
  
  minVectors(a, b) {
    this._x = Math.min(a.x, b.x);
    this._y = Math.min(a.y, b.y);
    this._z = Math.min(a.z, b.z);
    
    this.onchange();
    
    return this;
  }
  
  maxVectors(a, b) {
    this._x = Math.max(a.x, b.x);
    this._y = Math.max(a.y, b.y);
    this._z = Math.max(a.z, b.z);
    
    this.onchange();
    
    return this;
  }
  
  min(v) {
    this._x = Math.min(this._x, v[0]);
    this._y = Math.min(this._y, v[1]);
    this._z = Math.min(this._z, v[2]);
    
    this.onchange();
    
    return this;
  }
  
  max(v) {
    this._x = Math.max(this._x, v[0]);
    this._y = Math.max(this._y, v[1]);
    this._z = Math.max(this._z, v[2]);
    
    this.onchange();
    
    return this;
  }
  
  subVectors(a, b) {
    this._x = a.x - b.x;
    this._y = a.y - b.y;
    this._z = a.z - b.z;
    
    this.onchange();
    
    return this;
  }
  
  addVectors(a, b) {
    this._x = a.x + b.x;
    this._y = a.y + b.y;
    this._z = a.z + b.z;
    
    this.onchange();
    
    return this;
  }
  
  addScalar(s) {
    this._x += s;
    this._y += s;
    this._z += s;
    
    this.onchange();
    
    return this;
  }
  
  componentWiseAddScalar(s0, s1, s2) {
    this._x += s0;
    this._y += s1;
    this._z += s2;
    
    this.onchange();
    
    return this;
  }
  
  applyMatrix4(transform, w = 1, perspectiveDivide = false) {
    const x = this._x;
    const y = this._y;
    const z = this._z;
    
    this._x = transform.m11 * x + transform.m12 * y + transform.m13 * z + transform.m14 * w;
    this._y = transform.m21 * x + transform.m22 * y + transform.m23 * z + transform.m24 * w;
    this._z = transform.m31 * x + transform.m32 * y + transform.m33 * z + transform.m34 * w;
    
    if (perspectiveDivide) {
      const invW = 1 / (transform.m41 * x + transform.m42 * y + transform.m43 * z + transform.m44 * w);
      this.scale(invW);
    }
    
    this.onchange();
    
    return this;
  }
  
  scale(scalar) {
    this._x *= scalar;
    this._y *= scalar;
    this._z *= scalar;
    
    this.onchange();
    
    return this;
  }
  
  componentWiseScale(s0, s1, s2) {
    this._x *= s0;
    this._y *= s1;
    this._z *= s2;
    
    this.onchange();
    
    return this;
  }
  
  normalize() {
    const length = this.length;
    return this.scale(1 / length);
  }
  
  crossVectors(a, b) {
    const [aX, aY, aZ] = a;
    const [bX, bY, bZ] = b;
    
    this._x = aY * bZ - aZ * bY;
    this._y = aZ * bX - aX * bZ;
    this._z = aX * bY - aY * bX;
    
    this.onchange();
    
    return this;
  }
  
  dot(b) {
    const [aX, aY, aZ] = this;
    const [bX, bY, bZ] = b;
    
    return aX * bX + aY * bY + aZ * bZ;
  }
  
  // https://en.wikipedia.org/wiki/Conversion_between_quaternions_and_Euler_angles
  setFromQuaternion(q, triggerCallback = true) {
    let a, b;
    
    // roll (x-axis rotation)
    a = 2 * (q._w * q._x + q._y * q._z);
    b = 1 - 2 * (q._x * q._x + q._y * q._y);
    
    this._x = Math.atan2(a, b);

    // pitch (y-axis rotation)
    a = 2 * (q._w * q._y - q._z * q._x);
    
    if (Math.abs(a) >= 1) {
      // use 90 degrees if out of range
      this._y = Math.sin(Math.PI / 2, a);
    } else {
      this._y = Math.asin(a);
    }
    
    // yaw (z-axis rotation)
    a = 2 * (q._w * q._z + q._x * q._y);
    b = 1 - 2 * (q._y * q._y + q._z * q._z);
    
    this._z = Math.atan2(a, b);
    
    if (triggerCallback) {
      this.onchange();
    }
    
    return this;
  }
  
  *[Symbol.iterator]() {
    yield this._x;
    yield this._y;
    yield this._z;
  }
  
  *[ActiveNodeEditor.createCustomDOM](mutable, displayName, updateCallback) {
    const componentList = 'xyz'.split('');
    
    for (let i = 0; i < 3; i++) {
      const row = document.createElement('div');
      row.classList.add('ui-content-row');
      
      const label = document.createElement('label');
      const input = document.createElement('input');
      
      const compStr = componentList[i].toUpperCase();
      label.textContent = i === 0 ? `${displayName} ${compStr}` : compStr;
      
      input.type = 'number';
      input.value = this[i];
      input.disabled = mutable !== true;
      
      if (!mutable) {
        row.classList.add('readonly');
      } else {
        input.addEventListener('change', e => {
          this[i] = Number(e.target.value);
          updateCallback?.();
        });
      }
      
      row.appendChild(label);
      row.appendChild(input);
      
      yield row;
    }
  }
}

['x', 'y', 'z'].forEach(publicName => {
  const privateName = '_' + publicName;
  Object.defineProperty(Vector3.prototype, publicName, {
    get() {
      return this[privateName];
    },
    set(val) {
      this[privateName] = val;
      this.onchange();
    },
  });
});