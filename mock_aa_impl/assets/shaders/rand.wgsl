// RANDOM UTILITY
fn pcg_hash(seed: u32) -> u32 {
  let state: u32 = seed * 747796405u + 2891336453u;
  let word: u32 = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

fn xorshift(state: ptr<private, u32>) -> u32 {
  (*state) ^= ((*state) << 13u);
  (*state) ^= ((*state) >> 17u);
  (*state) ^= ((*state) << 5u);
  return (*state);
}

fn seed(state: ptr<private, u32>, id: vec3u) {
  let seed: u32 = id.x + 1920u * id.y + (1920u * 1080u) * u32(uni.samples);
  (*state) = pcg_hash(seed);
}

fn rand_explicit(state: ptr<private, u32>) -> f32 {
  let r: u32 = xorshift(state);
  return f32(r) * bitcast<f32>(0x2f800004u);
}

fn rand() -> f32 {
  return rand_explicit(&g_rng_state);
}

fn sample_uniform_hemi() -> vec3f {
  let e1 = rand();
  let e2 = rand();

  let z = e1;
  let r = sqrt(1 - z*z);
  let phi = 2 * PI * e2;

  return vec3f(r * cos(phi), r * sin(phi), z);
}