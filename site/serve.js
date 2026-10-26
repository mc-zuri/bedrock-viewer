// Serves dist/ as GitHub Pages does, to try the site before it is deployed: node serve.js [port]   (default 3100)
const http = require('http')
const fs = require('fs')
const path = require('path')

const dist = path.join(__dirname, 'dist')
const port = +(process.argv[2] ?? process.env.PORT ?? 3100)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.wasm': 'application/wasm', '.bin': 'application/octet-stream', '.txt': 'text/plain' }

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  let file = path.join(dist, url)
  if (!file.startsWith(dist)) { res.writeHead(403).end(); return }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')
  if (!fs.existsSync(file)) { res.writeHead(404).end('not found'); return }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
}).listen(port, () => console.log(`the site on http://localhost:${port}`))
