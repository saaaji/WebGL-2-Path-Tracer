import { Vector3 } from '../../math/Vector3.js';
import { AABB } from '../../accel/AABB.js';

export const closestHit_GlslMirror = (function() {
  const GLSL_EPSILON = 0.001;

  const fetchTri = (id, f, v) => {
    const f0 = f[id*3+0];
    const f1 = f[id*3+1];
    const f2 = f[id*3+2];

    const v0 = new Vector3(v[f0*3+0], v[f0*3+1], v[f0*3+2]);
    const v1 = new Vector3(v[f1*3+0], v[f1*3+1], v[f1*3+2]);
    const v2 = new Vector3(v[f2*3+0], v[f2*3+1], v[f2*3+2]);

    return [v0, v1, v2];
  }

  const intersectsTri = (ray, [v0, v1, v2], tMin = Number.EPSILON, tMax = +Infinity) => {
    const e1 = new Vector3().subVectors(v1, v0);
    const e2 = new Vector3().subVectors(v2, v0);
    const p = new Vector3().crossVectors(ray.direction, e2);
    const det = e1.dot(p);

    if (Math.abs(det) < GLSL_EPSILON) {
      return [false, 0];
    }

    const invDet = 1 / det;
    const t = new Vector3().subVectors(ray.origin, v0);
    const u = invDet * p.dot(t);

    if (u < 0 || u > 1) {
      return [false, 0];
    }

    const q = new Vector3().crossVectors(t, e1);
    const v = invDet * ray.direction.dot(q);

    if (v < 0 || u + v > 1) {
      return [false, 0];
    }

    const parametricT = invDet * e2.dot(q);
    
    if (parametricT > tMin && parametricT < tMax) {
      return [true, parametricT];
    }
    
    return [false, 0];
  }

  return function(
    pixels, 
    blasDescriptors,
    faceData,
    vertexData,
    worldRay, 
    tMin = Number.EPSILON, 
    tMax = +Infinity
  ) {
    let anyHit = false;
    let tClosest = tMax;
    let mesh, currentMesh;
    let offset = 0;
    let cachedIndex = 0;
    let index = 0;

    const traversalRay = worldRay.clone();
    const bounds = new AABB();
    const pixels32i = new Int32Array(pixels.buffer);

    /**
     * index may be negative when traversing BLAS (offset > 0)
     * UNLESS BLAS is last in sequence
     */
    let z = 0;
    while (index >= 0 || offset > 0 && cachedIndex > 0 && z++ < 50) {
      // reached dead end
      if (index < 0) {
        index = cachedIndex;
        traversalRay.copy(worldRay);
        offset = 0;
      }

      const raw = offset + index;

      bounds.set(
        pixels[raw+0], pixels[raw+1], pixels[raw+2], 
        pixels[raw+4], pixels[raw+5], pixels[raw+6]);

      const missIndex = pixels32i[raw+3] * 4;
      const primitiveId = pixels32i[raw+7];

      const [hit] = traversalRay.intersectsAABB(bounds);

      if (hit) {
        if (primitiveId >= 0) {
          // if node is leaf, check if traversing mesh/triangle level
          if (offset === 0) {
            const meshInfo = blasDescriptors[primitiveId];
            offset = meshInfo.offset;
            traversalRay.applyMatrix4(meshInfo.inverseWorldMatrix);
            cachedIndex = missIndex;
            index = 0;
            currentMesh = meshInfo.reference;
          } else {
            const [hit, t] = intersectsTri(traversalRay, fetchTri(primitiveId, faceData, vertexData), tMin, tClosest);

            if (hit) {
              anyHit = true;
              tClosest = t;
              mesh = currentMesh;
            }

            index = missIndex;
          }
        } else {
          index += 8;
        }
      } else {
        // follow miss-link to bypass branch if ray misses bounding box
        index = missIndex;
      }
    }

    return [anyHit, mesh];
  }
})();