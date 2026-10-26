// The example's page: prismarine-viewer's Viewer, an orbit camera framed on the scene, and the Bedrock state of the
// block clicked (the server reads it from the scene's chunks). A story scene moves the camera itself and captions
// its chapters; the user can take the camera over and give it back.
/* global THREE, URLSearchParams */
global.THREE = require('three')
require('three/examples/js/controls/OrbitControls')
const { Viewer } = require('prismarine-viewer/viewer')
const server = require('./server')

const $ = id => document.getElementById(id)
const socket = server.connect()

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(window.devicePixelRatio || 1)
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

const viewer = new Viewer(renderer)
// (for a look from the browser's console)
window.viewer = viewer
const controls = new THREE.OrbitControls(viewer.camera, renderer.domElement)
controls.screenSpacePanning = true

// the story's camera: the latest shot ({ pos, target, smooth, cut }), followed until the user moves the camera
let story = false
let following = false
let grabbed = false
let shot = null
let cut = false

function follow (on) {
  following = on
  cut = false
  $('follow').hidden = on || !story
}
$('follow').onclick = () => follow(true)

// a press alone (as when picking a block) holds the story's camera still; moving the camera takes it over
controls.addEventListener('start', () => { grabbed = true })
controls.addEventListener('change', () => { if (grabbed && following) follow(false) })
controls.addEventListener('end', () => { grabbed = false })

// ease the camera and what it looks at toward the shot, by 1 - e^(-smooth * dt); a cut jumps there
function toShot (dt) {
  const k = cut ? 1 : 1 - Math.exp(-shot.smooth * dt)
  viewer.camera.position.lerp(shot.pos, k)
  controls.target.lerp(shot.target, k)
  cut = false
}

const clock = new THREE.Clock()
function animate () {
  window.requestAnimationFrame(animate)
  const dt = clock.getDelta()
  if (following && !grabbed && shot) toShot(dt)
  controls.update()
  viewer.update()
  renderer.render(viewer.scene, viewer.camera)
}
animate()

window.addEventListener('resize', () => {
  viewer.camera.aspect = window.innerWidth / window.innerHeight
  viewer.camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

socket.on('version', version => {
  if (viewer.setVersion(version)) viewer.listen(socket)
})

// look at the scene from the south-east, far enough to see all of it; or from where the page's hash says:
// #camera=x,y,z&target=x,y,z. A story scene's camera follows the story, unless the hash fixes the view.
socket.on('scene', scene => {
  const { center, radius, camera } = scene
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const vec = s => { const [x, y, z] = s.split(',').map(Number); return { x, y, z } }
  const target = hash.get('target') ? vec(hash.get('target')) : center
  controls.target.set(target.x, target.y, target.z)
  const d = Math.max(4, radius) * 0.75
  const from = hash.get('camera') ? vec(hash.get('camera')) : camera ?? { x: center.x + d * 0.5, y: center.y + d * 0.8, z: center.z + d }
  viewer.camera.position.set(from.x, from.y, from.z)
  controls.update()
  story = !!scene.story
  follow(story && !hash.get('camera'))
  $('next').hidden = !story
})

// on to the story's next part (the server plays it on to there unseen, and sends the world as it is then); the camera
// follows the story again
$('next').onclick = () => {
  socket.emit('skip')
  follow(true)
}

// where the story wants the camera; kept while the user has the camera, to ease back from wherever they leave it
socket.on('camera', s => {
  shot = s
  if (s.cut && following) cut = true
})

// the story's chapter title and text (null: none); each new one fades in
socket.on('caption', caption => {
  const panel = $('caption')
  panel.classList.remove('shown')
  panel.hidden = !caption
  if (!caption) return
  $('captionTitle').textContent = caption.title ?? ''
  $('captionText').textContent = caption.text ?? ''
  // (a layout at opacity 0, so the fade runs from there)
  panel.getBoundingClientRect()
  panel.classList.add('shown')
})

// the sky's colour: a dimension's (the Nether's, the End's), or null for the viewer's own
const sky = viewer.scene.background.clone()
socket.on('sky', ({ color }) => viewer.scene.background.set(color ?? sky))

socket.on('blockInfo', info => {
  if (!info) { $('block').textContent = ''; return }
  const props = Object.entries(info.props).map(([k, v]) => `${k}=${v}`).join(', ')
  const entity = info.blockEntity ? '  ' + JSON.stringify(info.blockEntity) : ''
  $('block').textContent = `${info.pos.x} ${info.pos.y} ${info.pos.z}  ${info.name}${props ? `[${props}]` : ''}  state ${info.stateId}${entity}`
})

// the version and scene pickers
server.state().then(state => {
  for (const v of state.versions) {
    const label = v.version.replace('bedrock_', 'Bedrock ') +
      (v.assets && v.assets !== v.version ? ` (assets of ${v.assets.replace('bedrock_', '')})` : '') + (v.assets ? '' : ' (not supported)')
    const option = new window.Option(label, v.version)
    option.disabled = !v.assets
    $('version').add(option)
  }
  for (const s of state.scenes) $('scene').add(new window.Option(s.title, s.name))
  $('version').value = state.version
  // (the entities and particles pages of the version shown)
  $('entitiesLink').href = 'entities.html?version=' + state.version
  $('particlesLink').href = 'particles.html?version=' + state.version
  $('scene').value = state.scene
  $('filter').value = state.filter
})

function show () {
  $('status').textContent = 'building…'
  const q = new URLSearchParams({ version: $('version').value, scene: $('scene').value, filter: $('filter').value })
  server.select(q).then(r => {
    if (r.error) $('status').textContent = r.error
  })
}
$('go').onclick = show
$('version').onchange = show
$('scene').onchange = show
$('filter').onkeydown = e => { if (e.key === 'Enter') show() }
