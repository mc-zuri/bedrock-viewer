/* eslint-env mocha */
const assert = require('assert')
const { generate } = require('../lib/blocks/geometry')
const { rotateBox } = require('../lib/blocks/geometry/orient')

const faces = ['bottom', 'top', 'north', 'south', 'west', 'east']
const ctx = (shape, extra = {}) => ({ shape, faces, tintFaces: false, tintTexture: () => false, ref: () => null, ...extra })
const bounds = elements => [0, 1, 2].map(i => [Math.min(...elements.map(e => e.from[i])), Math.max(...elements.map(e => e.to[i]))])

describe('geometry', () => {
  it('draws a stair as its collision boxes', () => {
    const state = { name: 'oak_stairs', props: { weirdo_direction: '0', upside_down_bit: '0' }, collision: [[0, 0, 0, 1, 0.5, 1], [0.5, 0.5, 0, 1, 1, 1]] }
    const m = generate(state, ctx('Stairs'))
    assert.deepStrictEqual(m.elements.map(e => [e.from, e.to]), [[[0, 0, 0], [16, 8, 16]], [[8, 8, 0], [16, 16, 16]]])
    assert.strictEqual(m.textures.up, 'top')
  })

  it('draws a full block as a cube with its faces', () => {
    const m = generate({ name: 'stone', props: {}, collision: [[0, 0, 0, 1, 1, 1]] }, ctx('Block'))
    assert.strictEqual(m.elements.length, 1)
    assert.deepStrictEqual(Object.keys(m.elements[0].faces).sort(), ['down', 'east', 'north', 'south', 'up', 'west'])
    assert.strictEqual(m.elements[0].faces.down.cullface, 'down')
    assert.strictEqual(m.textures.west, 'west')
  })

  it('turns a log to its pillar axis', () => {
    const m = generate({ name: 'oak_log', props: { pillar_axis: 'x' }, collision: [[0, 0, 0, 1, 1, 1]] }, ctx('Tree'))
    assert.deepStrictEqual([m.x, m.y], [90, 90])
  })

  it('draws a plant as two crossed planes of its texture', () => {
    const m = generate({ name: 'short_grass', props: {}, collision: [], outline: [0.1, 0, 0.1, 0.9, 0.8, 0.9] }, ctx('DoublesidedWideCrossTexture'))
    assert.strictEqual(m.elements.length, 2)
    assert.strictEqual(m.textures.cross, 'north')
    assert(m.elements.every(e => e.rotation.angle === 45))
  })

  it('leans a wall torch out from the side its selection box is on', () => {
    for (const [outline, side] of [[[0, 0.2, 0.35, 0.3, 0.8, 0.65], 0], [[0.7, 0.2, 0.35, 1, 0.8, 0.65], 16]]) {
      const m = generate({ name: 'torch', props: { torch_facing_direction: 'east' }, collision: [], outline }, ctx('Torch'))
      const [from, to] = rotateBox(m.elements[0].from, m.elements[0].to, 0, m.y ?? 0)
      assert(Math.abs((side ? to[0] : from[0]) - side) <= 1, `the torch's foot at x = ${side}`)
    }
  })

  it('draws a wall as its post and an arm to each connected side', () => {
    const props = { wall_post_bit: '1', wall_connection_type_north: 'short', wall_connection_type_east: 'tall', wall_connection_type_south: 'none', wall_connection_type_west: 'none' }
    const { parts } = generate({ name: 'cobblestone_wall', props, collision: [] }, ctx('Wall'))
    assert.strictEqual(parts.length, 3)
    assert.deepStrictEqual(bounds(parts[0].elements), [[4, 12], [0, 16], [4, 12]])
    assert.deepStrictEqual([parts[1].y, bounds(parts[1].elements)[1][1]], [0, 14])
    assert.deepStrictEqual([parts[2].y, bounds(parts[2].elements)[1][1]], [90, 16])
  })

  it('draws a fence with the tessellator boxes of its connections', () => {
    const tessellator = { fence: { 0: [[0.375, 0, 0.375, 0.625, 1, 0.625]], 1: [[0.375, 0, 0.375, 0.625, 1, 0.625], [0.4375, 0.75, 0, 0.5625, 0.9375, 0.5625]] } }
    const props = { 'minecraft:connection_north': '0', 'minecraft:connection_east': '1', 'minecraft:connection_south': '0', 'minecraft:connection_west': '0' }
    const { parts } = generate({ name: 'oak_fence', props, collision: [] }, ctx('Fence', { tessellator }))
    assert.strictEqual(parts.length, 2)
    assert.strictEqual(parts[1].y, 90)
  })

  it('draws nothing of an invisible block', () => {
    assert.strictEqual(generate({ name: 'barrier', props: {}, collision: [[0, 0, 0, 1, 1, 1]] }, ctx('Invisible')), null)
  })

  it('draws water as a liquid of its still texture', () => {
    const m = generate({ name: 'water', props: { liquid_depth: '0' }, collision: [] }, ctx('Water'))
    assert.deepStrictEqual([m.elements.length, m.textures.particle, m.liquid], [0, 'top', true])
  })
})
