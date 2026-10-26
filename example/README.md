# bedrock-viewer-example

Every Bedrock version minecraft-data knows, drawn by prismarine-viewer from the Bedrock assets of minecraft-assets.

```sh
pnpm start                                     # http://localhost:3000
node server.js bedrock_1.26.51 states 'door$'  # a version, a scene and its filter to start with
```

The page lists every Bedrock version minecraft-data knows; a version is drawn with the assets of the newest version
prismarine-viewer has built that is not newer than it (1.21.2 with 1.21.0's). The scenes are built in `scenes.js`
from the version's own block states, as prismarine-chunk Bedrock columns:

| Scene | What it shows |
|---|---|
| Landscape | hills of grass, dirt and stone, a lake and its sand with seagrass and kelp standing in its water (Bedrock's second block layer, 1.16 on), waterlogged stairs on its shore, a spring of flowing water, oak and birch trees, grass and flowers, in the plains biome's colours |
| Every block | every block of the version, in its default state |
| Every state of (regex) | every state (the first 128) of each block whose name matches, a row a block: stairs by `weirdo_direction` and `upside_down_bit`, walls by `wall_connection_type_*`, doors by their direction, openness, hinge and half (each half alone: the Chests and doors scene has whole doors), rails by `rail_direction`... |
| Fences, panes, walls, stairs | a fence pen with a gate, glass panes up to a glass block, iron bars in a T, a wall, a ring of stairs: their connections and corners set in their states as a server sends them from 1.26.50, worked out from the neighbours by the viewer before |
| Block entities | beds of five colours and heads on the floor turned by their `Rotation` (the block entities a server sends with them), chests, heads on a wall, signs standing and on a wall, hanging signs on a wall and under a beam, banners standing and on a wall, a decorated pot, copper golem statues: drawn from Bedrock's entity geometry and sheets |
| Chests and doors, opening and shutting | chests single and double in each direction (a pair: each half's block entity names the other, `pairx` and `pairz`), a trapped, an ender and a copper chest, their lids opened and shut every 3 seconds by block events (the `lid` event: `block_event` `change_state` as a Bedrock server sends it); doors in each direction with each hinge as the game keeps them (the lower half holds the direction and openness, the upper half the hinge), and a barrel, opened and shut by block updates |
| Entities, armor, held and dropped items, particles | the version's mobs and flyers (an allay, a parrot, a phantom, a ghast, the ender dragon), animated as the game animates them; a zombie in iron armor with a sword walking to and fro; players in armor holding items, one in a skin a Bedrock server would send (its pixels, `bedrockSkin`); dropped items; particle effects every second (hearts, flames, smoke, campfire smoke, portal, redstone, totem, an explosion) |
| Redstone dust | dust connected by its neighbours: a line from a lever fading with its signal, a corner, a T, a cross, a lone dust, dust up a block and down it, into a repeater, from a torch |
| Bedrock-only blocks | the blocks Java has no counterpart of: Education Edition's elements and chemistry blocks, cameras, border, allow, deny, the nether reactor, glowing obsidian, coloured and underwater torches, hard glass, item frames |

Click a block to read its Bedrock name, state, state id and block entity (the server reads them from the scene's
chunks).

## All entities

`entities.html` (the page's *All entities* link) draws every entity of a version, as prismarine-viewer's Bedrock entity
runtime draws and animates it, in a grid (filter it by name). Click one, or pick it in *Focus*, to look at it alone;
what the controls set then applies to it, or to all of them (*Apply to*):

- **Mode**: stand, walk, sprint, sneak, sneak + walk, swim, glide, fly / fall, crawl, sit, ride, sleep, rest; baby, in
  water, using an item (the flags and motion the game sends for them: see *What each mode sets*)
- **Holds** and **Wears**: an item in either hand, armour (the version's attachables, or the newest version's where it
  has their textures)
- **Flags**: sheared, saddled, chested, tamed, angry, powered, charged, casting, standing, and any other by name;
  variant, mark variant, colour, climate
- **Do**: attack, hurt, die, revive, graze, shake, offer a flower, jump (the entity events the server sends)
- **Animation**: any of the focused entity's animations and animation controllers, played as the server plays them
  (animate_entity), and its entity properties
- **Skin**: the players as Steve and Alex, or a skin image of your own

`entities.html?version=bedrock_1.26.51&mode=walk&focus=spider&filter=zombie` opens it so. The page is the
bedrock-web-viewer proof of concept's entities page (`client/entities.js`, `client/common.js`).

## All particles

`particles.html` (*All particles*) lists every particle effect of a version (its packs' particles) and plays those
ticked side by side, as prismarine-viewer's Bedrock particle system runs them: one that loops or runs on runs on, one
that ends is played again every 3 seconds, and one whose particles the game emits itself is given some every moment.
An effect marked `*` has components the system does not run (its tooltip says which). Filter by name, then *Play
shown*; `particles.html?version=bedrock_1.26.51&filter=flame&play=shown` (or `play=all`, or identifiers comma
separated) opens it so. It is the proof of concept's particles page (`client/particles.js`). 0.14 - 1.0 have no
particle effects to list: their clients draw particles in code.
`#camera=x,y,z&target=x,y,z` in the address places the camera.

`client/index.js` is the page: prismarine-viewer's `Viewer` with an orbit camera, bundled by `build.js` (esbuild, the
viewer's web utilities in place of its Node ones). `tools/mesh.js <version> <scene> [filter]` meshes a scene with the
viewer's own worker code in Node and reports any section that throws.
