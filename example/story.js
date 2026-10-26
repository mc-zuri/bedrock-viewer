// The story a scene tells (the showcase's): actors that walk the ground, fly, fight, fall and are taken away; arrows;
// blocks, chests and shulker boxes that change; particles; and a camera that follows it all, with a caption for each
// part. It runs on the server's ticks (20 a second), a story for each page, and reaches the page as the viewer takes a
// server's updates ('entity', 'blockUpdate', 'lid', 'particle') and as the example's page takes a camera and a caption
// ('camera', 'caption'). A scene writes its story as an async function of a Director, which plays it from the start
// again when it ends.
const TICKS = 20

// the event loop's next turn, once the promise jobs of this one have run (what a tick's waits go on with): Node's
// setImmediate, or in a browser a message to itself (setTimeout's is held back to 4 ms after a few)
const nextTurn = typeof setImmediate === 'function'
  ? () => new Promise(resolve => setImmediate(resolve))
  : (() => {
      const channel = new MessageChannel() // eslint-disable-line no-undef
      const waiting = []
      channel.port1.onmessage = () => waiting.shift()()
      return () => new Promise(resolve => {
        waiting.push(resolve)
        channel.port2.postMessage(null)
      })
    })()

// mineflayer's yaw (radians, 0 facing north, -z) of a step (dx, dz)
const yawOf = (dx, dz) => Math.atan2(-dx, -dz)
const round = v => Math.round(v * 100) / 100
const roundPos = p => ({ x: round(p.x), y: round(p.y), z: round(p.z) })

// a seeded random number generator (mulberry32), so that a story plays the same way each time
function random (seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

class Director {
  // world: the scene's SceneWorld; emit(event, data): to the page; models: the version's client entities
  // ({ 'minecraft:<name>': ... }); surface(x, z): the scene's ground height there (where an actor starts)
  constructor ({ world, emit, models = {}, surface = () => 64, seed = 1 }) {
    this.world = world
    this.emitter = emit
    this.models = models
    this.surface = surface
    this.seed = seed
    this.random = random(seed)
    this.ticks = 0
    this.timers = []
    this.actors = new Map()
    this.nextId = 1
    this.changed = new Map() // 'x,y,z' -> { pos, stateId, layer, original }
    this.lids = new Map() // 'x,y,z' -> pos, those open
    this.stopped = false
    this.solidCache = new Map()
    this.camera = new Camera(this)
    this.chapterIndex = -1
    this.fast = false // skipping: fast-forwarding, unseen, to the next chapter
    this.shown = new Set() // the actors the page has
  }

  emit (event, data) {
    if (this.stopped) return
    if (this.fast) return this.hold(event, data)
    if (event === 'entity') {
      if (data.delete) this.shown.delete(data.id)
      else this.shown.add(data.id)
    }
    this.emitter(event, data)
  }

  // the story's parts: each marks its start (its title)
  chapter (title) {
    this.chapterIndex++
    this.chapterTitle = title
    if (this.fast && this.chapterIndex >= this.skipTo) this.endSkip()
  }

  // to the next chapter at once: the story played on unseen, tick by tick as fast as it goes, and the page sent the
  // world as it is there (from the last chapter, the story's start again)
  async skip () {
    if (this.fast || this.stopped || this.ended) return
    this.fast = true
    this.skipTo = this.chapterIndex + 1
    this.held = { blocks: new Map(), lids: new Map() }
    // (at most ten minutes of story: a part that never ends is shown as it is then)
    for (let i = 0; this.fast && !this.stopped; i++) {
      if (i > 10 * 60 * TICKS) { this.endSkip(); break }
      this.tick()
      await nextTurn()
    }
  }

  // while skipping: of what would go to the page, the last of each block, lid, caption, sky and camera (actors are
  // sent as they are at the end; particles are let go)
  hold (event, data) {
    if (event === 'blockUpdate') this.held.blocks.set(`${data.pos.x},${data.pos.y},${data.pos.z}:${data.layer ?? 0}`, data)
    else if (event === 'lid') this.held.lids.set(`${data.pos.x},${data.pos.y},${data.pos.z}`, data)
    else if (event === 'caption' || event === 'sky') this.held[event] = data
  }

  endSkip () {
    this.fast = false
    const { blocks, lids, ...rest } = this.held
    for (const data of blocks.values()) this.emit('blockUpdate', data)
    for (const data of lids.values()) this.emit('lid', data)
    for (const id of [...this.shown]) if (!this.actors.has(id)) this.emit('entity', { id, delete: true })
    for (const actor of this.actors.values()) actor.send({ ...actor.spawnFields(), equipment: actor.equipment, metadata: actor.metadata, onGround: !actor.fly })
    if ('sky' in rest) this.emit('sky', rest.sky)
    if ('caption' in rest) this.emit('caption', rest.caption)
    this.camera.cutNext = true
  }

  get seconds () {
    return this.ticks / TICKS
  }

  // a random number in [min, max)
  rand (min = 0, max = 1) {
    return min + this.random() * (max - min)
  }

  // after some seconds (at least a tick)
  wait (seconds) {
    return new Promise(resolve => this.timers.push({ at: this.ticks + Math.max(1, Math.round(seconds * TICKS)), resolve }))
  }

  // a tick: the waits due end, the actors move a step, the camera follows
  tick () {
    if (this.stopped) return
    this.ticks++
    const due = this.timers.filter(t => t.at <= this.ticks)
    this.timers = this.timers.filter(t => t.at > this.ticks)
    for (const t of due) t.resolve()
    for (const actor of [...this.actors.values()]) actor.step()
    this.camera.step()
  }

  stop () {
    this.stopped = true
    this.timers = []
  }

  // play a story, and again from the start when it ends (the world as it was, a pause between)
  async play (story, { pause = 3 } = {}) {
    while (!this.stopped) {
      this.random = random(this.seed)
      try {
        await story(this)
      } catch (err) {
        console.error('story:', err)
        if (this.fast) this.endSkip()
        this.ended = true
        this.caption('The story stopped', err.message)
        return
      }
      await this.wait(pause)
      this.reset()
    }
  }

  // every actor taken away, every block changed back, every lid shut; the waits still pending dropped (their actors'
  // errands with them)
  reset () {
    for (const actor of [...this.actors.values()]) actor.remove()
    for (const { pos, original, layer } of this.changed.values()) this.emit('blockUpdate', { pos, stateId: original, layer })
    this.changed.clear()
    for (const pos of this.lids.values()) this.emit('lid', { pos, open: false })
    this.lids.clear()
    this.timers = []
    this.caption(null)
    this.sky(null)
    // (a skip past the last chapter stops at the first)
    this.chapterIndex = -1
    if (this.fast) this.skipTo = 0
  }

  // the first of names the version has a model of (an item always), or null
  modelOf (names) {
    for (const name of [].concat(names)) if (name === 'item' || this.models['minecraft:' + name]) return name
    return null
  }

  // an actor: { name (or names, the first the version has), pos, yaw, equipment, flags, metadata, username, itemName,
  // fly }. Without a model of it in the version it is a ghost: it acts and moves (a camera can follow it) unseen.
  spawn (spec) {
    const actor = new Actor(this, spec)
    this.actors.set(actor.id, actor)
    actor.send(actor.spawnFields())
    return actor
  }

  // the block at a position (as this story has changed it)
  stateAt (x, y, z) {
    const changed = this.changed.get(`${x},${y},${z}`)
    if (changed && !changed.layer) return changed.stateId
    const column = this.world.columns.get(Math.floor(x / 16) + ',' + Math.floor(z / 16))
    if (!column || y < 0 || y > 255) return null
    const pos = { x: x & 15, y, z: z & 15 }
    return column.getBlockStateId(pos)
  }

  solid (x, y, z) {
    const stateId = this.stateAt(x, y, z)
    if (stateId === null || stateId === undefined) return false
    if (!this.solidCache.has(stateId)) {
      const { mcData } = this.world
      const name = mcData.blockStates ? mcData.blockStates[stateId]?.name : mcData.blocks[stateId >> 4]?.name
      // (a doorway is walked through, a bed or a carpet walked over)
      this.solidCache.set(stateId, mcData.blocksByName[name]?.boundingBox === 'block' && !/door$|^bed$|carpet/.test(name))
    }
    return this.solidCache.get(stateId)
  }

  // where one standing at about height y over (x, z) stands: on the first solid block at most a block above y, or
  // under it (so that a walker steps up a block, climbs a slope a step at a time, and steps down any height)
  standY (x, z, y) {
    const X = Math.floor(x)
    const Z = Math.floor(z)
    for (let by = Math.floor(y + 1.2); by >= 0; by--) {
      if (this.solid(X, by, Z)) return by + 1
    }
    return y
  }

  // a block changed (the page's copy of the world: the scene's own is shared by every page)
  set (pos, stateId, layer = 0) {
    if (stateId === null || stateId === undefined) return
    const key = `${pos.x},${pos.y},${pos.z}${layer ? ':' + layer : ''}`
    if (!this.changed.has(key)) {
      const column = this.world.columns.get(Math.floor(pos.x / 16) + ',' + Math.floor(pos.z / 16))
      const at = { x: pos.x & 15, y: pos.y, z: pos.z & 15, l: layer }
      this.changed.set(key, { pos, layer, original: column ? column.getBlockStateId(at) : 0 })
    }
    this.changed.get(key).stateId = stateId
    this.emit('blockUpdate', { pos, stateId, layer })
  }

  // a chest's or shulker box's lid opened or shut (the block event a server sends)
  lid (pos, open) {
    const key = `${pos.x},${pos.y},${pos.z}`
    if (open) this.lids.set(key, pos)
    else this.lids.delete(key)
    this.emit('lid', { pos, open })
  }

  particle (name, pos, variables) {
    this.emit('particle', { name: 'minecraft:' + name, pos: roundPos(pos), variables })
  }

  // an explosion: its blast, the blocks within the radius blown away (but those under the floor; none, blocks false),
  // the actors near it hurt and thrown back
  explode (center, { radius = 2.5, floor = 0, blocks = true } = {}) {
    this.particle('huge_explosion_lab_misc_emitter', center)
    this.particle('large_explosion', center)
    this.particle('explosion_particle', center)
    const air = this.world.first('air')
    const r = blocks ? Math.ceil(radius) : -1
    for (let x = -r; x <= r; x++) {
      for (let y = -r; y <= r; y++) {
        for (let z = -r; z <= r; z++) {
          if (x * x + y * y + z * z > radius * radius) continue
          const pos = { x: Math.floor(center.x) + x, y: Math.floor(center.y) + y, z: Math.floor(center.z) + z }
          if (pos.y <= floor) continue
          const stateId = this.stateAt(pos.x, pos.y, pos.z)
          if (stateId !== null && stateId !== air) this.set(pos, air)
        }
      }
    }
    for (const actor of this.actors.values()) {
      const d = Math.hypot(actor.pos.x - center.x, actor.pos.z - center.z)
      if (actor.alive && actor.kind !== 'item' && d < radius * 2.5) actor.hurt(center, { knock: 3 - d / radius })
    }
  }

  // an arrow (or another projectile) flying from one point to another, falling as it flies, and sticking there a while
  shoot ({ from, to, name = 'arrow', speed = 24, gravity = 16, stick = 2 }) {
    const time = Math.max(0.15, Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) / speed)
    const v = { x: (to.x - from.x) / time, y: (to.y - from.y) / time + gravity * time / 2, z: (to.z - from.z) / time }
    const projectile = this.spawn({ name, pos: from, fly: true, width: 0.5, height: 0.5 })
    return new Promise(resolve => {
      projectile.flight = { from, v, gravity, time, t: 0, stick, resolve }
    })
  }

  caption (title, text = '') {
    this.emit('caption', title ? { title, text } : null)
  }

  // the sky's colour (a dimension's: the Nether's red, the End's dark); null, the page's own
  sky (color) {
    this.emit('sky', { color })
  }
}

class Actor {
  constructor (director, spec) {
    this.director = director
    this.id = director.nextId++
    const name = director.modelOf(spec.name)
    this.ghost = !name
    this.name = name ?? [].concat(spec.name)[0]
    this.kind = this.name
    const size = director.world.mcData.entitiesByName?.[this.name]
    this.width = spec.width ?? size?.width ?? 0.6
    this.height = spec.height ?? size?.height ?? 1.8
    this.fly = !!spec.fly
    this.inWater = !!spec.inWater
    this.turn = spec.turn ?? 0
    this.pos = { x: spec.pos.x, y: spec.pos.y ?? director.surface(spec.pos.x, spec.pos.z), z: spec.pos.z }
    this.yaw = spec.yaw ?? 0
    this.headYaw = this.yaw
    this.pitch = spec.pitch ?? 0
    this.equipment = { ...spec.equipment }
    this.metadata = { ...spec.metadata, flags: { ...spec.metadata?.flags, ...spec.flags } }
    this.username = spec.username
    this.itemName = spec.itemName
    this.vehicle = spec.vehicle
    this.alive = true
    this.route = null // { points, i, speed, resolve }
    this.look = null // an actor or a position the head turns to
    this.errand = null // the wandering or patrol it is on (a token)
    this.riders = []
  }

  spawnFields () {
    const fields = { name: this.name, pos: roundPos(this.pos), yaw: this.yaw, headYaw: this.headYaw, pitch: this.pitch, width: this.width, height: this.height }
    if (Object.keys(this.equipment).length) fields.equipment = this.equipment
    if (Object.keys(this.metadata.flags).length || Object.keys(this.metadata).length > 1) fields.metadata = this.metadata
    if (this.username) fields.username = this.username
    if (this.itemName) fields.itemName = this.itemName
    if (this.vehicle) fields.vehicle = this.vehicle
    if (this.fly) fields.onGround = false
    if (this.inWater) fields.inWater = true
    return fields
  }

  // (a model that faces the other way to its yaw, the ender dragon's, sent turned round: turn)
  send (fields) {
    if (this.ghost || !this.director.actors.has(this.id)) return
    if (this.turn && fields.yaw !== undefined) fields = { ...fields, yaw: fields.yaw + this.turn, headYaw: (fields.headYaw ?? fields.yaw) + this.turn }
    this.director.emit('entity', { id: this.id, ...fields })
  }

  // a tick: a step along its route (or its arrow's flight), its head to what it looks at
  step () {
    if (this.flight) return this.flyStep()
    let moved = false
    if (this.knock) {
      this.pos.x += this.knock.x
      this.pos.z += this.knock.z
      if (--this.knock.ticks <= 0) this.knock = null
      moved = true
    }
    const route = this.route
    if (route && this.alive) {
      let left = route.speed / TICKS
      while (left > 0 && route.i < route.points.length) {
        const p = route.points[route.i]
        const dx = p.x - this.pos.x
        const dz = p.z - this.pos.z
        const dy = this.fly && p.y !== undefined ? p.y - this.pos.y : 0
        const dist = Math.hypot(dx, dy, dz)
        if (dist > 1e-3 && Math.hypot(dx, dz) > 1e-3) this.yaw = yawOf(dx, dz)
        if (dist <= left) {
          this.pos.x = p.x
          this.pos.z = p.z
          if (this.fly && p.y !== undefined) this.pos.y = p.y
          route.i++
          left -= dist
        } else {
          this.pos.x += dx / dist * left
          this.pos.z += dz / dist * left
          if (this.fly) this.pos.y += dy / dist * left
          left = 0
        }
      }
      moved = true
      if (route.i >= route.points.length) {
        this.route = null
        if (route.run) this.setFlags({ sprinting: false })
        route.resolve(true)
      }
    }
    if (moved && !this.fly) {
      // (the ground under it, reached at a walker's pace up a step and down)
      const y = this.director.standY(this.pos.x, this.pos.z, this.pos.y)
      this.pos.y += Math.max(-0.6, Math.min(0.45, y - this.pos.y))
    }
    const look = this.look?.pos ?? this.look
    const headYaw = look ? yawOf(look.x - this.pos.x, look.z - this.pos.z) : this.yaw
    if (moved || headYaw !== this.headYaw) {
      this.headYaw = headYaw
      if (!moved && look && !this.route) this.yaw = turnToward(this.yaw, headYaw, 0.35)
      const fields = { pos: roundPos(this.pos), yaw: this.yaw, headYaw: this.headYaw, pitch: this.pitch, onGround: !this.fly }
      if (this.inWater) fields.inWater = true
      this.send(fields)
      for (const rider of this.riders) rider.ride(this)
    }
  }

  flyStep () {
    const f = this.flight
    f.t = Math.min(f.time, f.t + 1 / TICKS)
    if (f.landed !== undefined) {
      if (--f.landed <= 0) { this.remove(); f.resolve() }
      return
    }
    const vy = f.v.y - f.gravity * f.t
    this.pos = { x: f.from.x + f.v.x * f.t, y: f.from.y + f.v.y * f.t - f.gravity * f.t * f.t / 2, z: f.from.z + f.v.z * f.t }
    this.yaw = yawOf(f.v.x, f.v.z)
    this.pitch = Math.atan2(vy, Math.hypot(f.v.x, f.v.z))
    this.send({ pos: roundPos(this.pos), yaw: this.yaw, headYaw: this.yaw, pitch: this.pitch })
    if (f.t >= f.time) f.landed = Math.round(f.stick * TICKS)
  }

  // walk (or fly) through points ({ x, z }, a flyer's { x, y, z }): resolves true on arriving, false when stopped
  // first. speed in blocks a second (a player walks 4.3, sprints 5.6); run: sprinting; looking: the head kept on what
  // it looks at (else ahead)
  walk (points, { speed = 4.3, run = false, keepErrand = false, looking = false } = {}) {
    if (!keepErrand) this.errand = null
    if (!looking) this.look = null
    this.route?.resolve(false)
    if (run) this.setFlags({ sprinting: true })
    return new Promise(resolve => {
      this.route = { points: [].concat(points), i: 0, speed, run, resolve }
    })
  }

  // stop where it is
  halt () {
    this.errand = null
    if (this.route) {
      const route = this.route
      this.route = null
      if (route.run) this.setFlags({ sprinting: false })
      route.resolve(false)
    }
  }

  // wander about a centre (flyers between heights), resting between: until given something else to do
  wander ({ center, radius = 4, speed = 1.2, rest = [1, 4], heights = null }) {
    const errand = this.errand = {}
    const d = this.director
    ;(async () => {
      await d.wait(d.rand(0, rest[1]))
      while (this.errand === errand && this.alive && !d.stopped) {
        const a = d.rand(0, Math.PI * 2)
        const r = Math.sqrt(d.rand()) * radius
        const p = { x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r }
        if (heights) p.y = d.rand(heights[0], heights[1])
        await this.walk([p], { speed, keepErrand: true })
        if (this.errand !== errand) return
        await d.wait(d.rand(rest[0], rest[1]))
      }
    })()
    return this
  }

  // walk a round of points again and again
  patrol (points, { speed = 1.2, rest = 0 } = {}) {
    const errand = this.errand = {}
    const d = this.director
    ;(async () => {
      while (this.errand === errand && this.alive && !d.stopped) {
        for (const p of points) {
          await this.walk([p], { speed, keepErrand: true })
          if (this.errand !== errand) return
          if (rest) await d.wait(rest)
        }
      }
    })()
    return this
  }

  // the head (and, standing, the body) turned to an actor or a position, or back ahead (null)
  lookAt (target) {
    this.look = target
    if (target) {
      const p = target.pos ?? target
      this.yaw = this.headYaw = yawOf(p.x - this.pos.x, p.z - this.pos.z)
      this.send({ yaw: this.yaw, headYaw: this.headYaw })
    }
    return this
  }

  // put somewhere at once
  teleport (pos, yaw = this.yaw) {
    this.pos = { ...pos, y: pos.y ?? this.director.surface(pos.x, pos.z) }
    this.yaw = this.headYaw = yaw
    this.send({ pos: roundPos(this.pos), yaw, headYaw: yaw })
    for (const rider of this.riders) rider.ride(this)
  }

  // what it holds and wears: { mainhand, offhand, head, chest, legs, feet } (null to take one off)
  equip (slots) {
    for (const [slot, item] of Object.entries(slots)) {
      if (item) this.equipment[slot] = item
      else delete this.equipment[slot]
    }
    this.send({ equipment: this.equipment })
  }

  setFlags (flags) {
    Object.assign(this.metadata.flags, flags)
    this.send({ metadata: this.metadata })
  }

  setMetadata (metadata) {
    Object.assign(this.metadata, metadata)
    this.send({ metadata: this.metadata })
  }

  event (name) {
    this.send({ event: name })
  }

  swing () {
    this.event('arm_swing')
  }

  // hurt by an actor or at a point: it flashes red and is thrown back a little
  hurt (by, { knock = 1, crit = false } = {}) {
    if (!this.alive) return
    this.event('hurt_animation')
    const from = by?.pos ?? by
    if (from) {
      const dx = this.pos.x - from.x
      const dz = this.pos.z - from.z
      const d = Math.hypot(dx, dz) || 1
      const k = Math.max(0, knock) * 0.12
      this.knock = { x: dx / d * k, z: dz / d * k, ticks: 4 }
    }
    if (crit) this.director.particle('critical_hit_emitter', { ...this.pos, y: this.pos.y + this.height * 0.7 })
  }

  // a blow at another actor: it turns to it, swings, and the other is hurt as the blow lands
  async attack (target, { crit = false, knock = 1 } = {}) {
    this.lookAt(target)
    if (this.name === 'iron_golem') this.event('start_attacking')
    else this.swing()
    await this.director.wait(0.2)
    target.hurt(this, { crit, knock })
    await this.director.wait(0.3)
  }

  // it falls over and, a moment later, goes in a puff of smoke, leaving what it drops on the ground
  async die ({ drops = [] } = {}) {
    if (!this.alive) return
    this.halt()
    this.alive = false
    this.event('death_animation')
    const d = this.director
    await d.wait(1.1)
    d.particle('death_explosion_emitter', { ...this.pos, y: this.pos.y + 0.4 })
    this.remove()
    return drops.map((itemName, i) => d.spawn({
      name: 'item',
      itemName,
      pos: { x: this.pos.x + Math.cos(i * 2.4) * 0.5, y: this.pos.y + 0.1, z: this.pos.z + Math.sin(i * 2.4) * 0.5 },
      yaw: i
    }))
  }

  remove () {
    this.halt()
    this.alive = false
    for (const rider of this.riders) rider.dismount()
    this.send({ delete: true })
    this.director.actors.delete(this.id)
  }

  // on a mount, sitting on its back (seat: the height of the seat over the mount's feet)
  mount (mount, { seat = 0.85 } = {}) {
    this.mounted = { mount, seat }
    mount.riders.push(this)
    this.vehicle = 'minecraft:' + mount.name
    this.setFlags({ riding: true })
    this.send({ vehicle: this.vehicle })
    this.ride(mount)
  }

  ride (mount) {
    this.pos = { x: mount.pos.x, y: mount.pos.y + this.mounted.seat, z: mount.pos.z }
    this.yaw = mount.yaw
    this.headYaw = this.look ? this.headYaw : mount.yaw
    this.send({ pos: roundPos(this.pos), yaw: this.yaw, headYaw: this.headYaw, onGround: false })
  }

  dismount () {
    if (!this.mounted) return
    const { mount } = this.mounted
    mount.riders = mount.riders.filter(r => r !== this)
    this.mounted = null
    this.vehicle = undefined
    this.setFlags({ riding: false })
    this.send({ vehicle: null })
    this.pos.y = this.director.standY(this.pos.x + 1, this.pos.z, this.pos.y)
    this.teleport({ ...this.pos, x: this.pos.x + 1 })
  }

  distanceTo (other) {
    const p = other.pos ?? other
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z)
  }
}

// an angle turned toward another by at most a step, the short way round
function turnToward (from, to, step) {
  let d = to - from
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return from + Math.max(-step, Math.min(step, d))
}

// the places a camera tries, best first, when what it looks at is hidden from where it would be: [the share of its
// distance kept, blocks up]
const PLACES = [[1, 0], [1, -1.5], [0.7, -1.5], [0.7, 0], [1, 1.5], [0.5, -1], [0.7, 1.5], [1, 3], [1, 4.5], [1, 6], [1, 8], [1, 10], [1, 12]]

// The camera, as the server works it out each tick and the page eases toward: following an actor from behind (or from
// a side), watching one from a place, a still shot, a circle round a place, or a move from one shot to another.
class Camera {
  constructor (director) {
    this.director = director
    this.mode = null
    this.last = null
    this.heading = null
    this.choice = undefined
  }

  // nothing solid on the line from a to b (but its last half block: what is looked at), nor within a little of a, so
  // that the camera's near plane does not cut into a block beside it (as the bedrock-web-viewer proof of concept's
  // camera casts its rays from a small cube's corners)
  inSight (a, b) {
    const s = this.director
    for (const [dx, dy, dz] of [[0.3, 0, 0], [-0.3, 0, 0], [0, 0.3, 0], [0, -0.3, 0], [0, 0, 0.3], [0, 0, -0.3]]) {
      if (s.solid(Math.floor(a.x + dx), Math.floor(a.y + dy), Math.floor(a.z + dz))) return false
    }
    const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    const n = Math.ceil(d / 0.25)
    for (let i = 0; i < n - 2; i++) {
      const t = i / n
      if (this.director.solid(Math.floor(a.x + (b.x - a.x) * t), Math.floor(a.y + (b.y - a.y) * t), Math.floor(a.z + (b.z - a.z) * t))) return false
    }
    return true
  }

  // a camera kept in sight of what it looks at: where it would be, else lower or nearer (under a tree's crown), else
  // lifted over what is in the way (a roof, a cliff), up to 12 blocks, else drawn in to where it is clear. It keeps a
  // place while that stays clear, taking a better one only once that has been clear a second, so as not to bob.
  clear (pos, target) {
    const at = ([k, up]) => ({ x: target.x + (pos.x - target.x) * k, y: target.y + (pos.y - target.y) * k + up, z: target.z + (pos.z - target.z) * k })
    const firstClear = () => PLACES.findIndex(c => this.inSight(at(c), target))
    if (this.choice !== undefined && this.choice >= 0 && this.inSight(at(PLACES[this.choice]), target)) {
      const better = firstClear()
      this.better = better < this.choice ? (this.better ?? 0) + 1 : 0
      if (this.better > 20) { this.choice = better; this.better = 0 }
    } else {
      this.choice = firstClear()
      this.better = 0
    }
    if (this.choice >= 0) return at(PLACES[this.choice])
    const d = Math.hypot(pos.x - target.x, pos.y - target.y, pos.z - target.z)
    for (let k = 0.4; k > 0.1; k -= 0.05) {
      const p = at([k, 0])
      if (d * k < 2 || this.inSight(p, target)) return p
    }
    return pos
  }

  // behind an actor (angle: round from behind, in radians), looking a little over it
  follow (actor, { distance = 7, height = 3, angle = 0, look = 1.2, smooth = 2.5, cut = false } = {}) {
    this.mode = { kind: 'follow', actor, distance, height, angle, look, smooth, cut }
    this.heading = null
  }

  // from a place, turning to keep an actor in sight
  watch (actor, from, { look = 1.2, smooth = 3, cut = false } = {}) {
    this.mode = { kind: 'watch', actor, from, look, smooth, cut }
  }

  shot (pos, target, { smooth = 1.5, cut = false } = {}) {
    this.mode = { kind: 'shot', pos, target, smooth, cut }
  }

  // round a centre (speed: radians a second), from an angle
  orbit (center, { radius = 30, height = 20, speed = 0.12, angle = 0, smooth = 2, cut = false } = {}) {
    this.mode = { kind: 'orbit', center, radius, height, speed, angle, smooth, cut, start: this.director.ticks }
  }

  // from where it is to another shot ({ pos, target }) over some seconds, easing in and out
  move (to, seconds, { smooth = 6 } = {}) {
    const from = this.pos ? { pos: this.pos, target: this.target } : to
    this.mode = { kind: 'move', from, to, seconds, smooth, start: this.director.ticks }
  }

  step () {
    const m = this.mode
    if (!m) return
    let pos
    let target
    if (m.kind === 'follow') {
      const a = m.actor
      // (the camera's heading turns after the actor's, slower than it)
      const want = a.yaw + m.angle
      this.heading = this.heading === null ? want : turnToward(this.heading, want, 0.06)
      const back = { x: Math.sin(this.heading), z: Math.cos(this.heading) }
      target = { x: a.pos.x, y: a.pos.y + m.look, z: a.pos.z }
      pos = { x: a.pos.x + back.x * m.distance, y: a.pos.y + m.height, z: a.pos.z + back.z * m.distance }
    } else if (m.kind === 'watch') {
      target = { x: m.actor.pos.x, y: m.actor.pos.y + m.look, z: m.actor.pos.z }
      pos = m.from
    } else if (m.kind === 'shot') {
      pos = m.pos
      target = m.target
    } else if (m.kind === 'orbit') {
      const a = m.angle + (this.director.ticks - m.start) / TICKS * m.speed
      pos = { x: m.center.x + Math.cos(a) * m.radius, y: m.center.y + m.height, z: m.center.z + Math.sin(a) * m.radius }
      target = m.center
    } else if (m.kind === 'move') {
      const t = Math.min(1, (this.director.ticks - m.start) / TICKS / m.seconds)
      const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
      const lerp = (a, b) => ({ x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, z: a.z + (b.z - a.z) * e })
      pos = lerp(m.from.pos, m.to.pos)
      target = lerp(m.from.target, m.to.target)
    }
    if (m.kind === 'follow' || m.kind === 'watch' || m.kind === 'orbit') pos = this.clear(pos, target)
    this.pos = pos
    this.target = target
    const shot = { pos: roundPos(pos), target: roundPos(target), smooth: m.smooth }
    if (m.cut || this.cutNext) { shot.cut = true; m.cut = false; this.cutNext = false }
    const key = JSON.stringify(shot)
    if (key === this.last) return
    this.last = key
    this.director.emit('camera', shot)
  }
}

module.exports = { Director, Actor, yawOf }
