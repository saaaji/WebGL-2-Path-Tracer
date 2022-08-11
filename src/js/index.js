class View {
  pauseButton = document.getElementById('pause');
  renderButton = document.getElementById('render');
  exportButton = document.getElementById('export');
  saveButton = document.getElementById('save');
  chooseSceneBtn = document.getElementById('import-scene');
  chooseModelBtn = document.getElementById('export-scene');
  
  envMapInput = document.getElementById('choose-hdri');
  widthInput = document.getElementById('viewport-width');
  heightInput = document.getElementById('viewport-height');
  numWorkGroupsXInput = document.getElementById('tile-count-x');
  numWorkGroupsYInput = document.getElementById('tile-count-y');
  emissiveFactorInput = document.getElementById('emissive-factor');
  
  treeViewer = document.getElementById('tree-viewer');
  canvas = document.getElementById('hydra-canvas');
  
  getElement(selector) {
    return document.querySelector(selector);
  }
}