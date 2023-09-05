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

#define TRANSFORM_VEC(mat, vec) ((mat * vec4(vec, 1)).xyz)
#define TRANSFORM_DIR(mat, dir) ((mat * vec4(vec, 0)).xyz)

#define CLAMP_DOT(v1, v2) clamp(dot(v1, v2), 0.0, 1.0)
#define ABS_DOT(v1, v2) abs(dot(v1, v2))

#pragma HYDRA include<usr_shader_defines>

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
  vec3 bary;
  vec2 uv;
  vec3 point, geometricNormal, shadingNormal, shadingTangent, shadingBitangent;
  mat3 tbn;
  ShadingTriangle tri;
  Material mat;
  MaterialProperties matProps;
  BlasDescriptor mesh;
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
  int primitiveId, meshId;
};

// misc. uniforms
uniform uint u_currentSample;
uniform vec2 u_resolution;
uniform float u_emissiveFactor;
uniform float u_lensRadius;
uniform float u_focalDistance;

uniform int u_debugIndex;

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
uniform sampler2D u_devImage;

// environment map
uniform bool u_useEnvMap;
uniform vec2 u_hdrRes;
uniform sampler2D u_envMap;
uniform sampler2D u_marginalDistribution;
uniform sampler2D u_conditionalDistribution;

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
const int MAX_BOUNCES = 10;
const float EPSILON = 1.0e-10;
const float RAY_OFFSET = 1.0e-3;
const float INFINITY = 1.0 / 0.0;
const float T_MIN = 1e-3;
const float T_MAX = INFINITY;

const float PI = 3.14159265358979323846;
const float TWO_PI = 2.0 * PI;
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

#pragma HYDRA include<tex.glsl>
#pragma HYDRA include<random.glsl>
#pragma HYDRA include<intersections.glsl>
#pragma HYDRA include<closestHit.glsl>
#pragma HYDRA include<anyHit.glsl>
#pragma HYDRA include<sample.glsl>

//
vec3 bsdf(IsectInfo isect, vec3 wi, vec3 wo) {
  // return vec3(isect.uv, 0.3) * INV_PI;
  return isect.matProps.albedo * INV_PI;
  // float shininess = 20.0;
  // vec3 sp = reflect(wi, isect.shadingNormal);
  // float cosT = dot(sp, wo);
  
  // return isect.matProps.albedo * INV_PI + vec3(0.05) * (shininess+2.0)*INV_TWO_PI*pow(cosT, shininess);
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

/**
 * Returns emitted radiance from surface
 */
vec3 emittedRadiance(IsectInfo isect) {
  vec3 radiance = u_emissiveFactor * isect.matProps.emissiveFactor;
#ifndef DOUBLE_SIDED_EMITTERS
  return radiance * float(isect.frontFace);
#else
  return radiance;
#endif
}

//
vec3 uniformSampleOneLight(IsectInfo isect, Ray ray) {
  int uRandIdx = int(rand() * float(u_numLights));
  
  EmissivePrimitive light = u_lights[uRandIdx];
  ShadingTriangle prim = getShadingTriangle(light.primitiveId);
  BlasDescriptor mesh = u_blasDescriptors[light.meshId];
  
  // generate uniform point on light source & evaluate PDF
  float pdf;
  vec3 y = uniformSampleTriangle(prim, mesh, pdf);
  vec3 x = isect.point;
  vec3 xy = y - x;
  
  // p = p(k) * p(y|k)
  pdf /= float(u_numLights);
  
  // shadow ray
  IsectInfo shadowIsect;
  Ray shadowRay = Ray(x, normalize(xy));
  
  if (closestHit(shadowRay, T_MIN, T_MAX, shadowIsect)) {
    if (shadowIsect.tri.id == light.primitiveId) {
      float distanceSquared = dot(xy, xy);
      float cosThetaX = CLAMP_DOT(isect.shadingNormal, shadowRay.direction);
      float cosThetaY = CLAMP_DOT(shadowIsect.shadingNormal, -shadowRay.direction);
      float bsdfPdf = cosineHemispherePdf(cosThetaX);
      
      pdf *= distanceSquared / cosThetaY;
      
      float weight = powerHeuristic2(pdf, bsdfPdf);
      return weight * emittedRadiance(shadowIsect) * bsdf(isect, shadowRay.direction, -ray.direction) * cosThetaX / pdf;
    }
  }
  
  return vec3(0);
}

// returns RGB/HDR radiance value
vec3 traceRay(Ray ray) {
  IsectInfo isect;
  
  vec3 radiance = vec3(0);
  vec3 throughput = vec3(1);
  
  for (int bounce = 0; bounce < MAX_BOUNCES; bounce++) {
    if (bounce == 0) {
      if (closestHit(ray, T_MIN, T_MAX, isect)) {
        radiance += emittedRadiance(isect);
      } else {
        // check if environment map exists
        break;
      }
    }

    radiance += uniformSampleOneLight(isect, ray) * throughput;
    
    // Draw random direction "wi" from hemisphere
    vec3 wi = isect.tbn * cosineSampleHemisphere();
    
    // Evaluate cosine correction factor for incoming light
    float cosTheta = CLAMP_DOT(wi, isect.shadingNormal);
    
    // Update throughput
    float pdf = cosineHemispherePdf(cosTheta);
    throughput *= bsdf(isect, wi, -ray.direction) * cosTheta / pdf;
    
    // Continue path
    ray.origin = isect.point;
    ray.direction = wi;
    
    if (closestHit(ray, T_MIN, T_MAX, isect)) {
      /**
       * MIS Weighting
       */
       
      // if next primitive is emissive:
      if (any(greaterThan(isect.matProps.emissiveFactor, vec3(0)))) {
        float cosThetaY = CLAMP_DOT(isect.shadingNormal, -wi);
        float areaPdf = uniformTrianglePdf(isect.tri, isect.mesh) / float(u_numLights);
        
        areaPdf *= pow(isect.t, 2.0) / cosThetaY;
        
        float weight = powerHeuristic2(pdf, areaPdf);
        radiance += weight * emittedRadiance(isect) * throughput;
      }
      
      /**
      * Russian roulette survival probability may be any number in [0, 1] and
      * estimator will remain unbiased.
      * Survival probability is inversely proportional to throughput,
      * which is itself dependent on the BSDF & cosine factor (good strategy)
      */
#ifdef RUSSIAN_ROULETTE
      float russianRoulette = max(max(throughput.r, throughput.g), throughput.b);
      if (rand() > russianRoulette) {
        break;
      }
      
      throughput /= russianRoulette;
#endif
    } else {
      // check if environment map exists
      break;
    }
  }
  
  return radiance;
}

Ray generateRay() {
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

void main() {
  /**
  * RAY GENERATION
  */
  seedRand();
  Ray ray = generateRay();
  vec3 color;

#ifndef DEBUG_ATLAS
  color = INTEGRATOR(ray);
#else
  // view textures in atlas using debug index
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 debugWindowRes = vec2(0.4);

  if (all(greaterThan(uv, debugWindowRes))) {
    vec2 previewUv = (uv - debugWindowRes) / (vec2(1) - debugWindowRes);

    color = texture(u_textureAtlas, vec3(previewUv, 0)).rgb;
  } else if (all(lessThan(uv, debugWindowRes))) {
    int index = u_debugIndex % MAX_TEXTURES;
    TextureDescriptor tex = u_textureDescriptors[index];

    vec2 previewUv = uv / debugWindowRes;
    vec3 atlasUv = vec3((tex.offset + tex.size * previewUv) / u_atlasResolution, 0);

    color = texture(u_textureAtlas, atlasUv).rgb;
  } else {
    vec2 devUv = vec2(uv.x, 1.0-uv.y) * 4.0;

    color = texture(u_devImage, devUv).rgb;
  }
#endif // DEBUG_ATLAS

  /**
  * FINAL COLOR
  */
  fragment = vec4(color, 1);
  
#ifdef KILL_NANS
  if (any(isnan(color))) {
    fragment = vec4(0, 0, 0, 1);
  }
#endif
}