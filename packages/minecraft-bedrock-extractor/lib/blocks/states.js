// Bedrock block states as the output keys them: a state is its block's name and its properties as strings, in the
// names and values minecraft-data's blockStates give them (a byte 0/1, an int, a string).

// the sorted 'k=v' pairs of a state's properties
const stateKey = props => Object.keys(props).sort().map(k => `${k}=${props[k]}`).join(',')

// minecraft-data's typed states -> { name: 'value' }
const propsOf = state => Object.fromEntries(Object.entries(state.states ?? {}).map(([k, v]) => [k, String(v.value)]))

// FNV-1a 32 over the little-endian NBT of { name, states }: the network hash of a state (prismarine-block's getHash)
function stateHash (name, states) {
  const parts = []
  const u8 = v => Buffer.from([v])
  const str = s => {
    const b = Buffer.from(s, 'utf8')
    const len = Buffer.alloc(2)
    len.writeUInt16LE(b.length)
    return Buffer.concat([len, b])
  }
  parts.push(u8(10), str('')) // the root compound
  parts.push(u8(8), str('name'), str(name.includes(':') ? name : 'minecraft:' + name))
  parts.push(u8(10), str('states'))
  for (const key of Object.keys(states).sort()) {
    const { type, value } = states[key]
    if (type === 'byte') parts.push(u8(1), str(key), u8(value & 0xff))
    else if (type === 'int') {
      const b = Buffer.alloc(4)
      b.writeInt32LE(value)
      parts.push(u8(3), str(key), b)
    } else if (type === 'string') parts.push(u8(8), str(key), str(value))
    else throw new Error(`state ${key} of ${name}: unsupported tag type ${type}`)
  }
  parts.push(u8(0), u8(0))
  const buf = Buffer.concat(parts)
  let h = 0x811c9dc5
  for (let i = 0; i < buf.length; i++) {
    h ^= buf[i]
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// The smallest set of properties that tells the groups of a block's states apart: `states` are [{ props, group }]
// where equal groups may share a variant. Returns the property names, [] when one group covers every state. Among
// sets of one size the first in property order wins, so the result is stable.
function distinguishingProps (states) {
  const names = [...new Set(states.flatMap(s => Object.keys(s.props)))].sort()
  const distinct = new Set(states.map(s => s.group))
  if (distinct.size <= 1) return []
  const tells = subset => {
    const seen = new Map()
    for (const s of states) {
      const key = subset.map(p => s.props[p]).join('\u0000')
      const was = seen.get(key)
      if (was !== undefined && was !== s.group) return false
      seen.set(key, s.group)
    }
    return true
  }
  for (let size = 1; size <= names.length; size++) {
    for (const subset of combinations(names, size)) if (tells(subset)) return subset
  }
  return names
}

function * combinations (list, size, start = 0, acc = []) {
  if (acc.length === size) { yield acc; return }
  for (let i = start; i <= list.length - (size - acc.length); i++) yield * combinations(list, size, i + 1, [...acc, list[i]])
}

// the variant key of a state over a subset of its properties
const keyOf = (props, subset) => subset.map(p => `${p}=${props[p]}`).join(',')

module.exports = { stateKey, propsOf, stateHash, distinguishingProps, keyOf }
