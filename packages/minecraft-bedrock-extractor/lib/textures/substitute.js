// Textures the packs name but do not ship (the game draws something else, or nothing): the texture a reader gets in
// their place, so that every name resolves to a file.
//   textures/items/potion_bottle_lingering_<effect>  the splash bottle of the effect, else the drinkable one, else the
//                                                    plain lingering bottle (the lingering potion entity names one
//                                                    per effect; the packs have them for some effects only)
//   textures/blocks/trial_spawner_base               the trial spawner's side (the block entity names it; no file)
//   textures/item/<name>                             textures/items/<name> (the mace's attachable names the folder
//                                                    without its s)
//   anything else                                    the texture of its folder whose name shares the longest start
//                                                    with it (at least 4 characters), else none

const TABLE = {
  'textures/blocks/trial_spawner_base': ['textures/blocks/trial_spawner_side']
}

function candidates (path) {
  const m = /^textures\/items\/potion_bottle_lingering_(.+)$/.exec(path)
  if (m) return [`textures/items/potion_bottle_splash_${m[1]}`, `textures/items/potion_bottle_${m[1]}`, 'textures/items/potion_bottle_lingering']
  const item = /^textures\/item\/(.+)$/.exec(path)
  if (item) return ['textures/items/' + item[1]]
  return TABLE[path] ?? []
}

// the closest texture of the same folder by the start of the name
function nearest (path, stems) {
  const dir = path.slice(0, path.lastIndexOf('/') + 1)
  const base = path.slice(dir.length)
  let best = null
  for (const stem of stems) {
    if (!stem.startsWith(dir) || stem.slice(dir.length).includes('/')) continue
    const other = stem.slice(dir.length)
    let n = 0
    while (n < base.length && n < other.length && base[n] === other[n]) n++
    if (n < 4) continue
    if (!best || n > best.n || (n === best.n && (other.length < best.other.length || (other.length === best.other.length && other < best.other)))) best = { stem, other, n }
  }
  return best?.stem ?? null
}

// the texture to write in place of `path`, or null; has(path): whether the packs have a texture
function substituteFor (path, has, stems) {
  for (const c of candidates(path)) if (has(c)) return c
  return nearest(path, stems)
}

module.exports = { substituteFor, nearest }
