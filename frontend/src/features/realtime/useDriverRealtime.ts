import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Socket } from "socket.io-client";

import {
  acquireRealtimeSocket,
  releaseRealtimeSocket,
} from "@/lib/realtime/socketClient";

type DriverOfferPayload = {
  orderId?: string;
  price?: string;
  from?: { lat?: number; lng?: number };
  to?: { lat?: number; lng?: number };
  queuePosition?: number;
};

export function useDriverRealtime(params: {
  token: string | null;
  onOffer: (payload: DriverOfferPayload | null) => void;
}) {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const { token: rawToken, onOffer } = params;

  useEffect(() => {
    const token = rawToken?.trim() || "";
    if (!token) {
      return;
    }

    const socket = acquireRealtimeSocket("/driver", token);
    if (!socket) {
      return;
    }
    socketRef.current = socket;

    const handleOffer = (payload: DriverOfferPayload) => {
      onOffer(payload);
      queryClient.invalidateQueries({ queryKey: ["driver-orders"] });
    };

    const handleOfferClosed = () => {
      onOffer(null);
      queryClient.invalidateQueries({ queryKey: ["driver-orders"] });
    };

    const handleOrderCancelled = () => {
      onOffer(null);
      queryClient.invalidateQueries({ queryKey: ["driver-active-card"] });
      queryClient.invalidateQueries({ queryKey: ["driver-orders"] });
    };
    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("order.offer", handleOffer);
    socket.on("order.offer.closed", handleOfferClosed);
    socket.on("order.cancelled", handleOrderCancelled);
    if (socket.connected) {
      setConnected(true);
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("order.offer", handleOffer);
      socket.off("order.offer.closed", handleOfferClosed);
      socket.off("order.cancelled", handleOrderCancelled);
      socketRef.current = null;
      setConnected(false);
      releaseRealtimeSocket("/driver", token);
    };
  }, [rawToken, onOffer, queryClient]);

  const sendLocationUpdate = useCallback(
    (payload: {
      lat: number;
      lng: number;
      heading?: number;
      speed?: number;
      accuracy?: number;
      clientTs?: string;
      sequence?: number;
    }) => {
      const socket = socketRef.current;
      if (!socket || !socket.connected) {
        return false;
      }
      socket.emit("driver.location.update", payload);
      return true;
    },
    [],
  );

  return useMemo(
    () => ({
      connected,
      sendLocationUpdate,
    }),
    [connected, sendLocationUpdate],
  );
}
