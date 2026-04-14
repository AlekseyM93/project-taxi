import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { DriversService } from './drivers.service';
import {
  CreateDriverSafetyAlertDto,
  CreateDriverProfileDto,
  CreateVehicleDto,
  DriverEarningsSummaryQueryDto,
  DriverShiftActionDto,
  UpdateDriverProfileDto,
  UpdateDriverStatusDto,
  UpdateVehicleDto,
} from './dto';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';

@Controller()
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Post('drivers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  createDriverProfile(@Body() dto: CreateDriverProfileDto) {
    return this.driversService.createDriverProfile(dto);
  }

  @Get('drivers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  listDriverProfiles() {
    return this.driversService.listDriverProfiles();
  }

  @Get('drivers/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  getDriverProfile(@Param('id') id: string) {
    return this.driversService.getDriverProfileById(id);
  }

  @Patch('drivers/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  updateDriverProfile(
    @Param('id') id: string,
    @Body() dto: UpdateDriverProfileDto,
  ) {
    return this.driversService.updateDriverProfile(id, dto);
  }

  @Patch('drivers/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  updateDriverStatus(
    @Param('id') id: string,
    @Body() dto: UpdateDriverStatusDto,
  ) {
    return this.driversService.updateDriverStatus(id, dto);
  }

  @Post('drivers/:id/vehicles')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  createVehicle(
    @Param('id') driverProfileId: string,
    @Body() dto: CreateVehicleDto,
  ) {
    return this.driversService.createVehicle(driverProfileId, dto);
  }

  @Get('drivers/:id/vehicles')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  listVehicles(@Param('id') driverProfileId: string) {
    return this.driversService.listVehiclesByDriver(driverProfileId);
  }

  @Patch('vehicles/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  updateVehicle(@Param('id') id: string, @Body() dto: UpdateVehicleDto) {
    return this.driversService.updateVehicle(id, dto);
  }

  @Patch('vehicles/:id/activate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  activateVehicle(@Param('id') id: string) {
    return this.driversService.activateVehicle(id);
  }

  @Post('drivers/me/shift/start')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  startMyShift(@Req() req: Request, @Body() dto: DriverShiftActionDto) {
    const user = req.user as { sub: string };
    return this.driversService.startDriverShift(user.sub, dto);
  }

  @Post('drivers/me/shift/end')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  endMyShift(@Req() req: Request, @Body() dto: DriverShiftActionDto) {
    const user = req.user as { sub: string };
    return this.driversService.endDriverShift(user.sub, dto);
  }

  @Get('drivers/me/shift')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  getMyShift(@Req() req: Request) {
    const user = req.user as { sub: string };
    return this.driversService.getDriverShiftStatus(user.sub);
  }

  @Get('drivers/me/earnings/summary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  getMyEarningsSummary(
    @Req() req: Request,
    @Query() query: DriverEarningsSummaryQueryDto,
  ) {
    const user = req.user as { sub: string };
    return this.driversService.getDriverEarningsSummary(user.sub, query);
  }

  @Get('drivers/me/safety/alerts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  getMySafetyAlerts(@Req() req: Request, @Query('limit') limitRaw?: string) {
    const user = req.user as { sub: string };
    const parsed = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    return this.driversService.listDriverSafetyAlerts(
      user.sub,
      Number.isFinite(parsed) ? parsed : undefined,
    );
  }

  @Post('drivers/me/safety/alerts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  createMySafetyAlert(
    @Req() req: Request,
    @Body() body: CreateDriverSafetyAlertDto,
  ) {
    const user = req.user as { sub: string };
    return this.driversService.createDriverSafetyAlert(user.sub, body);
  }

  @Get('drivers/me/profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  getMyProfile(@Req() req: Request) {
    const user = req.user as { sub: string };
    return this.driversService.getDriverProfileByUserId(user.sub);
  }

  @Patch('drivers/me/profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  async updateMyProfile(
    @Req() req: Request,
    @Body() dto: UpdateDriverProfileDto,
  ) {
    const user = req.user as { sub: string };
    const profile = await this.driversService.getDriverProfileByUserId(
      user.sub,
    );
    return this.driversService.updateDriverProfile(profile.id, dto);
  }

  @Get('drivers/me/vehicles')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  async listMyVehicles(@Req() req: Request) {
    const user = req.user as { sub: string };
    const profile = await this.driversService.getDriverProfileByUserId(
      user.sub,
    );
    return this.driversService.listVehiclesByDriver(profile.id);
  }

  @Patch('drivers/me/vehicles/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  updateMyVehicle(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    const user = req.user as { sub: string };
    return this.driversService.updateMyVehicle(user.sub, id, dto);
  }

  @Patch('drivers/me/vehicles/:id/activate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  activateMyVehicle(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as { sub: string };
    return this.driversService.activateMyVehicle(user.sub, id);
  }
}
