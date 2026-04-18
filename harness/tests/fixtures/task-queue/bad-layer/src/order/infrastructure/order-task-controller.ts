import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { TaskConsumer } from '@/task-queue/task-consumer.decorator'

@Injectable()
export class OrderTaskController {
  constructor(private readonly dataSource: DataSource) {}

  @TaskConsumer('order.archive')
  public async archive(payload: { orderId: string }): Promise<void> {
    await this.dataSource.query('UPDATE orders SET archived = true WHERE id = $1', [payload.orderId])
  }
}
