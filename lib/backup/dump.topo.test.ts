import { describe, it, expect } from 'vitest'
import { topoSortTables } from '@/lib/backup/dump'
import { UnrestorableBackupError } from '@/lib/backup/serialize'

// Only the table/refTable pair matters for ordering; the column names are along
// for the ride, so keep them out of the way of what each case is asserting.
const fk = (table: string, refTable: string) => ({ table, refTable, column: 'ref_id', refColumn: 'id' })

// The ordering rules that decide whether a backup can actually be restored.
// These are cheap to assert and they fail on the PR that breaks them, which is
// the only moment anyone is in a position to notice.
describe('topoSortTables', () => {
  it('puts a referenced table before the table that references it', () => {
    const order = topoSortTables(
      ['Child', 'Parent'],
      [fk('Child', 'Parent')]
    )
    expect(order.indexOf('Parent')).toBeLessThan(order.indexOf('Child'))
  })

  it('ignores a self-reference rather than deadlocking on it', () => {
    // Folder.parentId -> Folder.id is real in this schema. It must not count as a
    // dependency at table level, or the table can never reach in-degree zero and
    // would be reported as a cycle. Row-level ordering handles it instead.
    const order = topoSortTables(['Folder'], [fk('Folder', 'Folder')])
    expect(order).toEqual(['Folder'])
  })

  it('refuses to emit an order for a genuine two-table cycle', () => {
    // No table order satisfies A -> B -> A with non-deferrable FKs. Appending the
    // stranded tables would hand the owner a file that only fails at restore, so
    // the dump must abort instead.
    expect(() =>
      topoSortTables(
        ['A', 'B'],
        [
          fk('A', 'B'),
          fk('B', 'A'),
        ]
      )
    ).toThrow(UnrestorableBackupError)
  })

  it('names the tables involved so the cycle can be found', () => {
    let message = ''
    try {
      topoSortTables(
        ['A', 'B', 'Independent'],
        [
          fk('A', 'B'),
          fk('B', 'A'),
        ]
      )
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toContain('A')
    expect(message).toContain('B')
  })
})
