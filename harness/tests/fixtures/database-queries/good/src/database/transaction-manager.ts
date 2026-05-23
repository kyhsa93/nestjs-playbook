import { AsyncLocalStorage } from 'async_hooks'
import { EntityManager } from 'typeorm'

export class TransactionManager {
  private readonly storage = new AsyncLocalStorage<EntityManager>()

  async run<T>(fn: () => Promise<T>): Promise<T> {
    return fn()
  }

  getManager(): EntityManager {
    return this.storage.getStore()!
  }
}
