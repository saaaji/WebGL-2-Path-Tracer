const HOT_RELOAD = true;

const shaderModules = new Map();

export async function loadShaderModule(fileName) {
  if (HOT_RELOAD || !shaderModules.has(fileName)) {
    const source = await fetch('./assets/shaders/' + fileName).then(response => response.text());
    shaderModules.set(fileName, source);
  }
}

export function createProgram(gl, vertexName, fragmentName, manager) {
  const vertexSource = shaderModules.get(vertexName) ?? '';
  const fragmentSource = shaderModules.get(fragmentName) ?? '';
  
  const vertexShader = createShader(gl, vertexSource, gl.VERTEX_SHADER);
  const fragmentShader = createShader(gl, fragmentSource, gl.FRAGMENT_SHADER);
  const program = gl.createProgram();
  
  manager
    .add(vertexShader)
    .add(fragmentShader)
    .add(program);
  
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const uniforms = new Map();
    const attribs = new Map();
    
    for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
      const {name} = gl.getActiveUniform(program, i);
      uniforms.set(name, gl.getUniformLocation(program, name));
    }
    
    for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES); i++) {
      const {name} = gl.getActiveAttrib(program, i);
      attribs.set(name, gl.getAttribLocation(program, name));
    }
    
    return {
      attribs,
      uniforms,
      program,
    };
  }
  
  const message = gl.getProgramInfoLog(program);
  gl.deleteProgram(program);
  throw new Error(message);
}

function createShader(gl, source, type) {
  const shader = gl.createShader(type);
  
  for (const [directive, moduleName] of source.matchAll(/#pragma HYDRA include<([._a-zA-Z]+)>/g)) {
    source = source.replace(directive, shaderModules.get(moduleName) ?? '');
  }
  
  /*let extraDefines = '';
  for (const name in defines) {
    const value = defines[name];
    
    extraDefines += `#define ${name} ${value}\n`;
  }
  
  lines.splice(1, 0, extraDefines);
  source = lines.join('\n');*/
  
  const lines = source.split('\n');
  const debugLog = lines
    .map((line, i) => (i + 1).toString().padEnd(4, ' ') + line)
    .join('\n');
  console.log(debugLog);
  
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    return shader;
  }
  
  const message = gl.getShaderInfoLog(shader);
  gl.deleteShader(shader);
  throw new Error(message);
}
