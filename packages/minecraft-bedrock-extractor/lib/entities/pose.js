// An entity's resting pose: what its animations do to its bones in the state it is drawn in, at their start. The
// animations are those its scripts.animate runs and the initial states of its animation controllers (an entry whose
// condition holds), each bone's rotation, position and scale at time 0 (its first keyframe), Molang evaluated in that
// state, `this` the bone's own value. A spider's legs are spread by its default_leg_pose; a donkey's chests are scaled
// to nothing until it is chested.
//
// -> Map: bone name (lowercase) -> { rotation: [x, y, z] (degrees, added), position: [x, y, z] (added), hidden }
const { compile } = require('../molang')

const lower = obj => Object.fromEntries(Object.entries(obj ?? {}).map(([k, v]) => [k.toLowerCase(), v]))
const truthy = v => typeof v === 'string' ? v.length > 0 : !!v
const num = v => typeof v === 'number' && isFinite(v) ? v : 0

// the animations (animations/*.json) and animation controllers (animation_controllers/*.json) of a pack stack by
// identifier, every pack's copy of a file read, the higher's over the lower's
function animationIndex (stack) {
  const animations = new Map()
  const controllers = new Map()
  for (const file of stack.files.keys()) {
    const isAnimation = /^animations\/.+\.json$/.test(file)
    if (!isAnimation && !/^animation_controllers\/.+\.json$/.test(file)) continue
    let copies
    try { copies = stack.jsonLayers(file) } catch { continue }
    for (const json of copies) {
      const entries = isAnimation ? json?.animations : json?.animation_controllers
      for (const [id, value] of Object.entries(entries ?? {})) (isAnimation ? animations : controllers).set(id.toLowerCase(), value)
    }
  }
  return { animations, controllers }
}

// a channel's value at time 0: its expressions, or its first keyframe's (its post value)
function atStart (channel) {
  if (channel === undefined || channel === null) return null
  if (Array.isArray(channel)) return channel
  if (typeof channel !== 'object') return [channel, channel, channel]
  const times = Object.keys(channel).filter(k => !isNaN(parseFloat(k))).sort((a, b) => parseFloat(a) - parseFloat(b))
  if (!times.length) return null
  const key = channel[times[0]]
  const value = Array.isArray(key) ? key : key?.post ?? key?.pre ?? key?.vector ?? key
  return Array.isArray(value) ? value : [value, value, value]
}

// description: the client entity description; index: animationIndex(); state: { get(name) } (queries and variables)
function restingPose (description, index, state) {
  const shortNames = lower(description.animations)
  const run = []
  const visit = (entry, depth) => {
    const [name, condition] = typeof entry === 'string' ? [entry, null] : Object.entries(entry ?? {})[0] ?? []
    if (!name || depth > 8) return
    if (condition !== null && condition !== undefined && !truthy(compile(condition)(state))) return
    const id = (shortNames[name.toLowerCase()] ?? name).toLowerCase()
    if (id.startsWith('controller.')) {
      const controller = index.controllers.get(id)
      const initial = controller?.states?.[controller.initial_state ?? 'default']
      for (const e of initial?.animations ?? []) visit(e, depth + 1)
    } else if (index.animations.has(id)) run.push(index.animations.get(id))
  }
  for (const entry of [].concat(description.scripts?.animate ?? [])) visit(entry, 0)
  // (format 1.8: the controllers a description lists, each run from its initial state)
  for (const entry of description.animation_controllers ?? []) for (const id of Object.values(entry ?? {})) visit(id, 0)

  return {
    animations: run.length,
    // a geometry in the pose, its own rotations the `this` of the animations
    apply (geometry) {
      const pose = new Map()
      const at = bone => {
        if (!pose.has(bone)) pose.set(bone, { rotation: [0, 0, 0], position: [0, 0, 0], hidden: false })
        return pose.get(bone)
      }
      for (const animation of run) {
        for (const [name, channels] of Object.entries(animation?.bones ?? {})) {
          const bone = geometry.bones.find(b => b.name.toLowerCase() === name.toLowerCase())
          const base = bone?.rotation ?? [0, 0, 0]
          const p = at(name.toLowerCase())
          const value = (channel, own) => (atStart(channel) ?? []).map((e, i) => num(compile(e)({ get: n => n === 'this' ? own[i] : state.get(n) })))
          value(channels.rotation, base).forEach((v, i) => { p.rotation[i] += v })
          value(channels.position, [0, 0, 0]).forEach((v, i) => { p.position[i] += v })
          const scale = atStart(channels.scale)
          if (scale && scale.map((e, i) => num(compile(e)({ get: n => n === 'this' ? 1 : state.get(n) }))).some(v => v === 0)) p.hidden = true
        }
      }
      return posed(geometry, pose)
    }
  }
}

// a geometry in a pose: each bone turned by its pose's rotation (with its children), moved with its children by its
// position; a hidden bone and its children keep no cubes
function posed (geometry, pose) {
  const bones = geometry.bones.map(b => ({ ...b, cubes: b.cubes.map(c => ({ ...c })) }))
  const byName = new Map(bones.map(b => [b.name.toLowerCase(), b]))
  const children = bone => bones.filter(b => b.parent?.toLowerCase() === bone.name.toLowerCase())
  const subtree = bone => [bone, ...children(bone).flatMap(subtree)]
  for (const [name, p] of pose) {
    const bone = byName.get(name)
    if (!bone) continue
    // (a bone's rotation, which its children follow; its bind_pose_rotation turns its own cubes alone, and stays)
    if (p.rotation.some(v => v)) bone.rotation = (bone.rotation ?? [0, 0, 0]).map((v, i) => Math.round((v + p.rotation[i]) * 1000) / 1000)
    const move = p.position
    const tree = p.hidden || move.some(v => v) ? subtree(bone) : []
    for (const b of tree) {
      if (p.hidden) b.cubes = []
      if (!move.some(v => v)) continue
      b.pivot = b.pivot.map((v, i) => v + move[i])
      for (const c of b.cubes) {
        c.origin = c.origin.map((v, i) => v + move[i])
        if (c.pivot) c.pivot = c.pivot.map((v, i) => v + move[i])
      }
    }
  }
  return { ...geometry, bones }
}

module.exports = { animationIndex, restingPose, atStart }
