// The example's server in a Web Worker: the scene the page asks for (a version, a scene, a filter), built (scenes.js)
// and shown to the page as the example's server shows it over a socket (session.js). The version's minecraft-data is
// fetched first (prismarine-viewer's mcData.js); the blocks its assets draw and its client entities are read from the
// site's prerendered files.
/* global self, fetch, postMessage */
const { preload } = require('prismarine-viewer/viewer/lib/mcData')
const { getVersion } = require('prismarine-viewer/viewer/lib/version')
const { read } = require('prismarine-viewer/viewer/lib/sharedJson')
const { buildScene } = require('../../example/scenes')
const { play } = require('../../example/session')

const json = url => fetch(url).then(r => {
  if (!r.ok) throw new Error(`${url}: ${r.status}`)
  return r.json()
})

// the client entities of a version's assets ({ 'minecraft:<name>': ... }), or {}
async function clientEntities (assets) {
  try {
    const index = await json('entities/index.json')
    return (await json(`entities/${index[assets] ?? assets}.json`)).entities ?? {}
  } catch {
    return {}
  }
}

let session = null
self.onmessage = async ({ data }) => {
  if (data.type === 'start') {
    try {
      const { version, scene, filter } = data
      const assets = getVersion(version)
      const [drawn, models] = await Promise.all([json(`blocksStates/${assets}.json`).then(read), clientEntities(assets), preload(version)])
      const built = buildScene(version, scene, filter || undefined, { drawn })
      session = play({ version, ...built }, { emit: (event, payload) => postMessage({ event, data: payload }), models })
    } catch (err) {
      postMessage({ event: 'failed', data: err.stack ?? String(err) })
    }
  } else if (data.type === 'emit') {
    session?.receive(data.event, data.data)
  }
}
