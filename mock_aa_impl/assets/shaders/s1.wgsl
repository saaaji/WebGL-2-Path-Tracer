@group(0) @binding(0)
var tex: texture_storage_2d<rgba32float, read_write>;

@compute @workgroup_size(1) fn cs(
  @builtin(global_invocation_id) id : vec3u
)  {
  let size = textureDimensions(tex);
  let center = vec2f(size) / 2.0;

  // the pixel we're going to write to
  let pos = id.xy;

  // The distance from the center of the texture
  let dist = distance(vec2f(pos), center);

  // Compute stripes based on the distance
  let stripe = dist / 32.0 % 2.0;
  let red = vec4f(1, 0, 0, 1);
  let cyan = vec4f(0, 1, 1, 1);
  let color = select(red, cyan, stripe < 1.0);

  // Write the color to the texture
  textureStore(tex, pos, color);
}