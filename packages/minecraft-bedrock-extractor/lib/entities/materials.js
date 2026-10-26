// Entity materials: materials/*.material define each material as "name:parent" with defines and states it adds to or
// removes from its parent's (+defines, -states...), and blend factors it sets.

// name -> { parent, def } of every material file, the higher pack's winning
function materialDefinitions (stack, problems) {
  const defs = new Map()
  for (const path of stack.files.keys()) {
    if (!/^materials\/.+\.material$/.test(path)) continue
    let layers = []
    try { layers = stack.jsonLayers(path) } catch (err) { problems.push(err.message) }
    for (const layer of layers) {
      for (const [key, def] of Object.entries(layer.materials ?? {})) {
        if (key === 'version' || typeof def !== 'object') continue
        const [name, parent] = key.split(':')
        defs.set(name, { parent, def })
      }
    }
  }
  return defs
}

function resolveMaterial (name, defs, seen = new Set()) {
  // a material variant ("entity_dissolve_layer0.skinning") is its material
  const def = defs.get(name) ?? defs.get(name.split('.')[0])
  if (!def || seen.has(name)) return { defines: [], states: [] }
  seen.add(name)
  const base = def.parent ? resolveMaterial(def.parent, defs, seen) : { defines: [], states: [] }
  const d = def.def
  const defines = new Set(d.defines ?? base.defines)
  for (const x of d['+defines'] ?? []) defines.add(x)
  for (const x of d['-defines'] ?? []) defines.delete(x)
  const states = new Set(d.states ?? base.states)
  for (const x of d['+states'] ?? []) states.add(x)
  for (const x of d['-states'] ?? []) states.delete(x)
  const out = { defines: [...defines].sort(), states: [...states].sort() }
  for (const key of ['blendSrc', 'blendDst', 'depthFunc']) {
    const v = d[key] ?? base[key]
    if (v !== undefined) out[key] = v
  }
  return out
}

module.exports = { materialDefinitions, resolveMaterial }
