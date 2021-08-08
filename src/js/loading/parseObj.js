export function parseObj(text) {
  const vertices = [];
  const normals = [];
  const texCoords = [];
  const faces = [];
  
  const lines = text.split('\n');
  
  for (const line of lines) {
    if (/\S/.test(line)) {
      const [keyword, ...data] = line.trim().split(/\s+/);
      
      switch (keyword) {
        case 'v':
          vertices.push(...data.map(parseFloat));
          break;
        case 'vn':
          normals.push(...data.map(parseFloat));
          break;
        case 'vt':
          texCoords.push(...data.map(parseFloat));
          break;
        case 'f':
          const face = data.map(string => {
            const [index] = string.split('/');
            return parseInt(index);
          });
          
          const v0 = face[0];
          for (let i = 0; i < face.length - 2; i++) {
            const v1 = face[i + 1];
            const v2 = face[i + 2];
            faces.push(v0, v1, v2);
          }
        default:
          // ignore
          break;
      }
    }
  }
  
  /*const glVertices = [];
  const glNormals = [];
  const glTexCoords = [];
  const glFaces = [];
  
  for (let i = 0; i < faces.length; i++) {
    glFaces.push(i);
    for (let j = 0; j < 3; j++) {
      const face = faces[i];
      let index = face[j];
      
      switch (j) {
        case 0: // v
          index = index < 0 ? index + vertices.length : index - 1;
          var x = vertices[index], y = vertices[index + 1], z = vertices[index + 2];
          glVertices.push(x, y, z);
          break;
        case 1: // vt
          index = index < 0 ? index + texCoords.length : index - 1;
          const u = texCoords[index], v = texCoords[index + 1];
          glTexCoords.push(u, v);
          break;
        case 2: // vn
          index = index < 0 ? index + normals.length : index - 1;
          var x = normals[index], y = normals[index + 1], z = normals[index + 2];
          glNormals.push(x, y, z);
          break;
      }
    }
  }*/
  
  return {
    vertices,
    faces: faces.map(i => i > 0 ? i - 1 : i + vertices.length),
  };
}