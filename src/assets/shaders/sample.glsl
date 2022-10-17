#ifndef SAMPLE
#define SAMPLE

/**
 * Drawing a sample X_i from arbitrary PDF:
 * 1. Compute CDF: P(X) = \int_{0}^{x} p(x')dx'
 * 2. Compute inverse: P^-1(X)
 * 3. Obtain uniformly distributed random number "u"
 * 4. X_i = P^-1(u)
 */
 
/**
 * 2D sampling with multidimensionsal transformations
 *
 * Given 2D joint density function p(x, y):
 * Marginal density function p(x) = \int p(x, y)dy
 *   - average density for particular x over all y values
 * Conditional density function p(y|x) = \frac{p(x, y)}{p(x)}
 *   - density for y given particular x has been chosen
 *
 * Strategy:
 * 1. Compute marginal density
 * 2. Draw sample from marginal density
 * 3. Compute conditional density given previous sample
 * 4. Draw sample from conditional density
 */

vec2 concentricSampleDisk() {
  float u0 = rand() * 2.0 - 1.0;
  float u1 = rand() * 2.0 - 1.0;
  
  if (u0 == 0.0 && u1 == 0.0) {
    return vec2(0);
  }
  
  float theta, r;
  if (abs(u0) > abs(u1)) {
    r = u0;
    theta = PI_OVER_FOUR * (u1 / u0);
  } else {
    r = u1;
    theta = PI_OVER_TWO - PI_OVER_FOUR * (u0 / u1);
  }
  
  return r * vec2(cos(theta), sin(theta));
}
 
/**
 * Uniform hemisphere sampling
 */
vec3 uniformSampleHemisphere() {
  float uRand1 = rand();
  float uRand2 = rand();
  float phi = TWO_PI * uRand2;
  
  // sin = sqrt(1 - cos^2)
  float sinTheta = sqrt(max(0.0, 1.0 - uRand1*uRand1));
  
  return vec3(
    cos(phi) * sinTheta,
    sin(phi) * sinTheta,
    uRand1
  );
}

float uniformHemispherePdf() {
  /**
   * Distribution is uniform (p = c):
   * \int_{\Omega} p(\omega)d\omega = \int_{\Omega} cd\omega = c\int_{\Omega} d\omega = 1
   * Therefore:
   * c=\frac{1}{\int_{\Omega} d\omega}=\frac{1}{2\pi}
   */
  
  return INV_TWO_PI;
}

/**
 * Cosine-weighted hemisphere sampling
 */
vec3 cosineSampleHemisphere() {
  vec2 disk = concentricSampleDisk();
  float z = sqrt(max(0.0, 1.0 - disk.x*disk.x - disk.y*disk.y));
  
  return vec3(disk.x, disk.y, z);
}

float cosineHemispherePdf(float cosTheta) {
  return cosTheta * INV_PI;
}

/**
 * Generates uniformly-distributed point on triangle and its PDF
 */
vec3 uniformSampleTriangle(in ShadingTriangle tri, in BlasDescriptor mesh, inout float pdf) {
  // transform triangle vertices into world space
  tri.v0 = TRANSFORM_VEC(mesh.worldMatrix, tri.v0);
  tri.v1 = TRANSFORM_VEC(mesh.worldMatrix, tri.v1);
  tri.v2 = TRANSFORM_VEC(mesh.worldMatrix, tri.v2);
  
  // evaluate PDF
  vec3 e0 = tri.v1 - tri.v0;
  vec3 e1 = tri.v2 - tri.v0;
  vec3 det = cross(e0, e1);
  
  /**
   * Length of cross product A x B is equal to area of parallelogram
   * formed by A and B; halve this value to find the area of the triangle
   */
  float area = length(det) / 2.0;
  pdf = 1.0 / area;
  
  // generate random sample
  float uRand1 = rand();
  float uRand2 = rand();
  float root1 = sqrt(uRand1);
  
  float u = 1.0 - root1;
  float v = uRand2 * root1;
  float w = 1.0 - u - v;
  
  return u * tri.v0 + v * tri.v1 + w * tri.v2;
}

float uniformTrianglePdf(in ShadingTriangle tri, in BlasDescriptor mesh) {
  // transform triangle vertices into world space
  tri.v0 = TRANSFORM_VEC(mesh.worldMatrix, tri.v0);
  tri.v1 = TRANSFORM_VEC(mesh.worldMatrix, tri.v1);
  tri.v2 = TRANSFORM_VEC(mesh.worldMatrix, tri.v2);
  
  // evaluate PDF
  vec3 e0 = tri.v1 - tri.v0;
  vec3 e1 = tri.v2 - tri.v0;
  vec3 det = cross(e0, e1);
  
  /**
   * Length of cross product A x B is equal to area of parallelogram
   * formed by A and B; halve this value to find the area of the triangle
   */
  float area = length(det) / 2.0;
  return 1.0 / area;
}

/**
 * MIS
 */
#define MIS_BETA 2.0
 
float balanceHeuristic(float n1, float p1, float n2, float p2) {
  return (n1 * p1) / (n1 * p1 + n2 * p2);
}

// hard-coded samples = 1
float balanceHeuristic(float p1, float p2) {
  return p1 / (p1 + p2);
}

float powerHeuristic(float n1, float p1, float n2, float p2) {
  float p = pow(n1 * p1, MIS_BETA);
  float g = pow(n2 * p2, MIS_BETA);
  
  return p / (p + g);
}

// hard-coded samples = 1
float powerHeuristic(float p1, float p2) {
  float p = pow(p1, MIS_BETA);
  float g = pow(p2, MIS_BETA);
  
  return p / (p + g);
}

// hard-coded beta = 2 (^2)
float powerHeuristic2(float p1, float p2) {
  return (p1 * p1) / (p1 * p1 + p2 * p2);
}

#endif