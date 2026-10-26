// The showcase's world: nine biomes round a village, each with its own ground, plants and a place of its own; a river
// from a waterfall in the mountains, under the village's bridge, into a lake. Built of a version's own blocks (each by
// its name in that version, or the nearest it has), and the version's biomes, so that grass, leaves and water take
// their colours.
const SIZE = 176
const SEA = 11 // the water's surface
const GROUND = 13 // the village's ground (its top block)
const VILLAGE = { x: 88, z: 88 }

// value noise in [0, 1), smooth at the scale given
function hash (x, z, seed) {
  let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 982451653)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
function noise (x, z, scale, seed) {
  const fx = x / scale
  const fz = z / scale
  const x0 = Math.floor(fx)
  const z0 = Math.floor(fz)
  const s = t => t * t * (3 - 2 * t)
  const tx = s(fx - x0)
  const tz = s(fz - z0)
  const a = hash(x0, z0, seed) + (hash(x0 + 1, z0, seed) - hash(x0, z0, seed)) * tx
  const b = hash(x0, z0 + 1, seed) + (hash(x0 + 1, z0 + 1, seed) - hash(x0, z0 + 1, seed)) * tx
  return a + (b - a) * tz
}
const fbm = (x, z, seed = 1) => noise(x, z, 24, seed) * 0.6 + noise(x, z, 11, seed + 1) * 0.3 + noise(x, z, 5, seed + 2) * 0.1
const smoothstep = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t) }

// The blocks, by their names across versions (the first the version has; null for none). The last candidates are
// 0.14 - 1.0's names (minecraft-data's: wood_planks, stone_brick, tall_grass, ...)
function palette (world) {
  const f = (...candidates) => world.first(...candidates.filter(Boolean))
  const log = (wood, legacy, axis = 'y') => f([wood + '_log', { pillar_axis: axis }],
    legacy && ['log', { old_log_type: legacy, pillar_axis: axis }], legacy && ['wood', { old_log_type: legacy, pillar_axis: axis }])
  const leaves = (wood, legacy) => f(wood + '_leaves', legacy && ['leaves', { old_leaf_type: legacy }])
  const planks = wood => f(wood + '_planks', ['planks', { wood_type: wood }], ['wood_planks', { wood_type: wood }])
  const colored = (kind, ...legacy) => color => f(`${color}_${kind}`, ...legacy.map(name => [name, { color: color === 'light_gray' ? 'silver' : color }]))
  const P = {
    air: f('air'),
    grass: f('grass_block', 'grass'),
    dirt: f(['dirt', { dirt_type: 'normal' }]),
    coarse: f('coarse_dirt', ['dirt', { dirt_type: 'coarse' }]),
    podzol: f('podzol'),
    path: f('grass_path', 'dirt_path'),
    farmland: f(['farmland', { moisturized_amount: 7 }]),
    stone: f('stone'),
    andesite: f('andesite', ['stone', { stone_type: 'andesite' }]),
    cobble: f('cobblestone'),
    mossy: f('mossy_cobblestone', 'moss_stone'),
    stoneBricks: f('stone_bricks', ['stonebrick', { stone_brick_type: 'default' }], ['stone_brick', { stone_brick_type: 'default' }]),
    mossyBricks: f('mossy_stone_bricks', ['stonebrick', { stone_brick_type: 'mossy' }], ['stone_brick', { stone_brick_type: 'mossy' }]),
    chiseledBricks: f('chiseled_stone_bricks', ['stonebrick', { stone_brick_type: 'chiseled' }], ['stone_brick', { stone_brick_type: 'chiseled' }]),
    gravel: f('gravel'),
    sand: f(['sand', { sand_type: 'normal' }]),
    redSand: f('red_sand', ['sand', { sand_type: 'red' }]),
    sandstone: f(['sandstone', { sand_stone_type: 'default' }]),
    cutSandstone: f('cut_sandstone', ['sandstone', { sand_stone_type: 'cut' }]),
    chiseledSandstone: f('chiseled_sandstone', ['sandstone', { sand_stone_type: 'heiroglyphs' }]),
    smoothSandstone: f('smooth_sandstone', ['sandstone', { sand_stone_type: 'smooth' }]),
    clay: f('clay'),
    snow: f('snow'),
    snowLayer: f(['snow_layer', { height: 0 }], ['top_snow', { height: 0 }]),
    ice: f('ice'),
    packedIce: f('packed_ice'),
    water: f(['water', { liquid_depth: 0 }]),
    falling: f(['flowing_water', { liquid_depth: 8 }]),
    lava: f(['lava', { liquid_depth: 0 }]),
    obsidian: f('obsidian'),
    cryingObsidian: f('crying_obsidian', 'obsidian'),
    netherrack: f('netherrack'),
    magma: f('magma', 'netherrack'),
    portal: f(['portal', { portal_axis: 'x' }]),
    goldBlock: f('gold_block', 'block_of_gold'),
    coalOre: f('coal_ore'),
    ironOre: f('iron_ore'),
    goldOre: f('gold_ore'),
    terracotta: f('hardened_clay', 'terracotta'),
    stained: colored('terracotta', 'stained_hardened_clay', 'stained_clay'),
    wool: colored('wool', 'wool'),
    carpet: colored('carpet', 'carpet'),
    oakLog: log('oak', 'oak'),
    oakLogX: log('oak', 'oak', 'x'),
    oakLogZ: log('oak', 'oak', 'z'),
    spruceLog: log('spruce', 'spruce'),
    birchLog: log('birch', 'birch'),
    jungleLog: log('jungle', 'jungle'),
    darkLog: f(['dark_oak_log', { pillar_axis: 'y' }], ['log2', { new_log_type: 'dark_oak', pillar_axis: 'y' }],
      ['acacia_wood', { new_log_type: 'dark_oak', pillar_axis: 'y' }]),
    cherryLog: f(['cherry_log', { pillar_axis: 'y' }]),
    oakLeaves: leaves('oak', 'oak'),
    spruceLeaves: leaves('spruce', 'spruce'),
    birchLeaves: leaves('birch', 'birch'),
    jungleLeaves: leaves('jungle', 'jungle'),
    darkLeaves: f('dark_oak_leaves', ['leaves2', { new_leaf_type: 'dark_oak' }], ['acacia_leaves', { new_leaf_type: 'dark_oak' }]),
    cherryLeaves: f('cherry_leaves'),
    oakPlanks: planks('oak'),
    sprucePlanks: planks('spruce'),
    darkPlanks: planks('dark_oak'),
    oakFence: f('oak_fence', ['fence', { wood_type: 'oak' }]),
    spruceFence: f('spruce_fence', ['fence', { wood_type: 'spruce' }]),
    darkFence: f('dark_oak_fence', ['fence', { wood_type: 'dark_oak' }]),
    glass: f('glass'),
    pane: f('glass_pane'),
    ironBars: f('iron_bars'),
    torch: f(['torch', { torch_facing_direction: 'top' }]),
    lantern: f('lantern', ['torch', { torch_facing_direction: 'top' }]),
    campfire: f('campfire', 'netherrack'),
    craftingTable: f('crafting_table'),
    furnace: f(['lit_furnace', { 'minecraft:cardinal_direction': 'south', facing_direction: 3 }], ['furnace', { facing_direction: 3 }]),
    anvil: f(['anvil', { 'minecraft:cardinal_direction': 'north', direction: 0 }]),
    barrel: f(['barrel', { facing_direction: 1 }]),
    composter: f('composter'),
    hay: f(['hay_block', { pillar_axis: 'y' }], ['hay_bale', { pillar_axis: 'y' }]),
    bookshelf: f('bookshelf'),
    cauldron: f(['cauldron', { fill_level: 6, cauldron_liquid: 'water' }]),
    flowerPot: f('flower_pot'),
    pumpkin: f(['pumpkin', { 'minecraft:cardinal_direction': 'south', direction: 0 }]),
    jackOLantern: f(['lit_pumpkin', { 'minecraft:cardinal_direction': 'south', direction: 0 }], ["jack_o'lantern", { direction: 0 }], 'pumpkin'),
    melon: f('melon_block', 'melon'),
    beeNest: f(['bee_nest', { direction: 0 }]),
    tnt: f('tnt'),
    web: f('web', 'cobweb'),
    rail: f(['rail', { rail_direction: 0 }]),
    bell: f(['bell', { attachment: 'standing', direction: 0 }]),
    shortGrass: f('short_grass', ['tallgrass', { tall_grass_type: 'tall' }], ['tall_grass', { tall_grass_type: 'tall' }]),
    fern: f('fern', ['tallgrass', { tall_grass_type: 'fern' }], ['tall_grass', { tall_grass_type: 'fern' }]),
    deadBush: f('deadbush', 'dead_bush'),
    cactus: f('cactus'),
    reeds: f('reeds', 'sugar_cane'),
    lily: f('waterlily', 'lily_pad'),
    seagrass: f('seagrass'),
    kelp: f(['kelp', { kelp_age: 0 }]),
    bamboo: f(['bamboo', { bamboo_leaf_size: 'large_leaves', bamboo_stalk_thickness: 'thick' }]),
    berries: f(['sweet_berry_bush', { growth: 3 }]),
    petals: f(['pink_petals', { growth: 3 }]),
    redMushroom: f('red_mushroom'),
    brownMushroom: f('brown_mushroom'),
    flowers: [
      f('poppy', ['red_flower', { flower_type: 'poppy' }], ['flower', { flower_type: 'poppy' }]),
      f('dandelion', 'yellow_flower'),
      f('cornflower', ['red_flower', { flower_type: 'cornflower' }]), // (none before 1.10)
      f('oxeye_daisy', ['red_flower', { flower_type: 'oxeye' }], ['flower', { flower_type: 'oxeye' }]),
      f('allium', ['red_flower', { flower_type: 'allium' }], ['flower', { flower_type: 'allium' }])
    ].filter(id => id !== null),
    orchid: f('blue_orchid', ['red_flower', { flower_type: 'orchid' }], ['flower', { flower_type: 'orchid' }]),
    wheat: f(['wheat', { growth: 7 }], ['crops', { growth: 7 }]),
    carrots: f(['carrots', { growth: 7 }]),
    potatoes: f(['potatoes', { growth: 7 }], ['potato', { growth: 7 }]),
    beetroot: f(['beetroot', { growth: 7 }]),
    heart: f('purple_shulker_box', ['shulker_box', { color: 'purple' }])
  }
  P.cherryLog ??= P.birchLog
  P.cherryLeaves ??= P.birchLeaves
  // (0.14 - 1.0: oak_wood_stairs for oak_stairs)
  P.stairs = (name, direction, upsideDown = 0) => {
    const props = { weirdo_direction: direction, upside_down_bit: upsideDown }
    return world.first([name, props], [name.replace(/_stairs$/, '_wood_stairs'), props])
  }
  P.chest = side => world.state('chest', { 'minecraft:cardinal_direction': side, facing_direction: { north: 2, south: 3, west: 4, east: 5 }[side] })
  return P
}

// stairs: the side a stair's high back is to (Bedrock's weirdo_direction)
const STAIR = { east: 0, west: 1, south: 2, north: 3 }

// the nine regions: where each is, how far it reaches, its biome (the first the version has) and its ground's height
const REGIONS = [
  { key: 'plains', at: [88, 88], reach: 34, biomes: ['plains'] },
  { key: 'forest', at: [20, 88], reach: 28, biomes: ['roofed_forest'] },
  { key: 'snow', at: [24, 24], reach: 28, biomes: ['cold_taiga', 'ice_plains'] },
  { key: 'mountain', at: [90, 12], reach: 30, biomes: ['extreme_hills'] },
  { key: 'cherry', at: [152, 24], reach: 28, biomes: ['cherry_grove', 'birch_forest'] },
  { key: 'jungle', at: [154, 90], reach: 28, biomes: ['jungle'] },
  { key: 'desert', at: [152, 152], reach: 28, biomes: ['desert'] },
  { key: 'mesa', at: [88, 162], reach: 28, biomes: ['mesa'] },
  { key: 'swamp', at: [20, 154], reach: 28, biomes: ['swampland'] }
]
const SUMMIT = { x: 90, z: 12 }
const LAKE = { x: 56, z: 128, r: 13 }
const POND = { x: 46, z: 44, r: 7 }
// the river, from the gorge under the waterfall to the lake
const RIVER = [[89, 36], [86, 48], [74, 60], [66, 74], [65, 88], [63, 104], [59, 117], [56, 126]]
const TEMPLE = { x: 140, z: 140 } // its north-west corner (15 by 15)
const OUTPOST = { x: 18, z: 84 } // its tower's north-west corner (7 by 7)
const IGLOO = { x: 30, z: 32 }

function heightOf (key, x, z) {
  const n = fbm(x, z)
  switch (key) {
    case 'plains': return 13 + (n - 0.5) * 2
    case 'forest': return 13.5 + (n - 0.5) * 4
    case 'snow': return 14 + (n - 0.5) * 6
    case 'mountain': {
      const peak = Math.max(0, 1 - Math.hypot(x - SUMMIT.x, z - SUMMIT.z) / 50)
      return 15 + 34 * peak ** 1.6 + (n - 0.5) * 8 * peak + (noise(x, z, 7, 31) - 0.5) * 3
    }
    case 'cherry': return 16 + (n - 0.5) * 10
    case 'jungle': return 14 + (n - 0.5) * 6
    case 'desert': return 13 + (noise(x, z, 9, 7) - 0.5) * 3
    case 'mesa': {
      const plateau = smoothstep(0.52, 0.6, noise(x, z, 18, 11))
      return 14 + (n - 0.5) * 2 + Math.round(plateau * 9 / 3) * 3
    }
    case 'swamp': return 11.2 + (n - 0.5) * 1.6
  }
}

function distanceToRiver (x, z) {
  let best = Infinity
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [ax, az] = RIVER[i]
    const [bx, bz] = RIVER[i + 1]
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2)))
    best = Math.min(best, Math.hypot(x - (ax + t * (bx - ax)), z - (az + t * (bz - az))))
  }
  return best
}

// the region of each column and the height of its ground: the regions' heights blended by how near each is (a little
// warped, so that their borders wind), the village, the outpost and the temple levelled, the river, the lake and the
// pond dug
function lay () {
  const region = new Uint8Array(SIZE * SIZE)
  const top = new Int16Array(SIZE * SIZE)
  const flat = (x, z, at, r0, r1, height) => {
    const t = smoothstep(r1, r0, Math.hypot(x - at.x, z - at.z))
    return h => h * (1 - t) + height * t
  }
  for (let x = 0; x < SIZE; x++) {
    for (let z = 0; z < SIZE; z++) {
      const wx = x + (noise(x, z, 30, 21) - 0.5) * 26
      const wz = z + (noise(x, z, 30, 22) - 0.5) * 26
      let sum = 0
      let h = 0
      let best = 0
      let bestWeight = -1
      REGIONS.forEach((r, i) => {
        const w = Math.exp(-3 * (Math.hypot(wx - r.at[0], wz - r.at[1]) / r.reach) ** 2)
        sum += w
        h += w * heightOf(r.key, x, z)
        if (w > bestWeight) { best = i; bestWeight = w }
      })
      h /= sum || 1
      h = flat(x, z, VILLAGE, 20, 30, GROUND)(h)
      h = flat(x, z, { x: OUTPOST.x + 6, z: OUTPOST.z + 4 }, 9, 14, 14)(h)
      h = flat(x, z, { x: TEMPLE.x + 7, z: TEMPLE.z + 7 }, 12, 18, 13)(h)
      h = flat(x, z, { x: IGLOO.x, z: IGLOO.z }, 5, 9, 15)(h)
      const summit = heightOf('mountain', SUMMIT.x, SUMMIT.z)
      h = flat(x, z, SUMMIT, 2, 5, summit)(h)
      const dr = distanceToRiver(x, z)
      if (dr < 8) h = Math.min(h, dr < 2.5 ? SEA - 2 + dr * 0.3 : SEA - 0.5 + (dr - 2.5) * 1.1)
      const dl = Math.hypot(x - LAKE.x, z - LAKE.z)
      if (dl < LAKE.r + 4) h = Math.min(h, SEA - 4 + (dl / LAKE.r) ** 2 * 5.5)
      const dp = Math.hypot(x - POND.x, z - POND.z)
      if (dp < POND.r + 4) h = Math.min(h, SEA - 2 + (dp / POND.r) ** 2 * 3.5)
      region[x * SIZE + z] = best
      top[x * SIZE + z] = Math.max(3, Math.round(h))
    }
  }
  return { region, top }
}

function build (world) {
  const P = palette(world)
  const { region, top } = lay()
  const keyAt = (x, z) => REGIONS[region[x * SIZE + z]].key
  const topAt = (x, z) => top[Math.max(0, Math.min(SIZE - 1, x)) * SIZE + Math.max(0, Math.min(SIZE - 1, z))]
  // the regions' biomes, the version's own (or plains)
  const biomeIds = REGIONS.map(r => r.biomes.map(n => world.mcData.biomesByName?.[n]?.id).find(id => id !== undefined) ?? world.plains)
  // (the Nether and the End, far off this square: ./dimensions.js)
  const dimensions = require('./dimensions')
  world.biomeAt = (x, z) => (x >= 0 && z >= 0 && x < SIZE && z < SIZE) ? biomeIds[region[x * SIZE + z]] : (dimensions.biomeAt(world, x, z) ?? world.plains)
  world.biomeTop = 72
  const put = (x, y, z, id) => world.set(x, y, z, id)
  const idAt = (x, y, z) => world.column(Math.floor(x / 16), Math.floor(z / 16)).getBlockStateId({ x: x & 15, y, z: z & 15 })
  // (leaves: into the air only, not the ground of a slope)
  const putInAir = (x, y, z, id) => { if (idAt(x, y, z) === P.air) put(x, y, z, id) }
  const fill = (x0, y0, z0, x1, y1, z1, id) => {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) put(x, y, z, id)
      }
    }
  }
  // where no tree or plant grows (the places built, the roads)
  const reserved = new Uint8Array(SIZE * SIZE)
  const reserve = (x0, z0, x1, z1) => {
    for (let x = Math.max(0, x0); x <= Math.min(SIZE - 1, x1); x++) for (let z = Math.max(0, z0); z <= Math.min(SIZE - 1, z1); z++) reserved[x * SIZE + z] = 1
  }
  const isReserved = (x, z) => x < 0 || z < 0 || x >= SIZE || z >= SIZE || reserved[x * SIZE + z] === 1

  // the ground: each region's soil over stone, banded terracotta in the badlands, snow on the peaks, sand and gravel
  // under water, water up to the sea (iced in the north)
  const BANDS = ['orange', null, 'yellow', 'white', 'red', 'brown', 'light_gray', 'orange', null]
  const grassy = new Uint8Array(SIZE * SIZE)
  for (let x = 0; x < SIZE; x++) {
    for (let z = 0; z < SIZE; z++) {
      const t = topAt(x, z)
      const key = keyAt(x, z)
      const steep = Math.max(...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => Math.abs(topAt(x + dx, z + dz) - t)))
      const under = t < SEA || (t === SEA && Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 2)
      let surface = P.grass
      let soil = P.dirt
      if (key === 'desert') { surface = P.sand; soil = P.sand } else if (key === 'mesa') { surface = t < 18 ? P.redSand : P.stained(BANDS[t % BANDS.length]) ?? P.terracotta; soil = null } else if (key === 'mountain' && (t >= 36)) { surface = P.snow; soil = P.stone } else if (key === 'mountain' && (t >= 25 || steep >= 3)) { surface = hash(x, z, 9) < 0.15 ? P.gravel : P.stone; soil = P.stone } else if ((key === 'forest' || key === 'jungle') && hash(x, z, 3) < 0.12) surface = P.podzol ?? P.grass
      if (under) {
        surface = key === 'swamp' ? P.clay : (key === 'snow' || key === 'mountain') ? P.gravel : P.sand
        soil = surface
      } else if (t <= SEA + 1 && ['plains', 'jungle', 'cherry'].includes(key) && distanceToRiver(x, z) > 3 && Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 5) {
        surface = P.sand
      }
      grassy[x * SIZE + z] = surface === P.grass || surface === P.podzol ? 1 : 0
      for (let y = 0; y <= t; y++) {
        let id = P.stone
        if (y === t) id = surface
        else if (key === 'mesa' && y > t - 10) id = P.stained(BANDS[y % BANDS.length]) ?? P.terracotta
        else if (key === 'desert' && y > t - 6) id = y > t - 3 ? P.sand : P.sandstone
        else if (y > t - 4 && soil) id = soil
        else if (key === 'mountain' && hash(x * 7 + y, z, 13) < 0.025) id = hash(x, y, 17) < 0.6 ? P.coalOre : P.ironOre
        put(x, y, z, id)
      }
      // ore showing on the mountain's bare stone
      if (key === 'mountain' && surface === P.stone && hash(x, z, 19) < 0.03) put(x, t, z, hash(x, z, 23) < 0.7 ? P.coalOre : P.ironOre)
      for (let y = t + 1; y <= SEA; y++) put(x, y, z, y === SEA && key === 'snow' ? P.ice : P.water)
      if (key === 'snow' && t >= SEA) put(x, t + 1, z, P.snowLayer)
    }
  }

  // the village, the outpost, the igloo, the summit, the portal, the temple, the hut, the dock
  const places = {}
  village(places)
  outpost(places)
  igloo(places)
  mountain(places)
  temple(places)
  hut(places)
  dock(places)
  plants()

  function door (x, y, z, side, hinge, name = 'wooden_door') {
    const doorName = [name, 'wooden_door', 'door'].find(n => world.has(n))
    if (!doorName) return null
    const direction = { east: 0, south: 1, west: 2, north: 3 }[side]
    const cardinal = { east: 'south', south: 'west', west: 'north', north: 'east' }[side]
    const lower = open => world.state(doorName, { direction, 'minecraft:cardinal_direction': cardinal, open_bit: open, upper_block_bit: 0, door_hinge_bit: 0 })
    put(x, y, z, lower(0))
    put(x, y + 1, z, world.state(doorName, world.mcData.blockStates ? { upper_block_bit: 1, door_hinge_bit: hinge, open_bit: 0 } : { upper_block_bit: 1, open_bit: 0, direction: hinge }))
    return { pos: { x, y, z }, open: lower(1), shut: lower(0) }
  }

  function bed (x, y, z, color) {
    // (its head to the north: direction 2, the head at z, the foot at z + 1)
    for (const head of [1, 0]) {
      put(x, y, z + 1 - head, world.state('bed', { direction: 2, head_piece_bit: head }))
      world.blockEntity(x, y, z + 1 - head, 'Bed', { color: ['byte', color] })
    }
  }

  // a cottage of 7 by 7: a cobblestone footing, plank walls between log corners, windows, a door, a hipped roof of
  // stairs; inside a bed, a chest, a crafting table and a furnace
  function cottage (x0, z0, doorSide, { planks = P.oakPlanks, log = P.oakLog, stairs = 'oak_stairs' } = {}) {
    const g = GROUND
    fill(x0, g - 2, z0, x0 + 6, g, z0 + 6, P.cobble)
    fill(x0 + 1, g, z0 + 1, x0 + 5, g, z0 + 5, planks)
    for (let y = g + 1; y <= g + 3; y++) {
      for (let i = 0; i <= 6; i++) {
        for (const [x, z] of [[x0 + i, z0], [x0 + i, z0 + 6], [x0, z0 + i], [x0 + 6, z0 + i]]) {
          const corner = (x === x0 || x === x0 + 6) && (z === z0 || z === z0 + 6)
          put(x, y, z, corner ? log : (y === g + 2 && i % 2 === 0 && i > 0 && i < 6 ? P.pane : planks))
        }
      }
    }
    fill(x0 + 1, g + 1, z0 + 1, x0 + 5, g + 3, z0 + 5, P.air)
    // the roof: rings of stairs, each a step in, a plank ridge on top
    for (let k = 0; k <= 3; k++) {
      const y = g + 4 + k
      const a = x0 - 1 + k
      const b = x0 + 7 - k
      const c = z0 - 1 + k
      const d = z0 + 7 - k
      if (a > b || c > d) break
      if (k === 3) { fill(a, y, c, b, y, d, planks); break }
      for (let x = a; x <= b; x++) {
        put(x, y, c, x === a || x === b ? planks : P.stairs(stairs, STAIR.south))
        put(x, y, d, x === a || x === b ? planks : P.stairs(stairs, STAIR.north))
      }
      for (let z = c + 1; z < d; z++) {
        put(a, y, z, P.stairs(stairs, STAIR.east))
        put(b, y, z, P.stairs(stairs, STAIR.west))
      }
      fill(a + 1, y, c + 1, b - 1, y, d - 1, k === 0 ? planks : P.air)
    }
    const mid = { west: [x0, z0 + 3], east: [x0 + 6, z0 + 3], north: [x0 + 3, z0], south: [x0 + 3, z0 + 6] }[doorSide]
    const d = door(mid[0], g + 1, mid[1], doorSide, 0)
    // a lantern by the door, flowers under the windows
    const out = { west: [-1, 0], east: [1, 0], north: [0, -1], south: [0, 1] }[doorSide]
    put(mid[0] + out[0] + (out[1] ? 1 : 0), g + 1, mid[1] + out[1] + (out[0] ? 1 : 0), P.lantern)
    reserve(x0 - 2, z0 - 2, x0 + 8, z0 + 8)
    return { door: d, outside: { x: mid[0] + out[0] * 2 + 0.5, z: mid[1] + out[1] * 2 + 0.5 }, inside: { x: mid[0] - out[0] * 2 + 0.5, z: mid[1] - out[1] * 2 + 0.5 } }
  }

  function village (places) {
    const g = GROUND
    // roads: east to west and north to south, through the square, and on west to the dark forest (over the bridge)
    const road = (x, z) => {
      if (x < 0 || z < 0 || x >= SIZE || z >= SIZE) return
      const t = topAt(x, z)
      if (t < SEA) return
      put(x, t, z, P.path)
      for (let y = t + 1; y <= t + 2; y++) put(x, y, z, P.air)
      reserve(x, z, x, z)
    }
    for (let x = 30; x <= 114; x++) for (let z = 87; z <= 89; z++) road(x, z)
    for (let z = 62; z <= 114; z++) for (let x = 87; x <= 89; x++) road(x, z)
    // the bridge over the river: a deck of planks, railings along its sides
    for (let x = 58; x <= 72; x++) {
      for (let z = 86; z <= 90; z++) {
        if (topAt(x, z) > SEA) continue
        put(x, SEA + 1, z, P.oakPlanks)
        put(x, SEA + 2, z, z === 86 || z === 90 ? P.oakFence : P.air)
      }
    }
    // the square: stone bricks, the Heart on its pedestal (a purple shulker box), lanterns on posts, a bell
    fill(83, g, 83, 93, g, 93, P.stoneBricks)
    for (const [x, z] of [[83, 83], [93, 83], [83, 93], [93, 93]]) put(x, g, z, P.mossyBricks)
    put(88, g + 1, 88, P.chiseledBricks)
    put(88, g + 2, 88, P.heart)
    world.blockEntity(88, g + 2, 88, 'ShulkerBox', { facing: ['byte', 1] })
    for (const [x, z] of [[84, 84], [92, 84], [84, 92], [92, 92]]) { put(x, g + 1, z, P.oakFence); put(x, g + 2, z, P.lantern) }
    put(91, g + 1, 85, P.bell)
    reserve(82, 82, 94, 94)
    places.heart = { x: 88, y: g + 2, z: 88 }
    // the cottages: Steve's (north-east), and three more
    places.home = cottage(95, 76, 'west')
    places.cottageB = cottage(75, 76, 'east')
    places.cottageC = cottage(75, 94, 'east')
    // Steve's: his bed against the north wall, his chest by the east wall, a crafting table, a furnace
    bed(99, g + 1, 77, 11)
    put(100, g + 1, 81, P.chest('west'))
    put(96, g + 1, 77, P.craftingTable)
    put(97, g + 1, 77, P.furnace)
    places.bed = { x: 99.5, y: g + 1.56, z: 77.6 }
    places.chest = { x: 100, y: g + 1, z: 81 }
    bed(79, g + 1, 77, 14)
    bed(79, g + 1, 95, 5)
    put(76, g + 1, 99, P.bookshelf)
    put(77, g + 1, 99, P.bookshelf)
    // the smithy: an open shed on log posts over cobblestone, an anvil, a furnace, a lava basin, a chest, a barrel
    fill(95, g, 94, 101, g, 100, P.cobble)
    for (const [x, z] of [[95, 94], [101, 94], [95, 100], [101, 100]]) fill(x, g + 1, z, x, g + 3, z, P.oakLog)
    fill(95, g + 4, 94, 101, g + 4, 100, P.sprucePlanks)
    fill(100, g + 1, 95, 100, g + 1, 99, P.cobble)
    put(100, g + 1, 97, P.lava)
    put(100, g + 1, 98, P.lava)
    put(97, g + 1, 99, P.anvil)
    put(98, g + 1, 95, P.furnace)
    put(96, g + 1, 95, P.chest('south'))
    put(96, g + 1, 99, P.barrel)
    reserve(94, 93, 102, 101)
    // the farm: rows of wheat, carrots, potatoes and beetroot either side of a water channel, a composter, hay
    for (let x = 100; x <= 112; x++) {
      for (let z = 62; z <= 72; z++) {
        if (z === 67) { put(x, g, z, P.water); continue }
        put(x, g, z, P.farmland)
        put(x, g + 1, z, [P.wheat, P.carrots, P.potatoes, P.beetroot][Math.floor((x - 100) / 4) % 4] ?? P.wheat)
      }
    }
    put(99, g + 1, 62, P.composter)
    put(113, g + 1, 62, P.hay)
    put(113, g + 1, 63, P.hay)
    put(113, g + 2, 62, P.hay)
    reserve(98, 60, 114, 74)
    // the pen: a fence ring with hay and a water trough (its animals: the story's)
    for (let x = 100; x <= 112; x++) { put(x, g + 1, 102, P.oakFence); put(x, g + 1, 114, P.oakFence) }
    for (let z = 102; z <= 114; z++) { put(100, g + 1, z, P.oakFence); put(112, g + 1, z, P.oakFence) }
    put(101, g + 1, 103, P.hay)
    put(111, g + 1, 113, P.cauldron)
    reserve(99, 101, 113, 115)
    // the well: a cobblestone ring round water, posts and a roof
    fill(79, g - 3, 104, 83, g + 1, 108, P.cobble)
    fill(80, g - 2, 105, 82, g + 1, 107, P.water)
    for (const [x, z] of [[79, 104], [83, 104], [79, 108], [83, 108]]) { put(x, g + 2, z, P.oakFence); put(x, g + 3, z, P.oakFence) }
    fill(79, g + 4, 104, 83, g + 4, 108, P.sprucePlanks)
    reserve(78, 103, 84, 109)
    // market stalls by the west gate: wool awnings on fence posts, a barrel and melons and pumpkins on their counters
    ;[['red', 70, 82], ['yellow', 70, 92]].forEach(([color, x0, z0], i) => {
      for (const [x, z] of [[x0, z0], [x0 + 3, z0], [x0, z0 + 3], [x0 + 3, z0 + 3]]) fill(x, g + 1, z, x, g + 2, z, P.oakFence)
      fill(x0, g + 3, z0, x0 + 3, g + 3, z0 + 3, P.wool(color) ?? P.oakPlanks)
      put(x0 + 1, g + 1, z0 + 1, P.barrel)
      put(x0 + 2, g + 1, z0 + 1, i ? P.pumpkin : P.melon)
      put(x0 + 1, g + 1, z0 + 2, P.hay)
      reserve(x0 - 1, z0 - 1, x0 + 4, z0 + 4)
    })
    // lamp posts along the roads
    for (const [x, z] of [[86, 70], [90, 76], [86, 100], [90, 108], [72, 86], [104, 90], [110, 86]]) { put(x, g + 1, z, P.oakFence); put(x, g + 2, z, P.oakFence); put(x, g + 3, z, P.lantern) }
    // a campfire by the square, its smoke the story's
    put(94, g + 1, 82, P.campfire)
    places.campfire = { x: 94.5, y: g + 1.4, z: 82.5 }
  }

  // the pillagers' outpost in the dark forest: a dark oak tower on a cobblestone footing, a railing round its top, tents
  // and a campfire by it
  function outpost (places) {
    const { x: x0, z: z0 } = OUTPOST
    const g = 14
    fill(x0 - 4, g, z0 - 4, x0 + 14, g, z0 + 12, P.coarse ?? P.dirt)
    fill(x0 - 4, g + 1, z0 - 4, x0 + 14, g + 16, z0 + 12, P.air)
    fill(x0, g + 1, z0, x0 + 6, g + 2, z0 + 6, P.cobble)
    for (let y = g + 3; y <= g + 12; y++) {
      for (let i = 0; i <= 6; i++) {
        for (const [x, z] of [[x0 + i, z0], [x0 + i, z0 + 6], [x0, z0 + i], [x0 + 6, z0 + i]]) {
          const corner = (x === x0 || x === x0 + 6) && (z === z0 || z === z0 + 6)
          put(x, y, z, corner ? P.darkLog : ((y - g) % 4 === 0 && i === 3 ? P.air : P.darkPlanks))
        }
      }
    }
    fill(x0 + 1, g + 1, z0 + 1, x0 + 5, g + 12, z0 + 5, P.air)
    fill(x0 - 1, g + 13, z0 - 1, x0 + 7, g + 13, z0 + 7, P.darkPlanks)
    for (let i = -1; i <= 7; i++) {
      for (const [x, z] of [[x0 + i, z0 - 1], [x0 + i, z0 + 7], [x0 - 1, z0 + i], [x0 + 7, z0 + i]]) put(x, g + 14, z, P.darkFence)
    }
    fill(x0 + 6, g + 1, z0 + 3, x0 + 6, g + 2, z0 + 3, P.air)
    // tents of white wool, a campfire, barrels and a hay pile
    for (const [tx, tz] of [[x0 + 10, z0 - 2], [x0 + 10, z0 + 8]]) {
      for (let k = 0; k < 3; k++) fill(tx - k, g + 1 + k, tz, tx - k, g + 1 + k, tz + 2, P.wool('white'))
      for (let k = 0; k < 3; k++) fill(tx + k, g + 1 + k, tz, tx + k, g + 1 + k, tz + 2, P.wool('white'))
      fill(tx, g + 1, tz, tx, g + 3, tz + 2, P.air)
      put(tx, g + 4, tz + 1, P.wool('white'))
    }
    put(x0 + 12, g + 1, z0 + 4, P.campfire)
    put(x0 + 8, g + 1, z0 + 1, P.barrel)
    put(x0 + 8, g + 1, z0 + 7, P.barrel)
    put(x0 - 2, g + 1, z0 + 2, P.hay)
    reserve(x0 - 4, z0 - 4, x0 + 14, z0 + 12)
    places.outpost = { x: x0 + 3, z: z0 + 3, y: g + 1, top: { x: x0 + 3.5, y: g + 14, z: z0 + 3.5 }, fire: { x: x0 + 12.5, y: g + 1.4, z: z0 + 4.5 } }
  }

  // an igloo of snow on the snowy plain: a dome, a door to the south, a bed and a lantern in it
  function igloo (places) {
    const { x: cx, z: cz } = IGLOO
    const g = 15
    fill(cx - 5, g, cz - 5, cx + 5, g, cz + 5, P.snow)
    fill(cx - 5, g + 1, cz - 5, cx + 5, g + 8, cz + 5, P.air)
    for (let x = -4; x <= 4; x++) {
      for (let z = -4; z <= 4; z++) {
        for (let y = 0; y <= 4; y++) {
          const d = Math.hypot(x, y * 1.15, z)
          if (d <= 4.3 && d > 3.2) put(cx + x, g + 1 + y, cz + z, P.snow)
        }
      }
    }
    fill(cx, g + 1, cz + 3, cx, g + 2, cz + 5, P.air)
    fill(cx - 1, g, cz - 1, cx + 1, g, cz + 1, P.carpet('red') ?? P.snow)
    put(cx - 2, g + 1, cz - 1, P.lantern)
    reserve(cx - 6, cz - 6, cx + 6, cz + 6)
    places.igloo = { x: cx + 0.5, z: cz + 6.5, y: g + 1 }
  }

  // the summit, and a waterfall down the gorge's head into the river; a ruined portal on the mountain's flank, lit
  function mountain (places) {
    const s = topAt(SUMMIT.x, SUMMIT.z)
    fill(SUMMIT.x - 1, s, SUMMIT.z - 1, SUMMIT.x + 1, s, SUMMIT.z + 1, P.stone)
    fill(SUMMIT.x - 1, s + 1, SUMMIT.z - 1, SUMMIT.x + 1, s + 3, SUMMIT.z + 1, P.air)
    places.summit = { x: SUMMIT.x + 0.5, y: s + 1, z: SUMMIT.z + 0.5 }
    // the waterfall: down the face at the gorge's head (north of the river's start, where the ground rises)
    const fx = RIVER[0][0]
    let fz = RIVER[0][1]
    while (fz > 2 && topAt(fx, fz - 1) <= SEA + 6) fz--
    const cliff = topAt(fx, fz - 1)
    for (let y = SEA + 1; y <= cliff; y++) put(fx, y, fz, P.falling)
    put(fx, cliff + 1, fz - 1, P.water)
    for (let y = SEA - 2; y <= SEA; y++) put(fx, y, fz, P.water)
    places.waterfall = { x: fx + 0.5, y: SEA + 1, z: fz + 0.5 }
    // the portal: an obsidian frame (some crying), netherrack and magma about it, lit
    const px = 110
    const pz = 30
    const pg = topAt(px + 1, pz)
    for (let x = px; x <= px + 3; x++) for (let z = pz - 2; z <= pz + 2; z++) put(x, pg, z, hash(x, z, 41) < 0.5 ? P.netherrack : P.magma)
    for (let y = pg + 1; y <= pg + 5; y++) {
      for (let x = px; x <= px + 3; x++) {
        const edge = y === pg + 1 || y === pg + 5 || x === px || x === px + 3
        put(x, y, pz, edge ? (hash(x, y, 43) < 0.3 ? P.cryingObsidian : P.obsidian) : P.portal)
      }
      fill(px, y, pz - 1, px + 3, y, pz - 1, P.air)
      fill(px, y, pz + 1, px + 3, y, pz + 1, P.air)
    }
    reserve(px - 1, pz - 3, px + 4, pz + 3)
    places.portal = { x: px + 2, y: pg + 3, z: pz + 0.5 }
  }

  // the desert temple: sandstone walls round a courtyard open to the sky, towers at its front corners, a terracotta
  // star in its floor, two chests, a door in the west wall
  function temple (places) {
    const { x: x0, z: z0 } = TEMPLE
    const g = 13
    fill(x0 - 2, g, z0 - 2, x0 + 16, g, z0 + 16, P.sandstone)
    fill(x0 - 2, g + 1, z0 - 2, x0 + 16, g + 14, z0 + 16, P.air)
    for (let y = g + 1; y <= g + 5; y++) {
      for (let i = 0; i <= 14; i++) {
        for (const [x, z] of [[x0 + i, z0], [x0 + i, z0 + 14], [x0, z0 + i], [x0 + 14, z0 + i]]) {
          put(x, y, z, y === g + 3 ? P.chiseledSandstone : (y === g + 5 ? P.cutSandstone : P.sandstone))
        }
      }
    }
    // the towers: west corners, 9 high, orange terracotta bands
    for (const [tx, tz] of [[x0, z0], [x0, z0 + 10]]) {
      for (let y = g + 1; y <= g + 9; y++) {
        for (let x = tx; x <= tx + 4; x++) {
          for (let z = tz; z <= tz + 4; z++) {
            const edge = x === tx || x === tx + 4 || z === tz || z === tz + 4
            if (!edge) continue
            put(x, y, z, y % 3 === 0 ? P.stained('orange') ?? P.cutSandstone : (y === g + 9 ? P.cutSandstone : P.sandstone))
          }
        }
      }
    }
    // the courtyard floor: cut sandstone, a star of orange terracotta round a blue one
    fill(x0 + 1, g, z0 + 1, x0 + 13, g, z0 + 13, P.cutSandstone)
    const c = { x: x0 + 7, z: z0 + 7 }
    for (let k = -3; k <= 3; k++) { put(c.x + k, g, c.z, P.stained('orange')); put(c.x, g, c.z + k, P.stained('orange')) }
    for (let k = -2; k <= 2; k++) { put(c.x + k, g, c.z + k, P.stained('orange')); put(c.x + k, g, c.z - k, P.stained('orange')) }
    put(c.x, g, c.z, P.stained('blue') ?? P.goldBlock)
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) put(c.x + x, g - 2, c.z + z, P.tnt)
    // the door: a gap in the west wall
    fill(x0, g + 1, z0 + 6, x0, g + 3, z0 + 8, P.air)
    // chests either side of the star, facing it
    put(c.x, g + 1, z0 + 2, P.chest('south'))
    put(c.x, g + 1, z0 + 12, P.chest('north'))
    reserve(x0 - 3, z0 - 3, x0 + 17, z0 + 17)
    places.temple = { door: { x: x0 - 1.5, z: z0 + 7.5 }, court: { x: c.x + 0.5, y: g + 1, z: c.z + 0.5 }, chest: { x: c.x, y: g + 1, z: z0 + 2 }, wall: { x: x0, y: g + 2, z: z0 + 11 } }
  }

  // the witch's hut in the swamp: spruce planks on log stilts over the water, a cauldron, a flower pot, a table
  function hut (places) {
    const x0 = 24
    const z0 = 146
    const g = SEA + 3
    for (const [x, z] of [[x0, z0], [x0 + 5, z0], [x0, z0 + 5], [x0 + 5, z0 + 5]]) fill(x, topAt(x, z) + 1, z, x, g, z, P.spruceLog)
    fill(x0, g, z0, x0 + 5, g, z0 + 5, P.sprucePlanks)
    for (let y = g + 1; y <= g + 3; y++) {
      for (let i = 0; i <= 5; i++) {
        for (const [x, z] of [[x0 + i, z0], [x0 + i, z0 + 5], [x0, z0 + i], [x0 + 5, z0 + i]]) put(x, y, z, y === g + 2 && i === 2 ? P.oakFence : P.sprucePlanks)
      }
    }
    fill(x0 + 1, g + 1, z0 + 1, x0 + 4, g + 3, z0 + 4, P.air)
    fill(x0 - 1, g + 4, z0 - 1, x0 + 6, g + 4, z0 + 6, P.sprucePlanks)
    fill(x0 + 2, g + 1, z0 + 5, x0 + 3, g + 2, z0 + 5, P.air)
    put(x0 + 1, g + 1, z0 + 1, P.cauldron)
    put(x0 + 4, g + 1, z0 + 1, P.craftingTable)
    put(x0 + 4, g + 1, z0 + 4, P.flowerPot)
    reserve(x0 - 2, z0 - 2, x0 + 7, z0 + 7)
    places.hut = { x: x0 + 2.5, y: g + 1, z: z0 + 3.5, porch: { x: x0 + 2.5, y: g + 1, z: z0 + 6 } }
  }

  // a dock of planks on the lake's east shore, fence posts along it
  function dock (places) {
    const z = LAKE.z
    for (let x = LAKE.x + 4; x <= LAKE.x + 14; x++) {
      put(x, SEA + 1, z, P.oakPlanks)
      put(x, SEA + 1, z + 1, P.oakPlanks)
      if (x % 3 === 0) { put(x, SEA + 2, z - 1, P.oakFence); put(x, SEA + 2, z + 2, P.oakFence) }
    }
    reserve(LAKE.x + 3, z - 2, LAKE.x + 15, z + 3)
    places.lake = { x: LAKE.x + 0.5, z: LAKE.z + 0.5, r: LAKE.r }
  }

  // trees and plants, each region's, on its ground (not on the roads or the places built)
  function plants () {
    const taken = new Uint8Array(SIZE * SIZE)
    const free = (x, z, r) => {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (isReserved(x + dx, z + dz) || taken[(x + dx) * SIZE + z + dz]) return false
        }
      }
      return true
    }
    const take = (x, z, r) => {
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (!isReserved(x + dx, z + dz)) taken[(x + dx) * SIZE + z + dz] = 1
    }
    const blob = (x, y, z, r, id, squash = 1) => {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dz = -r; dz <= r; dz++) {
            if (Math.hypot(dx, dy / squash, dz) <= r + 0.3) putInAir(x + dx, y + dy, z + dz, id)
          }
        }
      }
    }
    for (let x = 2; x < SIZE - 2; x++) {
      for (let z = 2; z < SIZE - 2; z++) {
        if (isReserved(x, z) || taken[x * SIZE + z]) continue
        const t = topAt(x, z)
        const key = keyAt(x, z)
        const r = hash(x, z, 5)
        const dry = t >= SEA + (key === 'swamp' ? 0 : 1)
        const y = t + 1
        if (dry && !grassy[x * SIZE + z] && key !== 'desert' && key !== 'mesa') continue
        if (!dry) {
          const depth = SEA - t
          if (key === 'swamp' && depth <= 1 && r < 0.14) put(x, SEA + 1, z, P.lily)
          else if (key !== 'snow' && depth >= 2 && r < 0.18) {
            const kelp = r < 0.05 && depth >= 3
            for (let k = y; k <= (kelp ? SEA - 1 : y); k++) { put(x, k, z, kelp ? P.kelp : P.seagrass); world.set(x, k, z, P.water, 1) }
          }
          continue
        }
        const column = (id, height) => { for (let k = 0; k < height; k++) put(x, y + k, z, id) }
        const tree = (grow, r) => { if (!free(x, z, r)) return false; grow(); take(x, z, r); return true }
        if (key === 'plains') {
          if (r < 0.004 && tree(() => oak(x, y, z), 3)) continue
          if (r < 0.12) put(x, y, z, P.shortGrass)
          else if (r < 0.15) put(x, y, z, P.flowers[Math.floor(r * 1000) % P.flowers.length])
        } else if (key === 'forest') {
          if (r < 0.05 && tree(() => darkOak(x, y, z), 3)) continue
          if (r < 0.08) put(x, y, z, r < 0.065 ? P.redMushroom : P.brownMushroom)
          else if (r < 0.25) put(x, y, z, P.shortGrass)
        } else if (key === 'snow') {
          if (r < 0.03 && tree(() => spruce(x, y, z), 2)) continue
          if (r < 0.04 && P.berries) put(x, y, z, P.berries)
        } else if (key === 'mountain') {
          if (t < 26 && r < 0.012 && tree(() => spruce(x, y, z), 2)) continue
          if (r < 0.1) put(x, y, z, P.shortGrass)
        } else if (key === 'cherry') {
          if (r < 0.014 && tree(() => cherry(x, y, z, r < 0.006), 4)) continue
          if (r < 0.3 && P.petals) put(x, y, z, P.petals)
          else if (r < 0.4) put(x, y, z, P.shortGrass)
        } else if (key === 'jungle') {
          if (r < 0.018 && tree(() => jungle(x, y, z, 10 + Math.floor(r * 400) % 6), 3)) continue
          if (r < 0.045 && tree(() => bush(x, y, z), 1)) continue
          if (r < 0.06 && P.bamboo) column(P.bamboo, 4 + Math.floor(r * 1000) % 7)
          else if (r < 0.064) put(x, y, z, P.melon)
          else if (r < 0.35) put(x, y, z, r < 0.2 ? P.fern : P.shortGrass)
        } else if (key === 'desert') {
          if (r < 0.008) column(P.cactus, 1 + Math.floor(r * 1000) % 3)
          else if (r < 0.025) put(x, y, z, P.deadBush)
        } else if (key === 'mesa') {
          if (r < 0.012) put(x, y, z, P.deadBush)
          else if (r < 0.015) column(P.cactus, 2)
        } else if (key === 'swamp') {
          if (r < 0.012 && tree(() => oak(x, y, z, true), 3)) continue
          if (r < 0.05) put(x, y, z, P.orchid)
          else if (r < 0.08) put(x, y, z, P.brownMushroom)
          else if (r < 0.3) put(x, y, z, P.shortGrass)
        }
      }
    }

    function oak (x, y, z, swamp = false) {
      const h = 4 + Math.floor(hash(x, z, 51) * 3)
      fill(x, y, z, x, y + h - 1, z, P.oakLog)
      blob(x, y + h - 1, z, swamp ? 3 : 2, P.oakLeaves, swamp ? 0.5 : 0.8)
    }
    // (a cone of rings narrowing to its top, a ring wider every other layer)
    function spruce (x, y, z) {
      const h = 7 + Math.floor(hash(x, z, 53) * 4)
      fill(x, y, z, x, y + h - 1, z, P.spruceLog)
      for (let k = 2; k < h; k++) {
        const r = Math.max(0, Math.round((h - k) / 3)) - ((h - k) % 2 ? 0 : 1) + 1
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (Math.abs(dx) + Math.abs(dz) <= r + (r > 1 ? 1 : 0)) putInAir(x + dx, y + k, z + dz, P.spruceLeaves)
      }
      put(x, y + h, z, P.spruceLeaves)
      if (keyAt(x, z) === 'snow') put(x, y + h + 1, z, P.snowLayer)
    }
    // (a trunk two by two, a wide flat crown)
    function darkOak (x, y, z) {
      const h = 6 + Math.floor(hash(x, z, 55) * 3)
      for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) fill(x + dx, y - 1, z + dz, x + dx, y + h, z + dz, P.darkLog)
      blob(x, y + h, z, 4, P.darkLeaves, 0.4)
      blob(x + 1, y + h + 1, z + 1, 3, P.darkLeaves, 0.4)
    }
    // (two branches off a trunk, each under a wide pink crown hanging at its edges; a bee nest under one)
    function cherry (x, y, z, nest) {
      const h = 5 + Math.floor(hash(x, z, 57) * 2)
      fill(x, y, z, x, y + h - 2, z, P.cherryLog)
      for (const [dx, dz] of [[2, 0], [-2, 1]]) {
        const top = y + h + (dx > 0 ? 0 : 1)
        put(x + Math.sign(dx), y + h - 2, z + dz, P.cherryLog)
        put(x + dx, y + h - 1, z + dz, P.cherryLog)
        blob(x + dx, top, z + dz, 3, P.cherryLeaves, 0.45)
        for (let k = 0; k < 4; k++) if (hash(x + k, z + dx, 59) < 0.6) putInAir(x + dx - 1 + k, top - 2, z + dz + (k % 2 ? 2 : -2), P.cherryLeaves)
      }
      if (nest && P.beeNest) put(x + 2, y + h - 2, z, P.beeNest)
    }
    function jungle (x, y, z, h) {
      fill(x, y, z, x, y + h, z, P.jungleLog)
      blob(x, y + h, z, 3, P.jungleLeaves, 0.6)
      blob(x, y + h - 4, z, 2, P.jungleLeaves, 0.6)
    }
    function bush (x, y, z) {
      put(x, y, z, P.jungleLog)
      blob(x, y + 1, z, 1, P.jungleLeaves, 1)
    }
  }

  // the height one stands at over (x, z): on its ground, or the water's surface
  const stand = (x, z) => Math.max(topAt(Math.floor(x), Math.floor(z)), SEA) + 1
  // the Nether and the End, each its places
  const nether = dimensions.buildNether(world)
  const end = dimensions.buildEnd(world)
  return { P, places, stand, topAt, keyAt, size: SIZE, sea: SEA, ground: GROUND, nether, end }
}

module.exports = { build, SIZE, SEA, GROUND, VILLAGE, REGIONS, LAKE, TEMPLE, OUTPOST, IGLOO, SUMMIT }
