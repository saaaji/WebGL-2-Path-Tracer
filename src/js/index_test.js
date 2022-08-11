import { MeshBlas } from './utilities/primitives.js';
import { BinaryBVH } from './accel/BVHNode.js';
import { encodeHydra, decodeHydra } from './loading/hydra.js';
import { bufferToImage, loadImage, clamp, createEnum } from './utilities/util.js';
import { Pipeline, ShaderFragmentDirectory, ShaderLib, PipelineDir } from './utilities/shaders.js';
import { SceneGraphNode } from './utilities/SceneGraphNode.js';
import { Matrix4 } from './math/Matrix4.js';
import { Quaternion } from './math/Quaternion.js';
import { HdrLoader, computeHdrSamplingDistributions } from './loading/HdrLoader.js';
import { UboBuilder } from './utilities/util.js';
import { Vector3 } from './math/Vector3.js';
import { OrbitalCamera } from './utilities/OrbitCamera.js';
import { FrameGraph, FrameGraphTextureResource } from './utilities/RenderGraph.js';
import { DisplayConsole } from './utilities/Console.js';
import { ActiveNodeEditor } from './utilities/ActiveNodeEditor.js';
import {
  CAMERA_VERTICES,
  CAMERA_INDICES,
  FOCAL_DIST_PLANE_VERTICES,
  FOCAL_DIST_OUTLINE_VERTICES,
} from './utilities/constants.js';

// DEBUG
window.Quat = Quaternion;
window.BinaryBVH = BinaryBVH;
window.DisplayConsole = DisplayConsole;
window.ActiveNodeEditor = ActiveNodeEditor;
window.SceneGraphNode = SceneGraphNode;

const MIN_WIDTH = 200;
const MIN_HEIGHT = 200;
const MAX_WIDTH = 800;
const MAX_HEIGHT = 600;

window.PREVIEW_BG_COLOR = [0.2, 0.2, 0.2];
window.CAMERA_COLOR = new Array(3).fill(0.15);
window.PREVIEW_VIS_COLOR = [0.8, 0.8, 0.8];
window.PREVIEW_SELECTION_COLOR = [1, 0.6, 0];
window.FLAG = false;
window.TEST = [0, 0.6, 1];

const PREVIEW_SCALE = 512;
const SSAA_LEVEL = Math.pow(2, 2);

// EventTarget base class for MVC framework
class EventTarget {
  #listeners = new Map();
  
  addEventListener(name, listener) {
    if (!this.#listeners.has(name)) {
      this.#listeners.set(name, new Set());
    }
    
    this.#listeners.get(name).add(listener);
  }
  
  removeEventListener(name, listener) {
    this.#listeners.get(name)?.delete(listener);
    
    if (this.#listeners.get(name)?.size === 0) {
      this.#listeners.delete(name);
    }
  }
  
  dispatchEvent(name, data) {
    this.#listeners.get(name)?.forEach(listener => listener.call(this, data));
  }
}

class View extends EventTarget {
  static BINARY_DOWNLOAD_IMAGE_SRC = './assets/images/bin.png';
  static THUMBNAIL_IMAGE_HEIGHT = 100;
  
  pauseBtn = document.getElementById('pause');
  renderBtn = document.getElementById('render');
  exportBtn = document.getElementById('export');
  saveBtn = document.getElementById('save');
  chooseSceneBtn = document.getElementById('import-scene');
  chooseModelBtn = document.getElementById('export-scene');
  
  envMapInput = document.getElementById('choose-hdri');
  widthInput = document.getElementById('viewport-width');
  heightInput = document.getElementById('viewport-height');
  numWorkGroupsXInput = document.getElementById('tile-count-x');
  numWorkGroupsYInput = document.getElementById('tile-count-y');
  emissiveFactorInput = document.getElementById('emissive-factor');
  
  treeViewer = document.getElementById('tree-viewer');
  canvas = document.getElementById('hydra-canvas');
}

class Controller {
  #model;
  #view;
  
  paused = false;
  
  get model() {
    return this.#model;
  }
  
  get view() {
    return this.#view;
  }
  
  constructor() {
    const view = new View();
    const model = new Model(view.canvas);
    
    this.#view = view;
    this.#model = model;
    
    view.renderBtn.disabled = true;
    view.exportBtn.disabled = true;
    
    view.chooseModelBtn.addEventListener('change', function(event) {
      view.exportBtn.disabled = event.target.files.length === 0;
    });
    
    view.exportBtn.addEventListener('click', async function(event) {
      event.target.setAttribute('disabled', '');
      
      const files = view.chooseModelBtn.files;
      const name = files[0].name.replace(/\.[^.]+$/, '.hydra');
      const blob = await encodeHydra(files);
      const file = new File([blob], name);
      
      DisplayConsole.getDefault().logDownloadable`File ready for download: ${file}`;
      event.target.removeAttribute('disabled');
    });
    
    view.chooseSceneBtn.addEventListener('change', function(event) {
      view.renderBtn.disabled = event.target.files.length === 0;
    });
    
    let id = null, threshold = 1;
    
    const render = function render() {
      model.renderSample();
      
      if (model.sampleCount % threshold === 0) {
        // view.saveBtn.click();
        threshold *= 4;
      }
      
      id = window.requestAnimationFrame(render);
    }
    
    model.addEventListener('reset', () => threshold = 1);
    
    view.renderBtn.addEventListener('click', () => {
      window.cancelAnimationFrame(id);
      threshold = 1;
      
      model.loadState(view.chooseSceneBtn.files, {
        canvas: view.canvas,
        treeViewer: view.treeViewer,
        envMap: view.envMapInput.files[0],
        width: clamp(parseInt(view.widthInput.value), 1),
        height: clamp(parseInt(view.heightInput.value), 1),
        numWorkGroupsX: clamp(parseInt(view.numWorkGroupsXInput.value), 1),
        numWorkGroupsY: clamp(parseInt(view.numWorkGroupsYInput.value), 1),
        emissiveFactor: clamp(parseFloat(view.emissiveFactorInput.value), 0),
      }).then(() => {
        this.paused = false;
        view.pauseBtn.src = './assets/images/pause.png';
        
        window.requestAnimationFrame(render);
      });
    });
    
    view.pauseBtn.addEventListener('click', event => {
      this.paused = !this.paused;
      event.target.src = './assets/images/' + (this.paused ? 'play.png' : 'pause.png');
      
      if (id !== null && this.paused) {
        window.cancelAnimationFrame(id);
      } else {
        window.requestAnimationFrame(render);
      }
    });
    
    // view.saveBtn.addEventListener('click', event => {
    //   const data = model.exportSample();
      
    //   if (data) {
    //     // view.appendLink(`${model.sampleCount} spp`, data.url, data.thumbnailUrl);
    //   }
    // });
    
    document.addEventListener('keydown', ({key}) => {
      switch (key) {
        case 'c':
          // model.cycleCamera();
          break;
        case 'r':
          window.cancelAnimationFrame(id);
          model.toggleMode().then(() => window.requestAnimationFrame(render));
          break;
      }
    });
    
    view.treeViewer.addEventListener('change', ({target}) => {
      model.focusedNode = target.selectedNode;
      model.nodeEditor.activeNode = target.selectedNode;
      model.focusedNodes = target.selectedNode.nodes;
    });
    
    let clicked = false;
    // view.canvas.addEventListener('mousedown', () => {
    //   if (model.mode === Model.ModeType.RASTER) {
    //     clicked = true;
    //   }
    // });
    
    // view.canvas.addEventListener('mouseup', () => {
    //   if (model.mode === Model.ModeType.RASTER) {
    //     clicked = false;
    //   }
    // });
    
    document.addEventListener('keydown', ({key}) => {
      if (model.mode === Model.ModeType.RASTER && key === 'g') {
        clicked = true;
      }
    });
    
    document.addEventListener('keyup', ({key}) => {
      if (model.mode === Model.ModeType.RASTER && key === 'g') {
        clicked = false;
      }
    });
    
    // view.canvas.addEventListener('mouseleave', () => {
    //   if (model.mode === Model.ModeType.RASTER) {
    //     clicked = false;
    //   }
    // });
    
    view.canvas.addEventListener('mousemove', ({movementX: dx, movementY: dy, offsetX: x, offsetY: y}) => {
      if (!this.paused && clicked && model.mode === Model.ModeType.RASTER) {
        model.orbitalCamera.pan(dx, dy);
      }
    });
    
    view.canvas.addEventListener('wheel', ({deltaY: dy}) => {
      if (!this.paused && model.mode === Model.ModeType.RASTER) {
        model.orbitalCamera.zoom(dy);
      }
    });
  }
}

class Model extends EventTarget {
  /**
   * Expose publicly:
   *
   */
  
  static EXTENSIONS = [
    'WEBGL_debug_renderer_info',
    'OES_texture_float_linear',
    'EXT_color_buffer_float',
    'EXT_float_blend',
  ];
  
  static SHADERS = [
    'main.glsl',
    'sampleTex.glsl',
    'fullscreenTri.glsl',
    'random.glsl',
    'sample.glsl',
    'intersections.glsl',
    'phong.glsl',
    'copy.glsl',
    'closestHit.glsl',
    'anyHit.glsl',
    'gBufferVert.glsl',
    'gBufferFrag.glsl',
    'SSAA.glsl',
    'outline.glsl',
    'composite.glsl',
    'icons.glsl',
    'cameraFrag.glsl',
    'gradient.glsl',
  ];
  
  static ModeType = createEnum(
    'RTX',
    'RASTER',
  );
  
  sampleCount = 0;
  imageOptions = {};
  
  sceneGraph = null;
  focusedNode = null;
  focusedNodes = null;
  
  orbitalCamera = new OrbitalCamera(.01, .95, 50);
  
  mode = Model.ModeType.RASTER;
  initialized = false;
  nodeEditor = new ActiveNodeEditor(document.querySelector('#active-node-container'), () => {
    if (this.mode === Model.ModeType.RTX) {
      this.resetSamples();
    }
  });
  
  cameraIndex = 0;
  currentCamera = null;
  
  constructor(canvas = document.createElement('canvas')) {
    super();
    
    // initialize context
    this.canvas = canvas;
    const gl = this.gl = canvas.getContext('webgl2');
    
    // initialize extensions
    const [debugExt] = Model.EXTENSIONS.map(name => {
      const extension = gl.getExtension(name);
      if (extension !== null) {
        return extension;
      } else {
        throw new Error(`WebGL extension '${name}' is not supported`);
      }
    });
    
    DisplayConsole.getDefault().log(
`Vendor: ${gl.getParameter(debugExt.UNMASKED_VENDOR_WEBGL)}
Renderer: ${gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL)}`
    );
  }
  
  resizeCanvas(width, height) {
    const canvas = this.gl.canvas;
    const aspect = width / height;
  
    canvas.height = clamp(height, MIN_HEIGHT, MAX_HEIGHT);
    canvas.width = canvas.height * aspect;
    canvas.width = clamp(canvas.width, MIN_WIDTH, MAX_WIDTH);
    canvas.height = canvas.width / aspect;
    
    // return new dimensions
    return [canvas.width, canvas.height];
  }
  
  async loadState(files, {
      envMap,
      width,
      height,
      numWorkGroupsX,
      numWorkGroupsY,
      emissiveFactor,
      focalDistance,
      lensRadius,
      treeViewer,
      canvas,
  }) {
    const gl = this.gl;
    const [json, binary] = await decodeHydra(files);
    
    this.currentAsset = [json, binary];
    this.sampleCount = 0;
    
    this.nodeEditor.activeNode = null;
    
    // reset image options
    this.imageOptions.width = width;
    this.imageOptions.height = height;
    this.imageOptions.tileWidth = Math.floor(width / numWorkGroupsX);
    this.imageOptions.tileHeight = Math.floor(height / numWorkGroupsY);
    
    // resize canvas
    this.resizeCanvas(width, height);
    
    // compute matrices
    this.sceneGraph = SceneGraphNode.deserialize(json.tree);
    treeViewer.tree = this.sceneGraph;
    
    const cameras = this.sceneGraph.nodes.filter(node => node.type === 'CameraNode');
    
    this.cameraIndex = 0;
    [this.currentCamera] = cameras;
    
    cameras.forEach(camera => camera.updateProjectionMatrix(width / height));
    
    const projectionMatrix = new Matrix4().infinitePerspective(Math.PI/4, .01, width / height);
    this.orbitalCamera.projectionMatrix.copy(projectionMatrix);
    
    const drawingBufferWidth = canvas.width * SSAA_LEVEL;
    const drawingBufferHeight = canvas.height * SSAA_LEVEL;
    
    // rebuild shader library on each reload (enables shader hot-reloading)
    const dir = new ShaderFragmentDirectory('./assets/shaders/');
    const lib = this.lib = new ShaderLib();
    await Promise.all(Model.SHADERS.map(name => dir.registerModule(name)));
    
    const gBufferShader = lib.addShader('g-buffer-shader', gl, {
      vertexSource: dir.fetchModule('gBufferVert.glsl'),
      fragmentSource: dir.fetchModule('gBufferFrag.glsl'),
    });
    
    const cameraShader = lib.addShader('camera-shader', gl, {
      vertexSource: dir.fetchModule('icons.glsl'),
      fragmentSource: dir.fetchModule('cameraFrag.glsl'),
    });
    
    const rtxMegakernel = lib.addShader('rtx-megakernel', gl, {
      vertexSource: dir.fetchModule('fullscreenTri.glsl'),
      fragmentSource: dir.fetchModule('main.glsl'),
    });
    
    const tonemapShader = lib.addShader('tonemap-shader', gl, {
      vertexSource: dir.fetchModule('fullscreenTri.glsl'),
      fragmentSource: dir.fetchModule('sampleTex.glsl'),
    });
    
    const copyShader = lib.addShader('copy-shader', gl, {
      vertexSource: dir.fetchModule('fullscreenTri.glsl'),
      fragmentSource: dir.fetchModule('copy.glsl'),
    });
    
    gBufferShader.uniforms.set('u_projectionMatrix', this.orbitalCamera.projectionMatrix);
    gBufferShader.uniforms.set('u_viewMatrix', this.orbitalCamera.viewMatrix);
    
    cameraShader.uniforms.set('u_projectionMatrix', this.orbitalCamera.projectionMatrix);
    cameraShader.uniforms.set('u_viewMatrix', this.orbitalCamera.viewMatrix);
    
    this.orbitalCamera.onchange = () => {
      gBufferShader.uniforms.set('u_viewMatrix', this.orbitalCamera.viewMatrix);
      cameraShader.uniforms.set('u_viewMatrix', this.orbitalCamera.viewMatrix);
    };
    
    // initialize frame graph
    this.frameGraph?.clear();
    const frameGraph = this.frameGraph = new FrameGraph(gl);
    
    /**
     * Frame graph resource allocation
     */
     
    // G-buffer attachments
    frameGraph.createTexture('g-color0', FrameGraphTextureResource.TEXTURE_2D, (gl, texture) => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, drawingBufferWidth, drawingBufferHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    });
    
    frameGraph.createTexture('g-normals', FrameGraphTextureResource.TEXTURE_2D, (gl, texture) => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, drawingBufferWidth, drawingBufferHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    });
    
    frameGraph.createTexture('g-depth', FrameGraphTextureResource.TEXTURE_2D, (gl, texture) => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT32F, drawingBufferWidth, drawingBufferHeight, 0, gl.DEPTH_COMPONENT, gl.FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    });
    
    // Outline pass attachments
    frameGraph.createTexture('outlines', FrameGraphTextureResource.TEXTURE_2D, (gl, texture) => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, drawingBufferWidth, drawingBufferHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    });
    
    frameGraph.createTexture('outlines-fixed', FrameGraphTextureResource.TEXTURE_2D, (gl, texture) => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, drawingBufferWidth, drawingBufferHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    });
    
    frameGraph.createRenderbuffer('outline-mask', (gl, renderbuffer) => {
      gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, drawingBufferWidth, drawingBufferHeight);
    });
    
    // Composite surface
    frameGraph.createTexture('composite', FrameGraphTextureResource.TEXTURE_2D, (gl, texture) => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, drawingBufferWidth, drawingBufferHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    });
    
    // RTX kernel I/O
    frameGraph.createTexture('accumulation-buffer', FrameGraphTextureResource.TEXTURE_2D, (gl, texture) => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    });
    
    frameGraph.createTexture('present-buffer', FrameGraphTextureResource.TEXTURE_2D, (gl, texture) => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    });
    
    const atlasImage = await bufferToImage(getBufferView(json, binary, json.atlas.bufferView));
    
    frameGraph.createTexture('texture-atlas', FrameGraphTextureResource.TEXTURE_2D_ARRAY, (gl, texture) => {
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
      gl.texImage3D(
        gl.TEXTURE_2D_ARRAY,
        0,
        gl.SRGB8_ALPHA8,
        json.atlas.size.width,
        json.atlas.size.height,
        json.atlas.size.depth,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        atlasImage,
      );
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    });
    
    frameGraph.createTexture('accel-struct', FrameGraphTextureResource.TEXTURE_2D, (gl, texture) => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    });
    
    let hdrWidth, hdrHeight, hdrData, marginalDist, conditionalDist;
    
    if (envMap) {
      const loader = new HdrLoader();
      const {width, height, data} = await loader.parse(envMap);
      hdrWidth = width;
      hdrHeight = height;
      hdrData = data;
      
      const {marginalDistribution, conditionalDistribution} = computeHdrSamplingDistributions(hdrWidth, hdrHeight, hdrData);
      marginalDist = marginalDistribution;
      conditionalDist = conditionalDistribution;
    }
    
    frameGraph.createTexture('hdr', FrameGraphTextureResource.TEXTURE_2D, (gl, texture) => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      
      if (envMap) {
        rtxMegakernel.uniforms.set('u_useEnvMap', Number(true));
        rtxMegakernel.uniforms.set('u_hdrRes', [hdrWidth, hdrHeight]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB32F, hdrWidth, hdrHeight, 0, gl.RGB, gl.FLOAT, hdrData);
      } else {
        rtxMegakernel.uniforms.set('u_useEnvMap', Number(false));
        rtxMegakernel.uniforms.set('u_hdrRes', [1, 1]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, null);
      }
    });
    
    frameGraph.createTexture('hdr-marginal-distribution', FrameGraphTextureResource.TEXTURE_2D, (gl, texture) => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      
      if (envMap) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, hdrHeight, 1, 0, gl.RG, gl.FLOAT, marginalDist);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, null);
      }
    });
    
    frameGraph.createTexture('hdr-conditional-distribution', FrameGraphTextureResource.TEXTURE_2D, (gl, texture) => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      
      if (envMap) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, hdrHeight, hdrWidth, 0, gl.RG, gl.FLOAT, conditionalDist);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, null);
      }
    });
    
    /**
     * Initialize vertex arrays
     */
     
    // upload interleaved scene geometry
    frameGraph.createVertexArray('scene-geometry', (gl, vertexArray) => {
      gl.bindVertexArray(vertexArray);
      
      const dataTextureBuffer = getBufferView(json, binary, json.dataTextures.bufferView);
    
      gl.bindBuffer(gl.ARRAY_BUFFER, frameGraph.createBuffer('scene-vertices'));
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, frameGraph.createBuffer('scene-indices'));
      gl.bufferData(gl.ARRAY_BUFFER, dataTextureBuffer, gl.STATIC_DRAW);
      
      json.dataTextures.descriptors.forEach(({name, type, offset, numComponents}, i) => {
        switch (name) {
          case 'FACE':
            const indexBuffer = gl.createBuffer();
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, dataTextureBuffer.slice(offset), gl.STATIC_DRAW);
            break;
          case 'VERTEX':
          case 'NORMAL':
            const location = gBufferShader.attribs.get(`a_${name}`);
            gl.vertexAttribPointer(location, numComponents, type, false, 0, offset);
            gl.enableVertexAttribArray(location);
            break;
        }
      });
      
      gl.bindVertexArray(null);
    });

    const dataTextureBuffer = getBufferView(json, binary, json.dataTextures.bufferView);
    
    frameGraph.createBuffer('unpack-buffer', (gl, buffer) => {
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, buffer);
      gl.bufferData(gl.PIXEL_UNPACK_BUFFER, dataTextureBuffer, gl.STATIC_DRAW);
    });
    
    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, frameGraph.getBuffer('unpack-buffer'));
;
    json.dataTextures.descriptors.forEach(({name, internalFormat, width, height, format, type, offset, numComponents}, i) => {
      switch (name) {
        case 'ACCEL':
          frameGraph.createTexture(name, FrameGraphTextureResource.TEXTURE_2D_ARRAY, (gl, texture) => {
            gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            // gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, offset);
            
            // BLAS + TLAS (depth = 2)
            // gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA32F, width+1, width+1, 1, 0, gl.RGBA, gl.FLOAT, 0);
            // gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, internalFormat, width, height, 2);
            // gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 0, width, height, 1, format, type, offset);
          });
          break;
        default:
          frameGraph.createTexture(name, FrameGraphTextureResource.TEXTURE_2D, (gl, texture) => {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, offset);
          });
      }
    });
    
    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
    
    // upload inline camera geometry
    frameGraph.createVertexArray('camera-frustum', (gl, vertexArray) => {
      gl.bindVertexArray(vertexArray);
      gl.bindBuffer(gl.ARRAY_BUFFER, frameGraph.createBuffer('camera-frustum-vertices'));
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, frameGraph.createBuffer('camera-frustum-indices'));
      
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(CAMERA_VERTICES), gl.STATIC_DRAW);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(CAMERA_INDICES), gl.STATIC_DRAW);
      
      gl.vertexAttribPointer(cameraShader.attribs.get('a_position'), 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(cameraShader.attribs.get('a_position'));
    });
    
    frameGraph.createVertexArray('camera-up-vector', (gl, vertexArray) => {
      const scale = 0.3;
      const offset = 0.15;
      const ndcMax = 1;
      const aspectRatio = width / height;
      
      gl.bindVertexArray(vertexArray);
      gl.bindBuffer(gl.ARRAY_BUFFER, frameGraph.createBuffer('VAO_DEBUG_VERT'));
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -scale, ndcMax + offset, ndcMax,
        +scale, ndcMax + offset, ndcMax,
        0, ndcMax + offset + (aspectRatio * scale * Math.sqrt(3)) / 2, ndcMax,
      ]), gl.STATIC_DRAW);
      
      gl.vertexAttribPointer(cameraShader.attribs.get('a_position'), 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(cameraShader.attribs.get('a_position'));
    });
    
    frameGraph.createVertexArray('camera-focal-plane', (gl, vertexArray) => {
      gl.bindVertexArray(vertexArray);
      gl.bindBuffer(gl.ARRAY_BUFFER, frameGraph.createBuffer('camera-focal-plane-vertices'));
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(FOCAL_DIST_PLANE_VERTICES), gl.STATIC_DRAW);
      
      gl.vertexAttribPointer(cameraShader.attribs.get('a_position'), 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(cameraShader.attribs.get('a_position'));
    });
    
    frameGraph.createVertexArray('camera-focal-plane-outline', (gl, vertexArray) => {
      gl.bindVertexArray(vertexArray);
      gl.bindBuffer(gl.ARRAY_BUFFER, frameGraph.createBuffer('camera-focal-plane-outline-vertices'));
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(FOCAL_DIST_OUTLINE_VERTICES), gl.STATIC_DRAW);
      
      gl.vertexAttribPointer(cameraShader.attribs.get('a_position'), 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(cameraShader.attribs.get('a_position'));
    });
    
    /**
     * Initialize G-buffer pass
     */
    frameGraph.addFrame('preview-mode');
    
    const bgShader = new Pipeline(gl, {
      vertexSource: dir.fetchModule('fullscreenTri.glsl'),
      fragmentSource: dir.fetchModule('gradient.glsl'),
    })
    
    // const backgroundPass = frameGraph.addPass('preview-mode', 'bg-pass', (gl, vertexArrays, textureBindings) => {
    //   gl.viewport(0, 0, drawingBufferWidth, drawingBufferHeight);
    //   gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    //   // gl.enable(gl.DEPTH_TEST);
    //   gl.clearColor(0, 0, 0, 0);
    //   gl.clear(gl.COLOR_BUFFER_BIT);
      
    //   gl.bindVertexArray(null);
    //   gl.drawArrays(gl.TRIANGLES, 0, 3);
    // });
    
    // backgroundPass.addColorOutput('g-color0');
     
    const gBufferPass = frameGraph.addPass('preview-mode', 'g-buffer-pass', (gl, vertexArrays, textureBindings) => {
      gl.viewport(0, 0, drawingBufferWidth, drawingBufferHeight);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      gl.clearColor(0, 0, 1, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      
      // set pipeline
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      gl.disable(gl.DEPTH_TEST);
      
      bgShader.bind(gl);
      
      gl.bindVertexArray(null);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      
      // set pipeline state
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      
      const [minWidth, maxWidth] = gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE);
      
      // draw scene geometry from interleaved buffer
      gl.bindVertexArray(vertexArrays.get('scene-geometry'));
      this.sceneGraph.nodes.filter(node => node.type === 'MeshNode').forEach(node => {
        const descriptor = json.meshDescriptors.find(d => d.meshIndex === node.mesh.index);
        const color = (this.focusedNode === node || this.focusedNodes?.includes(node)) ? PREVIEW_SELECTION_COLOR : PREVIEW_VIS_COLOR;
        
        gBufferShader.uniforms.set('u_worldMatrix', node.worldMatrix);
        gBufferShader.uniforms.set('u_visColor', color);
        gBufferShader.bind(gl);
        
        gl.drawElements(gl.TRIANGLES, descriptor.count, gl.UNSIGNED_INT, descriptor.start * Uint32Array.BYTES_PER_ELEMENT);
      });
    });
    
    // specify pass outputs
    gBufferPass.addColorOutput('g-color0');
    gBufferPass.addColorOutput('g-normals');
    gBufferPass.setDepthOutput('g-depth');
    
    /**
     * Initialize outline pass
     */
    const outlineShader = new Pipeline(gl, {
      vertexSource: dir.fetchModule('fullscreenTri.glsl'),
      fragmentSource: dir.fetchModule('outline.glsl'),
    });
    
    // upload static uniforms
    outlineShader.uniforms.set('u_resolution', [drawingBufferWidth, drawingBufferHeight]);
    outlineShader.uniforms.set('u_zNear', .01);
    
    // create pass
    const outlinePass = frameGraph.addPass('preview-mode', 'outline-pass', (gl, vertexArrays, textureBindings) => {
      // clear buffers
      gl.clearColor(0, 0, 0, 0);
      gl.clearDepth(1);
      gl.clearStencil(1); // clear to 1: nothing masked out (yet)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      
      // set pipeline state
      gl.viewport(0, 0, drawingBufferWidth, drawingBufferHeight);
      gl.enable(gl.STENCIL_TEST);
      gl.enable(gl.DEPTH_TEST);
      gl.stencilMask(0xFF); // don't mask
      gl.colorMask(false, false, false, false); // don't write to color buffers
      gl.stencilFunc(gl.ALWAYS, 1, 0xFF); // always pass stencil test, set reference value to 1 (and don't mask)
      
      const [minWidth, maxWidth] = gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE);
      
      // if fragment passes stencil & depth tests, set stencil to 0 (disables outlines for gizmos)
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.ZERO);
      
      // must draw remaining scene to account for depth
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE); // if fragment passes stencil & depth tests, set stencil to reference value (1)
      
      // write scene to stencil buffer
      gl.bindVertexArray(vertexArrays.get('scene-geometry'));
      this.sceneGraph.nodes.filter(node => node.type === 'MeshNode').forEach(node => {
        const descriptor = json.meshDescriptors.find(d => d.meshIndex === node.mesh.index);
        const color = (this.focusedNode === node || this.focusedNodes?.includes(node)) ? PREVIEW_SELECTION_COLOR : PREVIEW_VIS_COLOR;
        
        gBufferShader.uniforms.set('u_worldMatrix', node.worldMatrix);
        gBufferShader.uniforms.set('u_visColor', color);
        gBufferShader.bind(gl);
        
        gl.drawElements(gl.TRIANGLES, descriptor.count, gl.UNSIGNED_INT, descriptor.start * Uint32Array.BYTES_PER_ELEMENT);
      });
      
      gl.stencilFunc(gl.EQUAL, 1, 0xFF); // pass the stencil test if value in stencil buffer equals reference value
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP); // disable writes to stencil buffer
      gl.colorMask(true, true, true, true); // enable writes to color buffers
      
      // dispatch outline kernel
      outlineShader.uniforms.set('u_normals', textureBindings['g-normals']);
      outlineShader.uniforms.set('u_depth', textureBindings['g-depth']);
      outlineShader.bind(gl);
      
      gl.bindVertexArray(null);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      
      // reset state
      gl.disable(gl.STENCIL_TEST);
    });
    
    // specify pass I/O
    outlinePass.addAttachmentInput('g-normals', gBufferPass);
    outlinePass.addAttachmentInput('g-depth', gBufferPass);
    outlinePass.addColorOutput('outlines');
    outlinePass.setDepthStencilOutput('outline-mask');
    
    /**
     * FIX OUTLINES
     */
    const fixPass = frameGraph.addPass('preview-mode', 'fix-pass', (gl, vertexArrays, textureBindings) => {
      // set pipeline state
      gl.viewport(0, 0, drawingBufferWidth, drawingBufferHeight);
      gl.enable(gl.DEPTH_TEST);
      
      const [minWidth, maxWidth] = gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE);
      gl.lineWidth(maxWidth);
      
      // draw additional visualizations
      /*
      
      color(RGBA) = (sourceColor * sfactor) + (destinationColor * dfactor)
      
      sfactor = SRC_ALPHA
      dfactor = ONE_MINUS_SRC_ALPHA
      
      vec3(0, 0, 0) * 1 + vec3(0) * 1
      vec3(1, 1, 1) * 1 + vec3(0) * 1
      
      vec3(0, 0, 0) * SRC_ALPHA(1) + vec3(0.5) * (1 - SRC_ALPHA(1) = 0)
      vec3(1, 1, 1) * SRC_ALPHA(1) + vec3()
      
      */
      const blendParams = [
        [0, gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA],
        [1, gl.DST_ALPHA, gl.ONE_MINUS_DST_ALPHA],
      ];
      
      const getBufferList = n => {
        const a = new Array(2).fill(gl.NONE);
        a[n] = gl.COLOR_ATTACHMENT0 + n;
        return a;
      }
      
      const cameras = this
        .sceneGraph
        .nodes
        .filter(node => node.type === 'CameraNode')
        // bubble selected camera to end of list
        .sort(c => c === this.focusedNode ? +1 : -1);
      
      gl.enable(gl.BLEND);
      gl.depthFunc(gl.LEQUAL);
      cameras.forEach(node => {
        const focused = this.focusedNode === node || this.focusedNodes?.includes(node);
        
        const color = focused ? PREVIEW_SELECTION_COLOR : CAMERA_COLOR;
        const proj = node.getProjectionMatrix(width / height);
        
        cameraShader.uniforms.set('u_worldMatrix', node.worldMatrix);
        cameraShader.uniforms.set('u_inverseProjectionMatrix', proj.inverse);
        cameraShader.uniforms.set('u_visColor', color);
        cameraShader.uniforms.set('u_alpha', focused ? 1 : 1);
        cameraShader.uniforms.set('u_ndcZ', proj._getNdcDepth(-node.focalDistance));
        cameraShader.uniforms.set('u_overrideZ', false);
        cameraShader.bind(gl);
        
        for (const [buffer, sFactor, dFactor] of blendParams) {
          gl.drawBuffers(getBufferList(buffer));
          gl.blendFunc(sFactor, dFactor);
          
          gl.bindVertexArray(vertexArrays.get('camera-frustum'));
          gl.drawElements(gl.LINES, CAMERA_INDICES.length, gl.UNSIGNED_SHORT, 0);
          gl.bindVertexArray(vertexArrays.get('camera-up-vector'));
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        
        cameraShader.uniforms.set('u_visColor', window.TEST);
        if (this.focusedNode === node && node.displayFocalPlane) {
          for (const [buffer, sFactor, dFactor] of blendParams) {
            gl.drawBuffers(getBufferList(buffer));
            gl.blendFunc(sFactor, dFactor);
            
            cameraShader.uniforms.set('u_overrideZ', true);
            cameraShader.uniforms.set('u_alpha', 1);
            cameraShader.bind(gl);
            
            gl.bindVertexArray(vertexArrays.get('camera-focal-plane-outline'));
            gl.drawArrays(gl.LINES, 0, FOCAL_DIST_OUTLINE_VERTICES.length / 3);
            gl.bindVertexArray(vertexArrays.get('camera-up-vector'));
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            
            cameraShader.uniforms.set('u_alpha', 0.3);
            cameraShader.bind(gl);
            
            gl.bindVertexArray(vertexArrays.get('camera-focal-plane'));
            gl.drawArrays(gl.TRIANGLES, 0, 6);
          }
        }
      });
      gl.disable(gl.BLEND);
    });
    
    fixPass.addTextureDependency('outlines', outlinePass);
    fixPass.addColorOutput('g-color0');
    fixPass.addColorOutput('outlines');
    fixPass.setDepthOutput('g-depth');
    
    /**
     * Initialize composite pass
     */
    const compositeShader = new Pipeline(gl, {
      vertexSource: dir.fetchModule('fullscreenTri.glsl'),
      fragmentSource: dir.fetchModule('composite.glsl'),
    });
    
    // create pass
    const compositePass = frameGraph.addPass('preview-mode', 'composite-pass', (gl, vertexArrays, textureBindings) => {
      // set pipeline state
      gl.viewport(0, 0, drawingBufferWidth, drawingBufferHeight);
      gl.clearColor(...PREVIEW_BG_COLOR, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      
      // dispatch draw call
      compositeShader.uniforms.set('u_albedo', textureBindings['g-color0']);
      compositeShader.uniforms.set('u_normals', textureBindings['g-normals']);
      compositeShader.uniforms.set('u_outlineMask', textureBindings['outlines']);
      compositeShader.bind(gl);
      
      gl.bindVertexArray(null);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
    
    // specify pass I/O
    compositePass.addAttachmentInput('g-color0', fixPass);
    compositePass.addAttachmentInput('g-normals', gBufferPass);
    compositePass.addAttachmentInput('outlines', outlinePass);
    compositePass.addColorOutput('composite');
    
    /**
     * Initialize SSAA pass
     */
    const ssaaShader = new Pipeline(gl, {
      vertexSource: dir.fetchModule('fullscreenTri.glsl'),
      fragmentSource: dir.fetchModule('SSAA.glsl'),
    });
    
    // upload static uniforms
    ssaaShader.uniforms.set('u_resolution', [drawingBufferWidth, drawingBufferHeight]);
    ssaaShader.uniforms.set('u_ssaaLevel', SSAA_LEVEL);
    
    // create pass
    const ssaaPass = frameGraph.addPass('preview-mode', 'ssaa-pass', (gl, vertexArrays, textureBindings) => {
      // set pipeline state
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      
      // dispatch SSAA kernel
      ssaaShader.uniforms.set('u_screenTexture', textureBindings['composite']);
      ssaaShader.bind(gl);
      
      gl.bindVertexArray(null);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
    
    // specify pass inputs
    ssaaPass.addAttachmentInput('composite', compositePass);
    
    // build frame graph
    frameGraph.build('preview-mode');
    
    /**
     * Initialize RTX frame graph
     */
    frameGraph.addFrame('rtx');
    
    rtxMegakernel.uniforms.set('u_resolution', [width, height]);
    rtxMegakernel.uniforms.set('u_atlasResolution', [json.atlas.size.width, json.atlas.size.height]);
    rtxMegakernel.uniforms.set('u_emissiveFactor', emissiveFactor);
    rtxMegakernel.uniforms.set('u_lensRadius', 0);
    rtxMegakernel.uniforms.set('u_focalDistance', 1);
    
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    
    let avg = 0;
    
    let table = '';
    
    const rtxPass = frameGraph.addPass('rtx', 'rtx-pass', (gl, vertexArrays, textureBindings) => {
      const {width, height, tileWidth, tileHeight} = this.imageOptions;
      
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE);
      
      rtxMegakernel.uniforms.set('u_currentSample', this.sampleCount);
      rtxMegakernel.uniforms.set('u_textureAtlas', textureBindings['texture-atlas']);
      rtxMegakernel.uniforms.set('u_envMap', textureBindings['hdr']);
      rtxMegakernel.uniforms.set('u_marginalDistribution', textureBindings['hdr-marginal-distribution']);
      rtxMegakernel.uniforms.set('u_conditionalDistribution', textureBindings['hdr-conditional-distribution']);
      
      rtxMegakernel.uniforms.set('u_lensRadius', this.currentCamera.lensRadius);
      rtxMegakernel.uniforms.set('u_focalDistance', this.currentCamera.focalDistance);
      
      rtxMegakernel.uniforms.set('u_projectionMatrixInverse', this.currentCamera.projectionMatrix);
      rtxMegakernel.uniforms.set('u_projectionMatrixInverse', this.currentCamera.projectionMatrix.inverse);
      rtxMegakernel.uniforms.set('u_cameraMatrix', this.currentCamera.worldMatrix);
      
      json.dataTextures.descriptors.forEach(({name, width, height}) => {
        rtxMegakernel.uniforms.set(`u_${name}.sampler`, textureBindings[name]);
        rtxMegakernel.uniforms.set(`u_${name}.size`, [width, height]);
      });
      
      rtxMegakernel.uniforms.set('u_accelStruct.sampler', textureBindings['accel-struct']);
      
      rtxMegakernel.bind(gl);
      gl.bindVertexArray(null);
      
      
      const query = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
      
      for (let x = 0; x < width; x += tileWidth) {
        for (let y = 0; y < height; y += tileHeight) {
          gl.viewport(x, y, tileWidth, tileHeight);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
      }
      
      this.sampleCount++;
      
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      let s = this.sampleCount;
      window.requestAnimationFrame(function check() {
        if (gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
          const T = gl.getQueryParameter(query, gl.QUERY_RESULT)/1e+6;
          // console.info(`FRAME TIME: ${(T).toFixed(3)}`);
          avg += T;
          // console.clear();
          DisplayConsole.getDefault().clear();
          DisplayConsole.getDefault().warn(`AVG FRAME TIME: ${(avg / s).toFixed(3)}`);
          
          table += `${s}\t${T}\n`;
          
          if (s === 512) {
            console.info('AVG FRAME TIME (1024):', (avg / s).toFixed(3));
            console.log(table);
          }
          
          if (s % 64 == 0) console.warn(table);
        } else {
          window.requestAnimationFrame(check);
        }
      })
    });
    
    rtxPass.addTextureInput('texture-atlas');
    rtxPass.addTextureInput('accel-struct');
    rtxPass.addTextureInput('hdr');
    rtxPass.addTextureInput('hdr-marginal-distribution');
    rtxPass.addTextureInput('hdr-conditional-distribution');
    json.dataTextures.descriptors.forEach(({name}) => rtxPass.addTextureInput(name));
    rtxPass.addColorOutput('accumulation-buffer');
    
    const tonemapPass = frameGraph.addPass('rtx', 'tonemap-pass', (gl, vertexArrays, textureBindings) => {
      gl.disable(gl.BLEND);
      gl.viewport(0, 0, width, height);
      
      tonemapShader.uniforms.set('u_sampleCountInv', 1 / this.sampleCount);
      tonemapShader.uniforms.set('u_outputImage', textureBindings['accumulation-buffer']);
      tonemapShader.bind(gl);
      
      gl.bindVertexArray(null);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
    
    tonemapPass.addAttachmentInput('accumulation-buffer', rtxPass);
    tonemapPass.addColorOutput('present-buffer');
    
    const copyPass = frameGraph.addPass('rtx', 'copy-pass', (gl, vertexArrays, textureBindings) => {
      gl.viewport(0, 0, canvas.width, canvas.height);
      
      copyShader.uniforms.set('u_outputImage', textureBindings['present-buffer']);
      copyShader.bind(gl);
      
      gl.bindVertexArray(null);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
    
    copyPass.addAttachmentInput('present-buffer', tonemapPass);
    
    frameGraph.build('rtx');
    
    /**
     * Link uniform buffers to shaders
     * TODO: create method?
     */
    {
      let currentUniformBlockBinding = 0;
      
      // link static buffers first
      for (const {name, bufferView} of json.uniformBuffers) {
        frameGraph.createBuffer(name, (gl, buffer) => {
          const data = getBufferView(json, binary, bufferView);
          
          gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);
          gl.bufferData(gl.UNIFORM_BUFFER, data, gl.STATIC_DRAW);
          gl.bindBufferBase(gl.UNIFORM_BUFFER, currentUniformBlockBinding, buffer);
          
          for (const shader of lib.shaders.values()) {
            if (shader.buffers.has(name)) {
              gl.uniformBlockBinding(shader.program, shader.getBufferIndex(name), currentUniformBlockBinding);
            }
          }
        });
        
        // increment block binding
        currentUniformBlockBinding++;
      }
      
      // link dynamic buffers
      for (const {name, size} of [
        {name: 'BlasDescriptors', size: 16 * 9 /* sizeof(BlasDescriptor) */ * 32 /* count */},
      ]) {
        frameGraph.createBuffer(name, (gl, buffer) => {
          gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);
          gl.bufferData(gl.UNIFORM_BUFFER, size, gl.DYNAMIC_DRAW);
          gl.bindBufferBase(gl.UNIFORM_BUFFER, currentUniformBlockBinding, buffer);
          
          lib.shaders.forEach(shader => {
            if (shader.buffers.has(name)) {
              gl.uniformBlockBinding(shader.program, shader.getBufferIndex(name), currentUniformBlockBinding);
            }
          });
        });
        
        // increment block binding
        currentUniformBlockBinding++;
      }
    }
    
    this.resetSamples();
    await this.uploadTopLevelAccelStruct();
  }
  
  // generate & upload per-object BinaryBVH
  async uploadTopLevelAccelStruct() {
    const displayConsole = DisplayConsole.getDefault();
    
    const gl = this.gl;
    const [json, binary] = this.currentAsset;
    
    // collect meshes
    const meshes = this.sceneGraph.nodes
      .filter(node => node.type === 'MeshNode')
      .filter(({mesh}) => mesh.renderable)
      // BlasDescriptors must be sorted according to index
      .sort(({mesh: a}, {mesh: b}) => a.index - b.index);
    
    // build top-level hierarchy
    const primitives = meshes.map((mesh, i) => new MeshBlas(mesh, i));
    
    displayConsole.time();
    const tlas = new BinaryBVH(primitives, BinaryBVH.SplitMethod.SAH);
    displayConsole.timeEnd('Per-Object BVH CPU Time');
    
    const builder = new UboBuilder(32 * 16 * 9 /* TODO: fix */);
    const texData = [tlas._serialize()];
    
    // console.log(tlas, texData);
    
    // build BlasDescriptors buffer
    meshes.forEach(node => {
      const {worldMatrix} = node;
      const inverseWorldMatrix = worldMatrix.inverse;
      
      // world matrix
      builder.beginStruct();
      builder.pushFloats(...worldMatrix.column(0));
      builder.pushFloats(...worldMatrix.column(1));
      builder.pushFloats(...worldMatrix.column(2));
      builder.pushFloats(...worldMatrix.column(3));
      
      // inverse world matrix
      builder.pushFloats(...inverseWorldMatrix.column(0));
      builder.pushFloats(...inverseWorldMatrix.column(1));
      builder.pushFloats(...inverseWorldMatrix.column(2));
      builder.pushFloats(...inverseWorldMatrix.column(3));
      
      // texel offset
      const {mesh} = node;
      const {bufferView} = json.objectAccelStructs.find(bvh => mesh.index === bvh.meshIndex);
      const byteOffset = texData.reduce((totalSize, buffer) => totalSize + buffer.byteLength, 0);
      const texelOffset = byteOffset / (4 * Float32Array.BYTES_PER_ELEMENT /* RGBA32F */);
      
      texData.push(getBufferView(json, binary, bufferView));
      builder.pushInts(texelOffset);
      // builder.pushUints(texelOffset);
    });
    
    console.log(builder.rawBuffer);
    
    // update texture data
    const buffer = await new Blob(texData).arrayBuffer();
    const length = buffer.byteLength / (4 * Float32Array.BYTES_PER_ELEMENT /* RGBA32F */);
    
    const size = Math.ceil(Math.sqrt(length));
    const pixels = new Float32Array(size ** 2 * 4);
    
    pixels.set(new Float32Array(buffer));
    
    // displayConsole.time();
    gl.bindTexture(gl.TEXTURE_2D, this.frameGraph.getTexture('accel-struct'));
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, size, size, 0, gl.RGBA, gl.FLOAT, pixels);
    gl.bindTexture(gl.TEXTURE_2D, null);
    // displayConsole.timeEnd('BVH Upload Time');
    
    // update BLAS descriptors to reflect changes in top-level hierarchy
    // displayConsole.time();
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.frameGraph.getBuffer('BlasDescriptors'));
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, builder.rawBuffer);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);
    // displayConsole.timeEnd('BlasDescriptors Upload Time');
    
    const kernel = this.lib.getShader('rtx-megakernel');
    kernel.uniforms.set('u_accelStruct.size', [size, size]);
  }
  
  resetSamples() {
    const gl = this.gl;
    
    // zero sample count
    this.sampleCount = 0;
    
    // clear accumulation buffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameGraph.getFramebuffer('rtx', 'rtx-pass'));
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  
  cycleCamera() {
    const cameras = this.sceneGraph.nodes.filter(node => node.type === 'CameraNode');
    
    this.cameraIndex = (this.cameraIndex + 1) % cameras.length;
    this.currentCamera = cameras[this.cameraIndex];
    
    switch (this.mode) {
      case Model.ModeType.RTX:
        this.resetSamples();
        break;
      case Model.ModeType.RASTER:
        
        break;
    }
  }
  
  async toggleMode() {
    if (this.mode === Model.ModeType.RTX) {
      this.resetSamples();
    } else if (this.mode === Model.ModeType.RASTER) {
      await this.uploadTopLevelAccelStruct();
    }
    
    // toggle mode
    this.mode = this.mode === Model.ModeType.RASTER ? Model.ModeType.RTX : Model.ModeType.RASTER;
  }
  
  // accumulate single sample
  renderSample() {
    if (this.mode === Model.ModeType.RTX) {
      this.frameGraph?.execute('rtx');
    } else {
      this.frameGraph?.execute('preview-mode');
    }
  }
  
  exportSample() {
    /*if (this.persistentInitialized && this.transientInitialized) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const gl = this.gl;
      const {width, height} = this.imageOptions;
      const data = new Uint8Array(width * height * 4);
      const imageData = ctx.createImageData(width, height);
      
      // read pixels from copy-target
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameGraph.getFramebuffer('rtx', 'present-buffer'));
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      
      // image must be flipped
      for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
          const dstOffset = 4 * (y * width + x);
          const srcOffset = 4 * ((height - y - 1) * width + x);
          
          for (let i = 0; i < 4; i++) {
            imageData.data[dstOffset + i] = data[srcOffset + i];
          }
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      ctx.putImageData(imageData, 0, 0);
      
      // use lower quality image for the thumbnail
      const url = canvas.toDataURL('image/png');
      const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.5);
      
      return {url, thumbnailUrl};
    }*/
  }
}

const app = new Controller();
window.APP = app;
window.VIEW = APP.view;
window.MODEL = APP.model;

function getBufferView(json, binary, index) {
  const {offset, length} = json.bufferViews[index];
  
  return binary.slice(offset, offset + length);
}