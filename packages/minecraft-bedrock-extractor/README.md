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
  `blockSelectionShapes.json`; for 0.14 - 1.0, which minecraft-data has no shapes of, those of the same Bedrock state
  in the oldest version it has them of, 1.16.201) laid out as the client's tessellator draws that block
  (`data/block_render.json`);
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
supplemented by the nearest client where there is one. Below them all lie the nearest client newer than the version
and the newest client, which only fill what the version's own packs lack: a server's blocks its client has no
textures of yet (1.18.30's mud and mangrove, 1.17.30's sculk, behind experiments until 1.19.0). The public sources are
blobless clones; only the files a version reads are checked out.

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
| `items/*.png` | Item icons: the item's definition, its `item_texture.json` entry, the icons the client names in code; a spawn egg in its mob's colours and a block item's carried texture in its fixed colours, baked. A legacy item (0.14 - 1.0), which minecraft-data names by its display name (`leather_cap`), takes the icon of the item of that display name (`leather_helmet`); a photo, which has no icon of its own, the camera's. |
| `texture_content.json` | `[{ name, texture }]`: each item's icon as a data URL. |
| `entities.json` | `{ name: { identifier, geometry: { layer: geometry }, textures: { layer: path } } }`: each entity's model, in the format of prismarine-viewer's own entity models (the client entity description, its geometry resolved). |
| `attachables.json` | `{ item: { slot, geometry, texture } }`: the armor an entity wears. |
| `particles.json` | `{ identifier: { texture, material, components } }`: the particle effects. |
| `entity/`, `models/armor/`, `particle/`... | The textures those name, as PNG at their path below `textures/`. |
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
  states; panes and bars: a sheet to each connected side, across both axes when unconnected;
- chests, beds, heads, signs, hanging signs, banners, decorated pots and copper golem statues, which the client draws
  with block entity renderers: beds with the packs' `geometry.bed` laid flat across their two halves, heads with the
  geometry and texture the `minecraft:skull` client entity gives their type, statues with `geometry.copper_golem`,
  the others as their renderers lay them out (the classic chest's base, lid and latch; the sign's board at 2/3, on its
  stick or against its wall; the hanging sign's board on its chains, under its plank on a wall; the banner's flag and
  crossbar at 2/3, on its pole or hanging from a wall; the pot's body, neck and rim), all on their entity texture
  sheets (copied into `blocks/` as `entity__chest__normal`, `entity__bed__red`...);
- water and lava: the still texture, which prismarine-viewer draws as a liquid.

A colour the client gives a block whatever the biome (a lily pad, a birch or spruce leaves block of before the
flattening, a stem by its growth, redstone dust by its power) is baked into a tinted copy of the texture, since
prismarine-viewer picks a tint by block name; grass and foliage keep `tintindex` and take the biome's colour.

### How entities are drawn

An entity is what its client entity description's render controllers draw (`entity/*.json`, every pack's copy merged
as the client merges them; `render_controllers/`), in the state of a living adult at full health of its first
variant: every query 0 but `query.is_alive` and `query.health`, its own `initialize` and `pre_animation` scripts run
(Molang, `lib/molang.js`). A controller whose condition fails is not drawn, nor the bones its `part_visibility` hides
(a horse's saddle, a charged creeper's armor, a wither's shield). A controller's textures are laid over each other into
one (a villager's biome and profession). Its geometry is resolved from `models/` with the geometry it inherits from
(`geometry.zombie:geometry.humanoid`: bones merged by name, `inflate`, `reset`, `neverRender`), in its resting pose:
what the animations its scripts and its animation controllers' initial states run do to its bones at their start, in
that state, `this` a bone's own rotation (a spider's legs spread, a horse's neck raised, a donkey's chests scaled away;
`lib/entities/pose.js`). Of two files describing one entity, the one of the highest `min_engine_version` is read, as
the client reads it. `player` is drawn with
`geometry.humanoid.custom` and steve, `player_slim` with `geometry.humanoid.customSlim` and alex, both with the cape's
geometry.

Armor is the version's attachable of the item (`attachables/`), else what the client draws in code: the slot's
`geometry.humanoid.armor.<slot>` (or the slot's bones of `geometry.humanoid.armor1` / `armor2`) on the material's
`textures/models/armor/<material>_<layer>`; undyed leather is the pack's brown `cloth` texture.

Particle effects are the version's `particles/*.json`. 1.26.51's client ships them compiled (binary `MCB` files): they
are read from Mojang's published pack of the version (bedrock-samples), which has them as JSON.

0.14 - 1.0 have no client entity descriptions, render controllers or particle effects (the client draws its mobs and
particles in code): an entity is drawn with the geometry and textures the reference version's description names, from
the version's own packs (`models/mobs.json`, `textures/mob/`); 0.14, which has no geometry data, takes the nearest
newer client's. An entity none of whose textures the version has is not written.

### Shapes the neighbours decide

From 1.26.50 the states of fences, panes and bars say their connections (`minecraft:connection_north`...) and those
of stairs their corner (`minecraft:corner`). Before, the client works them out from the neighbours. Their blockstates
are keyed by those states in every version: a fence of an older version is written with each of its connections
(each a part of a multipart), a stair with each corner (the boxes the newest version's states of that corner have),
and prismarine-viewer works them out from the neighbours where a block's state lacks them. Walls say their connections
in every version.

No version's states say a redstone dust's connections: its blockstate is keyed by `minecraft:connection_<side>`
(`none`, `side`, `up`) in every version, a multipart of the parts the client draws: unconnected, the whole cross;
connected along one axis, the line across the block; else the cross's middle and an arm to each connected side; a
line up the face of each block it climbs.

### Block entity data

What a block entity holds is not in the state. A blockstate keyed by `block_entity.<tag>` is matched against the tags
of the block's block entity, which prismarine-viewer gives a block as properties of those names:

| Blocks | Keyed by | Drawn |
|---|---|---|
| beds | `block_entity.color` | the bed sheet of that colour (`textures/entity/bed/<colour>`) |
| heads on the floor | `block_entity.Rotation` | turned in the 16 steps of 22.5 degrees, either way round |
| the `skull` block (before 1.21.40) | `block_entity.SkullType` | the head of that type |

The block entity's default comes first (a red bed, a skeleton skull facing south), the variant a block without a
block entity takes, and after them the variants keyed by the state alone, which a value of no step takes.

### What is not drawn

- A sign's text, a banner's colour and patterns (its flag draws the sheet's white: Bedrock's dye colours are in the
  client's code, in no pack), a decorated pot's sherds, a statue's pose, a double chest's other half: block entity
  data the client draws in code.
- Education Edition's chalkboards: a board over up to 3 x 2 blocks that its block entity lays out from one of them.
- Entities the client draws in code, with no geometry in any pack: boats, the block entity actors (`decorated_pot`,
  `trial_spawner`), wind charges, evocation fangs. Entity animation (the viewer animates walking limbs itself), a
  mob's variants other than its first, dyed leather, and particle effects' events (an effect another spawns).
- `mysterious_frame` and `mysterious_frame_slot` (1.17.40 - 1.18.11): server blocks behind an experiment that no
  client of those versions has textures or a `blocks.json` entry of; they draw as the missing tile, as the client
  draws them.

prismarine-viewer draws a Bedrock block's second layer (the water seagrass, kelp or a waterlogged stair stand in) as
the liquid it is.

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
