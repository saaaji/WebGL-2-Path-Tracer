import { Matrix4 } from '../math/Matrix4.js';
import { Vector3 } from '../math/Vector3.js';
import { Euler } from '../math/Euler.js';
import { Quaternion } from '../math/Quaternion.js';
import { AABB } from '../accel/AABB.js';
import { ActiveNodeEditor } from './ActiveNodeEditor.js';

const onPositionChange = Symbol('onPositionChange');
const onScaleChange = Symbol('onScaleChange');
const onEulerChange = Symbol('onEulerChange');
const onQuaternionChange = Symbol('onQuaternionChange');

export class SceneGraphNode {
  static [ActiveNodeEditor.editableProperties] = [
    {prop: 'type', mutable: false, displayName: 'Type'},
    {prop: 'name', mutable: false, displayName: 'Name'},
    {prop: 'id', mutable: false, displayName: 'Internal ID'},
    {prop: 'position', mutable: true, triggerUpdate: true, displayName: 'Position'},
    {prop: 'rotation', mutable: true, triggerUpdate: true, displayName: 'Rotation'},
    {prop: 'scale', mutable: true, triggerUpdate: true, displayName: 'Scale'},
  ];
  
  static [onPositionChange] = function() {
    this.update();
  }
  
  static [onScaleChange] = function() {
    this.update();
  }
  
  static [onEulerChange] = function() {
    this.#quat.setFromEuler(this.rotation, false);
    this.update();
  }
  
  static [onQuaternionChange] = function() {
    this.rotation.setFromQuaternion(this.#quat, false);
    this.update();
  }
  
  parent = null;
  children = [];
  
  worldMatrix = new Matrix4();
  matrix = new Matrix4();
  
  position = new Vector3();
  rotation = new Vector3();
  scale = new Vector3(1, 1, 1);
  
  #quat = new Quaternion();
  
  // id for picking
  id = 'NODE-' + Math
    .random()
    .toString(36)
    .substr(2, 9)
    .toUpperCase();
  
  // construct from JSON-friendly descriptor
  constructor({
    matrix,
    translation = [0, 0, 0],
    rotation = [0, 0, 0, 1],
    scale = [1, 1, 1],
    name = 'Node',
  } = {}) {
    this.name = name;
    
    if (matrix) {
      this.matrix.setFromArray(matrix);
    } else {
      this.matrix.compose(translation, rotation, scale);
    }
    
    this.matrix.decompose(this.position, this.#quat, this.scale);
    this.rotation.setFromQuaternion(this.#quat, false);
    
    this.position.onchange = this.constructor[onPositionChange].bind(this);
    this.scale.onchange = this.constructor[onScaleChange].bind(this);
    this.rotation.onchange = this.constructor[onEulerChange].bind(this);
    this.#quat.onchange = this.constructor[onQuaternionChange].bind(this);
  }
  
  // update matrices of all nodes under this node
  update() {
    this.matrix.compose(this.position, this.#quat, this.scale);
    
    if (this.parent) {
      this.worldMatrix.multiplyMatrices(this.parent.worldMatrix, this.matrix);
    } else {
      this.worldMatrix.copy(this.matrix);
    }
    
    this.children.forEach(child => child.update());
  }
  
  // helper method for serialization
  getJsonData() {
    return {
      type: this.type,
      name: this.name,
      matrix: [...this.matrix.elements],
    };
  }
  
  // serialize/deserialize methods to convert to/from JSON-friendly descriptor format
  serialize() {
    const nodes = this.nodes;
    
    return {
      rootNodeIndices: this.children.map(child => nodes.indexOf(child)),
      nodeDescriptors: nodes.map(node => ({
        children: node.children.map(child => nodes.indexOf(child)),
        ...node.getJsonData(),
      })),
    };
  }
  
  // return collection of all nodes under this node
  get nodes() {
    const nodes = [...this.children];
    this.children.forEach(child => nodes.push(...child.nodes));
    return nodes;
  }
  
  // string tag for serialization
  get type() {
    return 'SceneGraphNode';
  }
  
  // parse tree from JSON-friendly descriptor format
  static deserialize({rootNodeIndices, nodeDescriptors}) {
    const nodes = nodeDescriptors.map(({type, ...descriptor}) => {
      switch (type) {
        case 'SceneGraphNode':
          return new SceneGraphNode(descriptor);
          break;
        case 'MeshNode':
          return new MeshNode(descriptor);
          break;
        case 'CameraNode':
          return new CameraNode(descriptor);
          break;
        default:
          throw new Error(`unexpected SceneGraphNode variant '${type}'`);
      }
    });
    
    const stack = [...rootNodeIndices];
    while (stack.length) {
      const index = stack.pop();
      const node = nodes[index];
      
      nodeDescriptors[index].children?.forEach(childIndex => {
        const child = nodes[childIndex];
        stack.push(childIndex);
        
        node.children.push(child);
        child.parent = node;
      });
    }
    
    const rootNode = new SceneGraphNode();
    
    rootNodeIndices.forEach(index => {
      rootNode.children.push(nodes[index]);
      nodes[index].parent = rootNode;
    });
    
    rootNode.update();
    return rootNode;
  }
  
  // parse tree from GLTF scene-graph descriptor format
  static fromGltf(gltf, scene) {
    const nodes = gltf.nodes.map(descriptor => {
      if ('mesh' in descriptor) {
        const {mesh: index} = descriptor;
        
        let min = new Array(3).fill(+Infinity);
        let max = new Array(3).fill(-Infinity);
        
        // extract min/max bounding box values from mesh primitives
        for (const {attributes: {POSITION}} of gltf.meshes[index].primitives) {
          const {min: pMin, max: pMax} = gltf.accessors[POSITION];
          
          min = min.map((n, i) => Math.min(n, pMin[i]));
          max = max.map((n, i) => Math.max(n, pMax[i]));
        }
        
        return new MeshNode({
          ...descriptor,
          mesh: {
            index,
            boundingBox: {min, max},
          },
        });
      } else if ('camera' in descriptor) {
        const camera = gltf.cameras[descriptor.camera];
        
        if (camera.type === 'perspective') {
          const {
            yfov: fov,
            znear: near,
            zfar: far = near * 1.1,
          } = camera.perspective;
          
          return new CameraNode({
            ...descriptor,
            camera: {fov, near, far},
          });
        } else {
          // orthographic camera is not supported yet
          // TODO: implement orthographic camera
          debugger;
        }
      } else {
        return new SceneGraphNode(descriptor);
      }
    });
    
    const stack = [...scene.nodes];
    while (stack.length) {
      const index = stack.pop();
      const node = nodes[index];
      
      gltf.nodes[index].children?.forEach(childIndex => {
        const child = nodes[childIndex];
        stack.push(childIndex);
        
        node.children.push(child);
        child.parent = node;
      });
    }
    
    const rootNode = new SceneGraphNode();
    
    scene.nodes.forEach(index => {
      rootNode.children.push(nodes[index]);
      nodes[index].parent = rootNode;
    });
    
    rootNode.update();
    return rootNode;
  }
}

export class MeshNode extends SceneGraphNode {
  static [ActiveNodeEditor.editableProperties] = [
    ...super[ActiveNodeEditor.editableProperties],
    {prop: 'mesh.index', mutable: false, displayName: 'Mesh Index'},
  ];
  
  mesh = {};
  
  // construct from JSON-friendly descriptor
  constructor({
    mesh: {
      renderable = false,
      index,
      boundingBox: {min, max},
    },
    ...descriptor
  }) {
    super(descriptor);
    
    this.mesh.renderable = renderable;
    this.mesh.index = index;
    this.mesh.boundingBox = new AABB(...min, ...max);
  }
  
  // helper method for serialization
  getJsonData() {
    return {
      mesh: {
        renderable: this.mesh.renderable,
        index: this.mesh.index,
        boundingBox: {
          min: [...this.mesh.boundingBox.min],
          max: [...this.mesh.boundingBox.max],
        },
      },
      ...super.getJsonData(),
    };
  }
  
  get type() {
    return 'MeshNode';
  }
  
  get index() {
    return this.mesh.index;
  }
}

export class CameraNode extends SceneGraphNode {
  static [ActiveNodeEditor.editableProperties] = [
    ...super[ActiveNodeEditor.editableProperties],
    {prop: 'focalDistance', mutable: true, triggerUpdate: true, displayName: 'Focal Distance'},
    {prop: 'lensRadius', mutable: true, triggerUpdate: true, displayName: 'Lens Radius'},
    {prop: 'displayFocalPlane', mutable: true, displayName: 'Show Focal Plane'},
  ];
  
  static FAR_OFFSET = 10;
  
  camera = {};
  projectionMatrix = new Matrix4();
  
  #focalDistance = 1;
  lensRadius = 0;
  displayFocalPlane = true;
  
  // construct from JSON-friendly descriptor
  constructor({
    camera: {
      fov,
      near,
      far = near * 20,
    },
    ...descriptor
  }) {
    super(descriptor);
    
    this.camera.fov = fov;
    this.camera.near = near;
    this.camera.far = far;
  }
  
  // helper method for serialization
  getJsonData() {
    return {
      camera: {
        fov: this.camera.fov,
        near: this.camera.near,
        far: this.camera.far,
      },
      ...super.getJsonData(),
    };
  }
  
  getProjectionMatrix(aspectRatio) {
    return new Matrix4().perspectiveWithFarPlane(
      this.camera.fov,
      this.camera.near,
      this.camera.far,
      aspectRatio,
    );
  }
  
  updateProjectionMatrix(aspectRatio) {
    this.projectionMatrix.infinitePerspective(
      this.camera.fov,
      this.camera.near,
      aspectRatio,
    );
    
    return this;
  }
  
  get focalDistance() {
    return this.#focalDistance;
  }
  
  set focalDistance(value) {
    if (value !== 0) {
      this.#focalDistance = value;
    }
  }
  
  get type() {
    return 'CameraNode';
  }
}