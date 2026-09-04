import { FormModel } from 'mvc-kit/forms'

export class PlanetForm extends FormModel<{ name: string }> {
  setName(name: string) {
    this.set({ name })
  }
}
