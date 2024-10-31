import { SourceCache } from '../../src/js/utilities/shaders.js';
import { OrbitalCamera } from '../../src/js/utilities/OrbitCamera.js';
import { CameraNode } from '../../src/js/utilities/SceneGraphNode.js';
import { GlbLoader } from '../../src/js/loading/GlbLoader.js';
import { BVH } from './utils/BVH.js';
import { Grid } from './utils/Grid.js';
import { KdTree } from './utils/KdTree.js';
import { Triangle } from '../../src/js/utilities/primitives.js';
import { createEnum } from '../../src/js/utilities/util.js';

const SAVE_HEATMAPS = true;
const RUN_BENCHMARKS = true;
const SAMPLE_THRESH = SAVE_HEATMAPS ? 2 : 64;
const MODEL = 'dragon';

const BENCHMARK_VIEWS = {
  'bunny': [
    '{"phi":1.0707963267948961,"theta":-6.989999999999892,"distance":3.285957793498006,"invert":-1,"origin":[-0.0839357817940172,0.5442345937915682,0.05352835486173677]}',
    '{"phi":2.32079632679489,"theta":-8.699999999999859,"distance":3.285957793498006,"invert":-1,"origin":[-0.26163278416079466,0.6991782904396985,0.01808125228393852]}',
    '{"phi":0.8307963267948959,"theta":0.6299999999999992,"distance":2.957362014148205,"invert":-1,"origin":[-0.2457260739114001,0.7441320142853735,-0.047055191961947386]}',
  ], // 144k tris
  'dragon': [
    '{"phi":1.1607963267948962,"theta":-2.0400000000000005,"distance":1.1457426376713227,"invert":-1,"origin":[0,0,0]}',
    '{"phi":1.420796326794896,"theta":-13.36999999999977,"distance":1.145742637671323,"invert":-1,"origin":[0,0,0]}',
    '{"phi":1.0307963267948927,"theta":-10.899999999999823,"distance":1.0311683739041906,"invert":-1,"origin":[-0.010379360472675753,0.01692522960747767,0.061275349895197]}',
  ], // 871k tris
  'teapot': [
    '{"phi":1.9615926535898085,"theta":-3.7099999999999698,"distance":6.183109307520513,"invert":-1,"origin":[0.5204281865897848,1.5352099214821155,-0.5125477214761262]}',
    '{"phi":1.0815926535898077,"theta":-5.929999999999938,"distance":6.870121452800567,"invert":-1,"origin":[0.41159335917630974,0.9854789586595656,-0.3722505657103437]}',
    '{"phi":0.9615926535898076,"theta":-2.4199999999999995,"distance":6.870121452800565,"invert":-1,"origin":[-0.4306608308507153,1.1320538340836184,-0.14492464022193025]}',
  ], // 14k tris
};

const SHADER_SRC = [
  'post.wgsl', 
  'comp.wgsl', 
  'ray_util.wgsl',
  'bvh_util.wgsl',
  'grid_util.wgsl',
  'kd_util.wgsl',
  'rand.wgsl',
];

const ALGOS = createEnum(
  'BVH_FTB_DF',
  'BVH_STACKLESS_DF',
  'BVH_FTB_BF',
  'GRID',
  'KDTREE',
);

console.log(ALGOS);

for (const key of Object.keys(ALGOS)) {
  const option = document.createElement('option');
  option.value = option.innerText = key;
  document.getElementById('algo').appendChild(option);
} 

document.getElementById('benchmark').addEventListener('click', async event => {
  const model = document.getElementById('model');
  const algoSelect = document.getElementById('algo');
  const algo = algoSelect.options[algoSelect.selectedIndex].value;
  
  if (model.files.length > 0) {
    const {target} = event;
    target.disabled = true;
    
    const [file] = [...model.files].filter(f => f.name.endsWith('.glb'));
    const [bin] = [...model.files].filter(f => f.name.endsWith('.bin'));

    const loader = new GlbLoader();
    const {indices, vertexAttribs} = await loader.parse(file, true);

    if ('position' in vertexAttribs) {
      // if (vertexAttribs.position.length % 9 !== 0) {
      //   throw new Error('expected vertex count to be multiply of 9');
      // }

      const prims = [];
      for (let i = 0; i < indices.length / 3; i++) {
        prims.push(new Triangle(i, indices, vertexAttribs.position));
      }
      
      main({
        vertices: vertexAttribs.position,
        indices,
        prims, 
        algo,
        bin,
      });
    } else {
      throw new Error(`expected GLB to have vertex attribute 'position'`);
    }
  }
});

async function main({vertices, indices, prims, algo, bin}) {
  const sourceCache = new SourceCache({
    'wgsl': './assets/shaders/',
  });

  await Promise.all(
    SHADER_SRC.map(file => sourceCache.registerModule(file)));

  console.log(sourceCache);

  const canvas = document.getElementById('canvas');
  const adapter = await navigator.gpu?.requestAdapter();

  const device = await adapter?.requestDevice({
    requiredFeatures: ['timestamp-query', 'float32-filterable'],
  });
  
  if (!device) {
    console.error('WebGPU not supported');
    return;
  }

  const context = canvas.getContext('webgpu');
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

  context.configure({
    device,
    format: presentationFormat,
  });

  // configure canvas dimensions
  const targetWidth = 1280;
  const targetHeight = 720;
  const workgroupSize = 8;

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  // initialize accumulation buffer
  const accBufferDescriptor = {
    size: [targetWidth, targetHeight],
    format: 'rgba32float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | 
           GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
  };

  const accBuffer = [
    device.createTexture(accBufferDescriptor),
    device.createTexture(accBufferDescriptor)];
  let accActiveIndex = 0;

  // zero each buffer
  accBuffer.forEach(buffer => device.queue.writeTexture(
    { texture: buffer },
    new Float32Array(targetWidth * targetHeight * 4),
    { bytesPerRow: Float32Array.BYTES_PER_ELEMENT * 4 * buffer.width },
    { width: buffer.width, height: buffer.height },
  ));

  // initialize shader modules and pipelines
  const compModule = device.createShaderModule({
    label: 'comp-module',
    code: sourceCache.fetchModule('comp.wgsl'),
  });

  const compPipeline = device.createComputePipeline({
    label: 'comp-pipeline',
    layout: 'auto',
    compute: { 
      module: compModule,
      constants: {
        ALGO: getAlgoEnum(algo),
      }
    },
  });

  const postModule = device.createShaderModule({
    label: 'post-process-module',
    code: sourceCache.fetchModule('post.wgsl'),
  });

  const postPipeline = device.createRenderPipeline({
    label: 'post-process-pipeline',
    layout: 'auto',
    vertex: { module: postModule },
    fragment: { module: postModule, targets: [{format: presentationFormat}] },
  });

  const querySet = device.createQuerySet({
    type: 'timestamp',
    count: 2,
  });

  const queryBuffer = device.createBuffer({
    size: 8 * querySet.count,
    usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
  });

  const resultBuffer = device.createBuffer({
    size: queryBuffer.size,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  // configure pass descriptors
  const postPassDescriptor = {
    label: 'post-process-pass',
    colorAttachments: [{
      clearValue: [0, 0, 0, 0],
      loadOp: 'clear',
      storeOp: 'store',
    }],
  };

  const compPassDescriptor = {
    timestampWrites: {
      querySet,
      beginningOfPassWriteIndex: 0,
      endOfPassWriteIndex: 1,
    },
  }

  // uniform values
  const uni = {
    samples: 0,
    imageSize: [targetWidth, targetHeight],
  };

  const uniValues = new ArrayBuffer(224);
  const uniDv = new DataView(uniValues);
  new Uint32Array(uniValues, 8, 2).set(uni.imageSize);

  // initialize uniform buffer
  const uniBuffer = device.createBuffer({
    size: uniValues.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // BVH buffer
  const bvhEntries = [{
    binding: 5,
    resource: {},
  }];
  
  if (algo.startsWith('BVH')) {
    const bvhData = {};

    if (!bin) {
      const options = {
        order: BVH.SERIALIZE_ORDER[algo.slice(-2)],
        stackless: algo.includes('STACKLESS'),
        halfPrecision: false,
      };

      console.log('serializing BVH with options:', options);

      const bvh = BVH.build(prims);
      const serialData = bvh.serialize(options);
      
      console.log(bvh, serialData);
      bvhData.buffer = serialData.buffer;
    } else {
      console.warn('USING RAW BINARY');
      bvhData.buffer = await bin.arrayBuffer();
    }

    bvhEntries[0].resource.buffer = device.createBuffer({
      size: bvhData.buffer.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(bvhEntries[0].resource.buffer, 0, bvhData.buffer);
  } else {
    // write nothing
    bvhEntries[0].resource.buffer = device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  // GRID buffer
  const gridEntries = [
    { binding: 6, resource: {} },
    { binding: 7, resource: {} },
  ];

  if (algo.startsWith('GRID')) {
    const grid = new Grid(prims);
    const gridData = grid.serialize();

    console.log(grid, gridData);

    gridEntries[0].resource.buffer = device.createBuffer({
      size: gridData.cellToList.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    gridEntries[1].resource.buffer = device.createBuffer({
      size: gridData.primLists.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(gridEntries[0].resource.buffer, 0, gridData.cellToList);
    device.queue.writeBuffer(gridEntries[1].resource.buffer, 0, gridData.primLists);

    new Int32Array(uniValues, 144, 3).set(grid.res);
    new Float32Array(uniValues, 160, 3).set([...grid.bounds.min]);
    new Float32Array(uniValues, 176, 3).set(grid.cellSize);
  } else {
    gridEntries.forEach(entry => entry.resource.buffer = device.createBuffer({
      size: 8,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }));
  }


  const kdEntries = [
    { binding: 8, resource: {} },
    { binding: 9, resource: {} },
  ];

  if (algo.startsWith('KD')) {
    if (!bin) {
      const tree = KdTree.build(prims);
      console.log(tree);
      const {nodes, primIds} = tree.serialize();
      console.log(nodes, primIds);

      kdEntries[0].resource.buffer = device.createBuffer({
        size: nodes.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
  
      kdEntries[1].resource.buffer = device.createBuffer({
        size: primIds.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });

      device.queue.writeBuffer(kdEntries[0].resource.buffer, 0, nodes);
      device.queue.writeBuffer(kdEntries[1].resource.buffer, 0, primIds);
      
      new Float32Array(uniValues, 192, 3).set([...tree.bounds.min]);
      new Float32Array(uniValues, 208, 3).set([...tree.bounds.max]);
    } else {

    }
  } else {
    kdEntries.forEach(entry => entry.resource.buffer = device.createBuffer({
      size: 8,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }));
  }

  // vertex buffer
  const vertexData = new Float32Array(vertices.length * (4/3));
  for (let i = 0; i < vertices.length / 3; i++) {
    vertexData[i * 4 + 0] = vertices[i * 3 + 0];
    vertexData[i * 4 + 1] = vertices[i * 3 + 1];
    vertexData[i * 4 + 2] = vertices[i * 3 + 2];
  }

  const vertexBuffer = device.createBuffer({
    size: vertexData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  // index buffer
  const indexData = new Int32Array(indices);
  const indexBuffer = device.createBuffer({
    size: indexData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  device.queue.writeBuffer(vertexBuffer, 0, vertexData);
  device.queue.writeBuffer(indexBuffer, 0, indexData);

  // controls
  const cameraControls = new OrbitalCamera(.01, .9, -50, .002, null, -1);
  const camera = new CameraNode({camera: {
    fov: Math.PI / 4,
    near: 0.001,
    far: 100,
  }});

  window.cameraControls = cameraControls;
  window.camera = camera;

  cameraControls.linkCameraNode(camera);
  camera.updateProjectionMatrixVk(targetWidth / targetHeight);

  // link controls
  const reset = window._reset = () => {
    // zero the sample count
    uni.samples = 0;
    timingState.runningAvg = 0;
    
    // clear both buffers
    const encoder = device.createCommandEncoder();
    accBuffer.forEach(buffer => {
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: buffer.createView(),
            clearValue: [0, 0, 0, 0],
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      pass.end();
    });

    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);
  };
  attachControls(canvas, cameraControls, reset);

  // rendering loop
  const timingState = {
    runningAvg: 0,
    view: 0,
    timeSeries: [[], [], []],
  };

  if (RUN_BENCHMARKS) {
    cameraControls.fromJson(BENCHMARK_VIEWS[MODEL][timingState.view]);
  }

  window.requestAnimationFrame(function render() {
    if (timingState.view >= 3) return;

    postPassDescriptor.colorAttachments[0].view = context.getCurrentTexture().createView();
    const encoder = device.createCommandEncoder({ label: 'render-enc' });

    // update uniform values
    uniDv.setUint32(0, uni.samples, true);
    new Float32Array(uniValues, 16, 16).set(camera.worldMatrix.elements);
    new Float32Array(uniValues, 16 + 64, 16).set(camera.projectionMatrix.inverse.elements);
    device.queue.writeBuffer(uniBuffer, 0, uniValues);

    const compBindGroup = device.createBindGroup({
      layout: compPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: accBuffer[Number(!accActiveIndex)].createView() },
        { binding: 1, resource: accBuffer[accActiveIndex].createView() },
        { binding: 2, resource: { buffer: uniBuffer }},
        { binding: 3, resource: { buffer: vertexBuffer }},
        { binding: 4, resource: { buffer: indexBuffer }},
        ...bvhEntries,
        ...gridEntries,
        ...kdEntries,
      ],
    });

    const postBindGroup = device.createBindGroup({
      layout: postPipeline.getBindGroupLayout(0),
      entries: [
        { 
          binding: 0, 
          resource: device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' }),
        },
        { binding: 1, resource: accBuffer[accActiveIndex].createView() },
      ],
    });

    accActiveIndex = Number(!accActiveIndex);

    const compPass = encoder.beginComputePass(compPassDescriptor);
    compPass.setPipeline(compPipeline);
    compPass.setBindGroup(0, compBindGroup);
    compPass.dispatchWorkgroups(
      Math.ceil(targetWidth/workgroupSize), 
      Math.ceil(targetHeight/workgroupSize),
      1);
    compPass.end();

    const postPass = encoder.beginRenderPass(postPassDescriptor);
    postPass.setPipeline(postPipeline);
    postPass.setBindGroup(0, postBindGroup);
    postPass.draw(3);
    postPass.end();

    // resolve timestamps
    encoder.resolveQuerySet(querySet, 0, querySet.count, queryBuffer, 0);
    if (resultBuffer.mapState === 'unmapped')
      encoder.copyBufferToBuffer(queryBuffer, 0, resultBuffer, 0, resultBuffer.size);

    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);

    // check timestamps
    const samples = uni.samples;
    const view = timingState.view;
    if (resultBuffer.mapState === 'unmapped') {
      resultBuffer.mapAsync(GPUMapMode.READ).then(() => {
        const  times = new BigInt64Array(resultBuffer.getMappedRange());
        const gpuNanos = Number(times[1] - times[0]);
        const gpuMillis = gpuNanos / 1e+6;
        
        timingState.timeSeries[view].push(`${samples+1}\t${gpuMillis.toFixed(5)}\n`);
        if (RUN_BENCHMARKS && timingState.timeSeries[view].length >= SAMPLE_THRESH) {
          console.log(`VIEW ${view} TIME SERIES (${timingState.timeSeries[view].length} points)\n`);
          console.log(timingState.timeSeries[view].join(''));

          const img = new Image();
          img.src = canvas.toDataURL();
          img.width = 144;
          document.body.appendChild(img);

          timingState.view++;
          if (timingState.view < 3) {
            console.log('view', BENCHMARK_VIEWS[MODEL][timingState.view]);
            cameraControls.fromJson(BENCHMARK_VIEWS[MODEL][timingState.view]);
            reset();
          }
        }

        // timingState.runningAvg *= uni.samples;
        // timingState.runningAvg += gpuMillis;
        // timingState.runningAvg /= (uni.samples + 1);

        // console.log(`raw ms: ${gpuMillis.toFixed(3)} / avg ms: ${timingState.runningAvg.toFixed(3)} / samples: ${uni.samples}`);
        resultBuffer.unmap();
      });
    }

    uni.samples++;

    if (timingState.view < 3) {
      window.requestAnimationFrame(render);
    }
  });
}

function attachControls(canvas, cameraControls, resetCallback) {
  const mouseProps = {
    mouseDown: false,
    scrollDown: false,
  };

  canvas.addEventListener('mousedown', ({button}) => {
    if (button === 0 || button === 2)
      mouseProps.mouseDown = true;
    else if (button === 1)
      mouseProps.scrollDown = true;
  });

  canvas.addEventListener('mouseup', ({button}) => {
    if (button === 0 || button === 2)
      mouseProps.mouseDown = false;
    else if (button === 1)
      mouseProps.scrollDown = false;
  });

  canvas.addEventListener('mousemove', ({movementX: dx, movementY: dy}) => {
    if (mouseProps.mouseDown) {
      cameraControls.pan(dx, dy);
      resetCallback();
    }

    if (mouseProps.scrollDown) {
      cameraControls.strafe(dx, dy);
      resetCallback();
    }
  });

  canvas.addEventListener('wheel', ({deltaY: dy}) => {
    cameraControls.zoom(dy);
    resetCallback();
  });
}

function getAlgoEnum(algo) {
  /*
  codes:
  0 - BVH DF ordered
  1 - BVH DF stackless
  2 - BVH BF ordered
  3 - GRID
  4 - KDTREE
  */
  
  if (algo.startsWith('BVH')) {
    if (algo.endsWith('DF')) {
      if (algo.includes('STACKLESS')) {
        return 1;
      } else {
        return 0;
      }
    } else if (algo.endsWith('BF')) {
      return 2;
    }
  } else if (algo.startsWith('GRID')) {
    return 3;
  } else if (algo.startsWith('KDTREE')) {
    return 4;
  } else {
    throw new Error(`could not match algo with code: '${algo}'`);
  }
}