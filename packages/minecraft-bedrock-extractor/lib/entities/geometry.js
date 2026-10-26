// The packs' entity geometry, by identifier, in the shape prismarine-viewer's entity models have:
// { texturewidth, textureheight, bones: [{ name, parent, pivot, rotation, bind_pose_rotation, cubes }] }.
//
// Both file formats: 1.8's "geometry.x" (and "geometry.x:geometry.parent") keys, 1.12's minecraft:geometry list. A
// geometry that names a parent is the parent's bones with its own merged in by name, field by field (reset: the
// child's bone in the parent's place instead); a bone's inflate or mirror applies to its cubes. A cube keeps its own
// uv (box: [u, v], or per face), inflate, mirror, rotation and pivot. A bone never drawn (neverRender) keeps no cubes.

function readGeometries (stack) {
  const raw = new Map() // identifier -> { parent, texturewidth, textureheight, bones }
  const add = (key, entry) => {
    const [id, parent] = key.split(':')
    raw.set(id, { ...entry, parent })
  }
  // (every pack's copy of a file, the higher's geometry over the lower's)
  const files = []
  for (const path of stack.files.keys()) {
    if (!/^models\/.+\.json$/.test(path)) continue
    try { files.push(...stack.jsonLayers(path)) } catch { }
  }
  for (const json of files) {
    if (!json || typeof json !== 'object') continue
    for (const [key, g] of Object.entries(json)) {
      if (key.startsWith('geometry.') && g && typeof g === 'object') {
        add(key, { texturewidth: g.texturewidth, textureheight: g.textureheight, bones: g.bones ?? [] })
      }
    }
    for (const g of Array.isArray(json['minecraft:geometry']) ? json['minecraft:geometry'] : []) {
      const d = g.description ?? {}
      if (d.identifier) add(d.identifier, { texturewidth: d.texture_width, textureheight: d.texture_height, bones: g.bones ?? [] })
    }
  }
  return raw
}

// the parent's bones with the child's merged in by name (case-insensitive)
function mergeBones (parentBones, childBones) {
  const out = parentBones.map(b => ({ ...b }))
  const byName = new Map(out.map((b, i) => [b.name.toLowerCase(), i]))
  for (const bone of childBones) {
    const at = byName.get(bone.name?.toLowerCase())
    if (at === undefined) {
      byName.set(bone.name.toLowerCase(), out.length)
      out.push({ ...bone })
      continue
    }
    // (reset: the child's bone replaces the parent's; where it names no pivot or parent, the parent's stay)
    const parent = out[at]
    out[at] = bone.reset
      ? { name: parent.name, parent: parent.parent, pivot: parent.pivot, ...bone, cubes: bone.cubes ?? [] }
      : { ...parent, ...bone, name: parent.name }
  }
  return out
}

function finishBone (bone) {
  const drawn = bone.neverRender ? [] : bone.cubes ?? []
  const cubes = drawn.map(cube => {
    const c = { origin: cube.origin ?? [0, 0, 0], size: cube.size ?? [0, 0, 0], uv: cube.uv ?? [0, 0] }
    const inflate = cube.inflate ?? bone.inflate
    if (inflate) c.inflate = inflate
    if (cube.mirror ?? bone.mirror) c.mirror = true
    if (cube.rotation) c.rotation = cube.rotation
    if (cube.pivot) c.pivot = cube.pivot
    return c
  })
  const out = { name: bone.name }
  if (bone.parent) out.parent = bone.parent
  out.pivot = bone.pivot ?? [0, 0, 0]
  if (bone.rotation) out.rotation = bone.rotation
  if (bone.bind_pose_rotation) out.bind_pose_rotation = bone.bind_pose_rotation
  out.cubes = cubes
  return out
}

// identifier -> the geometry, its parents resolved (or null)
function geometries (stack) {
  const raw = readGeometries(stack)
  const merged = new Map()
  const mergedOf = (id, depth = 0) => {
    if (merged.has(id)) return merged.get(id)
    const g = raw.get(id)
    if (!g || depth > 16) return null
    const parent = g.parent ? mergedOf(g.parent, depth + 1) : null
    const out = {
      texturewidth: g.texturewidth ?? parent?.texturewidth ?? 64,
      textureheight: g.textureheight ?? parent?.textureheight ?? 64,
      bones: parent ? mergeBones(parent.bones, g.bones) : g.bones.map(b => ({ ...b }))
    }
    merged.set(id, out)
    return out
  }
  return {
    has: id => raw.has(id),
    get (id) {
      const g = id && mergedOf(id)
      return g ? { texturewidth: g.texturewidth, textureheight: g.textureheight, bones: g.bones.map(finishBone) } : null
    }
  }
}

module.exports = { geometries, mergeBones }
