# Hydra
![Cornell Box](https://user-images.githubusercontent.com/47622452/189471123-12dec791-13b7-41aa-8e5f-97504bac575a.png)
### A pathtracer implemented in JavaScript using the WebGL 2 API
## README Contents
2. [Features](#features)
3. [Usage](#usage)
4. [Retrospective](#retrospective)
5. [Gallery](#gallery)
## Features
The application implements the following features:
- [x] `glTF` Support
  - Supported attributes: `POSITION`, `NORMAL`, `TEXCOORD_0`
  - Materials
- [ ] `HDRi` Support (Environment Maps)
- [x] Binary BVH (with binned SAH)
- [x] 2-Level BVH (Mesh Instancing)
  - "Preview" mode: rearrange meshes in scene via access to scenegraph
- [ ] PBR Materials (`glTF` Metallic-Roughness Physically-Based BRDF)
- [ ] Importance Sampling (Cosine-Weighted)
- [ ] Next Event Estimation (NEE)
- [ ] Multiple Importance Sampling (MIS)
## Usage
TBD
## Retrospective
### Why?
This project began as an implementation of *Ray Tracing in One Weekend*; I envisioned it as a proof of concept that could demonstrate how raytracing might be achieved with WebGL 2 (though this concept had long been proven on  Shadertoy, whose existence I was not initially aware of). Over time, as I worked on the renderer intermittently, it grew into what it is now without any real plan, and as such I thought it might be helpful or at least interesting to include a retrospective where I could go back and  analyze design decisions that may have appeared haphazard in the moment.
### Evolution of the Bounding Volume Hierarchy
![BVH Heatmap](https://user-images.githubusercontent.com/47622452/189471526-35ea225c-3b99-4d6b-87b6-c6b460c3541c.png)

The first modification I made to the base renderer of *RTIOW* was the addition of an acceleration structure, particularly a bounding volume hierarchy, as I realized intersection times would serve as the primary limiting factor on the spectacle of my renders--and it has since become the system that has undergone the most changes over the entire development period.
#### 1. Traversing a binary BVH in a fragment shader
![Crash](https://user-images.githubusercontent.com/47622452/189471026-29487f52-ec90-48ce-a2a5-7b228de5d0ce.png)
> First successful BVH test

Given that all my WebGL knowledge was sourced from *webgl2fundamentals*, the task of traversing a binary tree in a fragment shader was initially very daunting. Firstly, achieving this requires treating textures as arbitrary buffers (a concept which was then a novelty to me) via macros that allow for indexing into a texture as though it were a 1D array of texels. A binary BVH can then be flattened, and given the need to encode an AABB (min/max `vec3`'s require 3 channels each), 2 floating-point RGBA texels (`RGBA16F`/`RGBA32F`) are required per node at a minimum, with 2 channels remaining for child offsets or primitive IDs. One channel is reserved for the offset ("pointer") to the "right" child; since nodes are arranged according to depth-first order, the "left" child immediately follows its parent, making it possible to store just a singular offset. Thus the primitive ID is assigned to the final channel. This linear representation dictates an iterative traversal algorithm (recursion is disallowed in GLSL shaders regardless), which resembles the typical stack-based, depth-first BST traversal scheme. BVH construction was comparatively simple, though I implemented the Surface Area Heuristic (SAH), using *PBRT* as a reference, to create relatively high-quality trees.
|Texel Index|R|G|B|A|
|:-:|:-:|:-:|:-:|:-:|
|Even index *n*|`min.x`|`min.y`|`min.z`|`rightChildIndex`|
|*n* + 1|`max.x`|`max.y`|`max.z`|`primitiveId`|
> BVH node encoding

#### 2. First optimizations--stackless traversal
The above implementation would have remained unchanged had I not come across the following diagram on discord (recreation):
![threaded_bvh](https://user-images.githubusercontent.com/47622452/189472989-57a5741e-e50a-4c04-a864-27a7dcef5079.png)

Instead of relying upon a stack to traverse the BVH, this prospective stackless BVH utilizes "miss links" to bypass subtrees whenever the ray misses bounding boxes or primitives, rendering a stack unnecessary. These so-called miss links could be calculated by simply adding the number of child nodes to the current index (`currentIndex + 2 * nodeCount - 1`), essentially serving as an offset to an adjacent branch. The caveat, however, is that the traversal order remains fixed (the hierarchy must be traversed according to depth-first order), though my initial stack-based algorithm was fixed regardless.
#### 3. Traversing a 2-level BVH in a fragment shader
Since BVH construction could take several minutes for larger scenes, real-time, or at least interactive modification of scenes (given an offline construction algorithm) necessitated dividing the BVH into a top-level acceleration structure (TLAS) which stored a series of bottom-level hierarchies (BLAS), each storing triangle primitives. Assuming the amount of individual meshes is a mere fraction of the total amount of triangle primitives, reconstructing the TLAS in real-time is trivial. My initial naive solution was to define another function for traversing the TLAS, which passes control to a BLAS intersection function, which then passes control again to a triangle intersection function. Unsurprisingly, this was rather slow, necessitating that TLAS and BLAS traversal be handled in a single loop. Once the bottom level of the TLAS is reached, the ray is transformed from world space into object space and intersected with a BLAS; once BLAS traversal has ended, traversal of the TLAS is resumed via a cached index and the ray is reset.
#### 4. Revisiting the stack
The traversal algorithm for the 2-level hierarchy introduced additional complexity and was therefore considerably slower than its singular-hierarchy counterpart. This slowdown prompted me to experiment again with a stack-based algorithm that took advantage of a flexible traversal order. The underlying principle is that by traversing nodes in a front-to-back order (as determined by the direction of the ray), occluded nodes are more easily skipped, eliminating unnecessary intersections with triangle primitives. However, fixed order traversal proved to be the most efficient, to my surprise--even fixed stack-based traversal was faster than flexible stack-based traversal. My best guess (if it can be called that) is that texture access poses as the primary bottleneck, and relying on depth-first order maximizes the cache hit rate across all threads, because the left child is adjacent to its parent in memory. However, these comparisons were founded upon a very rudimentary profiling system (utilizing the `EXT_disjoint_timer_query_webgl2` extension) and a very limited set of test scenes; this analysis of cache interactions is itself limited by my lack of understanding of the underlying hardware. So I am reluctant to make any conclusions about the relative performance of each method.
### Intermediate Scene Representation (`.hydra`)
While the BVH considerably improved the efficiency of the renderer, it was not without a tradeoff: long tree construction times that could reach several minutes for scenes of moderate complexity. It did not help that the construction method was and remains relatively unoptimized, in part because I began relying on an intermediate scene representation that made repeated construction unnecessary--I figured that the texel data for a BVH could just be dumped to a binary file and loaded whenever necessary. And doing so became increasingly necessary in order to more rapidly debug the actual light transport simulation. However, for the renderer to actually achieve its task, the raw geometric data could not just be decoupled from other aspects of the scene, like object hierarchies, material properties, and additional vertex attributes. Thus some semblance of organization was required, which I achieved via a JSON metadata section, which in turn described how to extract data from a binary section (taking heavy inspiration from the `glTF` format, which was in part designed for ease of use with JavaScript). The extracted data could then be  uploaded directly to the GPU via various `bufferData` and `texImage` calls. I wonder if the additional time invested into supporting what was essentially a new file format was justified, or if it may have been simpler to just optimize the binned-SAH construction method.
## Gallery
TBD
