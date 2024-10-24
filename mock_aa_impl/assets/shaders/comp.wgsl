struct Uni {
  samples: u32,
  image_size: vec2u
};

struct Ray {
  o: vec3f, // origin
  d: vec3f // direction
};

struct IsectInfo {
  t: f32
};

struct TriPrim {
  v0: vec3f,
  v1: vec3f,
  v2: vec3f
};

@group(0) @binding(0) var in_buf: texture_storage_2d<rgba32float, read>;
@group(0) @binding(1) var out_buf: texture_storage_2d<rgba32float, write>;
@group(0) @binding(2) var<uniform> uni: Uni;

var<private> g_rng_state: u32;

override EPS: f32 = 0.0000001;
override T_MIN: f32 = 0.000001;
override T_MAX: f32 = 100000000000.0;

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

// RAY UTILITY
fn ray_at(r: Ray, t: f32) -> vec3f {
  return r.o + r.d * t;
}

fn ray_sphere(r: Ray, center: vec3f, radius: f32, info: ptr<function, IsectInfo>) -> bool {
  let oc = center - r.o;
  let a = dot(r.d, r.d);
  let b = -2.0 * dot(r.d, oc);
  let c = dot(oc, oc) - radius*radius;
  let d = b*b - 4.0*a*c;
  return d >= 0;
}

fn ray_tri_isect(ray: Ray, tri: TriPrim, t_min: f32, t_max: f32, info: ptr<function, IsectInfo>) -> bool {
  let e1: vec3f = tri.v1 - tri.v0;
  let e2: vec3f = tri.v2 - tri.v0;
  let pVec: vec3f = cross(ray.d, e2);
  let det: f32 = dot(e1, pVec);
  
  if (abs(det) < EPS) {
    return false;
  }
  
  let detInv: f32 = 1.0 / det;
  let tVec: vec3f = ray.o - tri.v0;
  let u: f32 = detInv * dot(pVec, tVec);

  if (u < 0.0 || u > 1.0) {
    return false;
  }
  
  let qVec: vec3f = cross(tVec, e1);
  let v: f32 = detInv * dot(ray.d, qVec);

  if (v < 0.0 || u + v > 1.0) {
    return false;
  }

  let t: f32 = detInv * dot(e2, qVec);
  if (t > t_max || t < t_min) {
    return false;
  }

  (*info).t = t;
  return true;
}

fn ray_aabb_isect(ray: Ray, mini: vec3f, maxi: vec3f, t_min: f32, t_max: f32) -> bool {
  for (var ax: i32 = 0; ax < 3; ax++) {
    let detInv: f32 = 1.0 / ray.d[ax];
    var t0: f32 = detInv * (mini[ax] - ray.o[ax]);
    var t1: f32 = detInv * (maxi[ax] - ray.o[ax]);

    if (detInv < 0.0) {
      let temp = t0;
      t0 = t1;
      t1 = temp;
    }

    if (min(t1, t_max) <= max(t0, t_min)) {
      return false;
    }
  }
  
  return true;
}

@compute @workgroup_size(8, 8, 1) fn cs(
  @builtin(global_invocation_id) id : vec3u
) {
  let pix: vec2u = id.xy;
  let image_size = textureDimensions(in_buf);

  // account for extraneous threads in workgroup
  if (all(pix < image_size)) {
    seed(&g_rng_state, id);
    let uv = vec2f(id.xy) / vec2f(image_size);
    let aspect = f32(image_size.x) / f32(image_size.y);

    let fl = 1.0;
    let vh = 2.0;
    let vw = vh * aspect;
    let co = vec3f(0);
    let vu = vec3f(vw, 0, 0);
    let vv = vec3f(0, vh, 0);
    let ul = co - vec3f(0, 0, fl) - vu/2.0 - vv/2.0;
    let du = vu / f32(image_size.x);
    let dv = vv / f32(image_size.y);
    let p00 = ul + 0.5 * (du + dv);
    let p = p00 + f32(pix.x) * du + f32(pix.y) * dv;

    var i = IsectInfo(0.0);
    let r = Ray(co, normalize(p - co));
    let tri = TriPrim(vec3f(0.5, 0, -1), vec3f(-0.5, 0, -1), vec3f(0, 1, -1));
    
    var out_col: vec4f;
    if (ray_aabb_isect(r, vec3f(-0.1, 0, -1.2), vec3f(0.1, 0.1, -1.1), T_MIN, T_MAX)) {
      out_col = vec4f(1, 0, 0, 1);
    } else {
      let a = 0.5 * (r.d.y + 1.0);
      out_col = vec4f((1.0-a)*vec3f(1,1,1)+a*vec3f(0.5,0.7,1), 1);
    }
  
    // accumulate sample in buffer
    let avg = textureLoad(in_buf, pix);
    let sum = avg * f32(uni.samples);
    var new_avg = sum + out_col;
    new_avg *= 1.0/f32(uni.samples + 1);

    textureStore(out_buf, pix, new_avg);
  }
}