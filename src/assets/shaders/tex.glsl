#ifndef TEX
#define TEX

vec4 procTexCheckerboard(vec2 uv) {
  float freq = 10.0;
  uv *= freq;

  vec4 lo = vec4(1, 1, 1, 1);
  vec4 hi = vec4(0, 0, 0, 1);

  if ((int(floor(uv.s)) + int(floor(uv.t))) % 2 == 0) {
    return lo;
  } else {
    return hi;
  }
}

vec4 sampleTextureAtlas(int textureIndex, vec2 uv) {
  TextureDescriptor descriptor = u_textureDescriptors[textureIndex];

  vec2 offsetUv = vec2(descriptor.offset + descriptor.size * uv) / u_atlasResolution;
  vec3 texCoord = vec3(offsetUv, descriptor.section);
  
  return texture(u_textureAtlas, texCoord);
}

#endif