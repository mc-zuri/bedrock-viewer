// Mesh a scene with prismarine-viewer's own worker code (its World and models.js), in Node: every section's geometry,
// and the errors any throws. node tools/mesh.js <version> <scene> [filter]
const path = require('path')
const { buildScene } = require('../scenes')
const viewerDir = path.dirname(require.resolve('prismarine-viewer/package.json'))
const { World } = require(path.join(viewerDir, 'viewer/lib/world'))
const { getSectionGeometry } = require(path.join(viewerDir, 'viewer/lib/models'))
const { getVersion } = require(path.join(viewerDir, 'viewer/lib/version'))

const [version, scene, filter] = process.argv.slice(2)
const { world } = buildScene(version, scene, filter)
const blocksStates = require(path.join(viewerDir, 'public/blocksStates', getVersion(version) + '.json'))
const w = new World(version)
for (const column of world.columns.values()) w.addColumn(column.x * 16, column.z * 16, column.toJson())
let sections = 0
let vertices = 0
const errors = new Map()
for (const column of world.columns.values()) {
  for (let y = w.minY; y < 64; y += 16) {
    try {
      const g = getSectionGeometry(column.x * 16, y, column.z * 16, w, blocksStates)
      sections++
      vertices += g.positions.length / 3
    } catch (err) {
      const key = err.stack.split('\n').slice(0, 3).join(' | ')
      errors.set(key, (errors.get(key) ?? 0) + 1)
    }
  }
}
console.log(`${version} ${scene}: ${sections} sections, ${vertices} vertices, ${[...errors.values()].reduce((a, b) => a + b, 0)} failed`)
for (const [e, n] of errors) console.log(n, e)
