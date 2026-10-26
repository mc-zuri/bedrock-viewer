// The page's link to the example's server (server.js): the socket a scene is shown over, the state of its picks (the
// version, the scene, the versions it can show) and a new pick. The site's build puts in its place one that runs the
// server in the page (site/src/server.js).
/* global fetch, location */
const io = require('socket.io-client')

module.exports = {
  connect: () => io({ path: window.location.pathname + 'socket.io' }),
  state: () => fetch('api/state').then(r => r.json()),
  // a version, scene and filter shown: the page shows them once reloaded; resolves { error } if it cannot
  select: query => fetch('api/select?' + query).then(r => r.json()).then(r => {
    if (!r.error) location.reload()
    return r
  })
}
