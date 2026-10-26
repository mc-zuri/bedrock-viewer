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
| Every state of (regex) | every state (the first 128) of each block whose name matches, a row a block: stairs by `weirdo_direction` and `upside_down_bit`, walls by `wall_connection_type_*`, doors by `door_hinge_bit` and `upper_block_bit`, rails by `rail_direction`... |
| Fences, panes, walls, stairs | a fence pen with a gate, glass panes up to a glass block, iron bars in a T, a wall, a ring of stairs: their connections and corners set in their states as a server sends them from 1.26.50, worked out from the neighbours by the viewer before |
| Block entities | beds of five colours and heads on the floor turned by their `Rotation` (the block entities a server sends with them), chests, heads on a wall, signs standing and on a wall, hanging signs on a wall and under a beam, banners standing and on a wall, a decorated pot, copper golem statues: drawn from Bedrock's entity geometry and sheets |
| Redstone dust | dust connected by its neighbours: a line from a lever fading with its signal, a corner, a T, a cross, a lone dust, dust up a block and down it, into a repeater, from a torch |
| Bedrock-only blocks | the blocks Java has no counterpart of: Education Edition's elements and chemistry blocks, cameras, border, allow, deny, the nether reactor, glowing obsidian, coloured and underwater torches, hard glass, item frames |

Click a block to read its Bedrock name, state, state id and block entity (the server reads them from the scene's
chunks).
`#camera=x,y,z&target=x,y,z` in the address places the camera.

`client/index.js` is the page: prismarine-viewer's `Viewer` with an orbit camera, bundled by `build.js` (esbuild, the
viewer's web utilities in place of its Node ones). `tools/mesh.js <version> <scene> [filter]` meshes a scene with the
viewer's own worker code in Node and reports any section that throws.
