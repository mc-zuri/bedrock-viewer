// Which textures a Bedrock block state shows, from the resource packs.
//
// blocks.json names a block's textures by terrain_texture.json keys, per face (`up`, `down`, `side`, or the four sides).
// A terrain key holds one texture, or a list that the block's data value indexes. A block blocks.json gives no textures
// (cyan_terracotta: a sound alone) has a terrain key of its own name. Flattened blocks of older versions keep their
// legacy entry (`white_terracotta` is `stained_hardened_clay` data 0), which complex_aliases.json names where the
// server data has it.

const FACES = ['down', 'up', 'north', 'south', 'west', 'east']

// a terrain_texture.json entry's textures -> variant `data`: { path, overlay_color?, tint_color? }, or null
function terrainTexture (entry, data = 0) {
  if (!entry) return null
  let t = entry.textures
  if (Array.isArray(t)) t = t[data] ?? t[0]
  if (t && typeof t === 'object' && Array.isArray(t.variations)) t = t.variations[0]
  if (typeof t === 'string') return { path: t }
  if (t && typeof t === 'object' && typeof t.path === 'string') {
    const out = { path: t.path }
    if (t.overlay_color) out.overlay_color = t.overlay_color.toLowerCase()
    if (t.tint_color) out.tint_color = t.tint_color.toLowerCase()
    return out
  }
  return null
}

// a terrain_texture.json entry's textures -> the path of variant `data`
function terrainPath (entry, data = 0) {
  return terrainTexture(entry, data)?.path ?? null
}

// the textures entry of blocks.json -> terrain key per face
function faceKeys (textures) {
  if (!textures) return null
  if (typeof textures === 'string') return Object.fromEntries(FACES.map(f => [f, textures]))
  const side = textures.side
  const keys = {}
  for (const f of FACES) {
    keys[f] = textures[f] ?? (f === 'up' || f === 'down' ? side ?? textures.up ?? textures.down : side)
  }
  for (const f of FACES) keys[f] ??= Object.values(textures).find(v => typeof v === 'string')
  return keys
}

// Blocks whose textures the client names in code, not in blocks.json (checked against the 1.26.51 client's own
// per-state faces): a blocks.json key to use instead, or a path per face.
const HARDCODED = {
  iron_chain: { key: 'chain' },
  // 1.18.30's hanging propagule, a block of its own before 1.19.0 made it a state of mangrove_propagule
  mangrove_propagule_hanging: { key: 'mangrove_propagule' },
  // a terrain texture by a state's property, as the client picks it
  shelf_mushroom: { by: 'growth', terrainKeys: ['shelf_mushroom_small', 'shelf_mushroom_large'] },
  // before 1.1 the End portal and gateway are a shader over the End sky, with no block texture
  end_portal: { fallback: 'textures/environment/end_sky' },
  end_gateway: { fallback: 'textures/environment/end_sky' },
  // its underwater_tnt_* entries go unused: the client draws it as TNT
  underwater_tnt: { terrain: { down: 'tnt_bottom', up: 'tnt_top', north: 'tnt_side', south: 'tnt_side', west: 'tnt_side', east: 'tnt_side' } },
  piston_arm_collision: { path: 'textures/blocks/piston_inner' },
  sticky_piston_arm_collision: { path: 'textures/blocks/piston_inner' },
  lever: { terrain: { down: 'lever', up: 'lever', north: 'lever', south: 'lever', west: 'lever', east: 'lever_particle' } },
  // a repeater's and a comparator's textures list the unpowered and the powered one: the block picks by its name
  unpowered_repeater: { index: 0 },
  powered_repeater: { index: 1 },
  unpowered_comparator: { index: 0 },
  powered_comparator: { index: 1 },
  // a barrel's textures list the shut and the open one: its open_bit picks
  barrel: { indexBy: 'open_bit' }
}

class TextureResolver {
  // stack: PackStack; aliases: complex_aliases.json (legacy name -> its flattened names, in data order), when known;
  // legacyKeys: block name -> the blocks.json keys its description id names (grass_block -> [grass]), newest first
  constructor (stack, { aliases = {}, legacyKeys = new Map() } = {}) {
    this.stack = stack
    this.blocks = stack.blocks()
    this.terrain = stack.textureData('textures/terrain_texture.json')
    // flattened name -> { legacy, data }
    this.legacy = new Map()
    for (const [legacy, names] of Object.entries(aliases ?? {})) {
      names.forEach((name, data) => {
        const n = name.replace(/^minecraft:/, '')
        if (!this.legacy.has(n)) this.legacy.set(n, { legacy: legacy.replace(/^minecraft:/, ''), data })
      })
    }
    this.legacyKeys = legacyKeys
  }

  // blocks.json keys to try for a block, with the data value each implies (undefined: the state's own)
  candidates (name) {
    const out = [{ key: name }]
    const legacy = this.legacy.get(name)
    if (legacy) out.push({ key: legacy.legacy, data: legacy.data })
    // Education Edition's hardened glass looks like the plain glass it hardens
    if (name.startsWith('hard_')) out.push({ key: name.slice(5) }, ...this.candidates(name.slice(5)).slice(1))
    return out
  }

  // the prop that picks a block's textures by its own value (a barrel's open_bit), or null
  texturePick (name) {
    return HARDCODED[name]?.indexBy ?? HARDCODED[name]?.by ?? null
  }

  // the faces a blocks.json entry gives, or null
  fromBlock (key, data) {
    const keys = faceKeys(this.blocks[key]?.textures)
    if (!keys) return null
    const faces = {}
    for (const f of FACES) faces[f] = terrainPath(this.terrain[keys[f]], data)
    return FACES.every(f => faces[f]) ? faces : null
  }

  // name + the state's data value (its permutation index) and properties -> { faces: {face: path}, source } or null
  resolve (name, data = 0, props = {}) {
    const hard = HARDCODED[name]
    data = hard?.index ?? (hard?.indexBy ? +(props[hard.indexBy] ?? 0) : data)
    if (hard?.terrainKeys) {
      const path = terrainPath(this.terrain[hard.terrainKeys[+props[hard.by]] ?? hard.terrainKeys[0]], 0)
      if (path) return { faces: Object.fromEntries(FACES.map(f => [f, path])), source: 'hardcoded' }
    }
    if (hard?.path && this.stack.resolveTexture(hard.path)) {
      return { faces: Object.fromEntries(FACES.map(f => [f, hard.path])), source: 'hardcoded' }
    }
    if (hard?.terrain) {
      const faces = Object.fromEntries(FACES.map(f => [f, terrainPath(this.terrain[hard.terrain[f]], 0)]))
      if (FACES.every(f => faces[f])) return { faces, source: 'hardcoded' }
    }
    const candidates = this.candidates(name)
    if (hard?.key) candidates.splice(1, 0, { key: hard.key })
    for (const { key, data: legacyData } of candidates) {
      const faces = this.fromBlock(key, legacyData ?? data)
      if (faces) return { faces, source: `blocks.json:${key}`, key, data: legacyData ?? data }
    }
    // blocks the game draws itself (lever, sponge, dead bush), and the flattened blocks blocks.json gives no textures
    // (cyan_terracotta), name their terrain key after the block
    const own = terrainPath(this.terrain[name], data)
    if (own) return { faces: Object.fromEntries(FACES.map(f => [f, own])), source: `terrain:${name}` }
    // the entry the block's description id names (grass_block: tile.grass)
    for (const legacyKey of this.legacyKeys.get(name) ?? []) {
      if (legacyKey === name) continue
      const faces = this.fromBlock(legacyKey, data)
      if (faces) return { faces, source: `blocks.json:${legacyKey}`, key: legacyKey, data }
      candidates.push({ key: legacyKey })
    }
    for (const { key, data: legacyData } of candidates.slice(1)) {
      const path = terrainPath(this.terrain[key], legacyData ?? data)
      if (path) return { faces: Object.fromEntries(FACES.map(f => [f, path])), source: `terrain:${key}` }
    }
    if (hard?.fallback && this.stack.resolveTexture(hard.fallback)) {
      return { faces: Object.fromEntries(FACES.map(f => [f, hard.fallback])), source: 'hardcoded' }
    }
    // and a block with no textures at all (unknown, chalkboard, moving_block) the client draws with missing_tile
    const missing = terrainPath(this.terrain.missing_tile)
    if (missing) return { faces: Object.fromEntries(FACES.map(f => [f, missing])), source: 'missing_tile' }
    return null
  }

  // The texture the block's item is drawn with, when blocks.json gives it carried_textures of a carried key
  // (oak_leaves_carried, grass_carried, tall_grass_carried: coloured as the inventory shows them, where the block's own
  // are tinted by the biome): a single key, or the side of one with faces. A block whose carried faces differ round
  // it (a dispenser's front) is left to its own, and so is one whose carried key is one of its parts (the sculk
  // shrieker's inner top, the end portal frame's eye). Its frame is the data value, as for the block.
  // resolved: what resolve() gave the block's state; its blocks.json entry's carried texture is taken with the same
  // data value (acacia leaves: leaves2's carried frame 0, before 1.2 too where the item is named acacia_leaves).
  // -> { path, overlay_color?, tint_color? } (the carried grass side is the grass side with its overlay in a fixed
  // colour), or null
  carried (resolved) {
    if (!resolved?.key) return null
    const block = this.blocks[resolved.key]
    const t = block?.carried_textures
    const carriedKey = typeof t === 'string' ? t : t?.side
    if (!carriedKey || !/carried/i.test(carriedKey)) return null
    // a list of them must have the block's frames (0.14's double_plant_carried has the tinted plants' only, grass and
    // fern); one texture is the item's whatever its data
    const frames = key => [this.terrain[key]?.textures].flat().length
    const own = Math.max(0, ...[...new Set(Object.values(faceKeys(block.textures) ?? {}))].map(frames))
    if (frames(carriedKey) > 1 && frames(carriedKey) < own) return null
    return terrainTexture(this.terrain[carriedKey], resolved.data ?? 0)
  }
}

module.exports = { TextureResolver, terrainPath, terrainTexture, faceKeys, FACES, HARDCODED }
