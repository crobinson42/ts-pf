import type { InferContractInputs, InferContractOutputs } from '@ts-pf/contract'
import type { contract } from '@ts-pf/example-mvc-kit-contract'
import { bindClient } from '@ts-pf/mvc-kit'
import { type DedupeConfig, isAbortError, Resource } from 'mvc-kit'
import { client } from './client.js'

export type Planet = InferContractOutputs<typeof contract>['planet']['find']

export class PlanetsResource extends Resource<Planet> {
  static DEDUPE: DedupeConfig<PlanetsResource> = {
    loadAll: true,
    loadById: (id) => id,
  }

  private rpc = bindClient(client, this)

  protected onInit() {
    if (this.length === 0) this.loadAll()
  }

  async loadAll() {
    this.reset(await this.rpc.planet.list())
  }

  async loadById(id: number) {
    this.upsert(await this.rpc.planet.find({ id }))
  }

  async create(
    input: InferContractInputs<typeof contract>['planet']['create'],
  ) {
    const temp = { id: -Date.now(), name: input.name }
    const rollback = this.optimistic(() => {
      this.add(temp)
    })
    try {
      const row = await this.rpc.planet.create(input)
      rollback()
      this.add(row)
      return row
    } catch (error) {
      if (!isAbortError(error)) rollback()
      throw error
    }
  }
}
