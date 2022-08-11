#version 300 es

in vec3 a_position;

uniform mat4 u_projectionMatrix;
uniform mat4 u_inverseProjectionMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_worldMatrix;

uniform float u_ndcZ;
uniform bool u_overrideZ;

out vec3 v_position;

void main() {
  vec4 position = u_worldMatrix * u_inverseProjectionMatrix * vec4(!u_overrideZ ? a_position : vec3(a_position.xy, u_ndcZ), 1);
  
  v_position = position.xyz;
  gl_Position = u_projectionMatrix * u_viewMatrix * position;
}