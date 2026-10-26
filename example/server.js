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
    return { pos, name: state.name, props, stateId }
  }
  return null
}

const app = express()
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')))
app.get('/client.js', (req, res) => res.sendFile(path.join(__dirname, 'public', 'client.js')))
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

io.on('connection', socket => {
  const { version, world, center, radius, camera } = current
  socket.emit('version', version)
  socket.emit('scene', { center, radius, camera })
  for (const column of world.columns.values()) {
    socket.emit('loadChunk', { x: column.x * 16, z: column.z * 16, chunk: column.toJson() })
  }
  socket.on('mouseClick', ({ origin, direction, button }) => {
    if (button === 0) socket.emit('blockInfo', raycast(origin, direction))
  })
})

select(process.argv[2] ?? versions.find(v => v.assets)?.version, process.argv[3] ?? 'landscape', process.argv[4])
http.listen(port, () => console.log(`Bedrock viewer example on http://localhost:${port}`))
