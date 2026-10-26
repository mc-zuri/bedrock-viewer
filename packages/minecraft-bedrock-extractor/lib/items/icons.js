// data/item_icons.json: the client's item definitions (items/*.json of the packs: identifier -> icon key) per range of
// client versions, for the sources that have none ({ _meta, versions, entries: [{ versions: ['a-b', 'c'], icons }] }).
// A version takes what the ranges give the nearest client version at or below it.
const { compareVersions } = require('../pack/versions')

function inRanges (ranges, index, versions) {
  for (const r of ranges) {
    const [a, b = a] = r.split('-')
    const i = versions.indexOf(a)
    const j = versions.indexOf(b)
    if (i !== -1 && index >= i && index <= j) return true
  }
  return false
}

// identifier -> icon key, or null when the table has none for the version
function itemIconsFor (table, version) {
  if (!table?.versions?.length) return null
  let index = table.versions.indexOf(version)
  if (index === -1) index = table.versions.filter(v => compareVersions(v, version) < 0).length - 1
  const entry = index < 0 ? null : table.entries.find(e => inRanges(e.versions, index, table.versions))
  return entry?.icons ? new Map(Object.entries(entry.icons)) : null
}

module.exports = { itemIconsFor }
