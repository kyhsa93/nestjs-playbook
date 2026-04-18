import { Injectable } from '@nestjs/common'
import { OrderCommandService } from '../application/command/order-command-service'
import { TaskConsumer } from '@/task-queue/task-consumer.decorator'

@Injectable()
export class OrderTaskController {
  constructor(private readonly orderCommandService: OrderCommandService) {}

  @TaskConsumer('order.archive', {
    idempotencyKey: (payload: { orderId: string }) => `order.archive-${payload.orderId}`
  })
  public async archive(payload: { orderId: string }): Promise<void> {
    await this.orderCommandService.archiveOrder(payload)
  }
}
