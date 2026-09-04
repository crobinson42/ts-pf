import { useInstance, useLocal } from 'mvc-kit/react'
import { useState } from 'react'
import { PlanetDetailViewModel } from './planet-detail-view-model.js'
import { PlanetsViewModel } from './planets-view-model.js'

export function App() {
  const vm = useLocal(PlanetsViewModel, { findId: 1 })
  const formState = useInstance(vm.form)
  const [detailId, setDetailId] = useState<number | null>(null)

  return (
    <main>
      <h1>planet mvc-kit</h1>
      <p>
        Contract-first demo. The web package imports
        <code> @ts-pf/client</code>, <code>@ts-pf/mvc-kit</code>, and
        <code> mvc-kit</code> — never <code>@ts-pf/server</code>. Components
        talk to the ViewModel, not the client or Resource.
      </p>

      <section>
        <h2>list</h2>
        {vm.listLoading ? <p>loading…</p> : null}
        <ul>
          {vm.planets.map((planet) => (
            <li key={planet.id}>
              {planet.id}: {planet.name}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>find</h2>
        <label>
          id{' '}
          <input
            type="number"
            value={vm.state.findId}
            onChange={(event) => {
              vm.setFindId(Number(event.target.value))
            }}
          />
        </label>
        <button type="button" onClick={() => void vm.find()}>
          find
        </button>
        {vm.findLoading ? <p>loading…</p> : null}
        {vm.findErrorCode === 'NOT_FOUND' ? (
          <p className="error">NOT_FOUND</p>
        ) : (
          <pre>{vm.found ? JSON.stringify(vm.found, null, 2) : ''}</pre>
        )}
      </section>

      <section>
        <h2>create</h2>
        <label>
          name{' '}
          <input
            value={formState.name}
            onChange={(event) => {
              vm.form.setName(event.target.value)
            }}
            onBlur={() => {
              vm.form.touch('name')
            }}
          />
        </label>
        {vm.form.visibleErrors.name ? (
          <p className="error">{vm.form.visibleErrors.name}</p>
        ) : null}
        <button type="button" onClick={() => void vm.submit()}>
          create
        </button>
        <p>Empty name hits protocol VALIDATION and maps onto FormModel.</p>
      </section>

      <section>
        <h2>detail (unmount aborts)</h2>
        {detailId === null ? (
          <button type="button" onClick={() => setDetailId(1)}>
            open earth
          </button>
        ) : (
          <>
            <button type="button" onClick={() => setDetailId(null)}>
              close
            </button>
            <PlanetDetail id={detailId} />
          </>
        )}
      </section>
    </main>
  )
}

function PlanetDetail({ id }: { id: number }) {
  const vm = useLocal(PlanetDetailViewModel, { id, planet: null })
  return (
    <div>
      {vm.async.loadPlanet.loading ? <p>loading…</p> : null}
      {vm.async.loadPlanet.errorCode ? (
        <p className="error">{vm.async.loadPlanet.errorCode}</p>
      ) : null}
      {vm.planet ? <pre>{JSON.stringify(vm.planet, null, 2)}</pre> : null}
    </div>
  )
}
