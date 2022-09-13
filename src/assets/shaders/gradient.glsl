#version 300 es

// precision qualifiers
precision mediump float;

// fragment I/O
layout (location = 0) out vec4 out_color;

in vec2 v_texCoord;

void main() {
  out_color = vec4(vec3(mix(
    vec3(0.2),
    vec3(0.7),
    v_texCoord.t
  )), 1);
}