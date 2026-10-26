/* eslint-env mocha */
const assert = require('assert')
const { compile } = require('../lib/molang')
const { geometries } = require('../lib/entities/geometry')
const { layersOf } = require('../lib/entities')

// a pack stack of JSON files (every copy one pack's, lowest first)
const stackOf = files => ({
  files: new Map(Object.keys(files).map(path => [path, () => Buffer.from(JSON.stringify([].concat(files[path]).at(-1)))])),
  jsonLayers: path => [].concat(files[path]),
  json: path => [].concat(files[path]).at(-1)
})

describe('molang', () => {
  const scope = (values = {}) => {
    const vars = { ...values }
    return { get: n => vars[n], set: (n, v) => { vars[n] = v } }
  }

  it('evaluates arithmetic, comparisons, logic and math functions', () => {
    assert.strictEqual(compile('(0.2 + variable.particle_random_1 * 0.1)')(scope({ 'variable.particle_random_1': 0.5 })), 0.25)
    assert.strictEqual(compile('!v.a && !query.b')(scope()), 1)
    assert.strictEqual(compile('q.health > 10 ? 3 : 1')(scope({ 'query.health': 20 })), 3)
    assert.strictEqual(compile('math.clamp(query.health / 25, 0, 3)')(scope({ 'query.health': 1000 })), 3)
    assert.strictEqual(compile('-Math.sin(90)')(scope()), -1)
  })

  it('runs statements, assignments and return', () => {
    const s = scope()
    assert.strictEqual(compile('v.x = 3; t.y = v.x * 2; return t.y + 1;')(s), 7)
    assert.strictEqual(s.get('variable.x'), 3)
  })

  it('indexes arrays and reads names', () => {
    const s = { get: n => ({ 'array.geos': ['a', 'b'], 'query.is_sheared': 1 })[n] ?? 0 }
    assert.strictEqual(compile('Array.geos[query.is_sheared]')(s), 'b')
    assert.strictEqual(compile('Array.geos[7]')(s), 'b')
  })
})

describe('entity geometry', () => {
  it('merges a geometry into the one it inherits from, bone by bone', () => {
    const stack = stackOf({
      'models/mobs.json': {
        'geometry.humanoid': {
          texturewidth: 64,
          textureheight: 32,
          bones: [
            { name: 'head', pivot: [0, 24, 0], cubes: [{ origin: [-4, 24, -4], size: [8, 8, 8], uv: [0, 0] }] },
            { name: 'hat', pivot: [0, 24, 0], neverRender: true, cubes: [{ origin: [-4, 24, -4], size: [8, 8, 8], uv: [32, 0] }] },
            { name: 'body', pivot: [0, 24, 0], cubes: [{ origin: [-4, 12, -2], size: [8, 12, 4], uv: [16, 16] }] }
          ]
        },
        'geometry.armor:geometry.humanoid': { bones: [{ name: 'head', inflate: 1 }, { name: 'hat', neverRender: false }, { name: 'body', reset: true }] }
      }
    })
    const g = geometries(stack)
    const plain = g.get('geometry.humanoid')
    assert.deepStrictEqual(plain.bones.map(b => b.cubes.length), [1, 0, 1])
    const armor = g.get('geometry.armor')
    assert.deepStrictEqual([armor.texturewidth, armor.textureheight], [64, 32])
    assert.deepStrictEqual(armor.bones.map(b => [b.name, b.cubes.length, b.cubes[0]?.inflate]), [['head', 1, 1], ['hat', 1, undefined], ['body', 0, undefined]])
  })
})

describe('resting pose', () => {
  const { restingPose } = require('../lib/entities/pose')
  const { restState } = require('../lib/entities')
  const index = {
    animations: new Map(Object.entries({
      'animation.spider.default_leg_pose': { bones: { leg0: { rotation: [0, '45.0 - this', '-45.0 - this'] } } },
      'animation.spider.walk': { bones: { leg0: { rotation: [0, 'math.cos(query.anim_time * 76.34) * 22.92', 0] } } },
      'animation.donkey.chest': { bones: { bag: { scale: 'query.is_chested' } } },
      'animation.cow.setup': { bones: { body: { rotation: ['-this', 0, 0] } } }
    })),
    controllers: new Map(Object.entries({
      'controller.animation.spider.move': { initial_state: 'default', states: { default: { animations: ['default_leg_pose', { walk: 'query.modified_move_speed' }] } } }
    }))
  }

  it('turns bones as the animations their controllers start with leave them, `this` their own rotation', () => {
    const description = {
      animations: { default_leg_pose: 'animation.spider.default_leg_pose', walk: 'animation.spider.walk', move: 'controller.animation.spider.move' },
      scripts: { animate: ['move'] }
    }
    const geometry = { bones: [{ name: 'leg0', pivot: [0, 9, 0], rotation: [0, 10, 10], cubes: [] }] }
    const posed = restingPose(description, index, restState(description)).apply(geometry)
    assert.deepStrictEqual(posed.bones[0].rotation, [0, 45, -45])
  })

  it('hides what is scaled to nothing, and leaves a bind pose alone', () => {
    const description = {
      animations: { chest: 'animation.donkey.chest', setup: 'animation.cow.setup' },
      scripts: { animate: ['chest', 'setup'] }
    }
    const geometry = {
      bones: [
        { name: 'body', pivot: [0, 19, 2], bind_pose_rotation: [90, 0, 0], cubes: [{ origin: [0, 0, 0], size: [1, 1, 1], uv: [0, 0] }] },
        { name: 'bag', parent: 'body', pivot: [0, 0, 0], cubes: [{ origin: [0, 0, 0], size: [1, 1, 1], uv: [0, 0] }] }
      ]
    }
    const [body, bag] = restingPose(description, index, restState(description)).apply(geometry).bones
    assert.deepStrictEqual([body.bind_pose_rotation, body.rotation, body.cubes.length, bag.cubes.length], [[90, 0, 0], undefined, 1, 0])
  })
})

describe('client entities', () => {
  const { clientEntities } = require('../lib/entities')
  it('merges a file over the packs, and takes the file of the highest min_engine_version', () => {
    const stack = stackOf({
      'entity/creeper.entity.json': [
        { 'minecraft:client_entity': { description: { identifier: 'minecraft:creeper', min_engine_version: '1.8.0', textures: { default: 'a' }, render_controllers: ['x', 'y'] } } },
        { 'minecraft:client_entity': { description: { identifier: 'minecraft:creeper', render_controllers: ['x', { y: 'query.is_powered' }] } } }
      ],
      'entity/creeper.v1.0.entity.json': { 'minecraft:client_entity': { description: { identifier: 'minecraft:creeper', textures: { default: 'b' }, render_controllers: ['x', 'y'] } } }
    })
    const creeper = clientEntities(stack).get('minecraft:creeper')
    assert.deepStrictEqual([creeper.textures.default, creeper.render_controllers[1]], ['a', { y: 'query.is_powered' }])
  })
})

describe('render controllers', () => {
  const controllers = new Map(Object.entries({
    'controller.render.sheep': { arrays: { geometries: { 'Array.geos': ['Geometry.default', 'Geometry.sheared'] } }, geometry: 'Array.geos[query.is_sheared]', textures: ['Texture.default'] },
    'controller.render.saddle': { geometry: 'Geometry.default', textures: ['Texture.default', 'Texture.saddle'], part_visibility: [{ '*': true }, { saddle: 'query.is_saddled' }] },
    'controller.render.shield': { geometry: 'Geometry.armor', textures: ['Texture.armor'], part_visibility: [{ '*': 'query.is_shield_powered' }] },
    'controller.render.skin': { arrays: { textures: { 'Array.skins': ['Texture.invulnerable', 'Texture.default'] } }, geometry: 'Geometry.default', textures: ['Array.skins[variable.normal]'] }
  }))

  it('draws the controllers that hold for a living adult, its first variant, unsheared', () => {
    const description = {
      geometry: { default: 'geometry.sheep', sheared: 'geometry.sheep.sheared' },
      textures: { default: 'textures/entity/sheep/sheep' },
      render_controllers: ['controller.render.sheep', { 'controller.render.sheep': 'query.is_baby' }]
    }
    assert.deepStrictEqual(layersOf(description, controllers).map(l => [l.geometry, l.textures]), [['geometry.sheep', ['textures/entity/sheep/sheep']]])
  })

  it('hides the parts its part_visibility hides', () => {
    const description = {
      geometry: { default: 'geometry.horse', armor: 'geometry.armor' },
      textures: { default: 'horse', saddle: 'saddle', armor: 'armor' },
      render_controllers: ['controller.render.saddle', 'controller.render.shield']
    }
    const [horse, shield] = layersOf(description, controllers)
    assert.deepStrictEqual(horse.textures, ['horse', 'saddle'])
    assert.deepStrictEqual([horse.visible('body'), horse.visible('saddle')], [true, false])
    assert.strictEqual(shield.visible('body'), false)
  })

  it('runs the description scripts before the controllers', () => {
    const description = {
      geometry: { default: 'geometry.wither' },
      textures: { default: 'wither', invulnerable: 'wither_invulnerable' },
      scripts: { pre_animation: ['variable.normal = query.invulnerable_ticks <= 0;'] },
      render_controllers: ['controller.render.skin']
    }
    assert.deepStrictEqual(layersOf(description, controllers)[0].textures, ['wither'])
  })
})
