#ifndef INTERSECTIONS
#define INTERSECTIONS

void setNormal(Ray ray, vec3 shadingNormal, vec3 geometricNormal, inout IsectInfo isect) {
  bool frontFace = dot(ray.direction, shadingNormal) < 0.0;
  isect.frontFace = frontFace;
  // isect.geometricNormal = geometricNormal;
  isect.geometricNormal = dot(ray.direction, geometricNormal) < 0.0 ? geometricNormal : -geometricNormal;
  // isect.geometricNormal = geometricNormal;
  isect.shadingNormal = frontFace ? shadingNormal : -shadingNormal;
}

bool intersectsAABB(vec3 minimum, vec3 maximum, Ray ray, float tMin, float tMax) {
  maximum += vec3(0.01); // DEBUG (FIX!)
  
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

#endif // INTERSECTIONS