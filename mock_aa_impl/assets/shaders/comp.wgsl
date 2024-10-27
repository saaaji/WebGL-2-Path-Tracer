struct Uni {
  samples: u32,
  image_size: vec2u,
  view_mat_inv: mat4x4f,
  proj_mat_inv: mat4x4f
};

struct Ray {
  o: vec3f, // origin
  d: vec3f // direction
};

struct IsectInfo {
  t: f32,
  tbn: mat3x3f
};

struct TriPrim {
  v0: vec3f,
  v1: vec3f,
  v2: vec3f
};

struct BvhNode {
  mini: vec3f,
  prim: i32,
  maxi: vec3f,
  right: i32
};

@group(0) @binding(0) var in_buf: texture_storage_2d<rgba32float, read>;
@group(0) @binding(1) var out_buf: texture_storage_2d<rgba32float, write>;
@group(0) @binding(2) var<uniform> uni: Uni;

@group(0) @binding(3) var<storage, read> bvh: array<BvhNode>;
@group(0) @binding(4) var<storage, read> vertices: array<vec3f>;
@group(0) @binding(5) var<storage, read> indices: array<i32>;

var<private> g_rng_state: u32;

override PI: f32 = 3.14159265358979323846;
override EPS: f32 = 0.0000001;
override T_MIN: f32 = 0.0001;
override T_MAX: f32 = 10000000000000.0;
override MAX_BOUNCES: i32 = 5;

// includes
#pragma HYDRA include<rand.wgsl>
#pragma HYDRA include<ray_util.wgsl>
#pragma HYDRA include<bvh_util.wgsl>

@compute @workgroup_size(8, 8, 1) fn cs(
  @builtin(global_invocation_id) id : vec3u
) {
  let pix: vec2u = id.xy;

  let root = bvh[0];

  // account for extraneous threads in workgroup
  if (all(pix < uni.image_size)) {
    // kernel init
    seed(&g_rng_state, id);
    var ray = ray_gen(pix);

    // intersect
    var info: IsectInfo;
    var attenuation = vec3f(1);
    var radiance = vec3f(0);

    for (var i: i32 = 0; i < MAX_BOUNCES; i++) {
      if (ray_bvh_isect(ray, &bvh, &vertices, &indices, T_MIN, T_MAX, &info)) {
        ray.o = ray_at(ray, info.t);
        ray.d = info.tbn * sample_uniform_hemi();

        attenuation *= 0.5;
      } else {
        radiance = vec3(1) * attenuation;
        break;
      }  
    }

    var out_col = vec4f(radiance, 1);
    
    // accumulate sample in buffer
    let avg = textureLoad(in_buf, pix);
    let sum = avg * f32(uni.samples);
    var new_avg = sum + out_col;
    new_avg *= 1.0/f32(uni.samples + 1);

    textureStore(out_buf, pix, new_avg);
  }
}