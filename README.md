# bedrock-viewer

Bedrock Edition support for [prismarine-viewer](https://github.com/PrismarineJS/prismarine-viewer), for every Bedrock
version [minecraft-data](https://github.com/PrismarineJS/minecraft-data) has (0.14 to 1.26.51), done as assets rather
than viewer code: [bedrock-assets-extractor](https://github.com/mc-zuri/bedrock-assets-extractor) writes Bedrock's
own blocks and items into [minecraft-assets](https://github.com/PrismarineJS/minecraft-assets) in the format of its
Java versions, and the viewer draws them with the code it draws Java with.

```sh
git clone --recurse-submodules <this repository>
pnpm install          # pnpm 11; builds minecraft-data's index and prismarine-viewer's page
pnpm example          # http://localhost:3000: pick a Bedrock version and a scene
```

## Packages

A pnpm workspace; every package resolves the others from `packages/` (`pnpm-workspace.yaml` overrides them).

| Package | Path | Source | Branch here | What it adds |
|---|---|---|---|---|
| prismarine-viewer | packages/prismarine-viewer | PrismarineJS/prismarine-viewer `master` | `bedrock` | Bedrock versions in `version.js` and `prerender.js`; flowing water and lava drawn as liquids; the water of a block's second layer; fence, pane and stair connections from the neighbours where the states lack them (before 1.26.50), and redstone dust's; a block entity's data where a blockstate is keyed by it (a bed's colour, a head's type and rotation, a piston's arm); Bedrock entities, armor, held items, skins, name tags and particle effects drawn and animated as the game does (`viewer/lib/bedrock`, the entity runtime of the bedrock-web-viewer proof of concept); a Bedrock column's biome; faces of blocks turned 270° culled against the right neighbours; Bedrock biomes' grass and leaves by the Java biomes they are, their water by their own colour; a gutter round each atlas tile, so that no block's edge takes its neighbour's texture; `examples/bedrock.js` |
| minecraft-assets | packages/minecraft-assets | PrismarineJS/node-minecraft-assets `master` | `bedrock` | `require('minecraft-assets')('bedrock_1.21.0')`: `data/bedrock/<version>/` through `data/bedrock/versions.json` |
| (data) | packages/minecraft-assets/minecraft-assets | PrismarineJS/minecraft-assets `master` | `bedrock` | `data/bedrock/`: the extractor's output, every version |
| bedrock-assets-extractor | packages/bedrock-assets-extractor | mc-zuri/bedrock-assets-extractor `main` | | the extractor |
| minecraft-jar-extractor | packages/minecraft-jar-extractor | PrismarineJS/minecraft-jar-extractor `master` (mc-zuri's fork merged) | `bedrock-viewer` | Java's chests and other block entities as block models |
| minecraft-data | packages/minecraft-data | PrismarineJS/node-minecraft-data `master` | `bedrock-viewer` | node-minecraft-data#468 (`blockSelectionShapes`), the data below |
| (data) | packages/minecraft-data/minecraft-data | mc-zuri/minecraft-data `data` | `bedrock-viewer` | bedrock-data-generator's biomes and entities of every version and its new `blockSelectionShapes`; a name per Bedrock 0.14 - 1.0 block (the Bedrock name of each id where two shared one: `flowing_water`, `wall_sign`, `lit_furnace`...) |
| prismarine-chunk | packages/prismarine-chunk | mc-zuri/prismarine-chunk `bedrock` (PrismarineJS/prismarine-chunk#327) | `bedrock-legacy-viewer` | 0.14 - 1.0 columns by state id, with bounds and sections; 0.15 |
| prismarine-registry | packages/prismarine-registry | mc-zuri/prismarine-registry `bedrock` (PrismarineJS/prismarine-registry#57) | | |
| prismarine-block | packages/prismarine-block | Pix3lPirat3/prismarine-block `fix/hashed-runtime-metadata` (PrismarineJS/prismarine-block#129) | `bedrock-legacy-properties` | 0.14 - 1.0 blocks' properties from minecraft-data's Bedrock legacy table |
| bedrock-viewer-example | example | this repository | | the example project |

The branches named here are local: push them to forks before the submodules can be cloned elsewhere.

## Regenerating

minecraft-data's Bedrock files come from [bedrock-data](https://github.com/mc-zuri/bedrock-data) through
[bedrock-data-generator](https://github.com/mc-zuri/bedrock-data-generator) (its `block-selection-shapes` branch adds
`blockSelectionShapes`). The viewer, the extractor and the example read only these of its generators: blocks, block
states, collision and selection shapes, items, biomes and entities (materials is prismarine-block's):

```sh
cd ../bedrock-data-generator
MINECRAFT_DATA_DIR=<this>/packages/minecraft-data/minecraft-data pnpm generate blocks blockStates blockCollisionShapes blockSelectionShapes materials items biomes entities
cd <this>/packages/minecraft-data && npm run generate:data
```

The Bedrock assets, from installed clients (MCLauncher's folder) or the public packs:

```sh
pnpm extract --clients D:/apps/MCLauncher              # every version, into minecraft-assets' data/bedrock
pnpm extract 1.21.0 --sources bedrock-samples          # one version, from Mojang's bedrock-samples only
pnpm prerender                                         # the viewer's atlases and block states
```

## The example

[example/](example) serves a page with every Bedrock version minecraft-data knows and a few scenes drawn with it:

- **Showcase: The Heart of Oakvale**: a world of nine biomes round a village (snow, a dark forest, mountains with a
  waterfall and a ruined portal, a cherry grove, a jungle, a desert temple, badlands, a swamp with a witch's hut, a
  lake) and the Nether and the End, each with its own life, and a story told in it as a server would show it: pillagers
  raid the village for the Heart in its shulker box; Steve follows them through the dark forest, the snow and a nether
  portal to a nether fortress, on into the End to kill the Ender Dragon, and home on an elytra and a horse. A camera
  follows the story (drag to look round yourself; *Follow the story* to go back; *Next* to skip to the next part), with
  a caption for each part
  ([example/story.js](example/story.js) plays it: actors that walk, fight, die and ride, arrows and fireballs, blocks
  and lids, particles, the camera kept clear of what is in its way);
- **Landscape**: hills, a lake with seagrass and kelp standing in its water (Bedrock's second block layer), flowing
  water, waterlogged stairs, trees, grass and flowers, in the plains biome's colours;
- **Every block**: every block of the version in its default state;
- **Every state of (regex)**: every Bedrock state of the blocks whose names match (stairs by `weirdo_direction`, walls
  by their connections, doors, rails, torches...);
- **Fences, panes, walls, stairs**: a fence pen, glass panes, iron bars, a wall and a ring of stairs, their
  connections and corners from their states (1.26.50 on) or from their neighbours (before);
- **Block entities**: the blocks the client draws with block entity renderers, in place, with the block entities a
  server sends: beds of five colours, chests, heads on the floor turned by their rotation and on a wall, standing,
  wall and hanging signs, standing and wall banners, a decorated pot, copper golem statues;
- **Chests, shulker boxes and doors**: chests single and double, doors, a barrel and shulker boxes in colours facing
  each way (their block entity's facing), opened and shut every few seconds as a server does (a shulker box's lid
  rising and turning);
- **Entities, armor, held and dropped items, particles**: the version's mobs and flyers animated as the game animates
  them (prismarine-viewer's Bedrock entity runtime), players in armor holding items (one in a skin a server would
  send), a zombie walking with its sword and armor, dropped items, particle effects;
- **Redstone dust and pistons**: dust connected by its neighbours: lines, corners, a T, a cross, a lone dust, dust
  climbing a block, into a repeater and from a torch; pistons and sticky pistons facing each way, pushing out and
  pulling back every few seconds as a server moves them (their block entity's progress, the arm's collision block);
- **Bedrock-only blocks**: Education Edition's cameras, border, allow and deny, the nether reactor, glowing obsidian
  (chemistry is left out of the assets).

*All entities* opens a page of every entity of the version: focus one, set its mode (walk, sprint, swim, glide, sit,
sleep...), what it holds and wears and its flags, and play its actions (attack, hurt, die...) and any of its animations,
on it or on all of them.

Click a block to read its Bedrock name, state and block entity. `#camera=x,y,z&target=x,y,z` in the address sets
the camera.
