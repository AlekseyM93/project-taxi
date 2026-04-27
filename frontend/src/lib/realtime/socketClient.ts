import { io, type Socket } from "socket.io-client";

type Namespace = "/passenger" | "/driver";

type SocketEntry = {
  socket: Socket;
  refs: number;
};

const sockets = new Map<string, SocketEntry>();

function getApiBaseUrl() {
  const envUrl =
    typeof import.meta !== "undefined"
      ? (import.meta.env?.VITE_API_BASE_URL as string | undefined)
      : undefined;
  return (envUrl || "http://localhost:3000").replace(/\/$/, "");
}

function getSocketKey(namespace: Namespace, token: string) {
  return `${namespace}:${token}`;
}

export function acquireRealtimeSocket(namespace: Namespace, token: string) {
  const trimmedToken = token.trim();
  if (!trimmedToken) {
    return null;
  }

  const key = getSocketKey(namespace, trimmedToken);
  const existing = sockets.get(key);
  if (existing) {
    existing.refs += 1;
    if (!existing.socket.connected) {
      existing.socket.connect();
    }
    return existing.socket;
  }

  const socket = io(`${getApiBaseUrl()}${namespace}`, {
    transports: ["websocket"],
    auth: {
      token: trimmedToken,
    },
    autoConnect: true,
  });

  sockets.set(key, { socket, refs: 1 });
  return socket;
}

export function releaseRealtimeSocket(namespace: Namespace, token: string) {
  const trimmedToken = token.trim();
  if (!trimmedToken) {
    return;
  }
  const key = getSocketKey(namespace, trimmedToken);
  const existing = sockets.get(key);
  if (!existing) {
    return;
  }

  existing.refs -= 1;
  if (existing.refs > 0) {
    return;
  }

  existing.socket.removeAllListeners();
  existing.socket.disconnect();
  sockets.delete(key);
}
