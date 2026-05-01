import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity, UserRole } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity) private readonly repo: Repository<UserEntity>,
  ) {}

  /**
   * Совпадает с логикой `scripts/create-test-users.js`: пользователь находится по цифрам номера,
   * формат ввода (+7, скобки, пробелы) не важен.
   */
  findByPhone(phone: string) {
    const digits = phone.replace(/\D/g, '');
    if (!digits) {
      return Promise.resolve(null);
    }
    return this.repo
      .createQueryBuilder('u')
      .where(`regexp_replace(u.phone, '[^0-9]', '', 'g') = :digits`, { digits })
      .getOne();
  }

  async createUser(phone: string, password: string, role: UserRole) {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = this.repo.create({
      phone,
      passwordHash,
      role,
      fullName: null,
    });
    return this.repo.save(user);
  }
}
