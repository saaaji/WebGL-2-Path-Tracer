// import binary .hydra asset
export function decodeHydra(buffer) {
  const hex = n => '0x' + n.toString(16).toUpperCase();
  
  // validate header
  {
    const header = new DataView(buffer.slice(0, HEADER_SIZE));
    const magic = header.getUint32(0, true);
    const version = header.getUint32(4, true);
    assert(magic === MAGIC, `invalid magic '${hex(magic)}': expected ${hex(MAGIC)}`);
    assert(version === VERSION, `invalid version '${version}': expected ${VERSION}`);
  }
  
  // validate JSON header
  let jsonLength, jsonData;
  {
    const header = new DataView(buffer.slice(HEADER_SIZE, HEADER_SIZE * 2));
    const magic = header.getUint32(0, true);
    const length = jsonLength = header.getUint32(4, true);
    assert(magic === JSON_MAGIC, `invalid JSON magic '${hex(magic)}': expected ${hex(JSON_MAGIC)}`);
    
    const offset = HEADER_SIZE * 2;
    const jsonBuffer = buffer.slice(offset, offset + length);
    const jsonText = new TextDecoder().decode(jsonBuffer);
    jsonData = JSON.parse(jsonText);
  }
  
  // validate binary payload
  let binaryData;
  {
    const header = new DataView(buffer.slice(HEADER_SIZE * 2 + jsonLength, HEADER_SIZE * 3 + jsonLength));
    const magic = header.getUint32(0, true);
    const length = header.getUint32(4, true);
    assert(magic === BIN_MAGIC, `invalid binary magic '${hex(magic)}': expected ${hex(BIN_MAGIC)}`);
    
    const offset = HEADER_SIZE * 3 + jsonLength;
    binaryData = buffer.slice(offset, offset + length);
  }
  
  return {
    json: jsonData,
    buffer: binaryData,
  };
}