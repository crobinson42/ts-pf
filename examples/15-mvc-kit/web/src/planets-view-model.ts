import { asResult } from '@ts-pf/client'
import type { ValidationIssue } from '@ts-pf/contract'
import { issuesToFieldErrors } from '@ts-pf/mvc-kit'
import { singleton, ViewModel } from 'mvc-kit'
import { PlanetForm } from './planet-form.js'
import { PlanetsResource } from './planets-resource.js'

function isValidationData(
  data: unknown,
): data is { issues: ValidationIssue[] } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'issues' in data &&
    Array.isArray((data as { issues: unknown }).issues)
  )
}

export class PlanetsViewModel extends ViewModel<{ findId: number }> {
  private _planets = singleton(PlanetsResource)
  readonly form = this.own(new PlanetForm({ name: '' }))

  get planets() {
    return this._planets.items
  }

  get listLoading() {
    return this._planets.async.loadAll.loading
  }

  get findLoading() {
    return this._planets.async.loadById.loading
  }

  get findErrorCode() {
    return this._planets.async.loadById.errorCode
  }

  get found() {
    return this._planets.get(this.state.findId)
  }

  setFindId(findId: number) {
    this.set({ findId })
  }

  async find() {
    await this._planets.loadById(this.state.findId)
  }

  async submit() {
    this.form.attemptSubmit()
    const result = await asResult(this._planets.create(this.form.state))
    if (
      !result.ok &&
      result.error.code === 'VALIDATION' &&
      isValidationData(result.error.data)
    ) {
      this.form.setErrors(issuesToFieldErrors(result.error.data.issues))
      return
    }
    if (result.ok) {
      this.form.reset({ name: '' })
    }
  }
}
