// Plays the gameplay page's server and client against each other in Node, over a worker_threads MessageChannel as the
// page and its worker do over theirs, and checks what a player would see (a short form of the proof of concept's
// gameplayCheck.js):
//
//   join       the client gets to play, with the hashed ids the server chose, reading every packet as it was written
//   columns    every section the client read is the server's, block for block, with its block entities
//   viewer     every column the client has, as the page hands it to the viewer (toJson), reads back in the viewer's
//              World (setVersion's blockHashes) as the same blocks
//   walk       40 ticks north on the ground: the player goes 3 blocks or more (in the showcase), and the server has
//              it where the client does
//   pathfinder mineflayer-pathfinder walks the player to a block near it: in the showcase back to where it started,
//              round a wall of glass put in its way; in a recorded world to a block it can stand on a few blocks off
//   cache      joining again with the blobs of the first join, the client lacks none
//   dimension  (--dimension nether) /dimension takes the player there: its columns, the viewer and a walk again
//
//   node gameplay/check.js [version] [--hashes on|off|on,off] [--cache on|off] [--world explore[:nether|:end]]
//                          [--dimension nether|end] [--verbose]          (in site/; by default the runs listed in RUNS)
//
// Needs Node 22.18 or later (the physics engine is TypeScript, run through its own hooks). minecraft-data is read as
// the bundles have it: lazily, only the files of GAMEPLAY_KEYS, after preload.
require('prismarine-physics/lib/ts-hooks')
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const Module = require('module')
const { MessageChannel } = require('worker_threads')
const { Vec3 } = require('vec3')
const { createLazyData, preload } = require('prismarine-viewer/viewer/lib/mcData')
const { listDataFiles } = require('prismarine-viewer/viewer/webpack/lazyDataLoader')
const { WORKER_KEYS } = require('prismarine-viewer/viewer/webpack/lazyMinecraftData')
const { GAMEPLAY_KEYS, supportsHashes } = require('./data')

// minecraft-data as the bundles have it (webpack.js): the table of lazyDataLoader.js, of Bedrock, its files read from
// disk
const dataDir = path.join(path.dirname(require.resolve('minecraft-data/package.json')), 'minecraft-data', 'data')
const { paths, files } = listDataFiles(dataDir, { keys: GAMEPLAY_KEYS, versions: type => type === 'bedrock' })
const loaders = Object.fromEntries(files.map(id => [id, async () => JSON.parse(fs.readFileSync(path.join(dataDir, id + '.json'), 'utf8'))]))
const dataJs = require.resolve('minecraft-data/data.js')
const lazy = new Module(dataJs)
lazy.filename = dataJs
lazy.loaded = true
lazy.exports = createLazyData({ paths, files: loaders })
require.cache[dataJs] = lazy
// mineflayer-pathfinder tries its moves with prismarine-physics' PlayerState: the workspace's (the Bedrock one), as
// the bundles alias it (the workspace's overrides already point the plugin there; this keeps the check honest if not)
const physicsFile = require.resolve('prismarine-physics', { paths: [path.dirname(require.resolve('mineflayer-pathfinder/package.json'))] })
if (physicsFile !== require.resolve('prismarine-physics')) {
  const physics = new Module(physicsFile)
  physics.filename = physicsFile
  physics.loaded = true
  physics.exports = require('prismarine-physics')
  require.cache[physicsFile] = physics
}

const { createServer } = require('./server/server')
const { createClient } = require('./client/client')
const { BlobStore } = require('./client/blobs')
const { G } = require('./showcaseWorld')
const { attachPathfinder } = require('./pathfinder')
const { World } = require('prismarine-viewer/viewer/lib/world')

// what the page's players start with (page.js START)
const START = { armor: { chest: 'elytra' }, hotbar: { 7: { name: 'firework_rocket', count: 64 }, 8: 'oak_boat' }, boat: true }
// the runs with no arguments: the newest version with hashed ids off and on, an older one, and the recorded world's
// overworld and nether
const RUNS = [
  { version: '1.26.51', hashes: false, cache: true },
  { version: '1.26.51', hashes: true, cache: true },
  { version: '1.21.0', hashes: false, cache: false },
  { version: '1.26.51', hashes: true, cache: true, world: 'explore', dimension: 'nether' }
]

const args = process.argv.slice(2)
const take = (name) => {
  const i = args.indexOf(name)
  return i < 0 ? undefined : args.splice(i, 2)[1]
}
const onOff = text => text === undefined ? undefined : text.split(',').map(v => v === 'on')
const verbose = args.includes('--verbose') && !!args.splice(args.indexOf('--verbose'), 1)
const given = { hashes: onOff(take('--hashes')), cache: onOff(take('--cache')), world: take('--world'), dimension: take('--dimension') }
const runs = args.length || Object.values(given).some(v => v !== undefined)
  ? (args.length ? args : ['1.26.51']).flatMap(version =>
      (given.hashes ?? [false, true]).filter(h => !h || supportsHashes(version)).flatMap(hashes =>
        (given.cache ?? [true]).map(cache => ({ version, hashes, cache, world: given.world, dimension: given.dimension }))))
  : RUNS

// a recorded world (site/static/worlds/<name>, and a dimension of it: explore:nether), as the worker loads it
function loadWorld (name) {
  const [world, dimension = 'overworld'] = name.split(':')
  const dir = path.join(__dirname, '..', 'static', 'worlds')
  return {
    meta: JSON.parse(fs.readFileSync(path.join(dir, world + '.json'), 'utf8')),
    bin: zlib.gunzipSync(fs.readFileSync(path.join(dir, world + '.bin'))),
    dimension
  }
}

// lets messages cross the ports and the client's packets be handled
const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve))
}

const pendingSections = client => [...client.chunks.requested.values()].some(sections => sections.size)

// A server and a client of a version, joined, with every column within the radius and its sections; a fake clock the
// check moves on
async function join (version, { cache, hashes, blobStore, recorded, log }) {
  let time = 0
  const server = createServer({ version, hashes, world: recorded, ...START, verify: true, log })
  const { port1, port2 } = new MessageChannel()
  const connection = server.accept(port2)
  const client = createClient({ port: port1, version, cache, blobStore, verify: true, now: () => time })
  const problems = []
  client.on('problem', text => problems.push(text))
  const session = {
    server,
    connection,
    client,
    problems,
    // a tick of both: the server sends what it has to, the client steps the player
    async tick (n = 1) {
      for (let i = 0; i < n; i++) {
        server.step()
        time += 50
        client.tick()
        await settle()
      }
      await client.chain
    },
    async until (what, ticks, test) {
      for (let i = 0; i < ticks; i++) {
        if (test()) return
        await session.tick()
      }
      if (!test()) throw new Error(`${what}: not in ${ticks} ticks (client ${client.stage}, server ${connection.stage}; ${problems.join('; ')})`)
    },
    settled: () => client.stage === 'playing' && connection.chunks.settled && !pendingSections(client) && client.stats.blobs.pending === 0 && blobStore.waiters.length === 0,
    close () {
      client.close()
      server.close()
      port1.close()
      port2.close()
    }
  }
  await session.until('join', 200, () => client.stage === 'playing')
  await session.until('the world', 600, session.settled)
  await session.tick(2)
  return session
}

// the first difference between the server's columns of a dimension and the client's
function compareColumns (server, client, dimension) {
  let columns = 0
  let sections = 0
  for (const name of client.chunks.loaded) {
    const [cx, cz] = name.split(',').map(Number)
    const theirs = client.chunks.columns.get(name)
    const ours = server.column(cx, cz, dimension)
    columns++
    for (let sy = ours.minCY; sy < ours.maxCY; sy++) {
      if (!ours.getSectionAtIndex(sy) && !theirs.getSectionAtIndex(sy)) continue
      sections++
      for (let y = sy * 16; y < sy * 16 + 16; y++) {
        for (let x = 0; x < 16; x++) {
          for (let z = 0; z < 16; z++) {
            for (const l of [0, 1]) {
              const air = server.registry.blocksByName.air.defaultState
              const want = ours.getBlockStateId({ x, y, z, l }) ?? air
              const got = theirs.getBlockStateId({ x, y, z, l }) ?? air
              if (want !== got) return { columns, sections, wrong: `${cx * 16 + x},${y},${cz * 16 + z} layer ${l}: ${want} read as ${got}` }
            }
          }
        }
      }
    }
    const wanted = Object.keys(ours.blockEntities).sort().join(';')
    const got = Object.keys(theirs.blockEntities).sort().join(';')
    if (wanted !== got) return { columns, sections, wrong: `block entities of ${cx},${cz}: ${wanted} read as ${got}` }
  }
  return { columns, sections, wrong: null }
}

// Every column of the client, handed to the viewer's World as the page hands it (toJson, viewer.setVersion's
// blockHashes from start_game): the first block that reads otherwise, of a sample of each column's blocks
function compareViewer (client) {
  const version = 'bedrock_' + client.version
  const blockHashes = client.registry.supportFeature('blockHashes') && !!client.startGame?.block_network_ids_are_hashes
  const world = new World(version, { blockHashes })
  let columns = 0
  let blocks = 0
  let entities = 0
  for (const [name, column] of client.chunks.columns) {
    if (!client.chunks.loaded.has(name)) continue
    const [cx, cz] = name.split(',').map(Number)
    let json
    try {
      json = column.toJson()
    } catch (err) {
      return { columns, blocks, wrong: `column ${name}: toJson threw ${err.message}` }
    }
    world.addColumn(cx * 16, cz * 16, json)
    columns++
    entities += Object.keys(world.getColumn(cx * 16, cz * 16).blockEntities ?? {}).length
    for (let y = column.minCY * 16; y < column.maxCY * 16; y += 3) {
      for (let x = 0; x < 16; x += 5) {
        for (let z = 0; z < 16; z += 5) {
          const stateId = column.getBlockStateId({ x, y, z, l: 0 })
          if (stateId === undefined) continue
          const want = client.registry.blocksByStateId[stateId]?.name
          const got = world.getBlock(new Vec3(cx * 16 + x, y, cz * 16 + z))?.name
          blocks++
          if (want !== got) return { columns, blocks, wrong: `${cx * 16 + x},${y},${cz * 16 + z}: ${want} (${stateId}) drawn as ${got}` }
        }
      }
    }
  }
  return { columns, blocks, entities, wrong: null }
}

// The blocks near the player it can stand in (a solid block under it, room for its body and around its head, no
// liquid), from 3 to `far` blocks off and `high` above or below, nearest first
function standingPlaces (client, far = 8, high = 3) {
  const world = client.movement.world
  const at = client.player.pos.floored()
  const solid = pos => !!world.getBlock(pos)?.shapes?.length
  const open = pos => { const b = world.getBlock(pos); return b && !b.shapes?.length && !/water|lava/.test(b.name) }
  const places = []
  for (let dx = -far; dx <= far; dx++) {
    for (let dz = -far; dz <= far; dz++) {
      const d = Math.hypot(dx, dz)
      if (d < 3 || d > far) continue
      for (let dy = -high; dy <= high; dy++) {
        const pos = at.offset(dx, dy, dz)
        if (solid(pos.offset(0, -1, 0)) && open(pos) && open(pos.offset(0, 1, 0)) && open(pos.offset(0, 2, 0))) places.push({ pos, d: d + Math.abs(dy) })
      }
    }
  }
  return places.sort((a, b) => a.d - b.d).map(p => p.pos)
}

// One walk of the pathfinder: how it ended, and where the player is
async function walk (session, pathfinder, goal, ticks = 800) {
  const { client, connection } = session
  let ended = null
  const onEnd = reason => { ended = reason }
  // (why the hands failed, when they did: the pathfinder says so)
  const said = new Set()
  const onMessage = text => { if (/^pathfinder: /.test(text)) said.add(text.slice(12)) }
  pathfinder.on('end', onEnd)
  client.on('message', onMessage)
  const refused = pathfinder.goTo(goal)
  if (!refused) await session.until(`the walk to ${goal.x} ${goal.y} ${goal.z}`, ticks, () => ended !== null)
  pathfinder.off('end', onEnd)
  client.off('message', onMessage)
  if (refused) return { ended: `refused: ${refused}` }
  await session.tick(3)
  if (ended !== 'arrived' && said.size) ended += ` (${[...said].join('; ')})`
  const at = client.player.pos
  const feet = connection.feet
  const agrees = Math.abs(feet.x - at.x) < 1e-3 && Math.abs(feet.y - at.y) < 1e-3 && Math.abs(feet.z - at.z) < 1e-3
  return { ended, at: at.clone(), agrees }
}

// the checks of one dimension a session plays: its columns, the viewer, a walk north and a walk of the pathfinder
async function playDimension (session, row, fail, { recorded, dimension }) {
  const { server, connection, client } = session
  const prefix = dimension ? `${['overworld', 'nether', 'end'][dimension]}: ` : ''
  const compared = compareColumns(server, client, dimension)
  row.notes.push(`${prefix}${compared.columns} columns, ${compared.sections} sections the same as the server's`)
  if (compared.wrong) fail(`${prefix}columns: ${compared.wrong}`)
  if (!compared.columns) fail(`${prefix}no columns`)
  const viewer = compareViewer(client)
  row.notes.push(`${prefix}viewer read ${viewer.columns} columns (${viewer.blocks} blocks sampled, ${viewer.entities ?? 0} block entities) as the client has them`)
  if (viewer.wrong) fail(`${prefix}viewer: ${viewer.wrong}`)

  // walk north (yaw 0): in the showcase along the lane clear to the world's edge
  const start = client.player.pos.clone()
  client.setLook(0, 0)
  client.setControl('forward', true)
  await session.tick(40)
  client.setControl('forward', false)
  await session.tick(5)
  const walked = start.z - client.player.pos.z
  row.notes.push(`${prefix}walked ${walked.toFixed(2)} blocks north in 40 ticks`)
  if (!recorded && walked < 3) fail(`walked ${walked.toFixed(2)} blocks`)
  if (!recorded && Math.abs(client.player.pos.y - G) > 1e-3) fail(`feet at ${client.player.pos.y} after the walk`)
  const feet = connection.feet
  if (Math.abs(feet.x - client.player.pos.x) > 1e-3 || Math.abs(feet.z - client.player.pos.z) > 1e-3) fail(`${prefix}the server has the player at ${feet.x},${feet.z}, the client at ${client.player.pos.x},${client.player.pos.z}`)

  // the pathfinder, planning a slice of nodes a tick (the same every run): in the showcase back to the start round a
  // wall of glass across the lane; in a recorded world to the nearest place it gets to of a few near the player
  const pathfinder = attachPathfinder(client, { humanLike: true }, { thinkMs: Infinity, tickMs: Infinity, tickNodes: 200 })
  try {
    if (!recorded) {
      const back = { x: Math.floor(start.x), y: G, z: Math.floor(start.z) }
      client.chat(`/fill -1 ${G} ${back.z - 3} 1 ${G + 1} ${back.z - 3} glass`)
      await session.tick(3)
      const result = await walk(session, pathfinder, back)
      row.notes.push(`${prefix}pathfinder to ${back.x} ${back.y} ${back.z} round a wall: ${result.ended}${result.at ? ` at ${result.at}` : ''}`)
      if (result.ended !== 'arrived') fail(`pathfinder: ${result.ended}`)
      else if (Math.floor(result.at.x) !== back.x || Math.floor(result.at.y + 1e-3) !== back.y || Math.floor(result.at.z) !== back.z) fail(`pathfinder: at ${result.at}`)
      if (result.agrees === false) fail('pathfinder: the server has the player elsewhere')
    } else {
      const tried = []
      let arrived = null
      const walkNear = async () => {
        for (const goal of standingPlaces(client).slice(0, 3)) {
          const result = await walk(session, pathfinder, goal, 400)
          tried.push(`${goal.x} ${goal.y} ${goal.z} ${result.ended}`)
          if (result.agrees === false) fail(`${prefix}pathfinder: the server has the player elsewhere`)
          if (result.ended === 'arrived') return { goal, at: result.at }
        }
        return null
      }
      arrived = await walkNear()
      // (a spawn shut in, as the recorded nether's is, in a nook of the netherrack: from the nearest open place)
      const open = arrived ? null : standingPlaces(client, 24, 16)[0]
      if (open) {
        tried.push(`/tp ${open.x} ${open.y} ${open.z}`)
        client.chat(`/tp ${open.x + 0.5} ${open.y} ${open.z + 0.5}`)
        await session.until('the world round the open place', 600, session.settled)
        await session.tick(10)
        arrived = await walkNear()
      }
      row.notes.push(`${prefix}pathfinder: ${tried.join(', ') || 'no place to stand near the player'}`)
      if (!arrived) fail(`${prefix}pathfinder arrived nowhere near the player`)
      else if (Math.floor(arrived.at.x) !== arrived.goal.x || Math.floor(arrived.at.z) !== arrived.goal.z) fail(`${prefix}pathfinder: at ${arrived.at}`)
    }
  } finally {
    pathfinder.close()
  }
}

async function play ({ version, hashes, cache, world, dimension }) {
  const row = { ok: true, notes: [] }
  const fail = text => {
    row.ok = false
    row.notes.push(`FAIL ${text}`)
  }
  const log = verbose ? line => console.log(`  [server] ${line}`) : () => {}
  const recorded = world ? loadWorld(world) : null
  const blobStore = new BlobStore()
  let session
  try {
    session = await join(version, { cache, hashes, blobStore, recorded, log })
    const { server, connection, client } = session
    const startHashes = client.registry.supportFeature('blockHashes') && !!client.startGame.block_network_ids_are_hashes
    if (startHashes !== server.hashes) fail(`start_game says hashed ids ${startHashes}, the server ${server.hashes}`)
    if (hashes && !startHashes) fail('hashed ids asked for, not used')
    await playDimension(session, row, fail, { recorded, dimension: server.dimension })

    // another dimension of the recorded world, by /dimension
    if (dimension) {
      const to = ['overworld', 'nether', 'end'].indexOf(dimension)
      client.chat(`/dimension ${dimension}`)
      await session.until(`to the ${dimension}`, 600, () => client.dimension === to && session.settled())
      await session.tick(5)
      if (connection.dimension !== to) fail(`/dimension: the server has the player in ${connection.dimension}`)
      await playDimension(session, row, fail, { recorded, dimension: to })
    }

    const errors = client.channel.stats.decodeErrors + connection.channel.stats.decodeErrors
    const mismatches = client.codec.stats.verifyMismatches + connection.codec.stats.verifyMismatches
    const unknown = Object.keys(client.stats.unknownRuntimeIds).length
    if (errors) fail(`${errors} packets unread`)
    if (mismatches) fail(`${mismatches} packets read back otherwise`)
    if (unknown) fail(`${unknown} unknown runtime ids`)
    row.notes.push(`blobs: ${client.stats.blobs.hits} hit, ${client.stats.blobs.misses} missed`)
    for (const problem of session.problems) fail(problem)
    session.close()

    // the cache: a second join finds every blob
    if (cache) {
      session = await join(version, { cache, hashes, blobStore, recorded, log })
      const misses = session.client.stats.blobs.misses
      row.notes.push(`joined again: ${session.client.stats.blobs.hits} blobs hit, ${misses} missed`)
      if (misses) fail(`joined again, ${misses} blobs missing`)
      session.close()
    }
  } catch (err) {
    fail(verbose ? err.stack : err.message)
    session?.close()
  }
  return row
}

async function main () {
  if (!WORKER_KEYS.every(key => GAMEPLAY_KEYS.includes(key))) throw new Error('GAMEPLAY_KEYS must hold the viewer\'s WORKER_KEYS')
  let failed = 0
  for (const run of runs) {
    await preload('bedrock_' + run.version)
    const t0 = Date.now()
    const row = await play(run)
    if (!row.ok) failed++
    const name = `${run.version} ${run.world ?? 'showcase'}${run.dimension ? ` +${run.dimension}` : ''}, hashes ${run.hashes ? 'on' : 'off'}, cache ${run.cache ? 'on' : 'off'}`
    console.log(`${row.ok ? 'ok  ' : 'FAIL'} ${name} (${Date.now() - t0} ms)`)
    for (const note of row.notes) console.log(`       ${note}`)
  }
  console.log(failed ? `${failed} failed` : 'all passed')
  process.exit(failed ? 1 : 0)
}

main()
