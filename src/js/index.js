import { encodeHydra, decodeHydra } from './loading/hydra.js';
import { MemoryManager, bufferToImage, loadImage, clamp } from './utilities/util.js';
import { loadShaderModule, createProgram } from './utilities/shaders.js';
import { Matrix4 } from './math/Matrix4.js';

// constants
const THUMBNAIL_IMAGE_HEIGHT = 100;
const MAX_WIDTH = 900;
const MAX_HEIGHT = 600;

const PAUSED_FLAG = 1 << 0;
const CAPTURE_FRAME_FLAG = 1 << 1;
const CONTEXT_LOST_FLAG = 1 << 2;
const TEXTURE_BASE = 2;

const SHADERS = [
  'main.glsl',
  'sampleTex.glsl',
  'fullscreenTri.glsl',
  'random.glsl',
  'intersections.glsl',
];

const EXTENSIONS = [
  'EXT_color_buffer_float',
  'EXT_float_blend',
];

// DOM
const $ = document.getElementById.bind(document);
const canvas = $('canvas');

// state
const gl = canvas.getContext('webgl2');
const state = new Map();
const manager = new MemoryManager(gl);

let flags = false;
let lastId = null;
let sampleCount = 0;
let sampleCountThreshold = 1;

// event listeners
$('pause-render').addEventListener('click', function(event) {
  flags ^= PAUSED_FLAG;
  event.target.src = flags & PAUSED_FLAG ? '../assets/images/play.png' : '../assets/images/pause.png';
});

$('save-frame').addEventListener('click', function(event) {
  flags |= CAPTURE_FRAME_FLAG;
});

$('choose-hydra-scene').addEventListener('change', function(event) {
  $('render-scene').disabled = event.target.files.length === 0;
});

$('choose-glb-scene').addEventListener('change', function(event) {
  $('export-scene').disabled = event.target.files.length === 0;
});

$('render-scene').addEventListener('click', async function() {
  if (!(flags & CONTEXT_LOST_FLAG)) {
    if (lastId !== null) {
      window.cancelAnimationFrame(lastId);
    }
    
    sampleCount = 0;
    sampleCountThreshold = 1;
    manager.clear();
    state.clear();
    
    const files = $('choose-hydra-scene').files;
    const [json, binary] = await decodeHydra(files);
    await initializeState(gl, json, binary, state, manager);
    render(gl, json, binary, state);
  }
});

$('export-scene').addEventListener('click', async function() {
  const files = $('choose-glb-scene').files;
  const [sceneName] = files.item(0).name.split('.');
  const fileName = `${sceneName}.hydra`;
  const blob = await encodeHydra(files);
  
  await appendLink(fileName, URL.createObjectURL(blob), '../assets/images/bin.png');
});

canvas.addEventListener('webglcontextlost', function(event) {
  event.preventDefault();
  flags |= CONTEXT_LOST_FLAG;
  
  if (lastId !== null) {
    window.cancelAnimationFrame(lastId);
  }
  
  sampleCount = 0;
  sampleCountThreshold = 1;
  manager.clear();
  state.clear();
});

canvas.addEventListener('webglcontextrestored', function(event) {
  event.preventDefault();
  flags &= ~CONTEXT_LOST_FLAG;
});

// render given asset
function render(gl, json, binary, state) {
  // resize canvas according to given aspect ratio
  const width = clamp(parseInt($('image-width').value), 1);
  const height = clamp(parseInt($('image-height').value), 1);
  
  const aspect = width / height;
  
  canvas.width = width;
  canvas.height = height;
  
  if (canvas.width > MAX_WIDTH) {
    canvas.width = MAX_WIDTH;
    canvas.height = Math.round(MAX_WIDTH / aspect);
  }
  
  if (canvas.height > MAX_HEIGHT) {
    canvas.height = MAX_HEIGHT;
    canvas.width = Math.round(MAX_HEIGHT * aspect);
  }
  
  // compute work group size
  const numWorkGroupsX = clamp(parseInt($('horizontal-work-groups').value), 1);
  const numWorkGroupsY = clamp(parseInt($('vertical-work-groups').value), 1);
  
  const tileWidth = Math.floor(width / numWorkGroupsX);
  const tileHeight = Math.floor(height / numWorkGroupsY);
  
  // compute matrices
  const projectionMatrix = new Matrix4().perspective(
    json.camera.parameters.fov,
    json.camera.parameters.near,
    json.camera.parameters.far,
    width / height,
  );
  
  const viewMatrix = new Matrix4().setFromArray(json.camera.worldMatrix);
  
  // set WebGL pipeline state
  const {program: mainProgram, uniforms: mainUniforms} = state.get('main-program');
  const {program: copyProgram, uniforms: copyUniforms} = state.get('copy-program');
  
  gl.blendEquation(gl.FUNC_ADD);
  gl.blendFunc(gl.ONE, gl.ONE);

  // initiate render loop
  window.requestAnimationFrame(async function callback() {
    if (!(flags & PAUSED_FLAG)) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, state.get('render-target'));
      gl.useProgram(mainProgram);
      gl.enable(gl.BLEND);
      
      gl.uniform1ui(mainUniforms.get('u_currentSample'), sampleCount);
      gl.uniform2f(mainUniforms.get('u_resolution'), width, height);
      gl.uniform2f(mainUniforms.get('u_atlasResolution'), json.atlas.size.width, json.atlas.size.height);
      gl.uniform1i(mainUniforms.get('u_ATLAS'), json.dataTextures.descriptors.length + TEXTURE_BASE);
      
      gl.uniformMatrix4fv(mainUniforms.get('u_projectionInverse'), false, projectionMatrix.inverse.elements);
      gl.uniformMatrix4fv(mainUniforms.get('u_cameraTransform'), false, viewMatrix.elements);
      gl.uniformMatrix4fv(mainUniforms.get('u_cameraTransformInverse'), false, viewMatrix.inverse.elements);
    
      json.dataTextures.descriptors.forEach(({name, width, height}, i) => {
        gl.uniform2i(mainUniforms.get(`u_${name}.size`), width, height);
        gl.uniform1i(mainUniforms.get(`u_${name}.sampler`), i + TEXTURE_BASE);
      });
      
      for (let x = 0; x < numWorkGroupsX; x++) {
        for (let y = 0; y < numWorkGroupsY; y++) {
          gl.viewport(x * tileWidth, y * tileHeight, tileWidth, tileHeight);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
      }
      
      gl.finish();
      sampleCount++;
    }
    
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.useProgram(copyProgram);
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, state.get('copy-target'));
    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(copyUniforms.get('u_sampleCountInv'), 1 / sampleCount);
    gl.uniform1i(copyUniforms.get('u_accumulationTex'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(copyUniforms.get('u_sampleCountInv'), 1 / sampleCount);
    gl.uniform1i(copyUniforms.get('u_accumulationTex'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    
    if (flags & CAPTURE_FRAME_FLAG) {
      flags &= ~CAPTURE_FRAME_FLAG;
      await captureFrame(gl, state, width, height, `${sampleCount} spp`);
    } else if (sampleCount >= sampleCountThreshold) {
      sampleCountThreshold *= 4;
      await captureFrame(gl, state, width, height, `${sampleCount} spp`);
    }
    
    if (sampleCount % 50 === 0) {
      $('title').textContent = `${sampleCount} spp`;
    }
    
    lastId = window.requestAnimationFrame(callback);
  });
}

// initialize WebGL resources
async function initializeState(gl, json, binary, state, manager) {
  const width = clamp(parseInt($('image-width').value), 1);
  const height = clamp(parseInt($('image-height').value), 1);
  
  // initialize extensions
  EXTENSIONS.map(name => {
    const extension = gl.getExtension(name);
    if (extension !== null) {
      return extension;
    } else {
      throw new Error(`WebGL extension '${name}' is not supported`);
    }
  });
  
  // compile shaders/programs
  await Promise.all(SHADERS.map(name => loadShaderModule(name)));
  
  state.set('main-program', createProgram(gl, 'fullscreenTri.glsl', 'main.glsl', manager));
  state.set('copy-program', createProgram(gl, 'fullscreenTri.glsl', 'sampleTex.glsl', manager));
  
  // setup render target
  const renderTarget = gl.createFramebuffer();
  const renderTargetAttachment = gl.createTexture();
  
  state.set('render-target', renderTarget);
  manager.add(renderTarget).add(renderTargetAttachment);
  
  gl.bindFramebuffer(gl.FRAMEBUFFER, renderTarget);
  
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, renderTargetAttachment);
  
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, width, height);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, renderTargetAttachment, 0);
  
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  
  // setup copy target for frame capture
  const copyTarget = gl.createFramebuffer();
  const copyTargetAttachment = gl.createTexture();
  
  state.set('copy-target', copyTarget);
  manager.add(copyTarget).add(copyTargetAttachment);
  
  gl.bindFramebuffer(gl.FRAMEBUFFER, copyTarget);
  
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, copyTargetAttachment);
  
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, copyTargetAttachment, 0);
  
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  
  // setup pixel unpack buffer
  const dataTextureBuffer = gl.createBuffer();
  
  manager.add(dataTextureBuffer);
  
  gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, dataTextureBuffer);
  gl.bufferData(gl.PIXEL_UNPACK_BUFFER, getBufferView(json, binary, json.dataTextures.bufferView), gl.STREAM_DRAW);
  
  // setup data textures
  json.dataTextures.descriptors.forEach(({name, internalFormat, width, height, format, type, offset}, i) => {
    const texture = gl.createTexture();
    
    manager.add(texture);
    
    gl.activeTexture(gl.TEXTURE0 + TEXTURE_BASE + i);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, offset);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  });
  
  gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
  
  // setup texture atlas
  const textureAtlas = gl.createTexture();
  
  manager.add(textureAtlas);
  
  gl.activeTexture(gl.TEXTURE0 + TEXTURE_BASE + json.dataTextures.descriptors.length);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, textureAtlas);
  
  const image = await bufferToImage(getBufferView(json, binary, json.atlas.bufferView));
  const {size} = json.atlas;
  
  gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA, size.width, size.height, size.depth, 0, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  
  // setup uniform buffers
  for (let i = 0; i < json.uniformBuffers.length; i++) {
    const {program} = state.get('main-program');
    const {name, bufferView} = json.uniformBuffers[i];
    const data = getBufferView(json, binary, bufferView);
    const index = gl.getUniformBlockIndex(program, name);
    const buffer = gl.createBuffer();
    
    manager.add(buffer);
    
    gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);
    gl.bufferData(gl.UNIFORM_BUFFER, data, gl.STATIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, i, buffer);
    gl.uniformBlockBinding(program, index, i);
  }
  
  gl.bindBuffer(gl.UNIFORM_BUFFER, null);
}

// utility functions
async function captureFrame(gl, state, width, height, title) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const data = new Uint8Array(width * height * 4);
  const imageData = ctx.createImageData(width, height);
  
  // read pixels from copy-target
  gl.bindFramebuffer(gl.FRAMEBUFFER, state.get('copy-target'));
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  
  // image must be flipped
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const dstOffset = 4 * (y * width + x);
      const srcOffset = 4 * ((height - y - 1) * width + x);
      
      imageData.data[dstOffset + 0] = data[srcOffset + 0];
      imageData.data[dstOffset + 1] = data[srcOffset + 1];
      imageData.data[dstOffset + 2] = data[srcOffset + 2];
      imageData.data[dstOffset + 3] = data[srcOffset + 3];
    }
  }
  
  canvas.width = width;
  canvas.height = height;
  ctx.putImageData(imageData, 0, 0);
      
  // use lower quality image for the thumbnail
  const url = canvas.toDataURL('image/png');
  const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.1);
  
  await appendLink(title, url, thumbnailUrl);
}

function getBufferView(json, binary, index) {
  const {offset, length} = json.bufferViews[index];
  
  return binary.slice(offset, offset + length);
}

async function appendLink(title, url, src) {
  const image = await loadImage(src);
  const label = document.createElement('span');
  const link = document.createElement('a');
  
  label.textContent = title;
  
  image.setAttribute('height', THUMBNAIL_IMAGE_HEIGHT);
  image.setAttribute('title', title);
  
  link.setAttribute('download', title);
  link.setAttribute('href', url);
  link.setAttribute('class', 'thumbnail');
  
  link.appendChild(image);
  link.appendChild(label);
  
  $('downloads').appendChild(link);
}