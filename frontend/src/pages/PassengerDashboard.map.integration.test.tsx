import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import PassengerDashboard from "./PassengerDashboard";
import { useAuth } from "@/contexts/AuthContext";
import {
  createPassengerOrder,
  estimateGeoRoute,
  estimatePassengerFare,
  getPassengerActiveOrder,
  getPassengerOrders,
  reverseGeocodePoint,
} from "@/services/passengerApi";

vi.mock("@/components/Header", () => ({
  default: () => <div data-testid="header" />,
}));
vi.mock("@/components/Footer", () => ({
  default: () => <div data-testid="footer" />,
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
  roleMatches: (currentRole: string, requiredRole: string) =>
    String(currentRole).toUpperCase() === String(requiredRole).toUpperCase(),
}));
vi.mock("@/services/passengerApi", () => ({
  estimatePassengerFare: vi.fn(),
  createPassengerOrder: vi.fn(),
  cancelPassengerOrder: vi.fn(),
  getPassengerOrders: vi.fn(),
  getPassengerActiveOrder: vi.fn(),
  reverseGeocodePoint: vi.fn(),
  estimateGeoRoute: vi.fn(),
}));
vi.mock("@/features/realtime/usePassengerRealtime", () => ({
  usePassengerRealtime: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);
const mockedGetPassengerOrders = vi.mocked(getPassengerOrders);
const mockedGetPassengerActiveOrder = vi.mocked(getPassengerActiveOrder);
const mockedReverseGeocodePoint = vi.mocked(reverseGeocodePoint);
const mockedEstimateGeoRoute = vi.mocked(estimateGeoRoute);
const mockedCreatePassengerOrder = vi.mocked(createPassengerOrder);
const mockedEstimatePassengerFare = vi.mocked(estimatePassengerFare);

type ClickHandler = (event: { get: (key: "coords") => number[] }) => void;

function installYmapsMock() {
  let clickHandler: ClickHandler | null = null;
  const mapInstance = {
    destroy: vi.fn(),
    geoObjects: {
      add: vi.fn(),
      remove: vi.fn(),
    },
    events: {
      add: vi.fn((_eventName: "click", handler: ClickHandler) => {
        clickHandler = handler;
      }),
    },
  };
  const ymapsMock = {
    ready: (cb: () => void) => cb(),
    Map: vi.fn(() => mapInstance),
    Placemark: vi.fn(() => ({})),
  };
  (window as unknown as { ymaps: unknown }).ymaps = ymapsMock;

  return {
    triggerMapClick(coords: number[]) {
      if (!clickHandler) {
        throw new Error("Map click handler not installed");
      }
      clickHandler({
        get: () => coords,
      });
    },
  };
}

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PassengerDashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PassengerDashboard map journey integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedUseAuth.mockReturnValue({
      user: { id: "passenger-1", role: "PASSENGER" },
      isAuthenticated: true,
      accessToken: "passenger-token",
      login: vi.fn(),
      setSession: vi.fn(),
      logout: vi.fn(),
    });

    mockedGetPassengerOrders.mockResolvedValue({
      status: 200,
      body: { items: [] },
    });
    mockedGetPassengerActiveOrder.mockResolvedValue({
      status: 200,
      body: { activeOrder: null },
    });
    mockedReverseGeocodePoint.mockResolvedValue({
      status: 200,
      body: {
        provider: "INTERNAL",
        normalizedAddress: "Тестовый адрес A",
        fallbackUsed: false,
      },
    });
    mockedEstimateGeoRoute.mockResolvedValue({
      status: 200,
      body: {
        provider: "INTERNAL",
        distanceKm: 2.4,
        estimatedDurationMin: 7,
        fallbackUsed: false,
      },
    });
    mockedEstimatePassengerFare.mockResolvedValue({
      status: 200,
      body: {},
    });
    mockedCreatePassengerOrder.mockResolvedValue({
      status: 200,
      body: { id: "order-1" },
    });
  });

  it("creates order via map-selected points and route estimate", async () => {
    const { triggerMapClick } = installYmapsMock();
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Активная поездка")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Выбрать точку A" }));
    triggerMapClick([55.751244, 37.618423]);
    await waitFor(() => {
      expect(mockedReverseGeocodePoint).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Выбрать точку B" }));
    triggerMapClick([55.761244, 37.628423]);

    await waitFor(() => {
      expect(mockedReverseGeocodePoint).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole("button", { name: "Создать заказ" }));

    await waitFor(() => {
      expect(mockedEstimateGeoRoute).toHaveBeenCalledWith("passenger-token", {
        fromLat: 55.751244,
        fromLng: 37.618423,
        toLat: 55.761244,
        toLng: 37.628423,
      });
      expect(mockedCreatePassengerOrder).toHaveBeenCalled();
    });
  });
});
