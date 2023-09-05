import { DisplayConsole } from './utilities/Console.js';
import { EventTarget, clamp, createEnum } from './utilities/util.js';
import { ActiveNodeEditor } from './utilities/ActiveNodeEditor.js';
import { HydraModel } from './model.js';
import { encodeHydra } from './loading/hydra.js';
import { SHADER_DEFINES } from './utilities/constants.js';
import { assert, jsonToBlob } from './utilities/util.js';
import { FrameGraph } from './utilities/RenderGraph.js';
import { Fits, Node, Histogram } from './plugin/fits/fits.js';

class HydraView extends EventTarget {
  static MIN_WIDTH = 256;
  static MAX_WIDTH = 512;
  
  chooseScene = this.getElement('#import-scene');
  chooseDefaultScene = this.getElement('#import-default-scene');
  chooseEnvMap = this.getElement('#choose-hdri');
  width = this.getElement('#viewport-width');
  height = this.getElement('#viewport-height');
  numTilesX = this.getElement('#tile-count-x');
  numTilesY = this.getElement('#tile-count-y');
  emissiveFactor = this.getElement('#emissive-factor');
  threshold = this.getElement('#threshold');
  defines = this.getElement('#defines');
  logShaders = this.getElement('#log-shaders');
  render = this.getElement('#render');

  pause = this.getElement('#pause-render');
  toggle = this.getElement('#toggle-mode');
  
  nodeTree = this.getElement('#tree-viewer');
  nodeEditor = ActiveNodeEditor.getDefault();
  liveSettings = new ActiveNodeEditor(document.querySelector('#node-2'));
  
  canvas = this.getElement('#hydra-canvas');
  // pause = this.getElement('#pause');
  
  sampleCount = this.getElement('#sample-count');
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
      if (target.files.length > 0) {
        this.chooseDefaultScene.selectedIndex = 0;
      }
    });
    
    this.chooseDefaultScene.addEventListener('change', ({target}) => {
      if (target.value !== 'none') {
        this.chooseScene.value = '';
        this.render.disabled = false;
      } else if (target.value == 'none' && this.chooseScene.value == '') {
        this.render.disabled = true;
      }
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
  static Mode = createEnum('TRACE', 'RASTER', 'PLUGIN', 'NONE');

  keyMap = {};
  mode = HydraController.Mode.NONE;
  paused = false;
  lastFrameId = -1;
  snapshotSampleThreshold = 0;
  mouseDown = false;
  scrollDown = false;

  frameGraph;
  
  constructor() {
    super();
    
    const view = this.view = new HydraView();
    const model = this.model = new HydraModel(view.gl);
    
    this.view.liveSettings.activeNode = model;

    view.defines.value = SHADER_DEFINES;
    
    // choose scene interface
    let keyBindingsDown = null;
    let keyBindingsUp = null;

    document.addEventListener('keyup', ({key}) => {
      this.keyMap[key] = false;
    });

    view.pause.addEventListener('click', () => this.togglePaused());
    view.toggle.addEventListener('click', () => this.swapModes());
    
    view.render.addEventListener('click', async () => {
      if (keyBindingsDown && keyBindingsUp) {
        document.removeEventListener('keydown', keyBindingsDown);
        document.removeEventListener('keyup', keyBindingsUp);
      }
      
      if (!this.paused) {
        this.togglePaused();
      }
      
      view.nodeEditor.activeNode = null;
      view.nodeTree.tree = null;
      
      const file = view.chooseScene.files[0] ?? await fetch('./assets/scenes/' + view.chooseDefaultScene.value);
      const [environmentMap] = view.chooseEnvMap.files;
      
      DisplayConsole.getDefault().log(`Loading asset: ${file.name ?? view.chooseDefaultScene.value}`);
      const ext = file.name?.split('.').at(-1) ?? 'hydra';
      
      model.sourceCache.registerModuleRaw('usr_shader_defines', view.defines.value);
        
      switch (ext.toLowerCase()) {
        case 'hydra':
          this.mode = HydraController.Mode.RASTER;
          
          keyBindingsDown = (function({key}) {
            this.keyMap[key] = true;

            switch (key) {
              case 'p':
                this.togglePaused();
                break;
              case 'r':
                this.swapModes();
                break;
              case 'c':
                if (this.mode === HydraController.Mode.TRACE) {
                  this.reset();
                }
                break;
              case 's':
                DisplayConsole.getDefault().log(`Samples: ${model.sampleCount}`);
                break;
              case 'd':
                if (this.mode === HydraController.Mode.TRACE) {
                  this.logSnapshot();
                }
                break;
              case 'l':
                DisplayConsole.getDefault().clear();
                DisplayConsole.getDefault().log('Cleared logs', 'info');
                break;
              case 't':
                view.keyBindings.classList.remove('hidden');
                break;
            }
          }).bind(this);
          
          keyBindingsUp = (function({key}) {
            switch (key) {
              case 't':
                view.keyBindings.classList.add('hidden');
                break;
            }
          }).bind(this);
          
          document.addEventListener('keydown', keyBindingsDown);
          document.addEventListener('keyup', keyBindingsUp);
          
          window.cancelAnimationFrame(this.lastFrameId);
          this.reset();
          
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
              model.uploadTlas().then(() => {
                this.reset();
              });
            }
          };

          view.liveSettings.updateCallback = () => {
            model.updateSettings();
            if (this.mode === HydraController.Mode.TRACE) {
              // model.updateUniforms();
              this.reset();
            }
          }
          
          const width = parseInt(view.width.value);
          const height = parseInt(view.height.value);
          
          // resize canvas
          view.canvas.width = clamp(width, HydraView.MIN_WIDTH, HydraView.MAX_WIDTH);
          view.canvas.height = view.canvas.width / (width / height);
          
          this.snapshotSampleFactor = parseInt(view.threshold.value);
          
          model.updateState({
            logShaders: view.logShaders.checked,
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

          view.pause.disabled = false;
          view.toggle.disabled = false;
          break;
        // FITS PLUGIN
        case 'fits':
        case 'fts':
          this.mode = HydraController.Mode.PLUGIN;
          
          const filterArray = view.nodeTree.tree = new Node(
            ...await Promise.all([...view.chooseScene.files]
              .map(async file => new Fits(file.name, await file.arrayBuffer()))),
          );
          
          for (let filters = filterArray.children, i = 1; i < filters.length; i++) {
            assert(filters[0].width === filters[i].width && filters[0].height === filters[i].height);
          }
          
          const fits = filterArray.children[0];
          
          keyBindingsDown = (function({key}) {
            switch (key) {
              case 'd':
                this.logSnapshot('HYDRA_PLUGIN_FRAME', 'HYDRA_PLUGIN_OUTPUT_PASS', [fits.width, fits.height], `${fits.name.split('.')[0]}_WGLComposite`);
                break;
              case 'i': // image config
                const json = JSON.stringify({
                  filters: filterArray.children.map(fits => fits.serialize()),
                });
                DisplayConsole.getDefault().logDownloadable`FITS Composite parameters: ${new File([jsonToBlob(json)], 'Config_WGLComposite.json')}`;
                break;
            }
          }).bind(this);
          
          document.addEventListener('keydown', keyBindingsDown);
    
          // render
          if (!('fits' in model.constructor.PROGRAM_INFO)) {
            model.constructor.SHADER_SRC.push('fitsCompositor.glsl', 'histGenVert.glsl', 'histGenFrag.glsl');
            model.constructor.PROGRAM_INFO['fits'] = ['fullscreenTri.glsl', 'fitsCompositor.glsl'];
            model.constructor.PROGRAM_INFO['hist'] = ['histGenVert.glsl', 'histGenFrag.glsl'];
          }
          await model.reloadShaders();
          
          // create frame
          const frameGraph = model.fg;
          frameGraph.clear();
          
          view.canvas.width = clamp(fits.width, HydraView.MIN_WIDTH, HydraView.MAX_WIDTH);
          view.canvas.height = view.canvas.width / (fits.width / fits.height);

          frameGraph.createTexture('fits-input-img', FrameGraph.Tex.TEXTURE_2D, (gl, texture) => {
            gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, fits.width, fits.height, 0, gl.RED, gl.FLOAT, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          });

          frameGraph.createTexture('HYDRA_PLUGIN_OUTPUT_TEX', FrameGraph.Tex.TEXTURE_2D, (gl, texture) => {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, fits.width, fits.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          });
          
          // HISTOGRAM
          frameGraph.createTexture('fits-histogram', FrameGraph.Tex.TEXTURE_2D, (gl, texture) => {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, fits.statistics.histTexSize, fits.statistics.histTexSize, 0, gl.RED, gl.FLOAT, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          });
          
          frameGraph.addFrame('HYDRA_PLUGIN_FRAME');
          
          const compositePass = frameGraph.addPass('HYDRA_PLUGIN_FRAME', 'HYDRA_PLUGIN_OUTPUT_PASS', (gl, vertexArrays, textureBindings) => {
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            
            const composite = model.shaderLib.getShader('fits');
            
            composite.uniforms.set('u_min', fits.dataMin);
            composite.uniforms.set('u_max', fits.dataMax);
            
            composite.uniforms.set('u_outputImage', textureBindings['fits-input-img']);
            composite.bind(gl);
            
            gl.enable(gl.BLEND);
            gl.blendEquation(gl.FUNC_ADD);
            gl.blendFunc(gl.ONE, gl.ONE);
            
            gl.viewport(0, 0, fits.width, fits.height);
            gl.bindVertexArray(null);
            
            for (const fits of filterArray.children) {
              if (!fits.filters.hide) {
                gl.activeTexture(gl.TEXTURE0 + textureBindings['fits-input-img']);
                
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, fits.width, fits.height, 0, gl.RED, gl.FLOAT, fits.rawData);
                
                composite.uniforms.set('u_channel', fits.channel);
                composite.uniforms.set('u_black', fits.transferFunc.black);
                composite.uniforms.set('u_white', fits.transferFunc.white);
                composite.uniforms.set('u_gamma', fits.transferFunc.gamma);
                composite.uniforms.set('u_resolution', [fits.width, fits.height]);
                composite.uniforms.set('u_offset', [fits.filters.offsetX, fits.filters.offsetY]);
                
                composite.bind(gl);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
              }
            }
          });
          
          compositePass.addTextureInput('fits-input-img');
          compositePass.addColorOutput('HYDRA_PLUGIN_OUTPUT_TEX');
          
          const histPass = frameGraph.addPass('HYDRA_PLUGIN_FRAME', 'hist-pass', (gl, vertexArrays, textureBindings) => {
            gl.enable(gl.BLEND);
            gl.blendEquation(gl.FUNC_ADD);
            gl.blendFunc(gl.ONE, gl.ONE);
            
            const hist = model.shaderLib.getShader('hist');
            
            hist.uniforms.set('u_outputImage', textureBindings['HYDRA_PLUGIN_OUTPUT_TEX']);
            hist.uniforms.set('u_histTexSize', fits.statistics.histTexSize);
            
            const histData = new Float32Array(fits.statistics.histTexSize ** 2);
              
            for (const fits of filterArray.children) {
              gl.clearColor(0, 0, 0, 0);
              gl.clear(gl.COLOR_BUFFER_BIT);
              
              hist.uniforms.set('u_channel', fits.channel);
              console.log(fits.statistics.suppressZeros);
              hist.uniforms.set('u_excludeZeros', fits.statistics.suppressZeros);
              hist.bind(gl);
            
              gl.viewport(0, 0, fits.statistics.histTexSize, fits.statistics.histTexSize);
              gl.bindVertexArray(null);
              gl.drawArrays(gl.POINTS, 0, fits.width * fits.height);
              
              // sync histogram
              gl.readPixels(0, 0, fits.statistics.histTexSize, fits.statistics.histTexSize, gl.RED, gl.FLOAT, histData);
              fits.statistics.stretchedHistogram.data = histData;
              fits.statistics.cumulativeHistogram.data = fits.statistics.stretchedHistogram.getCumulative();
              fits.statistics.rawHistogram.calcRaw(fits.statistics.histTexSize ** 2, fits.rawData, fits.dataMin, fits.dataMax, fits.statistics.suppressZeros);
            }
          });
          
          histPass.addAttachmentInput('HYDRA_PLUGIN_OUTPUT_TEX', compositePass);
          histPass.addColorOutput('fits-histogram');
          
          const copyPass = frameGraph.addPass('HYDRA_PLUGIN_FRAME', 'copy-pass', (gl, vertexArrays, textureBindings) => {
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            
            const copy = model.shaderLib.getShader('copy');
            
            copy.uniforms.set('u_outputImage', textureBindings['HYDRA_PLUGIN_OUTPUT_TEX']);
            copy.bind(gl);
            
            gl.disable(gl.BLEND);
            
            gl.viewport(0, 0, view.canvas.width, view.canvas.height);
            gl.bindVertexArray(null);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
          });
          
          copyPass.addTextureInput('fits-input-img');
          copyPass.addAttachmentInput('HYDRA_PLUGIN_OUTPUT_TEX', compositePass);
          
          frameGraph.build('HYDRA_PLUGIN_FRAME');
          frameGraph.execute('HYDRA_PLUGIN_FRAME');
          
          view.nodeEditor.updateCallback = () => {
            frameGraph.execute('HYDRA_PLUGIN_FRAME');
          };
          
          break;
        default:
          DisplayConsole.getDefault().error(`Unable to process input: ${file.name}`);
      }
    });
    
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
      this.togglePaused();
    });
    
    // updating key map
    view.defines.addEventListener('keydown', event => {
      // event.stopPropagation();
    });
    
    // updating editor camera
    view.canvas.addEventListener('mousedown', ({which}) => {
      if (which === 1)
        this.mouseDown = true;
      else if (which === 2)
        this.scrollDown = true;
    });
    view.canvas.addEventListener('mouseleave', () => this.mouseDown = this.scrollDown = false);
    view.canvas.addEventListener('mouseup', ({which}) => {
      if (which === 1)
        this.mouseDown = false;
      else if (which === 2)
        this.scrollDown = false;
    });

    view.canvas.addEventListener('mousemove', ({movementX: dx, movementY: dy, offsetX: x, offsetY: y}) => {
      if (!this.paused && (this.keyMap['g'] || this.mouseDown) && 
          (this.mode === HydraController.Mode.RASTER || this.mode === HydraController.Mode.TRACE && model.preferEditorCam)) {
        model.orbitalControls.pan(dx, dy);
        
        if (this.mode === HydraController.Mode.TRACE) {
          this.reset();
        }
      }

      if (!this.paused && this.scrollDown && 
          (this.mode === HydraController.Mode.RASTER || this.mode === HydraController.Mode.TRACE && model.preferEditorCam)) {
        model.orbitalControls.strafe(dx, dy);
        
        if (this.mode === HydraController.Mode.TRACE) {
          this.reset();
        }
      }
    });
    
    this.lastWheel = 0;
    this.wheeling = false;
    view.canvas.addEventListener('wheel', ({deltaY: dy}) => {
      if (!this.paused && 
          (this.mode === HydraController.Mode.RASTER || this.mode === HydraController.Mode.TRACE && model.preferEditorCam)) {
        model.orbitalControls.zoom(dy);
        
        if (this.mode === HydraController.Mode.TRACE) {
          this.reset();
        }

        this.wheeling = true;
        this.lastWheel = performance.now();
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

  swapModes() {
    if (this.mode === HydraController.Mode.RASTER) {
      this.view.pause.disabled = false;
      this.reset();
      this.model.uploadTlas().then(() => {
        this.mode = HydraController.Mode.TRACE;
      });
    } else {
      this.view.pause.disabled = true;
      this.reset();
      this.mode = HydraController.Mode.RASTER;
    }
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
    
    if (this.mode === HydraController.Mode.TRACE || this.mode === HydraController.Mode.RASTER) {
      if (this.paused) {
        DisplayConsole.getDefault().log('Pausing shader', 'info');
      } else {
        DisplayConsole.getDefault().log('Unpausing shader', 'info');
      }
    }
  }
  
  reset() {
    this.model.reset();
    this.snapshotSampleThreshold = 1;
  }
  
  logSnapshot(...params) {
    this.model.serialize(...params).then(([blob, sampleCount]) => {
      const [scene] = this.view.chooseScene.files;
      let name;
      if (this.mode === HydraController.Mode.PLUGIN) {
        name = params.at(-1) + '.png';  
      } else {
        name = (scene?.name ?? this.view.chooseDefaultScene.value).split('.')[0] + ` (${sampleCount} sample${sampleCount > 1 ? 's' : ''})` + '.png';
      }
      
      const file = new File([blob], name);
      DisplayConsole.getDefault().logDownloadable`Snapshot: ${file}`;
    });
  }

  render = () => {
    switch (this.mode) {
      case HydraController.Mode.RASTER:
        this.frameGraph.execute('preview-mode');
        break;
      case HydraController.Mode.TRACE:
        this.frameGraph.execute('rtx');
        
        this.view.sampleCount.textContent = this.model.sampleCount;
        
        if (this.snapshotSampleFactor > 1 && this.model.sampleCount === this.snapshotSampleThreshold) {
          if (!this.mouseDown && !this.wheeling && !this.scrollDown) {
            this.logSnapshot();
          }

          this.snapshotSampleThreshold *= this.snapshotSampleFactor;
        }
        
        break;
    }

    if (performance.now() - this.lastWheel > 200) {
      this.wheeling = false;
    }
    
    this.frameGraph.execute('view');
    this.lastFrameId = window.requestAnimationFrame(this.render);
  }
}

const app = window.hydra_app = new HydraController();