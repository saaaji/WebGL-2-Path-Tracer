import { AABB } from './AABB.js';

const SAH_BUCKETS = 12;
const SAH_TRAVERSAL_COST = 1;
const SAH_INTERSECTION_COST = 2;

class Aggregate {
  constructor(primitives) {
    this.primitives = primitives;
    this.primitiveCount = primitives.length;
    this.boundingBox = new AABB();
    
    for (const p of primitives) {
      this.boundingBox.addAABB(p.boundingBox);
    }
    
    this.boundingBox.update();
  }
}

export class BVH {
  constructor(primitives, parent = null, isLeftmostChild = false) {
    this.parent = parent;
    this.boundingBox = new AABB();
    this.primitiveCount = primitives.length;
    this.isLeftmostChild = isLeftmostChild
    
    if (primitives.length === 1) {
      const [primitive] = primitives;
      
      this.left = null;
      this.right = null;
      this.primitive = primitive;
      this.boundingBox.copy(primitive.boundingBox);
    } else {
      const splitIndex = sortAndSplitPrimitives(primitives);
      
      this.left = new BVH(primitives.slice(0, splitIndex), this, true);
      this.right = new BVH(primitives.slice(splitIndex), this, false);
      this.primitive = null;
      this.boundingBox.combine(this.left.boundingBox, this.right.boundingBox);
    }
    
    this.boundingBox.update();
  }
  
  get isLeaf() {
    return this.primitive !== null && this.primitive !== undefined;
  }
  
  /*serialize() {
    const data = [];
    const stack = [this];
    let node;
    
    while (node = stack.pop()) {
      if (!node.isLeaf) {
        const index = data.length / 4 + node.left.primitiveCount * 4;
        data.push(0, ...node.boundingBox.min, index, ...node.boundingBox.max);
        stack.push(node.right, node.left);
      } else {
        data.push(1, ...node.boundingBox.min, node.primitive.id, ...node.boundingBox.max);
      }
    }
    
    return data;
  }*/
  
  serialize_DEBUG() {
    const hasAdjacentBranch = node => {
      while (node) {
        if (node.isLeftmostChild) {
          return true;
        }
        node = node.parent;
      }
      return false;
    }
    
    const data = [];
    const stack = [this];
    let node;
    
    let i = 0;
    while (node = stack.pop()) {
      const primitiveId = node.isLeaf ? node.primitive.id : -1;
      
      if (hasAdjacentBranch(node)) {
        const missLink = data.length + node.primitiveCount * 2 - 1;
        data.push(`${i}: ${missLink}`);
      } else {
        data.push(`${i}: ${-1}`);
      }
      
      if (!node.isLeaf) {
        stack.push(node.right, node.left);
      }
      i++;
    }
    
    console.warn(data);
  }
  
  serialize() {
    const hasAdjacentBranch = node => {
      while (node) {
        if (node.isLeftmostChild) {
          return true;
        }
        node = node.parent;
      }
      return false;
    }
    
    const data = [];
    const stack = [this];
    let node;
    
    while (node = stack.pop()) {
      const primitiveId = node.isLeaf ? node.primitive.id : -1;
      
      if (hasAdjacentBranch(node)) {
        const missLink = data.length / 4 + node.primitiveCount * 4 - 2;
        data.push(...node.boundingBox.min, primitiveId, ...node.boundingBox.max, missLink);
      } else {
        data.push(...node.boundingBox.min, primitiveId, ...node.boundingBox.max, -1);
      }
      
      if (!node.isLeaf) {
        stack.push(node.right, node.left);
      }
    }
    
    return data;
  }
}

function sortAndSplitPrimitives(primitives) {
  if (primitives.length === 2) {
    return 1;
  }
  
  const centroidBounds = new AABB();
  const primitiveBounds = new AABB();
  
  for (const p of primitives) {
    centroidBounds.addPoint(p.boundingBox.centroid);
    primitiveBounds.addAABB(p.boundingBox);
  }
  
  centroidBounds.update();
  primitiveBounds.update();
  
  const splitAxis = centroidBounds.maxExtentAxis;
  primitives.sort((a, b) => AABB.compare(a.boundingBox, b.boundingBox, splitAxis));
  
  if (primitives.length <= 4) {
    return Math.floor(primitives.length / 2);
  } else {
    const stride = Math.ceil(primitives.length / SAH_BUCKETS);
    let optimalIndex, cheapestCost = Infinity;
    
    // calculate the cost of each bucket
    for (let i = 1; i < primitives.length; i += stride) {
      const leftSide = new Aggregate(primitives.slice(0, i));
      const rightSide = new Aggregate(primitives.slice(i));
      
      const cost = SAH_TRAVERSAL_COST + SAH_INTERSECTION_COST * (
        leftSide.boundingBox.surfaceArea * leftSide.primitiveCount +
        rightSide.boundingBox.surfaceArea * rightSide.primitiveCount
      ) / primitiveBounds.surfaceArea;
      
      if (cost < cheapestCost) {
        cheapestCost = cost;
        optimalIndex = i;
      }
    }
    
    return optimalIndex;
  }
}