// One Bedrock version, exported into <out>/<version>/ in minecraft-assets' layout.
const fs = require('fs')
const path = require('path')
const { planVersion, openSource, describeSource, pickSource } = require('./sources')
const { TextureStore } = require('./textures/store')
const { exportBlocks } = require('./blocks')
const { exportItems } = require('./items')
const { exportEntities } = require('./entities')
const { PackStack } = require('./pack/stack')

// a version's own packs: its stack without the newer clients' layers below it
function ownStack (stack, plan) {
  const later = plan.later.map(c => c.build + '/')
  return new PackStack(stack.layers.filter(l => !later.some(prefix => l.name.startsWith(prefix))))
}

// where a version's particle effects are read from: its own packs, or where its client ships them compiled (1.26.51's
// binary MCB files) Mojang's published pack of the version (bedrock-samples), which has them as JSON
function particleStack (own, version, sources, cacheDir) {
  const compiled = [...own.files.keys()].some(f => f.startsWith('particles/') && own.read(f)?.subarray(0, 4).toString('latin1') === '\x7fMCB')
  const samples = sources.filter(s => s.kind === 'bedrock-samples')
  if (!compiled || !samples.length) return { stack: own }
  const source = pickSource(version, samples)
  return { stack: openSource(source, cacheDir), source }
}

function writeJson (file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
}

// options: { version, out, sources, cacheDir, mcDataModule, tables, reference (the oldest Bedrock version minecraft-data
// has block states of, which a legacy version takes its shapes from), newest (the newest, whose stairs' corners the
// older versions' stairs take), log }
function exportVersion ({ version, out, sources, cacheDir, mcDataModule, tables, reference, newest, log = console.log }) {
  const mcData = mcDataModule('bedrock_' + version)
  if (!mcData?.blocksArray) throw new Error(`minecraft-data has no blocks of bedrock ${version}`)
  const legacy = mcData.blockStates ? null : { blocks: mcDataModule.legacy.bedrock.blocks, reference: mcDataModule('bedrock_' + reference) }
  const plan = planVersion(version, sources)
  const stack = openSource(plan.source, cacheDir, plan.supplement, plan.later)
  const store = new TextureStore(stack)
  const blocks = exportBlocks({ stack, mcData, store, tables, legacy, newest: mcDataModule('bedrock_' + newest) })
  const items = exportItems({ version, stack, mcData, store, itemBlocks: blocks.itemBlocks, resolveBlock: blocks.resolveBlock, itemIcons: tables.itemIcons, reference: legacy?.reference })

  const dir = path.join(out, version)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  let referenceOwn = null
  if (legacy) {
    const referencePlan = planVersion(reference, sources)
    referenceOwn = ownStack(openSource(referencePlan.source, cacheDir, referencePlan.supplement, referencePlan.later), referencePlan)
  }
  const own = ownStack(stack, plan)
  const particles = particleStack(own, version, sources, cacheDir)
  const entities = exportEntities({ mcData, stack, own, particles: particles.stack, dir, reference: referenceOwn && { own: referenceOwn, mcData: legacy.reference } })
  writeJson(path.join(dir, 'blocks_states.json'), blocks.blocksStates)
  writeJson(path.join(dir, 'blocks_models.json'), blocks.blocksModels)
  writeJson(path.join(dir, 'blocks_textures.json'), blocks.blocksTextures)
  writeJson(path.join(dir, 'items_textures.json'), items.itemsTextures)
  writeJson(path.join(dir, 'texture_content.json'), items.textureContent)
  store.write(dir)

  const meta = {
    version,
    source: describeSource(plan.source),
    supplement: plan.supplement ? describeSource(plan.supplement) : undefined,
    later: plan.later.length ? plan.later.map(describeSource) : undefined,
    blocks: Object.keys(blocks.blocksStates).length,
    states: mcData.blockStates?.length ?? Object.values(blocks.blocksStates).length,
    models: Object.keys(blocks.blocksModels).length,
    textures: store.out.blocks.size,
    items: items.itemsTextures.length,
    itemTextures: store.out.items.size,
    itemsWithoutIcon: items.unresolved,
    entities: entities.entities,
    entitiesNotDrawn: entities.entitiesNotDrawn,
    attachables: entities.attachables,
    particles: entities.particles,
    particlesSource: particles.source ? describeSource(particles.source) : undefined,
    shapes: blocks.report.shapes,
    missingTile: blocks.report.missingTile,
    unrendered: blocks.report.unrendered,
    missingTextures: blocks.report.missingTextures,
    failed: blocks.report.failed
  }
  writeJson(path.join(dir, 'meta.json'), meta)
  log(`bedrock ${version}: ${meta.blocks} blocks, ${meta.models} models, ${meta.textures} textures from ` +
    `${plan.source.kind} ${plan.source.build} (${plan.source.match}); ${meta.missingTile.length} drawn as missing_tile, ` +
    `${meta.unrendered.length} without render facts, ${meta.failed.length} failed; ` +
    `${meta.items} items, ${meta.itemsWithoutIcon.length} without an icon; ${meta.entities} entities ` +
    `(${meta.entitiesNotDrawn.length} not drawn), ${meta.attachables} armor items, ${meta.particles} particle effects`)
  return meta
}

module.exports = { exportVersion }
