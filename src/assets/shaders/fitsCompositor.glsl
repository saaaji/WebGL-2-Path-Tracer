#version 300 es

precision highp float;

in vec2 v_texCoord;

out vec4 fragment;

uniform float u_min;
uniform float u_max;

uniform int u_channel;
uniform float u_black;
uniform float u_white;
uniform float u_gamma;
uniform int u_blurRadius;
uniform vec2 u_resolution;
uniform vec2 u_offset;

uniform highp sampler2D u_outputImage;

/**
 * TRANSFER FUNCTIONS
 */ 
float linear(float p, float black, float white) {
  return clamp((black - p) / (black - white), 0.0, 1.0);
}

float gamma(float p, float black, float white, float gamma) {
  return p < black ? 0.0 : clamp(
    pow((p - black) / (white - black), 1.0 / u_gamma), 0.0, 1.0
  );
}

void main() {
  vec3 pix;
  float raw = max(texture(u_outputImage, v_texCoord + u_offset / u_resolution).r, 0.0);
  
  /**
   * TRANSFER FUNCTION (STRETCH HISTOGRAM)
   */
  
  float norm = (raw - u_min) / (u_max - u_min);
  float tonemapped = gamma(norm, u_black, u_white, u_gamma);
  pix[u_channel] = tonemapped;
  
  fragment = vec4(pix, 1);
}