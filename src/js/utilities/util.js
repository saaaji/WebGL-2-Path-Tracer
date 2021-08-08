export const GL_CTX = document.createElement('canvas').getContext('webgl2');

export const clamp = (n, min = -Infinity, max = Infinity) => Math.min(max, Math.max(min, n));

export const canvasToBlob = (canvas, mimeType = 'image/png', quality = 0.92) => new Promise(resolve => {
  canvas.toBlob(blob => resolve(blob), mimeType, quality);
});

export const blobToImage = blob => new Promise(resolve => {
  const image = new Image();
  const url = URL.createObjectURL(blob);
  
  image.src = url;
  image.onload = () => resolve(image);
});

export const bufferToImage = buffer => blobToImage(new Blob([buffer]));

export const loadImage = src => new Promise(resolve => {
  const image = new Image();
  
  image.src = src;
  image.onload = () => resolve(image);
});

export function assert(boolean, message = 'assertion failed') {
  if (!boolean) {
    throw new Error(message);
  }
}

export class UboBuilder {
  #byteOffset;
  #buffer;
  #view;
  
  constructor(byteLength) {
    this.#byteOffset = 0;
    this.#buffer = new ArrayBuffer(byteLength);
    this.#view = new DataView(this.#buffer);
  }
  
  #align(alignment) {
    while (this.#byteOffset % alignment !== 0) {
      this.#byteOffset += UboBuilder.SCALAR_SIZE;
    }
  }
  
  beginStruct() {
    this.#align(4 * UboBuilder.SCALAR_SIZE);
  }
  
  pushFloats(...vec) {
    const alignment = UboBuilder.getAlignment(vec);
    this.#align(alignment);
    
    for (const component of vec) {
      this.#view.setFloat32(this.#byteOffset, component, true);
      this.#byteOffset += UboBuilder.SCALAR_SIZE;
    }
  }
  
  pushInts(...vec) {
    const alignment = UboBuilder.getAlignment(vec);
    this.#align(alignment);
    
    for (const component of vec) {
      this.#view.setInt32(this.#byteOffset, component, true);
      this.#byteOffset += UboBuilder.SCALAR_SIZE;
    }
  }
  
  get rawBuffer() {
    return this.#buffer;
  }
  
  static SCALAR_SIZE = Float32Array.BYTES_PER_ELEMENT;
  
  static getAlignment(vec) {
    return vec.length !== 3
      ? this.SCALAR_SIZE * vec.length
      : this.SCALAR_SIZE * 4;
  }
}

export class MemoryManager {
  #gl;
  #heap = new Set();
  
  constructor(gl) {
    this.#gl = gl;
  }
  
  add(resource) {
    this.#heap.add(resource);
    return this;
  }
  
  clear() {
    this.#gl.bindBuffer(this.#gl.ARRAY_BUFFER, null);
    this.#gl.bindBuffer(this.#gl.ELEMENT_ARRAY_BUFFER, null);
    this.#gl.bindBuffer(this.#gl.COPY_READ_BUFFER, null);
    this.#gl.bindBuffer(this.#gl.COPY_WRITE_BUFFER, null);
    this.#gl.bindBuffer(this.#gl.TRANSFORM_FEEDBACK_BUFFER, null);
    this.#gl.bindBuffer(this.#gl.UNIFORM_BUFFER, null);
    this.#gl.bindBuffer(this.#gl.PIXEL_PACK_BUFFER, null);
    this.#gl.bindBuffer(this.#gl.PIXEL_UNPACK_BUFFER, null);
    
    this.#gl.bindFramebuffer(this.#gl.FRAMEBUFFER, null);
    this.#gl.bindFramebuffer(this.#gl.DRAW_FRAMEBUFFER, null);
    this.#gl.bindFramebuffer(this.#gl.READ_FRAMEBUFFER, null);
    
    this.#gl.bindRenderbuffer(this.#gl.RENDERBUFFER, null);
    this.#gl.bindTransformFeedback(this.#gl.TRANSFORM_FEEDBACK, null);
    this.#gl.bindVertexArray(null);
    
    const textureUnitCount = this.#gl.getParameter(this.#gl.MAX_TEXTURE_IMAGE_UNITS);
    for (let i = 0; i < textureUnitCount; i++) {
      this.#gl.activeTexture(this.#gl.TEXTURE0 + i);
      this.#gl.bindSampler(i, null);
      
      this.#gl.bindTexture(this.#gl.TEXTURE_2D, null);
      this.#gl.bindTexture(this.#gl.TEXTURE_3D, null);
      this.#gl.bindTexture(this.#gl.TEXTURE_CUBE_MAP, null);
      this.#gl.bindTexture(this.#gl.TEXTURE_2D_ARRAY, null);
    }
    
    this.#heap.forEach(resource => {
      switch (resource[Symbol.toStringTag]) {
        case 'WebGLBuffer':
          this.#gl.deleteBuffer(resource);
          break;
        case 'WebGLFramebuffer':
          this.#gl.deleteFramebuffer(resource);
          break;
        case 'WebGLProgram':
          this.#gl.deleteProgram(resource);
          break;
        case 'WebGLQuery':
          this.#gl.deleteQuery(resource);
          break;
        case 'WebGLRenderbuffer':
          this.#gl.deleteRenderbuffer(resource);
          break;
        case 'WebGLSampler':
          this.#gl.deleteSampler(resource);
          break;
        case 'WebGLShader':
          this.#gl.deleteShader(resource);
          break;
        case 'WebGLSync':
          this.#gl.deleteSync(resource);
          break;
        case 'WebGLTexture':
          this.#gl.deleteTexture(resource);
          break;
        case 'WebGLTransformFeedback':
          this.#gl.deleteTransformFeedback(resource);
          break;
        case 'WebGLVertexArrayObject':
          this.#gl.deleteVertexArray(resource);
          break;
        default:
          throw new Error('unsupported resource type');
      }
    });
    
    this.#heap.clear();
    return this;
  }
}

class Bounds {
  constructor(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }
}

class TextureAtlasNode {
  constructor(x, y, width, height) {
    this.left = null;
    this.right = null;
    this.image = null;
    this.bounds = new Bounds(x, y, width, height);
  }
  
  get isLeaf() {
    return !this.left && !this.right;
  }
  
  insertImage(image) {
    // if this is a branch, try inserting image into any one leaf
    if (!this.isLeaf) {
      const newNode = this.left.insertImage(image);
      if (newNode !== null) {
        return newNode;
      }
      return this.right.insertImage(image);
    } else {
      const {x, y, width, height} = this.bounds;
      
      // if this leaf is occupied, abort
      if (this.image !== null) {
        return null;
      }
      
      // if the image doesn't fit within this leaf, abort
      if (image.width > width || image.height > height) {
        return null;
      }
      
      // if the image fits within this leaf perfectly, terminate the branch here
      if (image.width === width && image.height === height) {
        this.image = image;
        return this;
      }
      
      if (width - image.width > height - image.height) {
        // if there is more space to the "right" than "below", split this node horizontally
        this.left = new TextureAtlasNode(x, y, image.width, height);
        this.right = new TextureAtlasNode(x + image.width, y, width - image.width, height);
      } else {
        // if there is more space "below" than to the "right", split this node vertically
        this.left = new TextureAtlasNode(x, y, width, image.height);
        this.right = new TextureAtlasNode(x, y + image.height, width, height - image.height);
      }
      
      return this.left.insertImage(image);
    }
  }
}

export class TextureAtlasBuilder {
  constructor(sectionWidth, sectionHeight) {
    this.sectionWidth = sectionWidth;
    this.sectionHeight = sectionHeight;
    this.sections = [
      new TextureAtlasNode(0, 0, sectionWidth, sectionHeight)
    ];
    this.descriptors = [];
  }
  
  insertImage(image) {
    if (image.width > this.sectionWidth || image.height > this.sectionHeight) {
      throw new Error(`given image dimensions (${image.width}x${image.height}) exceed atlas dimensions (${this.sectionWidth}x${this.sectionHeight})`);
    }
    
    let currentNode;
    for (const rootNode of this.sections) {
      if (currentNode = rootNode.insertImage(image)) {
        return {
          section: this.sections.length - 1,
          ...currentNode.bounds,
        };
      }
    }
    
    const rootNode = new TextureAtlasNode(0, 0, this.sectionWidth, this.sectionHeight);
    currentNode = rootNode.insertImage(image);
    this.sections.push(rootNode);
    
    return {
      section: this.sections.length - 1,
      ...currentNode.bounds,
    };
  }
  
  buildAtlas() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = this.sectionWidth;
    canvas.height = this.sectionHeight * this.sections.length;
    
    for (let i = 0; i < this.sections.length; i++) {
      const rootNode = this.sections[i];
      const stack = [rootNode];
      let currentNode;
      
      while (currentNode = stack.pop()) {
        if (!currentNode.isLeaf) {
          stack.push(currentNode.left, currentNode.right);
        } else if (currentNode.image) {
          ctx.drawImage(
            currentNode.image,
            currentNode.bounds.x,
            currentNode.bounds.y + i * this.sectionHeight,
          );
        }
      }
    }
    
    return new Promise(resolve => {
      canvas.toBlob(blob => resolve(blob, 'image/png'));
    });
  }
}