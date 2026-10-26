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
    const want = { ...def.props }
    for (const [k, v] of Object.entries(props)) if (k in def.props) want[k] = v
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

  // layer 1: what the block stands in (water), which Bedrock keeps in a second layer of the sub chunk (1.16 on; the
  // older columns have one layer)
  set (x, y, z, stateId, layer = 0) {
    if (stateId === null || stateId === undefined) return
    if (layer && !this.mcData.blockStates) return
    const column = this.column(Math.floor(x / 16), Math.floor(z / 16))
    const pos = new Vec3(x & 15, y, z & 15)
    pos.l = layer
    column.setBlockStateId(pos, stateId)
  }

  // the block entity of a block, of tags { name: [nbt type, value] } (1.16 on: the older columns keep none)
  blockEntity (x, y, z, id, tags = {}) {
    const column = this.column(Math.floor(x / 16), Math.floor(z / 16))
    if (!column.addBlockEntity) return
    const value = { id: { type: 'string', value: id }, x: { type: 'int', value: x }, y: { type: 'int', value: y }, z: { type: 'int', value: z } }
    for (const [name, [type, v]] of Object.entries(tags)) value[name] = { type, value: v }
    column.addBlockEntity({ type: 'compound', name: '', value })
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
      // seagrass and kelp in the lake, standing in water (Bedrock's second block layer)
      const depth = sea - h
      const r = (x * 83492791 ^ z * 2971215073) >>> 0
      if (depth >= 2 && r % 5 === 0) {
        const kelp = r % 3 === 0 && depth >= 3
        const top = kelp ? sea - 1 : h + 1
        for (let y = h + 1; y <= top; y++) {
          world.set(x, y, z, kelp ? world.first(['kelp', { kelp_age: 0 }]) : world.first('seagrass'))
          world.set(x, y, z, water, 1)
        }
      }
      if (h > sea + 1) {
        const r = (x * 73856093 ^ z * 19349663) >>> 0
        if (r % 97 === 0 && x > 3 && z > 3 && x < size - 4 && z < size - 4) tree(world, x, h + 1, z, r % 2 ? log : birchLog, r % 2 ? leaves : birchLeaves)
        else if (r % 7 === 0) world.set(x, h + 1, z, shortGrass)
        else if (r % 23 === 0) world.set(x, h + 1, z, flowers[r % flowers.length])
      }
    }
  }
  // stairs on the shore, waterlogged where they stand in the lake
  const stairs = world.first(['oak_stairs', { weirdo_direction: 2 }])
  for (let x = 20; x < 28; x++) {
    const h = height(x, 12)
    world.set(x, h + 1, 12, stairs)
    if (h + 1 <= sea) world.set(x, h + 1, 12, water, 1)
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

// Blocks whose shape their neighbours decide: a fence pen with a gate, glass panes up to a glass block, iron bars in a
// T, a wall, and a ring of stairs whose corners turn. Their states are set as a server sends them: 1.26.50 on with
// their connections and corners, before with none (the viewer works those out from the neighbours).
function connected (world) {
  const stone = world.first('stone')
  for (let x = -1; x <= 14; x++) for (let z = -1; z <= 13; z++) world.set(x, 0, z, stone)
  const cells = new Map()
  const put = (x, z, kind, name, props = {}) => cells.set(x + ',' + z, { kind, name, props })
  const fence = world.has('oak_fence') ? ['oak_fence', {}] : ['fence', { wood_type: 'oak' }]
  for (let i = 0; i <= 4; i++) {
    for (const [x, z] of [[i, 0], [i, 4], [0, i], [4, i]]) put(x, z, 'fence', ...fence)
  }
  put(2, 0, 'gate', 'fence_gate', { direction: 0 })
  for (let x = 7; x <= 11; x++) put(x, 0, 'pane', 'glass_pane')
  cells.set('12,0', { kind: 'solid', name: 'glass', props: {} })
  for (let x = 7; x <= 11; x++) put(x, 2, 'pane', 'iron_bars')
  for (let z = 3; z <= 4; z++) put(9, z, 'pane', 'iron_bars')
  for (let x = 7; x <= 11; x++) put(x, 7, 'wall', 'cobblestone_wall', { wall_block_type: 'cobblestone' })
  // stairs round a square, each facing out: the corners turn outer
  const stairs = { north: 3, south: 2, west: 1, east: 0 }
  for (let i = 0; i <= 4; i++) {
    put(i, 7, 'stairs', 'oak_stairs', { weirdo_direction: stairs.north, upside_down_bit: 0 })
    put(i, 11, 'stairs', 'oak_stairs', { weirdo_direction: stairs.south, upside_down_bit: 0 })
  }
  for (let z = 8; z <= 10; z++) {
    put(0, z, 'stairs', 'oak_stairs', { weirdo_direction: stairs.west, upside_down_bit: 0 })
    put(4, z, 'stairs', 'oak_stairs', { weirdo_direction: stairs.east, upside_down_bit: 0 })
  }
  const at = (x, z) => cells.get(x + ',' + z)
  const sides = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] }
  // a stair's corner, as the client works it out: outer where the stair in front of it turns across it, inner where
  // the one behind does
  const facings = ['east', 'west', 'south', 'north']
  const opposite = { north: 'south', south: 'north', east: 'west', west: 'east' }
  const ccw = { north: 'west', west: 'south', south: 'east', east: 'north' }
  const axis = side => side === 'north' || side === 'south' ? 'z' : 'x'
  const stairAt = (x, z) => at(x, z)?.kind === 'stairs' ? facings[at(x, z).props.weirdo_direction] : null
  const corner = (x, z) => {
    const facing = stairAt(x, z)
    const toward = side => stairAt(x + sides[side][0], z + sides[side][1])
    const front = toward(facing)
    if (front && axis(front) !== axis(facing) && toward(opposite[front]) !== facing) return front === ccw[facing] ? 'outer_left' : 'outer_right'
    const back = toward(opposite[facing])
    if (back && axis(back) !== axis(facing) && toward(back) !== facing) return back === ccw[facing] ? 'inner_left' : 'inner_right'
    return 'none'
  }
  for (const [key, cell] of cells) {
    const [x, z] = key.split(',').map(Number)
    const props = { ...cell.props }
    const states = world.statesByName.get(cell.name)?.[0]?.props ?? {}
    for (const [side, [dx, dz]] of Object.entries(sides)) {
      const other = at(x + dx, z + dz)
      const joins = !!other && (other.kind === cell.kind || other.kind === 'solid' || (cell.kind === 'fence' && other.kind === 'gate'))
      if ('minecraft:connection_' + side in states) props['minecraft:connection_' + side] = joins ? 1 : 0
      if (cell.kind === 'wall') props['wall_connection_type_' + side] = joins ? 'short' : 'none'
    }
    if (cell.kind === 'wall') props.wall_post_bit = x === 7 || x === 11 ? 1 : 0
    if (cell.kind === 'stairs' && 'minecraft:corner' in states) props['minecraft:corner'] = corner(x, z)
    world.set(x, 1, z, world.state(cell.name, props))
  }
  return { center: new Vec3(6, 1, 6), radius: 16 }
}

// Blocks the client draws with block entity renderers, in place, with the block entities a server sends of them: beds
// of five colours, chests, heads on the floor turned by their Rotation and on a wall, signs standing and on a wall,
// hanging signs on a wall and under a beam, banners standing and on a wall, a decorated pot and copper golem statues.
// (A sign's text, a banner's colours, a pot's sherds and a statue's pose are block entity data the assets do not draw.)
function blockEntities (world) {
  const stone = world.first('stone')
  const planks = world.first('planks', 'oak_planks')
  for (let x = -1; x <= 17; x++) for (let z = -1; z <= 13; z++) world.set(x, 0, z, stone)
  // a wall along z = 6, three high, to hang things on (its south face)
  for (let x = 0; x <= 15; x++) for (let y = 1; y <= 3; y++) world.set(x, y, 6, planks)
  // beds with their heads to the north (direction 2), the foot at z = 4, the head at z = 3: red (the default), white,
  // blue, lime, black
  ;[14, 0, 11, 5, 15].forEach((color, i) => {
    for (const head of [0, 1]) {
      world.set(i, 1, 4 - head, world.state('bed', { direction: 2, head_piece_bit: head }))
      world.blockEntity(i, 1, 4 - head, 'Bed', { color: ['byte', color] })
    }
  })
  const facing = (name, side) => world.state(name, { 'minecraft:cardinal_direction': side, facing_direction: { north: 2, south: 3, west: 4, east: 5 }[side] })
  world.set(6, 1, 4, facing('chest', 'south'))
  world.set(7, 1, 4, facing('trapped_chest', 'south'))
  world.set(8, 1, 4, facing('ender_chest', 'south'))
  // heads: on the floor turned by their Rotation (degrees, 0 facing south), and on the wall's south face (facing
  // south, away from the wall). Before 1.21.40 a head is one skull block of the type its block entity says.
  const types = ['skeleton_skull', 'wither_skeleton_skull', 'zombie_head', 'player_head', 'creeper_head', 'dragon_head', 'piglin_head']
  const flattened = world.has('skeleton_skull')
  types.forEach((name, type) => {
    if (flattened && !world.has(name)) return
    const block = flattened ? name : 'skull'
    const [x, z] = [10 + type % 4, 2 + Math.floor(type / 4) * 2]
    world.set(x, 1, z, world.state(block, { facing_direction: 1 }))
    world.blockEntity(x, 1, z, 'Skull', { SkullType: ['byte', type], Rotation: ['float', type * 45] })
    world.set(5 + type, 2, 7, world.state(block, { facing_direction: 3 }))
    world.blockEntity(5 + type, 2, 7, 'Skull', { SkullType: ['byte', type], Rotation: ['float', 0] })
  })
  // signs standing in four directions, and on the wall's south face
  const standing = ['standing_sign', 'spruce_standing_sign', 'birch_standing_sign', 'darkoak_standing_sign']
  standing.forEach((name, i) => world.set(1 + i * 2, 1, 9, world.state(name, { ground_sign_direction: i * 2 })))
  ;['wall_sign', 'spruce_wall_sign', 'birch_wall_sign'].forEach((name, i) => world.set(i, 2, 7, world.state(name, { facing_direction: 3 })))
  // banners standing in three directions, and on the wall's south face, hanging into the block below
  ;[0, 2, 4].forEach((direction, i) => world.set(1 + i * 2, 1, 12, world.state('standing_banner', { ground_sign_direction: direction })))
  ;[13, 15].forEach(x => world.set(x, 3, 7, world.state('wall_banner', { facing_direction: 3 })))
  // hanging signs: on the end of the wall (their plank against it), and under a beam on chains in a V and straight
  world.set(16, 2, 6, world.state('oak_hanging_sign', { hanging: 0, facing_direction: 3 }))
  for (let x = 9; x <= 15; x++) world.set(x, 4, 10, planks)
  world.set(10, 3, 10, world.state('oak_hanging_sign', { hanging: 1, attached_bit: 0, facing_direction: 3 }))
  world.set(12, 3, 10, world.state('cherry_hanging_sign', { hanging: 1, attached_bit: 1, ground_sign_direction: 0 }))
  world.set(14, 3, 10, world.state('bamboo_hanging_sign', { hanging: 1, attached_bit: 1, ground_sign_direction: 2 }))
  // a decorated pot, and copper golem statues facing south
  world.set(9, 1, 12, world.state('decorated_pot'))
  ;['copper_golem_statue', 'exposed_copper_golem_statue', 'oxidized_copper_golem_statue'].forEach((name, i) =>
    world.set(11 + i * 2, 1, 12, world.state(name, { 'minecraft:cardinal_direction': 'south' })))
  return { center: new Vec3(8, 2, 7), radius: 14, camera: { x: 8, y: 9, z: 22 } }
}

// Chests and doors as a server sends them and changes them, every few seconds (toggles: the server opens and shuts
// them): chests single and double (a pair: each half's block entity names the other, pairx and pairz) in each
// direction, a trapped, an ender and a copper chest, their lids opened and shut by block events; doors in each
// direction with each hinge, as the game keeps them (the lower half holds the direction and openness, the upper half
// the hinge), opened and shut by block updates of their lower halves; and a barrel, opened and shut
function containers (world) {
  const stone = world.first('stone')
  for (let x = -1; x <= 22; x++) for (let z = -1; z <= 14; z++) world.set(x, 0, z, stone)
  const SIDES = ['north', 'east', 'south', 'west']
  const facing = (name, side, props = {}) => world.state(name, { ...props, 'minecraft:cardinal_direction': side, facing_direction: { north: 2, south: 3, west: 4, east: 5 }[side] })
  const lids = []
  const blocks = []
  // single chests facing each way, and a trapped, an ender and a copper chest
  SIDES.forEach((side, i) => {
    world.set(1 + i * 2, 1, 1, facing('chest', side))
    lids.push({ x: 1 + i * 2, y: 1, z: 1 })
  })
  ;['trapped_chest', 'ender_chest', 'copper_chest'].forEach((name, i) => {
    if (!world.has(name)) return
    world.set(10 + i * 2, 1, 1, facing(name, 'south'))
    lids.push({ x: 10 + i * 2, y: 1, z: 1 })
  })
  // double chests facing each way (a pair side by side across its facing), and a trapped and a copper one
  const pair = (name, side, [x, z]) => {
    const [dx, dz] = side === 'north' || side === 'south' ? [1, 0] : [0, 1]
    for (const [i, [px, pz], [ox, oz]] of [[0, [x, z], [x + dx, z + dz]], [1, [x + dx, z + dz], [x, z]]]) {
      world.set(px, 1, pz, facing(name, side))
      world.blockEntity(px, 1, pz, 'Chest', { pairx: ['int', ox], pairz: ['int', oz], pairlead: ['byte', i === 0 ? 1 : 0] })
    }
    // (the lid event for the half it was opened by: the other half follows)
    lids.push({ x, y: 1, z })
  }
  SIDES.forEach((side, i) => pair('chest', side, [1 + i * 3, 4]))
  pair('trapped_chest', 'south', [14, 4])
  if (world.has('copper_chest')) pair('copper_chest', 'south', [17, 4])
  // doors: each direction with the hinge left and right, as the game keeps a door: its lower half's direction and
  // openness, its upper half's hinge (the rest of each half's states as a fresh one has them)
  const doorName = ['wooden_door', 'door'].find(n => world.has(n))
  const door = (x, z, side, hinge) => {
    const direction = { east: 0, south: 1, west: 2, north: 3 }[side]
    const cardinal = { east: 'south', south: 'west', west: 'north', north: 'east' }[side]
    const lower = open => world.state(doorName, { direction, 'minecraft:cardinal_direction': cardinal, open_bit: open, upper_block_bit: 0, door_hinge_bit: 0 })
    world.set(x, 1, z, lower(0))
    // (before 1.2 the upper half's hinge is the low bit of its data, which its states read as its direction)
    world.set(x, 2, z, world.state(doorName, world.mcData.blockStates ? { upper_block_bit: 1, door_hinge_bit: hinge, open_bit: 0 } : { upper_block_bit: 1, open_bit: 0, direction: hinge }))
    blocks.push({ pos: { x, y: 1, z }, states: [lower(0), lower(1)] })
  }
  if (doorName) SIDES.forEach((side, i) => [0, 1].forEach(hinge => door(1 + i * 4 + hinge * 2, 8, side, hinge)))
  // a barrel facing up
  if (world.has('barrel')) {
    const barrel = open => world.state('barrel', { facing_direction: 1, open_bit: open })
    world.set(18, 1, 8, barrel(0))
    blocks.push({ pos: { x: 18, y: 1, z: 8 }, states: [barrel(0), barrel(1)] })
  }
  return { center: new Vec3(10, 1, 5), radius: 14, camera: { x: 10, y: 8, z: 18 }, toggles: { every: 3, lids, blocks } }
}

// Redstone dust as its neighbours connect it: a line powered from a lever and fading along its length, a corner, a T
// and a cross, a lone dust, dust stepping up a block and down from it, and dust running into a repeater's back and a
// torch
function redstone (world) {
  const stone = world.first('stone')
  for (let x = -1; x <= 14; x++) for (let z = -1; z <= 12; z++) world.set(x, 0, z, stone)
  const dust = (x, y, z, signal = 0) => world.set(x, y, z, world.state('redstone_wire', { redstone_signal: signal }))
  // a lever and a line of dust fading from 15 along x
  world.set(0, 1, 1, world.first(['lever', { lever_direction: 'up_north_south', open_bit: 1 }], 'lever'))
  for (let x = 1; x <= 12; x++) dust(x, 1, 1, 16 - x)
  // a corner, a T and a cross
  dust(1, 1, 4, 9); dust(2, 1, 4, 9); dust(1, 1, 5, 9)
  dust(5, 1, 4, 9); dust(6, 1, 4, 9); dust(7, 1, 4, 9); dust(6, 1, 5, 9)
  dust(10, 1, 4, 9); dust(9, 1, 5, 9); dust(10, 1, 5, 9); dust(11, 1, 5, 9); dust(10, 1, 6, 9)
  // a lone dust
  dust(13, 1, 4)
  // up a block and down its far side
  dust(1, 1, 8, 12); dust(2, 1, 8, 12); world.set(3, 1, 8, stone); dust(3, 2, 8, 12); dust(4, 1, 8, 12); dust(5, 1, 8, 12)
  // into the back of a repeater (facing east: direction 3) and on to a lamp, and from a torch
  dust(7, 1, 8, 15); dust(8, 1, 8, 15)
  world.set(9, 1, 8, world.first(['powered_repeater', { direction: 3, 'minecraft:cardinal_direction': 'east' }], ['unpowered_repeater', { direction: 3, 'minecraft:cardinal_direction': 'east' }]))
  world.set(10, 1, 8, world.first('lit_redstone_lamp', 'redstone_lamp'))
  world.set(7, 1, 11, world.first(['redstone_torch', { torch_facing_direction: 'top' }], 'redstone_torch'))
  dust(8, 1, 11, 15); dust(9, 1, 11, 14); dust(9, 1, 10, 13)
  return { center: new Vec3(6, 1, 6), radius: 10, camera: { x: 6, y: 10, z: 16 } }
}

// Entities, drawn and animated as the game draws them, from the version's own client entities: a crowd of mobs facing
// south, flyers over them (an allay, a parrot, a phantom, a ghast, the ender dragon); a zombie in iron armor holding a
// sword walking to and fro; players in armor holding items, one in a skin a Bedrock server would send; items dropped on
// the ground; and particle effects (a Bedrock version's own) above them.
function entityScene (world) {
  const grass = world.first('grass_block', 'grass')
  for (let x = -2; x <= 24; x++) for (let z = -2; z <= 16; z++) world.set(x, 0, z, grass)
  const size = name => world.mcData.entitiesByName?.[name] ?? { width: 0.6, height: 1.8 }
  const entities = []
  const add = e => entities.push({ id: entities.length + 1, yaw: Math.PI, width: size(e.name).width, height: size(e.name).height, ...e })
  const mobs = ['zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'pig', 'cow', 'sheep', 'chicken', 'wolf', 'horse',
    'villager_v2', 'iron_golem', 'slime', 'cat', 'fox', 'bee', 'axolotl', 'piglin', 'pillager', 'warden', 'witch']
  mobs.forEach((name, i) => add({ name, pos: { x: 1 + (i % 11) * 2, y: 1, z: 2 + Math.floor(i / 11) * 3 } }))
  const skeleton = entities.find(e => e.name === 'skeleton')
  skeleton.equipment = ['bow', null, null, null, null, 'golden_helmet']
  // a zombie walking along x, to and fro, its armor and sword moving with its limbs
  add({ name: 'zombie', pos: { x: 4, y: 1, z: 8 }, walk: { from: 4, to: 14 }, equipment: ['iron_sword', null, 'iron_boots', 'iron_leggings', 'iron_chestplate', 'iron_helmet'] })
  // players: Steve in diamond, Alex (slim) in netherite with a bow, and one in a skin of pixels
  add({ name: 'player', username: 'Steve', pos: { x: 3, y: 1, z: 11 }, equipment: ['diamond_sword', 'shield', 'diamond_boots', 'diamond_leggings', 'diamond_chestplate', 'diamond_helmet'] })
  add({ name: 'player', username: 'Alex', skinModel: 'slim', pos: { x: 6, y: 1, z: 11 }, equipment: ['bow', null, 'netherite_boots', 'netherite_leggings', 'netherite_chestplate', 'netherite_helmet'] })
  add({ name: 'player', username: 'Pixels', skinPixels: true, pos: { x: 9, y: 1, z: 11 }, equipment: ['golden_axe', null, 'leather_boots', null, 'chainmail_chestplate', 'turtle_helmet'] })
  // flying: an allay, a parrot, a phantom, a ghast, and the ender dragon high over the scene, their wings and tails as
  // their animations move them
  ;[['allay', 2, 3, 13], ['parrot', 4, 3, 13], ['phantom', 7, 4, 14], ['ghast', 20, 7, 12], ['ender_dragon', 11, 14, -10]].forEach(([name, x, y, z]) => add({ name, pos: { x, y, z } }))
  // items on the ground
  const dropped = ['diamond', 'apple', 'iron_sword', 'bow', 'redstone', 'egg', 'cake', 'grass_block', 'oak_log', 'torch']
  dropped.forEach((itemName, i) => add({ name: 'item', itemName, pos: { x: 12 + (i % 5), y: 1, z: 11 + Math.floor(i / 5) * 2 } }))
  // particle effects, every second: a torch's flame and smoke, a campfire's smoke...
  world.set(19, 1, 11, world.first(['torch', { torch_facing_direction: 'top' }], 'torch'))
  world.set(21, 1, 11, world.first('campfire'))
  const at = (x, z, y = 2.5) => ({ x: x + 0.5, y, z: z + 0.5 })
  const particles = [
    { name: 'minecraft:heart_particle', pos: at(11, 2), count: 3 },
    { name: 'minecraft:villager_happy', pos: at(1, 5), count: 5 },
    { name: 'minecraft:villager_angry', pos: at(17, 5), count: 1 },
    { name: 'minecraft:note_particle', pos: at(13, 2), count: 1 },
    { name: 'minecraft:basic_flame_particle', pos: at(19, 11, 1.72), count: 2 },
    { name: 'minecraft:basic_smoke_particle', pos: at(19, 11, 1.85), count: 2 },
    { name: 'minecraft:campfire_smoke_particle', pos: at(21, 11, 1.4), count: 2 },
    { name: 'minecraft:critical_hit_emitter', pos: at(4, 8, 1.5) },
    { name: 'minecraft:redstone_wire_dust_particle', pos: at(19, 13, 1.1), count: 5 },
    { name: 'minecraft:portal_directional', pos: at(21, 13, 1.5), count: 10 },
    { name: 'minecraft:totem_particle', pos: at(23, 8, 2) },
    { name: 'minecraft:huge_explosion_emitter', pos: at(22, 2, 4), every: 4 }
  ]
  return { center: new Vec3(11, 2, 6), radius: 16, camera: { x: 11, y: 9, z: 24 }, entities, particles }
}

const SCENES = {
  landscape: { title: 'Landscape', build: landscape },
  gallery: { title: 'Every block', build: gallery },
  states: { title: 'Every state of (regex)', build: states },
  connected: { title: 'Fences, panes, walls, stairs', build: connected },
  blockEntities: { title: 'Block entities: beds, heads, signs, banners', build: blockEntities },
  containers: { title: 'Chests and doors, opening and shutting', build: containers },
  redstone: { title: 'Redstone dust', build: redstone },
  entities: { title: 'Entities, armor, held and dropped items, particles', build: entityScene },
  bedrockOnly: { title: 'Bedrock-only blocks', build: bedrockOnly }
}

function buildScene (version, scene, filter) {
  const world = new SceneWorld(version)
  const { center, radius, camera, entities = [], particles = [], toggles = null } = SCENES[scene].build(world, filter)
  return { world, center, radius, camera, entities, particles, toggles }
}

module.exports = { buildScene, SCENES: Object.entries(SCENES).map(([name, s]) => ({ name, title: s.title })), SceneWorld }
