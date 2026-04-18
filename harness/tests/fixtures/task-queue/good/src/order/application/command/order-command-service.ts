export class OrderCommandService {
  async archiveOrder(_payload: { orderId: string }): Promise<void> {}
  async cleanupExpiredOrders(): Promise<number> { return 0 }
}
