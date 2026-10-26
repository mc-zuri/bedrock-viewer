// One page's showing of a scene (scenes.js's buildScene): its version, its framing, its chunks, its entities (one
// walking to and fro), its particle effects every second or few, its toggles (chests' lids, doors, barrels and
// pistons opened and shut every few seconds) and its story (story.js), on ticks of 50 ms; and what the page asks of it:
// a block's info (a click), the story's next part (skip). The example's server (server.js) runs one a socket.io
// connection; the site runs one in a Web Worker (site/src/sceneServer.js).
//
// emit(event, data): to the page. models: the version's client entities ({ 'minecraft:<name>': ... }), the entities
// the version has models of. skin: a player's skin as a server sends it (bedrockSkin), for the scene's player of
// pixels, or undefined.
const { Vec3 } = require('vec3')
const { Director } = require('./story')

function play (scene, { emit, models = {}, skin }) {
  const { version, world, center, radius, camera, entities, particles, toggles, story, surface } = scene
  emit('version', version)
  emit('scene', { center, radius, camera, story: !!story })
  for (const column of world.columns.values()) {
    emit('loadChunk', { x: column.x * 16, z: column.z * 16, chunk: column.toJson() })
  }
  // the scene's entities the version has models of (and dropped items); one walking to and fro; its particle effects,
  // every second (or every few)
  for (const { walk, skinPixels: pixels, ...entity } of entities) {
    if (entity.name !== 'item' && !models['minecraft:' + entity.name]) continue
    emit('entity', pixels && skin ? { ...entity, bedrockSkin: skin } : entity)
  }
  // the scene's story, told to this page from its start (its actors, blocks, camera and captions)
  const director = story && new Director({ world, models, surface, emit })
  director?.play(story)
  let tick = 0
  // what is sent at a later tick (a piston's second step): tick -> [() => ...]
  const later = new Map()
  const timer = setInterval(() => {
    tick++
    director?.tick()
    for (const send of later.get(tick) ?? []) send()
    later.delete(tick)
    for (const entity of entities) {
      if (!entity.walk) continue
      const { from, to } = entity.walk
      const span = (to - from) * 20
      const t = tick % (span * 2)
      const x = from + (t < span ? t : span * 2 - t) / 20
      emit('entity', { id: entity.id, pos: { ...entity.pos, x }, yaw: t < span ? -Math.PI / 2 : Math.PI / 2 })
    }
    if (tick % 20 === 0) {
      for (const { every = 1, ...particle } of particles) if ((tick / 20) % every === 0) emit('particle', particle)
    }
    // chests' lids opened and shut by block events, doors and barrels by block updates, pistons by their block entity
    // (a step a tick) and their arm's collision block, every few seconds
    if (toggles && tick % (toggles.every * 20) === 0) {
      const open = (tick / (toggles.every * 20)) % 2 === 1
      for (const pos of toggles.lids) emit('lid', { pos, open })
      for (const { pos, states } of toggles.blocks) emit('blockUpdate', { pos, stateId: states[open ? 1 : 0] })
      for (const { pos, front, arm, air, out, back } of toggles.pistons ?? []) {
        const [first, ...rest] = open ? out : back
        emit('blockEntity', { pos, tag: first })
        rest.forEach((tag, i) => {
          const at = tick + i + 1
          if (!later.has(at)) later.set(at, [])
          later.get(at).push(() => emit('blockEntity', { pos, tag }))
        })
        emit('blockUpdate', { pos: front, stateId: open ? arm : air })
      }
    }
  }, 50)
  return {
    // what the page sends: Next (the story on to its next chapter), a click (the block it hit)
    receive (event, data) {
      if (event === 'skip') director?.skip()
      else if (event === 'mouseClick' && data.button === 0) emit('blockInfo', raycast(world, data.origin, data.direction))
    },
    stop () {
      clearInterval(timer)
      director?.stop()
    }
  }
}

// the first block a ray from the camera meets in the scene: its position, name, Bedrock state and state id
function raycast (world, origin, direction, maxDistance = 256) {
  const dir = new Vec3(direction.x, direction.y, direction.z).normalize()
  for (let t = 0; t < maxDistance; t += 0.05) {
    const pos = new Vec3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t).floored()
    const column = world.columns.get(Math.floor(pos.x / 16) + ',' + Math.floor(pos.z / 16))
    if (!column) continue
    const stateId = column.getBlockStateId(new Vec3(pos.x & 15, pos.y, pos.z & 15))
    const state = world.mcData.blockStates?.[stateId]
    if (!state || state.name === 'air') continue
    const props = Object.fromEntries(Object.entries(state.states ?? {}).map(([k, v]) => [k, v.value]))
    const tag = column.getBlockEntity?.(new Vec3(pos.x & 15, pos.y, pos.z & 15))
    const blockEntity = tag && Object.fromEntries(Object.entries(tag.value).filter(([k]) => !/^[xyz]$/.test(k)).map(([k, v]) => [k, v.value]))
    return { pos, name: state.name, props, stateId, blockEntity }
  }
  return null
}

module.exports = { play, raycast }
