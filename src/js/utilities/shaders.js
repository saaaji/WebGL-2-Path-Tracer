export class SourceCache {
  static #INCLUDE_REGEX = /#pragma HYDRA include<([._a-zA-Z]+)>/g;
  
  #modules = new Map();
  
  constructor(pathMap) {
    this.pathMap = pathMap;
  }
  
  async registerModule(name) {
    const ext = name.split('.').at(-1);

    const response = await fetch(this.pathMap[ext] + name);
    const source = await response.text();
    
    this.#modules.set(name, source);
    return this.#modules.get(name);
  }
  
  registerModuleRaw(name, source) {
    this.#modules.set(name, source);
    return this.#modules.get(name);
  }
  
  fetchModule(name) {
    const rawSource = this.#modules.get(name);
    
    if (rawSource) {
      let source = rawSource;
      
      for (const [directive, moduleName] of source.matchAll(this.constructor.#INCLUDE_REGEX)) {
        source = source.replace(directive, this.#modules.get(moduleName) ?? '');
      }
      
      return source;
    }
  }
  
  fetchRawModule(name) {
    return this.#modules.get(name);
  }
}

export class Pipeline {
  static #BUFFER_REGEX = /layout\(std140\) uniform ([_a-zA-Z]+)/g;
  
  #vertexShader;
  #fragmentShader;
  #program;
  #uniformLocations = new Map();
  #uniformUploadMethods = new Map();
  #attribLocations = new Map();
  #bufferIndices = new Map();
  
  uniforms = new Map();
  buffers = new Set();
  
  constructor(gl, {
    vertexSource,
    fragmentSource,
  }, logShaders = false) {
    const vertexShader = createShader(gl, vertexSource, gl.VERTEX_SHADER, logShaders);
    const fragmentShader = createShader(gl, fragmentSource, gl.FRAGMENT_SHADER, logShaders);
    const program = createProgram(gl, vertexShader, fragmentShader);
    
    this.#vertexShader = vertexShader;
    this.#fragmentShader = fragmentShader;
    this.#program = program;
    
    for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
      const {name, type} = gl.getActiveUniform(program, i);
      this.#uniformLocations.set(name, gl.getUniformLocation(program, name));
      this.#uniformUploadMethods.set(name, getUniformMethod(gl, type));
    }
    
    for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES); i++) {
      const {name} = gl.getActiveAttrib(program, i);
      this.#attribLocations.set(name, gl.getAttribLocation(program, name));
    }
    
    for (const [, name] of vertexSource.matchAll(Pipeline.#BUFFER_REGEX)) {
      this.buffers.add(name);
    }
    
    for (const [, name] of fragmentSource.matchAll(Pipeline.#BUFFER_REGEX)) {
      this.buffers.add(name);
    }
    
    this.buffers.forEach(name => {
      const index = gl.getUniformBlockIndex(program, name);
      this.#bufferIndices.set(name, index);

      //console.log(name, gl.getActiveUniformBlockParameter(program, index, gl.UNIFORM_BLOCK_DATA_SIZE));
    });
  }
  
  get attribs() {
    return this.#attribLocations;
  }
  
  get program() {
    return this.#program;
  }
  
  bind(gl) {
    gl.useProgram(this.program);
    
    for (const [name, value] of this.uniforms) {
      const upload = this.#uniformUploadMethods.get(name);
      const location = this.#uniformLocations.get(name);
      
      if (value.isMatrix) {
        gl[upload]?.(location, false, value.elements);
      } else {
        gl[upload]?.(location, value);
      }
    }
  }
  
  getBufferIndex(name) {
    return this.#bufferIndices.get(name);
  }
  
  dispose(gl) {
    gl.deleteShader(this.#vertexShader);
    gl.deleteShader(this.#fragmentShader);
    gl.deleteProgram(this.#program);
  }
}

export class ShaderLib {
  shaders = new Map();
  
  addShader(name, gl, source, logShaders = false) {
    const shader = new Pipeline(gl, source, logShaders);
    this.shaders.set(name, shader);
    return shader;
  }
  
  getShader(name) {
    return this.shaders.get(name);
  }
}

export class PipelineDir {
  pipelines = new Map();
  
  add(name, pipeline) {
    this.pipelines.set(name, pipeline);
  }
  
  remove(name) {
    this.pipelines.delete(name);
  }
  
  get(pipeline) {
    return this.pipelines.get(pipeline);
  }
  
  attribLocation(pipeline, name) {
    return this.pipelines.get(pipeline)?.attribs.get(name);
  }
  
  setUniform(pipeline, name, value) {
    this.pipelines.get(pipeline)?.uniforms.set(name, value);
  }
  
  bindPipeline(pipeline, gl) {
    this.pipelines.get(pipeline)?.bind(gl);
  }
}

function createProgram(gl, vertexShader, fragmentShader) {
  const program = gl.createProgram();
  
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
    return program;
  }
  
  const message = gl.getProgramInfoLog(program);
  gl.deleteProgram(program);
  throw new Error(message);
}

function createShader(gl, source, type, logShaders = false) {
  const shader = gl.createShader(type);
  
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  
  if (logShaders) {
    const debugStr = source
      .split('\n')
      .map((line, i) => (i + 1)
      .toString()
      .padEnd(5, ' ')+line)
      .join('\n');

    console.log(`[PREPROCESSED SHADER (logShaders=true)]\n${debugStr}`);
  }

  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    return shader;
  }
  
  const message = gl.getShaderInfoLog(shader);
  gl.deleteShader(shader);
  
  
  throw new Error(message);
}

function getUniformMethod(gl, type) {
  switch (type) {
    // floats
    case gl.FLOAT:
      return 'uniform1f';
    case gl.FLOAT_VEC2:
      return 'uniform2fv';
    case gl.FLOAT_VEC3:
      return 'uniform3fv';
    case gl.FLOAT_VEC4:
      return 'uniform4fv';
    
    // integers
    case gl.BOOL:
    case gl.INT:
      return 'uniform1i';
    case gl.BOOL_VEC2:
    case gl.INT_VEC2:
      return 'uniform2iv';
    case gl.BOOL_VEC3:
    case gl.INT_VEC3:
      return 'uniform3iv';
    case gl.BOOL_VEC4:
    case gl.INT_VEC4:
      return 'uniform4iv';
    
    // unsigned integers
    case gl.UNSIGNED_INT:
      return 'uniform1ui';
    case gl.UNSIGNED_INT_VEC2:
      return 'uniform2uiv';
    case gl.UNSIGNED_INT_VEC3:
      return 'uniform3uiv';
    case gl.UNSIGNED_INT_VEC4:
      return 'uniform4uiv';
      
    // matrices
    case gl.FLOAT_MAT2:
      return 'uniformMatrix2fv';
    case gl.FLOAT_MAT3:
      return 'uniformMatrix3fv';
    case gl.FLOAT_MAT4:
      return 'uniformMatrix4fv';
    case gl.FLOAT_MAT2x3:
      return 'uniformMatrix2x3fv';
    case gl.FLOAT_MAT2x4:
      return 'uniformMatrix2x4fv';
    case gl.FLOAT_MAT3x2:
      return 'uniformMatrix3x2fv';
    case gl.FLOAT_MAT3x4:
      return 'uniformMatrix3x4fv';
    case gl.FLOAT_MAT4x2:
      return 'uniformMatrix4x2fv';
    case gl.FLOAT_MAT4x3:
      return 'uniformMatrix4x3fv';
    
    // samplers
    case gl.SAMPLER_2D:
    case gl.SAMPLER_CUBE:
    case gl.SAMPLER_3D:
    case gl.SAMPLER_2D_SHADOW:
    case gl.SAMPLER_2D_ARRAY:
    case gl.SAMPLER_2D_ARRAY_SHADOW:
    case gl.SAMPLER_CUBE_SHADOW:
    case gl.INT_SAMPLER_2D:
    case gl.INT_SAMPLER_3D:
    case gl.INT_SAMPLER_CUBE:
    case gl.INT_SAMPLER_2D_ARRAY:
    case gl.UNSIGNED_INT_SAMPLER_2D:
    case gl.UNSIGNED_INT_SAMPLER_3D:
    case gl.UNSIGNED_INT_SAMPLER_CUBE:
    case gl.UNSIGNED_INT_SAMPLER_2D_ARRAY:
      return 'uniform1i';
  }
}