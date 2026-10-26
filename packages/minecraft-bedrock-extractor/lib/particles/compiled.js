// The particle effects 1.26.50+ clients ship compiled: a binary form ("\x7fMCB") that keeps the effect's values in the
// order of the game's own schema, without the field names. It starts with the version, the identifier, the material
// and the texture as strings; each component is the FNV-1a hash of its name and its fields; a string is its length
// (LEB128) and its bytes; numbers are 32-bit (float, or int).
//
// The export does not decode it: the text of the same effect comes from elsewhere (bedrock-samples, which publishes the
// same packs as text), and matchesCompiled checks that text against the compiled file: the identifier, material and
// texture, a hash for every component, every string the text holds, every number, and no text in the compiled file
// that the text lacks.

const MAGIC = Buffer.from([0x7f, 0x4d, 0x43, 0x42]) // \x7fMCB

const isCompiled = buf => buf.length >= 4 && buf.subarray(0, 4).equals(MAGIC)

const fnv1a = s => {
  let h = 0x811c9dc5
  for (const c of Buffer.from(s, 'utf8')) { h ^= c; h = Math.imul(h, 0x01000193) >>> 0 }
  return h >>> 0
}

const leb128 = n => {
  const out = []
  do {
    let b = n & 0x7f
    n >>>= 7
    if (n) b |= 0x80
    out.push(b)
  } while (n)
  return Buffer.from(out)
}

const encoded = s => Buffer.concat([leb128(Buffer.byteLength(s, 'utf8')), Buffer.from(s, 'utf8')])

// the identifier of a compiled effect: the second string of its header (the first says what it is), or null
function compiledIdentifier (buf) {
  let i = 4 + 2 + 2 + 4 // magic, version, header
  const strings = []
  while (strings.length < 2 && i < buf.length) {
    let n = 0
    let shift = 0
    let c
    do { c = buf[i++]; n |= (c & 0x7f) << shift; shift += 7 } while (c & 0x80 && i < buf.length)
    strings.push(buf.subarray(i, i + n).toString('utf8'))
    i += n
  }
  return strings[0] === 'particle_effect' ? strings[1] ?? null : null
}

// a colour the text writes as "#AARRGGBB" or "#RRGGBB", which the compiled file keeps as its channels (0..1)
const HEX = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i
const channels = hex => hex.slice(1).match(/../g).map(c => parseInt(c, 16) / 255)

// [strings, numbers] of a JSON value: every string (map keys that name things too: curves, events, gradient stops,
// which the compiled file writes with six decimals: "0.54" as "0.540000")
function walk (v, strings = [], numbers = [], key = null) {
  if (typeof v === 'string') {
    if (HEX.test(v)) numbers.push(...channels(v))
    else strings.push(v)
  } else if (typeof v === 'number') numbers.push(v)
  else if (Array.isArray(v)) v.forEach(x => walk(x, strings, numbers))
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (key === 'gradient' && Number.isFinite(Number(k))) strings.push(Number(k).toFixed(6))
      else if (key === 'curves' || key === 'events' || /^(variable|v)\./.test(k)) strings.push(k)
      walk(x, strings, numbers, k)
    }
  }
  return [strings, numbers]
}

// Whether the text of an effect (the particle_effect object) is what a compiled file holds; returns the differences
// found, [] when none
function matchesCompiled (buf, effect) {
  const diffs = []
  const d = effect.description ?? {}
  const brp = d.basic_render_parameters ?? {}
  for (const s of [d.identifier, brp.material, brp.texture]) {
    if (typeof s === 'string' && buf.indexOf(encoded(s)) === -1) diffs.push(`header ${s}`)
  }
  for (const name of Object.keys(effect.components ?? {})) {
    if (buf.indexOf(Buffer.from(Uint32Array.of(fnv1a(name)).buffer)) === -1) diffs.push(`component ${name}`)
  }
  // every string of the text, and nothing printable left once they are taken out
  const [strings, numbers] = walk(effect)
  const rest = Buffer.from(buf)
  rest.fill(0, 0, 12)
  for (const s of [...new Set(strings)].sort((a, b) => b.length - a.length)) {
    const e = encoded(s)
    let at = rest.indexOf(e)
    const raw = Buffer.from(s, 'utf8')
    if (at === -1 && rest.indexOf(raw) === -1) { diffs.push(`string ${JSON.stringify(s).slice(0, 60)}`); continue }
    while (at !== -1) { rest.fill(0, at, at + e.length); at = rest.indexOf(e, at + e.length) }
  }
  rest.fill(0, 12, 12 + 1 + 'particle_effect'.length)
  const leftover = /[\x20-\x7e]{6,}/.exec(rest.toString('latin1'))
  if (leftover) diffs.push(`text the compiled file has and the text lacks: ${JSON.stringify(leftover[0].slice(0, 60))}`)
  for (const n of new Set(numbers)) {
    if (n === 0 || n === 1) continue
    const asFloat = buf.indexOf(Buffer.from(Float32Array.of(n).buffer)) !== -1
    const asInt = Number.isInteger(n) && Math.abs(n) < 2 ** 31 && buf.indexOf(Buffer.from(Int32Array.of(n).buffer)) !== -1
    if (!asFloat && !asInt) diffs.push(`number ${n}`)
  }
  return diffs
}

module.exports = { isCompiled, compiledIdentifier, matchesCompiled, fnv1a, MAGIC }
