#version 300 es

precision highp float;

in vec2 v_texCoord;

out vec4 fragment;

uniform int u_blurRadius;
uniform vec2 u_resolution;
uniform highp sampler2D u_outputImage;

/**
 * CONSTANTS
 */
const int MAX_BLUR_RADIUS = 5;

void main() {
  /**
   * APPLY MEDIAN FILTER (NOISE REDUCTION)
   */
  vec3 raw;
  
  if (u_blurRadius > 0) {
    for (int channel = 0; channel < 3; channel++) {
      // allocate neighbors array (length must be constant)
      float neighbors[(2 * MAX_BLUR_RADIUS + 1) * (2 * MAX_BLUR_RADIUS + 1)];
      
      // collect neighboring values within blur radius (also: use CLAMP_TO_EDGE wrapping)
      int effBlurRadius = min(MAX_BLUR_RADIUS, u_blurRadius);
      for (int i = 0, x = -effBlurRadius; x < effBlurRadius; x++) {
        for (int y = -effBlurRadius; y < effBlurRadius; y++) {
          ivec2 uv = ivec2(gl_FragCoord.xy + vec2(x, y));
          neighbors[i++] = max(texelFetch(u_outputImage, uv, 0)[channel], 0.0);
        }
      }
      
      // perform insertion sort on neighbors
      int count = (2 * effBlurRadius + 1) * (2 * effBlurRadius + 1);
      for (int j, i = 1; i < count; i++) {
        float tmp = neighbors[i];
        for (int j = i; j > 0 && neighbors[j-1] > tmp; j--) {
          neighbors[j] = neighbors[j-1];
        }
        neighbors[j] = tmp;
      }
      
      // use median
      raw[channel] = neighbors[count / 2];
    }
  } else {
    // no blur, sample FITS directly
    raw = texture(u_outputImage, v_texCoord).rgb;
  }
  
  fragment = vec4(raw, 1);
}