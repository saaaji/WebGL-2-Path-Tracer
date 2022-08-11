#ifndef SAMPLE
#define SAMPLE

// cosine sampling of a hemisphere
vec3 cosineSampleHemisphere() {
  float u0 = rand();
  float u1 = rand();
  float phi = 2.0 * PI * u0;
  float s = sqrt(u1);
  
  float x = cos(phi) * s;
  float y = sin(phi) * s;
  float z = sqrt(1.0 - u1);
  
  return vec3(x, y, z);
}

float cosineHemispherePdf(float cosTheta) {
  return cosTheta * INV_PI;
}

// uniform sampling of hemisphere
vec3 uniformSampleHemisphere() {
  float u = rand();
  float z = rand();
  float r = sqrt(max(0.0, 1.0 - z*z));
  
  float phi = 2.0 * PI * u;
  float x = r * cos(phi);
  float y = r * sin(phi);
  
  return vec3(x, y, z);
}

float uniformHemispherePdf() {
  return INV_TWO_PI;
}

// uniform sampling of a ShadingTriangle
vec3 uniformSampleTriangle(ShadingTriangle tri) {
  float u0 = rand();
  float u1 = rand();
  float s = sqrt(u0);
  
  float u = 1.0 - s;
  float v = u1 * s;
  float w = 1.0 - u - v;
  
  return u * tri.v0 + v * tri.v1 + w * tri.v2;
}

float uniformTrianglePdf(ShadingTriangle tri, BlasDescriptor d) {
  tri.v1 = (d.worldMatrix * vec4(tri.v1, 1)).xyz;
  tri.v2 = (d.worldMatrix * vec4(tri.v2, 1)).xyz;
  tri.v0 = (d.worldMatrix * vec4(tri.v0, 1)).xyz;
  
  vec3 e0 = tri.v1 - tri.v0;
  vec3 e1 = tri.v2 - tri.v0;
  vec3 det = cross(e0, e1);
  
  return 2.0 / length(det);
}

#endif // SAMPLE