#version 300 es

// precision qualifiers
precision mediump float;
precision mediump sampler2DArray;

// fragment I/O
layout (location = 0) out vec4 out_albedo;
layout (location = 1) out vec4 out_normal;

in vec3 v_normal;
in vec3 v_dir;

// constants
const vec3 AMBIENT = vec3(0.1);
const vec3 DIR = vec3(0, 0, -1);

// uniforms
uniform vec3 u_visColor;
uniform bool u_unlit;

void main() {
  vec3 normal = normalize(v_normal);
  vec3 albedo = u_visColor.rgb * (AMBIENT + abs(dot(normal, -DIR)));
  float specular = pow(abs(dot(normal, normalize(v_dir))), 300.0);
  
  out_albedo = vec4(min(albedo + specular, vec3(1)), 1);
  out_normal = vec4(0.5 * (normal + 1.0), 1);
}