#version 300 es

uniform sampler2D u_composite;
uniform int u_channel;
uniform int u_histTexSize;
uniform bool u_excludeZeros;

out float weight;

void main() {
  ivec2 compositeSize = textureSize(u_composite, 0);
  
  ivec2 uv = ivec2(gl_VertexID % compositeSize.x, gl_VertexID / compositeSize.x);
  
  vec4 mask = vec4(0);
  mask[u_channel] = 1.0;
  
  vec4 color = texelFetch(u_composite, uv, 0) * mask;
  float intensity = color.r + color.g + color.b; // [0, 1]
  
  float numBins = float(u_histTexSize * u_histTexSize);
  int bin = int(clamp(intensity, 0.0, 1.0) * numBins);
  
  vec2 pix = vec2(bin % u_histTexSize, bin / u_histTexSize);
  
  // count zeros?
  weight = u_excludeZeros ? (intensity > 0.0 ? 1.0 : 0.0) : 1.0;
  gl_Position = vec4((pix + 0.5) / float(u_histTexSize) * 2.0 - 1.0, 0, 1);
}