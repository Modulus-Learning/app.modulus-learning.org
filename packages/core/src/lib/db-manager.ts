import { AsyncLocalStorage } from 'node:async_hooks'

import type { DB } from '@/database/index.js'

const transactionALS = new AsyncLocalStorage<DB>()

export interface DBManager {
  get(): DB
}

export class DBManagerImpl {
  private dbPool: DB

  constructor(deps: { dbPool: DB }) {
    this.dbPool = deps.dbPool
  }

  get(): DB {
    return transactionALS.getStore() ?? this.dbPool
  }
}

export interface TXManager {
  withTransaction<T>(fn: () => Promise<T>): Promise<T>
}

export class TXManagerImpl {
  private db: DBManager

  constructor(deps: { db: DBManager }) {
    this.db = deps.db
  }

  // TODO: This blindly allows nested transactions. If that's problematic, we
  // should update this check if als.getStore() is null, and otherwise throw
  // an error.
  withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.db.get().transaction((tx) => transactionALS.run(tx, fn))
  }
}
