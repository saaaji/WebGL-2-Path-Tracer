#version 300 es

// precision qualifiers
precision mediump float;
precision mediump sampler2DArray;

// fragment I/O
layout (location = 0) out vec4 out_albedo;
layout (location = 1) out vec4 out_normal;

in vec3 v_normal;
in vec3 v_dir;
in vec2 v_uv;
flat in int v_mat;

// structure definitions
struct Material {
  vec3 emissiveFactor;
  vec4 baseColorFactor;
  float metallicFactor, roughnessFactor;
  int baseColorTexture, metallicRoughnessTexture;
};

struct TextureDescriptor {
  float section;
  vec2 offset, size;
};

// constants
const vec3 AMBIENT = vec3(0.1);
const vec3 DIR = vec3(0, 0, -1);
const vec3 B_COEFF = vec3(0.2, 0.7, 0.1);
const float GAMMA = 2.2;

// uniforms
uniform vec3 u_visColor;
uniform bool u_unlit;
uniform int u_debugIndex;

uniform vec2 u_atlasResolution;
uniform sampler2DArray u_textureAtlas;

#pragma HYDRA include<usr_shader_defines>

// uniform 
layout(std140) uniform TextureDescriptors {
  TextureDescriptor u_textureDescriptors[MAX_TEXTURES];
};

layout(std140) uniform Materials {
  Material u_materials[MAX_MATERIALS];
};

#pragma HYDRA include<tex.glsl>

void main() {
  vec3 normal = normalize(v_normal);
  float specular = pow(abs(dot(normal, normalize(v_dir))), 150.0);

#ifndef UV_CHECKERBOARD
  Material mat = u_materials[v_mat];
  vec4 baseColor = mat.baseColorFactor * sampleTextureAtlas(mat.baseColorTexture, v_uv);
  float gray = dot(B_COEFF, pow(baseColor.rgb, vec3(1.0/GAMMA)));
  vec3 finalColor = vec3(gray);
#else
  vec3 finalColor;
  if (u_debugIndex % 2 == 0) {
    finalColor = procTexCheckerboard(v_uv).rgb;
  } else {
    finalColor = vec3(v_uv, 0);
  }
#endif
  
  vec3 albedo = finalColor * u_visColor.rgb * (AMBIENT + abs(dot(normal, -DIR)));
  
  // albedo = vec3(v_uv, 0);

  out_albedo = vec4(min(albedo + specular, vec3(1)), 1);
  out_normal = vec4(0.5 * (normal + 1.0), 1);
}