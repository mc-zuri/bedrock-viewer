# minecraft-bedrock-extractor

Exports the block and item assets of Minecraft Bedrock Edition into
[minecraft-assets](https://github.com/PrismarineJS/minecraft-assets) (`data/bedrock/<version>/`), in the format its
Java versions already have, so that [prismarine-viewer](https://github.com/PrismarineJS/prismarine-viewer) draws
Bedrock worlds with the code it draws Java worlds with. It is to Bedrock what
[minecraft-jar-extractor](https://github.com/PrismarineJS/minecraft-jar-extractor) is to Java.

Everything it writes comes from Bedrock itself — no Bedrock state is mapped to a Java one, and no Java asset is used:

- the block states: minecraft-data's Bedrock palette of the version (`blockStates.json`), and for 0.14 - 1.0, which
  have none, the block ids and data values minecraft-data's legacy table (`bedrock/common/legacy.json`) names the
  Bedrock state of;
- the geometry: each state's own Bedrock shapes (minecraft-data's `blockCollisionShapes.json` and
  `blockSelectionShapes.json`) laid out as the client's tessellator draws that block (`data/block_render.json`);
- the textures: the Bedrock resource packs' `blocks.json` and `terrain_texture.json` (a list of textures indexed by
  the state's legacy data value, `data/data_layouts.json`), `item_texture.json`, `flipbook_textures.json` and the
  texture files.

It ships no Minecraft assets (see [NOTICE.md](NOTICE.md)): it reads them from an installed client or from Mojang's
published packs, and writes them for you.

## Usage

```
npx minecraft-bedrock-extractor [versions...] [--out <dir>] [--cache <dir>] [--clients <dir>]
  [--sources client,bedrock-samples,MCBVanillaResourcePack] [--plan]
```

- `versions`: minecraft-data's Bedrock versions (`1.21.0`, `0.14`); all of them by default.
- `--out`: where the versions go, `data/bedrock` of the installed minecraft-assets by default.
- `--cache`: where the public sources are cloned (`.cache`).
- `--clients`: installed clients, as MCLauncher keeps them: `<dir>/Minecraft-<a.b.c.d>/` (or `BEDROCK_CLIENTS_DIR`).
- `--sources`: the kinds of source to choose from.
- `--plan`: print the source each version takes, and stop.

A version takes the pack of an installed client of its own build, else of its hotfix family, else the nearest of its
minor; a git source (a release tag of [Mojang/bedrock-samples](https://github.com/Mojang/bedrock-samples), 1.19.30 on,
or a commit of [ZtechNetwork/MCBVanillaResourcePack](https://github.com/ZtechNetwork/MCBVanillaResourcePack)) is
supplemented by the nearest client where there is one. The public sources are blobless clones; only the files a
version reads are checked out.

After the versions it writes `versions.json`: each version's folder. A version whose files are all the same as the
version before it shares that one's folder (`"1.21.2": "1.21.0"`).

## Output, per version

| File | Content |
|---|---|
| `blocks_states.json` | Java blockstates keyed by Bedrock block name. A variant key is the Bedrock state's properties as `getProperties()` of prismarine-block gives them (`weirdo_direction=2,upside_down_bit=1`, a byte as `0`/`1`), over the fewest properties that tell the block's models apart. Walls, fences and panes are `multipart`: the post and an arm turned to each connected side (`wall_connection_type_north=short`, `minecraft:connection_east=1`). |
| `blocks_models.json` | Java models. Geometry is in parents (`cube`, `geometry_<n>`), each state's textures in a child. Faces carry `cullface`, and `tintindex: 0` where the client tints them. |
| `blocks/*.png` | The Bedrock textures the models name, PNG (TGA converted), animated strips with the `.mcmeta` of their flipbook. A texture whose alpha is the mask the client tints (`grass_side`) is an opaque base and `<name>_overlay`. |
| `blocks_textures.json` | `[{ name, blockState, model, texture }]`, each block's default state. |
| `items_textures.json` | `[{ name, model, texture }]` of every minecraft-data item: `minecraft:items/<file>` or `minecraft:block/<file>`. |
| `items/*.png` | Item icons: the item's definition, its `item_texture.json` entry, the icons the client names in code; a spawn egg in its mob's colours and a block item's carried texture in its fixed colours, baked. |
| `texture_content.json` | `[{ name, texture }]`: each item's icon as a data URL. |
| `meta.json` | The source, counts, and what was not resolved. |

### How blocks are drawn

The generator of a state is chosen by the tessellator shape the client reports for its block (`Block`, `Stairs`,
`Fence`, `Torch`, `DoublesidedWideCrossTexture`, ...):

- box shapes (slabs, stairs, doors, trapdoors, cakes, hoppers, cauldrons, anvils, beds, chests, ...): the state's own
  collision boxes, else its selection box, each face textured by its side;
- a block with a front (furnace, dispenser, observer, carved pumpkin, glazed terracotta): turned to its facing;
- logs, basalt, chains: turned to their pillar axis;
- plants: two crossed planes; crops four in a #; torches (leaning off the wall their selection box is on), lanterns,
  rails (flat, ascending, curved), ladders, vines, glow lichen, redstone dust, lily pads, fence gates, levers,
  repeaters and comparators: as their tessellator lays them out;
- fences: the client's fence tessellator boxes (`data/tessellator_shapes.json`); walls: post and arms from their
  states; panes and bars: a sheet to each connected side, across both axes when the states say no connection (1.26.50
  on they say it);
- water and lava: the still texture, which prismarine-viewer draws as a liquid.

A colour the client gives a block whatever the biome (a lily pad, a birch or spruce leaves block of before the
flattening, a stem by its growth, redstone dust by its power) is baked into a tinted copy of the texture, since
prismarine-viewer picks a tint by block name; grass and foliage keep `tintindex` and take the biome's colour.

### What the Java format cannot say

- Neighbours: a state is drawn from its own properties. Fences, panes and stairs of the versions whose states lack
  their connections (before 1.26.50) draw unconnected; redstone dust draws its cross.
- Block entities: a bed's colour, a banner's pattern, a sign's text, a skull's rotation and a chest's lid are block
  entity data; beds, banners, skulls and chests draw as the boxes of their shapes.
- Waterlogging: Bedrock keeps the water in a second block layer, which prismarine-viewer does not draw.

## Tables

`data/` holds Bedrock facts the public sources do not carry, keyed by block name and state properties:

| Table | Content |
|---|---|
| `block_render.json` | Each block's tessellator shape, render layer and tint method, from the client's own exports |
| `block_render_overrides.json` | Hand corrections to it (leaves are cut out, a cauldron's water is tinted as water) |
| `flattening.json` | Legacy block names and the flattened block whose render facts each takes |
| `data_layouts.json` | How a block's properties pack into the legacy data value that indexes its textures |
| `tessellator_shapes.json` | The fence tessellator's boxes by connection mask |
| `legacy_keys.json` | The `blocks.json` key a block's description id names (`grass_block` → `grass`) |
| `item_icons.json` | The client's item definitions (`items/*.json`), per range of client versions |

## minecraft-data

The shapes come from minecraft-data. `blockSelectionShapes.json` (each state's selection box) is generated for every
Bedrock version by [bedrock-data-generator](https://github.com/mc-zuri/bedrock-data-generator) (`pnpm generate
blockSelectionShapes`) from [bedrock-data](https://github.com/mc-zuri/bedrock-data), in the layout of minecraft-data's
Java `blockSelectionShapes.json` (PrismarineJS/minecraft-data#1296, read through PrismarineJS/node-minecraft-data#468).
