import { DataSource, DataSourceOptions } from 'typeorm'

export function buildDataSourceOptions(): DataSourceOptions {
  return {
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'app',
    autoLoadEntities: true,
    synchronize: process.env.NODE_ENV !== 'production'
  } as DataSourceOptions
}

// CLI/migration용 default export
export const dataSource = new DataSource(buildDataSourceOptions())
