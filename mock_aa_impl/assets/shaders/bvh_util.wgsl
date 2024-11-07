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
  (*info).cost = 0;

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
      (*info).cost += 0.5;

      if (node.prim_or_split < 0) {
        if (ptr < BVH_STACK_SIZE - 2) {
          let split_axis = abs(node.prim_or_split) - 1;
          
          var first = idx + 1;
          var second = node.child_or_miss;

          if (ray.d[split_axis] < 0) {
            let temp = first;
            first = second;
            second = temp;
          }

          stack[ptr] = second;
          ptr++;
          stack[ptr] = first;
          ptr++;
        } else {
          break;
        }
      } else {
        let tri: TriPrim = fetch_tri(node.prim_or_split);

        let old_cost = (*info).cost;
        if (ray_tri_isect(ray, tri, t_min, t_closest, &temp_info)) {
          any_hit = true;
          t_closest = temp_info.t;
          (*info) = temp_info;
        }

        (*info).cost = old_cost + 1.0;
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
  (*info).cost = 0;

  var idx: i32 = 0;

  while (idx >= 0) {
    let node = bvh[idx];

    var dummy_t: f32;
    if (ray_aabb_isect(ray, node.mini, node.maxi, t_min, t_closest, &dummy_t)) {
      (*info).cost += 0.5;

      if (node.prim_or_split < 0) {
        // follow depth first order
        idx += 1;
      } else {
        let tri: TriPrim = fetch_tri(node.prim_or_split);

        let old_cost = (*info).cost;
        if (ray_tri_isect(ray, tri, t_min, t_closest, &temp_info)) {
          any_hit = true;
          t_closest = temp_info.t;
          (*info) = temp_info;
        }

        // for leaf node, DF & miss-link order are identical
        idx = node.child_or_miss;
        (*info).cost = old_cost + 1.0;
      }
    } else {
      // follow miss index
      idx = node.child_or_miss;
    }
  }

  return any_hit;
}

// DEPRECATED IMPLEMENTATION
/*
fn ray_bvh_isect_ordered_enc_bf(
  ray: Ray, 
  t_min: f32, 
  t_max: f32, 
  info: ptr<function, IsectInfo>,
) -> bool {
  var any_hit: bool = false;
  var t_closest: f32 = t_max;
  var temp_info: IsectInfo;
  (*info).cost = 0;

  *overflow = vec3f(1, 0, 0);

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
      (*info).cost += 0.5;
      
      let old_cost = (*info).cost;
      if (node.prim_or_split < 0) {
        if (ptr < BVH_STACK_SIZE - 2) {
          let split_axis = abs(node.prim_or_split) - 1;
          let d_sign01 = vec3i(ray.d > vec3f(0));
          let order = d_sign01[split_axis];

          stack[ptr] = node.child_or_miss + order;
          ptr++;
          stack[ptr] = node.child_or_miss + 1 - order;
          ptr++;
        } else {
          break;
        }
      } else {
        let tri: TriPrim = fetch_tri(node.prim_or_split);

        let old_cost = (*info).cost;
        if (ray_tri_isect(ray, tri, t_min, t_closest, &temp_info)) {
          any_hit = true;
          t_closest = temp_info.t;
          (*info) = temp_info;
        }

        (*info).cost = old_cost + 1.0;
      }
    }
  }

  return any_hit;
}
*/

fn ray_bvh_isect_ordered_enc_bf(
  ray: Ray, 
  t_min: f32, 
  t_max: f32, 
  info: ptr<function, IsectInfo>,
) -> bool {
  var any_hit: bool = false;
  var t_closest: f32 = t_max;
  var temp_info: IsectInfo;
  (*info).cost = 0;

  // special case where root is a leaf
  let root = bvh[0];
  if (root.prim_or_split >= 0) {
    var dummy_t: f32;

    (*info).cost += 1.5; // 0.5 for AABB test, 1.0 for triangle test

    return ray_aabb_isect(ray, root.mini, root.maxi, t_min, t_closest, &dummy_t) && 
           ray_tri_isect(ray, fetch_tri(root.prim_or_split), t_min, t_closest, info);
  }

  // initialize the stack
  var<function> stack: array<i32, BVH_STACK_SIZE>;
  var ptr: i32 = 0;

  var first_child_idx = root.child_or_miss;
  loop {
    var left = bvh[first_child_idx];
    var right = bvh[first_child_idx + 1];
    var left_t: f32;
    var right_t: f32;

    // intersect both children at same time
    var left_hit_node = ray_aabb_isect(ray, left.mini, left.maxi, t_min, t_closest, &left_t);
    var right_hit_node = ray_aabb_isect(ray, right.mini, right.maxi, t_min, t_closest, &right_t);
    (*info).cost += 1.0; // 2x 0.5 for AABB tests

    if (left_hit_node) {
      if (left.prim_or_split >= 0) {
        let old_cost = (*info).cost;
        if (ray_tri_isect(ray, fetch_tri(left.prim_or_split), t_min, t_closest, &temp_info)) {
          any_hit = true;
          t_closest = temp_info.t;
          (*info) = temp_info;
        }
        (*info).cost = old_cost + 1.0;
        left_hit_node = false;
      }
    }

    if (right_hit_node) {
      if (right.prim_or_split >= 0) {
        let old_cost = (*info).cost;
        if (ray_tri_isect(ray, fetch_tri(right.prim_or_split), t_min, t_closest, &temp_info)) {
          any_hit = true;
          t_closest = temp_info.t;
          (*info) = temp_info;
        }
        (*info).cost = old_cost + 1.0;
        right_hit_node = false;
      }
    }

    // determine traversal order
    if (left_hit_node) {
      if (right_hit_node) {
        // sort based on intersection distances
        if (left_t > right_t) {
          let temp = left;
          left = right;
          right = temp;
        }

        if (ptr <= BVH_STACK_SIZE - 1) {
          stack[ptr] = right.child_or_miss;
          ptr++;
        } else {
          break;
        }
      }
      first_child_idx = left.child_or_miss;
    } else if (right_hit_node) {
      // only the right node was intersected
      first_child_idx = right.child_or_miss;
    } else {
      // no intersections were found, check the stack
      if (ptr <= 0) {
        break;
      }

      ptr--;
      first_child_idx = stack[ptr];
    }
  }

  return any_hit;
}