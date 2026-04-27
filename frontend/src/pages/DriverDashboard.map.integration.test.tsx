import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import DriverDashboard from "./DriverDashboard";
import { useAuth } from "@/contexts/AuthContext";
import {
  estimateDriverGeoRoute,
  getDriverActiveOrderCard,
  getDriverEarningsSummary,
  getDriverOrders,
  getDriverProfile,
  getDriverVehicles,
} from "@/services/driverAppApi";

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
vi.mock("@/services/driverAppApi", () => ({
  getDriverOrders: vi.fn(),
  getDriverActiveOrderCard: vi.fn(),
  getDriverEarningsSummary: vi.fn(),
  getDriverProfile: vi.fn(),
  getDriverVehicles: vi.fn(),
  acceptDriverOrder: vi.fn(),
  startDriverOrder: vi.fn(),
  finishDriverOrder: vi.fn(),
  cancelDriverOrder: vi.fn(),
  updateDriverProfile: vi.fn(),
  estimateDriverGeoRoute: vi.fn(),
}));
vi.mock("@/features/realtime/useDriverRealtime", () => ({
  useDriverRealtime: vi.fn(() => ({
    connected: true,
    sendLocationUpdate: vi.fn(() => true),
  })),
}));

const mockedUseAuth = vi.mocked(useAuth);
const mockedGetDriverOrders = vi.mocked(getDriverOrders);
const mockedGetDriverActiveOrderCard = vi.mocked(getDriverActiveOrderCard);
const mockedGetDriverEarningsSummary = vi.mocked(getDriverEarningsSummary);
const mockedGetDriverProfile = vi.mocked(getDriverProfile);
const mockedGetDriverVehicles = vi.mocked(getDriverVehicles);
const mockedEstimateDriverGeoRoute = vi.mocked(estimateDriverGeoRoute);

function installYmapsMock() {
  const mapInstance = {
    destroy: vi.fn(),
    setCenter: vi.fn(),
    geoObjects: {
      add: vi.fn(),
      remove: vi.fn(),
    },
  };
  (window as unknown as { ymaps: unknown }).ymaps = {
    ready: (cb: () => void) => cb(),
    Map: vi.fn(() => mapInstance),
    Placemark: vi.fn(() => ({})),
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
        <DriverDashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("DriverDashboard map journey integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installYmapsMock();

    mockedUseAuth.mockReturnValue({
      user: { id: "driver-user-1", role: "DRIVER" },
      isAuthenticated: true,
      accessToken: "driver-token",
      login: vi.fn(),
      setSession: vi.fn(),
      logout: vi.fn(),
    });

    mockedGetDriverOrders.mockResolvedValue({
      status: 200,
      body: { items: [] },
    });
    mockedGetDriverEarningsSummary.mockResolvedValue({
      status: 200,
      body: { totals: { totalRub: 0, completedTrips: 0 } },
    });
    mockedGetDriverProfile.mockResolvedValue({
      status: 200,
      body: { firstName: "Driver", lastName: "Test", city: "Moscow" },
    });
    mockedGetDriverVehicles.mockResolvedValue({
      status: 200,
      body: [],
    });
    mockedGetDriverActiveOrderCard.mockResolvedValue({
      status: 200,
      body: {
        activeOrder: {
          id: "order-driver-1",
          status: "ASSIGNED",
          passengerId: "passenger-1",
          from: { lat: 55.751244, lng: 37.618423 },
          to: { lat: 55.761244, lng: 37.628423 },
        },
      },
    });
    mockedEstimateDriverGeoRoute.mockResolvedValue({
      status: 200,
      body: {
        provider: "INTERNAL",
        distanceKm: 3.1,
        estimatedDurationMin: 9,
        fallbackUsed: false,
      },
    });

    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success: (position: GeolocationPosition) => void) =>
          success({
            coords: {
              latitude: 55.741244,
              longitude: 37.608423,
            },
          } as GeolocationPosition),
        ),
        watchPosition: vi.fn(() => 1),
        clearWatch: vi.fn(),
      },
    });
  });

  it("loads active order map journey and updates ETA A->B", async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Данные водителя")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "ETA A→B" }));

    await waitFor(() => {
      expect(mockedEstimateDriverGeoRoute).toHaveBeenCalledWith("driver-token", {
        fromLat: 55.751244,
        fromLng: 37.618423,
        toLat: 55.761244,
        toLng: 37.628423,
      });
    });
  });

  it("builds ETA to pickup after resolving driver geolocation", async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Данные водителя")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Моя позиция" }));
    fireEvent.click(screen.getByRole("button", { name: "ETA до A" }));

    await waitFor(() => {
      expect(mockedEstimateDriverGeoRoute).toHaveBeenCalledWith("driver-token", {
        fromLat: 55.741244,
        fromLng: 37.608423,
        toLat: 55.751244,
        toLng: 37.618423,
      });
    });
  });
});
