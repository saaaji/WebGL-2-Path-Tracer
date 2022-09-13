#version 300 es

// precision qualifiers
precision highp float;

// fragment I/O
out vec4 fragColor;
in vec2 v_texCoord;

// uniforms
uniform sampler2D u_albedo;
uniform sampler2D u_normals;
uniform sampler2D u_outlineMask;

const vec3 OUTLINE_COLOR = vec3(0.1);

void main() {
  vec4 outline = texture(u_outlineMask, v_texCoord);
  vec3 albedo = texture(u_albedo, v_texCoord).rgb;
  
  vec3 col = mix(albedo, OUTLINE_COLOR, outline.a);
  // vec3 col = albedo;
  fragColor = vec4(col, 1);
}