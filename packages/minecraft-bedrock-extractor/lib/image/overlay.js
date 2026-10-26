// The textures terrain_texture.json marks for the client to colour: overlays (grass sides), whose alpha is the mask of
// the part it tints, and fixed tints (the lily pad).
const { decodePng, encodePng } = require('./png')

const entriesOf = terrain => Object.values(terrain ?? {}).flatMap(entry => [entry?.textures].flat())

// the textures terrain_texture.json gives an overlay_color: their alpha is the mask of the part the client tints
function overlayTextures (terrain) {
  const paths = new Set()
  for (const t of entriesOf(terrain)) if (t && typeof t === 'object' && t.overlay_color && t.path) paths.add(t.path)
  return paths
}

// the textures terrain_texture.json gives a fixed tint_color (the lily pad): texture path -> '#rrggbb'
function constantTints (terrain) {
  const tints = new Map()
  for (const t of entriesOf(terrain)) if (t && typeof t === 'object' && t.tint_color && t.path) tints.set(t.path, t.tint_color.toLowerCase())
  return tints
}

// an overlay-masked texture -> the base as it shows (opaque) and the overlay alone (the masked pixels), both PNG
function splitOverlay (png) {
  const { width, height, rgba } = decodePng(png)
  const base = Buffer.from(rgba)
  const overlay = Buffer.from(rgba)
  for (let i = 3; i < rgba.length; i += 4) {
    base[i] = 255
    overlay[i] = rgba[i] > 127 ? 255 : 0
  }
  return { base: encodePng({ width, height, rgba: base }), overlay: encodePng({ width, height, rgba: overlay }) }
}

module.exports = { overlayTextures, constantTints, splitOverlay }
