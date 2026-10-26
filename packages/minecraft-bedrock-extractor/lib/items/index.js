// A Bedrock version's items in minecraft-assets' format: items_textures.json ([{ name, model, texture }], texture
// 'minecraft:items/<file>' or 'minecraft:block/<file>'), texture_content.json ([{ name, texture: data URL }]) and the
// icons in items/.
//
// An item's icon is the one the Bedrock client draws (./resolve.js): its item definition's icon, an item_texture.json
// entry, a spawn egg in its mob's colours, a block item's carried texture. Colours the client lays over an icon are
// baked into it.
const { itemResolver } = require('./resolve')
const { itemIconsFor } = require('./icons')
const { encodePng } = require('../image/png')

const hex = c => parseInt(String(c).replace(/^#/, ''), 16)

// an image multiplied by a colour, where mask (alpha > 127 of the mask image, else every pixel) says
function tint (img, color, mask = null) {
  const rgba = Buffer.from(img.rgba)
  const r = (color >> 16) & 255
  const g = (color >> 8) & 255
  const b = color & 255
  for (let i = 0; i < rgba.length; i += 4) {
    if (mask && mask.rgba[i + 3] < 128) continue
    rgba[i] = rgba[i] * r / 255
    rgba[i + 1] = rgba[i + 1] * g / 255
    rgba[i + 2] = rgba[i + 2] * b / 255
  }
  return { ...img, rgba }
}

// b drawn over a (same size), by b's alpha
function over (a, b) {
  const rgba = Buffer.from(a.rgba)
  for (let i = 0; i < rgba.length; i += 4) {
    const alpha = b.rgba[i + 3] / 255
    if (!alpha) continue
    for (let c = 0; c < 3; c++) rgba[i + c] = b.rgba[i + c] * alpha + rgba[i + c] * (1 - alpha)
    rgba[i + 3] = Math.max(rgba[i + 3], b.rgba[i + 3])
  }
  return { ...a, rgba }
}

const firstFrame = img => img.height > img.width && img.height % img.width === 0
  ? { width: img.width, height: img.width, rgba: img.rgba.subarray(0, img.width * img.width * 4) }
  : img

function exportItems ({ version, stack, mcData, store, itemBlocks, resolveBlock, itemIcons }) {
  const resolve = itemResolver({ stack, blocks: itemBlocks, blockResolver: resolveBlock, packIcons: itemIconsFor(itemIcons, version) })
  const itemsTextures = []
  const textureContent = []
  const unresolved = []
  const imageOf = path => {
    const stem = store.stemOf(path)
    return stem ? store.image(stem) : null
  }
  for (const item of mcData.itemsArray) {
    const name = item.name
    const icon = resolve(name)
    let texture = null
    let image = null
    if (icon) {
      const base = imageOf(icon.path)
      if (base && (icon.tint || icon.colors)) {
        // a spawn egg in its mob's colours, a carried block texture in its fixed colours: baked
        let img = firstFrame(base)
        if (icon.tint?.base) img = tint(img, hex(icon.tint.base))
        const overlay = icon.overlay && imageOf(icon.overlay)
        if (overlay && overlay.width === img.width) img = over(img, icon.tint?.overlay ? tint(firstFrame(overlay), hex(icon.tint.overlay)) : firstFrame(overlay))
        if (icon.colors?.tint_color) img = tint(img, hex(icon.colors.tint_color))
        if (icon.colors?.overlay_color) {
          const opaque = { ...img, rgba: Buffer.from(img.rgba) }
          for (let i = 3; i < opaque.rgba.length; i += 4) opaque.rgba[i] = 255
          img = tint(opaque, hex(icon.colors.overlay_color), img)
        }
        texture = 'minecraft:items/' + store.add(name, img, 'items', icon.path)
        image = img
      } else if (base) {
        const folder = icon.path.startsWith('textures/blocks/') ? 'blocks' : 'items'
        const ref = store.ref(icon.path, folder)
        texture = folder === 'blocks' ? 'minecraft:block/' + ref : 'minecraft:items/' + ref
        image = firstFrame(base)
      }
    }
    if (!texture) unresolved.push(name)
    itemsTextures.push({ name, model: name, texture })
    textureContent.push({ name, texture: image ? 'data:image/png;base64,' + encodePng(image).toString('base64') : null })
  }
  return { itemsTextures, textureContent, unresolved }
}

module.exports = { exportItems }
