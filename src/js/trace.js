import { createProgram, loadShaderModule } from './utilities/shaders.js';
import { decodeHydra } from './loading/hydra.js';
import { Matrix4 } from './math/Matrix4.js';
import { Vector3 } from './math/Vector3.js';

const NUM_GROUPS_X = 5;
const NUM_GROUPS_Y = 5;

const EXTENSIONS = [
  'EXT_color_buffer_float',
  'EXT_float_blend',
];

const SHADERS = [
  'main.glsl',
  'sampleTex.glsl',
  'fullscreenTri.glsl',
  'random.glsl',
  'intersections.glsl',
];

const sceneSelection = document.getElementById('scene-selection');
const renderScene = document.getElementById('render-scene');
const renderInfo = document.getElementById('render-info');

sceneSelection.onchange = () => renderScene.disabled = sceneSelection.files.length === 0;

renderScene.onclick = async () => {
  sceneSelection.disabled = sceneSelection.parentElement.disabled = renderScene.disabled = true;
  const [file] = sceneSelection.files;
  const scene = await decodeHydra(file);
  main(scene);
};

async function main([json, buffer]) {
  console.log(json);
  
  // initialize WebGL 2.0 context
  const canvas = document.getElementById('hydra-canvas');
  const gl = canvas.getContext('webgl2');
  
  const WIDTH = 500;
  const HEIGHT = 500;
  const ASPECT_RATIO = WIDTH / HEIGHT;
  
  if (!gl) {
    throw new Error('WebGL 2.0 is not supported');
  }
  
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  gl.blendEquation(gl.FUNC_ADD);
  gl.blendFunc(gl.ONE, gl.ONE);
  
  // initialize extensions
  const [] = EXTENSIONS.map(name => {
    const extension = gl.getExtension(name);
    if (extension !== null) {
      return extension;
    } else {
      throw new Error(`WebGL extension '${name}' is not supported`);
    }
  });
  
  // compile shaders
  await Promise.all(SHADERS.map(name => loadShaderModule(name)));
  const mainProgram = createProgram(gl, 'fullscreenTri.glsl', 'main.glsl');
  const presentProgram = createProgram(gl, 'fullscreenTri.glsl', 'sampleTex.glsl');
  
  const nearestSampler = gl.createSampler();
  gl.samplerParameteri(nearestSampler, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.samplerParameteri(nearestSampler, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.samplerParameteri(nearestSampler, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.samplerParameteri(nearestSampler, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  
  const accumulationBuffer = gl.createFramebuffer();
  const accumulationTex = gl.createTexture();
  gl.bindFramebuffer(gl.FRAMEBUFFER, accumulationBuffer);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, accumulationTex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, WIDTH, HEIGHT);
  gl.bindSampler(0, nearestSampler);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, accumulationTex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  
  gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, gl.createBuffer());
  gl.bufferData(gl.PIXEL_UNPACK_BUFFER, extractBufferView(json, json.dataTextures.bufferView, buffer), gl.STREAM_DRAW);
  
  json.dataTextures.descriptors.forEach(({internalFormat, width, height, format, type, offset}, i) => {
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1 + i);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.bindSampler(i + 1, nearestSampler);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, offset);
  });
  
  gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
  
  await uploadTextureAtlas(json, buffer, gl, mainProgram);
  uploadUniformBuffers(json, buffer, gl, mainProgram);
  
  const tileWidth = Math.floor(WIDTH / NUM_GROUPS_X);
  const tileHeight = Math.floor(HEIGHT / NUM_GROUPS_Y);
  let sampleCount = 1;
  
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  
  const projectionMatrix = new Matrix4().perspective(
    json.camera.parameters.fov,
    json.camera.parameters.near,
    json.camera.parameters.far,
    ASPECT_RATIO,
  );
  
  const viewMatrix = new Matrix4().setFromArray(json.camera.worldMatrix);
  
  window.requestAnimationFrame(function render() {
    console.info(`samples: ${sampleCount}`);
    
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, accumulationBuffer);
    gl.enable(gl.BLEND);
    gl.useProgram(mainProgram.object);
    gl.uniform1ui(mainProgram.uniforms.u_currentSample, sampleCount);
    gl.uniform2f(mainProgram.uniforms.u_resolution, WIDTH, HEIGHT);
    gl.uniform2f(mainProgram.uniforms.u_atlasResolution, json.atlas.size.width, json.atlas.size.height);
    gl.uniform1i(mainProgram.uniforms.u_ATLAS, json.dataTextures.descriptors.length + 1);
    gl.uniformMatrix4fv(mainProgram.uniforms.u_projectionInverse, false, projectionMatrix.inverse.elements);
    gl.uniformMatrix4fv(mainProgram.uniforms.u_cameraTransform, false, viewMatrix.elements);
    gl.uniformMatrix4fv(mainProgram.uniforms.u_cameraTransformInverse, false, viewMatrix.inverse.elements);
    
    json.dataTextures.descriptors.forEach(({name, width, height}, i) => {
      gl.uniform2i(mainProgram.uniforms[`u_${name}.size`], width, height);
      gl.uniform1i(mainProgram.uniforms[`u_${name}.sampler`], i + 1);
    });
    
    for (let x = 0; x < NUM_GROUPS_X; x++) {
      for (let y = 0; y < NUM_GROUPS_Y; y++) {
        gl.viewport(x * tileWidth, y * tileHeight, tileWidth, tileHeight);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }
  
    gl.finish();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.BLEND);
    gl.useProgram(presentProgram.object);
    gl.uniform1i(presentProgram.uniforms.u_accumulationTex, 0);
    gl.uniform1f(presentProgram.uniforms.u_sampleCountInv, 1 / sampleCount);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    
    sampleCount++;
    window.requestAnimationFrame(render);
  });
}

function extractBufferView(json, bufferViewIndex, buffer) {
  const bufferView = json.bufferViews[bufferViewIndex];
  return buffer.slice(bufferView.offset, bufferView.offset + bufferView.length);
}

function loadImage(src) {
  return new Promise(resolve => {
    const image = new Image();
    image.src = src;
    image.onload = () => resolve(image);
  });
}

async function convertBufferToImage(buffer, type) {
  const blob = new Blob([buffer], {type});
  const url = URL.createObjectURL(blob);
  const image = await loadImage(url);
  
  return image;
}

async function uploadTextureAtlas(json, buffer, gl, mainProgram) {
  const textureAtlasBuffer = extractBufferView(json, json.atlas.bufferView, buffer);
  const textureAtlasImage = await convertBufferToImage(textureAtlasBuffer);
  const textureAtlas = gl.createTexture();
  const {size} = json.atlas;
  
  gl.activeTexture(gl.TEXTURE1 + json.dataTextures.descriptors.length);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, textureAtlas);
  gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA, size.width, size.height, size.depth, 0, gl.RGBA, gl.UNSIGNED_BYTE, textureAtlasImage);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
}

function uploadUniformBuffers(json, buffer, gl, mainProgram) {
  for (let i = 0; i < json.uniformBuffers.length; i++) {
    const {name, bufferView} = json.uniformBuffers[i];
    const data = extractBufferView(json, bufferView, buffer);
    const uniformBuffer = gl.createBuffer();
    const index = gl.getUniformBlockIndex(mainProgram.object, name);
    
    gl.bindBuffer(gl.UNIFORM_BUFFER, uniformBuffer);
    gl.bufferData(gl.UNIFORM_BUFFER, data, gl.STATIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, i, uniformBuffer);
    gl.uniformBlockBinding(mainProgram.object, index, i);
  }
  
  gl.bindBuffer(gl.UNIFORM_BUFFER, null);
}