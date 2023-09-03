#ifndef CLOSEST_HIT
#define CLOSEST_HIT

// determine if ray intersects ShadingTriangle
bool intersectsTriangle(ShadingTriangle tri, BlasDescriptor descriptor, Ray objectRay, float tMin, float tMax, out IsectInfo isect) {
  vec3 e1 = tri.v1 - tri.v0;
  vec3 e2 = tri.v2 - tri.v0;
  vec3 pVec = cross(objectRay.direction, e2);
  float det = dot(e1, pVec);
  
  if (abs(det) < EPSILON)
    return false;
    
  float invDet = 1.0 / det;
  vec3 tVec = objectRay.origin - tri.v0;
  float u = invDet * dot(pVec, tVec);
  
  if (u < 0.0 || u > 1.0)
    return false;
  
  vec3 qVec = cross(tVec, e1);
  float v = invDet * dot(objectRay.direction, qVec);
  
  if (v < 0.0 || u + v > 1.0)
    return false;
  
  float t = invDet * dot(e2, qVec);
  
  if (t < tMax && t > tMin) {
    float w = 1.0 - u - v;
    
    // clamp to avoid color bleeding at texture boundaries
    vec2 uv = clamp(w * tri.t0 + u * tri.t1 + v * tri.t2, vec2(0), vec2(0.99));
    
    vec3 shadingNormal = normalize(w * tri.n0 + u * tri.n1 + v * tri.n2);
    vec3 geometricNormal = normalize(cross(e1, e2));
    
    setNormal(objectRay, shadingNormal, geometricNormal, isect);

// #define CULL_FACE
#ifdef CULL_FACE
    if (!isect.frontFace) {
      return false;
    }
#endif

    // correct
    mat3 normalMatrix = mat3(transpose(descriptor.worldMatrixInverse));
    
    isect.geometricNormal = normalize(normalMatrix * isect.geometricNormal);
    isect.shadingNormal = normalize(normalMatrix * isect.shadingNormal);
    
    Material mat = u_materials[tri.material];
    MaterialProperties matProps;
    
    vec4 baseColor = sampleTextureAtlas(mat.baseColorTexture, uv);
    vec4 metallicRoughness = sampleTextureAtlas(mat.metallicRoughnessTexture, uv);

    matProps.albedo = mat.baseColorFactor.rgb * baseColor.rgb;
    matProps.alpha = mat.baseColorFactor.a * baseColor.a;
    matProps.metallicFactor = metallicRoughness.r;
    matProps.roughnessFactor = metallicRoughness.g;
    matProps.emissiveFactor = mat.emissiveFactor;
    
    /**
     * matrix equation for geometric tangent and bitangent:
     * [ uv_1 - uv_0 ] * [ tangent ] = [p_1 - p_0]
     * [ uv_2 - uv_0 ]   [bitangent] = [p_2 - p_0]
     *
     * [ tangent ] = [ uv_1 - uv_0 ]^-1 * [p_1 - p_0]
     * [bitangent] = [ uv_2 - uv_0 ]      [p_2 - p_0]
     *
     * shading bitangent = normalize(cross(normal, tangent))
     * shading tangent = cross(normal, shading bitangent)
     */
    
    vec2 uv1 = tri.t1 - tri.t0;
    vec2 uv2 = tri.t2 - tri.t0;
    
    float det = (uv1.x * uv2.y - uv1.y * uv2.x);
    
    vec3 shadingTangent, shadingBitangent;
    
    if (abs(det) < EPSILON) {
      vec3 normal = isect.shadingNormal;
      
      if (abs(normal.x) > abs(normal.y)) {
        shadingTangent = normalize(vec3(-normal.z, 0, normal.x));
      } else {
        shadingTangent = normalize(vec3(0, -normal.z, normal.y));
      }
      
      shadingBitangent = cross(normal, shadingTangent);
    } else {
      float invDet = 1.0 / det;
      vec3 normal = isect.shadingNormal;
      vec3 tangent = (uv2.y * e1 - uv1.y * e2) * invDet;
      
      shadingBitangent = normalize(cross(normal, tangent));
      shadingTangent = cross(normal, shadingBitangent);
    }
    
    isect.t = t;
    isect.uv = uv;
    isect.tri = tri;
    isect.mat = mat;
    isect.matProps = matProps;
    isect.shadingTangent = shadingTangent;
    isect.shadingBitangent = shadingBitangent;
    isect.tbn = mat3(isect.shadingTangent, isect.shadingBitangent, isect.shadingNormal);
    isect.mesh = descriptor;
    
    // transform intersection point from object- to world-space
    isect.point = (descriptor.worldMatrix * vec4(pointAt(objectRay, t), 1)).xyz;
    
    return true;
  }
  
  return false;
}

/**
 * closest ray intersection
 * for: miss-link traversal
 */
bool closestHit(Ray worldRay, float tMin, float tMax, out IsectInfo isect) {
  bool anyHit = false;
  float tClosest = tMax;
  
  int texelOffset = 0;
  int cachedIndex = 0;
  int index = 0;
  
  IsectInfo temp;
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
    
    if (intersectsAABB(minBound, maxBound, traversalRay, tMin, tClosest)) {
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
          ShadingTriangle tri = getShadingTriangle(primitiveId);
          
          if (intersectsTriangle(tri, mesh, traversalRay, tMin, tClosest, temp)) {
            anyHit = true;
            isect = temp;
            tClosest = temp.t;
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
  
  return anyHit;
}



#endif // CLOSEST_HIT