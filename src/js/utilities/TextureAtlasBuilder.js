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