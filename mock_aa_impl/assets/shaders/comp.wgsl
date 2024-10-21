struct Uni {
  samples: i32
};

@group(0) @binding(0) var in_buf: texture_storage_2d<rgba32float, read>;
@group(0) @binding(1) var out_buf: texture_storage_2d<rgba32float, write>;
@group(0) @binding(2) var<uniform> uni: Uni;

@compute @workgroup_size(1) fn cs(
  @builtin(global_invocation_id) id : vec3u
)  {
  let size = textureDimensions(in_buf);
  let center = vec2f(size) / 2.0;

  // the pixel we're going to write to
  let pos = id.xy;
  let in_col = textureLoad(in_buf, pos);

  // Write the color to the texture
  textureStore(out_buf, pos, in_col + f32(uni.samples) / 500.0);
}