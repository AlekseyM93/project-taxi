import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { UserEntity } from './modules/users/user.entity';
import { DriverProfileEntity } from './modules/drivers/driver-profile.entity';
import { VehicleEntity } from './modules/drivers/vehicle.entity';
import { OrderEntity } from './modules/orders/order.entity';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5433),
  username: process.env.DB_USER || 'taxi',
  password: process.env.DB_PASSWORD || 'taxi',
  database: process.env.DB_NAME || 'taxi',
  ssl:
    process.env.DB_SSL === 'true'
      ? {
          rejectUnauthorized:
            process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
        }
      : false,
  synchronize: process.env.DB_SYNC === 'true',
  logging: false,
  entities: [UserEntity, DriverProfileEntity, VehicleEntity, OrderEntity],
  migrations: ['src/migrations/*.ts'],
});
