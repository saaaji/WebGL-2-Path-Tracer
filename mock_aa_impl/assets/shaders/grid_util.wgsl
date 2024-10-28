fn ray_grid_isect(ray: Ray, t_min: f32, t_max: f32, info: ptr<function, IsectInfo>) -> bool {
  var t_box: f32;
  if (!ray_aabb_isect(ray, uni.grid.origin, uni.grid.origin + vec3f(uni.grid.res) * uni.grid.cell_size, t_min, t_max, &t_box)) {
    return false;
  }
  
  // compute grid traversal parameters
  let map = array(2, 1, 2, 1, 2, 2, 0, 0);
  let d_positive = vec3i(ray.d > vec3f(0));
  let o_cell = ray_at(ray, t_box) - uni.grid.origin;
  let d_inv: vec3f = vec3f(1.0) / ray.d;
  let exit: vec3i = vec3i(-1) * (1 - d_positive) + uni.grid.res * d_positive;
  let step: vec3i = d_positive * 2 - 1;
  let delta_t: vec3f = uni.grid.cell_size * d_inv * vec3f(d_positive * 2 - 1);
  
  var cell_pos: vec3i = clamp(vec3i(o_cell / uni.grid.cell_size), vec3i(0), uni.grid.res - 1);
  var next_t: vec3f = t_box + (vec3f(cell_pos + d_positive) * uni.grid.cell_size - o_cell) * d_inv;
  var t_closest = t_max;
  var any_hit = false;
  var temp_info: IsectInfo;

  loop {
    let cell_id = cell_pos.z * uni.grid.res.x * uni.grid.res.y + cell_pos.y * uni.grid.res.x + cell_pos.x;
    let grid_cell = grid_cells[cell_id];
    if (grid_cell.count > 0) {
      for (var i: i32 = 0; i < grid_cell.count; i++) {
        let tri = fetch_tri(cell_prims[grid_cell.prim_start + i]);
        if (ray_tri_isect(ray, tri, t_min, t_closest, &temp_info)) {
          t_closest = temp_info.t;
          (*info) = temp_info;
          any_hit = true;
        }
      }
    }

    let k = (i32(next_t[0] < next_t[1]) << 2) + 
            (i32(next_t[0] < next_t[2]) << 1) +
            (i32(next_t[1] < next_t[2]));
    let axis = map[k];
    
    if (t_closest < next_t[axis]) {
      break;
    }

    cell_pos[axis] += step[axis];
    
    if (cell_pos[axis] == exit[axis]) {
      break;
    }
    next_t[axis] += delta_t[axis];
  }

  return any_hit;
}