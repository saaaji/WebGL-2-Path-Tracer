fn ray_at(r: Ray, t: f32) -> vec3f {
  return r.o + r.d * t;
}

fn ray_gen(pix: vec2u) -> Ray {
  let msaa: vec2f = vec2f(rand(), rand());
  let uv: vec2f = (vec2f(pix) + msaa) / vec2f(uni.image_size);

  // unproject ray direction from UV coordinate
  let ndc_space: vec3f = vec3f(uv * 2.0 - 1.0, 1.0);
  let view_space: vec4f = uni.proj_mat_inv * vec4f(ndc_space, 1.0);
  let world_dir: vec4f = uni.view_mat_inv * vec4f(view_space.xyz / view_space.z, 0.0);
  
  return Ray(
    uni.view_mat_inv[3].xyz,
    normalize(world_dir.xyz)
  );
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

  let normal = normalize(cross(e1, e2));
  let bitangent = normalize(e1);
  let tangent = normalize(cross(normal, bitangent));

  let tbn = mat3x3f(tangent, bitangent, normal);

  (*info).t = t;
  (*info).tbn = tbn;
  return true;
}

fn ray_aabb_isect(ray: Ray, mini: vec3f, maxi: vec3f, t_min: f32, t_max: f32) -> bool {
  var t_min_mut = t_min;
  var t_max_mut = t_max;
  
  for (var ax: i32 = 0; ax < 3; ax++) {
    let dInv: f32 = 1.0 / ray.d[ax];
    var t0: f32 = (mini[ax] - ray.o[ax]) * dInv;
    var t1: f32 = (maxi[ax] - ray.o[ax]) * dInv;

    if (dInv < 0.0) {
      var temp = t0;
      t0 = t1;
      t1 = temp;
    }

    t_min_mut = max(t0, t_min_mut);
    t_max_mut = min(t1, t_max_mut);

    if (t_max_mut <= t_min_mut) {
      return false;
    }
  }

  return true;
}

fn fetch_tri(id: i32, vertices: ptr<storage, array<vec3f>, read>, indices: ptr<storage, array<i32>, read>) -> TriPrim {
  let i0 = (*indices)[id * 3 + 0];
  let i1 = (*indices)[id * 3 + 1];
  let i2 = (*indices)[id * 3 + 2];

  let v0 = (*vertices)[i0];
  let v1 = (*vertices)[i1];
  let v2 = (*vertices)[i2];

  return TriPrim(v0, v1, v2);
}