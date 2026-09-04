import { catalog } from '@ts-pf/docs'
import { openapi } from '@ts-pf/openapi'
import { contract } from './contract.js'

const spec = openapi(catalog(contract, { prefix: '/rpc' }), {
  info: { title: 'Planet API', version: '1.0.0' },
  servers: [{ url: 'https://api.example.com' }],
})

console.log(JSON.stringify(spec, null, 2))
