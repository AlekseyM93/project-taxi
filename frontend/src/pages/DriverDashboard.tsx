import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Car,
  Clock,
  Locate,
  LogOut,
  MapPin,
  Navigation,
  Save,
} from "lucide-react";
import { roleMatches, useAuth } from "@/contexts/AuthContext";
import {
  acceptDriverOrder,
  cancelDriverOrder,
  finishDriverOrder,
  getDriverActiveOrderCard,
  getDriverEarningsSummary,
  getDriverOrders,
  getDriverProfile,
  getDriverVehicles,
  estimateDriverGeoRoute,
  startDriverOrder,
  updateDriverProfile,
} from "@/services/driverAppApi";
import { useToast } from "@/hooks/use-toast";
import { useDriverRealtime } from "@/features/realtime/useDriverRealtime";

type DriverRecord = Record<string, unknown>;
type GeoPoint = { lat: number; lng: number };
type RealtimeOffer = {
  orderId?: string;
  price?: string;
  queuePosition?: number;
  from?: { lat?: number; lng?: number };
  to?: { lat?: number; lng?: number };
} | null;
type DriverRealtimeLocationPayload = {
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
  clientTs?: string;
  sequence?: number;
};

type YMapsMap = {
  destroy: () => void;
  setCenter: (coords: number[], zoom?: number) => void;
  geoObjects: {
    add: (item: unknown) => void;
    remove: (item: unknown) => void;
  };
};

type YMapsApi = {
  ready: (cb: () => void) => void;
  Map: new (
    element: HTMLElement,
    options: {
      center: number[];
      zoom: number;
      controls: string[];
    },
  ) => YMapsMap;
  Placemark: new (
    coords: number[],
    properties?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => unknown;
};

declare global {
  interface Window {
    ymaps?: YMapsApi;
  }
}

function readText(row: DriverRecord, key: string, fallback = "-") {
  const value = row[key];
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return String(value);
}

function parseGeoPoint(value: unknown): GeoPoint | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const lat = Number((value as { lat?: unknown }).lat);
  const lng = Number((value as { lng?: unknown }).lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return { lat, lng };
}

const DriverDashboard = () => {
  const { user, logout, accessToken } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [city, setCity] = useState("");
  const [driverPosition, setDriverPosition] = useState<GeoPoint | null>(null);
  const [driverLocating, setDriverLocating] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [pickupRouteInfo, setPickupRouteInfo] = useState<{
    distanceKm: number;
    estimatedDurationMin: number;
    fallbackUsed?: boolean;
  } | null>(null);
  const [tripRouteInfo, setTripRouteInfo] = useState<{
    distanceKm: number;
    estimatedDurationMin: number;
    fallbackUsed?: boolean;
  } | null>(null);
  const [realtimeOffer, setRealtimeOffer] = useState<RealtimeOffer>(null);
  const [realtimeLastEventAt, setRealtimeLastEventAt] = useState<string | null>(
    null,
  );
  const [autoTrackingEnabled, setAutoTrackingEnabled] = useState(true);
  const [liveRouteEnabled, setLiveRouteEnabled] = useState(true);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<YMapsMap | null>(null);
  const driverPlacemarkRef = useRef<unknown | null>(null);
  const pickupPlacemarkRef = useRef<unknown | null>(null);
  const dropoffPlacemarkRef = useRef<unknown | null>(null);
  const locationWatchIdRef = useRef<number | null>(null);
  const locationSequenceRef = useRef(0);
  const lastAutoEtaAtRef = useRef(0);

  useEffect(() => {
    if (!user || !roleMatches(user.role, "DRIVER")) {
      navigate("/login", { replace: true });
    }
  }, [navigate, user]);

  const ordersQuery = useQuery({
    queryKey: ["driver-orders"],
    queryFn: () => getDriverOrders(accessToken || "", "limit=30"),
    enabled: !!accessToken && !!user && roleMatches(user.role, "DRIVER"),
  });

  const activeOrderCardQuery = useQuery({
    queryKey: ["driver-active-card"],
    queryFn: () => getDriverActiveOrderCard(accessToken || ""),
    enabled: !!accessToken && !!user && roleMatches(user.role, "DRIVER"),
  });

  const earningsQuery = useQuery({
    queryKey: ["driver-earnings"],
    queryFn: () => getDriverEarningsSummary(accessToken || ""),
    enabled: !!accessToken && !!user && roleMatches(user.role, "DRIVER"),
  });

  const profileQuery = useQuery({
    queryKey: ["driver-profile"],
    queryFn: () => getDriverProfile(accessToken || ""),
    enabled: !!accessToken && !!user && roleMatches(user.role, "DRIVER"),
  });

  const vehiclesQuery = useQuery({
    queryKey: ["driver-vehicles"],
    queryFn: () => getDriverVehicles(accessToken || ""),
    enabled: !!accessToken && !!user && roleMatches(user.role, "DRIVER"),
  });

  useEffect(() => {
    const profile =
      (profileQuery.data?.body as DriverRecord | undefined) || null;
    if (!profile) {
      return;
    }
    setFirstName(readText(profile, "firstName", ""));
    setLastName(readText(profile, "lastName", ""));
    setCity(readText(profile, "city", ""));
  }, [profileQuery.data]);

  const updateProfileMutation = useMutation({
    mutationFn: () =>
      updateDriverProfile(accessToken || "", {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        city: city.trim() || null,
      }),
    onSuccess: () => {
      toast({ title: "Профиль водителя обновлен" });
      queryClient.invalidateQueries({ queryKey: ["driver-profile"] });
    },
  });

  const driverActionMutation = useMutation({
    mutationFn: (params: {
      action: "accept" | "start" | "finish" | "cancel";
      orderId: string;
    }) => {
      if (params.action === "accept") {
        return acceptDriverOrder(accessToken || "", params.orderId);
      }
      if (params.action === "start") {
        return startDriverOrder(accessToken || "", params.orderId);
      }
      if (params.action === "finish") {
        return finishDriverOrder(accessToken || "", params.orderId);
      }
      return cancelDriverOrder(accessToken || "", params.orderId);
    },
    onSuccess: (response) => {
      toast({
        title:
          response.status < 300
            ? "Действие выполнено"
            : "Не удалось выполнить действие",
      });
      queryClient.invalidateQueries({ queryKey: ["driver-active-card"] });
      queryClient.invalidateQueries({ queryKey: ["driver-orders"] });
    },
  });

  const orders = useMemo(() => {
    const body = ordersQuery.data?.body as
      | { items?: DriverRecord[] }
      | undefined;
    return Array.isArray(body?.items) ? body.items : [];
  }, [ordersQuery.data]);

  const earnings = useMemo(() => {
    const body = earningsQuery.data?.body as
      | { totals?: { totalRub?: number; completedTrips?: number } }
      | undefined;
    return {
      totalRub: body?.totals?.totalRub ?? 0,
      completedTrips: body?.totals?.completedTrips ?? 0,
    };
  }, [earningsQuery.data]);

  const vehicles = useMemo(() => {
    const body = vehiclesQuery.data?.body;
    return Array.isArray(body) ? (body as DriverRecord[]) : [];
  }, [vehiclesQuery.data]);

  const activeCard = useMemo(() => {
    const body = activeOrderCardQuery.data?.body as DriverRecord | undefined;
    return (body?.activeOrder as DriverRecord | null | undefined) ?? null;
  }, [activeOrderCardQuery.data]);

  const activeOrderId = useMemo(
    () => (activeCard ? readText(activeCard, "id", "") : ""),
    [activeCard],
  );
  const pickupPoint = useMemo(
    () => parseGeoPoint(activeCard?.from),
    [activeCard],
  );
  const dropoffPoint = useMemo(
    () => parseGeoPoint(activeCard?.to),
    [activeCard],
  );
  const activeStatus = useMemo(
    () => (activeCard ? readText(activeCard, "status", "") : ""),
    [activeCard],
  );

  const handleRealtimeOffer = useCallback((payload: RealtimeOffer) => {
    setRealtimeOffer(payload);
    setRealtimeLastEventAt(new Date().toISOString());
  }, []);

  const driverRealtime = useDriverRealtime({
    token: accessToken || null,
    onOffer: handleRealtimeOffer,
  });
  const sendDriverRealtimeLocationUpdate = driverRealtime.sendLocationUpdate;

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const routeEstimateMutation = useMutation({
    mutationFn: (params: {
      fromLat: number;
      fromLng: number;
      toLat: number;
      toLng: number;
    }) => estimateDriverGeoRoute(accessToken || "", params),
  });

  const estimateTripRoute = useCallback(async () => {
    if (!pickupPoint || !dropoffPoint) {
      setMapError("Нет координат заказа для построения маршрута.");
      return;
    }
    const response = await routeEstimateMutation.mutateAsync({
      fromLat: pickupPoint.lat,
      fromLng: pickupPoint.lng,
      toLat: dropoffPoint.lat,
      toLng: dropoffPoint.lng,
    });
    if (response.status >= 300) {
      setTripRouteInfo(null);
      setMapError("Не удалось обновить ETA по поездке.");
      return;
    }
    if (
      typeof response.body.distanceKm !== "number" ||
      typeof response.body.estimatedDurationMin !== "number"
    ) {
      setTripRouteInfo(null);
      setMapError("Маршрут по поездке вернул неполные данные.");
      return;
    }
    setMapError(null);
    setTripRouteInfo({
      distanceKm: response.body.distanceKm,
      estimatedDurationMin: response.body.estimatedDurationMin,
      fallbackUsed: response.body.fallbackUsed,
    });
  }, [dropoffPoint, pickupPoint, routeEstimateMutation]);

  const estimatePickupRoute = useCallback(async () => {
    if (!driverPosition || !pickupPoint) {
      setMapError("Определите позицию водителя и активный pickup.");
      return;
    }
    const response = await routeEstimateMutation.mutateAsync({
      fromLat: driverPosition.lat,
      fromLng: driverPosition.lng,
      toLat: pickupPoint.lat,
      toLng: pickupPoint.lng,
    });
    if (response.status >= 300) {
      setPickupRouteInfo(null);
      setMapError("Не удалось обновить ETA до точки A.");
      return;
    }
    if (
      typeof response.body.distanceKm !== "number" ||
      typeof response.body.estimatedDurationMin !== "number"
    ) {
      setPickupRouteInfo(null);
      setMapError("Маршрут до точки A вернул неполные данные.");
      return;
    }
    setMapError(null);
    setPickupRouteInfo({
      distanceKm: response.body.distanceKm,
      estimatedDurationMin: response.body.estimatedDurationMin,
      fallbackUsed: response.body.fallbackUsed,
    });
  }, [driverPosition, pickupPoint, routeEstimateMutation]);

  const pushRealtimeLocationUpdate = useCallback(
    (point: GeoPoint, extra?: { heading?: number; speed?: number; accuracy?: number }) => {
      const nextSequence = locationSequenceRef.current + 1;
      locationSequenceRef.current = nextSequence;
      const payload: DriverRealtimeLocationPayload = {
        lat: point.lat,
        lng: point.lng,
        heading: extra?.heading,
        speed: extra?.speed,
        accuracy: extra?.accuracy,
        clientTs: new Date().toISOString(),
        sequence: nextSequence,
      };
      const sent = sendDriverRealtimeLocationUpdate(payload);
      if (sent) {
        setRealtimeLastEventAt(new Date().toISOString());
      }
    },
    [sendDriverRealtimeLocationUpdate],
  );

  const handleLocateDriver = () => {
    if (!navigator.geolocation) {
      setMapError("Геолокация в браузере недоступна.");
      return;
    }
    setDriverLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextPoint = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setDriverPosition(nextPoint);
        pushRealtimeLocationUpdate(nextPoint, {
          heading:
            typeof position.coords.heading === "number"
              ? position.coords.heading
              : undefined,
          speed:
            typeof position.coords.speed === "number"
              ? position.coords.speed
              : undefined,
          accuracy:
            typeof position.coords.accuracy === "number"
              ? position.coords.accuracy
              : undefined,
        });
        setDriverLocating(false);
        setMapError(null);
        if (mapRef.current) {
          mapRef.current.setCenter([nextPoint.lat, nextPoint.lng], 13);
        }
      },
      () => {
        setDriverLocating(false);
        setMapError("Не удалось определить позицию водителя.");
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  useEffect(() => {
    if (!autoTrackingEnabled || !activeOrderId) {
      if (
        locationWatchIdRef.current !== null &&
        typeof navigator !== "undefined" &&
        navigator.geolocation &&
        typeof navigator.geolocation.clearWatch === "function"
      ) {
        navigator.geolocation.clearWatch(locationWatchIdRef.current);
      }
      locationWatchIdRef.current = null;
      return;
    }
    if (
      !navigator.geolocation ||
      typeof navigator.geolocation.watchPosition !== "function" ||
      typeof navigator.geolocation.clearWatch !== "function"
    ) {
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const nextPoint = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setDriverPosition(nextPoint);
        pushRealtimeLocationUpdate(nextPoint, {
          heading:
            typeof position.coords.heading === "number"
              ? position.coords.heading
              : undefined,
          speed:
            typeof position.coords.speed === "number"
              ? position.coords.speed
              : undefined,
          accuracy:
            typeof position.coords.accuracy === "number"
              ? position.coords.accuracy
              : undefined,
        });
      },
      () => {
        setMapError("Live tracking временно недоступен (геолокация).");
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 },
    );
    locationWatchIdRef.current = watchId;
    return () => {
      navigator.geolocation.clearWatch(watchId);
      if (locationWatchIdRef.current === watchId) {
        locationWatchIdRef.current = null;
      }
    };
  }, [activeOrderId, autoTrackingEnabled, pushRealtimeLocationUpdate]);

  useEffect(() => {
    if (!mapContainerRef.current) {
      return;
    }
    if (!window.ymaps) {
      setMapError("Карта недоступна. ETA можно считать только через API.");
      return;
    }
    window.ymaps.ready(() => {
      if (!mapContainerRef.current || mapRef.current) {
        return;
      }
      mapRef.current = new window.ymaps!.Map(mapContainerRef.current, {
        center: [55.751244, 37.618423],
        zoom: 11,
        controls: ["zoomControl", "fullscreenControl"],
      });
      setMapReady(true);
    });
    return () => {
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setPickupRouteInfo(null);
    setTripRouteInfo(null);
  }, [activeOrderId]);

  useEffect(() => {
    if (!mapRef.current || !window.ymaps) {
      return;
    }
    if (pickupPlacemarkRef.current) {
      mapRef.current.geoObjects.remove(pickupPlacemarkRef.current);
      pickupPlacemarkRef.current = null;
    }
    if (dropoffPlacemarkRef.current) {
      mapRef.current.geoObjects.remove(dropoffPlacemarkRef.current);
      dropoffPlacemarkRef.current = null;
    }
    if (pickupPoint) {
      pickupPlacemarkRef.current = new window.ymaps.Placemark(
        [pickupPoint.lat, pickupPoint.lng],
        { balloonContent: "Точка A (pickup)" },
        { preset: "islands#greenDotIcon" },
      );
      mapRef.current.geoObjects.add(pickupPlacemarkRef.current);
    }
    if (dropoffPoint) {
      dropoffPlacemarkRef.current = new window.ymaps.Placemark(
        [dropoffPoint.lat, dropoffPoint.lng],
        { balloonContent: "Точка B (dropoff)" },
        { preset: "islands#redDotIcon" },
      );
      mapRef.current.geoObjects.add(dropoffPlacemarkRef.current);
    }
  }, [pickupPoint, dropoffPoint]);

  useEffect(() => {
    if (!mapRef.current || !window.ymaps) {
      return;
    }
    if (driverPlacemarkRef.current) {
      mapRef.current.geoObjects.remove(driverPlacemarkRef.current);
      driverPlacemarkRef.current = null;
    }
    if (!driverPosition) {
      return;
    }
    driverPlacemarkRef.current = new window.ymaps.Placemark(
      [driverPosition.lat, driverPosition.lng],
      { balloonContent: "Водитель" },
      { preset: "islands#blueDotIcon" },
    );
    mapRef.current.geoObjects.add(driverPlacemarkRef.current);
  }, [driverPosition]);

  useEffect(() => {
    if (!activeOrderId || !pickupPoint || !dropoffPoint) {
      return;
    }
    void estimateTripRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrderId, pickupPoint, dropoffPoint]);

  useEffect(() => {
    if (!liveRouteEnabled || activeStatus !== "ASSIGNED" || !driverPosition || !pickupPoint) {
      return;
    }
    const now = Date.now();
    if (now - lastAutoEtaAtRef.current < 8000) {
      return;
    }
    lastAutoEtaAtRef.current = now;
    void estimatePickupRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStatus, driverPosition, liveRouteEnabled, pickupPoint]);

  if (!user || !roleMatches(user.role, "DRIVER")) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pb-16 pt-24">
        <div className="container mx-auto px-4">
          <div className="mb-8 flex items-center justify-between">
            <h1 className="font-display text-3xl font-bold text-foreground md:text-4xl">
              Кабинет <span className="gold-text">водителя</span>
            </h1>
            <Button
              variant="outline"
              onClick={handleLogout}
              className="border-border text-muted-foreground"
            >
              <LogOut className="mr-2 h-4 w-4" /> Выйти
            </Button>
          </div>

          <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3">
            <Card className="border-border bg-card">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-primary">
                  {earnings.completedTrips}
                </p>
                <p className="text-xs text-muted-foreground">
                  Выполнено поездок
                </p>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-primary">
                  {Math.round(earnings.totalRub)} ₽
                </p>
                <p className="text-xs text-muted-foreground">Заработано</p>
              </CardContent>
            </Card>
            <Card className="hidden border-border bg-card md:block">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-primary">
                  {orders.length}
                </p>
                <p className="text-xs text-muted-foreground">
                  Записей в истории
                </p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="profile" className="space-y-6">
            <TabsList className="bg-secondary">
              <TabsTrigger value="profile">Профиль и авто</TabsTrigger>
              <TabsTrigger value="history">История заказов</TabsTrigger>
            </TabsList>

            <TabsContent value="profile">
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Car className="h-5 w-5 text-primary" /> Данные водителя
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Имя
                      </Label>
                      <Input
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="border-border bg-secondary/50"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Фамилия
                      </Label>
                      <Input
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="border-border bg-secondary/50"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Город
                      </Label>
                      <Input
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="border-border bg-secondary/50"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">Активный заказ</p>
                    {!activeCard && realtimeOffer?.orderId ? (
                      <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
                        Новый realtime оффер: {realtimeOffer.orderId}
                        {realtimeOffer.price ? ` • ${realtimeOffer.price} ₽` : ""}
                        {typeof realtimeOffer.queuePosition === "number"
                          ? ` • позиция ${realtimeOffer.queuePosition}`
                          : ""}
                      </div>
                    ) : null}
                    {activeOrderCardQuery.isLoading ? (
                      <p className="text-sm text-muted-foreground">
                        Загрузка активного заказа...
                      </p>
                    ) : !activeCard ? (
                      <p className="text-sm text-muted-foreground">
                        Активного заказа нет.
                      </p>
                    ) : (
                      <div className="rounded-md border border-border p-3 text-sm">
                        <p>ID: {activeOrderId || "-"}</p>
                        <p>Статус: {readText(activeCard, "status")}</p>
                        <p>Пассажир: {readText(activeCard, "passengerId")}</p>
                        <p>
                          A:{" "}
                          {pickupPoint
                            ? `${pickupPoint.lat.toFixed(5)}, ${pickupPoint.lng.toFixed(5)}`
                            : "-"}
                        </p>
                        <p>
                          B:{" "}
                          {dropoffPoint
                            ? `${dropoffPoint.lat.toFixed(5)}, ${dropoffPoint.lng.toFixed(5)}`
                            : "-"}
                        </p>
                        <div className="mt-3 rounded-md border border-border/60 p-2">
                          <div className="mb-2 rounded-md border border-border/40 p-2 text-xs text-muted-foreground">
                            Realtime:{" "}
                            <Badge variant={driverRealtime.connected ? "default" : "outline"}>
                              {driverRealtime.connected ? "online" : "offline"}
                            </Badge>
                            {realtimeLastEventAt ? ` • last: ${realtimeLastEventAt}` : ""}
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setAutoTrackingEnabled((prev) => !prev)}
                              >
                                {autoTrackingEnabled
                                  ? "Отключить live tracking"
                                  : "Включить live tracking"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setLiveRouteEnabled((prev) => !prev)}
                              >
                                {liveRouteEnabled
                                  ? "Отключить live ETA"
                                  : "Включить live ETA"}
                              </Button>
                            </div>
                          </div>
                          <div className="mb-2 flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleLocateDriver}
                              disabled={driverLocating}
                            >
                              <Locate className="mr-1 h-4 w-4" />
                              {driverLocating
                                ? "Определяем позицию..."
                                : "Моя позиция"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void estimatePickupRoute()}
                              disabled={
                                routeEstimateMutation.isPending ||
                                !driverPosition ||
                                !pickupPoint
                              }
                            >
                              <Navigation className="mr-1 h-4 w-4" />
                              ETA до A
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void estimateTripRoute()}
                              disabled={
                                routeEstimateMutation.isPending ||
                                !pickupPoint ||
                                !dropoffPoint
                              }
                            >
                              <Navigation className="mr-1 h-4 w-4" />
                              ETA A→B
                            </Button>
                          </div>
                          <div
                            ref={mapContainerRef}
                            className="h-52 w-full rounded-md border border-border/50"
                          />
                          <p className="mt-2 text-xs text-muted-foreground">
                            {mapReady
                              ? "Синий маркер — водитель, зеленый — pickup, красный — dropoff."
                              : "Инициализация карты..."}
                          </p>
                          {mapError ? (
                            <p className="mt-2 flex items-center gap-1 text-xs text-amber-600">
                              <AlertTriangle className="h-3 w-3" />
                              {mapError}
                            </p>
                          ) : null}
                          {pickupRouteInfo ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              До точки A: {pickupRouteInfo.distanceKm.toFixed(2)} км •{" "}
                              {pickupRouteInfo.estimatedDurationMin} мин
                              {pickupRouteInfo.fallbackUsed ? " (fallback)" : ""}
                            </p>
                          ) : null}
                          {tripRouteInfo ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Поездка A→B: {tripRouteInfo.distanceKm.toFixed(2)} км •{" "}
                              {tripRouteInfo.estimatedDurationMin} мин
                              {tripRouteInfo.fallbackUsed ? " (fallback)" : ""}
                            </p>
                          ) : null}
                          {activeStatus === "ASSIGNED" && !pickupRouteInfo ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Для старта поездки обновите "ETA до A".
                            </p>
                          ) : null}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              driverActionMutation.mutate({
                                action: "accept",
                                orderId: activeOrderId,
                              })
                            }
                            disabled={
                              driverActionMutation.isPending || !activeOrderId
                            }
                          >
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            onClick={() =>
                              driverActionMutation.mutate({
                                action: "start",
                                orderId: activeOrderId,
                              })
                            }
                            disabled={
                              driverActionMutation.isPending || !activeOrderId
                            }
                          >
                            Start
                          </Button>
                          <Button
                            size="sm"
                            onClick={() =>
                              driverActionMutation.mutate({
                                action: "finish",
                                orderId: activeOrderId,
                              })
                            }
                            disabled={
                              driverActionMutation.isPending || !activeOrderId
                            }
                          >
                            Finish
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() =>
                              driverActionMutation.mutate({
                                action: "cancel",
                                orderId: activeOrderId,
                              })
                            }
                            disabled={
                              driverActionMutation.isPending || !activeOrderId
                            }
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                    <p className="text-sm font-medium">Активные автомобили</p>
                    {vehiclesQuery.isLoading ? (
                      <p className="text-sm text-muted-foreground">
                        Загрузка автомобилей...
                      </p>
                    ) : vehicles.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Автомобили не найдены.
                      </p>
                    ) : (
                      vehicles.map((vehicle) => (
                        <div
                          key={readText(vehicle, "id")}
                          className="rounded-md border border-border p-3 text-sm"
                        >
                          <p>
                            {readText(vehicle, "brand")}{" "}
                            {readText(vehicle, "model")} •{" "}
                            {readText(vehicle, "plateNumber")}
                          </p>
                          <p className="text-muted-foreground">
                            Цвет: {readText(vehicle, "color")} • Активен:{" "}
                            {readText(vehicle, "isActive", "false")}
                          </p>
                        </div>
                      ))
                    )}
                  </div>

                  <Button
                    onClick={() => updateProfileMutation.mutate()}
                    disabled={updateProfileMutation.isPending}
                    className="gold-gradient border-0 text-primary-foreground"
                  >
                    <Save className="mr-1 h-4 w-4" /> Сохранить
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history" className="space-y-4">
              {ordersQuery.isLoading ? (
                <Card className="border-border bg-card">
                  <CardContent className="p-4 text-sm text-muted-foreground">
                    Загрузка истории...
                  </CardContent>
                </Card>
              ) : orders.length === 0 ? (
                <Card className="border-border bg-card">
                  <CardContent className="p-4 text-sm text-muted-foreground">
                    История заказов пуста.
                  </CardContent>
                </Card>
              ) : (
                orders.map((order) => (
                  <Card
                    key={readText(order, "id")}
                    className="border-border bg-card"
                  >
                    <CardContent className="p-4">
                      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              {readText(order, "status")}
                            </Badge>
                            <span className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Clock className="h-3 w-3" />{" "}
                              {readText(order, "createdAt")}
                            </span>
                          </div>
                          <p className="flex items-center gap-1 font-medium text-foreground">
                            <MapPin className="h-4 w-4 text-primary" />{" "}
                            {readText(order, "id")}
                          </p>
                        </div>
                        <p className="text-lg font-bold text-primary">
                          {readText(order, "price")} ₽
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default DriverDashboard;
