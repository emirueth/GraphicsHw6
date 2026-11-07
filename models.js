function createCube() {
  const positions = new Float32Array([
    -1, -1,  1,   1, -1,  1,   1,  1,  1,  -1,  1,  1,   // front
     1, -1, -1,  -1, -1, -1,  -1,  1, -1,   1,  1, -1,   // back
    -1,  1,  1,   1,  1,  1,   1,  1, -1,  -1,  1, -1,   // top
    -1, -1, -1,   1, -1, -1,   1, -1,  1,  -1, -1,  1,   // bottom
     1, -1,  1,   1, -1, -1,   1,  1, -1,   1,  1,  1,   // right
    -1, -1, -1,  -1, -1,  1,  -1,  1,  1,  -1,  1, -1    // left
  ]);
  const faceNormals = [[0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0]];
  const normals = new Float32Array(faceNormals.flatMap(n => [...n, ...n, ...n, ...n]));

  // Tangent; bitangent = cross(N, T)
  const faceTangents = [[1, 0, 0], [-1, 0, 0], [1, 0, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1]];
  const tangents = new Float32Array(faceTangents.flatMap(t => [...t, ...t, ...t, ...t]));

  const texCoords = new Float32Array(faceNormals.flatMap(() => [0, 0, 1, 0, 1, 1, 0, 1]));

  const indices = new Uint16Array([
     0,  1,  2,   0,  2,  3,   // front
     4,  5,  6,   4,  6,  7,   // back
     8,  9, 10,   8, 10, 11,   // top
    12, 13, 14,  12, 14, 15,   // bottom
    16, 17, 18,  16, 18, 19,   // right
    20, 21, 22,  20, 22, 23    // left
  ]);
  return { positions, normals, tangents, texCoords, indices };
}


function createCylinder(segments = 64, uRepeat = 3) {
  const positions = [], normals = [], tangents = [], texCoords = [], indices = [];

  // Side: theta grows with u, so T points along the circle and B = cross(N, T) points up
  for (let i = 0; i <= segments; i++) {
    const u = i / segments, theta = 2 * Math.PI * u;
    const s = Math.sin(theta), c = Math.cos(theta);
    for (const y of [-1, 1]) {
      positions.push(s, y, c);
      normals.push(s, 0, c);
      tangents.push(c, 0, -s);
      texCoords.push(u * uRepeat, (y + 1) / 2);
    }
  }
  for (let i = 0; i < segments; i++) {
    const k = 2 * i;
    indices.push(k, k + 2, k + 3, k, k + 3, k + 1);
  }

  // Caps: planar mapping of x, z into the texture, T = +x on both
  for (const y of [1, -1]) {
    const center = positions.length / 3;
    positions.push(0, y, 0);
    normals.push(0, y, 0);
    tangents.push(1, 0, 0);
    texCoords.push(0.5, 0.5);
    for (let i = 0; i <= segments; i++) {
      const theta = 2 * Math.PI * i / segments;
      const s = Math.sin(theta), c = Math.cos(theta);
      positions.push(s, y, c);
      normals.push(0, y, 0);
      tangents.push(1, 0, 0);
      texCoords.push(0.5 + 0.5 * s, 0.5 - 0.5 * y * c);  // keeps cross(N, T) along +v
    }
    for (let i = 0; i < segments; i++) {
      const a = center + 1 + i, b = a + 1;
      if (y > 0) indices.push(center, a, b);
      else indices.push(center, b, a);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    tangents: new Float32Array(tangents),
    texCoords: new Float32Array(texCoords),
    indices: new Uint16Array(indices)
  };
}


// ---------------------------------------------------------------------------
// Task 1: sphere, torus, cone
// ---------------------------------------------------------------------------

function emptyMeshData() {
  return { positions: [], normals: [], tangents: [], texCoords: [], indices: [] };
}

function toTypedMesh(d) {
  return {
    positions: new Float32Array(d.positions),
    normals: new Float32Array(d.normals),
    tangents: new Float32Array(d.tangents),
    texCoords: new Float32Array(d.texCoords),
    indices: new Uint16Array(d.indices)
  };
}

function addParametricGrid(d, cols, rows, surface) {
  const base = d.positions.length / 3;
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const { p, n, t, uv } = surface(i / cols, j / rows);
      d.positions.push(...p);
      d.normals.push(...n);
      d.tangents.push(...t);
      d.texCoords.push(...uv);
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = base + j * (cols + 1) + i, b = a + 1;
      const c = a + cols + 1, e = c + 1;
      d.indices.push(a, b, e, a, e, c);
    }
  }
}

function createSphere(cols = 64, rows = 32, uRepeat = 2, vRepeat = 1) {
  const d = emptyMeshData();
  addParametricGrid(d, cols, rows, (u, v) => {
    const theta = 2 * Math.PI * u, phi = Math.PI * v;
    const s = Math.sin(theta), c = Math.cos(theta);
    const r = Math.sin(phi), y = -Math.cos(phi);
    const p = [r * s, y, r * c];
    return { p, n: p, t: [c, 0, -s], uv: [u * uRepeat, v * vRepeat] };
  });
  return toTypedMesh(d);
}

function createTorus(R = 1, r = 0.4, cols = 96, rows = 32, uRepeat = 4, vRepeat = 1) {
  const d = emptyMeshData();
  addParametricGrid(d, cols, rows, (u, v) => {
    const theta = 2 * Math.PI * u, phi = 2 * Math.PI * v;
    const s = Math.sin(theta), c = Math.cos(theta);
    const cp = Math.cos(phi), sp = Math.sin(phi);
    const ring = R + r * cp;
    return {
      p: [ring * s, r * sp, ring * c],
      n: [cp * s, sp, cp * c],
      t: [c, 0, -s],
      uv: [u * uRepeat, v * vRepeat]
    };
  });
  return toTypedMesh(d);
}

function createCone(cols = 64, rows = 16, uRepeat = 3, vRepeat = 1) {
  const d = emptyMeshData();
  const h = 2, R = 1, len = Math.hypot(h, R);

  addParametricGrid(d, cols, rows, (u, v) => {
    const theta = 2 * Math.PI * u;
    const s = Math.sin(theta), c = Math.cos(theta);
    const radius = R * (1 - v);
    return {
      p: [radius * s, -1 + h * v, radius * c],
      n: [h * s / len, R / len, h * c / len],
      t: [c, 0, -s],
      uv: [u * uRepeat, v * vRepeat]
    };
  });

  const center = d.positions.length / 3;
  d.positions.push(0, -1, 0);
  d.normals.push(0, -1, 0);
  d.tangents.push(1, 0, 0);
  d.texCoords.push(0.5, 0.5);
  for (let i = 0; i <= cols; i++) {
    const theta = 2 * Math.PI * i / cols;
    const s = Math.sin(theta), c = Math.cos(theta);
    d.positions.push(s, -1, c);
    d.normals.push(0, -1, 0);
    d.tangents.push(1, 0, 0);
    d.texCoords.push(0.5 + 0.5 * s, 0.5 + 0.5 * c);
  }
  for (let i = 0; i < cols; i++) {
    const a = center + 1 + i, b = a + 1;
    d.indices.push(center, b, a);
  }
  return toTypedMesh(d);
}
