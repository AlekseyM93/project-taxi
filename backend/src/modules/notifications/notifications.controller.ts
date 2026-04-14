import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('me/feed')
  @UseGuards(JwtAuthGuard)
  async getMyFeed(@Req() req: Request, @Query('limit') limitRaw?: string) {
    const user = req.user as { sub: string };
    const parsed = limitRaw ? Number.parseInt(limitRaw, 10) : 50;
    const limit = Number.isFinite(parsed) ? parsed : 50;
    const items = await this.notifications.getUserFeed(user.sub, limit);
    return {
      items,
      limit: Math.min(Math.max(limit, 1), 200),
    };
  }
}
