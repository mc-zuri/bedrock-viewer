// The site's bundles, into dist/: the example's pages (its scenes, the entities and the particles pages) with the
// example's server run in the page (src/server.js in place of the page's link to it, src/sceneServer.js its worker),
// and Gameplay's (gameplay/webpack.js). minecraft-data reaches the browser a version at a time (prismarine-viewer's
// lazyMinecraftData: its files beside the bundles, in dist/mc-data/, fetched as a version is shown), Bedrock's only.
const fs = require('fs')
const path = require('path')
const webpack = require('webpack')
const { lazyMinecraftData, WORKER_KEYS } = require('prismarine-viewer/viewer/webpack/lazyMinecraftData')

const dist = path.join(__dirname, 'dist')
const exampleClient = path.join(__dirname, '..', 'example', 'client')
const bedrockOnly = type => type === 'bedrock'

// what every bundle takes: the browser's polyfills, the viewer's web utils in place of its Node and Electron ones
const base = target => ({
  mode: 'production',
  target,
  output: { path: dist, filename: '[name].js' },
  performance: { hints: false },
  resolve: { fallback: { zlib: false, fs: false, path: false } },
  module: {
    rules: [
      // three declares sideEffects: false, but examples/js scripts work by attaching to the THREE global
      { test: /three[/\\]examples[/\\]js/, sideEffects: true }
    ]
  },
  plugins: [
    new webpack.ProvidePlugin({ process: 'process/browser', Buffer: ['buffer', 'Buffer'] }),
    new webpack.NormalModuleReplacementPlugin(/viewer[/\\]lib[/\\]utils(\.electron)?(\.js)?$/, './utils.web.js')
  ]
})

// the example's pages, their link to the server the one that runs it in the page
const pages = base('web')
pages.name = 'pages'
pages.entry = { client: path.join(exampleClient, 'index.js'), entities: path.join(exampleClient, 'entities.js'), particles: path.join(exampleClient, 'particles.js') }
pages.plugins.push(new webpack.NormalModuleReplacementPlugin(/^\.\/server$/, resource => {
  if (resource.context === exampleClient) resource.request = path.join(__dirname, 'src', 'server.js')
}))

// the example's server, in a worker: the scenes it builds read blocks, states, biomes, items and entities
const sceneServer = lazyMinecraftData({
  ...base('webworker'),
  name: 'scene-server',
  entry: { 'scene-server': path.join(__dirname, 'src', 'sceneServer.js') }
}, { keys: [...WORKER_KEYS, 'items', 'entities'], versions: bedrockOnly })

const gameplay = path.join(__dirname, 'gameplay', 'webpack.js')
module.exports = [pages, sceneServer, ...(fs.existsSync(gameplay) ? require(gameplay) : [])]
