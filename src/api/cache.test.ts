// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getCached, setCached, invalidateCache } from './cache'

describe('SWR client cache', () => {
  beforeEach(() => {

    invalidateCache()
    sessionStorage.clear()
  })
  afterEach(() => {
    invalidateCache()
    sessionStorage.clear()

  })

  it('stores and retrieves cached data', () => {
    expect(getCached('test-key')).toBeNull()
    setCached('test-key', { foo: 'bar' })
    expect(getCached<{ foo: string }>('test-key')).toEqual({ foo: 'bar' })
  })

  it('respects expiration time', () => {
    setCached('expired-key', { val: 1 })
    expect(getCached('expired-key', -1)).toBeNull()
  })

  it('invalidates by prefix or entirely', () => {
    setCached('dashboard:org1', { d: 1 })
    setCached('dashboard:org2', { d: 2 })
    setCached('inventory:org1', { i: 1 })

    invalidateCache('dashboard:')
    expect(getCached('dashboard:org1')).toBeNull()
    expect(getCached('dashboard:org2')).toBeNull()
    expect(getCached('inventory:org1')).toEqual({ i: 1 })

    invalidateCache()
    expect(getCached('inventory:org1')).toBeNull()
  })
})
