import { asResult } from '@ts-pf/client'
import { client } from './client.js'

const listEl = document.querySelector('#list') as HTMLPreElement
const findId = document.querySelector('#find-id') as HTMLInputElement
const findOut = document.querySelector('#find-out') as HTMLPreElement
const createName = document.querySelector('#create-name') as HTMLInputElement
const createOut = document.querySelector('#create-out') as HTMLPreElement
const describeId = document.querySelector('#describe-id') as HTMLInputElement
const describeOut = document.querySelector('#describe-out') as HTMLPreElement
const tokenInput = document.querySelector('#token') as HTMLInputElement

tokenInput.value = localStorage.getItem('token') ?? 'demo'
tokenInput.addEventListener('change', () => {
  localStorage.setItem('token', tokenInput.value)
})

document.querySelector('#list-btn')?.addEventListener('click', async () => {
  listEl.textContent = JSON.stringify(await client.planet.list(), null, 2)
})

document.querySelector('#find-btn')?.addEventListener('click', async () => {
  const result = await asResult(
    client.planet.find({ id: Number(findId.value) }),
  )
  if (result.ok) {
    findOut.textContent = JSON.stringify(result.data, null, 2)
    return
  }
  if (result.error.code === 'NOT_FOUND') {
    findOut.textContent = `NOT_FOUND id=${result.error.data.id}`
    return
  }
  findOut.textContent = result.error.code
})

document.querySelector('#create-btn')?.addEventListener('click', async () => {
  const result = await asResult(
    client.planet.create({ name: createName.value }),
  )
  createOut.textContent = result.ok
    ? JSON.stringify(result.data, null, 2)
    : result.error.code
})

document.querySelector('#describe-btn')?.addEventListener('click', async () => {
  describeOut.textContent = ''
  const result = await asResult(
    client.planet.describe({ id: Number(describeId.value) }),
  )
  if (!result.ok) {
    describeOut.textContent =
      result.error.code === 'NOT_FOUND'
        ? `NOT_FOUND id=${result.error.data.id}`
        : result.error.code
    return
  }
  for await (const item of result.data) {
    describeOut.textContent += `${item.token} `
  }
})
