import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import * as request from 'supertest'
import { PaymentService } from '../src/payment/payment-service'

jest.mock('../src/payment/payment-service')

describe('OrderController (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [] }).compile()
    app = module.createNestApplication()
    await app.init()
  })

  afterAll(() => app.close())

  it('POST /orders — 결제 mock 후 주문 생성', () => {
    return request(app.getHttpServer()).post('/orders').send({}).expect(201)
  })
})
