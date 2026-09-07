import { catalog } from '@ts-pf/docs'
import { contract } from './contract.js'

export const spec = catalog(contract, { prefix: '/rpc' })
