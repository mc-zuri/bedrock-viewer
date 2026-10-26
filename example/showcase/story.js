// The showcase's story, "The Heart of Oakvale", told by a Director (../story.js) in the showcase's world (./world.js):
// pillagers raid the village for the Heart it keeps in a shulker box; Steve wakes, arms himself from his chest and,
// with the village's iron golem, follows them to their outpost in the dark forest, the captain on into the snow, and
// home over the mountain on an elytra, by the desert temple and on horseback past the badlands and the swamp. And
// round it, each biome's life: villagers at their work, animals in the pen, bees, parrots, fish, a dragon over the
// peaks.
const pick = (...names) => names

const { yawOf } = require('../story')

// where an actor's chest is (what an arrow is aimed at, a particle shown over)
const chest = a => ({ x: a.pos.x, y: a.pos.y + a.height * 0.7, z: a.pos.z })
const toward = (from, to) => yawOf(to.x - from.x, to.z - from.z)
// a point by an actor, toward another: where one stands to strike it
function beside (from, to, distance = 1.4) {
  const dx = from.pos.x - to.pos.x
  const dz = from.pos.z - to.pos.z
  const d = Math.hypot(dx, dz) || 1
  return { x: to.pos.x + dx / d * distance, z: to.pos.z + dz / d * distance }
}

// the world's life: each biome's animals and people, about their business until the story needs them
function life (d, W) {
  const at = (x, z, y) => ({ x, z, y: y ?? W.stand(x, z) })
  const villager = (x, z, profession) => d.spawn({ name: pick('villager_v2', 'villager'), pos: at(x, z), metadata: { variant: profession } })
  const L = {}
  // the village: villagers round the square and along the roads, a farmer, a cat, the iron golem on its round,
  // animals in the pen, an allay over the roofs
  L.square = [
    villager(85, 85, 5).patrol([{ x: 85, z: 85 }, { x: 91, z: 85 }, { x: 91, z: 91 }, { x: 85, z: 91 }], { speed: 0.9, rest: 2 }),
    villager(90, 92, 7).patrol([{ x: 90.5, z: 92 }, { x: 73.5, z: 88.5 }, { x: 88.5, z: 103 }], { speed: 0.9, rest: 3 }),
    villager(86, 80, 9).wander({ center: { x: 88, z: 80 }, radius: 4, speed: 0.8 })
  ]
  L.farmer = villager(105, 66, 1).wander({ center: { x: 106, z: 67 }, radius: 5, speed: 0.7, rest: [2, 5] })
  L.smith = villager(98, 97, 8).wander({ center: { x: 98, z: 97 }, radius: 2, speed: 0.6, rest: [2, 6] })
  d.spawn({ name: 'cat', pos: at(84, 101), metadata: { variant: 2 } }).wander({ center: { x: 84, z: 101 }, radius: 4 })
  L.golem = d.spawn({ name: 'iron_golem', pos: at(88.5, 72) }).patrol([{ x: 88.5, z: 72 }, { x: 88.5, z: 106 }], { speed: 0.8, rest: 3 })
  const pen = { x: 106, z: 108 }
  ;[['sheep', { color: 0 }], ['sheep', { color: 14 }], ['sheep', { color: 15 }], ['cow'], ['cow'], ['pig'], ['pig'], ['chicken'], ['chicken'], ['chicken']]
    .forEach(([name, metadata], i) => d.spawn({ name, pos: at(pen.x - 4 + (i % 5) * 2, pen.z - 2 + Math.floor(i / 5) * 4), metadata, yaw: i }).wander({ center: pen, radius: 4, speed: 0.7 }))
  d.spawn({ name: 'allay', pos: at(88, 80, 19), fly: true }).wander({ center: { x: 88, z: 86 }, radius: 10, speed: 2, rest: [0.5, 2], heights: [17, 21] })
  // the north: snow foxes, a polar bear by the frozen pond, a wolf pack
  for (let i = 0; i < 2; i++) d.spawn({ name: 'fox', pos: at(40 + i * 3, 22), metadata: { variant: 1 } }).wander({ center: { x: 40, z: 22 }, radius: 6, speed: 1.5 })
  L.bear = d.spawn({ name: 'polar_bear', pos: at(52, 36) }).wander({ center: { x: 53, z: 35 }, radius: 3, speed: 0.6, rest: [3, 6] })
  for (let i = 0; i < 3; i++) d.spawn({ name: 'wolf', pos: at(14 + i * 2, 36) }).wander({ center: { x: 15, z: 36 }, radius: 5, speed: 1.2 })
  // the mountains: goats on the slopes, llamas below them
  for (let i = 0; i < 2; i++) d.spawn({ name: 'goat', pos: at(100 + i * 3, 24) }).wander({ center: { x: 101, z: 24 }, radius: 6, speed: 1 })
  for (let i = 0; i < 2; i++) d.spawn({ name: 'llama', pos: at(74 + i * 3, 34), metadata: { variant: i } }).wander({ center: { x: 75, z: 34 }, radius: 4, speed: 0.8 })
  // the cherry grove: bees round its trees, rabbits
  for (let i = 0; i < 4; i++) {
    const x = 144 + i * 4
    const z = 22 + (i % 2) * 6
    d.spawn({ name: 'bee', pos: at(x, z, W.stand(x, z) + 3), fly: true }).wander({ center: { x, z }, radius: 5, speed: 2, rest: [0.2, 1.5], heights: [W.stand(x, z) + 1, W.stand(x, z) + 6] })
  }
  for (let i = 0; i < 2; i++) d.spawn({ name: 'rabbit', pos: at(148 + i * 4, 34) }).wander({ center: { x: 150, z: 34 }, radius: 6, speed: 1.6 })
  // the jungle: parrots over the canopy, an ocelot, pandas in the bamboo
  for (let i = 0; i < 3; i++) {
    const g = W.stand(150 + i * 4, 90)
    d.spawn({ name: 'parrot', pos: at(150 + i * 4, 90, g + 10), fly: true, metadata: { variant: i } }).wander({ center: { x: 152, z: 90 }, radius: 10, speed: 3, rest: [0.2, 1], heights: [g + 6, g + 16] })
  }
  d.spawn({ name: 'ocelot', pos: at(146, 98) }).wander({ center: { x: 146, z: 98 }, radius: 6, speed: 1.5 })
  for (let i = 0; i < 2; i++) d.spawn({ name: 'panda', pos: at(160 + i * 3, 82) }).wander({ center: { x: 161, z: 82 }, radius: 3, speed: 0.5, rest: [3, 7] })
  // the desert: camels and rabbits; and the horse that will carry Steve home, grazing by the temple
  for (let i = 0; i < 2; i++) d.spawn({ name: 'camel', pos: at(124 + i * 5, 164) }).wander({ center: { x: 126, z: 164 }, radius: 5, speed: 0.8, rest: [2, 5] })
  for (let i = 0; i < 2; i++) d.spawn({ name: 'rabbit', pos: at(160 + i * 3, 136), metadata: { variant: 4 } }).wander({ center: { x: 161, z: 136 }, radius: 5, speed: 1.6 })
  L.horse = d.spawn({ name: 'horse', pos: at(128, 156), flags: { saddled: true }, metadata: { variant: 2 } }).wander({ center: { x: 128, z: 156 }, radius: 2, speed: 0.6, rest: [2, 6] })
  // the badlands: armadillos
  for (let i = 0; i < 2; i++) d.spawn({ name: 'armadillo', pos: at(94 + i * 4, 158) }).wander({ center: { x: 96, z: 158 }, radius: 6, speed: 0.8 })
  // the swamp: frogs, slimes, the witch on her porch
  for (let i = 0; i < 3; i++) d.spawn({ name: 'frog', pos: at(14 + i * 3, 162), metadata: { variant: i } }).wander({ center: { x: 16, z: 162 }, radius: 5, speed: 1 })
  for (let i = 0; i < 2; i++) d.spawn({ name: 'slime', pos: at(36 + i * 4, 162) }).wander({ center: { x: 38, z: 162 }, radius: 5, speed: 0.8 })
  L.witch = d.spawn({ name: 'witch', pos: { ...W.places.hut.porch } })
  // the lake: dolphins, squid and fish in it, turtles on its shore
  const lake = W.places.lake
  for (const [name, n, speed, top] of [['dolphin', 2, 4, 0.4], ['squid', 2, 1, 1.5], ['cod', 3, 1.5, 0.8], ['tropicalfish', 3, 1.5, 0.8]]) {
    for (let i = 0; i < n; i++) {
      d.spawn({ name, pos: { x: lake.x + i * 2 - 2, y: W.sea - 1.5, z: lake.z + i }, fly: true, inWater: true })
        .wander({ center: lake, radius: lake.r - 5, speed, rest: [0.2, 1.5], heights: [W.sea - 3, W.sea - top] })
    }
  }
  for (let i = 0; i < 2; i++) d.spawn({ name: 'turtle', pos: at(70 + i * 2, 138) }).wander({ center: { x: 70, z: 138 }, radius: 2, speed: 0.4, rest: [3, 6] })
  return L
}

async function story (d, W) {
  const p = W.places
  const at = (x, z, y) => ({ x, z, y: y ?? W.stand(x, z) })
  const L = life(d, W)
  const heart = p.heart
  const heartTop = { x: heart.x + 0.5, y: heart.y + 1.1, z: heart.z + 0.5 }
  const hero = d.spawn({ name: 'player', username: 'Steve', pos: { ...p.bed }, yaw: 0, flags: { sleeping: true } })
  const golem = L.golem

  // ~ Oakvale: the world from high over it, then down to the village and its Heart
  d.chapter('Oakvale')
  d.caption('The Heart of Oakvale', 'Where nine lands meet lies the village of Oakvale. In its square, in a purple shulker box, it keeps the Heart.')
  d.camera.orbit({ x: 88, y: 18, z: 88 }, { radius: 120, height: 75, speed: 0.09, angle: 0.6, smooth: 1.5 })
  await d.wait(9)
  d.caption('The Heart of Oakvale', 'Snow to the north-west, a dark forest, a swamp, badlands, a desert, a jungle, a cherry grove - and the mountains over them all, a ruined portal on their flank.')
  await d.wait(8)
  d.camera.move({ pos: { x: 108, y: 25, z: 112 }, target: { x: 88, y: 15, z: 88 } }, 5)
  await d.wait(5.5)
  d.lid(heart, true)
  d.particle('totem_particle', heartTop)
  await d.wait(2)
  d.lid(heart, false)
  await d.wait(1)

  // ~ The raid: pillagers march in from the dark forest, over the bridge; villagers run for their doors; the captain
  // takes the Heart from its box, and they make off
  d.chapter('The raid')
  d.caption('The raid', 'Out of the dark forest march the pillagers. Their captain has come for the Heart.')
  const raider = (names, x, z, mainhand, metadata) => d.spawn({ name: names, pos: at(x, z), yaw: -Math.PI / 2, equipment: { mainhand }, metadata })
  const captain = raider(pick('pillager', 'vindicator', 'zombie'), 60, 88.5, 'crossbow', { nametag: 'Captain' })
  const archers = [raider(pick('pillager', 'skeleton'), 58, 87, 'crossbow'), raider(pick('pillager', 'skeleton'), 58, 90, 'crossbow')]
  const vindicator = raider(pick('vindicator', 'zombie'), 56, 88.5, 'iron_axe')
  const ravager = d.spawn({ name: 'ravager', pos: at(52, 88.5), yaw: -Math.PI / 2 })
  d.camera.follow(captain, { distance: 11, height: 5, angle: 2.4, smooth: 1.5 })
  const road = x => [{ x: 72, z: 88.5 }, { x, z: 88.5 }]
  const marching = [
    captain.walk([...road(82), { x: 86.6, z: 88.5 }], { speed: 3.2 }),
    archers[0].walk([...road(80), { x: 84, z: 86 }], { speed: 3.2 }),
    archers[1].walk([...road(80), { x: 84, z: 91 }], { speed: 3.2 }),
    vindicator.walk([...road(81)], { speed: 3.2 }),
    ravager.walk([...road(77)], { speed: 3.2 })
  ]
  await d.wait(3)
  // (the villagers in the square run indoors, the doors shut behind them; the golem runs to wake Steve)
  const hide = async (v, house) => {
    await v.walk([house.outside], { speed: 3.5 })
    d.set(house.door.pos, house.door.open)
    await v.walk([house.inside], { speed: 3 })
    v.remove()
    d.set(house.door.pos, house.door.shut)
  }
  hide(L.square[0], p.cottageB)
  hide(L.square[1], p.cottageC)
  hide(L.square[2], p.cottageB)
  golem.walk([{ x: 88.5, z: 82 }, { x: 93.5, z: 83.5 }], { speed: 3 })
  await Promise.all(marching)
  captain.lookAt(heartTop)
  d.camera.watch(captain, { x: 93, y: 19.5, z: 96 }, { smooth: 2 })
  await d.wait(0.6)
  d.lid(heart, true)
  await d.wait(0.7)
  captain.swing()
  captain.equip({ offhand: 'totem_of_undying' })
  d.particle('totem_particle', heartTop)
  await d.wait(0.6)
  d.lid(heart, false)
  d.caption('The Heart is taken', 'The captain lifts the Heart out of its box, and the raiders turn for home.')
  for (const v of [L.farmer, L.smith]) d.particle('villager_angry', { ...v.pos, y: v.pos.y + 2.3 })
  await d.wait(1.2)
  const outpost = { captain: { x: 15, z: 95 }, archers: [{ x: 31, z: 85 }, { x: 31, z: 92 }], vindicator: { x: 35, z: 88.5 }, ravager: { x: 28, z: 88.5 } }
  const back = to => [{ x: 72, z: 88.5 }, { x: 40, z: 88.5 }, to]
  captain.walk(back(outpost.captain), { speed: 5 })
  archers.forEach((a, i) => a.walk(back(outpost.archers[i]), { speed: 5 }))
  vindicator.walk(back(outpost.vindicator), { speed: 5 })
  ravager.walk(back(outpost.ravager), { speed: 5 })
  await d.wait(2.5)

  // ~ Steve: awake, armed from his chest, out of the door, the golem with him
  d.chapter('Steve')
  d.caption('Steve', 'The noise wakes Steve. He takes his sword, his armour and his shield from his chest.')
  d.camera.shot({ x: 96.7, y: 16.6, z: 80.7 }, { x: 99.5, y: 14.6, z: 78.4 }, { cut: true })
  await d.wait(1.5)
  hero.setFlags({ sleeping: false })
  hero.teleport({ x: 98.5, y: 14, z: 78.6 }, Math.PI)
  await d.wait(0.6)
  await hero.walk([{ x: 98.5, z: 81.5 }], { speed: 3 })
  hero.lookAt({ x: p.chest.x + 0.5, y: p.chest.y, z: p.chest.z + 0.5 })
  d.lid(p.chest, true)
  await d.wait(0.5)
  for (const [slot, item] of [['mainhand', 'iron_sword'], ['head', 'iron_helmet'], ['chest', 'iron_chestplate'], ['legs', 'iron_leggings'], ['feet', 'iron_boots'], ['offhand', 'shield']]) {
    hero.swing()
    hero.equip({ [slot]: item })
    await d.wait(0.4)
  }
  d.lid(p.chest, false)
  await hero.walk([{ x: 97.5, z: 79.5 }], { speed: 3 })
  d.set(p.home.door.pos, p.home.door.open)
  d.camera.watch(hero, { x: 89, y: 17.5, z: 84 }, { smooth: 2.5 })
  await hero.walk([{ x: 95.5, z: 79.5 }, { x: 93.5, z: 79.5 }], { speed: 3 })
  d.set(p.home.door.pos, p.home.door.shut)
  hero.lookAt(golem)
  golem.lookAt(hero)
  await d.wait(1)

  // ~ The dark forest: west over the bridge to the outpost; arrows on his shield; the golem takes the ravager, Steve
  // the vindicator and the archers; the captain runs north
  d.chapter('The dark forest')
  d.caption('The dark forest', 'Steve and the iron golem follow the raiders west, over the river and in under the dark oaks.')
  d.camera.follow(hero, { distance: 7, height: 3, angle: 0.35, smooth: 2.5 })
  // (the golem a little ahead, along the road's north side)
  golem.walk([{ x: 90.5, z: 84.5 }, { x: 84, z: 87.2 }, { x: 66, z: 87.2 }, { x: 40, z: 87.2 }], { speed: 6 })
  await hero.walk([{ x: 90.5, z: 83.5 }, { x: 84.5, z: 86.5 }, { x: 66, z: 88.5 }, { x: 44, z: 88.5 }, { x: 40, z: 88.5 }], { speed: 5.6, run: true })
  d.caption('The outpost', 'Bolts fly from the pillagers\' crossbows. Steve raises his shield.')
  d.camera.follow(hero, { distance: 9, height: 4.5, angle: 0.8, smooth: 2 })
  hero.lookAt(archers[0])
  hero.setFlags({ blocking: true })
  for (const a of archers) a.setFlags({ charged: true })
  for (let volley = 0; volley < 2; volley++) {
    for (const a of archers) {
      a.lookAt(hero)
      d.shoot({ from: chest(a), to: chest(hero) })
      await d.wait(0.4)
    }
    await d.wait(0.6)
  }
  hero.setFlags({ blocking: false })
  for (const a of archers) a.setFlags({ charged: false })
  const golemFight = (async () => {
    ravager.walk([beside(golem, ravager, 6)], { speed: 3 })
    await golem.walk([beside(golem, ravager, 2.6)], { speed: 4 })
    for (let i = 0; i < 3; i++) {
      await golem.attack(ravager, { knock: 2 })
      await d.wait(0.5)
    }
    await ravager.die({ drops: ['saddle'] })
  })()
  await vindicator.walk([beside(vindicator, hero, 1.5)], { speed: 4 })
  await vindicator.attack(hero)
  await hero.attack(vindicator, { crit: true })
  await d.wait(0.3)
  await hero.attack(vindicator)
  vindicator.die({ drops: ['iron_axe', 'emerald'] })
  // (the captain's flight: north into the snow, past the igloo, over the mountain's shoulder to the ruined portal)
  const front = { x: p.portal.x, z: p.portal.z + 2 }
  const north = [{ x: 36, z: 44 }, { x: 48, z: 32 }, { x: 62, z: 22 }, { x: 76, z: 16 }, { x: 88, z: 14 }, { x: 100, z: 18 }, { x: 106, z: 26 }]
  const flight = captain.walk([{ x: 14, z: 72 }, { x: 22, z: 54 }, ...north, front], { speed: 4.5 })
  d.caption('The outpost', 'One by one the raiders fall - and the captain, the Heart in his hand, runs north into the snow.')
  for (const a of archers) {
    await hero.walk([beside(hero, a)], { speed: 5.6, run: true })
    await hero.attack(a)
    await d.wait(0.2)
    await hero.attack(a, { crit: true })
    a.die({ drops: ['crossbow', 'arrow'] })
    await d.wait(0.5)
  }
  await golemFight
  golem.walk([{ x: 44, z: 90 }, { x: 66, z: 90 }, { x: 88.5, z: 82 }], { speed: 2 }).then(() => golem.patrol([{ x: 88.5, z: 72 }, { x: 88.5, z: 104 }], { speed: 0.8, rest: 3 }))

  // ~ The frozen north: strays shooting from the hills; one falls; the captain over the mountain and through the
  // ruined portal, Steve after him
  d.chapter('The frozen north')
  d.caption('The frozen north', 'Strays shoot from the snowy hills, and a polar bear watches from the ice.')
  d.camera.follow(hero, { distance: 8, height: 4, angle: 0.5, smooth: 2.5 })
  const strays = [d.spawn({ name: pick('stray', 'skeleton'), pos: at(10, 60), equipment: { mainhand: 'bow' } }), d.spawn({ name: pick('stray', 'skeleton'), pos: at(30, 58), equipment: { mainhand: 'bow' } })]
  const volleys = { on: true }
  strays.forEach(async (s, i) => {
    await d.wait(i * 1.1)
    while (volleys.on && s.alive) {
      s.lookAt(hero)
      d.shoot({ from: chest(s), to: chest(hero), speed: 22 })
      await d.wait(2.4)
    }
  })
  L.bear.lookAt(hero)
  await hero.walk([{ x: 28, z: 82 }, { x: 18, z: 70 }, beside(hero, strays[1], 9)], { speed: 5.6, run: true })
  await hero.walk([beside(hero, strays[1])], { speed: 5.6, run: true })
  await hero.attack(strays[1])
  await hero.attack(strays[1], { crit: true })
  strays[1].die({ drops: ['bone', 'arrow'] })
  d.caption('The mountain', 'The captain climbs over the mountain\'s shoulder, to the ruined portal on its flank.')
  const chase = hero.walk([...north, { x: front.x - 1.5, z: front.z + 2.5 }], { speed: 5.6, run: true })
  await d.wait(6)
  volleys.on = false
  await flight
  // (the captain waits at the portal until Steve is in sight, then steps through it)
  while (hero.distanceTo(front) > 18 && hero.route) await d.wait(0.25)
  d.camera.watch(captain, { x: p.portal.x + 8, y: p.portal.y + 4, z: p.portal.z + 9 }, { smooth: 2 })
  captain.lookAt(hero)
  await d.wait(1)
  await captain.walk([{ x: p.portal.x, z: p.portal.z }], { speed: 2 })
  d.particle('portal_directional', chest(captain))
  captain.remove()
  await chase
  d.camera.follow(hero, { distance: 6, height: 3, angle: 0.5, smooth: 2.5 })
  await hero.walk([front, { x: p.portal.x, z: p.portal.z }], { speed: 3 })
  d.particle('portal_directional', chest(hero))
  await d.wait(1)

  // (a world without them built goes on from the summit)
  if (W.nether) await theNether(d, W, hero)
  if (W.end) await theEnd(d, W, hero)

  // ~ Over the peaks: the exit portal sets him down on the summit; off it on the elytra, over the cherry grove and the
  // jungle, down to the desert
  d.chapter('Over the peaks')
  d.sky(null)
  hero.teleport({ ...p.summit }, yawOf(140 - p.summit.x, 60 - p.summit.z))
  d.camera.orbit({ x: p.summit.x, y: p.summit.y + 1, z: p.summit.z }, { radius: 8, height: 3, speed: 0.4, angle: 0.3, smooth: 2.5, cut: true })
  d.caption('Over the peaks', 'The exit portal sets Steve down on Oakvale\'s highest peak. Home is a long way below - but now he has wings.')
  hero.lookAt({ x: 140, y: p.summit.y, z: 60 })
  await d.wait(1.5)
  hero.equip({ chest: 'elytra' })
  await d.wait(2)
  hero.fly = true
  hero.setFlags({ gliding: true })
  d.caption('Over the peaks', 'Over the cherry grove, over the jungle\'s canopy...')
  d.camera.follow(hero, { distance: 9, height: 2.5, smooth: 3 })
  const s = p.summit
  const land = at(132, 146)
  await hero.walk([{ x: s.x + 12, y: s.y + 1, z: s.z + 6 }, { x: 124, y: s.y - 6, z: 28 }, { x: 142, y: 42, z: 42 }, { x: 155, y: 40, z: 66 },
    { x: 158, y: 38, z: 92 }, { x: 152, y: 34, z: 114 }, { x: 142, y: 26, z: 130 }, { x: land.x + 2, y: land.y + 3, z: land.z - 3 }, land], { speed: 15 })
  hero.fly = false
  hero.setFlags({ gliding: false })
  hero.equip({ chest: 'iron_chestplate' })

  // ~ The desert temple: husks; a creeper that blows a hole in the temple; a diamond sword in its chest
  d.chapter('The desert temple')
  d.caption('The desert temple', 'Husks shamble out of the old temple - and something hisses in the sand behind him.')
  d.camera.follow(hero, { distance: 8, height: 4, angle: 0.9, smooth: 2.5 })
  const husks = [d.spawn({ name: pick('husk', 'zombie'), pos: at(141.5, 146) }), d.spawn({ name: pick('husk', 'zombie'), pos: at(141.5, 149) })]
  for (const h of husks) {
    await h.walk([beside(h, hero, 1.5)], { speed: 2.5 })
    await h.attack(hero)
    await hero.attack(h)
    await d.wait(0.2)
    await hero.attack(h, { crit: true })
    h.die({ drops: ['rotten_flesh'] })
  }
  // (it creeps up to the temple's corner tower, whose wall its blast opens)
  const creeper = d.spawn({ name: 'creeper', pos: at(128, 156) })
  await creeper.walk([{ x: p.temple.wall.x - 1.4, z: p.temple.wall.z + 0.5 }], { speed: 3 })
  d.caption('Sss...', 'A creeper! Steve sprints for the temple door.')
  d.camera.watch(creeper, { x: 128, y: 21, z: 140 }, { smooth: 3 })
  hero.walk([{ x: 136, z: 145 }, { x: p.temple.door.x, z: p.temple.door.z - 1.5 }], { speed: 5.6, run: true })
  for (let i = 1; i <= 15; i++) {
    creeper.setMetadata({ creeper_swell: i * 2, creeper_swell_direction: 1 })
    await d.wait(0.1)
  }
  d.explode({ x: creeper.pos.x, y: creeper.pos.y + 0.5, z: creeper.pos.z }, { radius: 3, floor: 12 })
  creeper.remove()
  await d.wait(1.5)
  d.caption('The desert temple', 'Inside, in a chest by the star of terracotta: a diamond sword.')
  d.camera.shot({ x: p.temple.court.x, y: 29, z: p.temple.court.z + 11 }, { x: p.temple.court.x, y: 14, z: p.temple.court.z - 3 }, { smooth: 1.5 })
  await hero.walk([{ x: p.temple.door.x + 3, z: p.temple.door.z }, { x: p.temple.court.x, z: p.temple.court.z }, { x: p.temple.chest.x + 0.5, z: p.temple.chest.z + 1.6 }], { speed: 4.3 })
  hero.lookAt({ x: p.temple.chest.x + 0.5, y: p.temple.chest.y, z: p.temple.chest.z + 0.5 })
  d.lid(p.temple.chest, true)
  await d.wait(0.8)
  hero.swing()
  hero.equip({ mainhand: 'diamond_sword' })
  await d.wait(1)
  d.lid(p.temple.chest, false)
  await hero.walk([{ x: p.temple.court.x, z: p.temple.court.z }, { x: p.temple.door.x + 3, z: p.temple.door.z }, { x: p.temple.door.x - 2, z: p.temple.door.z }], { speed: 4.3 })

  // ~ The long road home: on the horse by the temple, through the badlands, past the witch's hut, over the bridge
  d.chapter('The long road home')
  d.caption('The long road home', 'A horse grazing by the temple carries Steve home, through the badlands and past the swamp.')
  const horse = L.horse
  horse.halt()
  await hero.walk([beside(hero, horse, 0.6)], { speed: 4.3 })
  const mounted = !horse.ghost
  if (mounted) hero.mount(horse)
  const rider = mounted ? horse : hero
  d.camera.follow(hero, { distance: 10, height: 4, angle: 1.1, smooth: 2 })
  const ride = rider.walk([{ x: 124, z: 156 }, { x: 108, z: 160 }, { x: 90, z: 156 }, { x: 70, z: 150 }, { x: 50, z: 146 }, { x: 40, z: 140 },
    { x: 36, z: 122 }, { x: 44, z: 104 }, { x: 52, z: 92 }, { x: 60, z: 88.5 }, { x: 72, z: 88.5 }, { x: 82, z: 88.5 }], { speed: mounted ? 9 : 5.6, run: !mounted })
  await d.wait(4)
  d.caption('The badlands', 'Banded terracotta, red sand, armadillos...')
  while (rider.distanceTo({ x: 48, z: 145 }) > 8 && rider.route) await d.wait(0.25)
  d.caption('The swamp', 'The witch on her porch throws a potion after him.')
  L.witch.lookAt(hero)
  L.witch.swing()
  d.shoot({ name: 'splash_potion', from: chest(L.witch), to: chest(hero), speed: 16, gravity: 10, stick: 0 }).then(() => {
    d.particle('splash_spell_emitter', chest(hero))
    hero.hurt(L.witch)
  })
  await ride

  // ~ Homecoming: the Heart back in its box; the villagers out of their houses, cheering; the golem's flower;
  // fireworks; the village from round about, and the world from high over it
  d.chapter('Homecoming')
  if (mounted) hero.dismount()
  d.caption('Homecoming', 'The Heart goes back into its shulker box.')
  d.camera.watch(hero, { x: 84, y: 19, z: 98 }, { smooth: 2 })
  await hero.walk([{ x: 86.6, z: 88.5 }], { speed: 3 })
  hero.lookAt(heartTop)
  d.lid(heart, true)
  await d.wait(0.7)
  hero.swing()
  hero.equip({ offhand: 'shield' })
  d.particle('totem_particle', heartTop)
  await d.wait(0.8)
  d.lid(heart, false)
  d.caption('Homecoming', 'And Oakvale comes out to cheer.')
  const cheer = []
  for (const [house, x, z] of [[p.cottageB, 84, 85], [p.cottageC, 84, 92], [p.cottageB, 85.5, 83.5]]) {
    const v = d.spawn({ name: pick('villager_v2', 'villager'), pos: at(house.inside.x, house.inside.z, W.ground + 1), metadata: { variant: cheer.length * 3 + 2 } })
    cheer.push(v)
    d.set(house.door.pos, house.door.open)
    v.walk([house.outside, { x, z }], { speed: 3 }).then(() => {
      v.lookAt(hero)
      d.set(house.door.pos, house.door.shut)
      d.particle('villager_happy', { ...v.pos, y: v.pos.y + 2 })
    })
    await d.wait(0.6)
  }
  d.camera.orbit({ x: 88, y: 15, z: 88 }, { radius: 14, height: 9, speed: 0.25, angle: 1.2, smooth: 2 })
  await golem.walk([beside(golem, hero, 2.2)], { speed: 3 })
  golem.lookAt(hero)
  golem.event('iron_golem_offer_flower')
  d.particle('heart_particle', { ...hero.pos, y: hero.pos.y + 2.2 })
  for (let i = 0; i < 6; i++) {
    const x = 84 + (i % 3) * 4
    const z = i < 3 ? 84 : 92
    const rocket = d.spawn({ name: 'fireworks_rocket', pos: { x: x + 0.5, y: W.ground + 1.2, z: z + 0.5 }, fly: true, pitch: Math.PI / 2 })
    rocket.walk([{ x: x + 0.5, y: W.ground + 16 + i, z: z + 0.5 }], { speed: 16 }).then(() => {
      d.particle('totem_particle', rocket.pos)
      d.particle('villager_happy', rocket.pos)
      rocket.remove()
    })
    for (const v of cheer) d.particle('villager_happy', { ...v.pos, y: v.pos.y + 2 })
    await d.wait(0.7)
  }
  await d.wait(4)
  d.caption('Epilogue', 'Oakvale sleeps soundly again. The story begins anew in a moment.')
  d.camera.move({ pos: { x: 160, y: 95, z: 170 }, target: { x: 88, y: 15, z: 88 } }, 6)
  await d.wait(7)
}

// ~ The Nether (../dimensions.js's): out of its portal over a lava sea, a ghast's fireball, blazes over the fortress,
// the captain's last stand at the bridge's end, the Heart taken back; and into the fortress's end portal
async function theNether (d, W, hero) {
  const N = W.nether
  d.chapter('The Nether')
  d.sky('#3b0d0b')
  hero.teleport({ ...N.arrive }, toward(N.arrive, N.path[0]))
  d.camera.shot(N.overview.pos, N.overview.target, { cut: true })
  d.caption('The Nether', 'Through the portal: a sea of lava, crimson and warped forests - and over the lava, a fortress of nether brick.')
  // its life: piglins and hoglins in the crimson forest, striders on the lava, magma cubes among the basalt, a ghast
  const life = [
    ...N.piglins.map((pos, i) => d.spawn({ name: 'piglin', pos, equipment: { mainhand: i ? 'golden_sword' : 'crossbow' } }).wander({ center: pos, radius: 3, speed: 0.8 })),
    ...N.hoglins.map(pos => d.spawn({ name: 'hoglin', pos }).wander({ center: pos, radius: 3, speed: 0.7 })),
    ...N.striders.map(pos => d.spawn({ name: 'strider', pos, fly: true }).wander({ center: pos, radius: 6, speed: 0.8, heights: [pos.y, pos.y] })),
    ...N.magmaCubes.map(pos => d.spawn({ name: 'magma_cube', pos }).wander({ center: pos, radius: 3, speed: 0.9 }))
  ]
  const ghast = d.spawn({ name: 'ghast', pos: { ...N.ghast }, fly: true }).wander({ center: N.ghast, radius: 6, speed: 1, heights: [N.ghast.y - 2, N.ghast.y + 2] })
  const blazes = N.blazes.map(pos => d.spawn({ name: 'blaze', pos: { ...pos }, fly: true }).wander({ center: pos, radius: 2, speed: 1, heights: [pos.y - 1, pos.y + 1] }))
  life.push(ghast, ...blazes)
  const captain = d.spawn({ name: pick('pillager', 'vindicator', 'zombie'), pos: { x: N.path[0].x, y: N.arrive.y, z: N.path[0].z }, metadata: { nametag: 'Captain' }, equipment: { mainhand: 'crossbow', offhand: 'totem_of_undying' } })
  const flight = captain.walk([...N.path.slice(1), ...N.bridge, N.captainStand], { speed: 4.5 })
  await d.wait(3.5)
  d.camera.follow(hero, { distance: 8, height: 4, angle: 0.4, smooth: 2.5, cut: true })
  const run = hero.walk([...N.path, ...N.bridge.slice(0, -1)], { speed: 5.6, run: true })
  await d.wait(3)
  d.caption('The Nether', 'A ghast wails over the lava, and spits fire.')
  ghast.halt()
  ghast.lookAt(hero)
  d.shoot({ name: 'fireball', from: chest(ghast), to: { ...chest(hero), x: hero.pos.x + 1.5 }, speed: 14, gravity: 0, stick: 0 })
    .then(() => d.explode({ ...chest(hero), x: hero.pos.x + 1.5 }, { radius: 2, blocks: false }))
  while (hero.distanceTo(N.bridge[0]) > 4 && hero.route) await d.wait(0.25)
  d.caption('The fortress', 'Blazes rise from the fortress to meet him.')
  blazes.forEach(async (b, i) => {
    await d.wait(i * 0.7)
    for (let k = 0; k < 2 && b.alive; k++) {
      b.lookAt(hero)
      d.shoot({ name: 'small_fireball', from: chest(b), to: chest(hero), speed: 16, gravity: 0, stick: 0 })
      await d.wait(1.2)
    }
  })
  await run
  for (const b of blazes.slice(0, 2)) {
    const by = beside(b, hero, 1.6)
    await b.walk([{ ...by, y: hero.pos.y + 0.6 }], { speed: 4 })
    await hero.attack(b)
    await hero.attack(b, { crit: true, knock: 0 })
    b.die({ drops: ['blaze_rod'] })
    await d.wait(0.4)
  }
  await flight
  d.caption('The last stand', 'At the end of the bridge, the captain turns to fight.')
  d.camera.follow(hero, { distance: 7, height: 3.5, angle: 1.2, smooth: 2 })
  captain.lookAt(hero)
  captain.setFlags({ charged: true })
  hero.setFlags({ blocking: true })
  await d.wait(0.5)
  await d.shoot({ from: chest(captain), to: chest(hero) })
  hero.setFlags({ blocking: false })
  captain.setFlags({ charged: false })
  await hero.walk([beside(hero, captain)], { speed: 4 })
  for (let i = 0; i < 3; i++) {
    await hero.attack(captain, { crit: i === 2 })
    await d.wait(0.35)
  }
  const [totem] = await captain.die({ drops: ['totem_of_undying', 'crossbow'] })
  await hero.walk([{ x: totem.pos.x, z: totem.pos.z }], { speed: 2.5 })
  totem.remove()
  hero.equip({ offhand: 'totem_of_undying' })
  d.particle('totem_particle', chest(hero))
  d.caption('The end portal', 'Steve has the Heart again. But behind the fortress an end portal hums: the captain served the Ender Dragon - and Steve means to end that.')
  await d.wait(1.5)
  d.camera.watch(hero, { x: N.endPortal.center.x + 6, y: N.endPortal.center.y + 7, z: N.endPortal.center.z + 6 }, { smooth: 2 })
  await hero.walk([N.endPortal.edge, N.endPortal.enter], { speed: 3 })
  d.particle('portal_directional', chest(hero))
  await d.wait(1.2)
  for (const a of life) if (a.alive) a.remove()
}

// ~ The End: the dragon circling its island; an arrow for each end crystal on its pillars; its dive; its perch on
// the exit portal, where Steve's sword finds it; its death, the portal opening, the egg; an elytra
async function theEnd (d, W, hero) {
  const E = W.end
  d.chapter('The End')
  d.sky('#120d1a')
  hero.teleport({ ...E.arrive }, toward(E.arrive, E.island))
  d.camera.shot(E.overview.pos, E.overview.target, { cut: true })
  d.caption('The End', 'The Ender Dragon circles its island, healed by the end crystals on its obsidian pillars.')
  const crystals = E.crystals.map(pos => d.spawn({ name: 'ender_crystal', pos: { ...pos }, fly: true }))
  const { center, radius, y } = E.circle
  const circle = [...Array(16).keys()].map(i => ({ x: center.x + Math.cos(i / 16 * Math.PI * 2) * radius, y: y + Math.sin(i / 2) * 3, z: center.z + Math.sin(i / 16 * Math.PI * 2) * radius }))
  // (the dragon's model faces the other way to its flight: turned round)
  const dragon = d.spawn({ name: 'ender_dragon', pos: circle[0], fly: true, turn: Math.PI }).patrol(circle, { speed: 11 })
  const endermen = E.endermen.map(pos => d.spawn({ name: 'enderman', pos }).wander({ center: pos, radius: 5, speed: 0.8, rest: [2, 5] }))
  await d.wait(4.5)
  d.camera.follow(hero, { distance: 8, height: 4, angle: 0.6, smooth: 2.5, cut: true })
  await hero.walk([...E.path, E.shootFrom], { speed: 5.6, run: true })
  d.caption('The crystals', 'An arrow for each crystal.')
  hero.equip({ mainhand: 'bow' })
  for (const [i, crystal] of crystals.entries()) {
    const top = { ...E.crystals[i], y: E.crystals[i].y + 1 }
    const a = toward(hero.pos, top)
    hero.lookAt(top)
    d.camera.shot({ x: hero.pos.x + Math.sin(a) * 5, y: hero.pos.y + 3, z: hero.pos.z + Math.cos(a) * 5 }, top, { smooth: 3 })
    await d.wait(0.5)
    d.shoot({ from: chest(hero), to: top, speed: 40, gravity: 6, stick: 0 }).then(() => {
      d.explode(top, { radius: 3, blocks: false })
      crystal.remove()
    })
    await d.wait(1)
  }
  await d.wait(1)
  // (it dives at him, past him, and up; then down to its perch on the exit portal)
  d.caption('The dragon', 'Its crystals gone, the dragon dives at Steve - then lands on the exit portal.')
  d.camera.follow(hero, { distance: 10, height: 5, angle: 0.8, smooth: 2.5 })
  const h = hero.pos
  const dive = dragon.walk([{ x: h.x + 24, y: h.y + 14, z: h.z + 4 }, { x: h.x + 3, y: h.y + 3, z: h.z + 1 }, { x: h.x - 16, y: h.y + 12, z: h.z - 8 }], { speed: 16 })
  while (dragon.distanceTo(hero) > 5 && dragon.route) await d.wait(0.1)
  d.particle('dragon_breath_trail', chest(hero))
  hero.hurt(dragon, { knock: 3 })
  await dive
  await dragon.walk([E.exitPortal.perch], { speed: 10 })
  dragon.lookAt(hero)
  hero.equip({ mainhand: 'iron_sword' })
  await hero.walk([E.exitPortal.standNear], { speed: 5.6, run: true })
  // (the fight from its side and far enough back to see the dragon whole, over Steve and it)
  const perch = E.exitPortal.perch
  const across = { x: hero.pos.x - perch.x, z: hero.pos.z - perch.z }
  const len = Math.hypot(across.x, across.z) || 1
  const mid = { x: (hero.pos.x + perch.x) / 2, y: hero.pos.y + 3, z: (hero.pos.z + perch.z) / 2 }
  d.camera.shot({ x: mid.x - across.z / len * 18 + across.x / len * 5, y: mid.y + 7, z: mid.z + across.x / len * 18 + across.z / len * 5 }, mid, { smooth: 2 })
  d.particle('dragon_breath_fire', { ...E.exitPortal.perch, y: E.exitPortal.perch.y + 1 })
  for (let i = 0; i < 6; i++) {
    await hero.attack(dragon, { crit: i % 2 === 1, knock: 0 })
    await d.wait(0.35)
  }
  // (it dies as the game shows it: rising in bursts of light, gone)
  d.caption('The dragon falls', 'The Ender Dragon rises one last time, and bursts into light.')
  dragon.halt()
  dragon.event('ender_dragon_death')
  const rising = dragon.walk([{ ...dragon.pos, y: dragon.pos.y + 12 }], { speed: 3 })
  for (let i = 0; i < 14; i++) {
    d.particle('dragon_death_explosion_emitter', { x: dragon.pos.x + d.rand(-3, 3), y: dragon.pos.y + d.rand(0, 4), z: dragon.pos.z + d.rand(-3, 3) })
    await d.wait(0.3)
  }
  await rising
  d.particle('huge_explosion_lab_misc_emitter', dragon.pos)
  dragon.remove()
  for (const cell of E.exitPortal.cells) d.set(cell, E.exitPortal.portal)
  d.set(E.exitPortal.egg, E.exitPortal.eggState)
  const elytra = d.spawn({ name: 'item', itemName: 'elytra', pos: { x: E.exitPortal.standNear.x + 1, y: hero.pos.y + 0.1, z: E.exitPortal.standNear.z + 1 } })
  d.caption('The exit portal', 'The exit portal opens, and the egg appears on its pillar. By it lies an elytra; Steve takes it, and steps through.')
  d.camera.watch(hero, { x: E.exitPortal.center.x + 9, y: E.exitPortal.center.y + 8, z: E.exitPortal.center.z + 9 }, { smooth: 2 })
  await d.wait(1.5)
  await hero.walk([{ x: elytra.pos.x, z: elytra.pos.z }], { speed: 3 })
  elytra.remove()
  await hero.walk([{ x: E.exitPortal.center.x + 0.5, z: E.exitPortal.center.z + 1.5 }], { speed: 3 })
  d.particle('portal_directional', chest(hero))
  await d.wait(1.2)
  for (const a of [...crystals, ...endermen]) if (a.alive) a.remove()
}

module.exports = { story }
