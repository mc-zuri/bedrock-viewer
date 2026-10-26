// The legacy data value of a block state: the value the client indexes texture variants with.
//
// The client packs a state's properties into bits, each property in as many bits as its values need, in the order the
// game declares them: stone_button is button_pressed_bit << 3 | facing_direction (pressed, facing 0 = 8), but a candle
// is lit << 2 | candles. The palette lists properties alphabetically, so the order has to be learnt from the client
// exports (kept in data/data_layouts.json). A block's layout is used in every version;
// blocks no export has fall back to the state's index among its block's states (the same number whenever each property
// has a power of two of values).
const { stateKey } = require('./states')

// a state's data value from a layout: each property in as many bits as its values need, in the layout's order
function pack (order, props, values) {
  let data = 0
  for (const k of order) {
    const list = values[k]
    data = data * 2 ** Math.ceil(Math.log2(list.length)) + list.indexOf(props[k])
  }
  return data
}

// states: [{ name, props }] in palette order -> the data value of each
function legacyData (states, layouts = new Map()) {
  const permutation = new Map()
  return states.map(({ name, props }) => {
    const index = permutation.get(name) ?? 0
    permutation.set(name, index + 1)
    const layout = layouts.get(name)
    const exact = layout?.exact?.get(stateKey(props))
    if (exact !== undefined) return exact
    const keys = Object.keys(props)
    if (layout?.order && keys.length === layout.order.length && keys.every(k => layout.values[k]?.includes(props[k]))) {
      return pack(layout.order, props, layout.values)
    }
    return index
  })
}

module.exports = { legacyData }
