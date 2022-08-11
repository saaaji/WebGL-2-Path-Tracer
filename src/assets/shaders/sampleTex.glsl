#version 300 es

precision highp float;

in vec2 v_texCoord;

out vec4 fragment;

uniform highp sampler2D u_outputImage;
uniform float u_sampleCountInv;

const float GAMMA = 2.2;
const vec3 NAN_RECOLOR = vec3(1, 0, 0);

void main() {
  vec3 averageRadiance = texture(u_outputImage, v_texCoord).rgb * u_sampleCountInv;
  fragment = vec4(pow(averageRadiance, vec3(1.0 / GAMMA)), 1);
  
  if (any(isnan(fragment)))
    fragment = vec4(NAN_RECOLOR, 1);
}