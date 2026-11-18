import type { Embed } from '../src/index.js'
import { tokenize } from '../src/search.js'

/** Synonyms share an axis, so meaning matches without shared words. Unknown words add nothing. */
const AXES: Record<string, number> = {
  delete: 0,
  remove: 0,
  erase: 0,
  destroy: 0,
  user: 1,
  account: 1,
  person: 1,
  find: 2,
  lookup: 2,
  locate: 2,
  team: 3,
  group: 3,
}

/** A deterministic stand-in for a real embedding model. */
export const toyEmbed: Embed = (texts) =>
  texts.map((text) => {
    const vector = [0, 0, 0, 0]
    for (const token of tokenize(text)) {
      const axis = AXES[token]
      if (axis !== undefined) vector[axis] = (vector[axis] ?? 0) + 1
    }
    return vector
  })
