#ifndef INTERSECTIONS
#define INTERSECTIONS

#define TYPE_NODE 0
#define TYPE_LEAF 1
#define BVH_STACK_SIZE 32

// determine if ray intersects triangle
bool intersectsTriangle(Triangle tri, Ray ray, float tMin, float tMax, out IsectInfo isect) {
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
    float w = 1.0 - u - v;
    vec3 normal = normalize(w * tri.n0 + u * tri.n1 + v * tri.n2);
    vec2 uv = clamp(w * tri.t0 + u * tri.t1 + v * tri.t2, vec2(0), vec2(0.99)); // clamp to avoid color bleeding
    
    setNormal(ray, normal, isect);
    isect.t = t;
    isect.uv = uv;
    isect.point = pointAt(ray, t);
    isect.material = u_materials[tri.material];
    
    return true;
  }
  
  return false;
}

// determine if ray intersects AABB
bool intersectsAABB(vec3 minimum, vec3 maximum, Ray ray, float tMin, float tMax) {
  maximum += vec3(0.0001); // DEBUG (FIX!)
  
  for (int a = 0; a < 3; a++) {
    float invD = 1.0 / ray.direction[a];
    float t0 = invD * (minimum[a] - ray.origin[a]);
    float t1 = invD * (maximum[a] - ray.origin[a]);
    
    if (invD < 0.0) {
      float temp = t0;
      t0 = t1;
      t1 = temp;
    }
    
    tMin = t0 > tMin ? t0 : tMin;
    tMax = t1 < tMax ? t1 : tMax;
    if (tMax <= tMin) {
      return false;
    }
  }
  
  return true;
}

bool closestHit(Ray ray, float tMin, float tMax, out IsectInfo isect) {
  int idx = 0;
  bool anyHit = false;
  float tClosest = tMax;
  IsectInfo tempIsect;
  
  while (idx != -1) {
    vec4 c0 = INDEX(u_ACCEL, idx);
    vec4 c1 = INDEX(u_ACCEL, idx + 1);
    
    if (intersectsAABB(c0.xyz, c1.xyz, ray, tMin, tClosest)) {
      int triPtr = int(c0.w);
      
      // hit node, follow depth-first order
      idx += 2;
      
      // check if node contains primitive
      if (triPtr >= 0) {
        Triangle tri = getTriangle(triPtr);
        
        if (intersectsTriangle(tri, ray, tMin, tClosest, tempIsect)) {
          anyHit = true;
          isect = tempIsect;
          tClosest = tempIsect.t;
        } else {
          // missed primitive, find next branch
          idx = int(c1.w);
        }
      }
    } else {
      // missed node, skip children
      idx = int(c1.w);
    }
  }
  
  return anyHit;
}

// bool closestHit(Ray ray, float tMin, float tMax, out IsectInfo isect) {
//   int idx = 0;
//   int ptr = 0;
//   int stack[BVH_STACK_SIZE];
//   bool anyHit = false;
//   float tClosest = tMax;
//   IsectInfo tempIsect;
  
//   stack[ptr++] = -1;
//   stack[ptr++] = 0;
  
//   while ((idx = stack[--ptr]) > -1) {
//     vec4 c0 = INDEX(u_ACCEL, idx);
//     vec4 c1 = INDEX(u_ACCEL, idx + 1);
    
//     if (intersectsAABB(c0.yzw, c1.yzw, ray, tMin, tClosest)) {
//       int type = int(c0.x);
      
//       if (type == TYPE_NODE) {
//         if (ptr < stack.length() - 1) {
//           stack[ptr++] = int(c1.x);
//           stack[ptr++] = idx + 2;
//         } else {
//           break;
//         }
//       } else if (type == TYPE_LEAF) {
//         Triangle tri = getTriangle(int(c1.x));
        
//         if (intersectsTriangle(tri, ray, tMin, tClosest, tempIsect)) {
//           anyHit = true;
//           isect = tempIsect;
//           tClosest = tempIsect.t;
//         }
//       }
//     }
//   }
  
//   return anyHit;
// }

#endif // INTERSECTIONS