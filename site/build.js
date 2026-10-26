// Assembles the site in dist/, beside what webpack wrote there (webpack.config.js):
// - prismarine-viewer's prerendered Bedrock assets (its public/: texture atlases, block states, entities, world
//   bounds), the block states packed (sharedJson.js: their repeated models once, a tenth of the size), and its mesher
//   (worker.js) with the minecraft-data it fetches (mc-data/);
// - the example's pages (the scenes page as scenes.html), the site's own (pages/: index.html, gameplay.html) and its
//   static files (static/: Gameplay's recorded worlds);
// - versions.json, the Bedrock versions the site shows (those minecraft-data knows, with the assets each draws with
//   where the site has them), and built-from.json, what the site was built from (built-from.js).
//
// node build.js   (after webpack; GITHUB_TOKEN for built-from's pull request search)
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { pack } = require('prismarine-viewer/viewer/lib/sharedJson')
const { getVersion } = require('prismarine-viewer/viewer/lib/version')

const dist = path.join(__dirname, 'dist')
const viewerPublic = path.join(path.dirname(require.resolve('prismarine-viewer/package.json')), 'public')
const examplePublic = path.join(__dirname, '..', 'example', 'public')

const copy = (from, to) => fs.cpSync(from, to, { recursive: true })
const isBedrock = name => name.startsWith('bedrock')

fs.mkdirSync(dist, { recursive: true })

// the viewer's mesher, its minecraft-data (Bedrock's), the world bounds
for (const file of ['worker.js', 'worldBounds.json']) copy(path.join(viewerPublic, file), path.join(dist, file))
copy(path.join(viewerPublic, 'mc-data', 'bedrock'), path.join(dist, 'mc-data', 'bedrock'))

// the Bedrock texture atlases and the texture store the entities' and items' textures are in (not the copies of the
// assets beside them, textures/bedrock_<version>/, which no page reads), the entities
fs.mkdirSync(path.join(dist, 'textures'), { recursive: true })
for (const name of fs.readdirSync(path.join(viewerPublic, 'textures')).filter(n => n === 'bedrock' || (isBedrock(n) && n.endsWith('.png')))) {
  copy(path.join(viewerPublic, 'textures', name), path.join(dist, 'textures', name))
}
copy(path.join(viewerPublic, 'entities'), path.join(dist, 'entities'))
// the font name tags are drawn in (the newest Java version's: Bedrock's is the same)
for (const name of fs.readdirSync(path.join(viewerPublic, 'textures'))) {
  const font = path.join(viewerPublic, 'textures', name, 'font')
  if (!isBedrock(name) && fs.existsSync(font)) copy(font, path.join(dist, 'textures', name, 'font'))
}

// the Bedrock block states, packed
fs.mkdirSync(path.join(dist, 'blocksStates'), { recursive: true })
let before = 0
let after = 0
for (const name of fs.readdirSync(path.join(viewerPublic, 'blocksStates')).filter(isBedrock)) {
  const raw = fs.readFileSync(path.join(viewerPublic, 'blocksStates', name), 'utf8')
  const packed = JSON.stringify(pack(JSON.parse(raw)))
  fs.writeFileSync(path.join(dist, 'blocksStates', name), packed)
  before += raw.length
  after += packed.length
}
console.log(`blocksStates: ${(before / 1e6).toFixed(0)} MB packed to ${(after / 1e6).toFixed(0)} MB`)

// the pages: the example's (its scenes page as scenes.html), the site's, and its static files
copy(path.join(examplePublic, 'index.html'), path.join(dist, 'scenes.html'))
for (const page of ['entities.html', 'particles.html']) copy(path.join(examplePublic, page), path.join(dist, page))
copy(path.join(__dirname, 'pages'), dist)
if (fs.existsSync(path.join(__dirname, 'static'))) copy(path.join(__dirname, 'static'), dist)

// the versions the site shows: every Bedrock version minecraft-data knows, newest first, with the assets it draws
// with where the site has them
const mcData = require('minecraft-data')
const versions = [...new Set(mcData.versions.bedrock.map(v => v.minecraftVersion))].map(v => {
  const version = 'bedrock_' + v
  const assets = getVersion(version)
  return { version, assets: assets && fs.existsSync(path.join(dist, 'blocksStates', assets + '.json')) ? assets : null }
})
fs.writeFileSync(path.join(dist, 'versions.json'), JSON.stringify(versions))

// what it was built from
fs.writeFileSync(path.join(dist, 'built-from.json'), execFileSync(process.execPath, [path.join(__dirname, 'built-from.js')], { encoding: 'utf8', maxBuffer: 1 << 26 }))
// (GitHub Pages serves files and folders beginning with _ only without Jekyll)
fs.writeFileSync(path.join(dist, '.nojekyll'), '')

const size = dir => fs.readdirSync(dir, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? size(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0)
console.log(`dist: ${(size(dist) / 1e6).toFixed(0)} MB`)
