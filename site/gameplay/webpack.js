// Builds the Gameplay page: the page (gameplay.js, target web) and its Bedrock server, run in a Web Worker
// (gameplay-server.js, target webworker), into site/dist beside the pages. Each stands alone:
//
//   npx webpack -c gameplay/webpack.js        (in site/)
//
// They take bedrock-protocol's datatypes and framer, prismarine-physics' Bedrock engine (TypeScript, which webpack
// strips of its types itself, with the crt-math.wasm it fetches emitted beside them), mineflayer-pathfinder (which
// tries its moves with the workspace's prismarine-physics, the Bedrock one) and minecraft-data with the packets and
// items of each Bedrock version (GAMEPLAY_KEYS: mc-data/bedrock/ beside them, fetched a version at a time).
//
// The page fetches beside itself what the viewer's public/ holds (worldBounds.json, textures/, blocksStates/,
// entities/, worker.js) and worlds/ (site/static/worlds).
const path = require('path')
const webpack = require('webpack')
const { lazyMinecraftData } = require('prismarine-viewer/viewer/webpack/lazyMinecraftData')
const { GAMEPLAY_KEYS } = require('./data')

const site = path.join(__dirname, '..')
// (the page plays no other edition)
const BEDROCK = type => type === 'bedrock'
const packageDir = name => path.dirname(require.resolve(`${name}/package.json`))

function gameplay (name, source, target) {
  return lazyMinecraftData({
    name,
    mode: 'production',
    context: site,
    target,
    entry: { [name]: path.join(__dirname, source) },
    output: {
      path: path.join(site, 'dist'),
      filename: '[name].js'
    },
    resolve: {
      // (the workspace packages' own node_modules first; the polyfills ProvidePlugin adds to every module, theirs too,
      // are hoisted to the root, and the site has the rest)
      modules: ['node_modules', path.join(site, 'node_modules')],
      fallback: { zlib: false },
      alias: {
        'prismarine-physics$': path.join(packageDir('prismarine-physics'), 'index.js'),
        // bedrock-protocol's uuid type reads and writes UUIDs with uuid-1345, which draws on Node's crypto and os when
        // it loads: what the type uses of it
        'uuid-1345$': path.join(__dirname, 'uuid.js'),
        // the blob cache's hashes (prismarine-chunk): xxhash-wasm's ES build has its function as the default export,
        // which a require does not give, and its CommonJS one takes TextEncoder from Node's util
        'xxhash-wasm$': path.join(packageDir('xxhash-wasm'), 'umd', 'xxhash-wasm.js')
      }
    },
    module: {
      rules: [
        // three declares sideEffects: false, but examples/js scripts work by attaching to the THREE global
        { test: /three[/\\]examples[/\\]js/, sideEffects: true },
        // the physics' exact sine routines, fetched by the page (prismarine-physics math/crt.ts loadCrtAsync)
        { test: /crt-math\.wasm$/, type: 'asset/resource', generator: { filename: '[name][ext]' } }
      ]
    },
    plugins: [
      new webpack.ProvidePlugin({ process: 'process/browser' }),
      new webpack.ProvidePlugin({ Buffer: ['buffer', 'Buffer'] }),
      // (matched against the file it resolves to: utils.js, utils.electron.js)
      new webpack.NormalModuleReplacementPlugin(/viewer[/\\]lib[/\\]utils/, './utils.web.js'),
      // (the physics' hooks that run its TypeScript in Node: the bundle takes the TypeScript itself)
      new webpack.IgnorePlugin({ resourceRegExp: /[/\\]ts-hooks$/, contextRegExp: /prismarine-physics/ })
    ],
    experiments: { typescript: true },
    // bedrock-protocol compiles some of its types from the source of its own functions (compiler-minecraft.js js()),
    // which a minifier rewrites: protodef evals the code
    optimization: { minimize: false },
    performance: { hints: false }
  }, { keys: GAMEPLAY_KEYS, versions: BEDROCK })
}

module.exports = [
  gameplay('gameplay', 'page.js', 'web'),
  gameplay('gameplay-server', 'worker.js', 'webworker')
]
