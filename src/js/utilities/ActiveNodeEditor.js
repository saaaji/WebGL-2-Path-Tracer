import { lowQualityId, enumerate } from "./util.js";

export class ActiveNodeEditor {
  static editableProperties = Symbol('editableProperties');
  static createCustomDOM = Symbol('createCustomDOM');
  static bubbleBottom = Symbol('bubbleBottom');

  static #instances = [];
  static #cache = new WeakMap();
  
  static #DEFAULT_INSTANCE = new ActiveNodeEditor(document.querySelector('#node-1'));
  
  static getDefault() {
    return ActiveNodeEditor.#DEFAULT_INSTANCE;
  }

  static #formatPropClass(node, prop, index = null) {
    if (!this.#cache.has(node)) this.#cache.set(node, lowQualityId());
    const indexPostfix = typeof index === 'number' ? `[${index}]` : '';
    
    return `[${this.#cache.get(node)}][${prop}]${indexPostfix}`;
  }
  
  static retrieveContext(node, prop, index = null) {
    const inputs = [...document.getElementsByClassName(this.#formatPropClass(node, prop, index))];
    const callbacks = this.#instances.filter(instance => instance.#activeNode === node).map(instance => instance.updateCallback);

    return [inputs, callbacks];
  }

  #container;
  #id = lowQualityId();
  #activeNode = null;

  constructor(container, updateCallback = () => {}) {
    this.#container = container;
    this.updateCallback = updateCallback;

    ActiveNodeEditor.#instances.push(this);
  }
  
  #getProp(node, prop) {
    const path = prop.split('.');
    
    let temp = node;
    for (let i = 0; i < path.length; i++) {
        temp = temp[path[i]];
    }
    
    return temp;
  }
  
  #setProp(node, prop, value) {
    const path = prop.split('.');
    
    let temp = node;
    for (let i = 0; i < path.length - 1; i++) {
        temp = temp[path[i]];
    }
    
    temp[path.at(-1)] = value;
  }
  
  #genPropId(prop) {
    return `ANE_${this.#id}_${prop.replaceAll('.', '_')}`;
  }

  get activeNode() {
    return this.#activeNode;
  }

  /**
   * <div class='ui-content-row'>
   *   <label for=...>...</label>
   *   <input id=... type=.../>
   * </div>
   */
  set activeNode(node) {
    this.#activeNode = node;

    while (this.#container.firstChild) {
      this.#container.removeChild(this.#container.firstChild);
    }
    
    if (node) {
      this.#container.classList.remove('empty');

      const props = node.constructor[ActiveNodeEditor.editableProperties].sort((a, b) => {
        const {mutable: mutableA, bubble: bubbleA = false} = a;
        const {mutable: mutableB, bubble: bubbleB = false} = b;
        
        if (bubbleA !== bubbleB) {
          return bubbleA ? +1 : -1;
        } else {
          if (mutableA === mutableB) {
            return 0
          } else {
            return mutableA ? +1 : -1;
          }
        }
      });
      
      for (const {prop, mutable, displayName = prop, triggerUpdate = false, mono = false, deg = false} of props) {
        const value = this.#getProp(node, prop);
        const type = typeof value;
          
        if (type === 'object') {
          if (ActiveNodeEditor.createCustomDOM in value) {
            for (const [row, index] of enumerate(value[ActiveNodeEditor.createCustomDOM](mutable, displayName, this.updateCallback))) {
              this.#container.appendChild(row);

              row.querySelector('input')?.setAttribute(
                'id', 
                this.#genPropId(prop)+`_i${index}`,
              );

              row.querySelector('input')?.classList.add(
                ActiveNodeEditor.#formatPropClass(node, prop, index),
              );
            }
          }
        } else {
          const uiRow = document.createElement('div');
          uiRow.classList.add('ui-content-row');
          
          const label = document.createElement('label');
          const input = document.createElement('input');

          input.setAttribute('id', this.#genPropId(prop));
          input.classList.add(ActiveNodeEditor.#formatPropClass(node, prop));

          label.textContent = displayName;
          if (mono) {
            label.classList.add('mono');
          }
          
          let typecast = value => value;
          switch (type) {
            case 'string':
              input.type = 'text';
              typecast = target => target.value.toString();
              break;
            case 'number':
              input.type = 'number';
              typecast = target => Number(target.value);

              if (deg) {
                typecast = target => Number(target.value) * Math.PI / 180;
              }
              break;
            case 'boolean':
              input.type = 'checkbox',
              input.checked = value;
              typecast = target => target.checked;
              break;
            default:
              input.type = 'text';
              typecast = target => target.value.toString();
              break;
          }
          
          input.value = value;

          if (deg) {
            input.value *= 180 / Math.PI;
          }

          input.disabled = mutable !== true;
          
          if (!mutable) {
            uiRow.classList.add('readonly');
          } else {
            input.addEventListener('keydown', e => {
              if([38, 40].indexOf(e.keyCode) > -1){
                e.preventDefault();
              }
            });
            
            input.addEventListener('change', e => {
              this.#setProp(node, prop, typecast(e.target));
              if (triggerUpdate) {
                this.updateCallback?.();
              }
            });
          }
          
          uiRow.appendChild(label);
          uiRow.appendChild(input);
          this.#container.appendChild(uiRow);
        }
      }
    } else {
      this.#container.classList.add('empty');
      this.#container.appendChild(document.createTextNode('No Selection'));
    }
  }
}