// The client's particle effects (particles/**/*.json of the pack stack) as particles.json:
//   { format_version: 1,
//     particles: { identifier: the particle_effect object as the pack writes it, with the file's format_version
//                  inside as format_version },
//     files: { identifier: the pack-relative path of its file },
//     missing: [the textures the effects name that the packs lack] }
// A higher pack's effect replaces a lower one's of the same identifier. The effects are kept as written: Molang,
// curves, events and all, for a runtime to evaluate.
//
// The textures an effect names (basic_render_parameters.texture) are the packs' textures, written under the export
// like every texture (textures/particle/particles -> particle/particles.png, TGA as PNG); atlas.terrain and atlas.items
// are the block and item atlases, which a reader builds itself.
//
// 1.26.50+ clients ship most effects compiled (./compiled.js). Their text comes from `compiledText`, the effects of
// the same version published as text (bedrock-samples), each checked against the compiled file; an effect whose text
// is not at hand or does not match is left out and listed in `compiled.unmatched`.
const { parseJsonc } = require('../pack/jsonc')
const { isCompiled, compiledIdentifier, matchesCompiled } = require('./compiled')

const FILES = /^particles\/.+\.json$/
const ATLASES = new Set(['atlas.terrain', 'atlas.items'])

// the effect a file holds, as particles.json keeps it: { format_version, ...particle_effect }
function effectOf (json) {
  const effect = json?.particle_effect
  if (!effect || typeof effect !== 'object') return null
  return json.format_version !== undefined ? { format_version: json.format_version, ...effect } : { ...effect }
}

// stack: PackStack; textures: Textures (ref, isPng); compiledText(): identifier -> { effect: as effectOf gives it,
// source }, asked for once there is a compiled effect. Returns { out, counts, compiled, problems }, or null when the
// packs have no particle files.
function exportParticles ({ stack, textures, compiledText = null }) {
  const problems = []
  const byId = new Map() // identifier -> { effect } | { compiled: buffer }, with its path; the highest pack's
  let files = 0
  for (const { name, files: layerFiles } of stack.layers) {
    for (const [path, read] of layerFiles) {
      if (!FILES.test(path)) continue
      files++
      const buf = read()
      if (isCompiled(buf)) {
        const id = compiledIdentifier(buf)
        if (id) byId.set(id, { compiled: buf, path })
        else problems.push(`${name}/${path}: a compiled file with no identifier`)
        continue
      }
      let json
      try {
        json = parseJsonc(buf.toString('utf8'))
      } catch (err) {
        problems.push(`${name}/${path}: ${err.message}`)
        continue
      }
      const effect = effectOf(json)
      const id = effect?.description?.identifier
      if (id) byId.set(id, { effect, path })
      else problems.push(`${name}/${path}: no particle_effect identifier`)
    }
  }
  if (!files) return null
  const compiled = { count: 0, from: null, unmatched: {} }
  let texts
  const textOf = id => (texts === undefined ? (texts = compiledText?.() ?? null) : texts)?.get(id)
  const particles = {}
  const sources = {}
  for (const id of [...byId.keys()].sort()) {
    const entry = byId.get(id)
    if (entry.compiled) {
      compiled.count++
      const text = textOf(id)
      if (!text) { compiled.unmatched[id] = 'no text of it'; continue }
      const { format_version: _, ...effect } = text.effect
      const diffs = matchesCompiled(entry.compiled, effect)
      if (diffs.length) { compiled.unmatched[id] = diffs.slice(0, 5).join('; '); continue }
      compiled.from = text.source
      particles[id] = text.effect
    } else {
      particles[id] = entry.effect
    }
    sources[id] = entry.path
  }
  const missing = new Set()
  const atlases = new Set()
  for (const effect of Object.values(particles)) {
    const texture = effect.description?.basic_render_parameters?.texture
    if (typeof texture !== 'string') continue
    if (ATLASES.has(texture)) { atlases.add(texture); continue }
    const ref = textures.ref(texture)
    if (!ref || !textures.isPng(ref)) missing.add(texture)
  }
  return {
    out: { format_version: 1, particles, files: sources, missing: [...missing].sort() },
    counts: { files, particles: Object.keys(particles).length, compiled: compiled.count, atlases: [...atlases].sort() },
    compiled,
    problems
  }
}

// The effects of a folder of text particle files: [[path, text]] -> identifier -> { effect, source, path }
function textEffects (files, source) {
  const out = new Map()
  for (const [path, text] of files) {
    let json
    try { json = parseJsonc(text) } catch { continue }
    const effect = effectOf(json)
    const id = effect?.description?.identifier
    if (id) out.set(id, { effect, source, path })
  }
  return out
}

module.exports = { exportParticles, textEffects, effectOf, ATLASES }
