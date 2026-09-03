import { describe, it, expect } from 'vitest'
import { findUnmetModuleDependencies, type InstalledModuleVersion } from './dependencies'

const NEEDS_SHOP = [{ name: 'shop', minVersion: '0.1.377' }]

function row(over: Partial<InstalledModuleVersion> = {}): InstalledModuleVersion {
  return { name: 'shop', version: 'v0.1.377', status: 'active', ...over }
}

describe('findUnmetModuleDependencies', () => {
  it('accepts an active dependency at or above minVersion', () => {
    expect(findUnmetModuleDependencies(NEEDS_SHOP, [row()])).toEqual([])
  })

  it('reports a dependency that is not installed at all as missing', () => {
    expect(findUnmetModuleDependencies(NEEDS_SHOP, [])).toEqual([
      { name: 'shop', minVersion: '0.1.377', reason: 'missing' },
    ])
  })

  it('reports an older active dependency as outdated, not missing', () => {
    expect(findUnmetModuleDependencies(NEEDS_SHOP, [row({ version: 'v0.1.376' })])).toEqual([
      { name: 'shop', minVersion: '0.1.377', reason: 'outdated', installedVersion: 'v0.1.376' },
    ])
  })

  // The bug this file exists for: a dependency mid-update read as MISSING, so
  // "install X and update the rest" refused with "shop must be installed and active
  // first" on a site where shop was installed, active, and already going out at the
  // required version.
  it('counts the pending version of a dependency that is already deploying', () => {
    const deploying = row({ version: 'v0.1.376', status: 'deploying', pendingVersion: 'v0.1.377' })
    expect(findUnmetModuleDependencies(NEEDS_SHOP, [deploying])).toEqual([])
  })

  it('counts a dependency waiting on a manual redeploy', () => {
    const pending = row({ version: 'v0.1.376', status: 'pending_deploy', pendingVersion: 'v0.1.377' })
    expect(findUnmetModuleDependencies(NEEDS_SHOP, [pending])).toEqual([])
  })

  it('counts a dependency that merely has a newer release waiting', () => {
    expect(findUnmetModuleDependencies(NEEDS_SHOP, [row({ status: 'update_available' })])).toEqual([])
  })

  it('still reports a deploying dependency whose pending version is too old', () => {
    const deploying = row({ version: 'v0.1.375', status: 'deploying', pendingVersion: 'v0.1.376' })
    expect(findUnmetModuleDependencies(NEEDS_SHOP, [deploying])).toEqual([
      { name: 'shop', minVersion: '0.1.377', reason: 'outdated', installedVersion: 'v0.1.376' },
    ])
  })

  it('reports a disabled dependency as missing', () => {
    expect(findUnmetModuleDependencies(NEEDS_SHOP, [row({ status: 'inactive' })])).toEqual([
      { name: 'shop', minVersion: '0.1.377', reason: 'missing' },
    ])
  })

  it('reports a failed dependency as missing', () => {
    expect(findUnmetModuleDependencies(NEEDS_SHOP, [row({ status: 'failed' })])).toEqual([
      { name: 'shop', minVersion: '0.1.377', reason: 'missing' },
    ])
  })
})
