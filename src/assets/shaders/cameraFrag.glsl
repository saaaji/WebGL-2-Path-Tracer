#version 300 es

// precision qualifiers
precision mediump float;

// fragment I/O
layout(location = 0) out vec4 out_color;
layout(location = 1) out vec4 out_edge;

in vec3 v_position;

uniform vec3 u_visColor;
uniform float u_alpha;

void main() {
  out_color = vec4(u_visColor, u_alpha);
  out_edge = vec4(1.0 - u_alpha);
}