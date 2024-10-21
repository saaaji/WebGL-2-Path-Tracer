import { SourceCache, ShaderLib } from '../../src/js/utilities/shaders.js';

const SHADER_SRC = ['post.wgsl', 'comp.wgsl'];

async function main() {
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

  console.log(adapter);
  console.log(device);

  const context = canvas.getContext('webgpu');
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

  context.configure({
    device,
    format: presentationFormat,
  });

  // console.log(presentationFormat);

  // const computeModule = device.createShaderModule({
  //   code: sourceCache.fetchModule('s1.wgsl'),
  // });

  // const pipeline = device.createComputePipeline({
  //   layout: 'auto',
  //   compute: { module: computeModule },
  // });

  // const querySet = device.createQuerySet({
  //   type: 'timestamp',
  //   count: 2,
  // });

  // const queryBuffer = device.createBuffer({
  //   size: 8 * querySet.count,
  //   usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
  // });

  // const resultBuffer = device.createBuffer({
  //   size: queryBuffer.size,
  //   usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  // });

  // const computePassDescriptor = {
  //   timestampWrites: {
  //     querySet,
  //     beginningOfPassWriteIndex: 0,
  //     endOfPassWriteIndex: 1,
  //   },
  // }

  // const tex = device.createTexture({
  //   size: [canvas.width, canvas.height],
  //   format: 'rgba32float',
  //   usage: GPUTextureUsage.STORAGE_BINGING | GPUTextureUsage.TEXTURE_BINDING,
  // })

  // const bindGroup = device.createBindGroup({
  //   layout: pipeline.getBindGroupLayout(0),
  //   entries: [
  //     { binding: 0, resource: tex.createView() },
  //   ],
  // });

//   function render() {
//     // renderPassDescriptor.colorAttachments[0].view = context.getCurrentTexture().createView();
//     const encoder = device.createCommandEncoder({label: 'e1'});
//     const pass = encoder.beginRenderPass(computePassDescriptor);

//     pass.setPipeline(pipeline);
//     pass.setBindGroup(0, bindGroup);
//     pass.dispatchWorkgroups(tex.width, tex.height);
//     pass.end();

//     encoder.resolveQuerySet(querySet, 0, querySet.count, queryBuffer, 0);
//     if (resultBuffer.mapState === 'unmapped')
//       encoder.copyBufferToBuffer(queryBuffer, 0, resultBuffer, 0, resultBuffer.size);

//     const commandBuffer = encoder.finish();
//     device.queue.submit([commandBuffer]);

//     if (resultBuffer.mapState === 'unmapped') {
//       resultBuffer.mapAsync(GPUMapMode.READ).then(() => {
//         const  times = new BigInt64Array(resultBuffer.getMappedRange());
//         console.log(times);
//         const gpuTime = Number(times[1] - times[0]);
//         console.log(
// `gpuTime:
// \tnanos:  ${gpuTime}
// \tmicros: ${(gpuTime / 1000000).toFixed(5)}`
//         );
//         resultBuffer.unmap();
//       });

//     }

//     // window.requestAnimationFrame(render);
//   }

  const targetWidth = 1280;
  const targetHeight = 720;
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const accBufferDescriptor = {
    size: [3, 3],
    format: 'rgba32float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.STORAGE_BINDING,
  };

  const accBuffer = [
    device.createTexture(accBufferDescriptor),
    device.createTexture(accBufferDescriptor)];
  let accActiveIndex = 0;

  accBuffer.forEach(buffer => device.queue.writeTexture(
    { texture: buffer },
    new Float32Array([
      1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1,
      0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1, 1,
      1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1,
    ]),
    { bytesPerRow: Float32Array.BYTES_PER_ELEMENT * 4 * buffer.width },
    { width: buffer.width, height: buffer.height },
  ));

  const compModule = device.createShaderModule({
    label: 'comp-module',
    code: sourceCache.fetchModule('comp.wgsl'),
  });

  const compPipeline = device.createComputePipeline({
    label: 'comp-pipeline',
    layout: 'auto',
    compute: { module: compModule },
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

  const postPassDescriptor = {
    label: 'post-process-pass',
    colorAttachments: [{
      clearValue: [0, 0, 0, 0],
      loadOp: 'clear',
      storeOp: 'store',
    }],
  };

  const uniBuffer = device.createBuffer({
    size: Int32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const uni = {
    samples: 1,
  };

  window.requestAnimationFrame(function render() {
    postPassDescriptor.colorAttachments[0].view = context.getCurrentTexture().createView();
    const encoder = device.createCommandEncoder({ label: 'render-enc' });

    const uniValues = new Int32Array([uni.samples]);
    device.queue.writeBuffer(uniBuffer, 0, uniValues);

    const compBindGroup = device.createBindGroup({
      layout: compPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: accBuffer[Number(!accActiveIndex)].createView() },
        { binding: 1, resource: accBuffer[accActiveIndex].createView() },
        { binding: 2, resource: { buffer: uniBuffer }},
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

    const compPass = encoder.beginComputePass();
    compPass.setPipeline(compPipeline);
    compPass.setBindGroup(0, compBindGroup);
    compPass.dispatchWorkgroups(3, 3);
    compPass.end();

    const postPass = encoder.beginRenderPass(postPassDescriptor);
    postPass.setPipeline(postPipeline);
    postPass.setBindGroup(0, postBindGroup);
    postPass.draw(3);
    postPass.end();

    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);

    uni.samples++;
    window.requestAnimationFrame(render);
  });
}

main();

/*

4 compute phases

generate:
generates primary rays for as many rays as there are pixels.
output is a large buffer of rays, counter which tells (extend) 
how many rays need to be processed (for primary: w * h)

extend:
intersect all rays with the scene.
intersection results are stored in buffer.

shade:
evaluate shading model for each path
may or may not generate new rays (if path terminated)



connect: not necessary no shadows

*/