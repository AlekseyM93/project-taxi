import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Socket } from "socket.io-client";

import {
  acquireRealtimeSocket,
  releaseRealtimeSocket,
} from "@/lib/realtime/socketClient";

type RealtimeLocation = {
  lat: number;
  lng: number;
};

type RealtimeStatusPayload = {
  orderId?: string;
  status?: string;
  driverId?: string | null;
};

type RealtimeSnapshotPayload = {
  orderId?: string;
  status?: string;
  driverId?: string | null;
  location?: RealtimeLocation | null;
};

export function usePassengerRealtime(params: {
  token: string | null;
  activeOrderId: string | null;
  onDriverLocation: (location: RealtimeLocation | null) => void;
  onConnectionStateChange?: (connected: boolean) => void;
  onOrderStatus?: (status: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const {
    token: rawToken,
    activeOrderId,
    onDriverLocation,
    onConnectionStateChange,
    onOrderStatus,
  } = params;
  const socketRef = useRef<Socket | null>(null);
  const activeOrderIdRef = useRef<string | null>(activeOrderId);
  const lastSubscribedOrderIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeOrderIdRef.current = activeOrderId;
  }, [activeOrderId]);

  useEffect(() => {
    const token = rawToken?.trim() || "";
    if (!token) {
      return;
    }

    const socket = acquireRealtimeSocket("/passenger", token);
    if (!socket) {
      return;
    }
    socketRef.current = socket;

    const handleConnect = () => {
      onConnectionStateChange?.(true);
      socket.emit("passenger.join");
      const orderId = activeOrderIdRef.current;
      if (orderId) {
        socket.emit("passenger.order.subscribe", { orderId });
        lastSubscribedOrderIdRef.current = orderId;
      }
    };
    const handleDisconnect = () => {
      onConnectionStateChange?.(false);
    };

    const handleStatus = (payload: RealtimeStatusPayload) => {
      if (!payload?.orderId) {
        return;
      }
      queryClient.setQueryData(
        ["passenger-active-order"],
        (prev: { status?: number; body?: { activeOrder?: Record<string, unknown> | null } } | undefined) => {
          const activeOrder = prev?.body?.activeOrder;
          if (!activeOrder || String(activeOrder.id) !== payload.orderId) {
            return prev;
          }
          return {
            ...prev,
            body: {
              ...prev?.body,
              activeOrder: {
                ...activeOrder,
                status: payload.status ?? activeOrder.status,
                driverId:
                  payload.driverId === undefined ? activeOrder.driverId : payload.driverId,
              },
            },
          };
        },
      );
      queryClient.invalidateQueries({ queryKey: ["passenger-orders"] });
      onOrderStatus?.(payload.status ?? null);
    };

    const handleDriverLocation = (payload: { orderId?: string; lat?: number; lng?: number }) => {
      if (
        payload?.orderId &&
        activeOrderIdRef.current &&
        payload.orderId !== activeOrderIdRef.current
      ) {
        return;
      }
      if (typeof payload?.lat === "number" && typeof payload?.lng === "number") {
        onDriverLocation({ lat: payload.lat, lng: payload.lng });
      }
    };

    const handleDriverSnapshot = (payload: RealtimeSnapshotPayload) => {
      if (!payload?.orderId) {
        return;
      }
      queryClient.setQueryData(
        ["passenger-active-order"],
        (prev: { status?: number; body?: { activeOrder?: Record<string, unknown> | null } } | undefined) => {
          const activeOrder = prev?.body?.activeOrder;
          if (!activeOrder || String(activeOrder.id) !== payload.orderId) {
            return prev;
          }
          return {
            ...prev,
            body: {
              ...prev?.body,
              activeOrder: {
                ...activeOrder,
                status: payload.status ?? activeOrder.status,
                driverId:
                  payload.driverId === undefined ? activeOrder.driverId : payload.driverId,
              },
            },
          };
        },
      );
      if (
        payload.location &&
        typeof payload.location.lat === "number" &&
        typeof payload.location.lng === "number"
      ) {
        onDriverLocation(payload.location);
      } else {
        onDriverLocation(null);
      }
      onOrderStatus?.(payload.status ?? null);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("order.status", handleStatus);
    socket.on("order.driver.location", handleDriverLocation);
    socket.on("order.driver.snapshot", handleDriverSnapshot);

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("order.status", handleStatus);
      socket.off("order.driver.location", handleDriverLocation);
      socket.off("order.driver.snapshot", handleDriverSnapshot);
      socketRef.current = null;
      onConnectionStateChange?.(false);
      releaseRealtimeSocket("/passenger", token);
    };
  }, [
    rawToken,
    onConnectionStateChange,
    onDriverLocation,
    onOrderStatus,
    queryClient,
  ]);

  useEffect(() => {
    const socket = socketRef.current;
    const orderId = activeOrderId;
    if (!socket || !socket.connected || !orderId) {
      return;
    }
    if (lastSubscribedOrderIdRef.current === orderId) {
      return;
    }
    socket.emit("passenger.order.subscribe", { orderId });
    lastSubscribedOrderIdRef.current = orderId;
  }, [activeOrderId]);
}
