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
  selection: [1, 0.6, 0],
  focalPlane: [0, 0.6, 1],
};