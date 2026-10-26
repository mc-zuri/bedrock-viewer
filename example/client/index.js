// The example's page: prismarine-viewer's Viewer, an orbit camera framed on the scene, and the Bedrock state of the
// block clicked (the server reads it from the scene's chunks).
/* global THREE, fetch, location, URLSearchParams */
global.THREE = require('three')
require('three/examples/js/controls/OrbitControls')
const { Viewer } = require('prismarine-viewer/viewer')
const io = require('socket.io-client')

const $ = id => document.getElementById(id)
const socket = io({ path: window.location.pathname + 'socket.io' })

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(window.devicePixelRatio || 1)
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

const viewer = new Viewer(renderer)
const controls = new THREE.OrbitControls(viewer.camera, renderer.domElement)
controls.screenSpacePanning = true

function animate () {
  window.requestAnimationFrame(animate)
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
// #camera=x,y,z&target=x,y,z
socket.on('scene', ({ center, radius, camera }) => {
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const vec = s => { const [x, y, z] = s.split(',').map(Number); return { x, y, z } }
  const target = hash.get('target') ? vec(hash.get('target')) : center
  controls.target.set(target.x, target.y, target.z)
  const d = Math.max(4, radius) * 0.75
  const from = hash.get('camera') ? vec(hash.get('camera')) : camera ?? { x: center.x + d * 0.5, y: center.y + d * 0.8, z: center.z + d }
  viewer.camera.position.set(from.x, from.y, from.z)
  controls.update()
})

socket.on('blockInfo', info => {
  if (!info) { $('block').textContent = ''; return }
  const props = Object.entries(info.props).map(([k, v]) => `${k}=${v}`).join(', ')
  $('block').textContent = `${info.pos.x} ${info.pos.y} ${info.pos.z}  ${info.name}${props ? `[${props}]` : ''}  state ${info.stateId}`
})

// the version and scene pickers
fetch('api/state').then(r => r.json()).then(state => {
  for (const v of state.versions) {
    const label = v.version.replace('bedrock_', 'Bedrock ') +
      (v.assets && v.assets !== v.version ? ` (assets of ${v.assets.replace('bedrock_', '')})` : '') + (v.assets ? '' : ' (not supported)')
    const option = new window.Option(label, v.version)
    option.disabled = !v.assets
    $('version').add(option)
  }
  for (const s of state.scenes) $('scene').add(new window.Option(s.title, s.name))
  $('version').value = state.version
  $('scene').value = state.scene
  $('filter').value = state.filter
})

function show () {
  $('status').textContent = 'building…'
  const q = new URLSearchParams({ version: $('version').value, scene: $('scene').value, filter: $('filter').value })
  fetch('api/select?' + q).then(r => r.json()).then(r => {
    if (r.error) $('status').textContent = r.error
    else location.reload()
  })
}
$('go').onclick = show
$('version').onchange = show
$('scene').onchange = show
$('filter').onkeydown = e => { if (e.key === 'Enter') show() }
