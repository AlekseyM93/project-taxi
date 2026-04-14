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
import { JwtAuthGuard } from '../../common/auth/jwt.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { OpenSupportCaseDto, ResolveSupportCaseDto } from './dto';
import { SupportService } from './support.service';

@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post('cases/open')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PASSENGER')
  async openCase(@Req() req: Request, @Body() dto: OpenSupportCaseDto) {
    const user = req.user as { sub: string };
    return this.support.openCase(user.sub, dto);
  }

  @Get('cases')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  async listCases(@Query('limit') limitRaw?: string) {
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 50;
    return this.support.listCases(limit);
  }

  @Patch('cases/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  async resolveCase(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: ResolveSupportCaseDto,
  ) {
    const user = req.user as { sub: string };
    return this.support.resolveCase(id, user.sub, body);
  }
}
