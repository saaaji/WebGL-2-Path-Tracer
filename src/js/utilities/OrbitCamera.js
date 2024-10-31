import { Vector3 } from '../math/Vector3.js';
import { Matrix4 } from '../math/Matrix4.js';
import { clamp } from './util.js';
  
const TOLERANCE = 0.01;
const MIN_DIST = 0.01;
const UP = new Vector3(0, 1, 0);

export class OrbitalCamera {
  #originMatrix = new Matrix4();
  #matrix = new Matrix4();
  #distance;
  #invert = 1;
  
  // spherical coordinates
  #spherical = {
    phi: Math.PI / 2,
    theta: 0,
  };

  #origin = new Vector3();

  // basis vectors for camera matrix
  #z = new Vector3();
  #x = new Vector3();
  #y = new Vector3();

  #cameraNode = null;
  
  constructor(panSpeed, zoomSpeed, distance, strafeSpeed, onchange = null, invert = 1) {
    this.panSpeed = panSpeed;
    this.zoomSpeed = zoomSpeed;
    this.strafeSpeed = strafeSpeed,
    this.onchange = onchange;
    this.#distance = distance;
    this.#invert = invert;
    
    /** @deprecated */
    this.projectionMatrix = new Matrix4();
    
    this.#update();
  }

  resetOrigin() {
    this.#origin.set(0, 0, 0);
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
    this.#matrix.setColumn(2, this.#z.clone().scale(this.#invert));
    this.#matrix.setColumn(3, this.#z.clone().scale(this.#distance));

    this.#originMatrix.setColumn(3, this.#origin);

    this.#matrix.premultiply(this.#originMatrix);

    this.#cameraNode?.matrix.copy(this.#matrix);
    this.#cameraNode?._decompose();
    this.#cameraNode?.update();
    
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

  strafe(dx, dy) {
    const ratio = this.zoomSpeed / this.strafeSpeed;

    this.#origin
      .addVectors(this.#origin, this.#x.clone().scale(-dx * this.#distance / ratio))
      .addVectors(this.#origin, this.#y.clone().scale(dy * this.#distance / ratio))

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

  linkCameraNode(cameraNode) {
    this.#cameraNode = cameraNode;
    this.#update();
  }
  
  copyCameraNode(cameraNode) {
    // const viewMatrix;
  }

  toJson() {
    return JSON.stringify({
      phi: this.#spherical.phi,
      theta: this.#spherical.theta,
      distance: this.#distance,
      invert: this.#invert,
      origin: [...this.#origin],
    });
  }

  fromJson(text) {
    const params = JSON.parse(text);
    this.#spherical.phi = params.phi;
    this.#spherical.theta = params.theta;
    this.#distance = params.distance;
    this.#invert = params.invert;
    this.#origin.set(...params.origin);
    this.#update();
  }
  
  get viewMatrix() {
    return this.#matrix.inverse;
  }
  
  get matrix() {
    return this.#matrix;
  }
}