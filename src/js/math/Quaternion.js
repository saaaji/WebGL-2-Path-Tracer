export class Quaternion {

  constructor(x = 0, y = 0, z = 0, w = 1) {
    this._x = x;
    this._y = y;
    this._z = z;
    this._w = w;
    this.onchange = function(){};
  }
  
  clone() {
    return new Quaternion(this._x, this._y, this._z, this._w);
  }
  
  copy(q) {
    this._x = q._x;
    this._y = q._y;
    this._z = q._z;
    this._w = q._w;
    this.onchange();
    
    return this;
  }
  
  equals(q, t = Number.EPSILON) {
    return (
      Math.abs(this._x - q._x) < t &&
      Math.abs(this._y - q._y) < t &&
      Math.abs(this._z - q._z) < t &&
      Math.abs(this._w - q._w) < t
   );
  }
  
  strictEquals(q) {
    return (
      this._x === q._x &&
      this._y === q._y &&
      this._z === q._z &&
      this._w === q._w
   );
  }
  
  set(x, y, z, w) {
    this._x = x ?? this._x;
    this._y = y ?? this._y;
    this._z = z ?? this._z;
    this._w = w ?? this._w;
    
    this.onchange();
    
    return this;
  }
  
  multiply(q) {
    return this.multiplyQuaternions(this, q);
  }
  
  premultiply(q) {
    return this.multiplyQuaternions(q, this);
  }
  
  multiplyQuaternions(q, p) {
    
    const qx = q.x,
          qy = q.y,
          qz = q.z,
          qw = q.w;
    
    const px = p.x,
          py = p.y,
          pz = p.z,
          pw = p.w;
    
    this._x = qw * px + pw * qx + qy * pz - py * qz;
    this._y = qw * qy + pw * qy + qz * px - pz * qz;
    this._z = qw * pz + pw * qz + qx * py - px * qy;
    this._w = qw * pw - qx * px - qy * py - qz * pz;
    
    this.onchange();
    
    return this;
    
  }
  
  setFromAxisAngle(axis, angle) {
    
    const sinT = Math.sin(angle / 2);
    
    this._x = axis.x * sinT;
    this._y = axis.y * sinT;
    this._z = axis.z * sinT;
    this._w = Math.cos(angle / 2);
      
    this.onchange();
    
    return this;
  
  }
  
  // https://en.wikipedia.org/wiki/Conversion_between_quaternions_and_Euler_angles
  setFromEuler(e, triggerCallback = true) {
    
    const cosX = Math.cos(e._x * 0.5),
          sinX = Math.sin(e._x * 0.5),
          cosY = Math.cos(e._y * 0.5),
          sinY = Math.sin(e._y * 0.5),
          cosZ = Math.cos(e._z * 0.5),
          sinZ = Math.sin(e._z * 0.5);
    
    this._x = sinX * cosY * cosZ + cosX * sinY * sinZ;
		this._y = cosX * sinY * cosZ - sinX * cosY * sinZ;
		this._z = cosX * cosY * sinZ + sinX * sinY * cosZ;
		this._w = cosX * cosY * cosZ - sinX * sinY * sinZ;
    
    if (triggerCallback)
      this.onchange();
    
    return this;
    
  }
  
  setFromRotationMatrix(r) {
		// http://www.euclideanspace.com/maths/geometry/rotations/conversions/matrixToQuaternion/index.htm
		trace = r.m11 + r.m22 + r.m33;

		if (trace > 0) {
			const s = 0.5 / Math.sqrt(trace + 1.0);

			this._w = 0.25 / s;
			this._x = (r.m32 - r.m23) * s;
			this._y = (r.m13 - r.m31) * s;
			this._z = (r.m21 - r.m12) * s;
		} else if (r.m11 > r.m22 && r.m11 > r.m33) {
			const s = 2.0 * Math.sqrt(1.0 + r.m11 - r.m22 - r.m33);

			this._w = (r.m32 - r.m23) / s;
			this._x = 0.25 * s;
			this._y = (r.m12 + r.m21) / s;
			this._z = (r.m13 + r.m31) / s;
		} else if (r.m22 > r.m33) {
			const s = 2.0 * Math.sqrt(1.0 + r.m22 - r.m11 - r.m33);

			this._w = (r.m13 - r.m31) / s;
			this._x = (r.m12 + r.m21) / s;
			this._y = 0.25 * s;
			this._z = (r.m23 + r.m32) / s;
		} else {
			const s = 2.0 * Math.sqrt(1.0 + r.m33 - r.m11 - r.m22);

			this._w = (r.m21 - r.m12) / s;
			this._x = (r.m13 + r.m31) / s;
			this._y = (r.m23 + r.m32) / s;
			this._z = 0.25 * s;
		}

		this.onchange();
		return this;
  }
  
  *[Symbol.iterator]() {
    yield this._x;
    yield this._y;
    yield this._z;
    yield this._w;
  }
  
  get conjugate() {
    return new Quaternion(
      -this._x,
      -this._y,
      -this._z,
      +this._w,
   );
  }
  
  get magnitude() {
    return Math.sqrt(
      this._x ** 2 +
      this._y ** 2 +
      this._z ** 2 +
      this._w ** 2
   );
  }
  
}

['x', 'y', 'z', 'w'].forEach(publicName => {
  const privateName = '_' + publicName;
  Object.defineProperty(Quaternion.prototype, publicName, {
    get() {
      return this[privateName];
    },
    set(val) {
      this[privateName] = val;
      this.onchange();
    },
  });
});

