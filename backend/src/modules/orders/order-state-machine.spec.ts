import { OrderStatus } from './order.entity';
import { canRunOrderTransition } from './order-state-machine';

describe('OrderStateMachine', () => {
  it('allows only ASSIGNED to start', () => {
    expect(canRunOrderTransition('DRIVER_START', OrderStatus.ASSIGNED)).toBe(
      true,
    );
    expect(canRunOrderTransition('DRIVER_START', OrderStatus.NEW)).toBe(false);
    expect(canRunOrderTransition('DRIVER_START', OrderStatus.DONE)).toBe(false);
  });

  it('allows passenger cancel only from allowed statuses', () => {
    expect(canRunOrderTransition('PASSENGER_CANCEL', OrderStatus.NEW)).toBe(
      true,
    );
    expect(
      canRunOrderTransition('PASSENGER_CANCEL', OrderStatus.ASSIGNED),
    ).toBe(true);
    expect(
      canRunOrderTransition('PASSENGER_CANCEL', OrderStatus.NO_DRIVERS_FOUND),
    ).toBe(true);
    expect(
      canRunOrderTransition('PASSENGER_CANCEL', OrderStatus.IN_PROGRESS),
    ).toBe(false);
  });
});
