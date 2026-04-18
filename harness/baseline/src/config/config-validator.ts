import { plainToInstance } from 'class-transformer'
import { IsInt, IsOptional, IsString, Min, validateSync } from 'class-validator'

export class EnvironmentVariables {
  @IsOptional() @IsString()
  NODE_ENV?: string

  @IsOptional() @IsInt() @Min(1)
  PORT?: number

  @IsString()
  DB_HOST: string

  @IsInt() @Min(1)
  DB_PORT: number

  @IsString()
  DB_USERNAME: string

  @IsString()
  DB_PASSWORD: string

  @IsString()
  DB_NAME: string
}

export function validateConfig(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: true })
  const errors = validateSync(validated, { skipMissingProperties: false })
  if (errors.length > 0) {
    // eslint-disable-next-line no-console
    console.error('환경 변수 검증 실패:', errors)
    process.exit(1)
  }
  return validated
}
