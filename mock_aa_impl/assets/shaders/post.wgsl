struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) texcoord: vec2f,
};

@group(0) @binding(0) var acc_sampler: sampler;
@group(0) @binding(1) var acc_buffer: texture_2d<f32>;

@vertex fn vs(
  @builtin(vertex_index) vertexIndex : u32
) -> VSOut {
  // cover clipspace with single triangle
  let pos = array(
    vec2f(-1, 3),
    vec2f(3, -1),
    vec2f(-1, -1),
  );
  
  var out: VSOut;
  let xy = pos[vertexIndex];
  
  out.position = vec4f(xy, 0.0, 1.0);
  out.texcoord = (xy + 1.0) / 2.0; // transform to UV coordinates

  return out;
}

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  return textureSample(acc_buffer, acc_sampler, in.texcoord);
}