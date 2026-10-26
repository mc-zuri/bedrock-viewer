// The client entity resources of a version's pack stack, as entities.json:
//   entities              identifier -> its client entity description (the definition of the highest
//                         min_engine_version: a pack keeps the legacy X.v1.0.entity.json beside the current one)
//   files                 identifier -> the file that defines it
//   attachables           identifier -> its attachable description (armour, shields, tools as worn and held), chosen
//                         as the entities are; a `.player` attachable (minecraft:diamond_helmet.player) keeps its
//                         `item` conditions
//   attachable_files      identifier -> the file that defines it
//   geometry              identifier -> { texture_width, texture_height, visible_bounds_*, bones }: every format
//                         (1.8 keys with inheritance "geometry.a:geometry.b", 1.12+ minecraft:geometry) as one
//   render_controllers    identifier -> controller, as in the packs
//   animations            identifier -> animation, as in the packs
//   animation_controllers identifier -> controller, as in the packs
//   materials             name -> { defines, states, blendSrc?, blendDst?, depthFunc? }: each material an entity or
//                         attachable names, with what its chain of parents in materials/*.material sets
//   entity_properties     identifier -> { property: { type, values?, range?, default, client_sync? } }: the entity
//                         properties of the behaviour pack's definitions, in their order (the server syncs those
//                         with client_sync)
//   missing               what the entities and attachables name that the packs do not have (the client builds
//                         boats' geometry itself)
//   problems              files that did not parse, and a bone field the geometry lost (none)
const { parseJsonc } = require('../pack/jsonc')
const { compareVersions } = require('../pack/versions')
const { geometryEntries, resolveGeometry, droppedFields } = require('./geometry')
const { materialDefinitions, resolveMaterial } = require('./materials')

// every pack's copy of the files a pattern matches, lowest pack first: { path, layer, json }. A newer pack's copy
// of a file may hold only what it changes (vanilla_1.19.60's iron_golem.entity.json is just its spawn egg).
function * layerFiles (stack, pattern, problems) {
  for (let layer = 0; layer < stack.layers.length; layer++) {
    const { name, files } = stack.layers[layer]
    for (const [path, read] of files) {
      if (!pattern.test(path)) continue
      let json
      try {
        json = parseJsonc(read().toString('utf8'))
      } catch (err) {
        problems.push(`${name}/${path}: ${err.message}`)
        continue
      }
      if (json && typeof json === 'object') yield { path, layer, json }
    }
  }
}

const engineVersion = description => description.min_engine_version ?? '0'

// a file's description over the packs: each pack's keys over the ones below, maps (textures, geometry, animations,
// scripts...) merged key by key
function mergeDescription (base, top) {
  const out = { ...base }
  for (const [key, value] of Object.entries(top)) {
    const prev = out[key]
    out[key] = prev && value && typeof prev === 'object' && typeof value === 'object' && !Array.isArray(prev) && !Array.isArray(value)
      ? { ...prev, ...value }
      : value
  }
  return out
}

// identifier -> description of the files a folder holds under `key` ('minecraft:client_entity', 'minecraft:attachable')
function descriptions (stack, folder, key, problems) {
  const byFile = new Map()
  for (const { path, json } of layerFiles(stack, new RegExp(`^${folder}/.+\\.json$`), problems)) {
    const description = json[key]?.description
    if (description) byFile.set(path, mergeDescription(byFile.get(path) ?? {}, description))
  }
  const out = {}
  const files = {}
  for (const [path, description] of byFile) {
    const id = description.identifier
    if (!id) continue
    if (!out[id] || compareVersions(engineVersion(description), engineVersion(out[id])) > 0) {
      out[id] = description
      files[id] = path
    }
  }
  return { out, files }
}

function clientEntities (stack, problems) {
  const { out: entities, files } = descriptions(stack, 'entity', 'minecraft:client_entity', problems)
  return { entities, files }
}

function attachables (stack, problems) {
  const { out, files } = descriptions(stack, 'attachables', 'minecraft:attachable', problems)
  return { attachables: out, files }
}

// identifier -> the properties of its behaviour pack definition (the highest pack's)
function entityProperties (behavior, problems) {
  const out = {}
  if (!behavior) return out
  for (const { json } of layerFiles(behavior, /^entities\/.+\.json$/, problems)) {
    const description = json['minecraft:entity']?.description
    const id = description?.identifier
    if (!id) continue
    if (description.properties && Object.keys(description.properties).length) out[id] = description.properties
    else delete out[id]
  }
  return Object.fromEntries(Object.keys(out).sort().map(id => [id, out[id]]))
}

// Every geometry definition of the stack: id -> { parent, data, legacy, layer, file }.
//
// vanilla_1.21.90 saved the 1.8 models of the cat, fox, llama, ocelot, parrot, polar bear, rabbit and snow golem
// again as 1.21 geometry, without their bones' bind_pose_rotation, which that format has not; the game still draws
// those bones in their bind pose (a cat's body lies, its sit animation adds -45 to that), so a bone keeps the bind
// pose a lower pack gave it when the higher one names no rotation for it
function geometryDefinitions (stack, problems) {
  const defs = new Map()
  const binds = new Map() // 'id/bone' -> bind_pose_rotation, from the lower packs
  const add = (id, def) => {
    for (const b of def.data.bones ?? []) {
      if (!b?.name) continue
      const key = id + '/' + b.name.toLowerCase()
      if (b.bind_pose_rotation) binds.set(key, b.bind_pose_rotation)
      else if (!def.legacy && !b.rotation && binds.has(key)) b.inheritedBind = binds.get(key)
    }
    const prev = defs.get(id)
    // the higher pack wins; in one pack, a model file of its own over the shared mobs.json
    if (!prev || def.layer > prev.layer || (def.layer === prev.layer && prev.file.endsWith('mobs.json'))) defs.set(id, def)
  }
  for (const { path, layer, json: file } of layerFiles(stack, /^models\/.+\.json$/, problems)) {
    for (const { id, ...entry } of geometryEntries(file)) add(id, { ...entry, layer, file: path })
  }
  return defs
}

// the texture paths the entities and attachables name ('textures/entity/cow/cow'); atlas references (atlas.shield)
// are no files
function entityTextures (...lists) {
  const paths = new Set()
  for (const list of lists) {
    for (const e of Object.values(list ?? {})) {
      for (const t of Object.values(e.textures ?? {})) if (typeof t === 'string' && t.startsWith('textures/')) paths.add(t)
    }
  }
  return paths
}

// stack: PackStack (stack.behavior its behaviour packs, or null); source: { kind, build, match, ref? }; materialsTable:
// name -> resolved material, for a stack with no material files of its own. Returns { out: entities.json,
// materialsFrom }, or null when the stack has no client entities.
function exportEntities ({ version, stack, source, materialsTable = null }) {
  const problems = []
  const { entities, files } = clientEntities(stack, problems)
  if (!Object.keys(entities).length) return null
  const { attachables: worn, files: wornFiles } = attachables(stack, problems)

  const geometryDefs = geometryDefinitions(stack, problems)
  const geometry = {}
  for (const [id, def] of geometryDefs) {
    try {
      geometry[id] = resolveGeometry(id, geometryDefs)
    } catch (err) {
      problems.push(err.message)
      continue
    }
    // every field of a bone the file gives survives, or is normalized on purpose
    for (const b of def.data.bones ?? []) {
      if (!b?.name) continue
      // (a file may name two bones alike: the hat of geometry.zombie.villager.v1.8)
      const same = geometry[id].bones.filter(o => o.name.toLowerCase() === b.name.toLowerCase())
      const losses = same.map(o => droppedFields(b, o))
      const lost = same.length ? losses.find(l => !l.length) ?? losses[0] : ['the bone']
      if (lost.length) problems.push(`${id} bone ${b.name}: ${lost.map(k => `${k} ${JSON.stringify(b[k.split('.')[0]])?.slice(0, 60)}`).join(', ')} dropped`)
    }
  }

  const renderControllers = {}
  const animations = {}
  const animationControllers = {}
  // each identifier as the highest pack defines it
  for (const { json } of layerFiles(stack, /^render_controllers\/.+\.json$/, problems)) Object.assign(renderControllers, json.render_controllers)
  for (const { json } of layerFiles(stack, /^animations\/.+\.json$/, problems)) Object.assign(animations, json.animations)
  for (const { json } of layerFiles(stack, /^animation_controllers\/.+\.json$/, problems)) Object.assign(animationControllers, json.animation_controllers)

  const materialDefs = materialDefinitions(stack, problems)
  const fromTable = !materialDefs.size && materialsTable
  const materials = {}
  for (const e of [...Object.values(entities), ...Object.values(worn)]) {
    for (const name of Object.values(e.materials ?? {})) {
      materials[name] ??= fromTable ? (materialsTable[name] ?? { defines: [], states: [] }) : resolveMaterial(name, materialDefs)
    }
  }

  const missing = { geometry: new Set(), render_controllers: new Set(), animations: new Set() }
  for (const e of [...Object.values(entities), ...Object.values(worn)]) {
    for (const g of Object.values(e.geometry ?? {})) if (!geometry[g]) missing.geometry.add(g)
    for (const rc of e.render_controllers ?? []) {
      const name = typeof rc === 'string' ? rc : Object.keys(rc)[0]
      if (!renderControllers[name]) missing.render_controllers.add(name)
    }
    for (const a of Object.values(e.animations ?? {})) {
      if (!animations[a] && !animationControllers[a]) missing.animations.add(a)
    }
  }

  const out = {
    version,
    source,
    entities,
    files,
    attachables: worn,
    attachable_files: wornFiles,
    geometry,
    render_controllers: renderControllers,
    animations,
    animation_controllers: animationControllers,
    materials,
    entity_properties: entityProperties(stack.behavior, problems),
    missing: Object.fromEntries(Object.entries(missing).map(([k, v]) => [k, [...v].sort()])),
    problems
  }
  return { out, materialsFrom: fromTable ? 'data/entity_materials.json' : 'packs' }
}

module.exports = { exportEntities, clientEntities, attachables, entityProperties, geometryDefinitions, entityTextures, layerFiles }
