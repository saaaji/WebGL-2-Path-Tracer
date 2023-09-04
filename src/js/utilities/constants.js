import { GL_CTX } from './util.js';
import {
  NUM_BLAS,
  NUM_LIGHTS,
  NUM_MATERIALS,
  NUM_TEXTURES,
} from '../loading/hydra.js';

// inline camera geometry
export const CAMERA_VERTICES = [
  -1, -1, -1,
  1, -1, -1,
  -1, 1, -1,
  1, 1, -1,
  -1, -1, 1,
  1, -1, 1,
  -1, 1, 1,
  1, 1, 1,
];

export const CAMERA_INDICES = [
  0, 1, 1, 3, 3, 2, 2, 0,
  4, 5, 5, 7, 7, 6, 6, 4,
  0, 4, 1, 5, 3, 7, 2, 6,
];

export const FOCAL_DIST_PLANE_VERTICES = [
  -1, -1, +1, -1, +1, +1, +1, +1, +1,
  +1, +1, +1, -1, -1, +1, +1, -1, +1,
];

export const FOCAL_DIST_OUTLINE_VERTICES = [
  -1, -1, +1, /* -> */ -1, +1, +1,
  -1, +1, +1, /* -> */ +1, +1, +1,
  +1, +1, +1, /* -> */ +1, -1, +1,
  +1, -1, +1, /* -> */ -1, -1, +1,
];

export const EDITOR_COLOR_SCHEME = window.hydra_EDITOR_COLOR_SCHEME = {
  camera: [0.15, 0.15, 0.15],
  mesh: [0.8, 0.8, 0.8],
  // selection: [1, 0.6, 0],
  selection: [0, 0.6, 1],
  focalPlane: [0, 0.6, 1],
  white: [1, 1, 1],
};

export const TYPE_TO_SIZE = {
  [GL_CTX.BYTE]: 1,
  [GL_CTX.UNSIGNED_BYTE]: 1,
  [GL_CTX.SHORT]: 2,
  [GL_CTX.UNSIGNED_SHORT]: 2,
  [GL_CTX.UNSIGNED_INT]: 4,
  [GL_CTX.INT]: 4,
  [GL_CTX.FLOAT]: 4,
};

export const SHADER_DEFINES =
`#define RUSSIAN_ROULETTE
#define DOUBLE_SIDED_EMITTERS
#define MSAA
#define KILL_NANS
#define INTEGRATOR traceRay
//#define CMP_INTEGRATOR traceRay_CMP
#define CMP_TILE_SIZE 64.0
//#define DEBUG_ATLAS
//#define UV_CHECKERBOARD
//#define CULL_FACE

// BUFFER SIZING INFO (DO NOT TOUCH)
#define MAX_TEXTURES ${NUM_TEXTURES}
#define MAX_MATERIALS ${NUM_MATERIALS}
#define MAX_LIGHTS ${NUM_LIGHTS}
#define MAX_BLAS ${NUM_BLAS}`;