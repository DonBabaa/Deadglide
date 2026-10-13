// Undoes what tools/pack_models.mjs does to a model on its way into a build: hands back the .glb it was made from,
// byte for byte. (It is used in two places: by the game, on what it has fetched and unzipped (models.js); and by the
// build itself, which unpacks every file it has just packed and will not finish unless it gets the original back.)
//
// A packed model, once unzipped, is: 4 bytes saying how long its header is, the header (JSON: { v: 1, f: [...] }),
// and then the .glb with some stretches of it rearranged. Each entry of f is one stretch:
//   [where it starts, how many rows it has, how many numbers to a row, how many bytes to a number, how it was done]
// A stretch is a run of numbers (the corners of a mesh, its triangles, the keys of a clip). Rearranged, all the
// first bytes of its rows come first, then all the second bytes, and so on (numbers that are near each other share
// their high bytes, and a run of the same byte zips to almost nothing). How it was done: 1 = only that; 2 = each
// number was first replaced by how far it is from the one in the row before (whole numbers, wrapping); 3 = the same,
// for numbers with a point in them, by which of their bits differ from the row before's.
export function unpack(bytes) {
  const long = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
  const head = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + long)));
  if (head.v !== 1) throw new Error(`A packed model of a kind this build does not know (v${head.v}).`);
  const glb = bytes.slice(4 + long);
  for (const [start, rows, across, size, how] of head.f) {
    const wide = across * size, plain = new Uint8Array(rows * wide);
    for (let p = 0, from = start; p < wide; p++) for (let i = 0, to = p; i < rows; i++, to += wide) plain[to] = glb[from++];
    if (how > 1) {
      const n = size === 1 ? plain : size === 2 ? new Uint16Array(plain.buffer) : new Uint32Array(plain.buffer);
      if (how === 2) for (let i = across; i < n.length; i++) n[i] += n[i - across];
      else for (let i = across; i < n.length; i++) n[i] ^= n[i - across];
    }
    glb.set(plain, start);
  }
  return glb;
}
