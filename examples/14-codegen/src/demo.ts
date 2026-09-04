import { emit } from '@ts-pf/codegen'
import { catalog } from '@ts-pf/docs'
import { contract } from './contract.js'

process.stdout.write(emit(catalog(contract, { prefix: '/rpc' })))
