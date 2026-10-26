// The public sources: a tag of Mojang/bedrock-samples (v1.19.30 onwards, the vanilla resource pack merged into one),
// or a commit of ZtechNetwork/MCBVanillaResourcePack (community copies of the vanilla pack back to 1.6.0.5). Both are
// blobless clones in the cache; a source's files are checked out into the cache the first time it is used.
const { execFileSync } = require('child_process')
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('fs')
const { join, resolve } = require('path')
const { compareVersions, parseVersion } = require('../pack/versions')

const SAMPLES_URL = 'https://github.com/Mojang/bedrock-samples.git'
const ZTECH_URL = 'https://github.com/ZtechNetwork/MCBVanillaResourcePack.git'

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 28 })

// a blobless clone: history and trees only, each source's blobs fetched when it is first used
function ensureClone (url, dir) {
  if (!existsSync(join(dir, '.git'))) {
    mkdirSync(dir, { recursive: true })
    git(['clone', '--filter=blob:none', '--no-checkout', '--quiet', url, dir])
  }
  return dir
}

// bedrock-samples release tags: v1.21.50.7 -> 1.21.50
function samplesSources (cacheDir, refresh) {
  const repo = ensureClone(SAMPLES_URL, join(cacheDir, 'bedrock-samples'))
  if (refresh) git(['fetch', '--quiet', '--tags', 'origin'], repo)
  return git(['tag', '--list', 'v*'], repo).split('\n').filter(t => /^v\d+\.\d+\.\d+(\.\d+)?$/.test(t))
    .map(tag => {
      const [a, b, c] = parseVersion(tag.slice(1))
      return { kind: 'bedrock-samples', version: `${a}.${b}.${c}`, build: tag.slice(1), ref: tag, repo, root: 'resource_pack' }
    })
    // one per version: the latest build of it
    .sort((x, y) => compareVersions(x.build, y.build))
    .reduce((acc, s) => { acc.set(s.version, s); return acc }, new Map())
}

// MCBVanillaResourcePack commits named "... v1.16.201" / "Bedrock Edition Release v1.6.0.5"
function ztechSources (cacheDir, refresh) {
  const repo = ensureClone(ZTECH_URL, join(cacheDir, 'MCBVanillaResourcePack'))
  if (refresh) git(['fetch', '--quiet', 'origin'], repo)
  const out = new Map()
  for (const line of git(['log', '--format=%H %s', 'origin/HEAD'], repo).split('\n')) {
    const m = /^(\w+) (.*)$/.exec(line)
    if (!m || /java/i.test(m[2])) continue
    const v = /v(\d+)\.(\d+)(?:\.(\d+))?/.exec(m[2])
    if (!v) continue
    // v26.10.0 is 1.26.10
    const [a, b, c] = v[1] === '1' ? [1, +v[2], +(v[3] ?? 0)] : [1, +v[1], +v[2]]
    const version = `${a}.${b}.${c}`
    if (out.has(version)) continue // log is newest first: keep the newest commit of a version
    const root = git(['ls-tree', '--name-only', m[1]], repo).split('\n').includes('bedrock') ? 'bedrock' : ''
    out.set(version, { kind: 'MCBVanillaResourcePack', version, build: version, ref: m[1], repo, root })
  }
  return out
}

// the files a git source needs, checked out once into the cache: textures and the JSON the export reads
const GIT_PATHS = ['textures', 'blocks.json', 'biomes_client.json', 'items', 'entity', 'models', 'render_controllers',
  'animations', 'animation_controllers', 'materials', 'biomes', 'attachables', 'particles']
// and from the repository's root: the behaviour pack's entity definitions (their client-synced properties)
const ROOT_PATHS = ['behavior_pack/entities']

// -> { dir: the resource pack, behavior: the behaviour pack (or null) }
function checkoutGitSource (source, cacheDir) {
  // (absolute: git runs in the cache repository)
  const dir = resolve(join(cacheDir, 'trees', `${source.kind}-${source.build}`))
  const marker = join(dir, '.complete')
  const want = `${source.ref} ${[...GIT_PATHS, ...ROOT_PATHS].join(',')}`
  // (a tree checked out for fewer paths is checked out again)
  if (!existsSync(marker) || readFileSync(marker, 'utf8') !== want) {
    mkdirSync(dir, { recursive: true })
    const prefix = source.root ? source.root + '/' : ''
    const present = git(['ls-tree', '--name-only', source.ref, prefix || '.'], source.repo).split('\n')
      .map(p => p.slice(prefix.length))
    const paths = GIT_PATHS.filter(p => present.includes(p)).map(p => prefix + p)
    for (const p of ROOT_PATHS) {
      const [top, ...rest] = p.split('/')
      if (git(['ls-tree', '--name-only', source.ref, top + '/'], source.repo).split('\n').includes(top + '/' + rest.join('/'))) paths.push(p)
    }
    // fetch the missing blobs in batches first: a checkout of a blobless clone would fetch them one at a time
    const missing = git(['rev-list', '--objects', '--missing=print', source.ref, '--', ...paths], source.repo)
      .split('\n').filter(l => l.startsWith('?')).map(l => l.slice(1))
    for (let i = 0; i < missing.length; i += 500) {
      git(['-c', 'fetch.negotiationAlgorithm=noop', 'fetch', '--quiet', '--no-tags', '--no-write-fetch-head',
        '--recurse-submodules=no', '--filter=blob:none', 'origin', ...missing.slice(i, i + 500)], source.repo)
    }
    git(['--work-tree', dir, 'checkout', source.ref, '--', ...paths], source.repo)
    git(['reset', '--quiet'], source.repo) // leave the cache repo's index as it was
    writeFileSync(marker, want)
  }
  const behavior = join(dir, 'behavior_pack')
  return { dir: source.root ? join(dir, source.root) : dir, behavior: existsSync(behavior) ? behavior : null }
}

module.exports = { samplesSources, ztechSources, checkoutGitSource, GIT_PATHS, SAMPLES_URL, ZTECH_URL }
