import { AABB } from '../../../src/js/accel/AABB.js';

class AggregatePrimitive {
  constructor(prims) {
    this.prims = prims;
    this.numPrims = prims.length;
    this.boundingBox = new AABB();
    
    for (const prim of prims) {
      this.boundingBox.addAABB(prim.boundingBox);
    }

    this.boundingBox.updateDependentAttribs();
  }
}

export class BVH {
  static #SAH_NUM_BUCKETS = 12;
  static #SAH_TRAVERSE_COST = 1;
  static #SAH_INTERSECTION_COST = 2;

  static build(prims) {
    return BVH.#buildRecursive(prims, null, true);
  }

  static #buildRecursive(prims, parent, isRightmostNode) {
    const node = new BVH();
    
    node.parent = parent;
    node.isRightmostNode = isRightmostNode; // link in Rightmost path from root: LLL...
    node.numPrims = prims.length; // number of leaves
    node.numNodes = 2 * node.numPrims - 1; // number of nodes including leaves
    node.boundingBox = new AABB();

    if (node.numPrims === 1) {
      node.left = node.right = null;
      [node.prim] = prims;
      node.partitionAxis = 0; // by default
      node.boundingBox.copy(node.prim.boundingBox);
    } else {
      const [partitionAxis, partitionIndex] = BVH.#partitionPrims(prims);
      node.left = BVH.#buildRecursive(prims.slice(0, partitionIndex), node, false);
      node.right = BVH.#buildRecursive(prims.slice(partitionIndex), node, isRightmostNode);
      node.prim = null;
      node.partitionAxis = partitionAxis;
      node.boundingBox.combine(node.left.boundingBox, node.right.boundingBox);
    }

    node.boundingBox.updateDependentAttribs();
    return node;
  }

  static #partitionPrims(prims) {
    if (prims.length <= 2) {
      return [0, 1]; // partition axis (X), partition index
    }

    const centroidBounds = new AABB();
    const primBounds = new AABB();

    for (const prim of prims) {
      centroidBounds.addPoint(prim.boundingBox.centroid);
      primBounds.addAABB(prim.boundingBox);
    }

    centroidBounds.updateDependentAttribs();
    primBounds.updateDependentAttribs();

    const partitionAxis = centroidBounds.maxExtentAxis;
    prims.sort((a, b) => AABB.compare(a.boundingBox, b.boundingBox, partitionAxis));

    if (prims.length <= 4) {
      return [partitionAxis, Math.floor(prims.length / 2)];
    } else {
      const stride = Math.ceil(prims.length / BVH.#SAH_NUM_BUCKETS);
      let optimalPartition, cheapestPartition = Infinity;

      // evaluate the surface area heuristic (SAH) for each bucket
      for (let i = 0; i < prims.length; i += stride) {
        const leftPartition = new AggregatePrimitive(prims.slice(0, i));
        const rightPartition = new AggregatePrimitive(prims.slice(i));

        const cost = BVH.#SAH_TRAVERSE_COST + BVH.#SAH_INTERSECTION_COST * (
          leftPartition.boundingBox.surfaceArea * leftPartition.numPrims + 
          rightPartition.boundingBox.surfaceArea * rightPartition.numPrims
        ) / primBounds.surfaceArea;

        if (cost < cheapestPartition) {
          optimalPartition = i;
          cheapestPartition = cost;
        }
      }

      return [partitionAxis, optimalPartition];
    }
  }

  encodeDF(halfPrecision = false) {
    const buffer = new ArrayBuffer(this.numNodes * Float32Array.BYTES_PER_ELEMENT * 8);
    const view = new DataView(buffer);
    
    let node;    
    let structIndex = 0;
    const stack = [this];

    while (node = stack.pop()) {
      if (!halfPrecision) {
        for (let i = 0; i < 8; i++) {
          const structInteriorOffset = structIndex * 32 + i * 4;
          switch (i) {
            case 0: case 1: case 2:
              view.setFloat32(structInteriorOffset, node.boundingBox.min[i], true);
              break;
            case 3:
              view.setInt32(structInteriorOffset, node.prim?.id ?? -1, true);
              break;
            case 4: case 5: case 6:
              view.setFloat32(structInteriorOffset, node.boundingBox.max[i % 4], true);
              break;
            case 7:
              view.setInt32(structInteriorOffset, !node.prim ? structIndex + 1 + node.left.numNodes : -1, true);
              break;
          }
        }
      }

      if (structIndex == 0) console.log(buffer.slice());

      if (!node.prim) {
        stack.push(node.right, node.left);
      }

      structIndex++;
    }

    return buffer;
  }

  encodeBF(halfPrecision = false) {

  }
}