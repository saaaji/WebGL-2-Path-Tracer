struct Ray {
  o: vec3f, // origin
  d: vec3f // direction
};

struct IsectInfo {
  t: f32,
  tbn: mat3x3f,
  cost: f32
};

struct TriPrim {
  v0: vec3f,
  v1: vec3f,
  v2: vec3f
};

struct BvhNode {
  mini: vec3f,
  prim_or_split: i32,
  maxi: vec3f,
  child_or_miss: i32
};

struct GridMeta {
  res: vec3i,
  origin: vec3f,
  cell_size: vec3f,
};

struct KdMeta {
  mini: vec3f,
  maxi: vec3f
};

struct GridCell {
  count: i32,
  prim_start: i32
};

struct KdNode {
  split_or_prim_start: u32,
  flags_and_child_or_count: u32, 
};

struct Uni {
  samples: u32,
  image_size: vec2u,
  view_mat_inv: mat4x4f,
  proj_mat_inv: mat4x4f,
  grid: GridMeta,
  kd: KdMeta
};

@group(0) @binding(0) var in_buf: texture_storage_2d<rgba32float, read>;
@group(0) @binding(1) var out_buf: texture_storage_2d<rgba32float, write>;
@group(0) @binding(2) var<uniform> uni: Uni;
@group(0) @binding(3) var<storage, read> vertices: array<vec3f>;
@group(0) @binding(4) var<storage, read> indices: array<i32>;

// BVH
@group(0) @binding(5) var<storage, read> bvh: array<BvhNode>;

// GRID
@group(0) @binding(6) var<storage, read> grid_cells: array<GridCell>;
@group(0) @binding(7) var<storage, read> cell_prims: array<i32>;

// KD
@group(0) @binding(8) var<storage, read> kd_tree: array<KdNode>;
@group(0) @binding(9) var<storage, read> kd_prims: array<i32>;

var<private> g_rng_state: u32;

const BVH_FIXED_DF: i32 = 0;
const BVH_STACKLESS_DF: i32 = 1;
const BVH_ORDERED_BF: i32 = 2;
const GRID: i32 = 3;
const KDTREE: i32 = 4;

override ALGO: i32;
override PI: f32 = 3.14159265358979323846;
override EPS: f32 = 0.0000001;
override T_MIN: f32 = 0.0001;
override T_MAX: f32 = 10000000000000.0;
override MAX_BOUNCES: i32 = 2;

// includes
#pragma HYDRA include<rand.wgsl>
#pragma HYDRA include<ray_util.wgsl>
#pragma HYDRA include<bvh_util.wgsl>
#pragma HYDRA include<grid_util.wgsl>
#pragma HYDRA include<kd_util.wgsl>

fn plasma(t: f32) -> vec3f {
  let c0 = vec3f(0.05873234392399702, 0.02333670892565664, 0.5433401826748754);
  let c1 = vec3f(2.176514634195958, 0.2383834171260182, 0.7539604599784036);
  let c2 = vec3f(-2.689460476458034, -7.455851135738909, 3.110799939717086);
  let c3 = vec3f(6.130348345893603, 42.3461881477227, -28.51885465332158);
  let c4 = vec3f(-11.10743619062271, -82.66631109428045, 60.13984767418263);
  let c5 = vec3f(10.02306557647065, 71.41361770095349, -54.07218655560067);
  let c6 = vec3f(-3.658713842777788, -22.93153465461149, 18.19190778539828);

  return c0+t*(c1+t*(c2+t*(c3+t*(c4+t*(c5+t*c6)))));
}

@compute @workgroup_size(8, 8, 1) fn cs(
  @builtin(global_invocation_id) id : vec3u
) {
  let pix: vec2u = id.xy;

  let root = bvh[0];

  // account for extraneous threads in workgroup
  if (all(pix < uni.image_size)) {
    // occupy bind groups
    _ = &bvh;
    _ = &grid_cells;
    _ = &cell_prims;
    _ = &kd_tree;
    _ = &kd_prims;

    // kernel init
    seed(&g_rng_state, id);
    var ray = ray_gen(pix);

    // intersect
    var info: IsectInfo;
    var attenuation = vec3f(1);
    var radiance = vec3f(0);

    for (var i: i32 = 0; i < MAX_BOUNCES; i++) {
      var hit: bool;
      switch ALGO {
        case 0, default {
          hit = ray_bvh_isect_fixed_enc_df(ray, T_MIN, T_MAX, &info);
        }
        case 1 {
          hit = ray_bvh_isect_stackless_enc_df(ray, T_MIN, T_MAX, &info);
        }
        case 2 {
          hit = ray_bvh_isect_ordered_enc_bf(ray, T_MIN, T_MAX, &info);
        }
        case 3 {
          hit = ray_grid_isect(ray, T_MIN, T_MAX, &info);
        }
        case 4 {
          hit = ray_kd_isect(ray, T_MIN, T_MAX, &info);
        }
      }

      // if (hit) {
      //   radiance = vec3f(info.tbn[2] + 1.0) * 0.5;
      // }
      // break;

      // teapot: 40
      // bunny/dragon: 50
      let heat = clamp(vec3f(info.cost) / vec3f(50.0), vec3f(0), vec3f(1));
      radiance = plasma(heat.x);
      break;

      if (hit) {
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