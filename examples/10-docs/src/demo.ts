import { catalog } from '@ts-pf/docs'
import { contract } from './contract.js'
import { toMarkdown } from './markdown.js'

const spec = catalog(contract, { prefix: '/rpc' })
console.log(JSON.stringify(spec, null, 2))
console.log('\n---\n')
console.log(toMarkdown(spec))
