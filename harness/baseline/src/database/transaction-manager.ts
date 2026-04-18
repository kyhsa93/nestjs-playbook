import { AsyncLocalStorage } from 'node:async_hooks'

import { Injectable } from '@nestjs/common'
import { DataSource, EntityManager } from 'typeorm'

/**
 * Transaction 컨텍스트를 AsyncLocalStorage에 보관하는 매니저.
 * - run(): 콜백 범위 동안 트랜잭션 EntityManager를 컨텍스트에 저장
 * - getManager(): 현재 트랜잭션이 있으면 그것을, 아니면 기본 EntityManager 반환
 *
 * 이 패턴으로 Repository 구현체·TaskQueueOutbox 등이 TransactionManager만 주입받고
 * 동일한 트랜잭션에 자연스럽게 참여할 수 있다.
 */
@Injectable()
export class TransactionManager {
  private readonly storage = new AsyncLocalStorage<EntityManager>()

  constructor(private readonly dataSource: DataSource) {}

  public getManager(): EntityManager {
    return this.storage.getStore() ?? this.dataSource.manager
  }

  public async run<T>(fn: () => Promise<T>): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      return this.storage.run(manager, fn)
    })
  }
}
