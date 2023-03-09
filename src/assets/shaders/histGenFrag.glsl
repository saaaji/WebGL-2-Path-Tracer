#version 300 es

precision highp float;

in float weight;

out vec4 fragment;

uniform highp sampler2D u_outputImage;

void main() {
  fragment = vec4(weight, 0, 0, 0);
}