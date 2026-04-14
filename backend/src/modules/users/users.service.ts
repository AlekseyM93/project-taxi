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

  findByPhone(phone: string) {
    return this.repo.findOne({ where: { phone } });
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
