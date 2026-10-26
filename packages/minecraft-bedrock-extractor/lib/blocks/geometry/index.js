// The geometry of a Bedrock block state as the client's tessellator draws it, as a model in the Java model format:
// { textures: { variable: texture }, elements, ao, x?, y?, liquid? } (0..16 block space), or null for nothing drawn.
//
// The generator is chosen by the tessellator shape the client reports for the block (data/block_render.json). The
// geometry comes from the state's own Bedrock shapes where they are what is drawn (collision boxes: stairs, slabs,
// doors, trapdoors, cakes, hoppers...; the selection box of a state with no collision), from the client's
// fence tessellator boxes, and for the tessellators that draw textured planes (plants, crops, torches, rails, vines,
// dust, lanterns, panes, walls, fence gates) from their layout here.
//
// state: { name, props (strings), collision: [[x0, y0, z0, x1, y1, z1]] | null, outline: the selection box | null (in
// blocks) }; ctx: { shape, faces: [down, up, north, south, west, east] texture names, tintFaces: { dir: bool } | false,
// tintTexture (texture -> whether its faces are tinted), tessellator (fence boxes by connection mask) }
const { DIRS, box, toElementBox, isFullBox, sidePlane, textureVars, cube, boxesToElements } = require('./boxes')
const { rotationBetween, unrotateBox, rotateBox, rotateDir, stateFacing, baseFront, fitRotationY } = require('./orient')
const entity = require('./entity')

const result = (elements, textures, extra = {}) => ({ elements, textures, ao: true, ...extra })

// the boxes a state is drawn as: its collision boxes, else its selection box, else the whole block
function stateBoxes (state, { prefer = 'collision' } = {}) {
  const collision = state.collision?.length ? state.collision : null
  const outline = state.outline ? [state.outline] : null
  const order = prefer === 'outline' ? [outline, collision] : [collision, outline]
  return (order.find(Boolean) ?? [[0, 0, 0, 1, 1, 1]]).map(toElementBox).filter(Boolean)
}

// A face set with a front (a furnace, a dispenser, a carved pumpkin, a glazed terracotta) faces the way its state
// says: the model is laid out with the faces blocks.json gives (the front south) and turned by the variant's x and y.
function oriented (state, ctx, elements, { boxesAreOriented = false } = {}) {
  const target = stateFacing(state.props)
  const front = baseFront(ctx.faces)
  let x = 0
  let y = 0
  const textures = textureVars(ctx.faces)
  if (target && front && DIRS.includes(target)) {
    ({ x, y } = rotationBetween(front, target))
    // dispensers and droppers have a front of their own for up and down
    const vertical = ctx.faces.findIndex(f => /vertical/.test(f))
    if ((target === 'up' || target === 'down') && vertical !== -1) {
      textures[front] = ctx.faces[vertical]
      textures[DIRS[vertical]] = ctx.faces[DIRS.indexOf(front)]
    }
  } else if (target && ctx.shape === 'Terracotta' && DIRS.includes(target)) {
    ({ x, y } = rotationBetween('south', target))
  }
  if (boxesAreOriented && (x || y)) {
    for (const el of elements) [el.from, el.to] = unrotateBox(el.from, el.to, x, y)
  }
  return result(elements, textures, { x, y })
}

// logs, basalt, chains, bamboo blocks: the end faces turn to the pillar's axis
function pillar (state, ctx) {
  const axis = state.props.pillar_axis
  const rot = axis === 'x' ? { x: 90, y: 90 } : axis === 'z' ? { x: 90, y: 0 } : { x: 0, y: 0 }
  const boxes = stateBoxes(state)
  const elements = isFullBox(boxes)
    ? cube(ctx.tintFaces)
    : boxesToElements(boxes.map(([f, t]) => unrotateBox(f, t, rot.x, rot.y)), ctx.tintFaces)
  return result(elements, textureVars(ctx.faces), rot)
}

// the boxes of the state, textured per side
function boxShape (state, ctx, opts) {
  const boxes = stateBoxes(state, opts)
  if (isFullBox(boxes)) return oriented(state, ctx, cube(ctx.tintFaces))
  return oriented(state, ctx, boxesToElements(boxes, ctx.tintFaces), { boxesAreOriented: true })
}

// a plane of the texture, explicit uv: a face whose quad is larger than the block keeps the whole texture
function plane (from, to, faces, texture, { uv = [0, 0, 16, 16], tint = false, rotation } = {}) {
  const el = { from, to, faces: {}, shade: false }
  if (rotation) el.rotation = rotation
  for (const dir of faces) {
    el.faces[dir] = { texture: '#' + texture, uv }
    if (tint) el.faces[dir].tintindex = 0
  }
  return el
}

// two planes corner to corner, crossing at the block's centre
function crossElements (texture, tint, height = 16) {
  const d = 8 * Math.SQRT2
  const uv = [0, 16 - height, 16, 16]
  const rotation = { origin: [8, 8, 8], axis: 'y', angle: 45 }
  return [
    plane([8 - d, 0, 8], [8 + d, height, 8], ['north', 'south'], texture, { uv, tint, rotation }),
    plane([8, 0, 8 - d], [8, height, 8 + d], ['west', 'east'], texture, { uv, tint, rotation })
  ]
}

// four planes in a # (wheat, carrots, potatoes, beetroots, nether wart)
function rowElements (texture, tint) {
  return [
    plane([4, 0, 0], [4, 16, 16], ['west', 'east'], texture, { tint }),
    plane([12, 0, 0], [12, 16, 16], ['west', 'east'], texture, { tint }),
    plane([0, 0, 4], [16, 16, 4], ['north', 'south'], texture, { tint }),
    plane([0, 0, 12], [16, 16, 12], ['north', 'south'], texture, { tint })
  ]
}

const G = {}

G.Invisible = () => null
G.StructureVoid = () => null
G.CameraFacingSprite = () => null
G.ClientRequestPlaceholder = () => null

// liquids: no elements; the viewer draws water and lava itself, with the still texture (particle)
G.Water = (state, ctx) => result([], { particle: ctx.faces[1], flow: ctx.faces[2] }, { liquid: true })

G.Block = (state, ctx) => {
  const boxes = stateBoxes(state, { prefer: state.collision?.length ? 'collision' : 'outline' })
  if (!isFullBox(boxes)) return oriented(state, ctx, boxesToElements(boxes, ctx.tintFaces), { boxesAreOriented: true })
  if (state.props.pillar_axis) return pillar(state, ctx)
  return oriented(state, ctx, cube(ctx.tintFaces))
}
G.Tree = pillar
G.Chain = pillar
G.BambooBlock = pillar

for (const shape of ['BlockHalf', 'Stairs', 'Trapdoor', 'Cactus', 'Cauldron', 'Hopper', 'Anvil', 'EndRod',
  'LightningRod', 'Candle', 'CandleCake', 'Bell', 'Grindstone', 'Lectern', 'Campfire', 'Composter', 'Scaffolding',
  'PortalFrame', 'BrewingStand', 'Skull', 'ShulkerBox', 'Sign', 'Lever', 'TripwireHook', 'Repeater',
  'Comparator', 'Cocoa', 'Bamboo', 'TurtleEgg', 'SeaPickle', 'SnifferEgg', 'DriedGhast', 'HeavyCore', 'Vault',
  'ChiseledBookshelf', 'Shelf', 'CrystalCluster', 'PointedDripstone', 'Conduit', 'Beacon', 'DragonEgg',
  'StoneCutter', 'SculkSensor', 'CalibratedSculkSensor', 'SculkShrieker', 'FlowerPot', 'ItemFrame',
  'GlowItemFrame', 'BlockActorRendererOnly', 'ChemistryTable', 'FacingBlock', 'Terracotta', 'Piston',
  'CommandBlock', 'EndPortal', 'EndGateway', 'SlimeBlock', 'HoneyBlock', 'DriedKelpBlock', 'MangroveRoot',
  'ChorusPlant', 'ChorusFlower', 'CartographyTable', 'ElementBlock', 'Azalea', 'BigDripleaf', 'SmallDripleaf',
  'FrogSpawn', 'Tripwire', 'Bed', 'Chest']) {
  G[shape] = (state, ctx) => boxShape(state, ctx)
}

// chests, beds, heads and signs as their block entity renderers draw them (./entity.js), else as their boxes
for (const [shape, draw] of [['Chest', entity.chest], ['Bed', entity.bed], ['Skull', entity.skull], ['Sign', entity.sign]]) {
  G[shape] = (state, ctx) => (ctx.geometry && draw(state, ctx)) || boxShape(state, ctx)
}

G.TopSnow = (state, ctx) => result(boxesToElements(stateBoxes(state, { prefer: 'outline' }), ctx.tintFaces), textureVars(ctx.faces))

// A door, laid out as the client draws it (the classic door models): a slab 3 thick along the west side of a door that
// faces east, turned to the door's facing, and an open door a quarter turn further about its hinge; drawn with the half
// it is (its faces all that half's texture), its UVs mirrored by hinge and openness as the handle goes. Its collision
// shape is no help: the client's is the same for every state. The legacy direction is the facing (0 east, 1 south, 2
// west, 3 north); minecraft:cardinal_direction runs a quarter turn on from it (south for a door facing east). Only the
// lower half's direction and openness and only the upper half's hinge count: prismarine-viewer gives each half the
// other's (viewer/lib/models.js).
const DOOR_FACING = ['east', 'south', 'west', 'north']
const DOOR_CARDINAL = { south: 'east', west: 'south', north: 'west', east: 'north' }
const DOOR_Y = { east: 0, south: 90, west: 180, north: 270 }
// the faces' UVs ([uv, rotation]) by hinge and openness: the sides, the bottom half's down, the upper half's up
const DOOR_UV = {
  left: { north: [3, 0, 0, 16], south: [0, 0, 3, 16], west: [0, 0, 16, 16], east: [16, 0, 0, 16], down: [[16, 13, 0, 16], 90], up: [[0, 3, 16, 0], 90] },
  left_open: { north: [0, 0, 3, 16], south: [0, 0, 3, 16], west: [16, 0, 0, 16], east: [0, 0, 16, 16], down: [[0, 16, 16, 13], 90], up: [[0, 3, 16, 0], 270] },
  right: { north: [3, 0, 0, 16], south: [0, 0, 3, 16], west: [16, 0, 0, 16], east: [0, 0, 16, 16], down: [[0, 13, 16, 16], 90], up: [[0, 0, 16, 3], 270] },
  right_open: { north: [3, 0, 0, 16], south: [3, 0, 0, 16], west: [0, 0, 16, 16], east: [16, 0, 0, 16], down: [[16, 16, 0, 13], 90], up: [[0, 0, 16, 3], 90] }
}

function doorFacing (props) {
  if (props['minecraft:cardinal_direction']) return DOOR_CARDINAL[props['minecraft:cardinal_direction']] ?? 'east'
  return DOOR_FACING[+(props.direction ?? 0)] ?? 'east'
}

G.Door = (state, ctx) => {
  const { props } = state
  const upper = props.upper_block_bit === '1'
  const right = props.door_hinge_bit === '1'
  const open = props.open_bit === '1'
  const uv = DOOR_UV[(right ? 'right' : 'left') + (open ? '_open' : '')]
  const faces = {}
  for (const side of ['north', 'south', 'west', 'east']) {
    faces[side] = { texture: '#door', uv: uv[side] }
    if (side !== 'east') faces[side].cullface = side
  }
  const end = upper ? 'up' : 'down'
  faces[end] = { texture: '#door', uv: uv[end][0], rotation: uv[end][1], cullface: end }
  const y = (DOOR_Y[doorFacing(props)] + (open ? (right ? 270 : 90) : 0)) % 360
  return result([{ from: [0, 0, 0], to: [3, 16, 16], faces }], { door: ctx.faces[2], particle: ctx.faces[2] }, { ao: false, y })
}

// a ladder is a plane against the wall its thin collision box leans on
G.Ladder = (state, ctx) => {
  const boxes = state.collision?.length ? stateBoxes(state) : []
  if (boxes.length === 0) return null
  const [[from, to]] = boxes
  const size = [0, 1, 2].map(i => to[i] - from[i])
  const axis = size.indexOf(Math.min(...size))
  const at = from[axis] === 0 ? 0.8 : 15.2
  const f = [...from]
  const t = [...to]
  f[axis] = t[axis] = at
  return result([box(f, t, { texture: 'ladder', cull: false })], { ladder: ctx.faces[2], particle: ctx.faces[2] }, { ao: false })
}

// plants: the texture the tessellator draws (faces[2], or the half of a double plant) on two crossed planes
for (const shape of ['CrossTexture', 'DoublesidedWideCrossTexture', 'DoublesidedDoublePlant', 'Seagrass', 'Kelp',
  'WeepingVine', 'TwistingVine', 'CaveVine', 'SweetBerryBush', 'MangrovePropagule', 'BambooSapling', 'Eyeblossom',
  'FireflyBush', 'PitcherPlant', 'PitcherCrop', 'CoralFan', 'Fire', 'Stem', 'SporeBlossom']) {
  G[shape] = (state, ctx) => {
    const texture = ctx.faces[2]
    return result(crossElements('cross', ctx.tintTexture(texture)), { cross: texture, particle: texture }, { ao: false })
  }
}
G.DoublesidedRows = (state, ctx) => {
  const texture = ctx.faces[2]
  return result(rowElements('crop', ctx.tintTexture(texture)), { crop: texture, particle: texture }, { ao: false })
}

// a torch: a 2 x 10 stick of the texture's middle columns; on a wall, leaning out from it by 22.5 degrees, turned to
// the side the state's outline lies on
const TORCH_UV = { down: [7, 13, 9, 15], up: [7, 6, 9, 8], north: [7, 6, 9, 16], south: [7, 6, 9, 16], west: [7, 6, 9, 16], east: [7, 6, 9, 16] }
function torchElement (from, to, rotation, texture = 'torch') {
  const el = { from, to, shade: false, faces: {} }
  if (rotation) el.rotation = rotation
  // (a shorter stick, a redstone torch on a repeater, shows the top of the texture's)
  const height = to[1] - from[1]
  for (const dir of DIRS) {
    const uv = TORCH_UV[dir]
    el.faces[dir] = { texture: '#' + texture, uv: dir === 'up' || dir === 'down' ? uv : [uv[0], uv[1], uv[2], uv[1] + height] }
  }
  return el
}
G.Torch = (state, ctx) => {
  const facing = state.props.torch_facing_direction
  const textures = { torch: ctx.faces[2], particle: ctx.faces[2] }
  if (!facing || facing === 'top' || facing === 'unknown') {
    return result([torchElement([7, 0, 7], [9, 10, 9])], textures, { ao: false })
  }
  // against the west wall (x = 0), the top leaning east
  const elements = [torchElement([-1, 3.5, 7], [1, 13.5, 9], { origin: [0, 3.5, 8], axis: 'z', angle: -22.5 })]
  return result(elements, textures, { ao: false, y: fitRotationY(elements, state.outline) })
}

// The rotation (x, then y) among `candidates` that brings the elements' bounds closest to the state's selection box:
// for the blocks whose states name their placement in words the client turns its model by
function fitRotation (elements, outline, candidates) {
  if (!outline) return candidates[0]
  const want = [outline[0] + outline[3], outline[1] + outline[4], outline[2] + outline[5]].map(v => v * 8)
  let best = candidates[0]
  let bestDist = Infinity
  for (const c of candidates) {
    const lo = [Infinity, Infinity, Infinity]
    const hi = [-Infinity, -Infinity, -Infinity]
    for (const el of elements) {
      const [from, to] = rotateBox(el.from, el.to, c.x, c.y)
      for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], from[i]); hi[i] = Math.max(hi[i], to[i]) }
    }
    const d = Math.hypot(...[0, 1, 2].map(i => (lo[i] + hi[i]) / 2 - want[i]))
    if (d < bestDist - 1e-6) { bestDist = d; best = c }
  }
  return best
}
const PLACEMENTS = [{ x: 0, y: 0 }, { x: 0, y: 90 }, { x: 180, y: 0 }, { x: 180, y: 90 }, { x: 90, y: 0 }, { x: 90, y: 90 }, { x: 90, y: 180 }, { x: 90, y: 270 }]

// a lever: its base (the client's lever_particle face: cobblestone) and the handle, leaning one way off and the other
// on, laid out on a floor along north-south and turned to the side of the block its selection box is on
G.Lever = (state, ctx) => {
  const base = ctx.faces[5]
  const handle = ctx.faces[2]
  const on = state.props.open_bit === '1'
  const elements = [
    box([5, 0, 4], [11, 3, 12], { texture: 'base' }),
    torchElement([7, 1, 7], [9, 11, 9], { origin: [8, 1, 8], axis: 'x', angle: on ? -45 : 45 }, 'handle')
  ]
  // the axis of a floor or ceiling lever is its state's own; a wall lever's comes with its wall
  const axis = /_east_west$/.test(state.props.lever_direction ?? '') ? 90 : 0
  const candidates = /^(up|down)_/.test(state.props.lever_direction ?? '')
    ? PLACEMENTS.filter(p => p.x !== 90 && p.y === axis)
    : PLACEMENTS.filter(p => p.x === 90)
  const rot = fitRotation(elements.slice(0, 1), state.outline, candidates)
  return result(elements, { base, handle, particle: base }, rot)
}

// repeaters and comparators: the slab with the arrow on top, and the redstone torches standing on it (a repeater's
// second one by its delay, a comparator's front one lit in subtract mode); laid out facing north, turned by y to the
// state's direction (0 south, 1 west, 2 north, 3 east)
function diode (state, ctx, torches) {
  const lit = /^powered_/.test(state.name) || state.props.output_lit_bit === '1'
  const torch = ctx.ref(`textures/blocks/redstone_torch_${lit ? 'on' : 'off'}`) ?? ctx.faces[2]
  const elements = [box([0, 0, 0], [16, 2, 16])]
  for (const [x, z, on] of torches) {
    const t = on === undefined ? 'torch' : on ? 'torch_on' : 'torch_off'
    elements.push(torchElement([x - 1, 2, z - 1], [x + 1, 7, z + 1], null, t))
  }
  const textures = { ...textureVars(ctx.faces), torch, torch_on: ctx.ref('textures/blocks/redstone_torch_on') ?? torch, torch_off: ctx.ref('textures/blocks/redstone_torch_off') ?? torch }
  const facing = state.props['minecraft:cardinal_direction'] ?? ['south', 'west', 'north', 'east'][+(state.props.direction ?? 0)]
  const y = { north: 0, east: 90, south: 180, west: 270 }[facing] ?? 0
  return result(elements, textures, { y })
}
G.Repeater = (state, ctx) => diode(state, ctx, [[8, 3], [8, 7 + 2 * +(state.props.repeater_delay ?? 0)]])
G.Comparator = (state, ctx) => diode(state, ctx, [[4, 11], [12, 11], [8, 2, state.props.output_subtract_bit === '1']])

// a lantern: its body and cap, and the handle (standing) or chain (hanging) as two crossed planes, from the texture's
// layout: sides 0..6 x 2..9, top 0..6 x 9..15, cap sides 1..5 x 0..2, handle 11..14
G.Lantern = (state, ctx) => {
  const hanging = state.props.hanging === '1'
  const dy = hanging ? 1 : 0
  const faces = (uvSide, uvTop) => Object.fromEntries(DIRS.map(d => [d, { texture: '#lantern', uv: d === 'up' || d === 'down' ? uvTop : uvSide }]))
  const elements = [
    { from: [5, dy, 5], to: [11, 7 + dy, 11], faces: faces([0, 2, 6, 9], [0, 9, 6, 15]) },
    { from: [6, 7 + dy, 6], to: [10, 9 + dy, 10], faces: faces([1, 0, 5, 2], [1, 10, 5, 14]) }
  ]
  const handle = hanging ? { y0: 10, y1: 16, uv: [11, 1, 14, 7] } : { y0: 9, y1: 11, uv: [11, 10, 14, 12] }
  const rotation = { origin: [8, 8, 8], axis: 'y', angle: 45 }
  elements.push(
    plane([6.5, handle.y0, 8], [9.5, handle.y1, 8], ['north', 'south'], 'lantern', { uv: handle.uv, rotation }),
    plane([8, handle.y0, 6.5], [8, handle.y1, 9.5], ['west', 'east'], 'lantern', { uv: handle.uv, rotation })
  )
  return result(elements, { lantern: ctx.faces[2], particle: ctx.faces[2] })
}

// rails: a plane 1 above the floor, or rising 45 degrees over the block; rail_direction 0 N-S, 1 E-W, 2..5 ascending
// east, west, north, south, 6..9 curves S-E, S-W, N-W, N-E. The straight texture runs north-south, the curved one
// joins south and east.
const RAIL_ASCENDING = { 2: 'east', 3: 'west', 4: 'north', 5: 'south' }
const RAIL_CURVES = { 6: ['south', 'east'], 7: ['south', 'west'], 8: ['north', 'west'], 9: ['north', 'east'] }
G.Rail = (state, ctx) => {
  const dir = +(state.props.rail_direction ?? 0)
  const texture = ctx.faces[2]
  const textures = { rail: texture, particle: texture }
  const flat = () => [plane([0, 1, 0], [16, 1, 16], ['up', 'down'], 'rail')]
  if (RAIL_ASCENDING[dir]) {
    // rising toward the north, turned to its own side
    const d = 8 * Math.SQRT2
    const elements = [plane([0, 9, 8 - d], [16, 9, 8 + d], ['up', 'down'], 'rail', { rotation: { origin: [8, 9, 8], axis: 'x', angle: -45 } })]
    const y = [0, 90, 180, 270].find(r => rotateDir('north', 0, r) === RAIL_ASCENDING[dir])
    return result(elements, textures, { ao: false, y })
  }
  if (RAIL_CURVES[dir]) {
    const want = RAIL_CURVES[dir]
    const y = [0, 90, 180, 270].find(r => ['south', 'east'].map(s => rotateDir(s, 0, r)).every(s => want.includes(s)))
    return result(flat(), textures, { ao: false, y })
  }
  return result(flat(), textures, { ao: false, y: dir === 1 ? 90 : 0 })
}

// redstone dust, by its connection to each side (minecraft:connection_<side>: none, side, up), which no Bedrock state
// has and prismarine-viewer works out from the neighbours: unconnected, the whole cross (its up texture); connected
// along one axis only, the line (its side texture) across the block; else the cross's middle and its arm to each
// connected side. Up each side it climbs, the line up the face of the block there.
G.RedDust = (state, ctx) => {
  const [line, cross] = ctx.faces
  const c = connections(state.props, 'minecraft:connection_') ?? {}
  const on = side => (c[side] ?? 'none') !== 'none'
  const textures = { cross, line, particle: cross }
  const flat = ([x0, z0], [x1, z1], texture, extra) => result([plane([x0, 0.25, z0], [x1, 0.25, z1], ['up', 'down'], texture,
    { uv: [x0, z0, x1, z1], tint: ctx.tintTexture(textures[texture]) })], textures, { ao: false, ...extra })
  const alongZ = on('north') || on('south')
  const alongX = on('east') || on('west')
  const out = []
  if (!alongZ && !alongX) out.push(flat([0, 0], [16, 16], 'cross'))
  else if (!alongX) out.push(flat([0, 0], [16, 16], 'line', { y: 90 }))
  else if (!alongZ) out.push(flat([0, 0], [16, 16], 'line'))
  else {
    out.push(flat([5, 5], [11, 11], 'cross'))
    const arms = { north: [[5, 0], [11, 5]], east: [[11, 5], [16, 11]], south: [[5, 11], [11, 16]], west: [[0, 5], [5, 11]] }
    for (const side of SIDES) if (on(side)) out.push(flat(...arms[side], 'cross'))
  }
  for (const side of SIDES) {
    if (c[side] !== 'up') continue
    const up = plane([0, 0, 0.25], [16, 16, 0.25], ['north', 'south'], 'line', { tint: ctx.tintTexture(line) })
    for (const face of Object.values(up.faces)) face.rotation = 90
    out.push(result([up], textures, { ao: false, y: ARM_Y[side] }))
  }
  return parts(out)
}

G.Lilypad = (state, ctx) => {
  const texture = ctx.faces[1]
  return result([plane([0, 0.25, 0], [16, 0.25, 16], ['up', 'down'], 'pad', { tint: ctx.tintTexture(texture) })], { pad: texture, particle: texture }, { ao: false })
}

for (const shape of ['FlowerBed', 'PaleMossCarpet']) {
  G[shape] = (state, ctx) => {
    const texture = ctx.faces[1]
    return result([plane([0, 1, 0], [16, 1, 16], ['up', 'down'], 'top', { tint: ctx.tintTexture(texture) })], { top: texture, particle: texture }, { ao: false })
  }
}

// vine_direction_bits: 1 south, 2 west, 4 north, 8 east; none: under the block above
G.Vine = (state, ctx) => {
  const bits = +(state.props.vine_direction_bits ?? 0)
  const texture = ctx.faces[2]
  const tint = ctx.tintTexture(texture)
  const sides = [['south', 1], ['west', 2], ['north', 4], ['east', 8]].filter(([, b]) => bits & b).map(([d]) => d)
  if (sides.length === 0) sides.push('up')
  return result(sides.map(d => sidePlane(d, 'vine', tint)), { vine: texture, particle: texture }, { ao: false })
}

// multi_face_direction_bits: a bit per face, down, up, north, south, west, east (glow lichen, sculk vein)
G.MultifaceBlock = (state, ctx) => {
  const bits = +(state.props.multi_face_direction_bits ?? 0)
  const texture = ctx.faces[2]
  const tint = ctx.tintTexture(texture)
  const sides = DIRS.filter((d, i) => bits & (1 << i))
  if (sides.length === 0) return null
  return result(sides.map(d => sidePlane(d, 'face', tint)), { face: texture, particle: texture }, { ao: false })
}

// the four horizontal sides and what the states call their connection
const SIDES = ['north', 'east', 'south', 'west']
function connections (props, prefix) {
  const known = SIDES.filter(s => props[prefix + s] !== undefined)
  return known.length ? Object.fromEntries(SIDES.map(s => [s, props[prefix + s]])) : null
}

// A block of a post and an arm to each connected side is drawn as several parts: the post, and one arm model turned
// by y to each side (a multipart blockstate, as Java has for these).
const ARM_Y = { north: 0, east: 90, south: 180, west: 270 }
const parts = list => ({ parts: list })

// fences: the client's fence tessellator boxes, the post (mask 0) and the arms (the boxes a side's bit adds), from the
// states' connections (1.26.50 on), else the post alone
G.Fence = (state, ctx) => {
  const c = connections(state.props, 'minecraft:connection_')
  const table = ctx.tessellator?.fence
  const post = table?.[0] ?? [[0.375, 0, 0.375, 0.625, 1, 0.625]]
  const toElements = boxes => boxesToElements(boxes.map(toElementBox).filter(Boolean), ctx.tintFaces)
  const out = [result(toElements(post), textureVars(ctx.faces))]
  const key = b => b.join(',')
  const arm = table && (table[1] ?? []).filter(b => !post.some(p => key(p) === key(b)))
  for (const side of SIDES) {
    if (!c || c[side] !== '1' || !arm?.length) continue
    out.push(result(toElements(arm), textureVars(ctx.faces), { y: ARM_Y[side] }))
  }
  return parts(out)
}

// panes and bars: a thin sheet to each connected side (1.26.50 on); unconnected, the client draws them across both
// axes. The sheet's sides take the side texture, its edges the top one.
G.DoubleSideFence = (state, ctx) => {
  const c = connections(state.props, 'minecraft:connection_')
  const sides = c ? SIDES.filter(s => c[s] === '1') : []
  const texture = { up: 'edge', down: 'edge', north: 'pane', south: 'pane', west: 'pane', east: 'pane' }
  const textures = { pane: ctx.faces[2], edge: ctx.faces[1], particle: ctx.faces[2] }
  const out = [result([box([7, 0, 7], [9, 16, 9], { texture })], textures)]
  for (const side of sides.length ? sides : SIDES) out.push(result([box([7, 0, 0], [9, 16, 7], { texture })], textures, { y: ARM_Y[side] }))
  return parts(out)
}
G.MetalBars = G.DoubleSideFence

// walls: the post where wall_post_bit says, and an arm of 14 (short) or 16 (tall) to each connected side
G.Wall = (state, ctx) => {
  const p = state.props
  const textures = textureVars(ctx.faces)
  const out = []
  for (const side of SIDES) {
    const kind = p['wall_connection_type_' + side]
    if (!kind || kind === 'none') continue
    out.push(result([box([5, 0, 0], [11, kind === 'tall' ? 16 : 14, 8])], textures, { y: ARM_Y[side] }))
  }
  // (a wall of no post and no arms draws its post)
  if (p.wall_post_bit !== '0' || !out.length) out.unshift(result([box([4, 0, 4], [12, 16, 12])], textures))
  return parts(out)
}

// fence gates: two posts and the bars between them across the block (facing south / north), or swung open; 3 lower
// in a wall. direction: 0 south, 1 west, 2 north, 3 east
G.FenceGate = (state, ctx) => {
  const p = state.props
  const down = p.in_wall_bit === '1' ? 3 : 0
  const b = (from, to) => box([from[0], from[1] - down, from[2]], [to[0], to[1] - down, to[2]], { texture: 'gate' })
  const elements = [b([0, 5, 7], [2, 16, 9]), b([14, 5, 7], [16, 16, 9])]
  if (p.open_bit === '1') {
    elements.push(
      b([0, 6, 13], [2, 15, 15]), b([14, 6, 13], [16, 15, 15]),
      b([0, 6, 9], [2, 9, 13]), b([0, 12, 9], [2, 15, 13]),
      b([14, 6, 9], [16, 9, 13]), b([14, 12, 9], [16, 15, 13]))
  } else {
    elements.push(
      b([6, 6, 7], [8, 15, 9]), b([8, 6, 7], [10, 15, 9]),
      b([2, 6, 7], [6, 9, 9]), b([2, 12, 7], [6, 15, 9]),
      b([10, 6, 7], [14, 9, 9]), b([10, 12, 7], [14, 15, 9]))
  }
  const facing = p['minecraft:cardinal_direction'] ?? ['south', 'west', 'north', 'east'][+(p.direction ?? 0)]
  const y = { south: 0, west: 90, north: 180, east: 270 }[facing] ?? 0
  return result(elements, { gate: ctx.faces[2], particle: ctx.faces[2] }, { y })
}

// the states the render table knows nothing of: a box where they collide or are low, two crossed planes otherwise
function fallback (state, ctx) {
  if (state.collision?.length) return boxShape(state, ctx)
  const shape = state.outline
  if (!shape) return null
  const [[from, to]] = [shape].map(toElementBox).filter(Boolean).concat([[[0, 0, 0], [16, 16, 16]]])
  if (to[1] - from[1] <= 3.2) return result([box(from, to, { tint: ctx.tintFaces })], textureVars(ctx.faces))
  const texture = ctx.faces[2]
  return result(crossElements('cross', ctx.tintTexture(texture)), { cross: texture, particle: texture }, { ao: false })
}

// the blocks a block entity renderer alone draws (their tessellator shape Invisible or BlockActorRendererOnly): as it
// lays them out (./entity.js)
const RENDERERS = [
  [/^(standing|wall)_banner$/, entity.banner],
  [/^decorated_pot$/, entity.decoratedPot],
  [/copper_golem_statue$/, entity.statue]
]

function generate (state, ctx) {
  const renderer = ctx.geometry && RENDERERS.find(([pattern]) => pattern.test(state.name))?.[1]
  const drawn = renderer && renderer(state, ctx)
  if (drawn) return drawn
  const generator = ctx.shape ? G[ctx.shape] : null
  return generator ? generator(state, ctx) : fallback(state, ctx)
}

module.exports = { generate, generators: G, stateBoxes, crossElements }
