# [WebGL-2-Path-Tracer](https://saaaji.github.io/WebGL-2-Path-Tracer/src/)
### A path tracer implemented in JavaScript using the WebGL 2 (& WebGPU) APIs
I recently conducted a study of the performance of different ray tracing 
acceleration structures on integrated GPUs for my scientific writing class. You 
can view the results and accompanying article [here](https://github.com/saaaji/WebGL-2-Path-Tracer/blob/main/WRTG3030_MockAcademicArticle_RayTracingAcceleration.pdf).

An image produced by my renderer was selected for a monthly showcase on 
the [Graphics Programming discord's](https://graphics-programming.org/) site.
You can view it [here](https://graphics-programming.org/blog/showcase-2021-12)! (under the name `@saaji#9697`)

![Preview Image](https://user-images.githubusercontent.com/47622452/193398278-601ac33f-7ad9-49a9-ade4-b636312eead3.png)
## README Contents
1. [Overview](#overview)
2. [Features](#features)
3. [Usage](#usage)
4. [Retrospective](#retrospective)
5. [Resources](#resources)
6. [Gallery](#gallery)
## Overview
A path tracer generates photorealistic images given a scene description (i.e. a 3D model) as input; it simulates the propagation of light and its interactions with different surfaces, creating realistic results. I began working on this renderer during my sophomore year of high school, and expanded on it over time in painfully small increments; I originally envisioned it as a proof-of-concept implementation of *Ray Tracing in One Weekend* in JavaScript and WebGL, though it really became an outlet for me to implement different techniques as I learned more about the field of computer graphics. The end result may not necessarily be impressive or particularly performant, but it was and continues to be a very valuable "educational experiment" of sorts.
## Features
- [x] Progressive, tiled renderer
- [x] Basic `glTF`/`GLB` Support
- [x] Basic `HDRi` Support (Environment Maps)
- [x] Acceleration via Binary BVH (Binned SAH)
- [x] 2-Level BVH (TLAS/BLAS, Mesh Instancing)
- [x] Basic Editor
  - Manipulate TRS (translation-rotation-scale) matrices of scene-graph nodes and rebuild TLAS
  - Camera visualizations (frustums, focal plane adjustments)
- [ ] PBR Materials (`glTF` Metallic-Roughness Physically-Based BRDF)
- [x] Importance Sampling
- [x] Next Event Estimation (NEE)
- [x] Multiple Importance Sampling (MIS)
- [x] Area Lights
- [ ] "Ideal" Lights (point, directional, spot)
## Usage
![Editor Screenshot](https://user-images.githubusercontent.com/47622452/193397520-ddbaabb7-13f5-4968-b9cc-42427cf6eca0.png)

Check out the renderer [here](https://saaaji.github.io/hydra/src/). The functionality of the renderer has been divided across several panels. Refer to the screenshot above and the descriptions below:
 - __Render Settings__: The place to upload scene files and configure the renderer. At the moment, the only type of asset accepted is the internal `hydra` format; refer to __Export Settings__ for generation of `hydra` files. The output resolution is specified along with the number of vertical and horizontal tiles, as the renderer is tiled. The specified output resolution should be divisible by the tile counts for intended functionality. Note the "Emissive factor" setting: currently, only area lights are supported. These are defined as any emissive triangles in the original model, whose emissive factors are clamped to the range [0, 1]. An emissive scaling factor may therefore be provided to overcome this limitation.
 - __Export Settings__: The place to generate `hydra` files from `glb` models. Any `glb` model should work, though some limitations exist: the model should contain at least one camera for the renderer to use, and only area lights, defined as any emissive primitives, are supported at the moment. A BVH is generated for each mesh within the scene, so this step may take a minute or so. When done exporting, a download link will appear in __Console__. For convenience, some example `hydra` files are provided [here](https://drive.google.com/drive/folders/1L1r4cadR1IrMpzPkUwzw56M6XGUjH9nv?usp=sharing).
 - __Viewport__: The place where you can preview and render the scene. Some important key bindings are provided below:
   - <kbd>r</kbd>: Toggles between "preview" mode and "render" mode
   - <kbd>p</kbd>: Pauses the renderer, regardless of the current mode
   - <kbd>d</kbd>: Saves the image when in "render" mode and logs a download link in __Console__
   - <kbd>t</kbd>: Shows reference for all key bindings
 - __Console__: The place where any debug info or resources are logged. Look here for download links for saved snapshots or completed `hydra` files.
 - __Node Tree__: The place where you can navigate the scene-graph and inspect nodes. Nodes with a "branch" or "fork" icon may be expanded to reveal any children; nodes with the "leaf" icon are leaf nodes. To inspect a node, select its name and its info will appear in __Active Node__
 - __Active Node__: The place where you can modify the TRS (translation-rotation-scale) matrix of any scene-graph node. This will prompt a TLAS rebuild. Additionally, the focal distance and lens radius of any `CameraNode` may be modified.
## Retrospective
### Why?
The purpose of this renderer was largely educational, so I thought it might be appropriate to document any challenges I encountered or things that I learned. This section is largely just for me to refer back to in the future, but others may find something of value in it.
### Notes on the Bounding Volume Hierarchy
#### Traversing a binary BVH in a fragment shader
The first modification I made to the base renderer of *RTIOW* was the addition of a BVH, and it has undergone many changes since. Given that all my knowledge of WebGL was sourced from *webgl2fundamentals*, the task of traversing a binary BVH in a fragment shader was initially very daunting. Achieving this required treating textures as buffers and "indexing" into them as though they were 1D arrays of texels. A flattened BVH (with its nodes in depth-first order) can then be uploaded to a texture, with each node requiring 2 floating-point RGBA texels (`RGBA32F`). This linear representation dictated an iterative traversal algorithm (and recursion is disallowed in GLSL shaders anyways), which resembled the typical stack-based, depth-first BST traversal scheme.
#### Stackless traversal
The above implementation would have remained unchanged had I not come across the following diagram on discord (recreation):

![Stackless Tree](https://user-images.githubusercontent.com/47622452/193397683-d78e6e12-cd6a-4eda-a02c-705ab110b8de.png)

Instead of relying upon a stack to traverse the BVH, the "stackless" BVH relies on "miss-links" (indicated in red) to bypass subtrees within the BVH whenever the ray misses AABBs or primitives. This eliminates the overhead of having to maintain a stack. The caveat is that the traversal order remains fixed, and the tree must be traversed in depth-first order (as indicated by the green arrows). However, my initial stack-based implemention had a fixed order anyways, and the performance gains were immediate.

#### 2-level BVH
My BVH construction remained relatively unoptimized, and could take several minutes for scenes of moderate complexity. To allow for interactive modification of scenes, the BVH had to be divided into a top-level acceleration structure ("TLAS"), which stored a series of bottom-level acceleration structures ("BLAS"). Given the amount of meshes in a scene is negligible relative to the total amount of triangle primitives, reconstructing the TLAS in real-time is trivial. However, this impacted traversal times, as now TLAS and BLAS traversal had to be handled in a single loop. Once the bottom level of the TLAS is reached, the ray is transformed from world- to object-space and intersected with a BLAS; once BLAS traversal has ended, TLAS traversal is resumed via a cached index and the ray is reset. This introduced additional complexity and was therefore noticeably slower than its single-hierarchy counterpart. I decided to experiment with stack-based traversal again, this time taking advantage of the flexible traversal order permitted by a stack; if nodes are traversed in a front-to-back order (as determined by the direction of the ray and the split axis of the node), occluded nodes are skipped more easily, eliminating unnecessary intersections. Surprisingly, however, fixed-order traversal appeared to be fastest, and any stack-based implementation was outperformed by the prior stackless scheme:

![Performance Results](https://user-images.githubusercontent.com/47622452/193425200-99d692f2-9999-4c5c-beb1-0c58386aac2a.png)

My best guess at the moment is that texture access poses as the primary bottleneck (which may be unique to GLSL ES 3.0, as modern APIs with compute have access to SSBOs), and relying on a fixed, depth-first traversal order helps maximize the cache hit-rate acrosss all threads, because one child is always adjacent to its parent in memory. Later stack-based tests with a depth-first memory layout seem to confirm this, though this analysis is limited by my lack of understanding of the underlying hardware. Moreover, I relied on a very limited set of test scenes to make this comparison and a rudimentary profiling system (`EXT_disjoint_timer_query_webgl2` query results). I also performed these tests on a Chromebook only. In other words, I am reluctant to make any conclusions about the relative performance of each method at this time, and I think this experience has definitely demonstrated the need for an adequate profiler.
#### The Editor
I had implemented a 2-level BVH, but it was virtually useless without some way to modify meshes in the TLAS; a functional editor where the user could modify the TRS matrices of scene-graph nodes was necessary, so I decided to implement a rasterized "preview" mode where objects could be moved, rotated, and scaled before actually rendering the scene. Luckily, the geometric data that I had been storing in textures could be easily uploaded to vertex buffers, as demonstrated in this early test:
|![Pathtraced Side-By-Side](https://user-images.githubusercontent.com/47622452/189471172-0f4c8a29-13d9-4200-bbe5-cbedf7a90d97.png)|![Rasterized Side-By-Side](https://user-images.githubusercontent.com/47622452/189471155-cc949008-73ec-42ae-bda6-4208302a147d.png)|
|:-:|:-:|
|*Pathtraced Image*|*Rasterized Preview*|

Later, I decided that the preview should not be too detailed or have complex shading (partly because I wanted to get back to actual pathtracing); its purpose should be to convey geometric and spatial information to the user, which I tried to achieve primarily through highlights and outlines. There was also the added benefit of easily visualizing camera parameters, especially the focal distance:

![Preview](https://user-images.githubusercontent.com/47622452/193426914-217c5849-8b2a-4cf4-aad9-3ce592554069.png)
### Rendering Abstraction
Once I decided implement the rasterized preview mode discussed above, I found that it was no longer feasible to hardcode every render pass, especially with an outline shader that necessitated the creation of a G-buffer. This problem could only be solved with some sort of rendering abstraction that would simplify the management of resources and render passes. I decided to make something myself, and discovered a [GDC presentation](https://www.gdcvault.com/play/1w024612/FrameGraph-Extensible-Rendering-Architecture-in) by EA/DICE on "render graphs." What I took away from this was that a single frame can be modeled as a [directed acyclic graph (DAG)](https://en.wikipedia.org/wiki/Directed_acyclic_graph), where the nodes, or individual render passes, are connected by resources (textures in this context), which serve as the edges. The passes can then be [topologically ordered](https://en.wikipedia.org/wiki/Topological_sorting), iterated over, and executed to produce the final frame. From what I can tell, this organization is meant to be implemented in modern APIs, but in my case it seemed to provide a nice balance between higher-level resource management and lower-level control of the pipeline. I don't know if what I implemented is really a "render graph" per se, but I definitely took inspiration from the original presentation.
### `.hydra`
As discussed in __[Usage](#usage)__, the renderer only accepts `hydra` files at the moment. This is not a standard format; in fact, it is an internal format used only within this renderer (the original name of this project was "hydra"). Early on in development, it became very inconvenient to wait on long BVH construction times in order to debug the light transport simulation, so I decided to dump all geometric and BVH data into a binary which could then be uploaded whenever necessary. Any metadata or additional model information, like material properties, were stored in a JSON header, and over time this format came to closely resemble the `glTF` format (which was designed in part for ease of use with JavaScript). All vertex attributes and hierarchy data are stored in a binary section, and all textures are packed into a single atlas (2048x2048xN `TEXTURE_2D_ARRAY`). A consequence of this organization is that all textures have the same wrapping and filtering settings, and high-resolution maps are disallowed (this is a consequence of GLSL ES 3.0 not supporting dynamic indexing into arrays of samplers).
## Resources
 - [Graphics Programming Discord](https://graphics-programming.org/)
 - [Raytracing in One Weekend](https://raytracing.github.io/)
 - [PBR Book](https://pbr-book.org/)
 - Advanced Global Illumination, 2nd Edition
 - Real-Time Rendering, 4th Edition
## Gallery
![Bust](https://private-user-images.githubusercontent.com/47622452/411135951-015cfb1a-aa6b-4dbc-8c7a-760116ee96fe.png?jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3Mzg5ODc0OTAsIm5iZiI6MTczODk4NzE5MCwicGF0aCI6Ii80NzYyMjQ1Mi80MTExMzU5NTEtMDE1Y2ZiMWEtYWE2Yi00ZGJjLThjN2EtNzYwMTE2ZWU5NmZlLnBuZz9YLUFtei1BbGdvcml0aG09QVdTNC1ITUFDLVNIQTI1NiZYLUFtei1DcmVkZW50aWFsPUFLSUFWQ09EWUxTQTUzUFFLNFpBJTJGMjAyNTAyMDglMkZ1cy1lYXN0LTElMkZzMyUyRmF3czRfcmVxdWVzdCZYLUFtei1EYXRlPTIwMjUwMjA4VDAzNTk1MFomWC1BbXotRXhwaXJlcz0zMDAmWC1BbXotU2lnbmF0dXJlPWFlNTcxMmY5OWJjZTgxZGNmZWQ1ZjkyZTc0ODVlMjdhMGViYTM1MGY2NzVhODIwODI0ZmJkNTRlYTM0OTFjNDcmWC1BbXotU2lnbmVkSGVhZGVycz1ob3N0In0.sozqoWGwFnA2sRmDa9HD9YDRXDRBQEiLOqtmGK-3qJg)
