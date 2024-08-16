#version 300 es

// precision qualifiers
precision mediump float;

// fragment I/O
layout(location = 0) out vec4 out_color;
in vec3 v_color;

void main() {
  out_color = vec4(v_color, 1);
}