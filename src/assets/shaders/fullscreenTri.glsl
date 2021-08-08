#version 300 es

out vec2 v_texCoord;

// https://rauwendaal.net/2014/06/14/rendering-a-screen-covering-triangle-in-opengl/
void main()
{
    float x = -1.0 + float((gl_VertexID & 1) << 2);
    float y = -1.0 + float((gl_VertexID & 2) << 1);
    v_texCoord.x = (x + 1.0) * 0.5;
    v_texCoord.y = (y + 1.0) * 0.5;
    gl_Position = vec4(x, y, 0, 1);
}