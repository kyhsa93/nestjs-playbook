import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { TaskQueueModule } from '@/task-queue/task-queue-module'

@Module({
  imports: [ScheduleModule.forRoot(), TaskQueueModule]
})
export class AppModule {}
