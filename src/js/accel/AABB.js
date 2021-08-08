import { Vector3 } from '../math/Vector3.js';

export class AABB {
  #min = new Vector3();
  #max = new Vector3();
  #diag = new Vector3();
  #centroid = new Vector3();
  #surfaceArea;
  #maxExtent;
  #maxExtentAxis;
  
  constructor(
    xMin = +Infinity,
    yMin = +Infinity,
    zMin = +Infinity,
    xMax = -Infinity,
    yMax = -Infinity,
    zMax = -Infinity,
  ) {
    this.min.set(xMin, yMin, zMin);
    this.max.set(xMax, yMax, zMax);
    this.update();
  }
  
  get min() {
    return this.#min;
  }
  
  get max() {
    return this.#max;
  }
  
  get diag() {
    return this.#diag;
  }
  
  get centroid() {
    return this.#centroid;
  }
  
  get surfaceArea() {
    return this.#surfaceArea;
  }
  
  get maxExtent() {
    return this.#maxExtent;
  }
  
  get maxExtentAxis() {
    return this.#maxExtentAxis;
  }

  clone() {
    return new AABB(...this.#min, ...this.#max);
  }
  
  copy(other) {
    this.#min.copy(other.#min);
    this.#max.copy(other.#max);
    return this;
  }
  
  addPoint(point) {
    this.#min.min(point);
    this.#max.max(point);
    return this;
  }
  
  addAABB(other) {
    this.#min.min(other.#min);
    this.#max.max(other.#max);
    return this;
  }
  
  update() {
    this.#diag.subVectors(this.#max, this.#min);
      
    let maxExtentAxis, maxExtent = -Infinity;
    for (let axis = 0; axis < 3; axis++) {
      const extent = this.#max[axis] - this.#min[axis];
      if (extent > maxExtent) {
        maxExtentAxis = axis;
        maxExtent = extent;
      }
    }
    
    this.#maxExtent = maxExtent;
    this.#maxExtentAxis = maxExtentAxis;
    
    this.#surfaceArea = 2 * (
      this.#diag.x * this.#diag.y +
      this.#diag.x * this.#diag.z +
      this.#diag.y * this.#diag.z
    );
    
    this.#centroid.set(
      (this.#min.x + this.#max.x) * 0.5,
      (this.#min.y + this.#max.y) * 0.5,
      (this.#min.z + this.#max.z) * 0.5,
    );
  }
  
  combine(a, b) {
    this.#min.minVectors(a.#min, b.#min);
    this.#max.maxVectors(a.#max, b.#max);
  }
  
  static compare(a, b, axis) {
    return a.#centroid[axis] - b.#centroid[axis];
  }
}

