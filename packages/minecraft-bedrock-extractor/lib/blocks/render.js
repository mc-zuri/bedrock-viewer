// How the client draws a block, beyond its textures: its tessellator shape, render layer and tint method, from the
// render table (data/block_render.json, the client's own facts of the newest builds) corrected by the overrides
// (data/block_render_overrides.json: by name, or by a pattern over the name). A block the table lacks under its own
// name is looked up under the flattened block it draws as (data/flattening.json: an old `log` as `oak_log`, an old
// `leaves` by its old_leaf_type).

// the flattened name a legacy block's state draws as, or null
function flattenedName (flattening, name, props) {
  const entry = flattening[name]
  if (!entry) return null
  if (typeof entry === 'string') return entry
  return entry.map?.[props[entry.by]] ?? entry.default ?? null
}

const DEFAULTS = { shape: 'Block', layer: 'opaque', tint: 'none' }

// block name + state props -> { shape, layer, tint, source } or null when nothing is known of the block
function makeRenderOf ({ render, overrides, flattening }) {
  const patterns = (overrides.patterns ?? []).map(({ match, ...facts }) => ({ re: new RegExp(match), facts }))
  const overridesOf = name => {
    const out = {}
    for (const p of patterns) if (p.re.test(name)) Object.assign(out, p.facts)
    Object.assign(out, overrides.blocks?.[name] ?? {})
    return out
  }
  const cache = new Map()
  return (name, props = {}) => {
    const family = flattenedName(flattening, name, props)
    const key = family ? `${name}\u0000${family}` : name
    if (cache.has(key)) return cache.get(key)
    let facts = render.get(name)
    let source = 'client'
    if (!facts && family) { facts = render.get(family); source = `flattened:${family}` }
    const fixes = { ...(family ? overridesOf(family) : {}), ...overridesOf(name) }
    let out = facts ? { ...DEFAULTS, ...facts, source } : null
    if (Object.keys(fixes).length) out = { ...DEFAULTS, ...(out ?? { source: 'override' }), ...fixes, source: `${out?.source ?? 'override'}+override` }
    cache.set(key, out)
    return out
  }
}

module.exports = { makeRenderOf, flattenedName }
