#version 300 es

precision highp float;

in vec2 v_texCoord;

out vec4 fragment;

uniform highp sampler2D u_outputImage;

void main() {
  fragment = texture(u_outputImage, v_texCoord);
}