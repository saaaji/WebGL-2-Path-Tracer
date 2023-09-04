#version 300 es

precision highp float;

in vec2 v_texCoord;

out vec4 fragment;

uniform highp sampler2D u_outputImage;
uniform float u_sampleCountInv;

const float GAMMA = 2.2;
const vec3 NAN_RECOLOR = vec3(1, 0, 0);

void main() {
  // HDR [0, +inf)
  vec3 averageRadiance = texture(u_outputImage, v_texCoord).rgb * u_sampleCountInv;
  
  // LDR [0, 1]
  vec3 col = averageRadiance.xyz;
  // vec3 col = clamp(pow(averageRadiance, vec3(1.0 / GAMMA)), 0.0, 1.0);
  fragment = vec4(col, 1);
  
  if (any(isnan(fragment))) {
    fragment = vec4(NAN_RECOLOR, 1);
  }
}