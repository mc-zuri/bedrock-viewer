// A Bedrock client's resource pack stack, read as one file system.
//
// A client install (MCLauncher: <dir>/data/resource_packs) keeps the vanilla resources as a stack of packs: `vanilla`
// holds the original files, and every `vanilla_<version>` pack adds or overrides on top of it. The newest pack wins,
// as the client's own pack stack orders them. From 1.21.40 a pack keeps most of its files in `.brarchive` containers
// under `__brarchive/`, and from 1.26.50 the textures too: `__brarchive/textures/blocks.brarchive` holds the files of
// `textures/blocks/`.
const { readFileSync, readdirSync, statSync, existsSync } = require('fs')
const { join } = require('path')
const { readBrarchive } = require('./brarchive')
const { parseJsonc } = require('./jsonc')
const { compareVersions } = require('./versions')
const { decodeTga } = require('../image/tga')
const { encodePng } = require('../image/png')

// every file of one pack directory: relative path -> () => Buffer. `remap` renames a leading folder: 0.15's packs
// keep their textures in images/, which later packs call textures/.
function readPackDir (dir, remap = null) {
  const files = new Map()
  const archived = new Map() // a loose file wins over an archived one of the same path
  const walk = (abs, rel) => {
    for (const name of readdirSync(abs)) {
      const a = join(abs, name)
      const r = rel ? rel + '/' + name : name
      if (statSync(a).isDirectory()) {
        if (name === 'sounds' && !r.startsWith('__brarchive')) continue
        walk(a, r)
      } else if (r.startsWith('__brarchive/') && name.endsWith('.brarchive')) {
        // __brarchive/textures/blocks.brarchive -> textures/blocks/<entry>
        const prefix = r.slice('__brarchive/'.length, -'.brarchive'.length)
        const buf = readFileSync(a)
        if (buf.length < 16) continue
        // 1.21.40 - 1.26.30 list their TGA textures with no data: the file itself lies next to the archive
        for (const e of readBrarchive(buf)) {
          const path = prefix + '/' + e.name
          if (e.data().length) archived.set(path, e.data)
        }
      } else if (!r.startsWith('__brarchive/')) {
        const key = remap && r.startsWith(remap.from + '/') ? remap.to + r.slice(remap.from.length) : r
        files.set(key, () => readFileSync(a))
      }
    }
  }
  walk(dir, '')
  for (const [path, read] of archived) if (!files.has(path)) files.set(path, read)
  return files
}

// Pocket Edition 0.14 keeps its block and item textures in two atlases (images/terrain-atlas.tga,
// images/items-opaque.tga), with terrain.meta / items.meta naming each texture's tiles: [{ name, uvs: [[x0, y0, x1, y1,
// atlasWidth, atlasHeight]] }], one tile per data value. Cut the tiles into files (textures/blocks/<name>,
// <name>_<data>) and write the terrain_texture.json / item_texture.json the later packs have.
function readPocketAtlases (imagesDir) {
  const files = new Map()
  const atlas = (meta, image, folder, jsonPath) => {
    const metaFile = join(imagesDir, meta)
    const imageFile = join(imagesDir, image + '.tga')
    if (!existsSync(metaFile) || !existsSync(imageFile)) return
    const img = decodeTga(readFileSync(imageFile))
    const textureData = {}
    for (const { name, uvs } of JSON.parse(readFileSync(metaFile, 'utf8'))) {
      const paths = uvs.map(([x0, y0, x1, y1, w, h], i) => {
        const sx = img.width / w
        const sy = img.height / h
        const px = Math.round(x0 * sx)
        const py = Math.round(y0 * sy)
        const width = Math.max(1, Math.round((x1 - x0) * sx))
        const height = Math.max(1, Math.round((y1 - y0) * sy))
        const rgba = Buffer.alloc(width * height * 4)
        for (let y = 0; y < height; y++) {
          const from = ((py + y) * img.width + px) * 4
          img.rgba.copy(rgba, y * width * 4, from, from + width * 4)
        }
        const path = `textures/${folder}/${name}${i ? '_' + i : ''}`
        const png = encodePng({ width, height, rgba })
        files.set(path + '.png', () => png)
        return path
      })
      textureData[name] = { textures: paths.length === 1 ? paths[0] : paths }
    }
    const json = Buffer.from(JSON.stringify({ texture_data: textureData }))
    files.set(jsonPath, () => json)
  }
  // the loose images (entity, environment, gui, ...) as they are
  for (const [path, read] of readPackDir(imagesDir)) {
    if (/^(terrain-atlas|items-opaque)|\.(meta|images)$/.test(path)) continue
    files.set('textures/' + path, read)
  }
  atlas('terrain.meta', 'terrain-atlas', 'blocks', 'textures/terrain_texture.json')
  atlas('items.meta', 'items-opaque', 'items', 'textures/item_texture.json')
  return files
}

// The vanilla packs of a client install, lowest priority first: chemistry and experimental packs, vanilla, then
// vanilla_<version> ascending.
function clientPackStack (resourcePacks) {
  const versioned = readdirSync(resourcePacks)
    .map(name => /^vanilla_(\d+(?:\.\d+)*)$/.exec(name))
    .filter(Boolean)
    .sort((a, b) => compareVersions(a[1], b[1]))
    .map(m => m[0])
  // Education Edition's chemistry packs (element and compound blocks, colored torches) sit below vanilla: they add
  // their own resources and never replace a vanilla one
  const chemistry = readdirSync(resourcePacks)
    .map(name => /^chemistry(?:_(\d+(?:\.\d+)*))?$/.exec(name))
    .filter(Boolean)
    .sort((a, b) => compareVersions(a[1] ?? '0', b[1] ?? '0'))
    .map(m => m[0])
  // the experimental packs texture the blocks a server already has behind an experiment toggle (mud and sculk in
  // 1.18.30, bamboo wood in 1.19.50); below vanilla too
  const experimental = readdirSync(resourcePacks).filter(name => name.startsWith('experimental_')).sort()
  return [...chemistry, ...experimental, 'vanilla', ...versioned].filter(name => existsSync(join(resourcePacks, name)))
}

const TEXTURE_EXT = /\.(png|tga|jpg)$/

// The stack as one file system. `files` maps a path to the file of the highest pack that has it; `layers` keeps each
// pack's files, lowest first, for the JSON files that merge across packs.
class PackStack {
  constructor (layers) {
    this.layers = layers // [{ name, files }]
    this.files = new Map()
    for (const { files } of layers) for (const [path, read] of files) this.files.set(path, read)
  }

  static fromClient (resourcePacks) {
    return new PackStack(clientPackStack(resourcePacks).map(name => ({ name, files: readPackDir(join(resourcePacks, name)) })))
  }

  static fromDir (dir, name = 'vanilla', remap = null) {
    return new PackStack([{ name, files: readPackDir(dir, remap) }])
  }

  // a client install of any era: data/resource_packs (0.16 on), data/resourcepacks/vanilla (0.15, images/ for
  // textures/), or data/images with atlases (0.14)
  static fromInstall (dataDir) {
    if (existsSync(join(dataDir, 'resource_packs'))) return PackStack.fromClient(join(dataDir, 'resource_packs'))
    if (existsSync(join(dataDir, 'resourcepacks', 'vanilla'))) {
      return PackStack.fromDir(join(dataDir, 'resourcepacks', 'vanilla'), 'vanilla', { from: 'images', to: 'textures' })
    }
    return new PackStack([{ name: 'images', files: readPocketAtlases(join(dataDir, 'images')) }])
  }

  // the behaviour packs of a client install (data/behavior_packs), stacked as its resource packs are; null if none
  static behaviorFromInstall (dataDir) {
    const dir = join(dataDir, 'behavior_packs')
    return existsSync(dir) ? PackStack.fromClient(dir) : null
  }

  has (path) { return this.files.has(path) }
  read (path) { return this.files.get(path)?.() }

  json (path) {
    const buf = this.read(path)
    return buf ? parseJsonc(buf.toString('utf8')) : undefined
  }

  // every pack's copy of a JSON file, lowest first
  jsonLayers (path) {
    const out = []
    for (const { name, files } of this.layers) {
      const read = files.get(path)
      if (!read) continue
      try {
        out.push(parseJsonc(read().toString('utf8')))
      } catch (err) {
        throw new Error(`${name}/${path}: ${err.message}`)
      }
    }
    return out
  }

  // terrain_texture.json / item_texture.json: texture_data merged key by key, the higher pack winning
  textureData (path) {
    const merged = {}
    for (const layer of this.jsonLayers(path)) Object.assign(merged, layer.texture_data)
    return merged
  }

  // blocks.json: block entries merged, the higher pack winning; keys without their namespace
  blocks () {
    const merged = {}
    for (const layer of this.jsonLayers('blocks.json')) {
      for (const [key, value] of Object.entries(layer)) {
        if (key === 'format_version') continue
        merged[key.replace(/^minecraft:/, '')] = value
      }
    }
    return merged
  }

  // flipbook_textures.json: animated textures by their atlas tile, the higher pack winning
  flipbooks () {
    const byTile = new Map()
    for (const layer of this.jsonLayers('textures/flipbook_textures.json')) {
      for (const entry of layer) byTile.set(entry.atlas_tile, entry)
    }
    return [...byTile.values()]
  }

  // biomes_client.json: biomes merged, the higher pack winning
  biomesClient () {
    const merged = {}
    for (const layer of this.jsonLayers('biomes_client.json')) Object.assign(merged, layer.biomes)
    return { biomes: merged }
  }

  // the PBR layers the texture sets name (<name>.texture_set.json: metalness/emissive/roughness, normal and height
  // maps), which are no textures of their own: texture stems ('textures/blocks/stone_mers')
  pbrLayers () {
    const layers = new Set()
    for (const path of this.files.keys()) {
      if (!path.endsWith('.texture_set.json')) continue
      let set
      try { set = this.json(path)?.['minecraft:texture_set'] } catch { continue }
      if (!set) continue
      const dir = path.slice(0, path.lastIndexOf('/') + 1)
      for (const key of ['metalness_emissive_roughness', 'metalness_emissive_roughness_subsurface', 'normal', 'heightmap']) {
        const v = set[key]
        if (typeof v === 'string' && !v.startsWith('#')) layers.add((v.includes('/') ? v : dir + v).replace(TEXTURE_EXT, ''))
      }
    }
    return layers
  }

  // a texture path from the JSON files ('textures/blocks/stone', no extension) -> the file that holds it
  // (the highest pack that has it in any format wins: a newer pack's .png replaces an older .tga)
  resolveTexture (path) {
    // 0.15's packs name a texture by a resource id (block.grass.side) that resources.json maps to its file
    if (this.resourceIds === undefined) {
      this.resourceIds = new Map()
      for (const layer of this.jsonLayers('resources.json')) {
        for (const [id, file] of Object.entries(layer.resources?.textures ?? {})) this.resourceIds.set(id, file.replace(TEXTURE_EXT, ''))
      }
    }
    path = this.resourceIds.get(path) ?? path
    if (path?.startsWith('images/')) path = 'textures/' + path.slice('images/'.length) // 0.15's packs
    if (!this.textureStems) {
      this.textureStems = new Map()
      for (const { files } of this.layers) {
        for (const file of files.keys()) {
          const m = /^(textures\/.+)\.(png|tga|jpg)$/.exec(file)
          if (m) this.textureStems.set(m[1], file)
        }
      }
    }
    return this.textureStems.get(path) ?? (this.files.has(path) ? path : null)
  }

  // every texture image of the stack: stem ('textures/blocks/stone') -> file
  textureImages () {
    this.resolveTexture('')
    return this.textureStems
  }
}

module.exports = { PackStack, readPackDir, readPocketAtlases, clientPackStack, TEXTURE_EXT }
