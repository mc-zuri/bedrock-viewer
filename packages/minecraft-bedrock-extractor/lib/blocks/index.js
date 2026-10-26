// A Bedrock version's blocks in minecraft-assets' format: blocks_states.json keyed by Bedrock block name and Bedrock
// state properties, blocks_models.json, blocks_textures.json, and the textures they draw with.
//
// Everything comes from Bedrock: the states are minecraft-data's Bedrock palette; each state's textures are the ones
// its block's blocks.json entry names in terrain_texture.json (a list indexed by the state's legacy data value); its
// tessellator shape, render layer and tint method are the client's (data/block_render.json); its geometry is its own
// Bedrock shapes (minecraft-data's blockCollisionShapes and blockSelectionShapes) laid out as that tessellator draws
// them (./geometry).
const { TextureResolver, FACES } = require('./resolve')
const { legacyData } = require('./layouts')
const { makeRenderOf } = require('./render')
const { canonicalFaces, doorWood, drawnFaces } = require('./faces')
const { propsOf, stateKey } = require('./states')
const { generate } = require('./geometry')
const { buildBlockState } = require('./blockstate')
const { sample, redstoneTable, stemTable, hexColor, COLORMAPS } = require('./tints')
const { overlayTextures, constantTints } = require('../image/overlay')

const MODEL = 'minecraft:block/'
const MISSING = 'missing_texture'

// The tint the viewer gives a face with tintindex 0 picks by block name (prismarine-viewer models.js); a Bedrock tint
// method it would draw in another colour is baked into the texture instead.
function viewerTint (name) {
  // (it colours redstone wire by Java's power property: Bedrock's redstone_signal is baked)
  if (name === 'redstone_wire') return null
  if (name === 'birch_leaves') return 'birch'
  if (name === 'spruce_leaves') return 'evergreen'
  if (name.includes('leaves') || name === 'vine') return 'foliage'
  return 'grass'
}

class ModelStore {
  constructor () {
    this.models = {}
    this.byContent = new Map()
    this.geometries = new Map()
    this.counts = new Map()
  }

  // geometry (elements, ao) shared by a parent; the textures in a child named after the block
  add (name, { elements, textures, ao }) {
    const geometry = JSON.stringify({ elements, ao })
    let parent = this.geometries.get(geometry)
    if (!parent) {
      parent = this.geometries.size === 0 && isCube(elements) ? 'cube' : `geometry_${this.geometries.size}`
      if (this.models[parent]) parent = `geometry_${this.geometries.size}`
      this.models[parent] = { elements }
      if (ao === false) this.models[parent].ambientocclusion = false
      this.geometries.set(geometry, parent)
    }
    const child = { parent: MODEL + parent, textures: Object.fromEntries(Object.entries(textures).map(([k, v]) => [k, v.startsWith('#') ? v : MODEL + v])) }
    const key = JSON.stringify(child)
    if (this.byContent.has(key)) return this.byContent.get(key)
    const n = (this.counts.get(name) ?? 0) + 1
    this.counts.set(name, n)
    let out = n === 1 ? name : `${name}_${n}`
    while (this.models[out]) out += '_'
    this.models[out] = child
    this.byContent.set(key, out)
    return out
  }
}

const isCube = elements => elements.length === 1 && elements[0].from.every(v => v === 0) && elements[0].to.every(v => v === 16)

// grass sides: an untinted base, and the masked part again over it, tinted
function addOverlays (m, overlayOf) {
  const extra = []
  for (const el of m.elements) {
    const faces = {}
    for (const [dir, face] of Object.entries(el.faces)) {
      const overlay = overlayOf(m.textures[face.texture.slice(1)])
      if (!overlay) continue
      delete face.tintindex
      const v = 'overlay_' + dir
      m.textures[v] = overlay
      faces[dir] = { ...face, texture: '#' + v, tintindex: 0 }
    }
    if (Object.keys(faces).length) extra.push({ ...el, faces })
  }
  m.elements.push(...extra)
}

// a block's states: minecraft-data's palette with each state's legacy data value and Bedrock shapes
function statesOf (mcData, layouts) {
  const states = mcData.blockStates.map((s, index) => ({ name: s.name, props: propsOf(s), index }))
  const data = legacyData(states, layouts)
  const permutation = new Map()
  // a state's boxes in a shapes file: its block's id per state (or one for all), the boxes of that id
  const boxesOf = (file, s) => {
    const ids = file?.blocks?.[s.name]
    const id = Array.isArray(ids) ? ids[s.permutation] : ids
    return id === undefined ? null : (file.shapes[id] ?? [])
  }
  states.forEach((s, i) => {
    s.data = data[i]
    s.permutation = permutation.get(s.name) ?? 0
    permutation.set(s.name, s.permutation + 1)
    s.collision = boxesOf(mcData.blockCollisionShapes, s)
    s.outline = boxesOf(mcData.blockSelectionShapes, s)?.[0] ?? null
  })
  return states
}

// The blocks of the versions minecraft-data has no states of (0.14 - 1.0): each block's id with each data value its
// legacy table names a Bedrock state of (wool 14: wool[color=red]). A state is drawn as the game's block of that name
// (name), and written under minecraft-data's name of the block (blockName: what prismarine-block calls it); its shapes
// are those of the same state in `reference`, the oldest version minecraft-data has states of.
function legacyStatesOf (mcData, legacyBlocks, reference, layouts) {
  const known = new Map(statesOf(reference, layouts).map(s => [s.name + '[' + stateKey(s.props) + ']', s]))
  const states = []
  for (const block of mcData.blocksArray) {
    for (let data = 0; data < 16; data++) {
      const entry = legacyBlocks[`${block.id}:${data}`]
      if (!entry && data > 0) continue
      const m = entry ? /^(?:minecraft:)?([^[]+)(?:\[(.*)\])?$/.exec(entry) : null
      const name = m ? m[1] : block.name
      const props = Object.fromEntries((m?.[2] ? m[2].split(',') : []).map(p => p.split('=')))
      const same = known.get(name + '[' + stateKey(props) + ']')
      states.push({ name, blockName: block.name, props, data, index: (block.id << 4) | data, collision: same?.collision ?? null, outline: same?.outline ?? null })
    }
  }
  return states
}

function exportBlocks ({ stack, mcData, store, tables, legacy }) {
  const states = mcData.blockStates ? statesOf(mcData, tables.layouts) : legacyStatesOf(mcData, legacy.blocks, legacy.reference, tables.layouts)
  const resolver = new TextureResolver(stack, { legacyKeys: tables.legacyKeys })
  const renderOf = makeRenderOf(tables)
  const hasPackTexture = p => !!stack.resolveTexture(p)

  // the colours a baked tint takes: the plains biome's (temperature 0.8, downfall 0.4)
  const colormap = name => store.imageOf(store.ref(`textures/colormap/${name}`)) ?? null
  const plains = method => {
    if (method === 'water') return hexColor(stack.biomesClient().biomes.default?.water_surface_color ?? '#44aff5')
    const map = colormap(COLORMAPS[method === 'dry' ? 'dry' : method] ?? 'grass')
    return sample(map, 0.8, 0.4) ?? 0x79c05a
  }
  const redstone = redstoneTable()
  const stems = stemTable()
  const tintColor = (method, props) => {
    if (method.startsWith('#')) return hexColor(method)
    if (method === 'redstone') return redstone.data[+(props.redstone_signal ?? 0)]?.color ?? redstone.default
    if (method === 'stem') return stems.data[+(props.growth ?? 7)]?.color ?? stems.default
    return plains(method)
  }

  const overlays = new Set([...overlayTextures(resolver.terrain)].map(p => store.ref(p)).filter(Boolean))
  const fixedTints = new Map([...constantTints(resolver.terrain)].map(([p, color]) => [store.ref(p), color]))
  const overlayOf = name => overlays.has(name) ? store.splitOverlay(name)[1] : null

  // every state's pack faces, render facts and drawn faces
  const byName = new Map()
  const baseFaces = new Map()
  const report = { missingTile: new Set(), unrendered: new Set(), failed: [], shapes: {} }
  for (const s of states) {
    const resolved = resolver.resolve(s.name, s.data)
    s.resolved = resolved
    s.packFaces = resolved ? FACES.map(f => resolved.faces[f]) : null
    if (resolved?.source === 'missing_tile') report.missingTile.add(s.name)
    s.render = renderOf(s.name, s.props)
    if (!s.render) report.unrendered.add(s.name)
    // (the states of a legacy version go under minecraft-data's name of their block)
    const key = s.blockName ?? s.name
    if (!byName.has(key)) {
      byName.set(key, [])
      if (s.packFaces) baseFaces.set(key, s.packFaces)
    }
    byName.get(key).push(s)
  }
  // the textures of the block's type each state takes, then the ones its tessellator draws of them (a door's half)
  for (const [name, list] of byName) {
    const shape = list[0].render?.shape
    const canon = canonicalFaces(list.map(s => ({ ...s, faces: s.packFaces })), shape, baseFaces.get(name))
    const keyed = [...canon.values()]
    list.forEach((s, i) => {
      let faces = keyed.length === list.length ? keyed[i] : s.packFaces
      if (shape === 'Door') faces = doorWood(s.name, faces, hasPackTexture)
      s.faces = s.render && faces ? drawnFaces(s, shape, faces, hasPackTexture) : faces
    })
  }
  // Education Edition's hard glass with no textures of its own draws as the glass it hardens
  for (const [name, list] of byName) {
    if (!name.startsWith('hard_')) continue
    const plain = byName.get(name.slice(5))
    if (!plain) continue
    for (const s of list) {
      if (s.faces && !s.faces.every(p => /missing_tile$/.test(p))) continue
      const key = JSON.stringify(s.props)
      s.faces = (plain.find(p => JSON.stringify(p.props) === key) ?? plain[0]).faces
    }
  }

  const models = new ModelStore()
  const blocksStates = {}
  const blocksTextures = []
  const missingTextures = new Set()
  const refOf = p => {
    const ref = store.ref(p)
    if (!ref) missingTextures.add(p)
    return ref ?? MISSING
  }

  for (const [name, list] of byName) {
    const entries = []
    let defaultModel = null
    let defaultTexture = null
    for (const s of list) {
      const shape = s.render?.shape ?? null
      report.shapes[shape ?? 'unknown'] = (report.shapes[shape ?? 'unknown'] ?? 0) + 1
      const faces = s.faces?.map(refOf) ?? null
      if (!faces) { entries.push({ props: s.props, parts: [] }); continue }
      let method = s.render?.tint && s.render.tint !== 'none' ? s.render.tint : null
      const fixed = faces.map(f => fixedTints.get(f)).find(Boolean)
      if (fixed) method = fixed
      const tintable = t => !!method && t !== MISSING && store.isGrey(t)
      const ctx = {
        shape,
        faces,
        tintFaces: method ? Object.fromEntries(FACES.map((d, i) => [d, tintable(faces[i])])) : false,
        tintTexture: tintable,
        tessellator: tables.tessellator,
        ref: p => store.ref(p)
      }
      let model
      try {
        model = generate(s, ctx)
      } catch (err) {
        report.failed.push(`${name} ${JSON.stringify(s.props)} (${shape}): ${err.message}`)
        model = null
      }
      if (!model) { entries.push({ props: s.props, parts: [] }); continue }
      const parts = (model.parts ?? [model]).map(m => {
        addOverlays(m, overlayOf)
        // a tint the viewer would draw in another colour: baked into the faces' textures
        const tinted = m.elements.some(el => Object.values(el.faces).some(f => f.tintindex === 0))
        if (tinted && method && method !== viewerTint(name)) {
          const color = tintColor(method, s.props)
          const baked = {}
          for (const el of m.elements) {
            for (const face of Object.values(el.faces)) {
              if (face.tintindex !== 0) continue
              delete face.tintindex
              const variable = face.texture.slice(1)
              baked[variable] ??= `${variable}_tinted`
              face.texture = '#' + baked[variable]
            }
          }
          for (const [variable, tintedVariable] of Object.entries(baked)) {
            m.textures[tintedVariable] = store.tinted(m.textures[variable], color)
          }
        }
        const part = { model: MODEL + models.add(name, m) }
        if (m.x) part.x = m.x
        if (m.y) part.y = m.y
        return part
      })
      entries.push({ props: s.props, parts })
      if (!parts.length) continue
      if (!defaultModel || s.index === mcData.blocksByName[name]?.defaultState) {
        defaultModel = parts[0].model
        defaultTexture = (model.parts?.[0] ?? model).textures.particle ?? faces[2]
      }
    }
    blocksStates[name] = buildBlockState(entries)
    blocksTextures.push({
      name,
      blockState: name,
      model: defaultModel ? defaultModel.replace(MODEL, 'minecraft:blocks/') : null,
      texture: defaultTexture && defaultTexture !== MISSING ? 'minecraft:blocks/' + defaultTexture : null
    })
  }
  if (!models.models.air) models.models.air = { textures: {}, elements: [] }
  // the viewer draws a block with no blockstate as its missing_texture model, a child of cube_all
  models.models.cube_all = {
    textures: { particle: '#all', down: '#all', up: '#all', north: '#all', south: '#all', west: '#all', east: '#all' },
    elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: Object.fromEntries(FACES.map(d => [d, { texture: '#' + d, cullface: d }])) }]
  }

  // what the items resolve against: the texture each block's item is drawn with (its carried texture, with the fixed
  // colours its terrain entry gives, else its default state's north face), pack paths
  const itemBlocks = new Map()
  for (const [name, list] of byName) {
    const s = list.find(s => s.index === mcData.blocksByName[name]?.defaultState) ?? list[0]
    const carried = resolver.carried(s.resolved)
    const north = carried?.path ?? s.faces?.[2]
    if (!north || !store.stemOf(north)) continue
    const colors = carried && (carried.overlay_color || carried.tint_color) ? { overlay_color: carried.overlay_color, tint_color: carried.tint_color } : undefined
    itemBlocks.set(name, { north, carried: !!carried, colors })
  }

  return {
    blocksStates,
    blocksModels: models.models,
    blocksTextures,
    itemBlocks,
    resolveBlock: (name, data) => resolver.resolve(name, data),
    report: {
      missingTile: [...report.missingTile].sort(),
      unrendered: [...report.unrendered].sort(),
      missingTextures: [...missingTextures].sort(),
      failed: report.failed,
      shapes: report.shapes
    }
  }
}

module.exports = { exportBlocks, viewerTint }
