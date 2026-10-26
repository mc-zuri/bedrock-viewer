// A Bedrock version's entities, armor and particles, from its own packs, for prismarine-viewer:
//
// - entities.json: { name: { identifier, geometry: { layer: geometry }, textures: { layer: 'textures/...' } } }, the
//   format of prismarine-viewer's own entity models (the client entity description, its geometry resolved). A layer is
//   what one of the entity's render controllers draws, with every query and variable at 0 (an adult, unsheared,
//   unsaddled mob of its first variant): its geometry, and its textures laid over each other. The player is drawn
//   with geometry.humanoid.custom and steve, player_slim with geometry.humanoid.customSlim and alex; both have the
//   cape's geometry, drawn with a cape the viewer is given.
// - attachables.json: { item: { slot, geometry, texture } }, the armor an entity wears: its attachable where the
//   version has one, else what the client's code draws (geometry.humanoid.armor.<slot>, else the bones of the slot in
//   geometry.humanoid.armor1 / armor2, on the material's textures/models/armor/<material>_<layer>).
// - particles.json: { identifier: { texture, material, components } }, the particle effects (particles/*.json).
// - the textures these name, as PNG under their path below textures/ (entity/zombie/zombie.png).
//
// 0.14 - 1.0 have no client entity definitions (the client draws its mobs in code): an entity takes the geometry and
// textures the reference version's definition names, from the version's own packs (models/mobs.json, textures/mob/),
// where the geometry is not there (0.14) from the nearest newer client's.
const fs = require('fs')
const path = require('path')
const { geometries } = require('./geometry')
const { animationIndex, restingPose } = require('./pose')
const { compile, setRandom } = require('../molang')
const { decodePng, encodePng } = require('../image/png')
const { decodeTga } = require('../image/tga')

// a description over another, as the client merges the packs': maps (textures, geometry) key by key, the rest replaced
function mergeDescription (a = {}, b) {
  const out = { ...a }
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) ? { ...a[k], ...v } : v
  }
  return out
}

const engineVersion = d => String(d.min_engine_version ?? '0').split('.').map(Number)
const newerEngine = (a, b) => {
  const x = engineVersion(a)
  const y = engineVersion(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0)
  return false
}

// The descriptions of a folder's files by identifier: a file's copies in every pack merged, the higher's over the
// lower's (1.19.60's iron_golem.entity.json gives its spawn egg alone); of two files describing one identifier, the one
// of the highest min_engine_version (creeper.entity.json over creeper.v1.0.entity.json, which names none)
function descriptions (stack, folder, root) {
  const out = new Map()
  for (const file of stack.files.keys()) {
    if (!file.startsWith(folder + '/') || !file.endsWith('.json')) continue
    let copies
    try { copies = stack.jsonLayers(file) } catch { continue }
    let merged = null
    for (const copy of copies) {
      const d = copy?.[root]?.description
      if (d?.identifier) merged = mergeDescription(merged ?? {}, d)
    }
    if (!merged) continue
    const other = out.get(merged.identifier)
    if (!other || !newerEngine(other, merged)) out.set(merged.identifier, merged)
  }
  return out
}

const clientEntities = stack => descriptions(stack, 'entity', 'minecraft:client_entity')
const attachableFiles = stack => descriptions(stack, 'attachables', 'minecraft:attachable')

function renderControllers (stack) {
  const out = new Map()
  for (const file of stack.files.keys()) {
    if (!/^render_controllers\/.+\.json$/.test(file)) continue
    let copies
    try { copies = stack.jsonLayers(file) } catch { continue }
    for (const json of copies) for (const [name, rc] of Object.entries(json?.render_controllers ?? {})) out.set(name.toLowerCase(), rc)
  }
  return out
}

// the textures of a glint or a mask the client blends by material, not drawn as a layer
const NOT_DRAWN = /enchanted_(item|actor)_glint|\/misc\/|_invisible$/

// the state an entity is drawn in: alive, at full health; every other query 0 (an adult, unsheared, unsaddled mob of
// its first variant)
const QUERIES = { 'query.is_alive': 1, 'query.health': 1000, 'query.max_health': 1000 }

// the state above, after a description's initialize and pre_animation scripts have set its variables
function restState (description) {
  const variables = {}
  const state = { get: n => n in variables ? variables[n] : QUERIES[n] ?? 0, set: (n, v) => { variables[n] = v } }
  for (const key of ['initialize', 'pre_animation']) {
    for (const script of [].concat(description.scripts?.[key] ?? [])) compile(script)(state)
  }
  return state
}

// What a description's render controllers draw: [{ geometry: identifier, textures: [path], visible(bone) }], in its
// rest state (restState). A controller is drawn when it has no condition or its condition holds; visible says which
// bones its part_visibility shows.
function layersOf (description, controllers) {
  const lower = obj => Object.fromEntries(Object.entries(obj ?? {}).map(([k, v]) => [k.toLowerCase(), v]))
  const geometry = lower(description.geometry)
  const textures = lower(description.textures)
  const state = restState(description)
  const layers = []
  const list = description.render_controllers ?? []
  for (const entry of list) {
    const [name, condition] = typeof entry === 'string' ? [entry, null] : Object.entries(entry)[0] ?? []
    if (!name) continue
    if (condition !== null && condition !== undefined && !compile(condition)(state)) continue
    const rc = controllers.get(name.toLowerCase())
    if (!rc) continue
    const arrays = {}
    for (const group of Object.values(rc.arrays ?? {})) for (const [k, v] of Object.entries(group)) arrays[k.toLowerCase()] = v
    const scope = {
      get (n) {
        if (n.startsWith('geometry.')) return geometry[n.slice(9)]
        if (n.startsWith('texture.')) return textures[n.slice(8)]
        if (n.startsWith('array.')) return (arrays[n] ?? []).map(e => compile(e)(scope))
        return state.get(n)
      }
    }
    const geo = compile(rc.geometry ?? 'Geometry.default')(scope)
    const tex = (rc.textures ?? ['Texture.default']).map(t => compile(t)(scope)).filter(t => typeof t === 'string' && !NOT_DRAWN.test(t))
    // part_visibility: [{ bone pattern (* for any): visible }], the later over the earlier
    const visibility = (rc.part_visibility ?? []).flatMap(e => Object.entries(e)).map(([pattern, v]) => [pattern, !!compile(v)(scope)])
    const visible = bone => {
      let shown = true
      for (const [pattern, v] of visibility) {
        const re = new RegExp('^' + pattern.toLowerCase().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$')
        if (re.test(bone.toLowerCase())) shown = v
      }
      return shown
    }
    if (typeof geo === 'string' && tex.length) layers.push({ geometry: geo, textures: tex, visible })
  }
  // (a description with no controller the viewer can read: its default geometry and texture)
  if (!layers.length && geometry.default && textures.default) layers.push({ geometry: geometry.default, textures: [textures.default] })
  return layers
}

// b over a (the same size), by b's alpha
function over (a, b) {
  const rgba = Buffer.from(a.rgba)
  for (let i = 0; i < rgba.length; i += 4) {
    const alpha = b.rgba[i + 3] / 255
    if (!alpha) continue
    for (let c = 0; c < 3; c++) rgba[i + c] = b.rgba[i + c] * alpha + rgba[i + c] * (1 - alpha)
    rgba[i + 3] = Math.max(rgba[i + 3], b.rgba[i + 3])
  }
  return { ...a, rgba }
}

// Writes textures into the version's folder, as PNG at their path below textures/
class TextureWriter {
  constructor (stacks, dir) {
    this.stacks = stacks // the stacks to read from, in order
    this.dir = dir
    this.written = new Map() // texture path -> path written (or null)
    this.cache = new Map()
  }

  image (texturePath) {
    if (!this.cache.has(texturePath)) {
      let img = null
      for (const stack of this.stacks) {
        const file = stack.resolveTexture(texturePath.replace(/\.(png|tga)$/, ''))
        if (!file || !/\.(png|tga)$/.test(file)) continue
        try {
          const buf = stack.read(file)
          img = file.endsWith('.tga') ? decodeTga(buf) : decodePng(buf)
        } catch { img = null }
        if (img) break
      }
      this.cache.set(texturePath, img)
    }
    return this.cache.get(texturePath)
  }

  writeImage (texturePath, img) {
    const file = path.join(this.dir, texturePath.replace(/^textures\//, '') + '.png')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, encodePng(img))
    this.written.set(texturePath, texturePath)
    return texturePath
  }

  // a pack texture written as it is (its path), or null
  copy (texturePath) {
    const key = texturePath.replace(/\.(png|tga)$/, '')
    if (this.written.has(key)) return this.written.get(key)
    const img = this.image(key)
    if (!img) { this.written.set(key, null); return null }
    return this.writeImage(key, img)
  }

  // textures laid over each other (those of the first's size), written as `name`; a lone texture as it is
  layered (texturePaths, name) {
    const images = texturePaths.map(p => ({ p, img: this.image(p.replace(/\.(png|tga)$/, '')) })).filter(x => x.img)
    if (!images.length) return null
    if (images.length === 1) return this.copy(images[0].p)
    const [base, ...rest] = images
    let img = base.img
    for (const { img: top } of rest) if (top.width === img.width && top.height === img.height) img = over(img, top)
    return this.writeImage(name, img)
  }
}

const shortName = identifier => identifier.replace(/^minecraft:/, '')

// the entity entry of its layers, each geometry in its resting pose (pose.js), or null when nothing of it can be drawn
function entityEntry (identifier, layers, geos, writer, pose = null) {
  const entry = { identifier, geometry: {}, textures: {} }
  layers.forEach((layer, i) => {
    let geometry = geos(layer.geometry)
    if (geometry && pose) geometry = pose.apply(geometry)
    const key = i === 0 ? 'default' : `layer_${i}`
    if (geometry && layer.visible) {
      // (the bones its part_visibility hides keep no cubes; a layer it hides whole is not drawn)
      geometry = { ...geometry, bones: geometry.bones.map(b => layer.visible(b.name) ? b : { ...b, cubes: [] }) }
      if (!geometry.bones.some(b => b.cubes.length)) return
    }
    const texture = writer.layered(layer.textures, `textures/entity/_layers/${shortName(identifier)}_${key}`)
    if (!geometry || !texture) return
    entry.geometry[key] = geometry
    entry.textures[key] = texture
  })
  return Object.keys(entry.geometry).length ? entry : null
}

// the armor items of the client's code: material -> its texture names (leather: its brown cloth texture, the grey
// leather one being tinted by its dye), slot -> its layer
const ARMOR = /^(leather|chainmail|iron|golden|diamond|netherite|turtle)_(helmet|chestplate|leggings|boots)$/
const ARMOR_TEXTURES = { leather: ['cloth', 'leather'], chainmail: ['chain'], iron: ['iron'], golden: ['gold'], diamond: ['diamond'], netherite: ['netherite'], turtle: ['turtle'] }
const SLOT_BONES = { helmet: ['head', 'hat'], chestplate: ['body', 'rightarm', 'leftarm'], leggings: ['body', 'rightleg', 'leftleg'], boots: ['rightleg', 'leftleg'] }

// an armor item as the client's code draws it: its slot's geometry, on its material's layer texture
function codeArmor (item, geos, writer) {
  const [, material, slot] = ARMOR.exec(item)
  const layer = slot === 'leggings' ? 2 : 1
  let geometry = geos(`geometry.humanoid.armor.${slot}`)
  if (!geometry) {
    const full = geos(`geometry.humanoid.armor${layer}`)
    if (!full) return null
    const keep = new Set(SLOT_BONES[slot])
    geometry = { ...full, bones: full.bones.map(b => keep.has(b.name.toLowerCase()) ? b : { ...b, cubes: [] }) }
  }
  for (const name of ARMOR_TEXTURES[material]) {
    for (const folder of ['textures/models/armor', 'textures/armor']) {
      const texture = writer.copy(`${folder}/${name}_${layer}`)
      if (texture) return { slot, geometry, texture }
    }
  }
  return null
}

// the slot an attachable is worn in, by its item's name
const slotOf = item => /helmet|_head$|skull$|carved_pumpkin/.test(item) ? 'helmet' : /chestplate|elytra/.test(item) ? 'chestplate' : /leggings/.test(item) ? 'leggings' : /boots/.test(item) ? 'boots' : null

function particleEffects (stack, writer) {
  const out = {}
  for (const file of [...stack.files.keys()].sort()) {
    if (!/^particles\/.+\.json$/.test(file)) continue
    let effect
    try { effect = stack.json(file)?.particle_effect } catch { continue }
    const d = effect?.description
    if (!d?.identifier) continue
    const params = d.basic_render_parameters ?? {}
    const texture = params.texture ? writer.copy(params.texture) : null
    out[d.identifier] = { texture, material: params.material ?? 'particles_alpha', components: effect.components ?? {} }
  }
  return out
}

// options: { mcData, stack (the version's packs, newer clients' below), own (its own packs), particles (the packs of
// its particle effects, its own by default), dir (its folder), reference: { own, mcData } for 0.14 - 1.0 }
function exportEntities ({ mcData, stack, own, particles: particlePacks = own, dir, reference = null }) {
  // (the resting state's math.random: the middle of its range, so that a version exports the same every time)
  setRandom(() => 0.5)
  const writer = new TextureWriter([own], dir)
  const ownGeos = geometries(own)
  const allGeos = geometries(stack)
  // a geometry of the version's own packs, under its identifier or the one before its .v1.8 suffix; else (0.14, which
  // has no geometry data) the nearest newer client's
  const geos = id => {
    if (!id) return null
    const plain = id.replace(/\.v\d+(\.\d+)*$/, '')
    return ownGeos.get(id) ?? ownGeos.get(plain) ?? (reference ? allGeos.get(plain) ?? allGeos.get(id) : null)
  }

  const descriptions = clientEntities(reference ? reference.own : own)
  const controllers = renderControllers(reference ? reference.own : own)
  const animations = animationIndex(reference ? reference.own : own)
  const entities = {}
  const missing = []
  for (const [identifier, description] of descriptions) {
    const name = shortName(identifier)
    let layers = layersOf(description, controllers)
    if (reference) layers = layers.map(l => ({ ...l, textures: l.textures.map(legacyTexture(own)).filter(Boolean) }))
    const entry = entityEntry(identifier, layers, geos, writer, restingPose(description, animations, restState(description)))
    if (entry) entities[name] = entry
    else missing.push(name)
  }
  // the player: steve on geometry.humanoid.custom, alex on customSlim; both with the cape's geometry
  const cape = geos('geometry.cape')
  for (const [name, geometry, skins] of [['player', 'geometry.humanoid.custom', ['textures/entity/steve', 'textures/mob/steve']], ['player_slim', 'geometry.humanoid.customSlim', ['textures/entity/alex', 'textures/mob/alex']]]) {
    const geo = geos(geometry)
    const texture = skins.map(s => writer.copy(s)).find(Boolean)
    if (!geo || !texture) continue
    entities[name] = { identifier: 'minecraft:player', geometry: { default: geo, ...(cape ? { cape } : {}) }, textures: { default: texture } }
  }

  // armor: the version's attachables, else the client's code
  const attachables = {}
  const attachableDescriptions = attachableFiles(own)
  // (a 0.14 - 1.0 item, named by its display name, is the armor the reference version's item of that name is:
  // leather_cap is a leather_helmet)
  const byDisplayName = new Map((reference?.mcData?.itemsArray ?? []).map(i => [i.displayName.toLowerCase(), i.name]))
  for (const { name: ownName, displayName } of mcData.itemsArray) {
    const item = byDisplayName.get(displayName?.toLowerCase()) ?? ownName
    const description = attachableDescriptions.get('minecraft:' + item)
    const slot = slotOf(item)
    // (leather armor's texture is grey, tinted by its dye in code: undyed, it is the pack's brown cloth texture)
    if (description && slot && !/^leather_/.test(item)) {
      const [layer] = layersOf(description, controllers)
      const geometry = layer && geos(layer.geometry)
      const texture = layer && writer.layered(layer.textures, `textures/entity/_layers/${item}`)
      if (geometry && texture) { attachables[ownName] = { slot, geometry, texture }; continue }
    }
    if (ARMOR.test(item)) {
      const armor = codeArmor(item, geos, writer)
      if (armor) attachables[ownName] = armor
    }
  }

  const particles = particleEffects(particlePacks, writer)

  const write = (file, value) => fs.writeFileSync(path.join(dir, file), JSON.stringify(value, null, 2) + '\n')
  write('entities.json', entities)
  write('attachables.json', attachables)
  write('particles.json', particles)
  return { entities: Object.keys(entities).length, attachables: Object.keys(attachables).length, particles: Object.keys(particles).length, entitiesNotDrawn: missing.sort() }
}

// a reference version's texture path in a 0.14 - 1.0 pack: the same path, else the one under textures/mob/
function legacyTexture (stack) {
  return texturePath => {
    const candidates = [texturePath]
    const rest = texturePath.replace(/^textures\/entity\//, '')
    const parts = rest.split('/')
    candidates.push('textures/mob/' + rest, 'textures/mob/' + parts[parts.length - 1])
    return candidates.find(p => stack.resolveTexture(p)) ?? null
  }
}

module.exports = { exportEntities, layersOf, restState, clientEntities, renderControllers }
