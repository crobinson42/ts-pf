import { createLocalClient } from '@ts-pf/server'
import { isEntrypoint } from 'ts-pf-example-shared/listen'
import { app } from './app.js'
import { createDb } from './db.js'

export async function runLocal() {
  const db = createDb()
  const authed = createLocalClient(app, {
    context: { db, user: { id: 1 } },
  })
  console.log('local list', await authed.planet.list())
  console.log('local create', await authed.planet.create({ name: 'Venus' }))

  const anon = createLocalClient(app, { context: { db } })
  try {
    await anon.planet.create({ name: 'Nope' })
  } catch (error) {
    console.log(
      'local create without user',
      error instanceof Error ? error.message : error,
    )
  }
}

if (isEntrypoint(import.meta.url)) {
  await runLocal()
}
