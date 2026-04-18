import { Injectable } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { TaskQueue } from '@/task-queue/task-queue'

@Injectable()
export class OrderCleanupScheduler {
  constructor(private readonly taskQueue: TaskQueue) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  public async enqueueDailyCleanup(): Promise<void> {
    await this.taskQueue.enqueue('order.cleanup-expired', {}, {
      groupId: 'order.cleanup',
      deduplicationId: 'order.cleanup-2026-04-18'
    })
  }
}
