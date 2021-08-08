#ifndef RANDOM
#define RANDOM

uint g_rngState;

uint wangHash(in uint seed) {
  seed = (seed ^ 61u) ^ (seed >> 16u);
  seed *= 9u;
  seed = seed ^ (seed >> 4u);
  seed *= 0x27D4EB2Du;
  seed = seed ^ (seed >> 15u);
  return seed;
}

uint xorshift() {
  g_rngState ^= (g_rngState << 13u);
  g_rngState ^= (g_rngState >> 17u);
  g_rngState ^= (g_rngState << 5u);
  return g_rngState;
}

void seedRand() {
  uvec2 p = uvec2(gl_FragCoord);
  uint seed = p.x + 1920u * p.y + (1920u * 1080u) * u_currentSample;
  g_rngState = wangHash(seed);
}

float rand() {
  return float(xorshift()) * uintBitsToFloat(0x2f800004u);
}

#endif // RANDOM