#version 300 es

in vec3 a_position;
in vec3 a_color;

uniform mat4 u_projectionMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_worldMatrix;

uniform int u_axis;

out vec3 v_color;

const float SCALE = 0.2;

void main() {
  mat4 worldMatrix = u_worldMatrix;

  worldMatrix[0] = normalize(worldMatrix[0]);
  worldMatrix[1] = normalize(worldMatrix[1]);
  worldMatrix[2] = normalize(worldMatrix[2]);

  float depth = (u_viewMatrix * vec4(worldMatrix[3].xyz, 1)).z;
  depth = max(abs(depth), 1.0);
  vec4 position = worldMatrix * vec4(a_position * depth * SCALE, 1);
  
  if (u_axis < 0) {
    v_color = a_color;
  } else {
    int index = gl_VertexID / 2;
    if (u_axis != index) v_color = vec3(0.5);
    else v_color = a_color;
  }

  gl_Position = u_projectionMatrix * u_viewMatrix * position;
}