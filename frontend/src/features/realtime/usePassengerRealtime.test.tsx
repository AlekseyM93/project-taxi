import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";

import { usePassengerRealtime } from "./usePassengerRealtime";
import {
  acquireRealtimeSocket,
  releaseRealtimeSocket,
} from "@/lib/realtime/socketClient";

vi.mock("@/lib/realtime/socketClient", () => ({
  acquireRealtimeSocket: vi.fn(),
  releaseRealtimeSocket: vi.fn(),
}));

type Listener = (payload?: unknown) => void;

function createFakeSocket() {
  const listeners = new Map<string, Listener[]>();
  return {
    connected: true,
    emit: vi.fn(),
    on: vi.fn((event: string, cb: Listener) => {
      const current = listeners.get(event) ?? [];
      listeners.set(event, [...current, cb]);
    }),
    off: vi.fn((event: string, cb: Listener) => {
      const current = listeners.get(event) ?? [];
      listeners.set(
        event,
        current.filter((item) => item !== cb),
      );
    }),
    trigger(event: string, payload?: unknown) {
      const current = listeners.get(event) ?? [];
      for (const cb of current) {
        cb(payload);
      }
    },
  };
}

function HookHarness(props: {
  token: string | null;
  activeOrderId: string | null;
  onDriverLocation: (location: { lat: number; lng: number } | null) => void;
  onOrderStatus: (status: string | null) => void;
  onConnectionStateChange: (connected: boolean) => void;
}) {
  usePassengerRealtime({
    token: props.token,
    activeOrderId: props.activeOrderId,
    onDriverLocation: props.onDriverLocation,
    onOrderStatus: props.onOrderStatus,
    onConnectionStateChange: props.onConnectionStateChange,
  });

  return null;
}

describe("usePassengerRealtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("subscribes to active order and handles status/location events", async () => {
    const socket = createFakeSocket();
    vi
      .mocked(acquireRealtimeSocket)
      .mockReturnValue(socket as unknown as ReturnType<typeof acquireRealtimeSocket>);

    const onDriverLocation = vi.fn();
    const onOrderStatus = vi.fn();
    const onConnectionStateChange = vi.fn();
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    queryClient.setQueryData(["passenger-active-order"], {
      status: 200,
      body: {
        activeOrder: {
          id: "order-1",
          status: "ASSIGNED",
          driverId: "driver-1",
        },
      },
    });

    const view = render(
      <QueryClientProvider client={queryClient}>
        <HookHarness
          token="token-1"
          activeOrderId="order-1"
          onDriverLocation={onDriverLocation}
          onOrderStatus={onOrderStatus}
          onConnectionStateChange={onConnectionStateChange}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(socket.emit).toHaveBeenCalledWith("passenger.join");
      expect(socket.emit).toHaveBeenCalledWith("passenger.order.subscribe", {
        orderId: "order-1",
      });
      expect(onConnectionStateChange).toHaveBeenCalledWith(true);
    });

    socket.trigger("order.status", {
      orderId: "order-1",
      status: "IN_PROGRESS",
      driverId: "driver-2",
    });
    socket.trigger("order.driver.location", {
      orderId: "order-1",
      lat: 55.751244,
      lng: 37.618423,
    });

    await waitFor(() => {
      expect(onOrderStatus).toHaveBeenCalledWith("IN_PROGRESS");
      expect(onDriverLocation).toHaveBeenCalledWith({
        lat: 55.751244,
        lng: 37.618423,
      });
    });

    const updated = queryClient.getQueryData<{
      body?: { activeOrder?: Record<string, unknown> | null };
    }>(["passenger-active-order"]);
    expect(updated?.body?.activeOrder?.status).toBe("IN_PROGRESS");
    expect(updated?.body?.activeOrder?.driverId).toBe("driver-2");

    view.rerender(
      <QueryClientProvider client={queryClient}>
        <HookHarness
          token="token-1"
          activeOrderId="order-2"
          onDriverLocation={onDriverLocation}
          onOrderStatus={onOrderStatus}
          onConnectionStateChange={onConnectionStateChange}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(socket.emit).toHaveBeenCalledWith("passenger.order.subscribe", {
        orderId: "order-2",
      });
      expect(vi.mocked(acquireRealtimeSocket)).toHaveBeenCalledTimes(1);
    });

    view.unmount();
    expect(releaseRealtimeSocket).toHaveBeenCalledWith("/passenger", "token-1");
  });
});
