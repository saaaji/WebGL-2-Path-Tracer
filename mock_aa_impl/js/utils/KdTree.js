import { AABB } from "../../../src/js/accel/AABB.js";
import { createEnum } from "../../../src/js/utilities/util.js";

class BoundEdge {
  static TYPE = {
    START: 1,
    END: 0,
  };

  constructor(t, prim, type) {
    this.t = t;
    this.prim = prim;
    this.type = type;
  }
}

export class KdTree {
  static COST = {
    ISECT: 80,
    TRAVERSE: 1,
  };

  static build(prims) {
    const primBounds = new AABB();
    for (const prim of prims) {
      primBounds.addAABB(prim.boundingBox);
    }
    
    const root = KdTree.#buildRecursive(prims, primBounds);
    return root;
  }

  static #createLeaf(prims, primBounds) {
    const node = new KdTree();
    node.left = node.right = null;
    node.axis = node.split = null;
    node.primCount = prims.length;
    node.prims = prims;
    node.numNodes = 1;
    node.bounds = primBounds;
    return node;
  }

  static #buildRecursive(prims, primBounds, badSplits = 0) {
    primBounds.updateDependentAttribs();

    if (prims.length <= 8) {
      return KdTree.#createLeaf(prims, primBounds);
    } else {
      // prepare to choose split axis
      const leafCost = prims.length * KdTree.COST.ISECT;
      let bestCost = Infinity;
      let bestAxis = -1;
      let bestOffset = -1;
      
      // choose split axis position
      const invTotalSA = 1 / primBounds.surfaceArea;
      let splitAxis = primBounds.maxExtentAxis;
      let sortedEdges;
      let retries = 0;

      while (retries < 2) {
        // create bound edges
        const boundEdges = [];
        for (const prim of prims) {
          boundEdges.push(new BoundEdge(prim.boundingBox.min[splitAxis], prim, BoundEdge.TYPE.START));
          boundEdges.push(new BoundEdge(prim.boundingBox.max[splitAxis], prim, BoundEdge.TYPE.END));
        }

        // sort all edges
        sortedEdges = boundEdges.sort((e1, e2) => {
          if (Math.abs(e1.t - e2.t) < Number.EPSILON) {
            return e1.type - e2.type;
          }
          return e1.t - e2.t;
        });

        const otherAxis1 = primBounds.diag[(splitAxis + 1) % 3];
        const otherAxis2 = primBounds.diag[(splitAxis + 2) % 3];
        const areaOtherAxes = otherAxis1 * otherAxis2;
        const sumOtherAxes = otherAxis1 + otherAxis2;
        const axisMin = primBounds.min[splitAxis];
        const axisMax = primBounds.max[splitAxis];

        let nBelow = 0;
        let nAbove = prims.length;
        for (let i = 0; i < sortedEdges.length; i++) {
          const edge = sortedEdges[i];
          if (edge.type === BoundEdge.TYPE.END) nAbove--;
          
          if (edge.t > primBounds.min[splitAxis] && edge.t < primBounds.max[splitAxis]) {
            const belowSA = 2*(areaOtherAxes + (edge.t - axisMin)*sumOtherAxes);
            const aboveSA = 2*(areaOtherAxes + (axisMax - edge.t)*sumOtherAxes);

            const pBelow = belowSA * invTotalSA;
            const pAbove = aboveSA * invTotalSA;
            const bonus = (nAbove === 0 || nBelow === 0) ? 0.2 : 0;
            const cost = KdTree.COST.TRAVERSE + KdTree.COST.ISECT*(1 - bonus)*(pBelow*nBelow + pAbove*nAbove);

            if (cost < bestCost) {
              bestCost = cost;
              bestAxis = splitAxis;
              bestOffset = i;
            }
          }

          if (edge.type === BoundEdge.TYPE.START) nBelow++;
        }

        if (bestAxis === -1) {
          splitAxis = (splitAxis + 1) % 3;
          retries++;
        } else {
          break;
        }
      }

      // check if can create a leaf node
      if (bestCost > leafCost) {
        badSplits++;
      }
      if ((bestCost > 4 * leafCost && prims.length < 16) || bestAxis == -1 || badSplits >= 3) {
        return KdTree.#createLeaf(prims, primBounds);
      }

      // classify primitives wrt split
      const primsBelow = [];
      const primsAbove = [];
      for (let i = 0; i < bestOffset; i++) {
        if (sortedEdges[i].type === BoundEdge.TYPE.START) {
          primsBelow.push(sortedEdges[i].prim);
        }
      }
      for (let i = bestOffset + 1; i < sortedEdges.length; i++) {
        if (sortedEdges[i].type === BoundEdge.TYPE.END) {
          primsAbove.push(sortedEdges[i].prim);
        }
      }

      // recursively initialize child nodes
      const node = new KdTree();
      node.primCount = prims.length;
      node.prims = null;
      node.axis = bestAxis;
      node.split = sortedEdges[bestOffset].t;

      const primBoundsBelow = new AABB().copy(primBounds);
      const primBoundsAbove = new AABB().copy(primBounds);
      primBoundsBelow.max[bestAxis] = primBoundsAbove.min[bestAxis] = node.split;
      
      node.left = KdTree.#buildRecursive(primsBelow, primBoundsBelow, badSplits);
      node.right = KdTree.#buildRecursive(primsAbove, primBoundsAbove, badSplits);
      node.numNodes = 1 + node.left.numNodes + node.right.numNodes;
      node.bounds = primBounds;
      return node;
    }
  }

  serialize() {
    const stack = [this];
    const nodes = new Uint32Array(2 * this.numNodes);
    const primIds = [];
    const view = new DataView(nodes.buffer);
    // console.log(nodes.byteLength);
    let structIndex = 0;

    let node;
    let n = 0;
    while (node = stack.pop()) {
      if (!node.prims) {
        stack.push(node.right, node.left);
      }
      
      // lowest 2 bits for flags [0-3]
      if (node.prims) {
        view.setUint32(2 * structIndex * Uint32Array.BYTES_PER_ELEMENT, primIds.length, true);
      } else {
        view.setFloat32(2 * structIndex * Uint32Array.BYTES_PER_ELEMENT, node.split, true);
      }

      const flags = node.prims ? 3 : node.axis;
      const childOrCount = node.prims ? node.prims.length : structIndex + node.left.numNodes + 1;
      // console.log(childOrCount);
      const flagsAndChildOrCount = (flags | ((childOrCount << 2)>>> 0))>>>0;
      view.setUint32((2*structIndex + 1) * Uint32Array.BYTES_PER_ELEMENT, flagsAndChildOrCount, true);

      if (node.prims) {
        for (const {id} of node.prims) {
          primIds.push(id);
        }
      }

      structIndex++;
    }

    return {
      primIds: new Int32Array(primIds),
      nodes,
    }
  }
}