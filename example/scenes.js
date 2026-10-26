// The scenes the example draws, built as Bedrock chunk columns (prismarine-chunk) of one Bedrock version, from that
// version's own block states (minecraft-data).
const { Vec3 } = require('vec3')

class SceneWorld {
  constructor (version) {
    this.version = version
    this.mcData = require('minecraft-data')(version)
    this.Chunk = require('prismarine-chunk')(version)
    this.columns = new Map()
    this.statesByName = new Map()
    if (this.mcData.blockStates) {
      this.mcData.blockStates.forEach((s, stateId) => {
        if (!this.statesByName.has(s.name)) this.statesByName.set(s.name, [])
        const props = Object.fromEntries(Object.entries(s.states ?? {}).map(([k, v]) => [k, v.value]))
        this.statesByName.get(s.name).push({ stateId, props })
      })
    } else {
      // 0.14 - 1.0: a block's states are its data values, the Bedrock states minecraft-data's legacy table names
      const legacy = require('minecraft-data').legacy.bedrock.blocks
      for (const block of this.mcData.blocksArray) {
        const list = []
        for (let data = 0; data < 16; data++) {
          const entry = legacy[`${block.id}:${data}`]
          if (!entry && data > 0) continue
          const props = Object.fromEntries((/\[(.*)\]$/.exec(entry ?? '')?.[1]?.split(',') ?? []).map(p => p.split('=')))
          list.push({ stateId: (block.id << 4) | data, props })
        }
        if (!this.statesByName.has(block.name)) this.statesByName.set(block.name, list)
      }
    }
    this.plains = this.mcData.biomesByName?.plains?.id ?? 1
  }

  has (name) {
    return !!this.mcData.blocksByName[name]
  }

  // the state id of a block with some of its properties (the rest as its default state has them); null if unknown
  state (name, props = {}) {
    const block = this.mcData.blocksByName[name]
    if (!block) return null
    const states = this.statesByName.get(name) ?? []
    const def = states.find(s => s.stateId === block.defaultState) ?? states[0]
    if (!def) return block.defaultState ?? (block.id << 4)
    const want = { ...def.props, ...props }
    const found = states.find(s => Object.entries(want).every(([k, v]) => String(s.props[k]) === String(v)))
    return (found ?? def).stateId
  }

  // the first of several (name, props) that the version has
  first (...candidates) {
    for (const c of candidates) {
      const [name, props] = Array.isArray(c) ? c : [c, {}]
      const id = this.state(name, props)
      if (id !== null) return id
    }
    return null
  }

  column (cx, cz) {
    const key = cx + ',' + cz
    if (!this.columns.has(key)) {
      const column = new this.Chunk({ x: cx, z: cz })
      // (0.14 - 1.0 columns keep no coordinates of their own)
      column.x = cx
      column.z = cz
      // plains, so that grass and leaves take its colours (a biome per column before 1.18)
      const p = new Vec3(0, 0, 0)
      if (column.setBiomeId) {
        for (p.y = -1; p.y < 40; p.y++) {
          for (p.x = 0; p.x < 16; p.x++) for (p.z = 0; p.z < 16; p.z++) column.setBiomeId(p, this.plains)
        }
      } else if (column.setBiome) {
        for (p.x = 0; p.x < 16; p.x++) for (p.z = 0; p.z < 16; p.z++) column.setBiome(p, this.plains)
      }
      this.columns.set(key, column)
    }
    return this.columns.get(key)
  }

  set (x, y, z, stateId) {
    if (stateId === null || stateId === undefined) return
    const column = this.column(Math.floor(x / 16), Math.floor(z / 16))
    column.setBlockStateId(new Vec3(x & 15, y, z & 15), stateId)
  }
}

// every block of the version in its default state, on a grass floor
function gallery (world) {
  const skip = /^(air|.*_air|structure_void|light_block.*|moving_block|piston_arm_collision|sticky_piston_arm_collision|unknown|client_request_placeholder_block)$/
  const names = Object.keys(world.mcData.blocksByName).filter(n => !skip.test(n)).sort()
  const width = Math.ceil(Math.sqrt(names.length))
  const floor = world.first('grass_block', 'grass')
  const stone = world.first('stone')
  for (let x = -1; x <= width * 2; x++) {
    for (let z = -1; z <= width * 2; z++) world.set(x, 0, z, (x + z) % 2 ? floor : stone)
  }
  names.forEach((name, i) => world.set((i % width) * 2, 1, Math.floor(i / width) * 2, world.state(name)))
  return { center: new Vec3(width, 1, width), radius: width * 2 }
}

// every state of the blocks whose names match: a row a block, its states along x
function states (world, filter) {
  const re = new RegExp(filter || 'stairs$|_wall$|fence|rail$|torch$|door$|^lantern$|redstone_wire|_glass_pane$')
  const names = [...world.statesByName.keys()].filter(n => re.test(n)).sort().slice(0, 64)
  const stone = world.first('stone')
  const perRow = 32
  let z = 0
  let width = 0
  for (const name of names) {
    const list = world.statesByName.get(name).slice(0, perRow * 4)
    list.forEach((s, i) => {
      // each row centred on x = 0
      const inRow = Math.min(perRow, list.length - Math.floor(i / perRow) * perRow)
      const x = (i % perRow) * 2 - (inRow - 1)
      const row = z + Math.floor(i / perRow) * 2
      world.set(x, 0, row, stone)
      world.set(x, 1, row, s.stateId)
      width = Math.max(width, Math.abs(x) * 2 + 1)
    })
    z += Math.ceil(list.length / perRow) * 2 + 1
  }
  return { center: new Vec3(0, 1, z / 2), radius: Math.max(width, z) }
}

// a small valley: grass hills, a lake fed by flowing water, sand, trees, flowers and tall grass
function landscape (world) {
  const size = 48
  const sea = 6
  const grass = world.first('grass_block', 'grass')
  const dirt = world.first('dirt')
  const stone = world.first('stone')
  const sand = world.first('sand')
  const water = world.first(['water', { liquid_depth: 0 }])
  const log = world.first(['oak_log', { pillar_axis: 'y' }], ['log', { old_log_type: 'oak', pillar_axis: 'y' }], ['wood', { old_log_type: 'oak', pillar_axis: 'y' }])
  const leaves = world.first('oak_leaves', ['leaves', { old_leaf_type: 'oak' }])
  const birchLog = world.first(['birch_log', { pillar_axis: 'y' }], ['log', { old_log_type: 'birch', pillar_axis: 'y' }], ['wood', { old_log_type: 'birch', pillar_axis: 'y' }])
  const birchLeaves = world.first('birch_leaves', ['leaves', { old_leaf_type: 'birch' }])
  const shortGrass = world.first('short_grass', ['tallgrass', { tall_grass_type: 'tall' }], ['tall_grass', { tall_grass_type: 'tall' }])
  const flowers = [world.first('poppy', ['red_flower', { flower_type: 'poppy' }], ['flower', { flower_type: 'poppy' }]), world.first('dandelion', 'yellow_flower'),
    world.first('cornflower', ['red_flower', { flower_type: 'cornflower' }], ['flower', { flower_type: 'tulip_red' }])]
  const height = (x, z) => Math.round(7 + 3 * Math.sin(x / 7) + 3 * Math.cos(z / 9) - 4 * Math.exp(-((x - 24) ** 2 + (z - 24) ** 2) / 90))
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      const h = height(x, z)
      for (let y = 0; y < h - 3; y++) world.set(x, y, z, stone)
      for (let y = Math.max(0, h - 3); y < h; y++) world.set(x, y, z, dirt)
      world.set(x, h, z, h <= sea ? sand : grass)
      for (let y = h + 1; y <= sea; y++) world.set(x, y, z, water)
      if (h > sea + 1) {
        const r = (x * 73856093 ^ z * 19349663) >>> 0
        if (r % 97 === 0 && x > 3 && z > 3 && x < size - 4 && z < size - 4) tree(world, x, h + 1, z, r % 2 ? log : birchLog, r % 2 ? leaves : birchLeaves)
        else if (r % 7 === 0) world.set(x, h + 1, z, shortGrass)
        else if (r % 23 === 0) world.set(x, h + 1, z, flowers[r % flowers.length])
      }
    }
  }
  // a spring on a pillar: a source, and flowing water down its sides
  const top = height(10, 38) + 4
  for (let y = 0; y < top; y++) world.set(10, y, 38, stone)
  world.set(10, top, 38, water)
  for (let d = 1; d <= 3; d++) world.set(10 + d, top - d + 1, 38, world.first(['flowing_water', { liquid_depth: d * 2 }]))
  return { center: new Vec3(size / 2, 10, size / 2), radius: size }
}

function tree (world, x, y, z, log, leaves) {
  for (let dy = 0; dy < 5; dy++) world.set(x, y + dy, z, log)
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dy = 3; dy <= 5; dy++) {
        if (Math.abs(dx) + Math.abs(dz) > (dy === 5 ? 1 : 3) || (dx === 0 && dz === 0 && dy < 5)) continue
        world.set(x + dx, y + dy, z + dz, leaves)
      }
    }
  }
}

// the blocks only Bedrock has: Education Edition's elements and chemistry, cameras, border, allow and deny, the nether
// reactor and glowing obsidian, coloured torches, hard glass
function bedrockOnly (world) {
  const re = /^(element_\d+|chemistry_table|compound_creator|element_constructor|lab_table|material_reducer|chemical_heat|camera|border_block|allow|deny|netherreactor|glowingobsidian|colored_torch_\w+|underwater_torch|hard_\w*glass\w*|info_update2?|reserved6|glow_stick|underwater_tnt|frame|glow_frame)$/
  const names = Object.keys(world.mcData.blocksByName).filter(n => re.test(n)).sort()
  const width = Math.ceil(Math.sqrt(names.length))
  const stone = world.first('stone')
  for (let x = -1; x <= width * 2; x++) for (let z = -1; z <= width * 2; z++) world.set(x, 0, z, stone)
  names.forEach((name, i) => world.set((i % width) * 2, 1, Math.floor(i / width) * 2, world.state(name)))
  return { center: new Vec3(width, 1, width), radius: width * 2 }
}

const SCENES = {
  landscape: { title: 'Landscape', build: landscape },
  gallery: { title: 'Every block', build: gallery },
  states: { title: 'Every state of (regex)', build: states },
  bedrockOnly: { title: 'Bedrock-only blocks', build: bedrockOnly }
}

function buildScene (version, scene, filter) {
  const world = new SceneWorld(version)
  const { center, radius, camera } = SCENES[scene].build(world, filter)
  return { world, center, radius, camera }
}

module.exports = { buildScene, SCENES: Object.entries(SCENES).map(([name, s]) => ({ name, title: s.title })), SceneWorld }
