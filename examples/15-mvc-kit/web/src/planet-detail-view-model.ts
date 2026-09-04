import type { InferContractOutputs } from '@ts-pf/contract'
import type { contract } from '@ts-pf/example-mvc-kit-contract'
import { bindClient } from '@ts-pf/mvc-kit'
import { ViewModel } from 'mvc-kit'
import { client } from './client.js'

type Planet = InferContractOutputs<typeof contract>['planet']['find']

export class PlanetDetailViewModel extends ViewModel<{
  id: number
  planet: Planet | null
}> {
  private rpc = bindClient(client, this)

  get planet() {
    return this.state.planet
  }

  protected onInit() {
    this.loadPlanet()
  }

  async loadPlanet() {
    const planet = await this.rpc.planet.find({ id: this.state.id })
    this.set({ planet })
  }
}
