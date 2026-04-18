import { Column, Entity, PrimaryColumn } from 'typeorm'

import { BaseEntity } from '@/database/base.entity'

@Entity('orders')
export class OrderEntity extends BaseEntity {
  @PrimaryColumn()
  orderId: string

  @Column()
  userId: string

  @Column()
  status: string
}
