import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { GovernanceService } from './governance.service';
import { GovernanceRetentionExecuteDto } from './dto';

@Controller('governance')
export class GovernanceController {
  constructor(private readonly governance: GovernanceService) {}

  @Get('retention/snapshot')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getRetentionSnapshot() {
    return this.governance.getRetentionSnapshot();
  }

  @Post('retention/execute')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async executeRetention(@Body() dto: GovernanceRetentionExecuteDto) {
    return this.governance.executeRetention({
      dryRun: dto.dryRun,
      limit: dto.limit,
    });
  }
}
