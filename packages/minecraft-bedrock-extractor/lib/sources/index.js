// Where a Bedrock version's vanilla resource packs come from.
//
// 1. An installed client (--clients): the real pack stack.
// 2. A tag of Mojang/bedrock-samples (v1.19.30 onwards): the same vanilla resource pack, merged into one.
// 3. A commit of ZtechNetwork/MCBVanillaResourcePack: community copies of the vanilla pack back to 1.6.0.5, the only
//    source for the oldest versions minecraft-data knows (0.14, 0.15, 1.0).
//
// A version takes the source of its own hotfix family (1.26.40 -> client 1.26.42, 1.20.15 -> samples 1.20.10) when
// there is one - an installed client first, as it is the game's own copy - else the nearest source of its minor
// (older first, then newer: 1.19.1 draws on 1.19.10 rather than 1.18.30), else the newest source before it.
const { PackStack } = require('../pack/stack')
const { compareVersions, parseVersion, family, minor } = require('../pack/versions')
const { clientSources } = require('./client')
const { samplesSources, ztechSources, checkoutGitSource } = require('./git')

const KIND_RANK = { client: 0, 'bedrock-samples': 1, MCBVanillaResourcePack: 2 }

// kinds: the kinds of source to list (all by default)
function listSources ({ clientsDir, cacheDir, refresh = false, kinds = Object.keys(KIND_RANK) }) {
  return [
    ...(kinds.includes('client') ? clientSources(clientsDir) : []),
    ...(kinds.includes('bedrock-samples') ? samplesSources(cacheDir, refresh).values() : []),
    ...(kinds.includes('MCBVanillaResourcePack') ? ztechSources(cacheDir, refresh).values() : [])
  ]
}

// the source for one minecraft-data version, with how it relates to the version (match)
function pickSource (version, sources) {
  if (!sources.length) throw new Error('no sources: give --clients, or let the public sources be fetched')
  const byRank = (x, y) => (KIND_RANK[x.kind] - KIND_RANK[y.kind]) ||
    Math.abs(parseVersion(x.version)[2] - parseVersion(version)[2]) - Math.abs(parseVersion(y.version)[2] - parseVersion(version)[2]) ||
    compareVersions(x.version, y.version)
  const exact = sources.filter(s => compareVersions(s.version, version) === 0).sort(byRank)
  if (exact.length) return { ...exact[0], match: 'exact' }
  const sameFamily = sources.filter(s => family(s.version) === family(version)).sort(byRank)
  if (sameFamily.length) return { ...sameFamily[0], match: 'hotfix' }
  const newestFirst = (x, y) => compareVersions(y.version, x.version) || KIND_RANK[x.kind] - KIND_RANK[y.kind]
  const oldestFirst = (x, y) => compareVersions(x.version, y.version) || KIND_RANK[x.kind] - KIND_RANK[y.kind]
  const sameMinor = sources.filter(s => minor(s.version) === minor(version))
  const olderMinor = sameMinor.filter(s => compareVersions(s.version, version) < 0).sort(newestFirst)
  if (olderMinor.length) return { ...olderMinor[0], match: 'older' }
  const newerMinor = sameMinor.sort(oldestFirst)
  if (newerMinor.length) return { ...newerMinor[0], match: 'newer' }
  const before = sources.filter(s => compareVersions(s.version, version) < 0).sort(newestFirst)
  if (before.length) return { ...before[0], match: 'older' }
  return { ...[...sources].sort(oldestFirst)[0], match: 'closest-newer' }
}

// A git source has the vanilla pack alone (and 0.14's atlases no blocks.json): no chemistry or experimental packs, and
// (bedrock-samples) no item definitions. The nearest installed client supplements it, below its own pack, so it only
// fills what is missing.
function pickSupplement (version, sources) {
  const clients = sources.filter(s => s.kind === 'client' && s.hasBlocksJson)
  const distance = s => {
    const [a, b, c] = parseVersion(s.version)
    const [x, y, z] = parseVersion(version)
    return Math.abs((a * 1000 + b) * 1000 + c - ((x * 1000 + y) * 1000 + z))
  }
  return clients.sort((p, q) => distance(p) - distance(q) || compareVersions(p.version, q.version))[0] ?? null
}

// the plan of one version: its source and, for a git source, the client that supplements it
function planVersion (version, sources) {
  const source = pickSource(version, sources)
  const supplement = source.kind === 'client' && source.hasBlocksJson ? null : pickSupplement(version, sources)
  return { version, source, supplement }
}

// the source's resource pack stack, its behaviour pack stack as stack.behavior (or null)
function openSource (source, cacheDir, supplement = null) {
  let own
  if (source.kind === 'client') {
    own = PackStack.fromInstall(source.dir)
    own.behavior = PackStack.behaviorFromInstall(source.dir)
  } else {
    const { dir, behavior } = checkoutGitSource(source, cacheDir)
    own = PackStack.fromDir(dir)
    own.behavior = behavior ? PackStack.fromDir(behavior) : null
  }
  if (!supplement) return own
  const below = PackStack.fromInstall(supplement.dir).layers.map(l => ({ ...l, name: `${supplement.build}/${l.name}` }))
  const stack = new PackStack([...below, ...own.layers])
  stack.behavior = own.behavior ?? PackStack.behaviorFromInstall(supplement.dir)
  return stack
}

function describeSource (s) {
  return s.kind === 'client'
    ? { kind: s.kind, build: s.build, match: s.match }
    : { kind: s.kind, build: s.build, ref: s.ref, match: s.match }
}

module.exports = { listSources, pickSource, pickSupplement, planVersion, openSource, describeSource, KIND_RANK }
