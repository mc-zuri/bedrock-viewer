// The example's server run in the page, in place of example/client/server.js: a Web Worker (sceneServer.js) builds the
// scene the address names (?version=&scene=&filter=) and shows it over a link that works as the example's socket
// does. The versions it can show are those the site was built with (versions.json).
/* global Worker, fetch, location, URLSearchParams */
const { EventEmitter } = require('events')
const SCENES = require('../../example/sceneList')

let versions = null
const listVersions = () => (versions ??= fetch('versions.json').then(r => r.json()))

// the version, scene and filter the address names; the newest version with assets and the showcase, else
async function state () {
  const list = await listVersions()
  const q = new URLSearchParams(location.search)
  const version = list.some(v => v.version === q.get('version') && v.assets) ? q.get('version') : list.find(v => v.assets)?.version
  const scene = SCENES.some(s => s.name === q.get('scene')) ? q.get('scene') : SCENES[0].name
  return { version, scene, filter: q.get('filter') ?? '', scenes: SCENES, versions: list }
}

// a socket of the scene's showing: on(event) what the worker sends, emit(event) to it
function connect () {
  const incoming = new EventEmitter()
  const worker = new Worker('scene-server.js')
  worker.onmessage = ({ data }) => {
    if (data.event === 'failed') console.error('scene server:', data.data)
    else incoming.emit(data.event, data.data)
  }
  state().then(({ version, scene, filter }) => worker.postMessage({ type: 'start', version, scene, filter }))
  return {
    on: (event, listener) => incoming.on(event, listener),
    emit: (event, data) => worker.postMessage({ type: 'emit', event, data })
  }
}

// a pick shown: the address names it, and the page loads it
function select (query) {
  location.search = query
  return Promise.resolve({})
}

module.exports = { connect, state, select }
