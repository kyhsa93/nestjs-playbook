import { Column, Entity, PrimaryColumn } from 'typeorm'

@Entity('orders')
export class OrderEntity {
  @PrimaryColumn({ type: 'char', length: 32 })
  id: string

  @Column()
  userId: string
}
