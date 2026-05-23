import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity('orders')
export class OrderEntity {
  @PrimaryGeneratedColumn()
  id: number

  @Column()
  userId: string
}
