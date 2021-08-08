#version 300 es

precision highp float;
precision highp int;
precision highp sampler2D;
precision highp isampler2D;
precision highp usampler2D;
precision highp sampler2DArray;

out vec4 fragment;

#define INDEX(info, idx) texelFetch(info.sampler, ivec2((idx) % info.size.x, (idx) / info.size.x), 0)

struct Ray {
  vec3 origin, direction;
};

struct Triangle {
  vec3 v0, v1, v2;
  vec3 n0, n1, n2;
  vec2 t0, t1, t2;
  int id, material;
};

struct Material {
  vec3 emissive;
  int baseColorTexture, metallicRoughnessTexture;
};

struct IsectInfo {
  bool frontFace;
  float t;
  vec2 uv;
  vec3 point, normal;
  Material material;
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

struct TextureDescriptor {
  float section;
  vec2 offset, size;
};

// misc. uniforms
uniform uint u_currentSample;
uniform vec2 u_resolution;
uniform vec2 u_atlasResolution;
uniform mat4 u_projectionInverse;
uniform mat4 u_cameraTransform;
uniform mat4 u_cameraTransformInverse;

// data textures
uniform DataTextureF u_ACCEL;
uniform DataTextureF u_VERTEX;
uniform DataTextureI u_FACE;
uniform DataTextureF u_TEXCOORD;
uniform DataTextureF u_NORMAL;

// textures
uniform sampler2DArray u_ATLAS;

#define MAX_TEXTURES 32
layout(std140) uniform TextureDescriptors {
  TextureDescriptor u_textureDescriptors[MAX_TEXTURES];
};

// materials
#define MAX_MATERIALS 32
layout(std140) uniform Materials {
  Material u_materials[MAX_MATERIALS];
};

// constants
const float EPSILON = 1.0e-10;
// const float EPSILON = 1.0e-11;
const float INFINITY = 1.0 / 0.0;
const float PI = 3.14159;

// utilities
vec3 pointAt(Ray ray, float t) {
  return ray.origin + t * ray.direction;
}

void setNormal(Ray ray, vec3 outwardNormal, inout IsectInfo info) {
  bool frontFace = dot(ray.direction, outwardNormal) < 0.0;
  info.frontFace = frontFace;
  info.normal = frontFace ? outwardNormal : -outwardNormal;
}

Triangle getTriangle(int id) {
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

  return Triangle(v0, v1, v2, n0, n1, n2, t0, t1, t2, id, indices.w);
}

#pragma HYDRA include<random.glsl>
#pragma HYDRA include<intersections.glsl>

vec3 rand_in_unit_sphere() {
  float phi = 2.0 * PI * rand();
  float cosTheta = 2.0 * rand() - 1.0;
  float u = rand();
  float theta = acos(cosTheta);
  float r = pow(u, 1.0 / 3.0);
  
  float x = r * sin(theta) * cos(phi);
  float y = r * sin(theta) * sin(phi);
  float z = r * cos(theta);
  
  return vec3(x, y, z);
}

vec3 traceRay(Ray ray) {
  IsectInfo isect;
  
  vec3 factor = vec3(1);
  vec3 illum = vec3(0);
  
  for (int i = 0; i < 4; i++) {
    if (closestHit(ray, 1e-3, INFINITY, isect)) {
      if (all(greaterThan(isect.material.emissive, vec3(0.1)))) {
        illum += 15.0;
        break;
      } else {
        ray.origin = isect.point;
        ray.direction = normalize(isect.normal + rand_in_unit_sphere());
        
        TextureDescriptor d = u_textureDescriptors[isect.material.baseColorTexture];
        vec4 c = texture(u_ATLAS, vec3((d.offset + d.size * fract(isect.uv)) / u_atlasResolution, d.section));
        factor *= c.rgb;
      }
    }
  }
  
  return illum * factor;
  
  // int i;
  // for (i = 0; i < 4; i++) {
  //   if (closestHit(ray, 1e-3, INFINITY, isect)) {
  //     if (all(greaterThan(isect.material.emissive, vec3(0)))) {
  //       illum += vec3(1);
  //       break;
  //     }
      
  //     ray.origin = isect.point;
  //     ray.direction = normalize(isect.normal + rand_in_unit_sphere());
      
  //     TextureDescriptor d = u_textureDescriptors[isect.material.baseColorTexture];
  //     vec4 c = texture(u_ATLAS, vec3((d.offset + d.size * fract(isect.uv)) / u_atlasResolution, d.section));
  //     factor *= c.rgb;
      
  //   } else {
  //     illum += vec3(1);
  //     break;
  //   }
  // }
  
  // if (i != 0) {
  //   return illum * factor;
  // } else {
  //   return vec3(0);
  // }
}

Ray generateRay() {
#define AA
#ifdef AA
  vec2 uv = (gl_FragCoord.xy + vec2(rand(), rand())) / u_resolution;
#else
  vec2 uv = gl_FragCoord.xy / u_resolution;
#endif

  vec3 ndc = vec3(uv * 2.0 - 1.0, -1);
  vec4 view = u_projectionInverse * vec4(ndc, 1);
  vec4 origin = u_cameraTransform[3];
  vec4 world = u_cameraTransform * vec4(view.xyz / view.w, 0);
  
  Ray ray = Ray(origin.xyz, normalize(world.xyz));
  return ray;
}

void main() {
  seedRand();
  
  Ray ray = generateRay();
  vec3 color = traceRay(ray);
  fragment = vec4(color, 1);
}