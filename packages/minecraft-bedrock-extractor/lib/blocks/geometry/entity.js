// The blocks the client draws with a block entity renderer: chests, beds, heads and signs, from Bedrock's own entity
// textures and geometry: the packs' geometry.bed and the heads of the minecraft:skull client entity, and for chests and
// signs the layout their renderers draw (the boxes of the classic chest and sign on their entity texture sheets).
// What a block entity holds (a bed's colour, a head's rotation, a sign's text, a double chest) is not in the state:
// they draw as a block entity of its defaults does (a red bed, a head facing south, a single chest).
const { DIRS } = require('./boxes')

// A cube's faces on its texture sheet, Bedrock's box UV: [u0, v0, u1, v1] in texture pixels per face
function boxUv ([u, v], [w, h, d]) {
  return {
    north: [u + d, v + d, u + d + w, v + d + h],
    east: [u, v + d, u + d, v + d + h],
    south: [u + 2 * d + w, v + d, u + 2 * d + 2 * w, v + d + h],
    west: [u + d + w, v + d, u + 2 * d + w, v + d + h],
    up: [u + d, v, u + d + w, v + d],
    down: [u + d + w, v + d, u + d + 2 * w, v]
  }
}

// an element of a box ([from, to] in 0..16 block space) with its faces' uv (texture pixels, a sheet of width x height)
function element (from, to, uv, sheet, texture, { faces = DIRS, rotation } = {}) {
  const el = { from, to, faces: {} }
  if (rotation) el.rotation = rotation
  for (const dir of faces) {
    const [u0, v0, u1, v1] = uv[dir]
    el.faces[dir] = { texture: '#' + texture, uv: [u0 * 16 / sheet[0], v0 * 16 / sheet[1], u1 * 16 / sheet[0], v1 * 16 / sheet[1]] }
  }
  return el
}

const round = v => Math.round(v * 1000) / 1000

// The packs' geometry by identifier: { sheet: [width, height], bones: [{ name, cubes: [{ origin, size, uv }] }] }, in
// both formats (format 1.8's "geometry.x": { texturewidth, bones }, and 1.12's minecraft:geometry descriptions)
function geometryIndex (stack) {
  const index = new Map()
  for (const path of stack.files.keys()) {
    if (!/^models\/.+\.json$/.test(path)) continue
    let json
    try { json = stack.json(path) } catch { continue }
    for (const [key, g] of Object.entries(json ?? {})) {
      if (key.startsWith('geometry.')) index.set(key.split(':')[0], { sheet: [g.texturewidth ?? 64, g.textureheight ?? 64], bones: g.bones ?? [] })
    }
    for (const g of json?.['minecraft:geometry'] ?? []) {
      const d = g.description ?? {}
      if (d.identifier) index.set(d.identifier.split(':')[0], { sheet: [d.texture_width ?? 64, d.texture_height ?? 64], bones: g.bones ?? [] })
    }
  }
  return index
}

// the four sides by Bedrock's facing_direction (2 north, 3 south, 4 west, 5 east) and direction (0 south, 1 west, 2
// north, 3 east), and the y turn of a model laid out facing north to face each
const FACING = { 2: 'north', 3: 'south', 4: 'west', 5: 'east' }
const DIRECTION = ['south', 'west', 'north', 'east']
const TURN = { north: 0, east: 90, south: 180, west: 270 }

function facingOf (props) {
  return props['minecraft:cardinal_direction'] ?? FACING[props.facing_direction] ?? DIRECTION[+(props.direction ?? 2)] ?? 'north'
}

// A chest: base, lid and latch on the 64 x 64 chest sheet, the latch and the sheet's front at the north side, turned
// to the state's facing
function chest (state, ctx) {
  const name = state.name.replace(/^waxed_/, '')
  const stage = { exposed: 'exposed', weathered: 'weathered', oxidized: 'oxidized' }[name.split('_')[0]] ?? 'default'
  let sheet = 'normal'
  if (/ender/.test(name)) sheet = 'ender'
  else if (/trapped/.test(name)) sheet = 'trapped'
  else if (/copper/.test(name)) sheet = 'copper_' + stage
  const texture = ctx.ref(`textures/entity/chest/${sheet}`)
  if (!texture) return null
  const s = [64, 64]
  const elements = [
    element([1, 0, 1], [15, 10, 15], boxUv([0, 19], [14, 10, 14]), s, 'chest'),
    element([1, 9, 1], [15, 14, 15], boxUv([0, 0], [14, 5, 14]), s, 'chest'),
    element([7, 7, 0], [9, 11, 1], boxUv([0, 0], [2, 4, 1]), s, 'chest')
  ]
  return { elements, textures: { chest: texture, particle: texture }, ao: true, y: TURN[facingOf(state.props)] }
}

// A bed: geometry.bed stands on its foot, 32 high and 6 deep: laid flat, its length along z (the head at +z), its
// thickness the 9 below the mattress' top; each half of the block takes its 16 of the length. On the dyed sheet of
// the bed's colour, red by default; turned to the state's direction (the way from the foot to the head)
function bed (state, ctx) {
  const geometry = ctx.geometry('geometry.bed')
  const texture = ctx.ref('textures/entity/bed/red')
  if (!geometry || !texture) return null
  const head = state.props.head_piece_bit === '1'
  const z0 = head ? 16 : 0
  const elements = []
  for (const bone of geometry.bones) {
    for (const cube of bone.cubes ?? []) {
      const [ox, oy, oz] = cube.origin
      const [w, h, d] = cube.size
      // the cube laid flat: model y is world z, model z (down from the mattress' top) is world y
      const from = [ox, 9 - (oz + d), oy]
      const to = [ox + w, 9 - oz, oy + h]
      const lo = Math.max(from[2], z0)
      const hi = Math.min(to[2], z0 + 16)
      if (hi <= lo) continue
      const uv = boxUv(cube.uv, cube.size)
      // the length of a cube is the v of its sides; a half takes its share of it
      const along = ([u0, v0, u1, v1], from2, to2) => {
        const t0 = (lo - from2) / (to2 - from2)
        const t1 = (hi - from2) / (to2 - from2)
        return [u0, v1 - (v1 - v0) * t0, u1, v1 - (v1 - v0) * t1]
      }
      const faces = {
        up: along(uv.north, from[2], to[2]),
        down: along(uv.south, from[2], to[2]),
        west: along(uv.east, from[2], to[2]),
        east: along(uv.west, from[2], to[2]),
        north: uv.down,
        south: uv.up
      }
      const keep = DIRS.filter(dir => (dir !== 'north' || lo === from[2]) && (dir !== 'south' || hi === to[2]))
      elements.push(element([from[0], from[1], lo - z0].map(round), [to[0], to[1], hi - z0].map(round), faces, geometry.sheet, 'bed', { faces: keep }))
    }
  }
  const facing = DIRECTION[+(state.props.direction ?? 0)]
  return { elements, textures: { bed: texture, particle: texture }, ao: true, y: (TURN[facing] + 180) % 360 }
}

// the head types of the minecraft:skull client entity, by block: legacy skull blocks draw the default, a skeleton's
const HEADS = {
  skeleton_skull: 'skeleton',
  wither_skeleton_skull: 'wither',
  zombie_head: 'zombie',
  player_head: 'steve',
  creeper_head: 'creeper',
  dragon_head: 'dragon',
  piglin_head: 'piglin',
  skull: 'skeleton'
}

// A head: the geometry and texture the minecraft:skull client entity gives its type (its head bone, the largest cubes
// scaled into the block where the head is larger than 12), on the floor in the middle of the block, on a wall against
// it (facing_direction 2 - 5)
function skull (state, ctx) {
  const type = HEADS[state.name] ?? 'skeleton'
  const entity = ctx.clientEntity('minecraft:skull')
  const geometry = ctx.geometry(entity?.geometry?.[type] ?? 'geometry.mob_head')
  const texture = ctx.ref(entity?.textures?.[type] ?? `textures/entity/skulls/${type}`)
  if (!geometry || !texture) return null
  const bones = geometry.bones.filter(b => /head/i.test(b.name) && b.cubes?.length)
  const cubes = (bones.length ? bones : geometry.bones).flatMap(b => b.cubes ?? [])
  if (!cubes.length) return null
  const lo = [0, 1, 2].map(i => Math.min(...cubes.map(c => c.origin[i])))
  const hi = [0, 1, 2].map(i => Math.max(...cubes.map(c => c.origin[i] + c.size[i])))
  const scale = Math.min(1, 12 / Math.max(...[0, 1, 2].map(i => hi[i] - lo[i])))
  const wall = FACING[state.props.facing_direction]
  const elements = cubes.map(c => {
    const from = [0, 1, 2].map(i => (c.origin[i] - (i === 1 ? lo[1] : (lo[i] + hi[i]) / 2)) * scale)
    const to = [0, 1, 2].map(i => from[i] + c.size[i] * scale)
    // the middle of the floor, or 4 up and against the wall behind it (at +z, the face looking north, turned to face
    // away from its wall)
    const shift = [8, wall ? 4 : 0, wall ? 16 - (hi[2] - lo[2]) * scale / 2 : 8]
    return element(from.map((v, i) => round(v + shift[i])), to.map((v, i) => round(v + shift[i])), boxUv(c.uv, c.size), geometry.sheet, 'head')
  })
  return { elements, textures: { head: texture, particle: texture }, ao: true, y: wall ? TURN[wall] : 180 }
}

// the sign sheet of a sign block's wood
function signSheet (name) {
  const wood = name.replace(/_?(standing|wall)_sign$/, '') || 'oak'
  if (wood === 'oak') return ['textures/entity/sign']
  return [`textures/entity/sign_${wood}`, `textures/entity/${wood === 'darkoak' ? 'dark_oak' : wood}_sign`]
}

// A sign: its 24 x 12 x 2 board at 2/3 of its size, on a 2 x 14 x 2 stick when standing (turned by its
// ground_sign_direction in steps of 22.5 degrees, 0 facing south), against the wall behind it when on one (its front
// to the state's facing_direction), on the 64 x 32 sign sheet
function sign (state, ctx) {
  if (/hanging/.test(state.name)) return null
  const texture = signSheet(state.name).map(p => ctx.ref(p)).find(Boolean)
  if (!texture) return null
  const s = [64, 32]
  const k = 2 / 3
  const wall = /wall_sign$/.test(state.name)
  const board = boxUv([0, 0], [24, 12, 2])
  if (wall) {
    const facing = FACING[state.props.facing_direction] ?? 'north'
    const elements = [element([0, 4.333, 16 - 2 * k].map(round), [16, 12.333, 16], board, s, 'sign')]
    return { elements, textures: { sign: texture, particle: texture }, ao: true, y: TURN[facing] }
  }
  const direction = +(state.props.ground_sign_direction ?? 0)
  const quarter = Math.floor(direction / 4)
  const rotation = { origin: [8, 8, 8], axis: 'y', angle: -(direction % 4) * 22.5 }
  const elements = [
    element([0, 9.333, 8 - k].map(round), [16, 17.333, 8 + k].map(round), board, s, 'sign', { rotation }),
    element([8 - k, 0, 8 - k].map(round), [8 + k, 9.333, 8 + k].map(round), boxUv([0, 14], [2, 14, 2]), s, 'sign', { rotation })
  ]
  return { elements, textures: { sign: texture, particle: texture }, ao: true, y: [180, 270, 0, 90][quarter] }
}

module.exports = { chest, bed, skull, sign, geometryIndex, boxUv }
