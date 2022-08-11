#version 300 es

precision mediump float;

in vec3 a_VERTEX;
in vec3 a_NORMAL;

out vec3 v_normal;
out vec3 v_dir;

uniform mat4 u_projectionMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_worldMatrix;

void main() {
  // transform normal to view instead of world space so that view direction becomes z-axis
  mat3 normalMatrix = inverse(transpose(mat3(u_viewMatrix * u_worldMatrix)));
  // mat3 normalMatrix = inverse(transpose(mat3(u_worldMatrix)));
  v_normal = normalMatrix * a_NORMAL;
  v_dir = -(u_viewMatrix * u_worldMatrix * vec4(a_VERTEX, 1)).xyz;
  
  gl_Position = u_projectionMatrix * u_viewMatrix * u_worldMatrix * vec4(a_VERTEX, 1);
}