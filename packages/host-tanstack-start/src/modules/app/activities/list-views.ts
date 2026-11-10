// List views for the activity code and activity lists: the search keys a
// route keeps, and the sortable, searchable columns. Kept out of the view
// components so a route module can import the keys without UI code.

import type { ListViewConfig } from '@/lib/list-view'
import type { Activity, ActivityCode } from './@types'

export const LIST_SEARCH_KEYS = ['query', 'order', 'desc'] as const

/** The sortable columns are the displayed ones; search matches the code name. */
export const activityCodesListConfig: ListViewConfig<
  ActivityCode,
  'code' | 'created_at' | 'updated_at'
> = {
  columns: {
    code: { kind: 'string', value: (row) => row.code },
    created_at: { kind: 'date', value: (row) => row.created_at },
    updated_at: { kind: 'date', value: (row) => row.updated_at },
  },
  defaultOrder: 'updated_at',
  defaultDesc: true,
  search: (row) => [row.code],
}

/** The displayed URL, name and created columns; search matches URL or name. */
export const activitiesListConfig: ListViewConfig<Activity, 'url' | 'name' | 'created_at'> = {
  columns: {
    url: { kind: 'string', value: (row) => row.url },
    name: { kind: 'string', value: (row) => row.name },
    created_at: { kind: 'date', value: (row) => row.created_at },
  },
  defaultOrder: 'created_at',
  defaultDesc: true,
  search: (row) => [row.url, row.name],
}
