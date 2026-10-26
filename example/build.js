// Bundles client/index.js into public/client.js. prismarine-viewer's browser code takes its web utils in place of the
// Node and Electron ones (as its own webpack build does).
const path = require('path')
const esbuild = require('esbuild')

const webUtils = {
  name: 'viewer-web-utils',
  setup (build) {
    build.onResolve({ filter: /[/\\]utils(\.electron)?(\.js)?$/ }, args => {
      if (!/prismarine-viewer[/\\]viewer[/\\]lib/.test(args.resolveDir)) return
      return { path: path.join(path.dirname(path.resolve(args.resolveDir, args.path)), 'utils.web.js') }
    })
  }
}

esbuild.build({
  entryPoints: [path.join(__dirname, 'client/index.js')],
  bundle: true,
  outfile: path.join(__dirname, 'public/client.js'),
  platform: 'browser',
  // (the viewer's WorldRenderer reads __dirname before it checks for a browser)
  define: { global: 'globalThis', __dirname: '"/"', 'process.env.NODE_ENV': '"production"' },
  minify: true,
  plugins: [webUtils],
  logLevel: 'info'
}).catch(() => process.exit(1))
