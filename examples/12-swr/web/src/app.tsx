import { useState } from 'react'
import useSWR, { mutate } from 'swr'
import useSWRMutation from 'swr/mutation'
import { swr } from './client.js'

export function App() {
  const [findId, setFindId] = useState(1)
  const [createName, setCreateName] = useState('Venus')

  const list = useSWR(swr.planet.list.key(), swr.planet.list.fetcher())
  const find = useSWR(
    swr.planet.find.key({ input: { id: findId } }),
    swr.planet.find.fetcher(),
  )
  const create = useSWRMutation(
    swr.planet.list.key(),
    swr.planet.create.mutator(),
  )

  return (
    <main>
      <h1>planet swr</h1>
      <p>
        Contract-first demo. The web package imports
        <code> @ts-pf/client</code>, <code>@ts-pf/swr</code>, and the shared
        contract — never <code>@ts-pf/server</code>.
      </p>

      <section>
        <button
          type="button"
          onClick={() => {
            void mutate(swr.planet.matcher())
          }}
        >
          revalidate planet.*
        </button>
        <pre>
          {list.error ? String(list.error) : JSON.stringify(list.data, null, 2)}
        </pre>
      </section>

      <section>
        <label>
          find id{' '}
          <input
            type="number"
            value={findId}
            onChange={(event) => {
              setFindId(Number(event.target.value))
            }}
          />
        </label>
        <pre>
          {find.error ? String(find.error) : JSON.stringify(find.data, null, 2)}
        </pre>
      </section>

      <section>
        <label>
          create name{' '}
          <input
            value={createName}
            onChange={(event) => {
              setCreateName(event.target.value)
            }}
          />
        </label>
        <button
          type="button"
          disabled={create.isMutating}
          onClick={() => {
            void create.trigger({ name: createName })
          }}
        >
          create
        </button>
      </section>
    </main>
  )
}
