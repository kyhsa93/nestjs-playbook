import { Controller, NotFoundException, Param, Post } from '@nestjs/common'
import { generateErrorResponse } from '@/common/generate-error-response'
import { OrderErrorMessage as ErrorMessage } from '@/order/order-error-message'

@Controller('orders')
export class OrderController {
  @Post(':orderId/cancel')
  public async cancel(@Param('orderId') orderId: string): Promise<void> {
    return Promise.resolve(orderId).then(() => undefined).catch((error: Error) => {
      throw generateErrorResponse(error.message, [
        [ErrorMessage['주문을 찾을 수 없습니다.'], NotFoundException]
      ])
    })
  }
}
