#ifndef ANY_HIT
#define ANY_HIT

bool intersectsTriangle(Triangle tri, Ray ray, float tMin, float tMax) {
  vec3 e1 = tri.v1 - tri.v0;
  vec3 e2 = tri.v2 - tri.v0;
  vec3 pVec = cross(ray.direction, e2);
  float det = dot(e1, pVec);
  
  if (abs(det) < EPSILON)
    return false;
    
  float invDet = 1.0 / det;
  vec3 tVec = ray.origin - tri.v0;
  float u = invDet * dot(pVec, tVec);
  
  if (u < 0.0 || u > 1.0)
    return false;
  
  vec3 qVec = cross(tVec, e1);
  float v = invDet * dot(ray.direction, qVec);
  
  if (v < 0.0 || u + v > 1.0)
    return false;
  
  float t = invDet * dot(e2, qVec);
  
  if (t < tMax && t > tMin) {
    return true;
  }
  
  return false;
}

/**
 * any ray intersection
 * for: miss-link traversal
 */
bool anyHit(Ray worldRay, float tMin, float tMax) {
  int texelOffset = 0;
  int cachedIndex = 0;
  int index = 0;
  
  BlasDescriptor mesh;
  Ray traversalRay = worldRay;
  
  // index may be negative if traversing BLAS (unless BLAS is last node of TLAS)
  while (index >= 0 || texelOffset > 0 && cachedIndex > 0) {
    if (index < 0 /* index points outside of tree */) {
      index = cachedIndex;
      traversalRay = worldRay;
      texelOffset = 0;
    }
    
    vec4 nodeTexel0 = INDEX(u_accelStruct, texelOffset + index);
    vec4 nodeTexel1 = INDEX(u_accelStruct, texelOffset + index + 1);
    
    vec3 minBound = nodeTexel0.xyz;
    vec3 maxBound = nodeTexel1.xyz;
    
    int missIndex = floatBitsToInt(nodeTexel0.w);
    int primitiveId = floatBitsToInt(nodeTexel1.w);
    
    if (intersectsAABB(minBound, maxBound, traversalRay, tMin, tMax)) {
      if (primitiveId >= 0) {
        // if node is a leaf, check whether we are traversing at mesh- or triangle-level
        if (texelOffset == 0) {
          // if traversing at mesh-level, shift to triangle-level
          mesh = u_blasDescriptors[primitiveId];
          texelOffset = mesh.texelOffset;
          traversalRay = TRANSFORM_RAY(mesh.worldMatrixInverse, worldRay);
          
          cachedIndex = missIndex;
          index = 0;
        } else {
          // if traversing at triangle-level, intersect ray with primitive
          Triangle tri = getTriangle(primitiveId);
          
          if (intersectsTriangle(tri, traversalRay, tMin, tMax)) {
            return true;
          }
          
          // for leaf nodes, next index in depth-first order & miss link are identical
          index = missIndex;
        }
      } else {
        // if this is an interior node, follow along depth-first order
        index += 2;
      }
    } else {
      // follow miss-link to bypass branch if ray misses bounding box
      index = missIndex;
    }
  }
  
  return false;
}

#endif // ANY_HIT