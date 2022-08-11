import { Vector3 } from '../math/Vector3.js';
import { Matrix4 } from '../math/Matrix4.js';
import { clamp } from './util.js';
  
const TOLERANCE = 0.01;
const MIN_DIST = 0.01;
const UP = new Vector3(0, 1, 0);

export class OrbitalCamera {
  #matrix = new Matrix4();
  #distance;
  
  // spherical coordinates
  #spherical = {
    phi: Math.PI / 2,
    theta: 0,
  };
  
  // basis vectors for camera matrix
  #z = new Vector3();
  #x = new Vector3();
  #y = new Vector3();
  
  constructor(panSpeed, zoomSpeed, distance, onchange = null) {
    this.panSpeed = panSpeed;
    this.zoomSpeed = zoomSpeed;
    this.onchange = onchange;
    this.#distance = distance;
    
    this.projectionMatrix = new Matrix4();
    
    this.#update();
  }
  
  #update() {
    this.#z.set(
  		Math.sin(this.#spherical.phi) * Math.sin(this.#spherical.theta),
  		Math.cos(this.#spherical.phi),
  		Math.sin(this.#spherical.phi) * Math.cos(this.#spherical.theta),
    );
    
    this.#x.crossVectors(UP, this.#z).normalize();
    this.#y.crossVectors(this.#z, this.#x);
    
    this.#matrix.setColumn(0, this.#x);
    this.#matrix.setColumn(1, this.#y);
    this.#matrix.setColumn(2, this.#z);
    this.#matrix.setColumn(3, this.#z.clone().scale(this.#distance));
    
    this.onchange?.();
  }
  
  // respond to 'mousemove' event
  pan(dx, dy) {
    this.#spherical.theta += -dx * this.panSpeed;
    this.#spherical.phi = clamp(
      this.#spherical.phi + -dy * this.panSpeed,
      TOLERANCE, Math.PI - TOLERANCE
    );
    this.#update();
  }
  
  
  // respond to 'wheel' event
  zoom(dy) {
    this.#distance = clamp(
      this.#distance * Math.pow(this.zoomSpeed, Math.sign(dy)),
      MIN_DIST,
      Infinity,
    );
    this.#update();
  }
  
  copyCameraNode(cameraNode) {
    // const viewMatrix;
  }
  
  get viewMatrix() {
    return this.#matrix.inverse;
  }
  
  get matrix() {
    return this.#matrix;
  }
}