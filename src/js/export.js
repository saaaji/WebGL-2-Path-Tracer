import { encodeHydra } from './loading/hydra.js';
import { decodeGlb } from './loading/decodeGlb.js';
import { TextureAtlasBuilder } from './utilities/TextureAtlasBuilder.js';

import { Matrix4 } from './math/Matrix4.js';

const container = document.getElementById('container')
const sceneSelection = document.getElementById('scene-files-selection');
const exportScene = document.getElementById('export-scene');


sceneSelection.onchange = () => exportScene.disabled = sceneSelection.files.length === 0;
exportScene.onclick = async () => {
  sceneSelection.disabled = exportScene.disabled = true;

  const blob = await encodeHydra(sceneSelection.files);
  const downloadLink = document.createElement('a');
  
  downloadLink.innerHTML = 'download .HYDRA';
  downloadLink.href = URL.createObjectURL(blob);

  container.appendChild(downloadLink);
};

{
  
}