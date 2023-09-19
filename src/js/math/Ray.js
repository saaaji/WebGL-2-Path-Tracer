import { Vector3 } from './Vector3.js';

export class Ray {
    origin = new Vector3();
    direction = new Vector3();
    invD = new Vector3();

    constructor(x0 = 0, y0 = 0, z0 = 0, x = 0, y = 0, z = 0) {
        this.origin.set(x0, y0, z0);
        this.direction.set(x, y, z);
        this.invD.set(1 / x, 1 / y, 1 / z);
    }

    static generate(u, v, proj, view) {
        const ray = new Ray();
        const invView = view.inverse;

        // NDC > view > world
        ray.direction.set(u * 2 - 1, v * 2 - 1, -1);
        ray.direction.applyMatrix4(proj.inverse, 1, true);
        ray.direction.applyMatrix4(invView, 0, false);
        ray.direction.normalize();
        ray.invD.set(1 / ray.direction.x, 1 / ray.direction.y, 1 / ray.direction.z);
        ray.origin.set(...invView.column(3));

        return ray;
    }

    intersectsAABB(aabb, tMin = Number.EPSILON, tMax = +Infinity) {
        const near = [];
        const far = [];
        
        for (let axis = 0; axis < 3; axis++) {
            // use parametric formulation of line to find t
            let t0 = this.invD[axis] * (aabb.min[axis] - this.origin[axis]);
            let t1 = this.invD[axis] * (aabb.max[axis] - this.origin[axis]);

            if (this.invD[axis] < 0) {
                const temp = t0;
                t0 = t1;
                t1 = temp;
            }

            t0 = t0 > tMin ? t0 : tMin;
            t1 = t1 < tMax ? t1 : tMax;

            near.push(t0);
            far.push(t1);
        }
        
        tMin = Math.max(...near);
        tMax = Math.min(...far);

        return [tMin < tMax, tMin];
    }
}