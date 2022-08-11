#version 300 es

// precision qualifiers
precision highp float;

// fragment I/O
out vec4 fragColor;
in vec2 v_texCoord;

// uniforms
uniform sampler2D u_normals;
uniform sampler2D u_depth;
uniform vec2 u_resolution;
uniform float u_zNear;

float getLinearDepth(float depth, float zNear) {
  float ndc = depth * 2.0 - 1.0;
  return (2.0 * zNear) / (1.0 - ndc);
}

// needs tuning
#define DEPTH_RANGE 500.0
#define SAMPLE_DEPTH_TEXTURE(depthTexture, uv) vec4(getLinearDepth(texture(depthTexture, uv).r, u_zNear) / DEPTH_RANGE)

const float SCALE = 3.0;
const float NORMALS_THRESHOLD = 0.5;
const float DEPTH_THRESHOLD = 1.5;
const float DEPTH_NORMALS_THRESHOLD = 0.5;
const float DEPTH_NORMALS_THRESHOLD_SCALE = 7.0;

// structure definitions
struct XSample {
  vec4 bottomLeft, topRight, bottomRight, topLeft;
};

#define X_SAMPLE(tex, uv, texelSize, halfFloor, halfCeil)\
  XSample(\
    SAMPLE(tex, uv - texelSize * halfFloor),\
    SAMPLE(tex, uv + texelSize * halfCeil),\
    SAMPLE(tex, uv + vec2(texelSize.x * halfCeil, -texelSize.y * halfFloor)),\
    SAMPLE(tex, uv + vec2(-texelSize.x * halfFloor, texelSize.y * halfCeil))\
  )

float getNormalsEdgeFactor() {
  float halfFloor = floor(SCALE / 2.0);
  float halfCeil = ceil(SCALE / 2.0);
  
#define SAMPLE texture
  XSample x = X_SAMPLE(u_normals, v_texCoord, 1.0 / u_resolution, halfFloor, halfCeil);
#undef SAMPLE

  vec4 finiteDifference0 = x.topRight - x.bottomLeft;
  vec4 finiteDifference1 = x.topLeft - x.bottomRight;
  
  float edgeNormals = sqrt(dot(finiteDifference0, finiteDifference0) + dot(finiteDifference1, finiteDifference1));
  return edgeNormals > NORMALS_THRESHOLD ? 1.0 : 0.0;
}

float getDepthEdgeFactor() {
  float halfFloor = floor(SCALE / 2.0);
  float halfCeil = ceil(SCALE / 2.0);
  
#define SAMPLE SAMPLE_DEPTH_TEXTURE
  XSample x = X_SAMPLE(u_depth, v_texCoord, 1.0 / u_resolution, halfFloor, halfCeil);
#undef SAMPLE

  float finiteDifference0 = x.topRight[0] - x.bottomLeft[0];
  float finiteDifference1 = x.topLeft[0] - x.bottomRight[0];
  
  vec3 viewDir = vec3(0, 0, -1);
  vec3 viewNormal = texture(u_normals, v_texCoord).xyz * 2.0 - 1.0;
  float NdotV = 1.0 - dot(viewNormal, -viewDir);
  float normalThreshold = clamp((NdotV - DEPTH_NORMALS_THRESHOLD) / (1.0 - DEPTH_NORMALS_THRESHOLD), 0.0, 1.0);
  
  normalThreshold = normalThreshold * DEPTH_NORMALS_THRESHOLD_SCALE + 1.0;
  float depthThreshold = DEPTH_THRESHOLD * x.bottomLeft[0] * normalThreshold;
  
  float edgeDepth = sqrt(pow(finiteDifference0, 2.0) + pow(finiteDifference1, 2.0)) * 100.0;
  return edgeDepth > depthThreshold ? 1.0 : 0.0;
}

void main() {
  float edgeNormals = getNormalsEdgeFactor();
  float edgeDepth = getDepthEdgeFactor();
  float edge = max(edgeNormals, edgeDepth);
  
  fragColor = vec4(edge);
}