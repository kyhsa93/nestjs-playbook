import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { OrderCommandService } from './application/command/order-command-service'
import { OrderQuery } from './application/query/order-query'
import { OrderQueryService } from './application/query/order-query-service'
import { OrderRepository } from './domain/order-repository'
import { OrderEntity } from './infrastructure/entity/order.entity'
import { OrderQueryImpl } from './infrastructure/order-query-impl'
import { OrderRepositoryImpl } from './infrastructure/order-repository-impl'
import { OrderController } from './interface/order-controller'

@Module({
  imports: [TypeOrmModule.forFeature([OrderEntity])],
  controllers: [OrderController],
  providers: [
    OrderCommandService,
    OrderQueryService,
    { provide: OrderQuery, useClass: OrderQueryImpl },
    { provide: OrderRepository, useClass: OrderRepositoryImpl }
  ]
})
export class OrderModule {}
