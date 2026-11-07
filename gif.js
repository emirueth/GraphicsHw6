// Minimal GIF decoder: turns a GIF file into a list of full RGBA frames.
// WebGL only ever uploads the first frame of a GIF, so we decode it ourselves.
// Returns { width, height, frames: [{ pixels: Uint8Array (RGBA), delay: ms }] }
function decodeGIF(buffer) {
  const bytes = new Uint8Array(buffer);
  let pos = 0;
  const u8 = () => bytes[pos++];
  const u16 = () => { const v = bytes[pos] | (bytes[pos + 1] << 8); pos += 2; return v; };
  const readColorTable = size => {
    const table = bytes.subarray(pos, pos + 3 * size);
    pos += 3 * size;
    return table;
  };
  const readSubBlocks = () => {
    const chunks = [];
    let total = 0, len;
    while ((len = u8()) !== 0) { chunks.push(bytes.subarray(pos, pos + len)); pos += len; total += len; }
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  };

  // Header + logical screen descriptor
  const signature = String.fromCharCode(...bytes.subarray(0, 6));
  if (!signature.startsWith("GIF")) throw new Error("Not a GIF file");
  pos = 6;
  const width = u16(), height = u16();
  const flags = u8();
  u8(); u8();  // background color index, pixel aspect ratio
  const globalTable = (flags & 0x80) ? readColorTable(1 << ((flags & 7) + 1)) : null;

  const canvas = new Uint8Array(width * height * 4);  // composited image so far
  const frames = [];
  let delay = 100, transparentIndex = -1, disposal = 0;

  while (pos < bytes.length) {
    const block = u8();
    if (block === 0x21) {                     // extension
      const label = u8();
      if (label === 0xF9) {                   // graphic control extension
        u8();                                 // block size (4)
        const packed = u8();
        delay = (u16() * 10) || 100;          // stored in 1/100 s
        const ti = u8();
        transparentIndex = (packed & 1) ? ti : -1;
        disposal = (packed >> 2) & 7;
        u8();                                 // terminator
      } else {
        readSubBlocks();                      // skip comments, NETSCAPE loop info, etc.
      }
    } else if (block === 0x2C) {              // image descriptor
      const fx = u16(), fy = u16(), fw = u16(), fh = u16();
      const iflags = u8();
      const table = (iflags & 0x80) ? readColorTable(1 << ((iflags & 7) + 1)) : globalTable;
      const interlaced = (iflags & 0x40) !== 0;
      const minCodeSize = u8();
      const indices = lzwDecode(readSubBlocks(), minCodeSize, fw * fh);

      const before = disposal === 3 ? canvas.slice() : null;

      // Row order for interlaced images
      const rows = [];
      if (interlaced) {
        for (const [start, step] of [[0, 8], [4, 8], [2, 4], [1, 2]])
          for (let r = start; r < fh; r += step) rows.push(r);
      } else {
        for (let r = 0; r < fh; r++) rows.push(r);
      }

      // Paint this frame's pixels onto the composite canvas
      for (let k = 0; k < fh; k++) {
        const y = fy + rows[k];
        if (y >= height) continue;
        for (let x = 0; x < fw; x++) {
          const idx = indices[k * fw + x];
          if (idx === transparentIndex || fx + x >= width) continue;
          const o = (y * width + fx + x) * 4;
          canvas[o] = table[idx * 3];
          canvas[o + 1] = table[idx * 3 + 1];
          canvas[o + 2] = table[idx * 3 + 2];
          canvas[o + 3] = 255;
        }
      }
      frames.push({ pixels: canvas.slice(), delay });

      // Disposal: what to do before drawing the next frame
      if (disposal === 2) {
        for (let y = fy; y < Math.min(fy + fh, height); y++)
          canvas.fill(0, (y * width + fx) * 4, (y * width + Math.min(fx + fw, width)) * 4);
      } else if (disposal === 3) {
        canvas.set(before);
      }
      transparentIndex = -1; disposal = 0; delay = 100;
    } else if (block === 0x3B) {              // trailer
      break;
    } else {
      break;                                  // unknown block: stop
    }
  }
  return { width, height, frames };
}

// GIF-flavored LZW decompression
function lzwDecode(data, minCodeSize, pixelCount) {
  const out = new Uint8Array(pixelCount);
  const clearCode = 1 << minCodeSize, endCode = clearCode + 1;
  const prefix = new Int16Array(4096), suffix = new Uint8Array(4096), stack = new Uint8Array(4097);
  let codeSize = minCodeSize + 1, nextCode = endCode + 1, oldCode = -1, first = 0;
  let bitBuf = 0, bitCount = 0, p = 0, op = 0;

  for (let i = 0; i < clearCode; i++) { prefix[i] = -1; suffix[i] = i; }

  while (op < pixelCount) {
    while (bitCount < codeSize) {
      if (p >= data.length) return out;
      bitBuf |= data[p++] << bitCount;
      bitCount += 8;
    }
    const code = bitBuf & ((1 << codeSize) - 1);
    bitBuf >>= codeSize;
    bitCount -= codeSize;

    if (code === clearCode) { codeSize = minCodeSize + 1; nextCode = endCode + 1; oldCode = -1; continue; }
    if (code === endCode) break;

    if (oldCode === -1) {
      out[op++] = suffix[code];
      oldCode = code; first = code;
      continue;
    }

    let sp = 0, c = code;
    if (code >= nextCode) { stack[sp++] = first; c = oldCode; }  // the KwKwK case
    while (c >= clearCode) { stack[sp++] = suffix[c]; c = prefix[c]; }
    first = suffix[c];
    stack[sp++] = first;
    while (sp > 0 && op < pixelCount) out[op++] = stack[--sp];

    if (nextCode < 4096) {
      prefix[nextCode] = oldCode;
      suffix[nextCode] = first;
      nextCode++;
      if (nextCode === (1 << codeSize) && codeSize < 12) codeSize++;
    }
    oldCode = code;
  }
  return out;
}
