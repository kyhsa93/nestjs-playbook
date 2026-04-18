import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { TaskQueue } from '@/task-queue/task-queue'

@Injectable()
export class OrderCleanupScheduler {
  private readonly logger = new Logger(OrderCleanupScheduler.name)

  constructor(private readonly taskQueue: TaskQueue) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  public async enqueueDailyCleanup(): Promise<void> {
    try {
      await this.taskQueue.enqueue('order.cleanup-expired', {}, {
        groupId: 'order.cleanup',
        deduplicationId: `order.cleanup-${new Date().toISOString().slice(0, 10)}`
      })
    } catch (error) {
      this.logger.error({ message: 'enqueue failed', error })
    }
  }
}
