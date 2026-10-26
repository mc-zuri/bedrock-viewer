// Which texture an item's icon is, from the resource packs.
//
// In order: the pack's item definition (items/*.json until 1.21: its minecraft:icon, an item_texture.json key), an
// item_texture.json key of the item's own name, the spawn egg its entity names (an item_texture entry and index, or the
// colours a generic egg and its overlay are tinted with), the icons the client names in code, a texture file whose
// words are the item's, the item of the first block a legacy item flattened into, the legacy item_texture entry and
// index of a flattened item, a texture file of its name, the block of its name (its side), and last the legacy
// blocks.json entry of its name.

// the client's item definitions (items/*.json): identifier -> icon key
function packItemIcons (stack) {
  const icons = new Map()
  for (const { files } of stack.layers) {
    for (const [path, read] of files) {
      if (!/^items\/.+\.json$/.test(path)) continue
      try {
        const json = JSON.parse(read().toString('utf8').replace(/^\uFEFF/, ''))
        const item = json['minecraft:item']
        const id = item?.description?.identifier?.replace(/^minecraft:/, '')
        let icon = item?.components?.['minecraft:icon']
        if (icon && typeof icon === 'object') icon = icon.texture ?? icon.textures?.default
        if (id && typeof icon === 'string') icons.set(id, icon)
      } catch {}
    }
  }
  return icons
}

// Item icons the client names in code, not in any JSON: an item_texture.json key or a textures/items/ file, the
// first one the pack has
const CODE_ICONS = {
  cod: ['fish'],
  cooked_cod: ['cooked_fish'],
  tropical_fish: ['clownfish'],
  mutton: ['mutton_raw'],
  cooked_mutton: ['mutton_cooked'],
  book: ['book_normal'],
  enchanted_book: ['book_enchanted'],
  writable_book: ['book_writable'],
  written_book: ['book_written'],
  crossbow: ['crossbow_standby'],
  bow: ['bow_standby'],
  compass: ['compass_item'],
  lodestone_compass: ['lodestonecompass_item'],
  clock: ['clock_item'],
  fire_charge: ['fireball'],
  firework_rocket: ['fireworks'],
  firework_star: ['fireworks_charge'],
  glistering_melon_slice: ['melon_speckled'],
  melon_slice: ['melon'],
  minecart: ['minecart_normal'],
  glass_bottle: ['potion_bottle_empty'],
  potion: ['potion_bottle_drinkable'],
  splash_potion: ['potion_bottle_splash'],
  lingering_potion: ['potion_bottle_lingering'],
  oak_sign: ['sign'],
  dark_oak_sign: ['sign_darkoak'],
  slime_ball: ['slimeball'],
  totem_of_undying: ['totem'],
  turtle_scute: ['turtle_shell_piece'],
  sugar_cane: ['reeds'],
  enchanted_golden_apple: ['appleEnchanted', 'apple_golden'],
  ink_sac: ['dye_powder_black'],
  glow_ink_sac: ['glow_ink_sac', 'dye_powder_glow'],
  lapis_lazuli: ['dye_powder_blue'],
  cocoa_beans: ['dye_powder_brown'],
  bone_meal: ['dye_powder_white'],
  black_dye: ['dye_powder_black_new'],
  blue_dye: ['dye_powder_blue_new'],
  brown_dye: ['dye_powder_brown_new'],
  white_dye: ['dye_powder_white_new'],
  light_gray_dye: ['dye_powder_silver'],
  photo_item: ['camera', 'photo'],
  // its icon of light level 15, the item's default
  light_block: ['light_block_15'],
  portfolio: ['book_portfolio'],
  board: ['chalkboard_small'],
  glow_stick: ['glow_stick'],
  camera: ['camera'],
  scute: ['turtle_shell_piece'],
  tropical_fish_bucket: ['bucket_tropical'],
  dark_oak_boat: ['boat_darkoak'],
  // the legacy dye item, data 0 (ink sac), before the server names its flattened items (1.19.80)
  dye: ['dye_powder']
}

// the mob names the older egg textures use (egg_mushroomcow)
const EGG_MOBS = { mooshroom: 'mushroomcow', zombie_pigman: 'pigzombie', magma_cube: 'lava_slime', tropical_fish: 'clownfish' }

// icons named by a rule rather than one by one
function ruleIcons (name) {
  let m = /^(.+)_spawn_egg$/.exec(name)
  if (m) {
    const mob = m[1]
    return [`spawn_egg_${mob}`, `egg_${EGG_MOBS[mob] ?? mob}`, `egg_${mob.replace(/_/g, '')}`]
  }
  m = /_banner_pattern$/.exec(name)
  if (m) return ['banner_pattern']
  return []
}

// the client names many icons in code, after the texture file: golden_axe -> gold_axe, black_dye -> dye_powder_black,
// acacia_sign -> sign_acacia, music_disc_cat -> record_cat. An item's words are matched against the words of the item
// texture files, in any order, allowing the fewest extra words.
const SYNONYMS = { golden: 'gold', wooden: 'wood', music: null, disc: 'record', lazuli: null, slice: null, scute: 'scute' }
const words = s => s.split('_').map(w => w in SYNONYMS ? SYNONYMS[w] : w).filter(Boolean)

const color = c => '#' + String(c).replace(/^#?(0x)?/i, '').toLowerCase()

// stack: PackStack; blocks: block name -> the texture its item is drawn with ({ north, carried?, colors? }: its
// carried texture and that one's fixed { overlay_color, tint_color }, else its default state's north face; pack paths),
// only those the export has; aliases: legacy name -> its flattened names in data order; blockResolver(name, data): the
// block resolver's { faces, source }; packIcons: the item definitions when the stack has none of its own.
// Returns name -> { path, source, overlay?, tint?, colors?, block? (the icon is the block's) } or null, paths the packs'
// ('textures/items/apple'), with
// .eggOf(mob): the spawn egg of a mob, the same or null.
function itemResolver ({ stack, blocks, aliases = {}, blockResolver, packIcons }) {
  const itemTexture = stack.textureData('textures/item_texture.json')
  const icons = packItemIcons(stack)
  if (!icons.size && packIcons) for (const [id, icon] of packIcons) icons.set(id, icon)
  const legacy = new Map()
  for (const [old, names] of Object.entries(aliases)) {
    names.forEach((n, data) => { if (n && !legacy.has(n)) legacy.set(n, { key: old, data }) })
  }
  const fromKey = (key, data = 0) => {
    const e = itemTexture[key]
    if (!e) return null
    let t = e.textures
    if (Array.isArray(t)) t = t[data] ?? t[0]
    if (t && typeof t === 'object') t = t.path
    return typeof t === 'string' ? t : null
  }
  // (by file name, wherever it sits: items/spawn_eggs/spawn_egg_cow; not the ray tracing maps, *_mers / *_normal)
  const itemFiles = [...stack.textureImages().keys()]
    .filter(p => p.startsWith('textures/items/') && !/_(mers|normal|heightmap)$/.test(p))
    .map(p => ({ path: p, words: [...new Set(words(p.slice(p.lastIndexOf('/') + 1)))] }))
  const byWords = (name, maxExtra = 1) => {
    const want = words(name)
    let best = null
    for (const f of itemFiles) {
      if (!want.every(w => f.words.includes(w))) continue
      const extra = f.words.length - want.length
      if (extra > maxExtra) continue
      if (!best || extra < best.extra) best = { path: f.path, extra, tie: false }
      else if (extra === best.extra) best.tie = true
    }
    return best && !best.tie ? best.path : null
  }
  // legacy block names (log, wool) are items of their first flattened block
  const legacyFirst = new Map(Object.entries(aliases).map(([old, names]) => [old, names[0]]))
  // spawn eggs, from the client entity definitions: an item_texture entry and index (cow: spawn_egg 1), or the colors
  // the generic egg and its overlay are tinted with (hoglin)
  const spawnEggs = new Map()
  for (const [path] of stack.files) {
    if (!/^entity\/.+\.json$/.test(path)) continue
    let description
    try { description = stack.json(path)?.['minecraft:client_entity']?.description } catch { continue }
    const id = description?.identifier?.replace(/^minecraft:/, '')
    if (id && description.spawn_egg && !spawnEggs.has(id)) spawnEggs.set(id, description.spawn_egg)
  }
  // block items with the block's name run together (sealantern, tripwire, brewingstandblock)
  const blocksJoined = new Map()
  for (const [n, b] of blocks) {
    // (and case-folded: before 1.19 some blocks are camelCase, seaLantern, tripWire, pistonArmCollision)
    const joined = n.replace(/_/g, '').toLowerCase()
    blocksJoined.set(joined, b)
    blocksJoined.set(joined + 'block', b)
  }
  // the spawn egg of a mob (its client entity's identifier without the namespace), or null
  const eggOf = mob => {
    const egg = spawnEggs.get(mob)
    if (egg?.texture && fromKey(egg.texture, egg.texture_index ?? 0)) {
      return { path: fromKey(egg.texture, egg.texture_index ?? 0), source: `entity:${egg.texture}[${egg.texture_index ?? 0}]` }
    }
    if (egg?.base_color && stack.resolveTexture('textures/items/spawn_egg')) {
      return {
        path: 'textures/items/spawn_egg',
        overlay: stack.resolveTexture('textures/items/spawn_egg_overlay') ? 'textures/items/spawn_egg_overlay' : undefined,
        tint: { base: color(egg.base_color), overlay: color(egg.overlay_color ?? egg.base_color) },
        source: 'entity:colors'
      }
    }
    return null
  }
  const resolve = (name, seen = new Set()) => {
    const icon = icons.get(name)
    if (icon && fromKey(icon)) return { path: fromKey(icon), source: 'items/' + icon }
    if (fromKey(name)) return { path: fromKey(name), source: 'item_texture:' + name }
    const egg = /^(.+)_spawn_egg$/.exec(name) && eggOf(name.slice(0, -'_spawn_egg'.length))
    if (egg) return egg
    for (const stem of [...(CODE_ICONS[name] ?? []), ...ruleIcons(name)]) {
      const path = fromKey(stem) ?? (stack.resolveTexture('textures/items/' + stem) ? 'textures/items/' + stem : null)
      if (path) return { path, source: 'code:' + stem }
    }
    const exact = byWords(name, 0)
    if (exact) return { path: exact, source: 'file-words' }
    // a legacy item is its first flattened item (dye -> ink_sac)
    const firstItem = legacyFirst.get(name)
    if (firstItem && firstItem !== name && !seen.has(firstItem)) {
      const r = resolve(firstItem, new Set([...seen, name]))
      if (r) return { ...r, source: `${firstItem}:${r.source}` }
    }
    const old = legacy.get(name)
    if (old && fromKey(old.key, old.data)) return { path: fromKey(old.key, old.data), source: `item_texture:${old.key}[${old.data}]` }
    for (const guess of [`textures/items/${name}`, `textures/items/${name.replace(/^item\./, '')}`]) {
      if (stack.resolveTexture(guess)) return { path: guess, source: 'file' }
    }
    const block = blocks.get(name.replace(/^item\./, '')) ?? blocksJoined.get(name.replace(/_/g, '').toLowerCase()) ??
      blocksJoined.get(name.replace(/^real_/, '').replace(/_/g, '').toLowerCase()) // real_double_stone_slab: the double slab block
    if (block?.north) return blockIcon(block, '')
    const matched = byWords(name)
    if (matched) return { path: matched, source: 'file-words' }
    const first = legacyFirst.get(name)
    const legacyBlock = first && blocks.get(first)
    if (legacyBlock?.north) return blockIcon(legacyBlock, ':' + first)
    // an item named after a legacy blocks.json entry the palette no longer has (wool after its flattening)
    const legacyEntry = blockResolver(name, 0)
    if (legacyEntry && legacyEntry.source !== 'missing_tile') return { path: legacyEntry.faces.north, source: legacyEntry.source }
    return null
  }
  const resolver = name => resolve(name)
  resolver.eggOf = eggOf
  return resolver
}

// a block item's icon: its block's carried texture (with the fixed colours its terrain entry gives it), else its face;
// block: the block's entry (its name and shape)
function blockIcon (block, suffix) {
  const out = { path: block.north, source: (block.carried ? 'carried' : 'block') + suffix, block }
  if (block.colors) out.colors = block.colors
  return out
}

module.exports = { itemResolver, packItemIcons, CODE_ICONS, ruleIcons }
