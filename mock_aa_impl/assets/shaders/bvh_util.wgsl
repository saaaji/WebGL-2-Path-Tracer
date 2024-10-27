const BVH_STACK_SIZE: i32 = 32;

fn ray_bvh_isect(
  ray: Ray, 
  bvh: ptr<storage, array<BvhNode>, read>,
  vertices: ptr<storage, array<vec3f>, read>, 
  indices: ptr<storage, array<i32>, read>,
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
    let node = (*bvh)[idx];

    if (ray_aabb_isect(ray, node.mini, node.maxi, t_min, t_closest)) {
      if (node.prim < 0) {
        if (ptr < BVH_STACK_SIZE - 2) {
          // push right child to stack
          stack[ptr] = node.right;
          ptr++;
          
          // push left child to stack
          stack[ptr] = idx + 1;
          ptr++;
        } else {
          break;
        }
      } else {
        let tri: TriPrim = fetch_tri(node.prim, vertices, indices);

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