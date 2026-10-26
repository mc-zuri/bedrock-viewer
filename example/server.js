// A Bedrock version and a scene of it, drawn by prismarine-viewer in the browser: http://localhost:3000
//
// node server.js [version] [scene] [filter]   (PORT=3001 for another port)
// The page picks another version or scene; every Bedrock version minecraft-data knows is listed, those prismarine-viewer
// has built assets for selectable.
const fs = require('fs')
const path = require('path')
const express = require('express')
const { setupRoutes } = require('prismarine-viewer/lib/common')
const { getVersion } = require('prismarine-viewer/viewer/lib/version')
const mcData = require('minecraft-data')
const { buildScene, SCENES } = require('./scenes')
const { play } = require('./session')
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
  const built = buildScene(version, scene, filter, { drawn: require('minecraft-assets')(getVersion(version))?.blocksStates })
  current = { version, scene, filter, ...built }
  console.log(`${version} ${scene}${filter ? ` (${filter})` : ''}: ${built.world.columns.size} columns in ${Date.now() - started} ms`)
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

// a page's showing of the current scene (session.js), over its socket
io.on('connection', socket => {
  const session = play(current, { emit: (event, data) => socket.emit(event, data), models: clientEntities(current.version), skin: skinOf(current.version) })
  socket.on('disconnect', () => session.stop())
  for (const event of ['skip', 'mouseClick']) socket.on(event, data => session.receive(event, data))
})

select(process.argv[2] ?? versions.find(v => v.assets)?.version, process.argv[3] ?? 'landscape', process.argv[4])
http.listen(port, () => console.log(`Bedrock viewer example on http://localhost:${port}`))
