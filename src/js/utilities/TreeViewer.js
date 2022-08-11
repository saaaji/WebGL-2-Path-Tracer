import { SceneGraphNode } from './SceneGraphNode.js';

// Define new tree-viewer element
export class TreeViewer extends HTMLElement {
  /**
   * DOM Model:
   * <div class='tree-root'>
   *   <div class='node-container'>
   *    <div class='node-meta'>
   *      <img data-type='expand' src=...>
   *      <span data-type='select' data-selected='n' data-id=...>...</span>
   *    </div>
   *    <div class='node-container'>...</div>
   *    <div class='node-container'>...</div>
   *   </div>
   * </div>
   */
  
  #selectedNode = null;
  #selectedInternal = null;
  #tree = null;
  #root = document.createElement('div');
  
  constructor() {
    super();
    
    // initialize tree-viewer stylesheet
    const link = document.createElement('link');
    link.setAttribute('rel', 'stylesheet');
    link.setAttribute('href', './css/TreeViewer.css');
    
    // initialize empty tree-viewer root container
    this.#root.classList.add('tree-root', 'empty');
    
    const span = document.createElement('span');
    span.textContent = 'No Data';
    this.#root.appendChild(span);
    
    // attach stylesheet and root container to shadow DOM
    this.attachShadow({mode: 'open'});
    this.shadowRoot.appendChild(link);
    this.shadowRoot.appendChild(this.#root);
    
    // initialize event handlers for root container
    this.#root.addEventListener('click', ({target}) => {
      const {type} = target.dataset;
      
      // type may either be 'select' or 'expand' to select an element or expand its sub-tree
      switch (type) {
        case 'select':
          // unselect current node
          if (this.#selectedInternal) {
            this.#selectedInternal.dataset.selected = 'n';
          }
          
          // locate new selected node via id stored in node dataset and select it
          this.#selectedNode = this.#tree.nodes.find(node => node.id === target.dataset.id);
          this.#selectedInternal = target;
          this.#selectedInternal.dataset.selected = 'y';
          
          // dispatch a 'change' event to notify listeners
          this.dispatchEvent(new Event('change'));
          break;
        case 'expand':
          const metaData = target.parentElement;
          
          // check if node is expanded already, then toggle
          let expanded = metaData.dataset.expanded === 'y';
          metaData.dataset.expanded = expanded ? 'n' : 'y';
          expanded = metaData.dataset.expanded === 'y';

          // update visibility of child nodes accordingly
          [...metaData.parentElement.children].forEach(child => {
            if (child.className !== 'node-meta') {
              child.style.display = expanded ? 'block' : 'none';
            }
          });
          break;
        default:
          // inert: cannot expand leaf nodes
      }
    });
    
    // navigation of tree
    document.addEventListener('keydown', event => {
      if (this.#selectedInternal) {
        switch (event.key) {
          case 'ArrowUp':
            const up = this.#selectedInternal // span
              ?.parentElement // 'node-meta'
              .parentElement // 'node-container'
              .previousElementSibling; // previous 'node-container'
            
            if (up && !up.className.includes('meta') /* exclude 'node-meta' */) {
              // unselect current node
              this.#selectedInternal.dataset.selected = 'n';
              
              // select new node
              this.#selectedInternal = up // 'node-container'
                .firstChild // 'node-meta'
                .lastChild; // span
              this.#selectedInternal.dataset.selected = 'y';
              
              this.#selectedNode = this.#tree.nodes.find(node => node.id === this.#selectedInternal.dataset.id);
              
              // dispatch a 'change' event to notify listeners
              this.dispatchEvent(new Event('change'));
            }
            break;
          case 'ArrowDown':
            const down = this.#selectedInternal // span
              ?.parentElement // 'node-meta'
              .parentElement // 'node-container'
              .nextElementSibling; // next 'node-container'
            
            if (down) {
              // unselect current node
              this.#selectedInternal.dataset.selected = 'n';
              
              // select new node
              this.#selectedInternal = down // 'node-container'
                .firstChild // 'node-meta'
                .lastChild; // span
              this.#selectedInternal.dataset.selected = 'y';
              
              this.#selectedNode = this.#tree.nodes.find(node => node.id === this.#selectedInternal.dataset.id);
              
              // dispatch a 'change' event to notify listeners
              this.dispatchEvent(new Event('change'));
            }
            break;
        }
      }
    });
  }
  
  get tree() {
    return this.#tree;
  }
  
  get selectedNode() {
    return this.#selectedNode;
  }
  
  set tree(sceneGraph) {
    if (sceneGraph && sceneGraph instanceof SceneGraphNode) {
      this.#root.classList.remove('empty');
      
      this.#tree = sceneGraph;
      this.#selectedInternal = null;
      
      while (this.#root.firstChild) {
        this.#root.removeChild(this.#root.firstChild);
      }
      
      const nodes = sceneGraph.nodes;
      const elems = nodes.map(node => {
        const container = document.createElement('div');
        container.classList.add('node-container');
        
        if (node.parent !== sceneGraph) {
          container.style.display = 'none';
        }
        
        const div = document.createElement('div');
        div.classList.add('node-meta');
        div.dataset.expanded = 'n';
        
        const img = document.createElement('img');
        img.src = node.children.length ? './assets/images/branch.png' : './assets/images/leaf.png';
        img.height = 15;
        img.dataset.type = node.children.length ? 'expand' : 'inert';
        
        const span = document.createElement('span');
        span.dataset.selected = 'n';
        span.dataset.type = 'select';
        span.dataset.id = node.id;
        span.textContent = node.name;
        
        div.appendChild(img);
        div.appendChild(span);
        container.appendChild(div);
        
        return container;
      });
      
      nodes.forEach((node, i) => {
        const container = elems[i];
        
        node.children.forEach((childNode) => {
          const childContainer = elems[nodes.indexOf(childNode)];
          
          container.appendChild(childContainer);
        });
      });
      
      sceneGraph.children.forEach(child => {
        const elem = elems[nodes.indexOf(child)];
        this.#root.appendChild(elem);
      });
    } else {
      while (this.#root.firstChild) {
        this.#root.removeChild(this.#root.firstChild);
      }
        
      this.#root.classList.add('empty');
      this.#root.appendChild(document.createTextNode('No Data'));
    }
  }
}

customElements.define('tree-viewer', TreeViewer);