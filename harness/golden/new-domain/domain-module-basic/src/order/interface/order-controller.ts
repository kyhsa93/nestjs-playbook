import {
  BadRequestException, Body, Controller, Get, Logger, NotFoundException, Post, Query
} from '@nestjs/common'
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'

import { CancelOrderCommand } from '@/order/application/command/cancel-order-command'
import { CreateOrderCommand } from '@/order/application/command/create-order-command'
import { OrderCommandService } from '@/order/application/command/order-command-service'
import { OrderQueryService } from '@/order/application/query/order-query-service'
import { CancelOrderRequestBody } from '@/order/interface/dto/cancel-order-request-body'
import { CreateOrderRequestBody } from '@/order/interface/dto/create-order-request-body'
import { GetOrdersRequestQuerystring } from '@/order/interface/dto/get-orders-request-querystring'
import { GetOrdersResponseBody } from '@/order/interface/dto/get-orders-response-body'
import { OrderErrorMessage } from '@/order/order-error-message'

@Controller()
@ApiTags('Order')
export class OrderController {
  private readonly logger = new Logger(OrderController.name)

  constructor(
    private readonly orderCommandService: OrderCommandService,
    private readonly orderQueryService: OrderQueryService
  ) {}

  @Get('/orders')
  @ApiOperation({ operationId: 'getOrders' })
  @ApiOkResponse({ type: GetOrdersResponseBody })
  public async getOrders(@Query() querystring: GetOrdersRequestQuerystring): Promise<GetOrdersResponseBody> {
    return this.orderQueryService.getOrders(querystring).catch((error) => {
      this.logger.error(error)
      throw new BadRequestException(error.message)
    })
  }

  @Post('/orders')
  @ApiOperation({ operationId: 'createOrder' })
  @ApiCreatedResponse()
  public async createOrder(@Body() body: CreateOrderRequestBody): Promise<void> {
    return this.orderCommandService.createOrder(new CreateOrderCommand(body)).catch((error) => {
      this.logger.error(error)
      throw new BadRequestException(error.message)
    })
  }

  @Post('/orders/:orderId/cancel')
  @ApiOperation({ operationId: 'cancelOrder' })
  public async cancelOrder(@Body() body: CancelOrderRequestBody): Promise<void> {
    return this.orderCommandService.cancelOrder(new CancelOrderCommand(body)).catch((error) => {
      this.logger.error(error)
      if (error.message === OrderErrorMessage['주문을 찾을 수 없습니다.']) throw new NotFoundException(error.message)
      throw new BadRequestException(error.message)
    })
  }
}
