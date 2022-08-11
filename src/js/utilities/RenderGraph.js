import { GL_CTX, createEnum } from './util.js';

const TopologicalSortMark = createEnum(
  'UNMARKED',
  'TEMPORARY',
  'PERMANENT',
);

export const FrameGraphTextureResource = createEnum(
  'TEXTURE_2D',
  'TEXTURE_2D_ARRAY',
);

// acts as "node" in frame graph
class RenderPass {
  // graph that this pass belongs to
  #graph;
  #fbo;
  #name;
  
  // external dependencies
  #textureInput = [];
  
  // color and depth output for FBO
  #colorOutput = [];
  #depthOutput = null;
  #stencilOutput = null;
  
  // takes precedence over individual depth/stencil outputs
  #depthStencilOutput = null;
  
  // marking for topological sort
  marking = TopologicalSortMark.UNMARKED;
  
  constructor(graph, name, render) {
    this.#graph = graph;
    this.#name = name;
    
    /**
     * render callback must initialize pipeline state
     * and dispatch draw calls
     * <gl>: the frame graph's WebGL context
     * <vertexArrays>: a map of vertex array objects
     * <textureBindings>: a map of texture input bindings
     */
    this.render = render;
  }
  
  get graph() {
    return this.#graph;
  }
  
  get name() {
    return this.#name;
  }
  
  get textureInput() {
    return this.#textureInput;
  }
  
  get fboKey() {
    return 'FBO(' + [...this.getOutputAttachments()].map(name => `${name}`).join(', ') + ')';
  }
  
  // iterate over output attachments (color + depth)
  *getOutputAttachments() {
    yield *this.#colorOutput;
    
    if (this.#depthOutput) {
      yield this.#depthOutput;
    }
    
    if (this.#stencilOutput) {
      yield this.#stencilOutput;
    }
  }
  
  *_getOutputAttachments() {
    for (const attachment of this.getOutputAttachments()) {
      yield this._getInstKey(attachment, this);
    }
  }
  
  // render pass I/O
  _getInstKey(name, pass) {
    return `INST[${pass.name} -> ${name}]`;
  }
  
  addAttachmentInput(name, pass) {
    this.#graph.addDependency(this, this._getInstKey(name, pass));
    this.#textureInput.push(name);
  }
  
  addTextureDependency(name, pass) {
    this.#graph.addDependency(this, this._getInstKey(name, pass));
  }
  
  addTextureInput(name) {
    this.#textureInput.push(name);
  }
  
  addColorOutput(name) {
    this.#colorOutput.push(name);
  }
  
  setDepthOutput(name) {
    this.#depthOutput = name;
  }
  
  setStencilOutput(name) {
    this.#stencilOutput = name;
  }
  
  setDepthStencilOutput(name) {
    this.#depthStencilOutput = name;
  }
  
  // initialize render target
  _build(gl, fbo) {
    this.#fbo = fbo;
    
    if (this.#fbo !== null) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.#fbo);
      
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
        return;
      }
      
      this.#colorOutput.forEach((name, i) => {
        const texture = this.#graph.getTexture(name);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, texture, 0);
      });
      
      if (!this.#depthStencilOutput) {
        if (this.#depthOutput) {
          const depthTexture = this.#graph.getTexture(this.#depthOutput);
          gl.bindTexture(gl.TEXTURE_2D, depthTexture);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTexture, 0);
        }
        
        // must be a renderbuffer
        if (this.#stencilOutput) {
          const stencilBuffer = this.#graph.getRenderbuffer(this.#stencilOutput);
          gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, stencilBuffer);
        }
      } else {
        // must be a renderbuffer
        const depthStencilBuffer = this.#graph.getRenderbuffer(this.#depthStencilOutput);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, depthStencilBuffer);
      }
      
      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (status !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error(`incomplete framebuffer: status 0x${status.toString(16).toUpperCase()}`);
      }
    }
  }
  
  _execute(gl, vertexArrays, textureBindings) {
    const colorBuffers = this.#fbo === null ? [gl.BACK] : new Array(this.#colorOutput.length)
      .fill()
      .map((_, i) => gl.COLOR_ATTACHMENT0 + i);
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.#fbo);
    gl.drawBuffers(colorBuffers);
    
    this.render(gl, vertexArrays, textureBindings);
  }
}

class Frame {
  passes = [];
  orderedPasses = [];
}

export class FrameGraph {
  #gl;
  #frames = new Map();
  // #passes = [];
  // #orderedPasses = [];
  
  // user must initialize external resources
  #textures = new Map();
  #renderbuffers = new Map();
  #buffers = new Map();
  #vertexArrays = new Map();
  #renderTargets = new Map([
    ['FBO()', null],
  ]);
  
  #textureTypes = new Map();
  
  // track I/O of resources
  #dependencyMap = {};
  
  // bind frame graph to WebGL context
  constructor(gl) {
    this.#gl = gl;
  }
  
  get context() {
    return this.#gl;
  }
  
  // create new frame
  addFrame(name) {
    this.#frames.set(name, new Frame());
  }
  
  // insert new render pass into the frame graph
  addPass(frame, name, render) {
    const pass = new RenderPass(this, name, render);
    // this.#passes.push(pass);
    this.#frames.get(frame).passes.push(pass);
    return pass;
  }
  
  // create dependency
  addDependency(pass, name) {
    if (!(name in this.#dependencyMap)) {
      this.#dependencyMap[name] = new Set();
    }
    
    this.#dependencyMap[name].add(pass);
  }
  
  // clear resources
  clear() {
    this.#textures.forEach((texture) => {
      this.#gl.deleteTexture(texture);
    });
    
    this.#renderbuffers.forEach((renderbuffer) => {
      this.#gl.deleteRenderbuffer(renderbuffer);
    });
    
    this.#buffers.forEach((buffer) => {
      this.#gl.deleteBuffer(buffer);
    });
    
    this.#vertexArrays.forEach((vertexArray) => {
      this.#gl.deleteVertexArray(vertexArray);
    });
    
    this.#renderTargets.forEach((framebuffer) => {
      this.#gl.deleteFramebuffer(framebuffer);
    });
    
    this.#textures.clear();
    this.#renderbuffers.clear();
    this.#buffers.clear();
    this.#vertexArrays.clear();
    this.#renderTargets.clear();
    this.#frames.clear();
  }
  
  /**
   * Methods to instantiate resources
   * <name>: string identifier of resource
   * <callback>: optional callback to initialize resource
   */
  createBuffer(name, callback = null) {
    const buffer = this.#gl.createBuffer();
    this.#buffers.set(name, buffer);
    
    callback?.(this.#gl, buffer);
    return buffer;
  }
  
  createVertexArray(name, callback = null) {
    const vertexArray = this.#gl.createVertexArray();
    this.#vertexArrays.set(name, vertexArray);
    
    callback?.(this.#gl, vertexArray);
    return vertexArray;
  }
  
  createTexture(name, type, callback = null) {
    const texture = this.#gl.createTexture();
    this.#textures.set(name, texture);
    this.#textureTypes.set(name, type);
    
    callback?.(this.#gl, texture);
    return texture;
  }
  
  createRenderbuffer(name, callback = null) {
    const renderbuffer = this.#gl.createRenderbuffer();
    this.#renderbuffers.set(name, renderbuffer);
    
    callback?.(this.#gl, renderbuffer);
    return renderbuffer;
  }

  getBuffer(name) {
    return this.#buffers.get(name);
  }
  
  getTexture(name) {
    return this.#textures.get(name);
  }
  
  getRenderbuffer(name) {
    return this.#renderbuffers.get(name);
  }
  
  getVertexArray(name) {
    return this.#vertexArrays.get(name);
  }

  getFramebuffer(frame, passName) {
    const pass = this.#frames.get(frame).passes.find(pass => pass.name === passName);
    return this.#renderTargets.get(pass.fboKey);
  }

  // visit function for topological sort
  static prev = null;
  
  #visitRenderPass(frame, pass) {
    switch (pass.marking) {
      case TopologicalSortMark.UNMARKED:
        pass.marking = TopologicalSortMark.TEMPORARY;
        
        for (const name of pass._getOutputAttachments()) {
          if (name in this.#dependencyMap) {
            console.log(name, this.#dependencyMap[name]);//.map(({name}) => name));
            
            for (const dependency of this.#dependencyMap[name]) {
              if (pass !== dependency) {
                FrameGraph.prev = pass;
                this.#visitRenderPass(frame, dependency);
              }
            }
          }
        }
        
        pass.marking = TopologicalSortMark.PERMANENT;
        frame.orderedPasses.unshift(pass);
        break;
      case TopologicalSortMark.PERMANENT:
        return;
      case TopologicalSortMark.TEMPORARY:
        console.log(FrameGraph.prev.name, pass.name);
        throw new Error('topological sort failed: frame graph is not a directed-acyclic-graph');
    }
  }

  build(name) {
    const frame = this.#frames.get(name);
    
    frame.passes.forEach(pass => {
      if (!this.#renderTargets.has(pass.fboKey)) {
        this.#renderTargets.set(pass.fboKey, this.#gl.createFramebuffer());
      }
    });
    
    let currentPass = null;
    while (currentPass = frame.passes.find(pass => pass.marking !== TopologicalSortMark.PERMANENT)) {
      this.#visitRenderPass(frame, currentPass);
    }
    
    console.log(frame.orderedPasses.map(pass => pass.name));
    
    frame.passes.forEach(pass => {
      pass._build(this.#gl, this.#renderTargets.get(pass.fboKey));
      pass.marking = TopologicalSortMark.UNMARKED;
    });
  }
  
  execute(name) {
    const gl = this.#gl;
    const frame = this.#frames.get(name);
    
    frame.orderedPasses.forEach(pass => {
      const textureBindings = {};
      
      pass.textureInput.forEach((name, i) => {
        const texture = this.#textures.get(name);
        
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl[this.#textureTypes.get(name).description], texture);
        
        textureBindings[name] = i;
      });
      
      pass._execute(gl, this.#vertexArrays, textureBindings);
    });
  }
}