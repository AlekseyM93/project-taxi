import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThanOrEqual, Repository } from 'typeorm';

import { UserEntity } from '../users/user.entity';
import {
  DriverProfileEntity,
  DriverProfileStatus,
} from './driver-profile.entity';
import { VehicleEntity } from './vehicle.entity';
import {
  CreateDriverProfileDto,
  CreateVehicleDto,
  CreateDriverSafetyAlertDto,
  DriverEarningsSummaryQueryDto,
  DriverShiftActionDto,
  UpdateDriverProfileDto,
  UpdateDriverStatusDto,
  UpdateVehicleDto,
} from './dto';
import { DriverShiftSessionEntity } from './driver-shift-session.entity';
import { DriverEarningLedgerEntity } from './driver-earning-ledger.entity';
import { DriverSafetyAlertEntity } from './driver-safety-alert.entity';

@Injectable()
export class DriversService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    @InjectRepository(DriverProfileEntity)
    private readonly driverProfilesRepo: Repository<DriverProfileEntity>,
    @InjectRepository(VehicleEntity)
    private readonly vehiclesRepo: Repository<VehicleEntity>,
    @InjectRepository(DriverShiftSessionEntity)
    private readonly shiftRepo: Repository<DriverShiftSessionEntity>,
    @InjectRepository(DriverEarningLedgerEntity)
    private readonly earningRepo: Repository<DriverEarningLedgerEntity>,
    @InjectRepository(DriverSafetyAlertEntity)
    private readonly safetyAlertRepo: Repository<DriverSafetyAlertEntity>,
  ) {}

  private resolveCityCode(cityCode?: string, city?: string | null): string {
    if (cityCode && cityCode.trim().length > 0) {
      return cityCode.trim().toUpperCase();
    }
    if (city && city.trim().length > 0) {
      return city.trim().toUpperCase().replace(/\s+/g, '_').slice(0, 32);
    }
    return 'DEFAULT';
  }

  async createDriverProfile(dto: CreateDriverProfileDto) {
    const user = await this.usersRepo.findOne({
      where: { id: dto.userId },
    });

    if (!user) {
      throw new NotFoundException('USER_NOT_FOUND');
    }

    if (user.role !== 'DRIVER') {
      throw new BadRequestException('USER_IS_NOT_DRIVER');
    }

    const existingProfile = await this.driverProfilesRepo.findOne({
      where: { userId: dto.userId },
    });

    if (existingProfile) {
      throw new ConflictException('DRIVER_PROFILE_ALREADY_EXISTS');
    }

    const profile = this.driverProfilesRepo.create({
      userId: dto.userId,
      firstName: dto.firstName,
      lastName: dto.lastName,
      city: dto.city ?? null,
      cityCode: this.resolveCityCode(dto.cityCode, dto.city),
      status: dto.status ?? DriverProfileStatus.PENDING,
    });

    return this.driverProfilesRepo.save(profile);
  }

  async listDriverProfiles() {
    return this.driverProfilesRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  async listDriverProfilesForOps(params?: {
    limit?: number;
    cursorCreatedAt?: string;
  }) {
    const limit = Math.min(Math.max(params?.limit ?? 20, 1), 100);
    const where = params?.cursorCreatedAt
      ? { createdAt: LessThan(new Date(params.cursorCreatedAt)) }
      : {};

    return this.driverProfilesRepo.find({
      where,
      relations: {
        user: true,
        vehicles: true,
      },
      order: { createdAt: 'DESC' },
      take: limit + 1,
    });
  }

  async getDriverProfileById(id: string) {
    const profile = await this.driverProfilesRepo.findOne({
      where: { id },
      relations: {
        vehicles: true,
      },
    });

    if (!profile) {
      throw new NotFoundException('DRIVER_PROFILE_NOT_FOUND');
    }

    return profile;
  }

  async getDriverProfileByUserId(userId: string) {
    const profile = await this.driverProfilesRepo.findOne({
      where: { userId },
      relations: {
        vehicles: true,
      },
    });

    if (!profile) {
      throw new NotFoundException('DRIVER_PROFILE_NOT_FOUND');
    }

    return profile;
  }

  async updateDriverProfile(id: string, dto: UpdateDriverProfileDto) {
    const profile = await this.driverProfilesRepo.findOne({
      where: { id },
    });

    if (!profile) {
      throw new NotFoundException('DRIVER_PROFILE_NOT_FOUND');
    }

    if (dto.firstName !== undefined) profile.firstName = dto.firstName;
    if (dto.lastName !== undefined) profile.lastName = dto.lastName;
    if (dto.city !== undefined) profile.city = dto.city;
    if (dto.cityCode !== undefined || dto.city !== undefined) {
      profile.cityCode = this.resolveCityCode(
        dto.cityCode,
        dto.city ?? profile.city,
      );
    }
    if (dto.status !== undefined) profile.status = dto.status;
    if (dto.isOnlineEnabled !== undefined) {
      profile.isOnlineEnabled = dto.isOnlineEnabled;
    }

    return this.driverProfilesRepo.save(profile);
  }

  async updateDriverStatus(id: string, dto: UpdateDriverStatusDto) {
    const profile = await this.driverProfilesRepo.findOne({
      where: { id },
    });

    if (!profile) {
      throw new NotFoundException('DRIVER_PROFILE_NOT_FOUND');
    }

    profile.status = dto.status;
    return this.driverProfilesRepo.save(profile);
  }

  async createVehicle(driverProfileId: string, dto: CreateVehicleDto) {
    const driverProfile = await this.driverProfilesRepo.findOne({
      where: { id: driverProfileId },
    });

    if (!driverProfile) {
      throw new NotFoundException('DRIVER_PROFILE_NOT_FOUND');
    }

    const existingPlate = await this.vehiclesRepo.findOne({
      where: { plateNumber: dto.plateNumber },
    });

    if (existingPlate) {
      throw new ConflictException('VEHICLE_PLATE_ALREADY_EXISTS');
    }

    if (dto.isActive) {
      await this.vehiclesRepo.update(
        { driverProfileId, isActive: true },
        { isActive: false },
      );
    }

    const vehicle = this.vehiclesRepo.create({
      driverProfileId,
      brand: dto.brand,
      model: dto.model,
      color: dto.color,
      plateNumber: dto.plateNumber,
      year: dto.year,
      isActive: dto.isActive ?? true,
    });

    return this.vehiclesRepo.save(vehicle);
  }

  async listVehiclesByDriver(driverProfileId: string) {
    const driverProfile = await this.driverProfilesRepo.findOne({
      where: { id: driverProfileId },
    });

    if (!driverProfile) {
      throw new NotFoundException('DRIVER_PROFILE_NOT_FOUND');
    }

    return this.vehiclesRepo.find({
      where: { driverProfileId },
      order: { createdAt: 'DESC' },
    });
  }

  async updateVehicle(id: string, dto: UpdateVehicleDto) {
    const vehicle = await this.vehiclesRepo.findOne({
      where: { id },
    });

    if (!vehicle) {
      throw new NotFoundException('VEHICLE_NOT_FOUND');
    }

    if (dto.plateNumber && dto.plateNumber !== vehicle.plateNumber) {
      const existingPlate = await this.vehiclesRepo.findOne({
        where: { plateNumber: dto.plateNumber },
      });

      if (existingPlate) {
        throw new ConflictException('VEHICLE_PLATE_ALREADY_EXISTS');
      }
    }

    if (dto.brand !== undefined) vehicle.brand = dto.brand;
    if (dto.model !== undefined) vehicle.model = dto.model;
    if (dto.color !== undefined) vehicle.color = dto.color;
    if (dto.plateNumber !== undefined) vehicle.plateNumber = dto.plateNumber;
    if (dto.year !== undefined) vehicle.year = dto.year;

    if (dto.isActive !== undefined) {
      if (dto.isActive) {
        await this.vehiclesRepo.update(
          { driverProfileId: vehicle.driverProfileId, isActive: true },
          { isActive: false },
        );
      }
      vehicle.isActive = dto.isActive;
    }

    return this.vehiclesRepo.save(vehicle);
  }

  async updateMyVehicle(
    userId: string,
    vehicleId: string,
    dto: UpdateVehicleDto,
  ) {
    const profile = await this.getDriverProfileByUserId(userId);
    const vehicle = await this.vehiclesRepo.findOne({
      where: { id: vehicleId },
    });

    if (!vehicle || vehicle.driverProfileId !== profile.id) {
      throw new NotFoundException('VEHICLE_NOT_FOUND');
    }

    return this.updateVehicle(vehicleId, dto);
  }

  async activateVehicle(id: string) {
    const vehicle = await this.vehiclesRepo.findOne({
      where: { id },
    });

    if (!vehicle) {
      throw new NotFoundException('VEHICLE_NOT_FOUND');
    }

    await this.vehiclesRepo.update(
      { driverProfileId: vehicle.driverProfileId, isActive: true },
      { isActive: false },
    );

    vehicle.isActive = true;
    return this.vehiclesRepo.save(vehicle);
  }

  async activateMyVehicle(userId: string, vehicleId: string) {
    const profile = await this.getDriverProfileByUserId(userId);
    const vehicle = await this.vehiclesRepo.findOne({
      where: { id: vehicleId },
    });

    if (!vehicle || vehicle.driverProfileId !== profile.id) {
      throw new NotFoundException('VEHICLE_NOT_FOUND');
    }

    return this.activateVehicle(vehicleId);
  }

  private async resolveDriverIdByUserId(userId: string): Promise<string> {
    const profile = await this.getDriverProfileByUserId(userId);
    return profile.id;
  }

  async startDriverShift(userId: string, dto: DriverShiftActionDto) {
    const driverId = await this.resolveDriverIdByUserId(userId);
    const existing = await this.shiftRepo.findOne({
      where: {
        driverId,
        status: 'OPEN',
      },
      order: { startedAt: 'DESC' },
    });
    if (existing) {
      return {
        ok: true,
        alreadyOpen: true,
        shiftId: existing.id,
        startedAt: existing.startedAt.toISOString(),
      };
    }

    const shift = this.shiftRepo.create({
      driverId,
      status: 'OPEN',
      startedAt: new Date(),
      endedAt: null,
      metadata: dto.reason ? { reason: dto.reason } : null,
    });
    const saved = await this.shiftRepo.save(shift);
    return {
      ok: true,
      alreadyOpen: false,
      shiftId: saved.id,
      startedAt: saved.startedAt.toISOString(),
    };
  }

  async endDriverShift(userId: string, dto: DriverShiftActionDto) {
    const driverId = await this.resolveDriverIdByUserId(userId);
    const existing = await this.shiftRepo.findOne({
      where: {
        driverId,
        status: 'OPEN',
      },
      order: { startedAt: 'DESC' },
    });
    if (!existing) {
      throw new BadRequestException('SHIFT_NOT_OPEN');
    }

    existing.status = 'CLOSED';
    existing.endedAt = new Date();
    existing.metadata = {
      ...(existing.metadata ?? {}),
      closeReason: dto.reason ?? null,
    };
    const saved = await this.shiftRepo.save(existing);

    const totalsRaw = await this.earningRepo
      .createQueryBuilder('earning')
      .select('COALESCE(SUM(earning.amount), 0)', 'total')
      .addSelect('COUNT(*)', 'trips')
      .where('earning.driverId = :driverId', { driverId })
      .andWhere('earning.createdAt >= :fromTs', { fromTs: existing.startedAt })
      .andWhere('earning.createdAt <= :toTs', { toTs: saved.endedAt })
      .getRawOne<{ total: string; trips: string }>();

    return {
      ok: true,
      shiftId: saved.id,
      startedAt: saved.startedAt.toISOString(),
      endedAt: saved.endedAt ? saved.endedAt.toISOString() : null,
      summary: {
        totalRub: Number(totalsRaw?.total ?? 0),
        completedTrips: Number.parseInt(totalsRaw?.trips ?? '0', 10),
      },
    };
  }

  async getDriverShiftStatus(userId: string) {
    const driverId = await this.resolveDriverIdByUserId(userId);
    const openShift = await this.shiftRepo.findOne({
      where: {
        driverId,
        status: 'OPEN',
      },
      order: { startedAt: 'DESC' },
    });
    return {
      activeShift: openShift
        ? {
            shiftId: openShift.id,
            startedAt: openShift.startedAt.toISOString(),
            durationSec: Math.floor(
              (Date.now() - openShift.startedAt.getTime()) / 1000,
            ),
          }
        : null,
    };
  }

  async recordTripEarning(params: {
    driverId: string;
    orderId: string;
    amountRub: number;
    metadata?: Record<string, unknown>;
  }) {
    const existing = await this.earningRepo.findOne({
      where: { orderId: params.orderId },
    });
    if (existing) {
      return existing;
    }

    const entry = this.earningRepo.create({
      driverId: params.driverId,
      orderId: params.orderId,
      amount: params.amountRub.toFixed(2),
      earningType: 'TRIP_FARE',
      currency: 'RUB',
      metadata: params.metadata ?? null,
    });
    return this.earningRepo.save(entry);
  }

  async getDriverEarningsSummary(
    userId: string,
    query: DriverEarningsSummaryQueryDto,
  ) {
    const driverId = await this.resolveDriverIdByUserId(userId);
    const from = query.from
      ? new Date(query.from)
      : new Date(Date.now() - 86400000);
    const to = query.to ? new Date(query.to) : new Date();
    if (from > to) {
      throw new BadRequestException('INVALID_RANGE');
    }
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);

    const [totalsRaw, rows] = await Promise.all([
      this.earningRepo
        .createQueryBuilder('earning')
        .select('COALESCE(SUM(earning.amount), 0)', 'total')
        .addSelect('COUNT(*)', 'trips')
        .where('earning.driverId = :driverId', { driverId })
        .andWhere('earning.createdAt >= :fromTs', { fromTs: from })
        .andWhere('earning.createdAt <= :toTs', { toTs: to })
        .getRawOne<{ total: string; trips: string }>(),
      this.earningRepo.find({
        where: {
          driverId,
          createdAt: MoreThanOrEqual(from),
        },
        order: { createdAt: 'DESC' },
        take: limit,
      }),
    ]);

    const filteredRows = rows.filter((row) => row.createdAt <= to);

    return {
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      totals: {
        currency: 'RUB',
        totalRub: Number(totalsRaw?.total ?? 0),
        completedTrips: Number.parseInt(totalsRaw?.trips ?? '0', 10),
      },
      items: filteredRows.map((row) => ({
        id: row.id,
        orderId: row.orderId,
        amountRub: Number(row.amount),
        earningType: row.earningType,
        createdAt: row.createdAt.toISOString(),
        metadata: row.metadata,
      })),
    };
  }

  async createDriverSafetyAlert(
    userId: string,
    dto: CreateDriverSafetyAlertDto,
  ) {
    const driverId = await this.resolveDriverIdByUserId(userId);
    const alert = this.safetyAlertRepo.create({
      driverId,
      orderId: dto.orderId ?? null,
      alertType: dto.alertType,
      severity: dto.severity ?? 'WARN',
      message: dto.message,
      status: 'OPEN',
      location:
        typeof dto.lat === 'number' && typeof dto.lng === 'number'
          ? {
              lat: dto.lat,
              lng: dto.lng,
            }
          : null,
      metadata: {
        ...(dto.metadata ?? {}),
        offlineBuffered: dto.offlineBuffered ?? false,
      },
      resolvedAt: null,
    });
    const saved = await this.safetyAlertRepo.save(alert);
    return {
      ok: true,
      alertId: saved.id,
      status: saved.status,
      createdAt: saved.createdAt.toISOString(),
    };
  }

  async listDriverSafetyAlerts(userId: string, limitRaw?: number) {
    const driverId = await this.resolveDriverIdByUserId(userId);
    const limit = Math.min(Math.max(limitRaw ?? 50, 1), 200);
    const rows = await this.safetyAlertRepo.find({
      where: { driverId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        orderId: row.orderId,
        alertType: row.alertType,
        severity: row.severity,
        message: row.message,
        status: row.status,
        location: row.location,
        metadata: row.metadata,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async canDriverWork(userId: string): Promise<boolean> {
    const profile = await this.driverProfilesRepo.findOne({
      where: { userId },
    });

    if (!profile) {
      return false;
    }

    if (profile.status !== DriverProfileStatus.ACTIVE) {
      return false;
    }

    const activeVehicle = await this.vehiclesRepo.findOne({
      where: {
        driverProfileId: profile.id,
        isActive: true,
      },
    });

    return !!activeVehicle;
  }

  async getActiveVehicleByUserId(userId: string) {
    const profile = await this.driverProfilesRepo.findOne({
      where: { userId },
    });

    if (!profile) {
      return null;
    }

    return this.vehiclesRepo.findOne({
      where: {
        driverProfileId: profile.id,
        isActive: true,
      },
    });
  }
}
