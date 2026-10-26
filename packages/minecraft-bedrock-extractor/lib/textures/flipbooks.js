// Animated textures. A Bedrock flipbook texture is a vertical strip of square frames; flipbook_textures.json gives its
// frame time and, sometimes, the order the frames play in. The Java format says the same in a .mcmeta next to the
// strip: { animation: { frametime, frames? } }, which is what the viewer's atlas reads.

// flipbook_textures.json entries -> texture stem -> entry (the last entry of a texture winning)
function flipbooksByTexture (entries) {
  const byTexture = new Map()
  for (const f of entries ?? []) if (f.flipbook_texture) byTexture.set(f.flipbook_texture, f)
  return byTexture
}

// the mcmeta of a strip of `count` frames (its height over its width), or null when it does not animate
function mcmetaOf (flipbook, count) {
  if (!flipbook || count <= 1) return null
  const animation = { frametime: flipbook.ticks_per_frame || 1 }
  if (flipbook.frames?.length) {
    const frames = flipbook.frames.map(i => i % count)
    if (frames.length !== count || frames.some((f, i) => f !== i)) animation.frames = frames
  }
  return { animation }
}

// the rows of the frame the strip shows first
function firstFrame (flipbook, width, height) {
  const count = Math.floor(height / width)
  if (!flipbook || count <= 1) return [0, height]
  const first = flipbook.frames?.length ? flipbook.frames[0] % count : 0
  return [first * width, (first + 1) * width]
}

module.exports = { flipbooksByTexture, mcmetaOf, firstFrame }
