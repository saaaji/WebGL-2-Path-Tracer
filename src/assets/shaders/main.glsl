#version 300 es

precision highp float;
precision highp int;
precision highp sampler2D;
precision highp isampler2D;
precision highp usampler2D;
precision highp sampler2DArray;

out vec4 fragment;

#define INDEX_UNSIGNED(info, idx) texelFetch((info.sampler), ivec2(int(idx) % info.size.x, int(idx) / info.size.x), 0)
#define INDEX(info, idx) texelFetch((info.sampler), ivec2((idx) % info.size.x, (idx) / info.size.x), 0)
#define INDEX_3D(info, idx, z) texelFetch((info.sampler), ivec3((idx) % info.size.x, (idx) / info.size.x, (z)), 0)

#define TRANSFORM_RAY(mat, ray) Ray(\
  (mat * vec4(ray.origin, 1)).xyz,\
  (mat * vec4(ray.direction, 0)).xyz\
)

#define CLAMP_DOT(v1, v2) clamp(dot(v1, v2), 0.0, 1.0)

// structure definitions
struct Ray {
  vec3 origin, direction;
};

struct ShadingTriangle {
  vec3 v0, v1, v2;
  vec3 n0, n1, n2;
  vec2 t0, t1, t2;
  int id, material;
};

struct Triangle {
  vec3 v0, v1, v2;
  int id;
};

struct Material {
  vec3 emissiveFactor;
  vec4 baseColorFactor;
  float metallicFactor, roughnessFactor;
  int baseColorTexture, metallicRoughnessTexture;
};

struct MaterialProperties {
  vec3 emissiveFactor;
  vec3 albedo;
  float alpha;
  float metallicFactor;
  float roughnessFactor;
};

struct BlasDescriptor {
  mat4 worldMatrix, worldMatrixInverse;
  int texelOffset;
};

struct IsectInfo {
  bool frontFace;
  float t;
  vec2 uv;
  vec3 point, geometricNormal, shadingNormal, shadingTangent, shadingBitangent;
  mat3 tbn;
  ShadingTriangle tri;
  Material mat;
  MaterialProperties matProps;
  BlasDescriptor d;
};

struct DataTextureF {
  sampler2D sampler;
  ivec2 size;
};

struct DataTextureI {
  isampler2D sampler;
  ivec2 size;
};

struct DataTextureU {
  usampler2D sampler;
  ivec2 size;
};

struct DataArrayTextureF {
  sampler2DArray sampler;
  ivec2 size;
};

struct TextureDescriptor {
  float section;
  vec2 offset, size;
};

struct EmissivePrimitive {
  int id, blasIndex;
};

// misc. uniforms
uniform uint u_currentSample;
uniform vec2 u_resolution;
uniform float u_emissiveFactor;
uniform float u_lensRadius;
uniform float u_focalDistance;

// inverse of traditional projection matrix used in rasterization
uniform mat4 u_projectionMatrixInverse;
uniform mat4 u_cameraMatrix;

// data textures
uniform DataTextureF u_VERTEX;
uniform DataTextureI u_FACE;
uniform DataTextureI u_MATERIAL;
uniform DataTextureF u_TEXCOORD;
uniform DataTextureF u_NORMAL;
uniform DataTextureF u_accelStruct;

// textures
uniform vec2 u_atlasResolution;
uniform sampler2DArray u_textureAtlas;

// environment map
uniform bool u_useEnvMap;
uniform vec2 u_hdrRes;
uniform sampler2D u_envMap;
uniform sampler2D u_marginalDistribution;
uniform sampler2D u_conditionalDistribution;

// buffers
#define MAX_TEXTURES 32
#define MAX_MATERIALS 32
#define MAX_LIGHTS 32
#define MAX_BLAS 32

layout(std140) uniform TextureDescriptors {
  TextureDescriptor u_textureDescriptors[MAX_TEXTURES];
};

layout(std140) uniform Materials {
  Material u_materials[MAX_MATERIALS];
};

layout(std140) uniform Lights {
  int u_numLights;
  EmissivePrimitive u_lights[MAX_LIGHTS];
};

layout(std140) uniform BlasDescriptors {
  BlasDescriptor u_blasDescriptors[MAX_BLAS];
};

// constants
const int MAX_BOUNCES = 4;
const float EPSILON = 1.0e-10;
const float RAY_OFFSET = 1.0e-3;
const float INFINITY = 1.0 / 0.0;
const float T_MIN = 1e-3;
const float T_MAX = INFINITY;

const float PI = 3.14159265358979323846;
const float TWO_PI  =2.0 * PI;
const float INV_PI = 0.31830988618379067154;
const float INV_TWO_PI = 0.15915494309189533577;
const float PI_OVER_TWO = 1.57079632679489661923;
const float PI_OVER_FOUR = 0.78539816339744830961;

// utilities
vec3 pointAt(Ray ray, float t) {
  return ray.origin + t * ray.direction;
}

ShadingTriangle getShadingTriangle(int id) {
  ivec4 indices = INDEX(u_FACE, id);
  
  vec3 v0 = INDEX(u_VERTEX, indices.x).xyz;
  vec3 v1 = INDEX(u_VERTEX, indices.y).xyz;
  vec3 v2 = INDEX(u_VERTEX, indices.z).xyz;
  
  vec3 n0 = INDEX(u_NORMAL, indices.x).xyz;
  vec3 n1 = INDEX(u_NORMAL, indices.y).xyz;
  vec3 n2 = INDEX(u_NORMAL, indices.z).xyz;
  
  vec2 t0 = INDEX(u_TEXCOORD, indices.x).xy;
  vec2 t1 = INDEX(u_TEXCOORD, indices.y).xy;
  vec2 t2 = INDEX(u_TEXCOORD, indices.z).xy;

  int material = INDEX(u_MATERIAL, indices.x).x;

  return ShadingTriangle(v0, v1, v2, n0, n1, n2, t0, t1, t2, id, material);
}

Triangle getTriangle(int id) {
  ivec4 indices = INDEX(u_FACE, id);
  
  vec3 v0 = INDEX(u_VERTEX, indices.x).xyz;
  vec3 v1 = INDEX(u_VERTEX, indices.y).xyz;
  vec3 v2 = INDEX(u_VERTEX, indices.z).xyz;
  
  return Triangle(v0, v1, v2, id);
}

vec4 sampleTextureAtlas(int textureIndex, vec2 uv) {
  TextureDescriptor descriptor = u_textureDescriptors[textureIndex];
  
  vec2 offsetUv = vec2(descriptor.offset + descriptor.size * uv) / u_atlasResolution;
  vec3 texCoord = vec3(offsetUv, descriptor.section);
  
  return texture(u_textureAtlas, texCoord);
}

#pragma HYDRA include<random.glsl>
#pragma HYDRA include<intersections.glsl>
// #pragma HYDRA __include<anyHit.glsl>
#pragma HYDRA include<closestHit.glsl>
#pragma HYDRA include<sample.glsl>
#pragma HYDRA include<phong.glsl>

vec3 emittedRadiance(IsectInfo isect) {
  return isect.matProps.emissiveFactor * 2.0;
}

float powerHeuristic(float p1, float p2) {
  return (p1 * p1) / (p1 * p1 + p2 * p2);
}

vec3 sampleBrdf(IsectInfo isect, vec3 wi, vec3 wo) {
  // return isect.matProps.albedo * INV_PI;
  // return vec3(0.5)*INV_PI;
  return evalPhongBrdf(wi, wo, isect.shadingNormal, isect.matProps.albedo, vec3(0.05), 20.0);
}

vec3 sampleEquirectangularMap(sampler2D map, Ray ray) {
  // atan returns [-pi, pi]
  float phi = atan(ray.direction.z, ray.direction.x) + PI;
  
  // asin returns [-pi/2, pi/2]
  float theta = asin(-ray.direction.y) + PI_OVER_TWO;
  
  vec2 uv = vec2(phi * INV_TWO_PI, theta * INV_PI);
  vec3 radiance = texture(map, uv).rgb;
  
  return radiance;
}

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

float envMapPdf(Ray ray) {
  // atan returns [-pi, pi]
  float phi = atan(ray.direction.z, ray.direction.x) + PI;
  
  // asin returns [-pi/2, pi/2]
  float theta = asin(-ray.direction.y) + PI_OVER_TWO;
  float sinTheta = sin(theta);
  
  if (sinTheta == 0.0) {
    return 0.0;
  }
  
  // convert from spherical coordinates to texture coordinates
  vec2 uv = vec2(phi * INV_TWO_PI, theta * INV_PI);
  
  // compute pdf by finding product of marginal pdf and conditional pdf
  float marginalPdf = texture(u_marginalDistribution, vec2(uv.y, 0)).y;
  float conditionalPdf = texture(u_conditionalDistribution, uv).y;
  
  // convert domain from image to solid angle
  float pdf = (marginalPdf * conditionalPdf * u_hdrRes.x * u_hdrRes.y) / (2.0 * PI * PI * sinTheta);
  
  return pdf;
}

// importance sample the environment map using pre-computed lookup tables
vec3 sampleEnvMap(IsectInfo isect, Ray ray) {
  // sample piecewise-constant inverse CDF lookup tables
  float v = texture(u_marginalDistribution, vec2(rand(), 0)).x;
  float u = texture(u_conditionalDistribution, vec2(rand(), v)).x;

  vec2 uv = vec2(u, v);
  vec3 incomingRadiance = texture(u_envMap, uv).rgb;

  // convert from texture coordinates to spherical coordinates
  float theta = v * PI;
  float phi = u * TWO_PI;
  
  float sinTheta = sin(theta), cosTheta = cos(theta), sinPhi = sin(phi), cosPhi = cos(phi);

  if (sinTheta == 0.0) {
    return vec3(0);
  }
  
  // compute pdf by finding product of marginal pdf and conditional pdf
  float marginalPdf = texture(u_marginalDistribution, vec2(v, 0)).y;
  float conditionalPdf = texture(u_conditionalDistribution, uv).y;
  
  // convert domain from image to solid angle
  float pdf = (marginalPdf * conditionalPdf * u_hdrRes.x * u_hdrRes.y) / (2.0 * PI * PI * sinTheta);
  
  if (pdf == 0.0) {
    return vec3(0);
  }
  
  // spawn shadow ray
  vec3 wi = vec3(-sinTheta * cosPhi, cosTheta, -sinTheta * sinPhi);
  Ray shadowRay = Ray(isect.point + isect.geometricNormal * RAY_OFFSET, wi);
  
  // TODO: FIX!!!
  // if (!anyHit(shadowRay, T_MIN, T_MAX)) {
  if (false) {
    vec3 brdf = sampleBrdf(isect, wi, -ray.direction);
    
    float cosTheta = CLAMP_DOT(wi, isect.shadingNormal);
    float bxdfPdf = cosineHemispherePdf(cosTheta);
    
    float weight = powerHeuristic(pdf, bxdfPdf);
    return weight * incomingRadiance * brdf * cosTheta / pdf;
  }
  
  return vec3(0);
}

vec3 uniformSampleOneLight(IsectInfo isect, Ray ray) {
  // uniformly sample one light among set of area lights
  EmissivePrimitive k = u_lights[int(rand() * float(u_numLights))];
  ShadingTriangle lightSource = getShadingTriangle(k.id);
  
  // uniformly sample point on selected light
  vec3 y = uniformSampleTriangle(lightSource);
  
  BlasDescriptor d = u_blasDescriptors[k.blasIndex];
  y = (d.worldMatrix * vec4(y, 1)).xyz;
  
  vec3 x = isect.point;
  vec3 xy = y - x;
  
  // spawn shadow ray
  IsectInfo shadowIsect;
  Ray shadowRay = Ray(x, normalize(xy));
  
  // determine visibility
  float v;
  if (closestHit(shadowRay, T_MIN, T_MAX, shadowIsect)) {
    if (shadowIsect.tri.id == lightSource.id) {
      vec3 brdf = sampleBrdf(isect, shadowRay.direction, -ray.direction);
      
      float distanceSquared = dot(xy, xy);
      float cosThetaX = CLAMP_DOT(isect.shadingNormal, shadowRay.direction);
      float cosThetaY = CLAMP_DOT(shadowIsect.geometricNormal, -shadowRay.direction);
      float bxdfPdf = cosineHemispherePdf(cosThetaX);
      float pdf = uniformTrianglePdf(lightSource, d) / float(u_numLights);
      
      pdf *= distanceSquared / cosThetaY;
      
      float weight = powerHeuristic(pdf, bxdfPdf);
      return weight * emittedRadiance(shadowIsect) * brdf * cosThetaX / pdf;
    }
  }
  
  return vec3(0);
}

vec3 test[] = vec3[](
  vec3(1)
);

vec3 traceRay(Ray ray) {
  IsectInfo isect, shadowIsect;
  
  vec3 radiance = vec3(0);
  vec3 throughput = vec3(1);
  
  // if (closestHit(ray, T_MIN, T_MAX, isect)) {
  //   vec3 dielectricBrdf = vec3(0);
  //   vec3 metallicBrdf = vec3(1);
    
  //   vec3 brdf = mix(
  //     dielectricBrdf,
  //     metallicBrdf,
  //     isect.matProps.metallicFactor
  //   );
    
  //   return brdf;
  // } else {
  //   return vec3(0);
  // }
   
  for (int bounces = 0; bounces < 4; bounces++) {
    // if (!closestHit_UNSIGNED(ray, T_MIN, T_MAX, isect)) {
    if (!closestHit(ray, T_MIN, T_MAX, isect)) {
      // vec3 sky = mix(
      //   vec3(0.8, 0.6, 0.4),
      //   vec3(0.1, 0.5, 1),
      //   smoothstep(-0.5, 0.5, ray.direction.y)
      // );
      // return sky * throughput * 1.0;
      return vec3(0);
    } else {
      // return vec3(1);
      // return vec3(1, isect.uv);
      vec3 t = 0.5 + 0.5 * isect.geometricNormal;
      // return vec3(
      //   mix(vec3(1, 0, 0), vec3(0, 0, 1), t)
      // );
      return t;
    }
  
    ray.origin = isect.point;
    ray.direction = isect.tbn * uniformSampleHemisphere();
    
    throughput *= INV_PI * isect.matProps.albedo;
  }
  
  return vec3(0);
  
  // return throughput;
  
  // return vec3(0);
  // return throughput;
  /*return throughput;
  
  for (int bounces = 0; bounces < MAX_BOUNCES; bounces++) {
    if (bounces == 0) {
      if (closestHit(ray, T_MIN, T_MAX, isect)) {
      // if (closestHit_STACK(ray, T_MIN, T_MAX, isect)) {
        radiance += emittedRadiance(isect);
      } else {
        break;
      }
    }
    
    return vec3(1);
    
    // return vec3(isect.uv, 1);
    return 0.5+0.5*isect.geometricNormal; //* sampleTextureAtlas(isect.mat.baseColorTexture, isect.uv).rgb;
    // return isect.matProps.albedo;
    // return vec3(1.0-v);
    radiance += throughput * uniformSampleOneLight(isect, ray);
    // return radiance;
    // return 0.5+0.5*isect.geometricNormal;
    
    vec3 wi = isect.tbn * cosineSampleHemisphere();
    vec3 brdf = sampleBrdf(isect, wi, -ray.direction);
    
    float cosThetaX = CLAMP_DOT(isect.shadingNormal, wi);
    float pdf = cosineHemispherePdf(cosThetaX);
    
    throughput *= brdf * cosThetaX / pdf;
    
    ray.origin = isect.point;
    ray.direction = wi;
    
    if (closestHit(ray, T_MIN, T_MAX, isect)) {
      if (any(greaterThan(isect.matProps.emissiveFactor, vec3(0)))) {
        float cosThetaY = CLAMP_DOT(isect.geometricNormal, -wi);
        float areaPdf = uniformTrianglePdf(isect.tri, isect.d) / float(u_numLights);
        
        areaPdf *= pow(isect.t, 2.0) / cosThetaY;
        
        float weight = powerHeuristic(pdf, areaPdf);
        radiance += abs(weight * emittedRadiance(isect) * throughput);
        // return vec3(weight);
        // return any(lessThan(radiance, r)) ? vec3(1, 0, 0) : vec3(1);
      }
    } else {
      // float envPdf = envMapPdf(ray);
      
      // if (envPdf == 0.0) {
      //   break;
      // }
      
      // float weight = powerHeuristic(pdf, envPdf);
      // radiance += 1.0 * sampleEquirectangularMap(u_envMap, ray) * throughput;
      // radiance += 0.5*throughput;
      break;
    }
    
  }
  
  return radiance;
  // return vec3(1);
  
  // IsectInfo isect, shadowIsect;
  // vec3 radiance = vec3(0);
  // vec3 throughput = vec3(1);
  
  // for (int bounces = 0; bounces < MAX_BOUNCES; bounces++) {
  //   if (bounces == 0) {
  //     if (closestHit(ray, T_MIN, T_MAX, isect)) {
  //       radiance += emittedRadiance(isect);
  //     } else if (u_useEnvMap) {
  //       // radiance += sampleEquirectangularMap(u_envMap, ray);
  //       break;
  //     } else {
  //       break;
  //     }
  //   }
    
  //   // return 0.5+0.5*isect.geometricNormal;
  //   // account for contribution of direct illumination
  //   // if (u_useEnvMap) {
  //   //   radiance += throughput * sampleEnvMap(isect, ray);
  //   // }
    
  //   // radiance += throughput * uniformSampleOneLight(isect, ray);
  //   // return radiance;
    
  //   // account for contribution of indirect illumination
  //   vec3 wi = isect.tbn * cosineSampleHemisphere();
  //   vec3 brdf = sampleBrdf(isect, wi, -ray.direction);
    
  //   float cosThetaX = CLAMP_DOT(isect.shadingNormal, wi);
  //   float pdf = cosineHemispherePdf(cosThetaX);
    
  //   if (pdf == 0.0) {
  //     break;
  //   }
    
  //   throughput *= brdf * cosThetaX / pdf;
    
  //   ray.direction = wi;
  //   ray.origin = isect.point;
    
  //   // apply appropriate MIS weights to BXDF contribution
  //   if (closestHit(ray, T_MIN, T_MAX, isect)) {
  //     if (any(greaterThan(isect.matProps.emissiveFactor, vec3(0)))) {
  //       float cosThetaY = CLAMP_DOT(isect.geometricNormal, -wi);
  //       // float areaPdf = uniformTrianglePdf(isect.tri) / float(u_numLights);
        
  //       // areaPdf *= pow(isect.t, 2.0) / cosThetaY;
        
  //       // float weight = powerHeuristic(pdf, areaPdf);
  //       radiance += 1.0 * emittedRadiance(isect) * throughput;
  //     }
  //   } else if (u_useEnvMap) {
  //     // float envPdf = envMapPdf(ray);
      
  //     // if (envPdf == 0.0) {
  //     //   break;
  //     // }
      
  //     // float weight = powerHeuristic(pdf, envPdf);
  //     // radiance += 1.0 * sampleEquirectangularMap(u_envMap, ray) * throughput;
  //     break;
  //   } else {
  //     break;
  //   }
  // }
  
  // return radiance;*/
}

vec3 _traceRay(Ray ray) {
  IsectInfo isect, shadowIsect;
  vec3 radiance = vec3(0);
  vec3 throughput = vec3(1);
  float v;
  for (int bounces = 0; bounces < MAX_BOUNCES; bounces++) {
    if (!closestHit(ray, T_MIN, T_MAX, isect)) {
      // radiance += throughput * 0.5;
      // radiance += throughput * sampleEquirectangularMap(u_envMap, ray);
      break;
    }
    
    // return vec3(1);
    // return 0.5+0.5*isect.geometricNormal;
    // return isect.matProps.albedo;
    
    vec3 wi = isect.tbn * uniformSampleHemisphere();
    vec3 brdf = isect.matProps.albedo * INV_PI;
    float cosTheta = CLAMP_DOT(isect.geometricNormal, wi);
    float pdf = uniformHemispherePdf();
    
    radiance += emittedRadiance(isect) * throughput;
    throughput *= brdf * cosTheta / pdf;
    
    ray.origin = isect.point;
    ray.direction = wi;
  }
  
  return radiance;
}

Ray generateRay() {
#define MSAA
#ifdef MSAA
  vec2 uv = (gl_FragCoord.xy + vec2(rand(), rand())) / u_resolution;
#else
  vec2 uv = gl_FragCoord.xy / u_resolution;
#endif // MSAA
  vec3 ndc = vec3(uv * 2.0 - 1.0, -1);
  vec4 view = u_projectionMatrixInverse * vec4(ndc, 1);
  vec3 camera = normalize(view.xyz / view.w);
  
  Ray ray = Ray(vec3(0), camera);
  vec3 focalPoint = pointAt(ray, u_focalDistance / -ray.direction.z);
  vec2 lensPos = u_lensRadius * concentricSampleDisk();
  
  focalPoint = (u_cameraMatrix * vec4(focalPoint, 1)).xyz;
  ray.origin = (u_cameraMatrix * vec4(lensPos, 0, 1)).xyz;
  ray.direction = normalize(focalPoint - ray.origin);
  
  return ray;
}

// #define REPLACE_NANS
#define INTEGRATOR traceRay

void main() {
  seedRand();
  Ray ray = generateRay();
  
  vec3 color = INTEGRATOR(ray);
  fragment = vec4(color, 1);
  
#ifdef REPLACE_NANS
  if (any(isnan(color))) {
    fragment = vec4(0, 0, 0, 1);
  }
#endif
}