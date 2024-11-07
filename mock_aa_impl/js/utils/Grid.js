import { AABB } from '../../../src/js/accel/AABB.js';
import { clamp } from '../../../src/js/utilities/util.js';

export class Grid {
  constructor(prims, {lambda = 3} = {}) {
    // find bounding box on all primitives
    const primBounds = new AABB();
    for (const prim of prims) {
      primBounds.addAABB(prim.boundingBox);
    }

    primBounds.updateDependentAttribs();

    this.bounds = primBounds;
    this.bounds.updateDependentAttribs();

    this.volume = [...primBounds.diag].reduce((p, d) => p * d, 1);
    this.res = [...primBounds.diag].map(s => Math.ceil(
      s * Math.cbrt((lambda * prims.length) / this.volume)
    ));

    // this.res = [50, 50, 25];
    this.cellSize = [...primBounds.diag].map((n, i) => n / this.res[i]);
    this.cells = new Array([...this.res].reduce((p, d) => p * d, 1)).fill().map(() => []);

    console.log(this.cells, this.res);

    for (const prim of prims) {
      const min = [...prim.boundingBox.min].map((e, i) => e - primBounds.min[i]);
      const max = [...prim.boundingBox.max].map((e, i) => e - primBounds.min[i]);;
      
      const cellMin = min.map((e, i) => clamp(Math.floor(e / this.cellSize[i]), 0, this.res[i] - 1));
      const cellMax = max.map((e, i) => clamp(Math.floor(e / this.cellSize[i]), 0, this.res[i] - 1));

      for (let x = cellMin[0]; x <= cellMax[0]; x++) {
        for (let y = cellMin[1]; y <= cellMax[1]; y++) {
          for (let z = cellMin[2]; z <= cellMax[2]; z++) {
            const cellId = z * this.res[0] * this.res[1] + y * this.res[0] + x;
            if (!this.cells[cellId]) console.log(cellId, x, y, z);
            this.cells[cellId].push(prim.id);
          }
        }
      }
    }
  }

  serialize() {
    const cellToList = new Int32Array(2 * this.cells.length).fill(-1);
    const view = new DataView(cellToList.buffer);
    const primLists = [];
    
    for (let i = 0; i < this.cells.length; i++) {
      const primList = this.cells[i];
      
      cellToList[2 * i + 0] = primList.length;
      cellToList[2 * i + 1] = primLists.length;

      for (const primId of primList) {
        primLists.push(primId);
      }
    }

    return {
      cellToList,
      primLists: new Int32Array(primLists),
    };
  }
}