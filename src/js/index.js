import { DisplayConsole } from './utilities/Console.js';
import { EventTarget, clamp, createEnum } from './utilities/util.js';
import { ActiveNodeEditor } from './utilities/ActiveNodeEditor.js';
import { HydraModel } from './model.js';
import { encodeHydra } from './loading/hydra.js';

class HydraView extends EventTarget {
  static MIN_WIDTH = 300;
  static MAX_WIDTH = 600;
  
  chooseScene = this.getElement('#import-scene');
  chooseEnvMap = this.getElement('#choose-hdri');
  width = this.getElement('#viewport-width');
  height = this.getElement('#viewport-height');
  numTilesX = this.getElement('#tile-count-x');
  numTilesY = this.getElement('#tile-count-y');
  emissiveFactor = this.getElement('#emissive-factor');
  render = this.getElement('#render');
  
  nodeTree = this.getElement('#tree-viewer');
  nodeEditor = ActiveNodeEditor.getDefault();
  
  canvas = this.getElement('#hydra-canvas');
  pause = this.getElement('#pause');
  
  pauseLabel = this.getElement('#p');
  unpauseLabel = this.getElement('#u');
  
  keyBindings = this.getElement('#key-bindings');
  
  chooseSceneExport = this.getElement('#export-scene');
  export = this.getElement('#export');
  
  constructor() {
    super();
    
    this.gl = this.canvas.getContext('webgl2');
    
    if (!this.gl) {
      throw new Error('WebGL 2 is not supported');
    }
    
    // choosing scene
    this.render.disabled = true;
    this.chooseScene.addEventListener('change', ({target}) => {
      this.render.disabled = target.files.length === 0;
    });
    
    // selecting a node
    this.nodeTree.addEventListener('change', ({target}) => {
      this.nodeEditor.activeNode = target.selectedNode;
    });
  }
  
  getElement(selector) {
    return document.querySelector(selector);
  }
}

// controller implements application-specific meaning of interface behavior
class HydraController extends EventTarget {
  static Mode = createEnum('TRACE', 'RASTER');
  
  keyMap = {};
  mode = HydraController.Mode.RASTER;
  paused = false;
  lastFrameId = -1;
  
  frameGraph;
  
  constructor() {
    super();
    
    const view = this.view = new HydraView();
    const model = this.model = new HydraModel(view.gl);
    
    // choose scene interface
    view.render.addEventListener('click', () => {
      if (this.paused) {
        this.togglePaused();
      }
      
      window.cancelAnimationFrame(this.lastFrameId);
      view.nodeEditor.activeNode = null;
      model.reset();
      
      const [file] = view.chooseScene.files;
      const [environmentMap] = view.chooseEnvMap.files;
      
      DisplayConsole.getDefault().log(`Loading asset: ${file.name}`);
      
      const width = parseInt(view.width.value);
      const height = parseInt(view.height.value);
      
      // resize canvas
      view.canvas.width = clamp(width, HydraView.MIN_WIDTH, HydraView.MAX_WIDTH);
      view.canvas.height = view.canvas.width / (width / height);
      
      model.updateState({
        file,
        environmentMap,
        renderConfig: {
          width,
          height,
          numTilesX: parseInt(view.numTilesX.value),
          numTilesY: parseInt(view.numTilesY.value),
          emissiveFactor: parseFloat(view.emissiveFactor.value),
        },
      });
    });
    
    // updating scene graph
    model.addEventListener('hydra_update_scene_graph', sceneGraph => {
      view.nodeTree.tree = sceneGraph;
    });
    
    view.nodeTree.addEventListener('change', ({target}) => {
      model.focusedNode = target.selectedNode;
      model.focusedNodes = target.selectedNode.nodes;
    });
    
    view.nodeEditor.updateCallback = () => {
      if (this.mode === HydraController.Mode.TRACE) {
        window.cancelAnimationFrame(this.lastFrameId);
        model.uploadTlas().then(() => {
          model.reset();
          window.requestAnimationFrame(this.render);
        });
      }
    };
    
    // grab new state from model
    model.addEventListener('hydra_rebuild_pipeline', ({shaderLib, frameGraph}) => {
      frameGraph.addFrame('view');
      
      const copyPass = frameGraph.addPass('view', 'copy-pass', (gl, vertexArrays, textureBindings) => {
        const copyShader = shaderLib.getShader('copy');
        
        copyShader.uniforms.set('u_outputImage', textureBindings[
          this.mode === HydraController.Mode.RASTER ? 'ssaa-target' : 'present-buffer'
        ]);
        copyShader.bind(gl);
        
        gl.viewport(0, 0, view.canvas.width, view.canvas.height);
        gl.bindVertexArray(null);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      });
      
      copyPass.addTextureInput('ssaa-target');
      copyPass.addTextureInput('present-buffer');
      frameGraph.build('view');
      
      this.frameGraph = frameGraph;
      
      if (!this.paused) {
        window.requestAnimationFrame(this.render);
      }
    });
    
    // updating key map
    document.addEventListener('keydown', ({key}) => {
      this.keyMap[key] = true;
      
      switch (key) {
        case 'p':
          this.togglePaused();
          break;
        case 'r':
          if (this.mode === HydraController.Mode.RASTER) {
            model.reset();
            model.uploadTlas().then(() => {
              this.mode = HydraController.Mode.TRACE;
            });
          } else {
            model.reset();
            this.mode = HydraController.Mode.RASTER;
          }
          break;
        case 'c':
          if (this.mode === HydraController.Mode.TRACE) {
            model.reset();
          }
          break;
        case 's':
          DisplayConsole.getDefault().log(`Samples: ${model.sampleCount}`);
          break;
        case 'd':
          if (this.mode === HydraController.Mode.TRACE) {
            model.serialize().then(blob => {
              const [scene] = view.chooseScene.files;
              const name = scene.name.split('.')[0] + ` (${model.sampleCount} samples)` + '.png';
              const file = new File([blob], name);
              
              DisplayConsole.getDefault().logDownloadable`Snapshot ready for download: ${file}`;
            });
          }
          break;
        case 'l':
          DisplayConsole.getDefault().clear();
          DisplayConsole.getDefault().log('Cleared logs', '?');
          break;
        case 't':
          view.keyBindings.classList.remove('hidden');
          break;
      }
    });
    
    document.addEventListener('keyup', ({key}) => {
      this.keyMap[key] = false;
      
      switch (key) {
        case 't':
          view.keyBindings.classList.add('hidden');
          break;
      }
    });
    
    // updating editor camera
    view.canvas.addEventListener('mousemove', ({movementX: dx, movementY: dy, offsetX: x, offsetY: y}) => {
      if (!this.paused && this.keyMap['g'] && this.mode === HydraController.Mode.RASTER) {
        model.orbitalCamera.pan(dx, dy);
      }
    });
    
    view.canvas.addEventListener('wheel', ({deltaY: dy}) => {
      if (!this.paused && this.mode === HydraController.Mode.RASTER) {
        model.orbitalCamera.zoom(dy);
      }
    });
    
    // exporting asset
    view.export.addEventListener('click', async function(event) {
      event.target.setAttribute('disabled', '');
      
      const files = view.chooseSceneExport.files;
      const name = files[0].name.replace(/\.[^.]+$/, '.hydra');
      const blob = await encodeHydra(files);
      const file = new File([blob], name);
      
      DisplayConsole.getDefault().logDownloadable`Asset ready for download: ${file}`;
      event.target.removeAttribute('disabled');
    });
  }
  
  togglePaused() {
    this.paused = !this.paused;
    if (this.paused) {
      window.cancelAnimationFrame(this.lastFrameId);
      this.view.pauseLabel.style = '';
      this.view.unpauseLabel.style = 'font-weight: bold;';
    } else {
      window.requestAnimationFrame(this.render);
      this.view.pauseLabel.style = 'font-weight: bold;';
      this.view.unpauseLabel.style = '';
    }
    
    if (this.mode === HydraController.Mode.TRACE) {
      if (this.paused) {
        DisplayConsole.getDefault().log('Pausing kernel', '?');
      } else {
        DisplayConsole.getDefault().log('Unpausing kernel', '?');
      }
    }
  }
  
  render = () => {
    switch (this.mode) {
      case HydraController.Mode.RASTER:
        this.frameGraph.execute('preview-mode');
        break;
      case HydraController.Mode.TRACE:
        this.frameGraph.execute('rtx');
        break;
    }
    
    this.frameGraph.execute('view');
    this.lastFrameId = window.requestAnimationFrame(this.render);
  }
}

const app = window.hydra_app = new HydraController();