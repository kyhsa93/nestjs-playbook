import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { GetOrdersQuery } from '@/order/application/query/get-orders-query'
import { GetOrdersResult } from '@/order/application/query/get-orders-result'
import { OrderQuery } from '@/order/application/query/order-query'
import { OrderEntity } from '@/order/infrastructure/entity/order.entity'

@Injectable()
export class OrderQueryImpl extends OrderQuery {
  constructor(@InjectRepository(OrderEntity) private readonly orderRepo: Repository<OrderEntity>) {
    super()
  }

  public async getOrders(query: GetOrdersQuery): Promise<GetOrdersResult> {
    const [rows, count] = await this.orderRepo.createQueryBuilder('o')
      .take(query.take).skip(query.page * query.take).getManyAndCount()
    return {
      orders: rows.map((r) => ({ orderId: r.orderId, userId: r.userId, status: r.status })),
      totalCount: count
    }
  }
}
