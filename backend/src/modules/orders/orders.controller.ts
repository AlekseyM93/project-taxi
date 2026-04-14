import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Patch,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../common/auth/jwt.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { DispatchService } from '../dispatch/dispatch.service';
import {
  AdminActionExecutionsQueryDto,
  AdminActionsHistoryQueryDto,
  AdminAuditFeedQueryDto,
  AdminDispatchControlTowerQueryDto,
  AdminDriverOpsQueryDto,
  AdminOrdersPanelQueryDto,
  AdminOrderActionDto,
  AdminSavedFilterQueryDto,
  ConfirmPassengerOrderDto,
  CreateOrderDto,
  CreatePassengerDisputeDto,
  DriverOrderTimelineQueryDto,
  ExecuteAdminActionDto,
  ListMyOrdersQueryDto,
  MobileSyncPullQueryDto,
  MobileSyncPushDto,
  PassengerFareEstimateDto,
  PassengerOrderTimelineQueryDto,
  UpsertAdminSavedFilterDto,
} from './dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly config: ConfigService,
    private readonly orders: OrdersService,
    private readonly dispatch: DispatchService,
  ) {}

  private ensureDebugEndpointsEnabled() {
    const enabled =
      this.config.get<string>('ENABLE_DEBUG_ENDPOINTS', 'false') === 'true';
    if (!enabled) {
      throw new NotFoundException();
    }
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PASSENGER')
  async create(@Req() req: Request, @Body() dto: CreateOrderDto) {
    const user = req.user as { sub: string; role: string };

    const created = await this.orders.createOrder(user.sub, dto);

    const dispatchResult = await this.dispatch.createQueueAndDispatch({
      orderId: created.orderId,
      fromLat: dto.fromLat,
      fromLng: dto.fromLng,
      toLat: dto.toLat,
      toLng: dto.toLng,
      price: String(created.price),
    });

    return {
      orderId: created.orderId,
      status: created.status,
      dispatch: dispatchResult,
    };
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PASSENGER')
  async cancel(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as { sub: string };
    return this.orders.cancelOrderByPassenger(user.sub, id);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  async list() {
    return this.orders.listOrders();
  }

  @Get('me/passenger')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PASSENGER')
  async listMyPassengerOrders(
    @Req() req: Request,
    @Query() query: ListMyOrdersQueryDto,
  ) {
    const user = req.user as { sub: string };
    return this.orders.listPassengerOrderHistory(user.sub, query);
  }

  @Get('me/passenger/active')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PASSENGER')
  async getMyPassengerActiveOrder(@Req() req: Request) {
    const user = req.user as { sub: string };
    return this.orders.getPassengerActiveOrder(user.sub);
  }

  @Post('me/passenger/fare-estimate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PASSENGER')
  async getPassengerFareEstimate(
    @Req() req: Request,
    @Body() body: PassengerFareEstimateDto,
  ) {
    const user = req.user as { sub: string };
    return this.orders.getPassengerFareEstimate(user.sub, body);
  }

  @Post('me/passenger/confirm')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PASSENGER')
  async confirmPassengerOrder(
    @Req() req: Request,
    @Body() body: ConfirmPassengerOrderDto,
  ) {
    const user = req.user as { sub: string };
    return this.orders.confirmPassengerOrder(user.sub, body);
  }

  @Get('me/passenger/:id/details')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PASSENGER')
  async getMyPassengerOrderDetails(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    const user = req.user as { sub: string };
    return this.orders.getPassengerOrderDetails(user.sub, id);
  }

  @Get('me/passenger/:id/timeline')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PASSENGER')
  async getMyPassengerOrderTimeline(
    @Req() req: Request,
    @Param('id') id: string,
    @Query() query: PassengerOrderTimelineQueryDto,
  ) {
    const user = req.user as { sub: string };
    return this.orders.getPassengerOrderTimeline(user.sub, id, query);
  }

  @Get('me/passenger/:id/receipt')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PASSENGER')
  async getMyPassengerOrderReceipt(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    const user = req.user as { sub: string };
    return this.orders.getPassengerOrderReceipt(user.sub, id);
  }

  @Get('me/passenger/:id/disputes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PASSENGER')
  async listMyPassengerOrderDisputes(
    @Req() req: Request,
    @Param('id') id: string,
  ) {
    const user = req.user as { sub: string };
    return this.orders.listPassengerOrderDisputes(user.sub, id);
  }

  @Post('me/passenger/:id/disputes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PASSENGER')
  async openMyPassengerOrderDispute(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: CreatePassengerDisputeDto,
  ) {
    const user = req.user as { sub: string };
    return this.orders.createPassengerOrderDispute(user.sub, id, body);
  }

  @Get('me/driver')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  async listMyDriverOrders(
    @Req() req: Request,
    @Query() query: ListMyOrdersQueryDto,
  ) {
    const user = req.user as { sub: string };
    return this.orders.listDriverOrderHistory(user.sub, query);
  }

  @Get('me/driver/active')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  async getMyDriverActiveOrder(@Req() req: Request) {
    const user = req.user as { sub: string };
    return this.orders.getDriverActiveOrderByUserId(user.sub);
  }

  @Get('me/driver/active/card')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  async getMyDriverActiveCard(@Req() req: Request) {
    const user = req.user as { sub: string };
    return this.orders.getDriverActiveOrderCard(user.sub);
  }

  @Get('me/driver/:id/details')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  async getMyDriverOrderDetails(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as { sub: string };
    return this.orders.getDriverOrderDetails(user.sub, id);
  }

  @Get('me/driver/:id/timeline')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  async getMyDriverOrderTimeline(
    @Req() req: Request,
    @Param('id') id: string,
    @Query() query: DriverOrderTimelineQueryDto,
  ) {
    const user = req.user as { sub: string };
    return this.orders.getDriverOrderTimeline(user.sub, id, query);
  }

  @Get('sync/pull')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PASSENGER', 'DRIVER')
  async pullMobileSync(
    @Req() req: Request,
    @Query() query: MobileSyncPullQueryDto,
  ) {
    const user = req.user as {
      sub: string;
      role: 'DRIVER' | 'PASSENGER' | 'DISPATCHER' | 'ADMIN';
    };
    return this.orders.pullMobileSyncChanges(user, query);
  }

  @Post('sync/push')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PASSENGER', 'DRIVER')
  async pushMobileSync(@Req() req: Request, @Body() body: MobileSyncPushDto) {
    const user = req.user as {
      sub: string;
      role: 'DRIVER' | 'PASSENGER' | 'DISPATCHER' | 'ADMIN';
    };
    return this.orders.pushMobileSyncCommands(user, body);
  }

  @Get('debug/cleanup')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  cleanupInfo() {
    this.ensureDebugEndpointsEnabled();
    return {
      message: 'Use POST /orders/debug/cleanup to delete all test orders',
    };
  }

  @Post('debug/cleanup')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async cleanup() {
    this.ensureDebugEndpointsEnabled();
    return this.orders.cleanupTestOrders();
  }

  @Post('admin/actions/:id/force-cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  async forceCancelByAdmin(
    @Req() req: Request,
    @Param('id') orderId: string,
    @Body() body: AdminOrderActionDto,
  ) {
    const user = req.user as { sub: string };
    return this.orders.forceCancelOrderByAdmin({
      orderId,
      adminUserId: user.sub,
      reason: body.reason,
    });
  }

  @Post('admin/actions/:id/force-finish')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  async forceFinishByAdmin(
    @Req() req: Request,
    @Param('id') orderId: string,
    @Body() body: AdminOrderActionDto,
  ) {
    const user = req.user as { sub: string };
    return this.orders.forceFinishOrderByAdmin({
      orderId,
      adminUserId: user.sub,
      reason: body.reason,
    });
  }

  @Post('admin/actions/driver/:driverId/reconcile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  async reconcileDriverByAdmin(
    @Req() req: Request,
    @Param('driverId') driverId: string,
    @Body() body: AdminOrderActionDto,
  ) {
    const user = req.user as { sub: string };
    return this.orders.reconcileDriverByAdmin({
      driverId,
      adminUserId: user.sub,
      reason: body.reason,
    });
  }

  @Get('admin/metrics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  async getAdminMetrics(
    @Req() req: Request,
    @Query('windowMinutes') windowMinutesRaw?: string,
  ) {
    const user = req.user as {
      sub: string;
      role: 'DRIVER' | 'PASSENGER' | 'DISPATCHER' | 'ADMIN';
    };
    const windowMinutes = windowMinutesRaw
      ? Number.parseInt(windowMinutesRaw, 10)
      : undefined;
    return this.orders.getAdminMetrics(user, windowMinutes);
  }

  @Get('admin/panel/orders')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  async getAdminPanelOrders(
    @Req() req: Request,
    @Query() query: AdminOrdersPanelQueryDto,
  ) {
    const user = req.user as {
      sub: string;
      role: 'DRIVER' | 'PASSENGER' | 'DISPATCHER' | 'ADMIN';
    };
    return this.orders.listAdminPanelOrders(user, query);
  }

  @Get('admin/panel/audit-feed')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  async getAdminAuditFeed(
    @Req() req: Request,
    @Query() query: AdminAuditFeedQueryDto,
  ) {
    const user = req.user as {
      sub: string;
      role: 'DRIVER' | 'PASSENGER' | 'DISPATCHER' | 'ADMIN';
    };
    return this.orders.getAdminAuditFeed(user, query);
  }

  @Get('admin/panel/actions-history')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  async getAdminActionsHistory(
    @Req() req: Request,
    @Query() query: AdminActionsHistoryQueryDto,
  ) {
    const user = req.user as {
      sub: string;
      role: 'DRIVER' | 'PASSENGER' | 'DISPATCHER' | 'ADMIN';
    };
    return this.orders.getAdminActionsHistory(user, query);
  }

  @Get('admin/panel/saved-filters')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  async listAdminSavedFilters(
    @Req() req: Request,
    @Query() query: AdminSavedFilterQueryDto,
  ) {
    const user = req.user as {
      sub: string;
      role: 'DRIVER' | 'PASSENGER' | 'DISPATCHER' | 'ADMIN';
    };
    return this.orders.listAdminSavedFilters(user, query);
  }

  @Post('admin/panel/saved-filters')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  async createAdminSavedFilter(
    @Req() req: Request,
    @Body() body: UpsertAdminSavedFilterDto,
  ) {
    const user = req.user as {
      sub: string;
      role: 'DRIVER' | 'PASSENGER' | 'DISPATCHER' | 'ADMIN';
    };
    return this.orders.createAdminSavedFilter(user, body);
  }

  @Patch('admin/panel/saved-filters/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  async updateAdminSavedFilter(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpsertAdminSavedFilterDto,
  ) {
    const user = req.user as {
      sub: string;
      role: 'DRIVER' | 'PASSENGER' | 'DISPATCHER' | 'ADMIN';
    };
    return this.orders.updateAdminSavedFilter(user, id, body);
  }

  @Delete('admin/panel/saved-filters/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  async deleteAdminSavedFilter(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as {
      sub: string;
      role: 'DRIVER' | 'PASSENGER' | 'DISPATCHER' | 'ADMIN';
    };
    return this.orders.deleteAdminSavedFilter(user, id);
  }

  @Get('admin/panel/drivers/ops')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  async getAdminDriverOps(
    @Req() req: Request,
    @Query() query: AdminDriverOpsQueryDto,
  ) {
    const user = req.user as {
      sub: string;
      role: 'DRIVER' | 'PASSENGER' | 'DISPATCHER' | 'ADMIN';
    };
    return this.orders.listAdminDriverOperations(user, query);
  }

  @Get('admin/panel/dispatch/control-tower')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  async getDispatchControlTower(
    @Req() req: Request,
    @Query() query: AdminDispatchControlTowerQueryDto,
  ) {
    const user = req.user as {
      sub: string;
      role: 'DRIVER' | 'PASSENGER' | 'DISPATCHER' | 'ADMIN';
    };
    return this.orders.listAdminDispatchControlTower(user, query);
  }

  @Get('admin/panel/action-center/templates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  async getAdminActionCenterTemplates(@Req() req: Request) {
    const user = req.user as {
      sub: string;
      role: 'DRIVER' | 'PASSENGER' | 'DISPATCHER' | 'ADMIN';
    };
    return this.orders.getAdminActionCenterTemplates(user);
  }

  @Get('admin/panel/action-center/executions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  async getAdminActionExecutions(
    @Req() req: Request,
    @Query() query: AdminActionExecutionsQueryDto,
  ) {
    const user = req.user as {
      sub: string;
      role: 'DRIVER' | 'PASSENGER' | 'DISPATCHER' | 'ADMIN';
    };
    return this.orders.listAdminActionExecutions(user, query);
  }

  @Post('admin/panel/action-center/execute')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  async executeAdminActionCenter(
    @Req() req: Request,
    @Body() body: ExecuteAdminActionDto,
  ) {
    const user = req.user as {
      sub: string;
      role: 'DRIVER' | 'PASSENGER' | 'DISPATCHER' | 'ADMIN';
    };
    return this.orders.executeAdminActionCenter(user, body);
  }

  @Post('admin/panel/dispatch/:id/redrive')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  async redriveDispatch(
    @Req() req: Request,
    @Param('id') orderId: string,
    @Body() body: AdminOrderActionDto,
  ) {
    const user = req.user as {
      sub: string;
      role: 'DRIVER' | 'PASSENGER' | 'DISPATCHER' | 'ADMIN';
    };
    return this.orders.redriveDispatchByAdmin({
      orderId,
      adminUserId: user.sub,
      reason: body.reason,
    });
  }

  @Get(':id/timeline')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async getTimeline(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as {
      sub: string;
      role: 'DRIVER' | 'PASSENGER' | 'DISPATCHER' | 'ADMIN';
    };
    return this.orders.getOrderTimelineForUser(id, user);
  }

  @Get(':id/incidents')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async getIncidents(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as {
      sub: string;
      role: 'DRIVER' | 'PASSENGER' | 'DISPATCHER' | 'ADMIN';
    };
    return this.orders.getOrderIncidentsForUser(id, user);
  }

  @Get(':id/dispatch')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER')
  async getDispatch(@Param('id') id: string) {
    return this.dispatch.getQueue(id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DISPATCHER', 'PASSENGER', 'DRIVER')
  async getOne(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as {
      sub: string;
      role: 'DRIVER' | 'PASSENGER' | 'DISPATCHER' | 'ADMIN';
    };
    return this.orders.getOrderForUser(id, user);
  }
}
