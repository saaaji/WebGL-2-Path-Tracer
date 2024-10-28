const BVH_STACK_SIZE: i32 = 32;

fn ray_bvh_isect_fixed_enc_df(
  ray: Ray, 
  t_min: f32, 
  t_max: f32, 
  info: ptr<function, IsectInfo>
) -> bool {
  var any_hit: bool = false;
  var t_closest: f32 = t_max;
  var temp_info: IsectInfo;

  var<function> stack: array<i32, BVH_STACK_SIZE>;
  var ptr: i32 = 0;
  stack[ptr] = 0;
  ptr++;

  while (ptr > 0) {
    ptr--;
    let idx = stack[ptr];
    let node = bvh[idx];

    var dummy_t: f32;
    if (ray_aabb_isect(ray, node.mini, node.maxi, t_min, t_closest, &dummy_t)) {
      if (node.prim_or_split < 0) {
        if (ptr < BVH_STACK_SIZE - 2) {
          // push right child to stack
          stack[ptr] = node.child_or_miss;
          ptr++;
          
          // push left child to stack
          stack[ptr] = idx + 1;
          ptr++;
        } else {
          break;
        }
      } else {
        let tri: TriPrim = fetch_tri(node.prim_or_split);

        if (ray_tri_isect(ray, tri, t_min, t_closest, &temp_info)) {
          any_hit = true;
          t_closest = temp_info.t;
          (*info) = temp_info;
        }
      }
    }
  }

  return any_hit;
}

fn ray_bvh_isect_stackless_enc_df(
  ray: Ray, 
  t_min: f32, 
  t_max: f32, 
  info: ptr<function, IsectInfo>
) -> bool {
  var any_hit: bool = false;
  var t_closest: f32 = t_max;
  var temp_info: IsectInfo;

  var idx: i32 = 0;

  while (idx >= 0) {
    let node = bvh[idx];

    var dummy_t: f32;
    if (ray_aabb_isect(ray, node.mini, node.maxi, t_min, t_closest, &dummy_t)) {
      if (node.prim_or_split < 0) {
        // follow depth first order
        idx += 1;
      } else {
        let tri: TriPrim = fetch_tri(node.prim_or_split);

        if (ray_tri_isect(ray, tri, t_min, t_closest, &temp_info)) {
          any_hit = true;
          t_closest = temp_info.t;
          (*info) = temp_info;
        }

        // for leaf node, DF & miss-link order are identical
        idx = node.child_or_miss;
      }
    } else {
      // follow miss index
      idx = node.child_or_miss;
    }
  }

  return any_hit;
}

fn ray_bvh_isect_ordered_enc_bf(
  ray: Ray, 
  t_min: f32, 
  t_max: f32, 
  info: ptr<function, IsectInfo>
) -> bool {
  var any_hit: bool = false;
  var t_closest: f32 = t_max;
  var temp_info: IsectInfo;

  var<function> stack: array<i32, BVH_STACK_SIZE>;
  var ptr: i32 = 0;
  stack[ptr] = 0;
  ptr++;

  while (ptr > 0) {
    ptr--;
    let idx = stack[ptr];
    let node = bvh[idx];

    var dummy_t: f32;
    if (ray_aabb_isect(ray, node.mini, node.maxi, t_min, t_closest, &dummy_t)) {
      if (node.prim_or_split < 0) {
        if (ptr < BVH_STACK_SIZE - 2) {
          let split_axis = abs(node.prim_or_split) - 1;
          let d_sign01 = vec3i(ray.d > vec3f(0));
          let order = d_sign01[split_axis];

          stack[ptr] = node.child_or_miss + 1 - order;
          ptr++;
          stack[ptr] = node.child_or_miss + order;
          ptr++;
        } else {
          break;
        }
      } else {
        let tri: TriPrim = fetch_tri(node.prim_or_split);

        if (ray_tri_isect(ray, tri, t_min, t_closest, &temp_info)) {
          any_hit = true;
          t_closest = temp_info.t;
          (*info) = temp_info;
        }
      }
    }
  }

  return any_hit;
}