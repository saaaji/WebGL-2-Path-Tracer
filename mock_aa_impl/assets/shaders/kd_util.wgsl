const KD_STACK_SIZE: i32 = 64;

struct KdStackFrame {
  t_box: vec2f,
  idx: i32
};

fn ray_kd_isect(ray: Ray, t_min: f32, t_max: f32, info: ptr<function, IsectInfo>) -> bool {
  var t_box: vec2f;
  if (!ray_aabb_isect2(ray, uni.kd.mini, uni.kd.maxi, t_min, t_max, &t_box)) {
    return false;
  }
  let t_box_global = t_box;
  (*info).cost += 0.5;

  var any_hit = false;
  var t_closest = t_max;
  var temp_info: IsectInfo;
  
  let d_inv = vec3f(1) / ray.d;
  var stack: array<KdStackFrame, KD_STACK_SIZE>;
  var ptr: i32 = 0;

  var node_idx = 0;
  var node = kd_tree[node_idx];

  var sentinel = 0;
  // t_box[0] += 0.1;

  loop {
    sentinel++;
    // if (sentinel > 1000) {
    //   (*info).tbn[2] = vec3f(1);
    //   break;
    // }

    let axis = extractBits(node.flags_and_child_or_count, 0, 2);
    if (axis > 2) {
      let count = i32(node.flags_and_child_or_count >> 2);
      let offset = i32(node.split_or_prim_start);

      for (var i: i32 = 0; i < count; i++) {
        let old_cost = (*info).cost;
        if (ray_tri_isect(ray, fetch_tri(kd_prims[offset + i]), t_min, t_closest, &temp_info)) {
          t_closest = temp_info.t;
          (*info) = temp_info;
          any_hit = true;
        }
        (*info).cost = old_cost + 1.0;
      }

      // kd-restart
      // if (abs(t_box[1] - t_box_global[1]) < 0.000001) {
      //   break;
      // } else {
      //   t_box[0] = t_box[1];
      //   t_box[1] = t_box_global[1];
      //   node_idx = 0;
      //   node = kd_tree[node_idx];
      // }

      if (ptr > 0) {
        ptr--;
        t_box = stack[ptr].t_box;
        node_idx = stack[ptr].idx;
        node = kd_tree[node_idx];
      } else {
        break;
      }
    } else {
      let split = bitcast<f32>(node.split_or_prim_start);
      let t_plane = (split - ray.o[axis]) * d_inv[axis];
      let below_first = ray.o[axis] < split || (ray.o[axis] == split && ray.d[axis] <= 0);
      
      var first_child: i32;
      var second_child: i32;
      if (below_first) {
        first_child = node_idx + 1;
        second_child = i32(node.flags_and_child_or_count >> 2);
      } else {
        first_child = i32(node.flags_and_child_or_count >> 2);
        second_child = node_idx + 1;
      }

      if (t_plane >= t_box[1] || t_plane < 0) {
        node_idx = first_child;
        node = kd_tree[node_idx];
      } else if (t_plane <= t_box[0]) {
        node_idx = second_child;
        node = kd_tree[node_idx];
      } else {
        stack[ptr].t_box = vec2f(t_plane, t_box[1]);
        stack[ptr].idx = second_child;
        ptr++;
        node_idx = first_child;
        node = kd_tree[node_idx];
        t_box[1] = t_plane;
      }
    }
  }

  return any_hit;
}