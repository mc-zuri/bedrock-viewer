// What a build of the site is made of: this repository and its submodules (and theirs), each with the fork it is
// pushed to, its branch, its commit, whether it had changes not committed, and the pull requests to its upstream
// its branch is in (or the ones it is built on), as the site's index lists them. Writes JSON to stdout.
//
// node site/built-from.js > dist/built-from.json      (GITHUB_TOKEN for the GitHub API's pull request search)
const { execFileSync } = require('child_process')
const path = require('path')

const root = path.join(__dirname, '..')
const git = (dir, ...args) => {
  try {
    return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

// the pull requests a package's branch is built on, where its own branch is not the one in the pull request (the
// README's package table names them)
const BUILT_ON = {
  'packages/prismarine-chunk': ['PrismarineJS/prismarine-chunk#327'],
  'packages/prismarine-registry': ['PrismarineJS/prismarine-registry#57'],
  'packages/prismarine-block': ['PrismarineJS/prismarine-block#129'],
  'packages/minecraft-data': ['PrismarineJS/node-minecraft-data#468']
}

// owner/name of a GitHub URL (https or ssh), or null
function repoOf (url) {
  const m = /github\.com[/:]([^/]+)\/([^/]+?)(\.git)?$/.exec(url ?? '')
  return m ? `${m[1]}/${m[2]}` : null
}

// a repository's submodules, as its .gitmodules names them (path, url, branch), with what the checkout has
function submodules (dir, depth) {
  const out = []
  const config = git(dir, 'config', '-f', '.gitmodules', '--get-regexp', '^submodule\\.')
  const byName = {}
  for (const line of config.split('\n').filter(Boolean)) {
    const m = /^submodule\.(.+)\.(path|url|branch) (.+)$/.exec(line)
    if (m) (byName[m[1]] ??= {})[m[2]] = m[3]
  }
  for (const { path: rel, url, branch } of Object.values(byName)) {
    const sub = path.join(dir, rel)
    const entry = describe(sub, { url, branch, depth, path: path.relative(root, sub).replace(/\\/g, '/') })
    out.push(entry, ...submodules(sub, depth + 1))
  }
  return out
}

// a checkout: its fork (its .gitmodules URL, else its remote), branch, commit and whether it has changes
function describe (dir, { url, branch, depth, path: rel }) {
  const head = git(dir, 'rev-parse', 'HEAD')
  return {
    name: path.basename(dir),
    path: rel,
    depth,
    repo: repoOf(url) ?? repoOf(git(dir, 'remote', 'get-url', 'origin')),
    branch: git(dir, 'branch', '--show-current') || branch || null,
    sha: head ? head.slice(0, 7) : null,
    // (changes to tracked files; a submodule's own changes are its own row's)
    dirty: head ? git(dir, 'status', '--porcelain', '--untracked-files=no', '--ignore-submodules=all') !== '' : null
  }
}

async function github (route) {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'bedrock-viewer-site' }
  if (process.env.GITHUB_TOKEN) headers.authorization = 'Bearer ' + process.env.GITHUB_TOKEN
  const res = await fetch('https://api.github.com' + route, { headers })
  if (!res.ok) throw new Error(`${route}: ${res.status}`)
  return res.json()
}

// a pull request, as the index shows it
const pullOf = p => ({ number: p.number, url: p.html_url, title: p.title, state: p.merged_at || p.pull_request?.merged_at ? 'merged' : p.state, draft: !!p.draft })

// the fork's upstream, and the pull requests to it from the fork's branch (by the branch's name, whoever's fork it
// is in), and those it is built on
async function pulls (entry) {
  if (!entry.repo) return entry
  try {
    const info = await github(`/repos/${entry.repo}`)
    entry.upstream = info.parent?.full_name ?? null
    const target = entry.upstream ?? entry.repo
    if (entry.branch) {
      const q = encodeURIComponent(`repo:${target} is:pr head:${entry.branch}`)
      const found = await github(`/search/issues?q=${q}&per_page=5`)
      entry.pulls = found.items.map(pullOf)
      if (entry.upstream) entry.compare = `https://github.com/${entry.upstream}/compare/${info.parent.default_branch}...${entry.repo.split('/')[0]}:${entry.repo.split('/')[1]}:${entry.branch}`
    }
    entry.builtOn = []
    for (const ref of BUILT_ON[entry.path] ?? []) {
      const [repo, number] = ref.split('#')
      entry.builtOn.push(pullOf(await github(`/repos/${repo}/pulls/${number}`)))
    }
  } catch (err) {
    entry.error = err.message
  }
  return entry
}

async function main () {
  const self = describe(root, { depth: 0, path: '.' })
  // (in a GitHub Actions run: its repository, branch and run)
  if (process.env.GITHUB_REPOSITORY) self.repo = process.env.GITHUB_REPOSITORY
  if (process.env.GITHUB_REF_NAME) self.branch = process.env.GITHUB_REF_NAME
  const repos = [self, ...submodules(root, 1)]
  await Promise.all(repos.map(pulls))
  const run = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null
  process.stdout.write(JSON.stringify({ builtAt: new Date().toISOString(), run, repos }, null, 2) + '\n')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
