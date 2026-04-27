import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";

import { useDriverRealtime } from "./useDriverRealtime";
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
  onOffer: (payload: Record<string, unknown> | null) => void;
  onReady: (api: ReturnType<typeof useDriverRealtime>) => void;
}) {
  const realtime = useDriverRealtime({
    token: props.token,
    onOffer: props.onOffer,
  });
  props.onReady(realtime);
  return null;
}

describe("useDriverRealtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles offer events and emits driver location updates", async () => {
    const socket = createFakeSocket();
    vi
      .mocked(acquireRealtimeSocket)
      .mockReturnValue(socket as unknown as ReturnType<typeof acquireRealtimeSocket>);
    const onOffer = vi.fn();
    const onReady = vi.fn();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const view = render(
      <QueryClientProvider client={queryClient}>
        <HookHarness token="driver-token" onOffer={onOffer} onReady={onReady} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(onReady).toHaveBeenCalled();
      expect(onReady.mock.calls.at(-1)?.[0]?.connected).toBe(true);
    });

    socket.trigger("order.offer", {
      orderId: "order-1",
      queuePosition: 1,
    });
    await waitFor(() => {
      expect(onOffer).toHaveBeenCalledWith({
        orderId: "order-1",
        queuePosition: 1,
      });
    });

    const realtimeApi = onReady.mock.calls.at(-1)?.[0] as
      | { sendLocationUpdate?: (payload: { lat: number; lng: number }) => boolean }
      | undefined;
    expect(
      realtimeApi?.sendLocationUpdate?.({
        lat: 55.751244,
        lng: 37.618423,
      }),
    ).toBe(true);
    expect(socket.emit).toHaveBeenCalledWith("driver.location.update", {
      lat: 55.751244,
      lng: 37.618423,
    });

    view.unmount();
    expect(releaseRealtimeSocket).toHaveBeenCalledWith("/driver", "driver-token");
  });
});
