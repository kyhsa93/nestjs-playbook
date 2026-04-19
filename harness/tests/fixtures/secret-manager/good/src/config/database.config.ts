import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { registerAs } from '@nestjs/config'

export const databaseConfig = registerAs('database', async () => {
  if (process.env.NODE_ENV === 'development') {
    return {
      host: process.env.DATABASE_HOST,
      port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
      username: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      name: process.env.DATABASE_NAME
    }
  }

  const client = new SecretsManagerClient({})
  const result = await client.send(new GetSecretValueCommand({ SecretId: 'app/database' }))
  const secret = JSON.parse(result.SecretString ?? '{}') as Record<string, string>
  return {
    host: secret.host,
    port: parseInt(secret.port ?? '5432', 10),
    username: secret.username,
    password: secret.password,
    name: secret.name
  }
})
