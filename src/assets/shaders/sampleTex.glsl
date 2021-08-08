#version 300 es

precision highp float;

in vec2 v_texCoord;

out vec4 fragment;

uniform highp sampler2D u_outputImage;
uniform float u_sampleCountInv;

void main() {
  vec3 rgb = texture(u_outputImage, v_texCoord).rgb;
  
  fragment =  vec4(sqrt(rgb * u_sampleCountInv), 1);
}