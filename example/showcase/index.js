// The showcase scene: its world (./world.js) and the story told in it (./story.js), which the server plays for each
// page with a Director (../story.js)
const { Vec3 } = require('vec3')
const { build } = require('./world')
const { story } = require('./story')

function showcase (world) {
  const W = build(world)
  // (the camera where the story's first shot, high over the world, starts)
  const camera = { x: 88 + Math.cos(0.6) * 120, y: 93, z: 88 + Math.sin(0.6) * 120 }
  return { center: new Vec3(88, 18, 88), radius: 100, camera, story: d => story(d, W), surface: W.stand }
}

module.exports = { showcase }
