import { AABB } from './AABB.js';
import { createEnum, chunkArray } from '../utilities/util.js';

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

export class BinaryBVH {
  static SplitMethod = createEnum('SAH');
  
  // parameters prepended with underscore should only be passed internally during construction
  constructor(primitives, splitMethod = BinaryBVH.SplitMethod.SAH, _parent = null, _deadEnd = true) {
    // console.log('[BVH]', primitives);
    
    this.parent = _parent;
    this.boundingBox = new AABB();
    this.primitiveCount = primitives.length;
    this.nodeCount = 2 * this.primitiveCount - 1;
    this.deadEnd = _deadEnd;
    
    if (primitives.length === 1) {
      const [primitive] = primitives;
      
      this.left = null;
      this.right = null;
      this.primitive = primitive;
      this.splitAxis = 0;
      this.boundingBox.copy(primitive.boundingBox);
    } else {
      const [splitAxis, splitIndex] = sortAndSplitPrimitives(primitives, splitMethod);
      
      this.left = new BinaryBVH(primitives.slice(0, splitIndex), splitMethod, this, false);
      this.right = new BinaryBVH(primitives.slice(splitIndex), splitMethod, this, this.deadEnd);
      this.primitive = null;
      this.splitAxis = splitAxis;
      this.boundingBox.combine(this.left.boundingBox, this.right.boundingBox);
    }
    
    this.boundingBox.update();
  }
  
  get isLeaf() {
    return this.primitive !== null && this.primitive !== undefined;
  }

  intersect(ray) {
    let tMin = Infinity;
    let primitive = null;
    const stack = [this];
    
    while (stack.length > 0) {
      const node = stack.pop();
      const [hit, t] = ray.intersectsAABB(node.boundingBox);

      if (hit) {
        if (!node.isLeaf) {
          stack.push(node.left, node.right);
        } else {
          if (t < tMin) {
            tMin = t;
            primitive = node.primitive;
          }
        }
      }
    }

    return primitive?.reference;
  }
  
  /**
   * serialization for storage as float4 texture
   * texel offset provided for pointer fixing when packing hierarchies
   */
  serialize(texelOffset = 0) {
    const hasAdjacentBranch = node => {
      while (node) {
        if (node.isLeft) {
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
      if (!node.isLeaf) {
        stack.push(node.right, node.left);
      }
      
      const primitiveId = node.isLeaf ? node.primitive.id : -1;
      
      if (hasAdjacentBranch(node)) {
        const missLink = texelOffset + (data.length / 4) + (node.primitiveCount * 4 - 2);
        data.push(...node.boundingBox.min, primitiveId, ...node.boundingBox.max, missLink);
      } else {
        data.push(...node.boundingBox.min, primitiveId, ...node.boundingBox.max, stack.length ? -1 : -2);
      }
    }
    
    return data;
  }
  
  /**
   * serialization for storage as float4 texture
   * texel offset provided for pointer fixing when packing hierarchies
   */
  static SIZEOF_NODE = 32; // bytes
  static SIZEOF_TEXEL_CHANNEL = 4; // bytes
   
  _serialize(texelOffset = 0, littleEndian = true) {
    const stack = [this];
    const buffer = new ArrayBuffer(BinaryBVH.SIZEOF_NODE * this.nodeCount);
    const view = new DataView(buffer);
    
    let writeOffset = 0;
    let currentTexelIndex = 0;
    
    while (stack.length) {
      const currentNode = stack.pop();
      const isInterior = !currentNode.isLeaf;
      
      if (isInterior) {
        stack.push(currentNode.right, currentNode.left);
      }
      
      for (let i = 0; i < 8; i++) {
        const channelOffset = writeOffset + i * BinaryBVH.SIZEOF_TEXEL_CHANNEL
        
        switch (i) {
          // AABB min
          case 0:
          case 1:
          case 2:
            view.setFloat32(channelOffset, currentNode.boundingBox.min[i], littleEndian);
            break;
          
          // miss link
          case 3:
            const missIndex = currentTexelIndex + 2 * currentNode.nodeCount;
            const endTraversalSentinel = stack.length ? -1 : -2;
            
            view.setInt32(channelOffset, currentNode.deadEnd ? endTraversalSentinel : missIndex, littleEndian);
            break;
          
          // AABB max
          case 4:
          case 5:
          case 6:
            view.setFloat32(channelOffset, currentNode.boundingBox.max[i % 4], littleEndian);
            break;
          
          // primitive id
          case 7:
            view.setInt32(channelOffset, currentNode.isLeaf ? currentNode.primitive.id : -1, littleEndian);
            break;
        }
      }
      
      writeOffset += BinaryBVH.SIZEOF_NODE;
      currentTexelIndex += 2;
    }
    
    return buffer;
  }
}

function sortAndSplitPrimitives(primitives, splitMethod) {
  if (primitives.length === 2) {
    return [0, 1];
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
    return [splitAxis, Math.floor(primitives.length / 2)];
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
    
    return [splitAxis, optimalIndex];
  }
}