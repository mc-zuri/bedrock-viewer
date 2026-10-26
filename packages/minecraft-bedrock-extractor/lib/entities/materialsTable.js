// data/entity_materials.json: the client's entity materials, each resolved through its parents, by range of client
// versions, for the packs that have no material files of their own:
//   { _meta, versions, materials: { name: [{ versions: ['a-b', 'c'], defines, states, ... }] } }
// A version takes what the ranges give the nearest client version at or below it.
const { compareVersions } = require('../pack/versions')

function indexOf (versions, version) {
  const index = versions.indexOf(version)
  return index !== -1 ? index : versions.filter(v => compareVersions(v, version) < 0).length - 1
}

function inRanges (ranges, index, versions) {
  for (const r of ranges) {
    const [a, b = a] = r.split('-')
    const i = versions.indexOf(a)
    const j = versions.indexOf(b)
    if (i !== -1 && index >= i && index <= j) return true
  }
  return false
}

// name -> resolved material, or null when the table has none for the version
function materialsFor (table, version) {
  if (!table?.versions?.length) return null
  const index = indexOf(table.versions, version)
  if (index < 0) return null
  const out = {}
  for (const [name, entries] of Object.entries(table.materials)) {
    const hit = entries.find(e => inRanges(e.versions, index, table.versions))
    if (hit) {
      const { versions, ...material } = hit
      out[name] = material
    }
  }
  return out
}

module.exports = { materialsFor }
