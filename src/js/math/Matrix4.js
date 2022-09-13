import { Vector3 } from './Vector3.js';

export class Matrix4 {
  static IDENTITY = new Matrix4();
  
  constructor(
    m11 = 1, m12 = 0, m13 = 0, m14 = 0,
    m21 = 0, m22 = 1, m23 = 0, m24 = 0,
    m31 = 0, m32 = 0, m33 = 1, m34 = 0,
    m41 = 0, m42 = 0, m43 = 0, m44 = 1,
  ) {
    this.elements = new Float32Array([
      m11, m21, m31, m41,
      m12, m22, m32, m42,
      m13, m23, m33, m43,
      m14, m24, m34, m44,
    ]);
  }
  
  // array should store matrix in column-major format
  setFromArray(array, offset = 0) {
    this.elements.set(array.slice(offset, offset + 16), 0);
    return this;
  }
  
  // elements should be passed in column-major format
  set(...elements) {
    this.elements.set(elements.slice(0, 16), 0);
    return this;
  }
  
  clone() {
    return new Matrix4().setFromArray(this.elements);
  }
  
  copy(m) {
    this.elements.set(m.elements, 0);
    return this;
  }
  
  multiplyMatrices(a, b) {
    const [
      a11, a21, a31, a41,
      a12, a22, a32, a42,
      a13, a23, a33, a43,
      a14, a24, a34, a44,
    ] = a.elements;
    
    const [
      b11, b21, b31, b41,
      b12, b22, b32, b42,
      b13, b23, b33, b43,
      b14, b24, b34, b44,
    ] = b.elements;
    
    this.elements[0]  = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
    this.elements[4]  = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
    this.elements[8]  = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
    this.elements[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;
      
    this.elements[1]  = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
    this.elements[5]  = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
    this.elements[9]  = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
    this.elements[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;
      
    this.elements[2]  = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
    this.elements[6]  = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
    this.elements[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
    this.elements[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;
      
    this.elements[3]  = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
    this.elements[7]  = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
    this.elements[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
    this.elements[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;
      
    return this;
  }
  
  multiply(m) {
    return this.multiplyMatrices(this, m);
  }
  
  premultiply(m) {
    return this.multiplyMatrices(m, this);
  }
  
  infinitePerspective(fov, near, aspectRatio) {
    const tanFov = Math.tan(0.5 * fov);
    
    return this.set(
      1 / (aspectRatio * tanFov), 0, 0, 0,
      0, 1 / tanFov, 0, 0,
      0, 0, -1, -1,
      0, 0, -2 * near, 0,
    );
  }
  
  perspectiveWithFarPlane(fov, near, far, aspectRatio) {
    const f = Math.tan((Math.PI - fov) / 2);
    const rangeInv = 1 / (near - far);
    
    return this.set(
      f / aspectRatio, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (near + far) * rangeInv, -1,
      0, 0, near * far * rangeInv * 2, 0,
    );
    
    return this;
  }
  
  rotationX(t) {
    return this.set(
      1, 0, 0, 0,
      0, Math.cos(t), Math.sin(t), 0,
      0, -Math.sin(t), Math.cos(t), 0,
      0, 0, 0, 1,
    );
  }
  
  rotationY(t) {
    return this.set(
      Math.cos(t), 0, -Math.sin(t), 0,
      0, 1, 0, 0,
      Math.sin(t), 0, Math.cos(t), 0,
      0, 0, 0, 1,
    );
  }
  
  compose(position, quaternion, scale) {
    const [tx, ty, tz] = position;
    const [x, y, z, w] = quaternion;
    const [sx, sy, sz] = scale;
    
		const x2 = x + x,	y2 = y + y, z2 = z + z;
		const xx = x * x2, xy = x * y2, xz = x * z2;
		const yy = y * y2, yz = y * z2, zz = z * z2;
		const wx = w * x2, wy = w * y2, wz = w * z2;

		this.elements[0] = (1 - (yy + zz)) * sx;
		this.elements[1] = (xy + wz) * sx;
		this.elements[2] = (xz - wy) * sx;
		this.elements[3] = 0;

		this.elements[4] = (xy - wz) * sy;
		this.elements[5] = (1 - (xx + zz)) * sy;
		this.elements[6] = (yz + wx) * sy;
		this.elements[7] = 0;

		this.elements[8] = (xz + wy) * sz;
		this.elements[9] = (yz - wx) * sz;
		this.elements[10] = (1 - (xx + yy)) * sz;
		this.elements[11] = 0;

		this.elements[12] = tx;
		this.elements[13] = ty;
		this.elements[14] = tz;
		this.elements[15] = 1;

		return this;
	}
	
	decompose(position, quaternion, scale) {
		const m = this.elements;
		const temp = new Vector3();
		const m1 = new Matrix4();

    // extract scale by taking magnitude of basis
		let sx = temp.set(m[0], m[1], m[2]).length;
		const sy = temp.set(m[4], m[5], m[6]).length;
		const sz = temp.set(m[8], m[9], m[10]).length;

		// if determine is negative, we need to invert one scale
		sx = this.determinant < 0 ? -sx : sx;

    // extract position
		position.x = m[12];
		position.y = m[13];
		position.z = m[14];

		// scale the rotation part
		m1.copy(this);

		const invX = 1 / sx;
		const invY = 1 / sy;
		const invZ = 1 / sz;

		m1.elements[0] *= invX;
		m1.elements[1] *= invX;
		m1.elements[2] *= invX;

		m1.elements[4] *= invY;
		m1.elements[5] *= invY;
		m1.elements[6] *= invY;

		m1.elements[8] *= invZ;
		m1.elements[9] *= invZ;
		m1.elements[1] *= invZ;

		quaternion.setFromRotationMatrix(m1);

		scale.x = sx;
		scale.y = sy;
		scale.z = sz;

		return this;
	}
	
	get determinant() {
    const [
      m11, m21, m31, m41,
      m12, m22, m32, m42,
      m13, m23, m33, m43,
      m14, m24, m34, m44,
    ] = this.elements;
    
    return (
      m14 * m23 * m32 * m41 - m13 * m24 * m32 * m41 - m14 * m22 * m33 * m41 + m12 * m24 * m33 * m41 +
      m13 * m22 * m34 * m41 - m12 * m23 * m34 * m41 - m14 * m23 * m31 * m42 + m13 * m24 * m31 * m42 +
      m14 * m21 * m33 * m42 - m11 * m24 * m33 * m42 - m13 * m21 * m34 * m42 + m11 * m23 * m34 * m42 +
      m14 * m22 * m31 * m43 - m12 * m24 * m31 * m43 - m14 * m21 * m32 * m43 + m11 * m24 * m32 * m43 +
      m12 * m21 * m34 * m43 - m11 * m22 * m34 * m43 - m13 * m22 * m31 * m44 + m12 * m23 * m31 * m44 +
      m13 * m21 * m32 * m44 - m11 * m23 * m32 * m44 - m12 * m21 * m33 * m44 + m11 * m22 * m33 * m44
    );
  }
	
	get transpose() {
	  const swap = (a, i, j) => {
	    const temp = a[i];
	    a[i] = a[j];
	    a[j] = temp;
	  }
	  
	  const transpose = this.clone();
	  
	  swap(transpose.elements, 1, 4);
		swap(transpose.elements, 2, 8);
		swap(transpose.elements, 6, 9);
		swap(transpose.elements, 3, 12);
		swap(transpose.elements, 7, 13);
		swap(transpose.elements, 11, 14);
	  
	  return transpose;
	}
	
  get inverse() {
    const determinant = this.determinant;
    
    if (determinant !== 0) {
      const [
        m11, m21, m31, m41,
        m12, m22, m32, m42,
        m13, m23, m33, m43,
        m14, m24, m34, m44,
      ] = this.elements;
      
      const detInv = 1 / determinant;
      const inverse = new Matrix4();
      
      inverse.elements[0]  = (m23 * m34 * m42 - m24 * m33 * m42 + m24 * m32 * m43 - m22 * m34 * m43 - m23 * m32 * m44 + m22 * m33 * m44) * detInv;
      inverse.elements[4]  = (m14 * m33 * m42 - m13 * m34 * m42 - m14 * m32 * m43 + m12 * m34 * m43 + m13 * m32 * m44 - m12 * m33 * m44) * detInv;
      inverse.elements[8]  = (m13 * m24 * m42 - m14 * m23 * m42 + m14 * m22 * m43 - m12 * m24 * m43 - m13 * m22 * m44 + m12 * m23 * m44) * detInv;
      inverse.elements[12] = (m14 * m23 * m32 - m13 * m24 * m32 - m14 * m22 * m33 + m12 * m24 * m33 + m13 * m22 * m34 - m12 * m23 * m34) * detInv;
      
      inverse.elements[1]  = (m24 * m33 * m41 - m23 * m34 * m41 - m24 * m31 * m43 + m21 * m34 * m43 + m23 * m31 * m44 - m21 * m33 * m44) * detInv;
      inverse.elements[5]  = (m13 * m34 * m41 - m14 * m33 * m41 + m14 * m31 * m43 - m11 * m34 * m43 - m13 * m31 * m44 + m11 * m33 * m44) * detInv;
      inverse.elements[9]  = (m14 * m23 * m41 - m13 * m24 * m41 - m14 * m21 * m43 + m11 * m24 * m43 + m13 * m21 * m44 - m11 * m23 * m44) * detInv;
      inverse.elements[13] = (m13 * m24 * m31 - m14 * m23 * m31 + m14 * m21 * m33 - m11 * m24 * m33 - m13 * m21 * m34 + m11 * m23 * m34) * detInv;
      
      inverse.elements[2]  = (m22 * m34 * m41 - m24 * m32 * m41 + m24 * m31 * m42 - m21 * m34 * m42 - m22 * m31 * m44 + m21 * m32 * m44) * detInv;
      inverse.elements[6]  = (m14 * m32 * m41 - m12 * m34 * m41 - m14 * m31 * m42 + m11 * m34 * m42 + m12 * m31 * m44 - m11 * m32 * m44) * detInv;
      inverse.elements[10] = (m12 * m24 * m41 - m14 * m22 * m41 + m14 * m21 * m42 - m11 * m24 * m42 - m12 * m21 * m44 + m11 * m22 * m44) * detInv;
      inverse.elements[14] = (m14 * m22 * m31 - m12 * m24 * m31 - m14 * m21 * m32 + m11 * m24 * m32 + m12 * m21 * m34 - m11 * m22 * m34) * detInv;
      
      inverse.elements[3]  = (m23 * m32 * m41 - m22 * m33 * m41 - m23 * m31 * m42 + m21 * m33 * m42 + m22 * m31 * m43 - m21 * m32 * m43) * detInv;
      inverse.elements[7]  = (m12 * m33 * m41 - m13 * m32 * m41 + m13 * m31 * m42 - m11 * m33 * m42 - m12 * m31 * m43 + m11 * m32 * m43) * detInv;
      inverse.elements[11] = (m13 * m22 * m41 - m12 * m23 * m41 - m13 * m21 * m42 + m11 * m23 * m42 + m12 * m21 * m43 - m11 * m22 * m43) * detInv;
      inverse.elements[15] = (m12 * m23 * m31 - m13 * m22 * m31 + m13 * m21 * m32 - m11 * m23 * m32 - m12 * m21 * m33 + m11 * m22 * m33) * detInv;
      
      return inverse;
    }
    
    return undefined;
  }
  
  get normalMatrix() {
    const normalMatrix = this.inverse.transpose;
    
    normalMatrix.m14 = 0;
    normalMatrix.m24 = 0;
    normalMatrix.m34 = 0;
	  
	  return normalMatrix;
  }
  
  get isMatrix() {
    return true;
  }
  
  setColumn(n, v) {
    for (let i = 0; i < 3; i++) {
      this.elements[n * 4 + i] = v[i];
    }
    
    return this;
  }
  
  columnVector(n) {
    return new Vector3(...this.column(n));
  }
  
  *row(n) {
    for (let i = 0; i < 4; i++) {
      yield this.elements[i * 4 + n];
    }
  }
  
  *column(n) {
    yield *this.elements.slice(n * 4, n * 4 + 4);
  }
  
  *[Symbol.iterator]() {
    yield *this.elements;
  }
  
  _getNdcDepth(linearZ) {
    const z = this.m33 * linearZ + this.m34;
    const w = this.m43 * linearZ;
    
    return z / w;
  }
}

for (let col = 0; col < 4; col++) {
  for (let row = 0; row < 4; row++) {
    Object.defineProperty(Matrix4.prototype, `m${row+1}${col+1}`, {
      get() {
        return this.elements[col * 4 + row];
      },
      set(value) {
        this.elements[col * 4 + row] = value;
      },
    });
  }
}