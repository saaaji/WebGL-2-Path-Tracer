export class Euler {
  
  constructor(x = 0, y = 0, z = 0) {
    this._x = x;
    this._y = y;
    this._z = z;
    
    this.onchange = function(){};
  }
  
  clone() {
    return new Euler(this._x, this._y, this._z);
  }
  
  copy(e) {
    this._x = e._x;
    this._y = e._y;
    this._z = e._z;
    
    this.onchange?.();
    
    return this;
  }
  
  equals(e, t = Number.EPSILON) {
    return (
      Math.abs(this._x - e._x) < t &&
      Math.abs(this._y - e._y) < t &&
      Math.abs(this._z - e._z) < t
    );
  }
  
  strictEquals(e) {
    return (
      this._x === e._x &&
      this._y === e._y &&
      this._z === e._z
    );
  }
  
  set(x, y, z) {
    this._x = x ?? this._x;
    this._y = y ?? this._y;
    this._z = z ?? this._z;
    
    this.onchange?.();
    
    return this;
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
    
    if (triggerCallback)
      this.onchange?.();
    
    return this;
  
  }
  
  *[Symbol.iterator]() {
    yield this._x;
    yield this._y;
    yield this._z;
  }
  
    
  
}

['x', 'y', 'z'].forEach(publicName => {
  const privateName = '_' + publicName;
  Object.defineProperty(Euler.prototype, publicName, {
    get() {
      return this[privateName];
    },
    set(val) {
      this[privateName] = val;
      this.onchange?.();
    },
  });
});