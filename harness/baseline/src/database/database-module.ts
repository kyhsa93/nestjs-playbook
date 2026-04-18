import { Global, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { buildDataSourceOptions } from './data-source'
import { TransactionManager } from './transaction-manager'

@Global()
@Module({
  imports: [TypeOrmModule.forRootAsync({ useFactory: () => buildDataSourceOptions() })],
  providers: [TransactionManager],
  exports: [TransactionManager, TypeOrmModule]
})
export class DatabaseModule {}
