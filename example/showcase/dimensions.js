// The showcase's two other dimensions, built in the same world far off the overworld's square (./world.js): the
// Nether, a lava sea under an open sky, its land crimson and warped forests, a soul sand valley and a basalt delta, the
// arrival portal on a ledge and a fortress over the lava, the end portal on its platform; and the End, an island of end
// stone in the void, its ring of obsidian pillars, the exit portal at its centre, the arrival platform off its edge and
// small islands of chorus round it. Built of a version's own blocks (each by its name in that version, or the nearest
// it has, as world.js's) and the version's biomes.
const NETHER = { x: 1500, z: 0, size: 112 } // its north-west corner (size by size)
const END = { x: -1600, z: 0, size: 112 }

// value noise in [0, 1), smooth at the scale given (world.js's)
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
const lerp = (a, b, t) => a + (b - a) * t
const SIDES = [['north', 0, -1], ['east', 1, 0], ['south', 0, 1], ['west', -1, 0]]

// Setting and reading blocks. Fences and bars are joined to their neighbours where a version's states keep that (1.26.50
// on; before, the viewer works it out from the neighbours)
function tools (world) {
  const { mcData } = world
  const put = (x, y, z, id) => world.set(x, y, z, id)
  const fill = (x0, y0, z0, x1, y1, z1, id) => {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) put(x, y, z, id)
      }
    }
  }
  const idAt = (x, y, z) => world.columns.get(Math.floor(x / 16) + ',' + Math.floor(z / 16))?.getBlockStateId({ x: x & 15, y, z: z & 15 })
  const nameOf = id => (id === undefined || id === null ? null : mcData.blockStates ? mcData.blockStates[id]?.name : mcData.blocks[id >> 4]?.name) ?? 'air'
  const nameAt = (x, y, z) => nameOf(idAt(x, y, z))
  const isAir = (x, y, z) => nameAt(x, y, z) === 'air'
  const solid = (x, y, z) => mcData.blocksByName[nameAt(x, y, z)]?.boundingBox === 'block'
  const cube = name => { const b = mcData.blocksByName[name]; return !!b && b.boundingBox === 'block' && !b.transparent }
  const links = []
  const link = (x, y, z, id) => { if (id === null) return; put(x, y, z, id); links.push([x, y, z]) }
  const join = () => {
    for (const [x, y, z] of links) {
      const name = nameAt(x, y, z)
      if (!/fence$|bars$/.test(name) || !('minecraft:connection_north' in (world.statesByName.get(name)?.[0]?.props ?? {}))) continue
      const props = {}
      for (const [side, dx, dz] of SIDES) {
        const other = nameAt(x + dx, y, z + dz)
        props['minecraft:connection_' + side] = other === name || cube(other) ? 1 : 0
      }
      put(x, y, z, world.state(name, props))
    }
  }
  return { put, fill, idAt, nameAt, isAir, solid, link, join }
}

// The Nether's blocks, by their names across versions (the first the version has; null for none). The last candidates
// are 0.14 - 1.0's names (nether_quartz_ore, ...); the nether update's blocks (1.16) fall back to netherrack where they
// make the ground, and are left out where they grow on it
function netherPalette (world) {
  const f = (...candidates) => world.first(...candidates.filter(Boolean))
  const pillar = (name, axis = 'y') => [name, { pillar_axis: axis }]
  const bone = axis => f(['bone_block', { pillar_axis: axis, deprecated: 0 }])
  const P = {
    air: f('air'),
    netherrack: f('netherrack'),
    lava: f(['lava', { liquid_depth: 0 }]),
    obsidian: f('obsidian'),
    cryingObsidian: f('crying_obsidian', 'obsidian'),
    portal: f(['portal', { portal_axis: 'z' }]),
    magma: f('magma', 'netherrack'),
    glowstone: f('glowstone'),
    shroomlight: f('shroomlight', 'glowstone'),
    quartzOre: f('quartz_ore', 'nether_quartz_ore'),
    goldOre: f('nether_gold_ore', 'quartz_ore', 'nether_quartz_ore'),
    crimsonNylium: f('crimson_nylium', 'netherrack'),
    warpedNylium: f('warped_nylium', 'netherrack'),
    crimsonStem: f(pillar('crimson_stem')),
    warpedStem: f(pillar('warped_stem')),
    crimsonWart: f('nether_wart_block'),
    warpedWart: f('warped_wart_block'),
    crimsonFungus: f('crimson_fungus'),
    warpedFungus: f('warped_fungus'),
    crimsonRoots: f('crimson_roots'),
    warpedRoots: f('warped_roots'),
    sprouts: f('nether_sprouts'),
    weepingVines: f('weeping_vines'),
    twistingVines: f('twisting_vines'),
    soulSand: f('soul_sand'),
    soulSoil: f('soul_soil', 'soul_sand'),
    basalt: f(pillar('basalt'), 'netherrack'),
    boneX: bone('x'),
    boneY: bone('y'),
    boneZ: bone('z'),
    soulFire: f(['soul_fire', { age: 0 }], ['fire', { age: 0 }]),
    soulLantern: f(['soul_lantern', { hanging: 0 }], ['torch', { torch_facing_direction: 'top' }]),
    blackstone: f('blackstone', 'netherrack'),
    netherBrick: f('nether_brick'),
    redNetherBrick: f('red_nether_brick', 'nether_brick'),
    crackedNetherBrick: f('cracked_nether_bricks', 'nether_brick'),
    netherFence: f('nether_brick_fence'),
    blackstoneBricks: f('polished_blackstone_bricks', 'red_nether_brick', 'nether_brick'),
    netherWart: f(['nether_wart', { age: 3 }]),
    endPortal: f('end_portal')
  }
  // an end portal frame with its eye, facing a side (the side its eye is to; before the cardinal direction, Bedrock's
  // direction: 0 south, 1 west, 2 north, 3 east)
  P.frame = side => world.first(['end_portal_frame', { 'minecraft:cardinal_direction': side, direction: { south: 0, west: 1, north: 2, east: 3 }[side], end_portal_eye_bit: 1 }])
  return P
}

// The End's blocks
function endPalette (world) {
  const f = (...candidates) => world.first(...candidates.filter(Boolean))
  const P = {
    air: f('air'),
    endStone: f('end_stone'),
    endBricks: f('end_bricks', 'end_stone'),
    purpur: f(['purpur_block', { chisel_type: 'default', pillar_axis: 'y' }]),
    purpurPillar: f(['purpur_pillar', { pillar_axis: 'y' }], ['purpur_block', { chisel_type: 'lines', pillar_axis: 'y' }]),
    obsidian: f('obsidian'),
    bedrock: f(['bedrock', { infiniburn_bit: 0 }]),
    ironBars: f('iron_bars'),
    endRod: f(['end_rod', { facing_direction: 1 }]),
    chorusPlant: f('chorus_plant'),
    chorusFlower: f(['chorus_flower', { age: 0 }]),
    endPortal: f('end_portal'),
    dragonEgg: f('dragon_egg')
  }
  // a torch on a block's side: Bedrock names the side it hangs from (west: on the east face of the block to its west)
  P.torch = side => world.first(['torch', { torch_facing_direction: side }])
  return P
}

// ---------------------------------------------------------------------------------------------------------------------
// The Nether (in local coordinates u, v: x and z from NETHER's corner). The lava's surface, its floor, the fortress's
// deck and the arrival ledge, each the top of its blocks
const LAVA = 10
const FLOOR = 8
const DECK = 17
const LEDGE = 22
// the kinds of land (crimson, warped, soul sand valley, basalt delta, bare netherrack), and their biomes (each the
// first the version has, else the Nether's own)
const BIOMES = [['crimson_forest'], ['warped_forest'], ['soulsand_valley'], ['basalt_deltas'], []]
// the land masses in the lava: each an ellipse (its edges warped by noise), its kind
const LANDS = [
  { kind: 0, u: 18, v: 64, ru: 21, rv: 25 },
  { kind: 1, u: 24, v: 17, ru: 21, rv: 14 },
  { kind: 2, u: 82, v: 20, ru: 26, rv: 17 },
  { kind: 3, u: 82, v: 97, ru: 27, rv: 13 },
  { kind: 3, u: 25, v: 101, ru: 11, rv: 7 },
  { kind: 4, u: 57, v: 37, ru: 5, rv: 4 }
]
// the route from the arrival portal down through the crimson forest to the bridge; the portal frame's north end (it
// runs 4 along z, 5 high, on the ledge, facing east); the bridgehead; the bridge (its deck 5 wide, v - 2 to v + 2); the
// fortress's platform; the middle of the end portal on it
const ROUTE = [[8.5, 60], [13.5, 61], [20, 63.5], [27, 64], [33, 62], [37.5, 60.5]]
const PORTAL = { u: 6, v: 58 }
const PAD = { u0: 34, u1: 39 }
const BRIDGE = { u0: 40, u1: 73, v: 60, piers: [46, 54, 62] }
const PLATFORM = { u0: 74, u1: 101, v0: 45, v1: 76 }
const RING = { u: 86, v: 60 }
// the soul sand valley's basalt pillars (their tops), three crowned with glowstone
const SOUL_PILLARS = [
  { u: 68, v: 12, r: 1.5, top: 34, glow: true },
  { u: 77, v: 27, r: 1, top: 27 },
  { u: 88, v: 9, r: 1.5, top: 31, glow: true },
  { u: 97, v: 24, r: 1.5, top: 36, glow: true },
  { u: 84, v: 33, r: 0.8, top: 23 },
  { u: 101, v: 12, r: 1, top: 26 },
  { u: 63, v: 24, r: 0.8, top: 22 }
]
const F_LEDGE = 1
const F_PATH = 2 // the route's own blocks
const F_NEAR = 4 // by the route (no fungus, no plant)
const F_PAD = 8
const F_POOL = 16

const ROUTE_LENGTH = ROUTE.slice(1).reduce((sum, [x, z], i) => sum + Math.hypot(x - ROUTE[i][0], z - ROUTE[i][1]), 0)
// how far (x, z) is from the route, and how far along it (0 at the portal, 1 at the bridge) its nearest point is
function alongRoute (x, z) {
  let best = Infinity
  let at = 0
  let run = 0
  for (let i = 0; i < ROUTE.length - 1; i++) {
    const [ax, az] = ROUTE[i]
    const [bx, bz] = ROUTE[i + 1]
    const len = Math.hypot(bx - ax, bz - az)
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (len * len)))
    const d = Math.hypot(x - ax - t * (bx - ax), z - az - t * (bz - az))
    if (d < best) { best = d; at = run + t * len }
    run += len
  }
  return { d: best, s: at / ROUTE_LENGTH }
}
// the route's ground: the ledge's height by the portal, down a step at a time to the bridge's deck
const routeHeight = s => Math.round(LEDGE - (LEDGE - DECK) * smoothstep(0.12, 0.9, s))

// The Nether's lay: each column's land (its kind, or -1 for the lava), the biome's zone (the land nearest, out over its
// shore), the top of its ground (or the lava's floor), what it is (ledge, route, bridgehead, a pool). The same for
// every version, so made once
let layout = null
function netherLayout () {
  if (layout) return layout
  const S = NETHER.size
  const kind = new Int8Array(S * S).fill(-1)
  const zone = new Int8Array(S * S).fill(-1)
  const top = new Int16Array(S * S)
  const flag = new Uint8Array(S * S)
  const strength = new Float32Array(S * S)
  for (let u = 0; u < S; u++) {
    for (let v = 0; v < S; v++) {
      const i = u * S + v
      const wu = u + (noise(u, v, 13, 101) - 0.5) * 10
      const wv = v + (noise(u, v, 13, 102) - 0.5) * 10
      let s = -Infinity
      let k = -1
      for (const land of LANDS) {
        const t = 1 - Math.hypot((wu - land.u) / land.ru, (wv - land.v) / land.rv)
        if (t > s) { s = t; k = land.kind }
      }
      // (no land at the square's edges: lava all round it)
      s = Math.min(s, (Math.min(u, v, S - 1 - u, S - 1 - v) - 3) / 12)
      // the ledge: a rounded box round the portal, its edge a little ragged
      const qx = Math.abs(u + 0.5 - 8.5) - 3
      const qz = Math.abs(v + 0.5 - 60.5) - 5
      const ledge = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - 2.5 + (noise(u, v, 5, 181) - 0.5) * 2
      const route = alongRoute(u + 0.5, v + 0.5)
      const pad = u >= PAD.u0 && u <= PAD.u1 && v >= BRIDGE.v - 2 && v <= BRIDGE.v + 2
      if (ledge <= 0 || route.d <= 3 || pad) { s = Math.max(s, 0.3); k = 0 }
      zone[i] = s > -0.12 ? k : -1
      strength[i] = s
      if (s <= 0) { top[i] = FLOOR + (noise(u, v, 9, 161) > 0.6 ? 1 : 0); continue }
      kind[i] = k
      let h = [15 + 6 * fbm(u, v, 3), 16 + 8 * fbm(u, v, 5), 13 + 4 * fbm(u, v, 7), 12 + 3 * fbm(u, v, 9) + (hash(u, v, 11) < 0.25 ? 1 : 0), 14 + 4 * fbm(u, v, 13)][k]
      // (steep shores: from just over the lava up to the land's height within a few blocks)
      h = 11 + (h - 11) * smoothstep(0, 0.12, s)
      if (ledge <= 0) { h = LEDGE; flag[i] |= F_LEDGE } else if (ledge < 4) h = Math.max(h, LEDGE - ledge * 2.2)
      const hr = routeHeight(route.s)
      if (route.d <= 1.6) { h = hr; flag[i] |= F_PATH } else if (route.d < 7) h = lerp(hr, h, smoothstep(1.6, 7, route.d))
      if (route.d <= 3) flag[i] |= F_NEAR
      if (pad) { h = DECK; flag[i] |= F_PAD | F_NEAR }
      // (under the bridge, the land below its deck)
      if (u >= BRIDGE.u0 && v >= BRIDGE.v - 4 && v <= BRIDGE.v + 4) h = Math.min(h, DECK - 2)
      top[i] = Math.max(11, Math.round(h))
    }
  }
  // the delta's lava pools: each level with the lowest ground round it
  const pools = []
  for (let u = 1; u < S - 1; u++) {
    for (let v = 1; v < S - 1; v++) {
      const i = u * S + v
      if (kind[i] !== 3 || strength[i] < 0.3 || noise(u, v, 6, 171) < 0.68) continue
      let low = top[i]
      let land = true
      for (let du = -1; du <= 1; du++) for (let dv = -1; dv <= 1; dv++) { low = Math.min(low, top[i + du * S + dv]); land &&= kind[i + du * S + dv] >= 0 }
      if (land) pools.push([i, low])
    }
  }
  for (const [i, low] of pools) { top[i] = low; flag[i] |= F_POOL }
  layout = { kind, zone, top, flag, strength }
  return layout
}

function buildNether (world) {
  const P = netherPalette(world)
  const { put, fill, isAir, solid, link, join } = tools(world)
  const L = netherLayout()
  const S = NETHER.size
  const X = NETHER.x
  const Z = NETHER.z
  const p = (u, y, v, id) => put(X + u, y, Z + v, id)
  const pf = (u0, y0, v0, u1, y1, v1, id) => fill(X + u0, y0, Z + v0, X + u1, y1, Z + v1, id)
  const fence = (u, y, v) => link(X + u, y, Z + v, P.netherFence)
  const air = (u, y, v) => isAir(X + u, y, Z + v)
  const inside = (u, v) => u >= 0 && v >= 0 && u < S && v < S
  const topAt = (u, v) => inside(u, v) ? L.top[u * S + v] : FLOOR - 1
  const kindAt = (u, v) => inside(u, v) ? L.kind[u * S + v] : -1
  const used = new Uint8Array(S * S) // (where no plant grows: stems, pillars, posts)

  // The ground: the lava, a layer or two over a netherrack floor; the land, its top three blocks and its sides down to
  // its lowest neighbour's (nothing under it that is never seen). Each land's surface over netherrack (soul soil in
  // the valley, basalt and blackstone in the delta), ore showing in the cliffs
  for (let u = 0; u < S; u++) {
    for (let v = 0; v < S; v++) {
      const i = u * S + v
      const h = L.top[i]
      const k = L.kind[i]
      if (k < 0) {
        p(u, h, v, P.netherrack)
        for (let y = h + 1; y <= LAVA; y++) p(u, y, v, P.lava)
        continue
      }
      const flag = L.flag[i]
      const pool = (flag & F_POOL) !== 0
      const below = Math.min(topAt(u - 1, v), topAt(u + 1, v), topAt(u, v - 1), topAt(u, v + 1))
      const rock = y => y > below && hash(u * 13 + y * 101, v * 7 - y, 191) < 0.045 ? (hash(u, v + y * 17, 193) < 0.75 ? P.quartzOre : P.goldOre) : P.netherrack
      for (let y = Math.min(h - 2, below); y <= h; y++) {
        const depth = h - y
        let id
        if (k === 2) {
          id = depth === 0 ? (noise(u, v, 6, 141) > 0.5 ? P.soulSand : P.soulSoil) : depth <= 2 ? P.soulSoil : rock(y)
        } else if (k === 3) {
          if (depth === 0) id = pool ? P.lava : hash(u, v, 151) < 0.07 ? P.magma : noise(u, v, 5, 153) > 0.45 ? P.basalt : P.blackstone
          else id = depth === 1 && pool ? P.magma : hash(u + y * 7, v, 155) < 0.5 ? P.basalt : P.blackstone
        } else if (depth > 0) {
          id = rock(y)
        } else if (flag & F_LEDGE) {
          id = hash(u, v, 157) < 0.04 ? P.quartzOre : P.netherrack
        } else if (flag & F_PATH) {
          id = hash(u, v, 159) < 0.35 ? P.netherrack : P.crimsonNylium
        } else {
          id = [P.crimsonNylium, P.warpedNylium, null, null, hash(u, v, 161) < 0.05 ? P.quartzOre : P.netherrack][k]
        }
        p(u, y, v, id)
      }
      // (the delta's spikes of basalt)
      if (k === 3 && !pool && hash(u, v, 211) < 0.07) {
        pf(u, h + 1, v, u, h + 1 + Math.floor(hash(u, v, 213) * 3), v, P.basalt)
        used[i] = 1
      }
    }
  }

  // The arrival portal on its ledge: an obsidian frame (some of it crying), lit, magma about its foot
  for (let v = PORTAL.v; v <= PORTAL.v + 3; v++) {
    for (let y = LEDGE + 1; y <= LEDGE + 5; y++) {
      const edge = y === LEDGE + 1 || y === LEDGE + 5 || v === PORTAL.v || v === PORTAL.v + 3
      p(PORTAL.u, y, v, edge ? (hash(v, y, 43) < 0.3 ? P.cryingObsidian : P.obsidian) : P.portal)
    }
  }
  for (let u = PORTAL.u - 2; u <= PORTAL.u + 2; u++) for (let v = PORTAL.v - 2; v <= PORTAL.v + 5; v++) if (hash(u, v, 47) < 0.35) p(u, LEDGE, v, P.magma)

  // The fortress. The bridge: a deck of nether bricks from the bridgehead on the shore over the lava to the platform,
  // fence railings along it, on piers down to the lava's floor with arches between them, soul lanterns over the piers
  const D = DECK
  const brick = (u, v) => hash(u, v, 61) < 0.1 ? P.crackedNetherBrick : P.netherBrick
  for (let u = PAD.u0; u <= BRIDGE.u1; u++) {
    for (let v = BRIDGE.v - 2; v <= BRIDGE.v + 2; v++) p(u, D, v, brick(u, v))
    if (u >= PAD.u0 + 2) { fence(u, D + 1, BRIDGE.v - 2); fence(u, D + 1, BRIDGE.v + 2) }
    if (u < BRIDGE.u0) continue
    const d = Math.min(...BRIDGE.piers.map(a => u < a ? a - u : u > a + 1 ? u - a - 1 : 0), u - BRIDGE.u0 + 1, PLATFORM.u0 - u)
    for (let v = BRIDGE.v - 2; v <= BRIDGE.v + 2; v++) {
      if (d === 0) pf(u, FLOOR, v, u, D - 1, v, P.netherBrick)
      else if (d <= 2) pf(u, D - (d === 1 ? 2 : 1), v, u, D - 1, v, P.netherBrick)
    }
  }
  for (const u of [PAD.u0 + 2, ...BRIDGE.piers]) for (const v of [BRIDGE.v - 2, BRIDGE.v + 2]) p(u, D + 2, v, P.soulLantern)
  // the platform: a deck on piers over the lava, a lip under its edge, railings round it but for the bridge's way in,
  // a red brick way from the bridge to the end portal's room
  const { u0, u1, v0, v1 } = PLATFORM
  for (let u = u0; u <= u1; u++) {
    for (let v = v0; v <= v1; v++) {
      p(u, D, v, brick(u, v))
      const rim = u === u0 || u === u1 || v === v0 || v === v1
      if (!rim) continue
      p(u, D - 1, v, P.netherBrick)
      if (!(u === u0 && Math.abs(v - BRIDGE.v) <= 1)) fence(u, D + 1, v)
    }
  }
  for (const su of [u0 + 3, 88, u1 - 3]) for (const sv of [v0 + 3, BRIDGE.v, v1 - 3]) pf(su - 1, FLOOR, sv - 1, su + 1, D - 1, sv + 1, P.netherBrick)
  pf(u0, D, BRIDGE.v - 1, 80, D, BRIDGE.v + 1, P.redNetherBrick)
  // the end portal's room, open to the sky: low walls (fence windows, a doorway to the bridge), red brick posts at its
  // corners crowned with glowstone, lava along its sides; on a floor of polished blackstone, the ring of twelve frames
  // with their eyes, facing in, round the portal
  const R0 = { u: RING.u - 6, v: RING.v - 6 }
  const R1 = { u: RING.u + 6, v: RING.v + 6 }
  pf(RING.u - 4, D, RING.v - 4, RING.u + 4, D, RING.v + 4, P.blackstoneBricks)
  for (const v of [R0.v + 1, R1.v - 1]) {
    pf(RING.u - 4, D - 1, v, RING.u + 4, D - 1, v, P.netherBrick)
    pf(RING.u - 4, D, v, RING.u + 4, D, v, P.lava)
  }
  for (let u = R0.u; u <= R1.u; u++) {
    for (let v = R0.v; v <= R1.v; v++) {
      if (u !== R0.u && u !== R1.u && v !== R0.v && v !== R1.v) continue
      const corner = (u === R0.u || u === R1.u) && (v === R0.v || v === R1.v)
      if (corner) { pf(u, D + 1, v, u, D + 3, v, P.redNetherBrick); p(u, D + 4, v, P.glowstone); continue }
      if (u === R0.u && Math.abs(v - RING.v) <= 1) continue
      p(u, D + 1, v, P.netherBrick)
      const window = (v === R0.v || v === R1.v) ? Math.abs(u - RING.u) <= 2 : Math.abs(v - RING.v) <= 2
      if (window) fence(u, D + 2, v)
      else p(u, D + 2, v, P.netherBrick)
    }
  }
  for (let k = -1; k <= 1; k++) {
    p(RING.u + k, D + 1, RING.v - 2, P.frame('south'))
    p(RING.u + k, D + 1, RING.v + 2, P.frame('north'))
    p(RING.u - 2, D + 1, RING.v + k, P.frame('east'))
    p(RING.u + 2, D + 1, RING.v + k, P.frame('west'))
    for (let j = -1; j <= 1; j++) p(RING.u + k, D + 1, RING.v + j, P.endPortal)
  }
  // the keep in the platform's north-east corner: a tower of nether bricks, red bands, fence windows, a doorway,
  // battlements, a soul lantern on its roof
  const K = { u0: 93, u1: 99, v0: 47, v1: 53 }
  const ku = (K.u0 + K.u1) / 2
  const kv = (K.v0 + K.v1) / 2
  for (let y = D + 1; y <= D + 11; y++) {
    for (let u = K.u0; u <= K.u1; u++) {
      for (let v = K.v0; v <= K.v1; v++) {
        if (u !== K.u0 && u !== K.u1 && v !== K.v0 && v !== K.v1) continue
        const mid = u === ku || v === kv
        const window = mid && [3, 4, 7, 8].includes(y - D)
        if (window) fence(u, y, v)
        else p(u, y, v, y === D + 5 || y === D + 9 ? P.redNetherBrick : P.netherBrick)
      }
    }
  }
  pf(K.u0, D + 1, kv, K.u0, D + 2, kv, P.air)
  pf(K.u0, D + 12, K.v0, K.u1, D + 12, K.v1, P.netherBrick)
  for (let u = K.u0; u <= K.u1; u++) {
    for (let v = K.v0; v <= K.v1; v++) if ((u === K.u0 || u === K.u1 || v === K.v0 || v === K.v1) && (u + v) % 2 === 0) p(u, D + 13, v, P.netherBrick)
  }
  p(ku, D + 13, kv, P.soulLantern)
  // the nether wart in the south-east corner, on soul sand in a planter of bricks
  const W = { u0: 93, u1: 99, v0: 69, v1: 75 }
  for (let u = W.u0; u <= W.u1; u++) {
    for (let v = W.v0; v <= W.v1; v++) {
      if (u === W.u0 || u === W.u1 || v === W.v0 || v === W.v1) { p(u, D + 1, v, P.netherBrick); continue }
      p(u, D, v, P.soulSand)
      p(u, D + 1, v, P.netherWart)
    }
  }

  // The soul sand valley: basalt pillars (glowstone on three), the bones of two great beasts half buried, soul fire
  // and soul lanterns
  const disc = (r, f) => { for (let du = -2; du <= 2; du++) for (let dv = -2; dv <= 2; dv++) if (Math.hypot(du, dv) <= r) f(du, dv) }
  const glow = (u, y, v, seed) => {
    for (let du = -2; du <= 2; du++) {
      for (let dv = -2; dv <= 2; dv++) {
        for (let dy = -2; dy <= 2; dy++) {
          const d = Math.hypot(du, dv, dy * 1.3)
          if (d <= 2.3 && hash(u + du * 3 + dy * 17, v + dv * 5 - dy, seed) < (d < 1.3 ? 0.95 : 0.4) && air(u + du, y + dy, v + dv)) p(u + du, y + dy, v + dv, P.glowstone)
        }
      }
    }
  }
  for (const [n, pl] of SOUL_PILLARS.entries()) {
    if (kindAt(pl.u, pl.v) !== 2) continue
    disc(pl.r, (du, dv) => {
      const g = topAt(pl.u + du, pl.v + dv)
      const taper = Math.hypot(du, dv) > 1 ? 2 : 0
      pf(pl.u + du, g - 1, pl.v + dv, pl.u + du, pl.top - taper, pl.v + dv, P.basalt)
      if (inside(pl.u + du, pl.v + dv)) used[(pl.u + du) * S + pl.v + dv] = 1
    })
    if (pl.glow) glow(pl.u, pl.top + 1, pl.v, 221 + n)
  }
  // (a ribcage along x: a spine, ribs arching down into the ground either side, a skull)
  if (P.boneX !== null) {
    const v = 18
    const g = topAt(76, v)
    for (let u = 72; u <= 80; u++) p(u, g + 4, v, P.boneX)
    for (let u = 73; u <= 79; u += 2) {
      for (const side of [-1, 1]) {
        p(u, g + 4, v + side, P.boneZ)
        for (let y = Math.min(topAt(u, v + side * 2), g + 3); y <= g + 3; y++) p(u, y, v + side * 2, P.boneY)
      }
    }
    pf(81, g + 3, v - 1, 82, g + 4, v + 1, P.boneY)
    // (and the ribs of another, arching over the valley's floor)
    for (const u of [91, 93, 95]) {
      const g2 = topAt(u, 30)
      for (let a = 0; a <= 12; a++) {
        const t = a / 12 * Math.PI
        const v2 = Math.round(30 + Math.cos(t) * 4)
        const y = g2 + Math.round(Math.sin(t) * 4)
        if (y > topAt(u, v2)) p(u, y, v2, Math.abs(Math.cos(t)) > 0.7 ? P.boneY : P.boneZ)
      }
    }
  }
  for (const [u, v] of [[72, 20], [90, 15], [80, 6], [95, 30], [70, 31]]) {
    if (kindAt(u, v) !== 2) continue
    const g = topAt(u, v)
    p(u, g + 1, v, P.basalt)
    p(u, g + 2, v, P.soulLantern)
    used[u * S + v] = 1
  }
  // the little island of netherrack between the forests and the valley: a spire, glowstone on it
  {
    const c = LANDS[5]
    const g = topAt(c.u, c.v)
    disc(1.5, (du, dv) => pf(c.u + du, g, c.v + dv, c.u + du, g + 9 - (Math.hypot(du, dv) > 1 ? 3 : 0), c.v + dv, P.netherrack))
    glow(c.u, g + 10, c.v, 231)
  }

  // The forests: huge fungi (a stem, a cap of wart blocks hanging at its hem, shroomlights in it; weeping vines under
  // the crimson's), roots and fungi and sprouts on the nylium, twisting vines in the warped
  const fungus = (u, v, warped) => {
    const stem = warped ? P.warpedStem : P.crimsonStem
    const wart = warped ? P.warpedWart : P.crimsonWart
    if (stem === null || wart === null) return
    const g = topAt(u, v)
    const top = g + 7 + Math.floor(hash(u, v, 203) * 5)
    for (let k = 0; k < 4; k++) {
      const y = top - k
      const r = [1.5, 2.5, 2.9, 2.9][k]
      for (let du = -3; du <= 3; du++) {
        for (let dv = -3; dv <= 3; dv++) {
          const d = Math.hypot(du, dv)
          if (d > r || (k >= 2 && d < 1.9)) continue
          const h = hash(u + du * 7 + k * 31, v + dv * 5, 207)
          if (k === 3 && h < 0.45) continue
          p(u + du, y, v + dv, h > 0.92 || (k === 2 && h > 0.75) ? P.shroomlight : wart)
          if (k === 3 && !warped && h > 0.7) {
            for (let n = 1; n <= 1 + Math.floor(h * 31) % 3 && air(u + du, y - n, v + dv); n++) p(u + du, y - n, v + dv, P.weepingVines)
          }
        }
      }
    }
    pf(u, g + 1, v, u, top - 1, v, stem)
  }
  const taken = new Uint8Array(S * S)
  for (let u = 3; u < S - 3; u++) {
    for (let v = 3; v < S - 3; v++) {
      const i = u * S + v
      const k = L.kind[i]
      if ((k !== 0 && k !== 1) || L.flag[i] || L.strength[i] < 0.12 || hash(u, v, 201) > (k === 0 ? 0.035 : 0.04)) continue
      let free = true
      for (let du = -4; du <= 4 && free; du++) for (let dv = -4; dv <= 4 && free; dv++) free = !taken[(u + du) * S + v + dv] && !(L.flag[(u + du) * S + v + dv] & (F_NEAR | F_LEDGE))
      if (!free) continue
      fungus(u, v, k === 1)
      taken[i] = 1
      used[i] = 1
    }
  }
  for (let u = 0; u < S; u++) {
    for (let v = 0; v < S; v++) {
      const i = u * S + v
      const k = L.kind[i]
      if (k < 0 || used[i] || (L.flag[i] & (F_NEAR | F_LEDGE | F_POOL))) continue
      const y = L.top[i] + 1
      if (!air(u, y, v)) continue
      const r = hash(u, v, 241)
      if (k === 0) {
        if (r < 0.1) p(u, y, v, P.crimsonRoots)
        else if (r < 0.13) p(u, y, v, P.crimsonFungus)
      } else if (k === 1) {
        if (r < 0.07) p(u, y, v, P.warpedRoots)
        else if (r < 0.17) p(u, y, v, P.sprouts)
        else if (r < 0.19) p(u, y, v, P.warpedFungus)
        else if (r < 0.21 && P.twistingVines !== null) pf(u, y, v, u, y + Math.floor(r * 1000) % 4, v, P.twistingVines)
      } else if (k === 2 && r < 0.012) {
        p(u, y, v, P.soulFire)
      }
    }
  }
  join()

  // the places: where one stands, near (u, v), on a column of a kind wanted (its top solid, air over it)
  const spot = (u, v, want) => {
    for (let r = 0; r <= 6; r++) {
      for (let du = -r; du <= r; du++) {
        for (let dv = -r; dv <= r; dv++) {
          const uu = u + du
          const vv = v + dv
          if (Math.max(Math.abs(du), Math.abs(dv)) !== r || !inside(uu, vv) || !want(uu * S + vv)) continue
          const g = L.top[uu * S + vv]
          if (solid(X + uu, g, Z + vv) && air(uu, g + 1, vv) && air(uu, g + 2, vv)) return { x: X + uu + 0.5, y: g + 1, z: Z + vv + 0.5 }
        }
      }
    }
    return null
  }
  const crimson = i => L.kind[i] === 0 && !(L.flag[i] & (F_PATH | F_LEDGE | F_PAD))
  const delta = i => L.kind[i] === 3 && !(L.flag[i] & F_POOL)
  const at = (u, v, y) => y === undefined ? { x: X + u, z: Z + v } : { x: X + u, y, z: Z + v }
  return {
    portal: at(PORTAL.u + 0.5, PORTAL.v + 2, LEDGE + 3.5),
    arrive: at(PORTAL.u + 2.5, PORTAL.v + 2, LEDGE + 1),
    path: ROUTE.map(([u, v]) => at(u, v)),
    bridge: [ROUTE[ROUTE.length - 1][0], 41.5, 49.5, 57.5, 65.5, 73.5, 75.5].map(u => at(u, BRIDGE.v + 0.5)),
    captainStand: at(PLATFORM.u0 + 3.5, BRIDGE.v + 0.5, D + 1),
    endPortal: { center: at(RING.u, RING.v, D + 1), edge: at(RING.u - 2.5, RING.v + 0.5), enter: at(RING.u + 0.5, RING.v + 0.5) },
    ghast: at(58.5, 76.5, D + 13),
    blazes: [at(78.5, 49.5, D + 4), at(86.5, 71.5, D + 3.5), at(ku + 0.5, kv + 0.5, D + 15.5)],
    piglins: [spot(19, 68, crimson), spot(26, 69, crimson), spot(30, 57, crimson)],
    hoglins: [spot(15, 55, crimson), spot(23, 58, crimson)],
    striders: [at(52.5, 50.5, LAVA + 1), at(64.5, 70.5, LAVA + 1)],
    magmaCubes: [spot(76, 93, delta), spot(90, 100, delta)],
    lava: LAVA,
    overview: { pos: at(28, 142, 88), target: at(58, 58, D) }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The End (local coordinates a, b: x and z from END's corner): the main island's centre, radius, the top of its rim and
// of its dome; the pillars round it (each its height over the island, its radius, a cage); the small islands
const ISLAND = { a: 50, b: 56, r: 40, base: 61, top: 64 }
const SPIKES = [[12, 2, true], [20, 1], [24, 2], [10, 1], [14, 2, true], [26, 1], [28, 2], [17, 1]]
const ISLES = [{ a: 98, b: 14, r: 7, base: 57, chorus: true }, { a: 14, b: 102, r: 6, base: 66, chorus: true }, { a: 104, b: 98, r: 5, base: 60 }]
const PLATFORM_END = { a: 100, b: 56 } // the arrival platform's middle (5 by 5)

function buildEnd (world) {
  const P = endPalette(world)
  const { put, isAir, solid, link, join } = tools(world)
  const S = END.size
  const X = END.x
  const Z = END.z
  const p = (a, y, b, id) => put(X + a, y, Z + b, id)
  const tops = new Int16Array(S * S).fill(-1)
  const topAt = (a, b) => a < 0 || b < 0 || a >= S || b >= S ? -1 : tops[a * S + b]

  // the islands: lenses of end stone, a low dome over a tapering underside (ragged), flat at the main one's middle
  const island = (ca, cb, radius, base, dome, depth, seed) => {
    for (let a = Math.max(0, ca - radius - 5); a <= Math.min(S - 1, ca + radius + 5); a++) {
      for (let b = Math.max(0, cb - radius - 5); b <= Math.min(S - 1, cb + radius + 5); b++) {
        const r = Math.hypot(a - ca, b - cb)
        const q = r / (1 + (noise(a, b, 16, seed) - 0.5) * 0.22) / radius
        if (q > 1) continue
        const top = r < 6 ? base + dome : Math.min(base + dome, base + Math.round(dome * (1 - q * q) + (noise(a, b, 7, seed + 1) - 0.5) * 1.6 * q))
        const bottom = base - Math.round(2 + depth * (1 - q) ** 1.3 + (noise(a, b, 5, seed + 2) - 0.5) * 6 * (1 - q))
        for (let y = bottom; y <= top; y++) p(a, y, b, P.endStone)
        tops[a * S + b] = top
      }
    }
  }
  island(ISLAND.a, ISLAND.b, ISLAND.r, ISLAND.base, ISLAND.top - ISLAND.base, 22, 71)
  ISLES.forEach((isle, n) => island(isle.a, isle.b, isle.r, isle.base, 1, isle.r + 2, 81 + n * 10))

  // the exit portal, as the game builds it: a bowl of bedrock (end stone round its foot), its rim a block over the
  // island, the portal's cells left empty (the story lights them), a pillar of bedrock in its middle, torches on it
  const ca = ISLAND.a
  const cb = ISLAND.b
  const y0 = ISLAND.top + 1
  const cells = []
  for (let da = -4; da <= 4; da++) {
    for (let db = -4; db <= 4; db++) {
      const d2 = da * da + db * db
      if (d2 + 1 < 12.25) p(ca + da, y0 - 1, cb + db, d2 + 1 < 6.25 ? P.bedrock : P.endStone)
      if (d2 >= 12.25) continue
      if (d2 >= 6.25) p(ca + da, y0, cb + db, P.bedrock)
      else if (d2 > 0) cells.push({ x: X + ca + da, y: y0, z: Z + cb + db })
    }
  }
  for (let y = y0; y <= y0 + 3; y++) p(ca, y, cb, P.bedrock)
  for (const [side, da, db] of [['west', 1, 0], ['east', -1, 0], ['north', 0, 1], ['south', 0, -1]]) p(ca + da, y0 + 2, cb + db, P.torch(side))

  // the pillars: obsidian, round, in a ring about the portal, a bedrock block on each top (where its crystal sits),
  // iron bars caging two
  const crystals = SPIKES.map(([height, radius, caged], k) => {
    const angle = (k + 0.5) / SPIKES.length * Math.PI * 2
    const pa = Math.round(ca + Math.cos(angle) * 26)
    const pb = Math.round(cb + Math.sin(angle) * 26)
    const top = topAt(pa, pb) + height
    for (let da = -radius; da <= radius; da++) {
      for (let db = -radius; db <= radius; db++) {
        if (Math.hypot(da, db) > radius + 0.5) continue
        for (let y = topAt(pa + da, pb + db) - 2; y <= top; y++) p(pa + da, y, pb + db, P.obsidian)
      }
    }
    p(pa, top + 1, pb, P.bedrock)
    if (caged) {
      for (let da = -2; da <= 2; da++) {
        for (let db = -2; db <= 2; db++) {
          for (let dy = 1; dy <= 4; dy++) if (dy === 4 || Math.abs(da) === 2 || Math.abs(db) === 2) link(X + pa + da, top + dy, Z + pb + db, P.ironBars)
        }
      }
    }
    return { x: X + pa + 0.5, y: top + 2, z: Z + pb + 0.5 }
  })

  // the arrival platform: obsidian, a block over the island's rim, off its east edge; a walkway of obsidian to it
  const PE = PLATFORM_END
  const level = ISLAND.base + 1
  for (let a = PE.a - 2; a <= PE.a + 2; a++) for (let b = PE.b - 2; b <= PE.b + 2; b++) p(a, level, b, P.obsidian)
  for (let a = PE.a - 3; a > ca; a--) {
    for (let b = PE.b - 1; b <= PE.b + 1; b++) p(a, level, b, P.obsidian)
    if ([-1, 0, 1].every(db => topAt(a, PE.b + db) >= ISLAND.base - 1)) break
  }

  // the small islands: chorus on two (stems, branches, flowers), end rods round them; on the third, a purpur post
  // on end bricks, end rods on it
  const chorus = (a, b, seed) => {
    const g = topAt(a, b)
    if (g < 0 || P.chorusPlant === null) return
    const h = 3 + Math.floor(hash(a, b, seed) * 3)
    for (let k = 1; k <= h; k++) p(a, g + k, b, P.chorusPlant)
    p(a, g + h + 1, b, P.chorusFlower)
    SIDES.forEach(([, da, db], i) => {
      const r = hash(a + i, b - i, seed + 1)
      if (r < 0.45) return
      const at = 2 + Math.floor(r * 10) % (h - 1)
      const up = 1 + Math.floor(r * 100) % 2
      for (let k = 0; k <= up; k++) p(a + da, g + at + k, b + db, P.chorusPlant)
      p(a + da, g + at + up + 1, b + db, P.chorusFlower)
    })
  }
  ISLES.forEach((isle, n) => {
    if (isle.chorus) {
      chorus(isle.a, isle.b, 301 + n)
      chorus(isle.a + 3, isle.b - 2, 311 + n)
      chorus(isle.a - 2, isle.b + 3, 321 + n)
      for (const [da, db] of [[-3, -2], [2, 3]]) if (topAt(isle.a + da, isle.b + db) >= 0) p(isle.a + da, topAt(isle.a + da, isle.b + db) + 1, isle.b + db, P.endRod)
      return
    }
    const g = topAt(isle.a, isle.b)
    for (let da = -2; da <= 2; da++) for (let db = -2; db <= 2; db++) p(isle.a + da, g, isle.b + db, P.endBricks)
    if (P.purpurPillar === null) return
    for (let y = g + 1; y <= g + 5; y++) for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) p(isle.a + da, y, isle.b + db, P.purpurPillar)
    for (const [da, db] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) p(isle.a + da, g + 6, isle.b + db, P.endRod)
  })
  join()

  // the places
  const at = (a, b, y) => y === undefined ? { x: X + a, z: Z + b } : { x: X + a, y, z: Z + b }
  const spot = (a, b) => {
    for (let r = 0; r <= 6; r++) {
      for (let da = -r; da <= r; da++) {
        for (let db = -r; db <= r; db++) {
          const aa = a + da
          const bb = b + db
          if (Math.max(Math.abs(da), Math.abs(db)) !== r) continue
          const g = topAt(aa, bb)
          if (g >= 0 && solid(X + aa, g, Z + bb) && isAir(X + aa, g + 1, Z + bb) && isAir(X + aa, g + 2, Z + bb)) return at(aa + 0.5, bb + 0.5, g + 1)
        }
      }
    }
    return null
  }
  return {
    arrive: at(PE.a + 0.5, PE.b + 0.5, level + 1),
    path: [PE.a + 0.5, PE.a - 4.5, PE.a - 9.5, 85.5, 78.5, 70.5, 64.5, ca + 8.5].map(a => at(a, PE.b + 0.5)),
    crystals,
    shootFrom: at(ca + 14.5, cb + 4.5),
    exitPortal: {
      center: at(ca, cb, y0),
      cells,
      portal: P.endPortal,
      egg: at(ca, cb, y0 + 4),
      eggState: P.dragonEgg,
      perch: at(ca + 3.5, cb + 0.5, y0 + 4),
      standNear: at(ca + 8.5, cb + 0.5)
    },
    circle: { center: at(ca + 0.5, cb + 0.5, ISLAND.top + 25), radius: 34, y: ISLAND.top + 25 },
    endermen: [spot(ca - 12, cb + 14), spot(ca - 18, cb - 6), spot(ca + 2, cb - 17), spot(ca + 15, cb + 14)],
    island: { x: X + ca + 0.5, z: Z + cb + 0.5, radius: ISLAND.r, top: ISLAND.top },
    overview: { pos: at(ca + 62, cb + 74, ISLAND.top + 52), target: at(ca, cb, ISLAND.top + 6) }
  }
}

// the version's biome at (x, z) in either dimension (each sub-area's own, else the Nether's; the End's), else null
const biomeIds = new WeakMap()
function biomeAt (world, x, z) {
  if (!biomeIds.has(world)) {
    const id = names => names.map(n => world.mcData.biomesByName?.[n]?.id).find(i => i !== undefined) ?? null
    // (0.14 - 1.0: nether_wastes)
    const hell = id(['hell', 'nether_wastes'])
    biomeIds.set(world, { nether: BIOMES.map(names => id(names) ?? hell), hell, end: id(['the_end']) })
  }
  const ids = biomeIds.get(world)
  const u = x - NETHER.x
  const v = z - NETHER.z
  if (u >= 0 && v >= 0 && u < NETHER.size && v < NETHER.size) {
    const zone = netherLayout().zone[u * NETHER.size + v]
    return zone < 0 ? ids.hell : ids.nether[zone]
  }
  if (x >= END.x && z >= END.z && x < END.x + END.size && z < END.z + END.size) return ids.end
  return null
}

module.exports = { NETHER, END, biomeAt, buildNether, buildEnd }
