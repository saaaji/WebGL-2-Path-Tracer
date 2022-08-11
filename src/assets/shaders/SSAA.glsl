#version 300 es

// precision qualifiers
precision highp float;

// fragment I/O
out vec4 fragColor;
in vec2 v_texCoord;

// uniforms
uniform sampler2D u_screenTexture;
uniform vec2 u_resolution;
uniform int u_ssaaLevel;

void main() {
  vec3 color = vec3(0);
  vec2 texelSize = 1.0 / u_resolution;
  
  int halfSamples = u_ssaaLevel / 2;
  
  // average samples from screen texture
  for (int x = -halfSamples; x <= halfSamples; x++) {
    for (int y = -halfSamples; y <= halfSamples; y++) {
      vec2 uv = v_texCoord + vec2(x, y) * texelSize;
      color += texture(u_screenTexture, uv).rgb;
    }
  }
  
  float numSamples = pow(float(u_ssaaLevel) + 1.0, 2.0);
  fragColor = vec4(color / numSamples, 1);
}