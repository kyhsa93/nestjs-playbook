import { Injectable } from '@nestjs/common'
import { OrderCommandService } from '../application/command/order-command-service'
import { TaskConsumer } from '@/task-queue/task-consumer.decorator'

@Injectable()
export class OrderTaskController {
  constructor(private readonly orderCommandService: OrderCommandService) {}

  @TaskConsumer('order.archive')
  public async archiveA(payload: { orderId: string }): Promise<void> {
    await this.orderCommandService.archiveOrder(payload)
  }

  @TaskConsumer('order.archive')
  public async archiveB(payload: { orderId: string }): Promise<void> {
    await this.orderCommandService.archiveOrder(payload)
  }
}
