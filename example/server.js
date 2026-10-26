// A Bedrock version and a scene of it, drawn by prismarine-viewer in the browser: http://localhost:3000
//
// node server.js [version] [scene] [filter]   (PORT=3001 for another port)
// The page picks another version or scene; every Bedrock version minecraft-data knows is listed, those prismarine-viewer
// has built assets for selectable.
const fs = require('fs')
const path = require('path')
const express = require('express')
const { Vec3 } = require('vec3')
const { setupRoutes } = require('prismarine-viewer/lib/common')
const { getVersion } = require('prismarine-viewer/viewer/lib/version')
const mcData = require('minecraft-data')
const { buildScene, SCENES } = require('./scenes')
const { PNG } = require('pngjs')
const { encodeSkin } = require('prismarine-viewer/viewer/lib/bedrock/entity/skinData')

const port = +(process.env.PORT ?? 3000)
const viewerPublic = path.join(path.dirname(require.resolve('prismarine-viewer/package.json')), 'public')

// every Bedrock version minecraft-data knows, newest first, with the assets version the viewer draws it with (null
// where the viewer has not built one)
const versions = [...new Set(mcData.versions.bedrock.map(v => v.minecraftVersion))].map(v => {
  const version = 'bedrock_' + v
  const assets = getVersion(version)
  const built = assets && fs.existsSync(path.join(viewerPublic, 'blocksStates', assets + '.json'))
  return { version, assets: built ? assets : null }
})

let current = null

function select (version, scene, filter) {
  if (!versions.some(v => v.version === version && v.assets)) throw new Error(`${version} has no assets built`)
  if (!SCENES.some(s => s.name === scene)) throw new Error(`no such scene ${scene}`)
  const started = Date.now()
  const built = buildScene(version, scene, filter)
  current = { version, scene, filter, ...built }
  console.log(`${version} ${scene}${filter ? ` (${filter})` : ''}: ${built.world.columns.size} columns in ${Date.now() - started} ms`)
}

// the first block a ray from the camera meets in the scene: its position, name, Bedrock state and state id
function raycast (origin, direction, maxDistance = 256) {
  const { world } = current
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

const app = express()
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')))
app.get('/client.js', (req, res) => res.sendFile(path.join(__dirname, 'public', 'client.js')))
// every entity of a version, its modes, equipment, flags, events and animations (client/entities.js)
app.get('/entities.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'entities.html')))
app.get('/entities.js', (req, res) => res.sendFile(path.join(__dirname, 'public', 'entities.js')))
// every particle effect of a version, played side by side (client/particles.js)
app.get('/particles.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'particles.html')))
app.get('/particles.js', (req, res) => res.sendFile(path.join(__dirname, 'public', 'particles.js')))
app.get('/api/state', (req, res) => res.json({
  version: current.version,
  scene: current.scene,
  filter: current.filter ?? '',
  scenes: SCENES,
  versions
}))
app.get('/api/select', (req, res) => {
  try {
    select(req.query.version ?? current.version, req.query.scene ?? current.scene, req.query.filter || undefined)
    res.json({ ok: true })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})
// the scene's columns, as the socket sends them
app.get('/api/columns', (req, res) => res.json([...current.world.columns.values()].map(c => ({ x: c.x * 16, z: c.z * 16, chunk: c.toJson() }))))
setupRoutes(app)

const http = require('http').createServer(app)
const io = require('socket.io')(http)

// the client entities of a version's assets (minecraft-assets' entities.json: { entities: { identifier: ... } }), or {}
function clientEntities (version) {
  const assets = versions.find(v => v.version === version)?.assets
  try {
    return require('minecraft-assets')(assets)?.entities?.entities ?? {}
  } catch {
    return {}
  }
}

// a player's skin as a Bedrock server sends it (player_list's skin_data), encoded as the viewer takes it
// (bedrockSkin): the version's own Steve, its colours turned round (red to green, green to blue, blue to red) to tell
// it from the default
function skinOf (version) {
  const assets = require('minecraft-assets')(versions.find(v => v.version === version)?.assets)
  try {
    const steve = clientEntities(version)['minecraft:player']?.textures?.default ?? 'textures/entity/steve'
    const png = PNG.sync.read(fs.readFileSync(assets.pathOf(steve.replace(/^textures\//, '') + '.png')))
    for (let i = 0; i < png.data.length; i += 4) [png.data[i], png.data[i + 1], png.data[i + 2]] = [png.data[i + 2], png.data[i], png.data[i + 1]]
    return encodeSkin({ skin_data: { width: png.width, height: png.height, data: png.data }, arm_size: 'wide' })
  } catch {
    return undefined
  }
}

io.on('connection', socket => {
  const { version, world, center, radius, camera, entities, particles, toggles } = current
  socket.emit('version', version)
  socket.emit('scene', { center, radius, camera })
  for (const column of world.columns.values()) {
    socket.emit('loadChunk', { x: column.x * 16, z: column.z * 16, chunk: column.toJson() })
  }
  // the scene's entities the version has models of (and dropped items); one walking to and fro; its particle effects,
  // every second (or every few)
  const models = clientEntities(version)
  for (const { walk, skinPixels: pixels, ...entity } of entities) {
    if (entity.name !== 'item' && !models['minecraft:' + entity.name]) continue
    socket.emit('entity', pixels ? { ...entity, bedrockSkin: skinOf(version) } : entity)
  }
  let tick = 0
  // what is sent at a later tick (a piston's second step): tick -> [() => ...]
  const later = new Map()
  const timer = setInterval(() => {
    tick++
    for (const send of later.get(tick) ?? []) send()
    later.delete(tick)
    for (const entity of entities) {
      if (!entity.walk) continue
      const { from, to } = entity.walk
      const span = (to - from) * 20
      const t = tick % (span * 2)
      const x = from + (t < span ? t : span * 2 - t) / 20
      socket.emit('entity', { id: entity.id, pos: { ...entity.pos, x }, yaw: t < span ? -Math.PI / 2 : Math.PI / 2 })
    }
    if (tick % 20 === 0) {
      for (const { every = 1, ...particle } of particles) if ((tick / 20) % every === 0) socket.emit('particle', particle)
    }
    // chests' lids opened and shut by block events, doors and barrels by block updates, pistons by their block entity
    // (a step a tick) and their arm's collision block, every few seconds
    if (toggles && tick % (toggles.every * 20) === 0) {
      const open = (tick / (toggles.every * 20)) % 2 === 1
      for (const pos of toggles.lids) socket.emit('lid', { pos, open })
      for (const { pos, states } of toggles.blocks) socket.emit('blockUpdate', { pos, stateId: states[open ? 1 : 0] })
      for (const { pos, front, arm, air, out, back } of toggles.pistons ?? []) {
        const [first, ...rest] = open ? out : back
        socket.emit('blockEntity', { pos, tag: first })
        rest.forEach((tag, i) => {
          const at = tick + i + 1
          if (!later.has(at)) later.set(at, [])
          later.get(at).push(() => socket.emit('blockEntity', { pos, tag }))
        })
        socket.emit('blockUpdate', { pos: front, stateId: open ? arm : air })
      }
    }
  }, 50)
  socket.on('disconnect', () => clearInterval(timer))
  socket.on('mouseClick', ({ origin, direction, button }) => {
    if (button === 0) socket.emit('blockInfo', raycast(origin, direction))
  })
})

select(process.argv[2] ?? versions.find(v => v.assets)?.version, process.argv[3] ?? 'landscape', process.argv[4])
http.listen(port, () => console.log(`Bedrock viewer example on http://localhost:${port}`))
