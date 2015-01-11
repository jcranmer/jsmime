define(function() {
"use strict";

let base64DecodeMap = new Uint8Array(128);
let base64EncodeMap = new Uint8Array(64);

// Initialize the decode map to all illegal characters (sigil is 255).
for (let i = 0; i < base64DecodeMap.length; i++)
  base64DecodeMap[i] = 255;

function fillBase64Map(bits, b64) {
  base64DecodeMap[b64] = bits;
  base64EncodeMap[bits] = b64;
}
for (let i = 0; i < 26; i++) {
  fillBase64Map(     i, 0x41 + i); //  0-25: 'A' + i
  fillBase64Map(26 + i, 0x61 + i); // 26-51: 'a' + i
}
for (let i = 0; i < 10; i++) {
  fillBase64Map(52 + i, 0x30 + i); // 52-61: '0' + i
}
fillBase64Map  (62    , 0x2b    ); //    62: '+'
fillBase64Map  (63    , 0x2f    ); //    63: '/'
const EQ = "=".charCodeAt(0);

function decodeBase64ToTypedArray(string) {
  let buffer = new Uint8Array(Math.trunc(string.length * 3 / 4));
  let index = 0;
  let buildBits = 0;
  let nChars = 0;
  for (let i = 0; i < string.length; i++) {
    let code = string.charCodeAt(i);
    if (code > 128)
      continue;
    let bits = base64DecodeMap[code];
    if (bits == 255)
      continue;
    nChars++;
    buildBits = (buildBits << 6) | bits;
    if (nChars == 4) {
      nChars = 0;
      buffer[index++] = (buildBits >> 16) & 0xFF;
      buffer[index++] = (buildBits >>  8) & 0xFF;
      buffer[index++] = (buildBits      ) & 0xFF;
    }
  }
  if (nChars == 3) {
    buffer[index++] = (buildBits >> 10) & 0xFF;
    buffer[index++] = (buildBits >>  2) & 0xFF;
  } else if (nChars == 2) {
    buffer[index++] = (buildBits >>  4) & 0xFF;
  }

  return buffer.subarray(0, index);
}

function encodeBase64ToTypedArray(data) {
  let buffer = new Uint8Array(Math.ceil(data.length / 3) * 4);
  let i = 0, index = 0;
  for (; i + 2 < data.length; i += 3) {
    let buildBits = data[i] << 16 | data[i + 1] << 8 | data[i + 2];
    buffer[index++] = base64EncodeMap[(buildBits >> 18) & 63];
    buffer[index++] = base64EncodeMap[(buildBits >> 12) & 63];
    buffer[index++] = base64EncodeMap[(buildBits >>  6) & 63];
    buffer[index++] = base64EncodeMap[(buildBits      ) & 63];
  }

  // Encode the remaining few bytes.
  if (i == data.length - 2) {
    let buildBits = data[i] << 16 | data[i + 1] << 8;
    buffer[index++] = base64EncodeMap[(buildBits >> 18) & 63];
    buffer[index++] = base64EncodeMap[(buildBits >> 12) & 63];
    buffer[index++] = base64EncodeMap[(buildBits >>  6) & 63];
    buffer[index++] = EQ;
  } else if (i == data.length - 1) {
    let buildBits = data[i] << 16;
    buffer[index++] = base64EncodeMap[(buildBits >> 18) & 63];
    buffer[index++] = base64EncodeMap[(buildBits >> 12) & 63];
    buffer[index++] = EQ;
    buffer[index++] = EQ;
  }

  if (index != buffer.length)
    throw new Error("Unexpected buffer length!");

  return buffer;
}

return Object.freeze({
  decodeToTypedArray: decodeBase64ToTypedArray,
  encodeToTypedArray: encodeBase64ToTypedArray,
});

});
