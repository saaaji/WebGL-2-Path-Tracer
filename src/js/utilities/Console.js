// import { PREVIEW_DEFAULT_WIDTH } from "../model.js

const PREVIEW_DEFAULT_WIDTH = 512;

export class DisplayConsole {
  static #DEFAULT_INSTANCE = new DisplayConsole(document.querySelector('#console-output-container'));
  static #DEFAULT_MESSAGE = 'DisplayConsole Default Output';
  
  static tagMap = {
    '?': 'notice',
    'info': 'notice',
  };
  
  static getDefault() {
    return DisplayConsole.#DEFAULT_INSTANCE;
  }
  
  #container;
  #timing = {
    default: performance.now(),
  };

  #popup = null;
  
  constructor(outputContainer) {
    this.#container = outputContainer;
  }
  
  #focus() {
    this.#container.scrollTop = this.#container.scrollHeight;
  }
  
  clear() {
    while (this.#container.firstChild) {
      this.#container.removeChild(this.#container.firstChild);
    }
    
    this.#container.appendChild(document.createTextNode('No Messages'));
    this.#container.classList.add('empty');
    this.#focus();
  }
  
  #createOutputLine(type, tagName = null) {
    if (this.#container.classList.contains('empty')) {
      this.#container.removeChild(this.#container.firstChild);
      this.#container.classList.remove('empty');
    }
    
    const output = document.createElement('div');
    const timestamp = document.createElement('div');
    const message = document.createElement('div');
    
    if (type) {
      output.classList.add(type);
    }
    
    output.classList.add('console-output-row');
    timestamp.classList.add('console-output-row-timestamp');
    message.classList.add('console-output-row-message');
    
    const date = new Date();
    let hours = date.getHours() % 12;
    hours = hours === 0 ? 12 : hours.toString().padStart(2, '0');
    
    timestamp.textContent = `${
        hours
      }:${
        date.getMinutes().toString().padStart(2, '0')
      }:${
        date.getSeconds().toString().padStart(2, '0')
      }`;
    
    output.appendChild(timestamp);
    
    if (tagName) {
      const tag = document.createElement('div');
      tag.classList.add('tag', DisplayConsole.tagMap[tagName] ?? tagName);
      tag.textContent = tagName;
      output.appendChild(tag);
    }
    
    output.appendChild(message);
    
    this.#container.appendChild(output);
    
    return message;
  }
  
  // basic logging
  log(message = DisplayConsole.#DEFAULT_MESSAGE, tagName = null) {
    const output = this.#createOutputLine(null, tagName);
    output.textContent = message;
    this.#focus();
  }
  
  // output downloadable content to console
  logDownloadable(messageParts, ...files) {
    const output = this.#createOutputLine();
    
    const elems = messageParts.map(text => document.createTextNode(text));
    
    const anchors = files.map(file => {
      const a = document.createElement('a');
      
      if (file instanceof File) {
        a.href = URL.createObjectURL(file);
        a.textContent = a.download = file.name;
      }

      return a;
    });
    
    for (let i = 1, j = 0; i < anchors.length * 2; i += 2) {
      elems.splice(i, 0, anchors[j++]);
    }
    
    elems.forEach(elem => output.appendChild(elem));
    this.#focus();
  }
  
  // error indicator
  error(message = DisplayConsole.#DEFAULT_MESSAGE) {
    const output = this.#createOutputLine('error');
    output.textContent = message;
    this.#focus();
  }
  
  fatalError(message = DisplayConsole.#DEFAULT_MESSAGE) {
    this.error(message);
    throw new Error(message);
  }
  
  // warning indicator
  warn(message = DisplayConsole.#DEFAULT_MESSAGE) {
    const output = this.#createOutputLine('warning');
    output.textContent = message;
    this.#focus();
  }
  
  // timing
  time(id = 'default') {
    this.#timing[id] = performance.now();
  }
  
  timeEnd(message = DisplayConsole.#DEFAULT_MESSAGE, tagName = null, id = 'default') {
    const delta = performance.now() - this.#timing[id] ?? 0;
    this.log(`${message}: ${delta.toFixed(2)}ms`, tagName);
  }
}