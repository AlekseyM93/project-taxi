import { OrderStatus } from './order.entity';

export type OrderTransitionAction =
  | 'SYSTEM_ASSIGN_DRIVER'
  | 'SYSTEM_NO_DRIVERS_FOUND'
  | 'DRIVER_DECLINE'
  | 'DRIVER_START'
  | 'DRIVER_FINISH'
  | 'DRIVER_CANCEL'
  | 'PASSENGER_CANCEL';

const ORDER_TRANSITIONS: Record<
  OrderTransitionAction,
  ReadonlySet<OrderStatus>
> = {
  SYSTEM_ASSIGN_DRIVER: new Set([OrderStatus.NEW]),
  SYSTEM_NO_DRIVERS_FOUND: new Set([OrderStatus.NEW]),
  DRIVER_DECLINE: new Set([OrderStatus.ASSIGNED]),
  DRIVER_START: new Set([OrderStatus.ASSIGNED]),
  DRIVER_FINISH: new Set([OrderStatus.IN_PROGRESS]),
  DRIVER_CANCEL: new Set([OrderStatus.ASSIGNED, OrderStatus.IN_PROGRESS]),
  PASSENGER_CANCEL: new Set([
    OrderStatus.NEW,
    OrderStatus.ASSIGNED,
    OrderStatus.NO_DRIVERS_FOUND,
  ]),
};

export function canRunOrderTransition(
  action: OrderTransitionAction,
  currentStatus: OrderStatus,
): boolean {
  return ORDER_TRANSITIONS[action].has(currentStatus);
}
