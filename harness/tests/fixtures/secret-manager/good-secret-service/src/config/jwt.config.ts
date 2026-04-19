import { registerAs } from '@nestjs/config'

import { SecretService } from '@/common/application/service/secret-service'

export const jwtConfig = (secretService: SecretService) =>
  registerAs('jwt', async () => {
    const jwt = JSON.parse(await secretService.getSecret('app/jwt')) as { secret: string; expiresIn?: string }
    return {
      secret: jwt.secret,
      expiresIn: jwt.expiresIn ?? '1h'
    }
  })
