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
import { AlertTriangle, Clock, LogOut, MapPin, Navigation, User } from "lucide-react";
import { roleMatches, useAuth } from "@/contexts/AuthContext";
import {
  cancelPassengerOrder,
  createPassengerOrder,
  estimateGeoRoute,
  estimatePassengerFare,
  getPassengerActiveOrder,
  getPassengerOrders,
  reverseGeocodePoint,
} from "@/services/passengerApi";
import { useToast } from "@/hooks/use-toast";
import { usePassengerRealtime } from "@/features/realtime/usePassengerRealtime";

type OrderLike = Record<string, unknown>;
type GeoPoint = { lat: number; lng: number };

type YMapsMap = {
  destroy: () => void;
  geoObjects: {
    add: (item: unknown) => void;
    remove: (item: unknown) => void;
  };
  events: {
    add: (
      eventName: "click",
      handler: (event: { get: (key: "coords") => number[] | undefined }) => void,
    ) => void;
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
  Placemark: new (coords: number[], properties?: Record<string, unknown>, options?: Record<string, unknown>) => unknown;
};

declare global {
  interface Window {
    ymaps?: YMapsApi;
  }
}

function readText(order: OrderLike, key: string, fallback = "-") {
  const value = order[key];
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return String(value);
}

function readNumber(order: OrderLike, key: string) {
  const value = order[key];
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function parseCoordinate(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isLatitudeValid(value: number) {
  return value >= -90 && value <= 90;
}

function isLongitudeValid(value: number) {
  return value >= -180 && value <= 180;
}

const PassengerDashboard = () => {
  const { user, logout, accessToken } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [fromAddress, setFromAddress] = useState("Точка A");
  const [toAddress, setToAddress] = useState("Точка B");
  const [fromLat, setFromLat] = useState("55.751244");
  const [fromLng, setFromLng] = useState("37.618423");
  const [toLat, setToLat] = useState("55.761244");
  const [toLng, setToLng] = useState("37.628423");
  const [waitingSeconds, setWaitingSeconds] = useState("0");
  const [extraStopsCount, setExtraStopsCount] = useState("0");
  const [outOfCityKm, setOutOfCityKm] = useState("0");
  const [mapPickMode, setMapPickMode] = useState<"from" | "to">("from");
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [routePreview, setRoutePreview] = useState<{
    distanceKm: number;
    estimatedDurationMin: number;
    provider: string;
    fallbackUsed?: boolean;
  } | null>(null);
  const [driverLiveLocation, setDriverLiveLocation] = useState<GeoPoint | null>(
    null,
  );
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<string | null>(null);
  const [lastRealtimeAt, setLastRealtimeAt] = useState<string | null>(null);
  const [followDriverOnMap, setFollowDriverOnMap] = useState(true);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<YMapsMap | null>(null);
  const fromPlacemarkRef = useRef<unknown | null>(null);
  const toPlacemarkRef = useRef<unknown | null>(null);
  const driverPlacemarkRef = useRef<unknown | null>(null);
  const mapPickModeRef = useRef<"from" | "to">("from");

  useEffect(() => {
    if (!user || !roleMatches(user.role, "PASSENGER")) {
      navigate("/login", { replace: true });
    }
  }, [navigate, user]);

  const historyQuery = useQuery({
    queryKey: ["passenger-orders"],
    queryFn: () => getPassengerOrders(accessToken || "", "limit=30"),
    enabled: !!accessToken && !!user && roleMatches(user.role, "PASSENGER"),
  });

  const activeQuery = useQuery({
    queryKey: ["passenger-active-order"],
    queryFn: () => getPassengerActiveOrder(accessToken || ""),
    enabled: !!accessToken && !!user && roleMatches(user.role, "PASSENGER"),
  });

  const orders = useMemo(() => {
    const items = (
      historyQuery.data?.body as { items?: OrderLike[] } | undefined
    )?.items;
    return Array.isArray(items) ? items : [];
  }, [historyQuery.data]);

  const activeOrder = useMemo(() => {
    const data = activeQuery.data?.body as
      | { activeOrder?: OrderLike | null }
      | undefined;
    return data?.activeOrder ?? null;
  }, [activeQuery.data]);
  const activeOrderId = useMemo(
    () => (activeOrder?.id ? String(activeOrder.id) : null),
    [activeOrder],
  );

  const totalSpent = useMemo(
    () =>
      orders
        .filter((order) => readText(order, "status") === "DONE")
        .reduce((sum, order) => sum + readNumber(order, "price"), 0),
    [orders],
  );

  const handleDriverLocation = useCallback((location: GeoPoint | null) => {
    setDriverLiveLocation(location);
    setLastRealtimeAt(new Date().toISOString());
  }, []);

  const handleRealtimeStatus = useCallback((status: string | null) => {
    if (status) {
      setRealtimeStatus(status);
      setLastRealtimeAt(new Date().toISOString());
    }
  }, []);

  usePassengerRealtime({
    token: accessToken || null,
    activeOrderId,
    onDriverLocation: handleDriverLocation,
    onConnectionStateChange: setRealtimeConnected,
    onOrderStatus: handleRealtimeStatus,
  });

  const parsedCoordinates = useMemo(() => {
    const fromLatNumber = parseCoordinate(fromLat);
    const fromLngNumber = parseCoordinate(fromLng);
    const toLatNumber = parseCoordinate(toLat);
    const toLngNumber = parseCoordinate(toLng);
    if (
      fromLatNumber === null ||
      fromLngNumber === null ||
      toLatNumber === null ||
      toLngNumber === null
    ) {
      return { valid: false as const, message: "Заполните корректные координаты A и B." };
    }
    if (
      !isLatitudeValid(fromLatNumber) ||
      !isLatitudeValid(toLatNumber) ||
      !isLongitudeValid(fromLngNumber) ||
      !isLongitudeValid(toLngNumber)
    ) {
      return {
        valid: false as const,
        message: "Координаты вне диапазона: lat [-90..90], lng [-180..180].",
      };
    }
    if (
      Math.abs(fromLatNumber - toLatNumber) < 0.000001 &&
      Math.abs(fromLngNumber - toLngNumber) < 0.000001
    ) {
      return {
        valid: false as const,
        message: "Точки A и B совпадают, выберите разные точки маршрута.",
      };
    }
    return {
      valid: true as const,
      fromLat: fromLatNumber,
      fromLng: fromLngNumber,
      toLat: toLatNumber,
      toLng: toLngNumber,
    };
  }, [fromLat, fromLng, toLat, toLng]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const estimateMutation = useMutation({
    mutationFn: () =>
      parsedCoordinates.valid
        ? estimatePassengerFare(accessToken || "", {
            fromLat: parsedCoordinates.fromLat,
            fromLng: parsedCoordinates.fromLng,
            toLat: parsedCoordinates.toLat,
            toLng: parsedCoordinates.toLng,
            serviceLevel: "ECONOMY",
            waitingSeconds: Number(waitingSeconds),
            extraStopsCount: Number(extraStopsCount),
            outOfCityKm: Number(outOfCityKm),
          })
        : Promise.resolve({
            status: 400,
            body: {
              code: "INVALID_COORDINATES",
              message: parsedCoordinates.message,
            },
          }),
    onSuccess: (response) => {
      if (response.status >= 300) {
        setMapError("Тариф не рассчитан: проверьте точки маршрута.");
      }
      toast({
        title:
          response.status < 300
            ? "Оценка тарифа рассчитана"
            : "Не удалось рассчитать тариф",
      });
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: () =>
      parsedCoordinates.valid
        ? createPassengerOrder(accessToken || "", {
            fromLat: parsedCoordinates.fromLat,
            fromLng: parsedCoordinates.fromLng,
            toLat: parsedCoordinates.toLat,
            toLng: parsedCoordinates.toLng,
            serviceLevel: "ECONOMY",
            waitingSeconds: Number(waitingSeconds),
            extraStopsCount: Number(extraStopsCount),
            outOfCityKm: Number(outOfCityKm),
          })
        : Promise.resolve({
            status: 400,
            body: {
              code: "INVALID_COORDINATES",
              message: parsedCoordinates.message,
            },
          }),
    onSuccess: (response) => {
      if (response.status >= 300) {
        setMapError("Заказ не создан: сначала выберите валидные точки маршрута.");
      }
      toast({
        title:
          response.status < 300 ? "Заказ создан" : "Не удалось создать заказ",
      });
      queryClient.invalidateQueries({ queryKey: ["passenger-orders"] });
      queryClient.invalidateQueries({ queryKey: ["passenger-active-order"] });
    },
  });

  const cancelOrderMutation = useMutation({
    mutationFn: (orderId: string) =>
      cancelPassengerOrder(accessToken || "", orderId),
    onSuccess: (response) => {
      toast({
        title:
          response.status < 300 ? "Заказ отменен" : "Не удалось отменить заказ",
      });
      queryClient.invalidateQueries({ queryKey: ["passenger-orders"] });
      queryClient.invalidateQueries({ queryKey: ["passenger-active-order"] });
    },
  });

  const reverseGeoMutation = useMutation({
    mutationFn: (params: { lat: number; lng: number }) =>
      reverseGeocodePoint(accessToken || "", params),
  });

  const routeEstimateMutation = useMutation({
    mutationFn: (params: {
      fromLat: number;
      fromLng: number;
      toLat: number;
      toLng: number;
    }) =>
      estimateGeoRoute(accessToken || "", params),
    onSuccess: (response) => {
      if (response.status >= 300) {
        setRoutePreview(null);
        setMapError("Маршрут не рассчитан. Проверьте координаты или попробуйте позже.");
        return;
      }
      const body = response.body;
      const distanceKm =
        typeof body.distanceKm === "number" ? body.distanceKm : Number.NaN;
      const estimatedDurationMin =
        typeof body.estimatedDurationMin === "number"
          ? body.estimatedDurationMin
          : Number.NaN;
      if (!Number.isFinite(distanceKm) || !Number.isFinite(estimatedDurationMin)) {
        setMapError("Ответ маршрута неполный, используйте ручной расчет.");
        setRoutePreview(null);
        return;
      }
      setMapError(null);
      setRoutePreview({
        distanceKm,
        estimatedDurationMin,
        provider: body.provider || "UNKNOWN",
        fallbackUsed: body.fallbackUsed,
      });
    },
  });

  const ensureRouteEstimate = async () => {
    if (!parsedCoordinates.valid) {
      setMapError(parsedCoordinates.message);
      return false;
    }
    const response = await routeEstimateMutation.mutateAsync({
      fromLat: parsedCoordinates.fromLat,
      fromLng: parsedCoordinates.fromLng,
      toLat: parsedCoordinates.toLat,
      toLng: parsedCoordinates.toLng,
    });
    return response.status < 300;
  };

  const handleEstimateFare = async () => {
    const routeReady = await ensureRouteEstimate();
    if (!routeReady) {
      toast({ title: "Сначала проверьте точки маршрута и расчет времени." });
      return;
    }
    estimateMutation.mutate();
  };

  const handleCreateOrder = async () => {
    const routeReady = await ensureRouteEstimate();
    if (!routeReady) {
      toast({ title: "Невозможно создать заказ без валидного маршрута." });
      return;
    }
    createOrderMutation.mutate();
  };

  useEffect(() => {
    mapPickModeRef.current = mapPickMode;
  }, [mapPickMode]);

  useEffect(() => {
    setRoutePreview(null);
  }, [fromLat, fromLng, toLat, toLng]);

  useEffect(() => {
    if (!activeOrderId) {
      setDriverLiveLocation(null);
      setRealtimeStatus(null);
      setLastRealtimeAt(null);
    }
  }, [activeOrderId]);

  useEffect(() => {
    if (!mapContainerRef.current) {
      return;
    }
    if (!window.ymaps) {
      setMapError("Карта недоступна. Используйте ручной ввод координат.");
      return;
    }
    window.ymaps.ready(() => {
      if (!mapContainerRef.current || mapRef.current) {
        return;
      }
      const map = new window.ymaps!.Map(mapContainerRef.current, {
        center: [55.751244, 37.618423],
        zoom: 11,
        controls: ["zoomControl", "fullscreenControl"],
      });
      map.events.add("click", async (event) => {
        const coords = event?.get?.("coords") as number[] | undefined;
        if (!Array.isArray(coords) || coords.length < 2) {
          return;
        }
        const [lat, lng] = coords;
        if (mapPickModeRef.current === "from") {
          setFromLat(lat.toFixed(6));
          setFromLng(lng.toFixed(6));
        } else {
          setToLat(lat.toFixed(6));
          setToLng(lng.toFixed(6));
        }
        try {
          const reverse = await reverseGeoMutation.mutateAsync({ lat, lng });
          if (reverse.status < 300 && reverse.body?.normalizedAddress) {
            if (mapPickModeRef.current === "from") {
              setFromAddress(reverse.body.normalizedAddress);
            } else {
              setToAddress(reverse.body.normalizedAddress);
            }
            if (reverse.body.fallbackUsed) {
              setMapError("Geo fallback активирован: отображены приближенные данные.");
            } else {
              setMapError(null);
            }
          }
        } catch {
          setMapError("Не удалось получить адрес точки. Координаты обновлены вручную.");
        }
      });
      mapRef.current = map;
      setMapReady(true);
    });
    return () => {
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, [reverseGeoMutation]);

  useEffect(() => {
    if (!mapRef.current || !window.ymaps) {
      return;
    }
    const fromLatNumber = parseCoordinate(fromLat);
    const fromLngNumber = parseCoordinate(fromLng);
    if (fromLatNumber !== null && fromLngNumber !== null) {
      if (fromPlacemarkRef.current) {
        mapRef.current.geoObjects.remove(fromPlacemarkRef.current);
      }
      fromPlacemarkRef.current = new window.ymaps.Placemark(
        [fromLatNumber, fromLngNumber],
        { balloonContent: "Точка A" },
        { preset: "islands#greenDotIcon" },
      );
      mapRef.current.geoObjects.add(fromPlacemarkRef.current);
    }
  }, [fromLat, fromLng]);

  useEffect(() => {
    if (!mapRef.current || !window.ymaps) {
      return;
    }
    const toLatNumber = parseCoordinate(toLat);
    const toLngNumber = parseCoordinate(toLng);
    if (toLatNumber !== null && toLngNumber !== null) {
      if (toPlacemarkRef.current) {
        mapRef.current.geoObjects.remove(toPlacemarkRef.current);
      }
      toPlacemarkRef.current = new window.ymaps.Placemark(
        [toLatNumber, toLngNumber],
        { balloonContent: "Точка B" },
        { preset: "islands#redDotIcon" },
      );
      mapRef.current.geoObjects.add(toPlacemarkRef.current);
    }
  }, [toLat, toLng]);

  useEffect(() => {
    if (!mapRef.current || !window.ymaps) {
      return;
    }
    if (driverPlacemarkRef.current) {
      mapRef.current.geoObjects.remove(driverPlacemarkRef.current);
      driverPlacemarkRef.current = null;
    }
    if (!driverLiveLocation) {
      return;
    }
    driverPlacemarkRef.current = new window.ymaps.Placemark(
      [driverLiveLocation.lat, driverLiveLocation.lng],
      { balloonContent: "Водитель online" },
      { preset: "islands#blueDotIcon" },
    );
    mapRef.current.geoObjects.add(driverPlacemarkRef.current);
  }, [driverLiveLocation]);

  useEffect(() => {
    if (
      !mapRef.current ||
      !driverLiveLocation ||
      !followDriverOnMap ||
      !activeOrderId
    ) {
      return;
    }
    mapRef.current.setCenter([driverLiveLocation.lat, driverLiveLocation.lng], 13);
  }, [activeOrderId, driverLiveLocation, followDriverOnMap]);

  if (!user || !roleMatches(user.role, "PASSENGER")) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pb-16 pt-24">
        <div className="container mx-auto px-4">
          <div className="mb-8 flex items-center justify-between">
            <h1 className="font-display text-3xl font-bold text-foreground md:text-4xl">
              Кабинет <span className="gold-text">пассажира</span>
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
                  {orders.length}
                </p>
                <p className="text-xs text-muted-foreground">Всего заказов</p>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-primary">
                  {Math.round(totalSpent)} ₽
                </p>
                <p className="text-xs text-muted-foreground">Потрачено</p>
              </CardContent>
            </Card>
            <Card className="hidden border-border bg-card md:block">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-primary">
                  {activeOrder ? 1 : 0}
                </p>
                <p className="text-xs text-muted-foreground">Активный заказ</p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="active" className="space-y-6">
            <TabsList className="bg-secondary">
              <TabsTrigger value="active">Текущий заказ</TabsTrigger>
              <TabsTrigger value="history">История заказов</TabsTrigger>
              <TabsTrigger value="profile">Профиль</TabsTrigger>
            </TabsList>

            <TabsContent value="active">
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-lg">Активная поездка</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-6 rounded-lg border border-border p-3">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant={mapPickMode === "from" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setMapPickMode("from")}
                      >
                        Выбрать точку A
                      </Button>
                      <Button
                        type="button"
                        variant={mapPickMode === "to" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setMapPickMode("to")}
                      >
                        Выбрать точку B
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void ensureRouteEstimate()}
                        disabled={routeEstimateMutation.isPending || !parsedCoordinates.valid}
                      >
                        <Navigation className="mr-1 h-4 w-4" />
                        Рассчитать маршрут
                      </Button>
                    </div>
                    <div
                      ref={mapContainerRef}
                      className="h-64 w-full rounded-md border border-border/50"
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Режим выбора: {mapPickMode === "from" ? "Точка A" : "Точка B"}
                      {" • "}
                      {mapReady
                        ? "Клик по карте обновляет координаты и адрес"
                        : "Инициализация карты..."}
                    </p>
                    {mapError ? (
                      <p className="mt-2 flex items-center gap-1 text-xs text-amber-600">
                        <AlertTriangle className="h-3 w-3" />
                        {mapError}
                      </p>
                    ) : null}
                    {routePreview ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Маршрут: {routePreview.distanceKm.toFixed(2)} км •{" "}
                        {routePreview.estimatedDurationMin} мин • provider:{" "}
                        {routePreview.provider}
                        {routePreview.fallbackUsed ? " (fallback)" : ""}
                      </p>
                    ) : null}
                    {activeOrderId ? (
                      <div className="mt-2 rounded-md border border-border/60 p-2 text-xs text-muted-foreground">
                        <p>
                          Realtime:{" "}
                          <Badge
                            variant={realtimeConnected ? "default" : "outline"}
                            className="align-middle"
                          >
                            {realtimeConnected ? "online" : "offline"}
                          </Badge>
                          {realtimeStatus ? ` • статус: ${realtimeStatus}` : ""}
                        </p>
                        {driverLiveLocation ? (
                          <p className="mt-1">
                            Водитель: {driverLiveLocation.lat.toFixed(5)},{" "}
                            {driverLiveLocation.lng.toFixed(5)}
                          </p>
                        ) : (
                          <p className="mt-1">Позиция водителя еще не поступила.</p>
                        )}
                        {lastRealtimeAt ? (
                          <p className="mt-1">Последнее realtime обновление: {lastRealtimeAt}</p>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          onClick={() => setFollowDriverOnMap((prev) => !prev)}
                        >
                          {followDriverOnMap
                            ? "Отключить слежение за водителем"
                            : "Включить слежение за водителем"}
                        </Button>
                      </div>
                    ) : null}
                    {!parsedCoordinates.valid ? (
                      <p className="mt-2 text-xs text-amber-600">
                        {parsedCoordinates.message}
                      </p>
                    ) : null}
                  </div>
                  <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Откуда
                      </Label>
                      <Input
                        value={fromAddress}
                        onChange={(e) => setFromAddress(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Куда
                      </Label>
                      <Input
                        value={toAddress}
                        onChange={(e) => setToAddress(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        fromLat / fromLng
                      </Label>
                      <div className="mt-1 flex gap-2">
                        <Input
                          value={fromLat}
                          onChange={(e) => setFromLat(e.target.value)}
                        />
                        <Input
                          value={fromLng}
                          onChange={(e) => setFromLng(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        toLat / toLng
                      </Label>
                      <div className="mt-1 flex gap-2">
                        <Input
                          value={toLat}
                          onChange={(e) => setToLat(e.target.value)}
                        />
                        <Input
                          value={toLng}
                          onChange={(e) => setToLng(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Waiting seconds / Extra stops
                      </Label>
                      <div className="mt-1 flex gap-2">
                        <Input
                          value={waitingSeconds}
                          onChange={(e) => setWaitingSeconds(e.target.value)}
                        />
                        <Input
                          value={extraStopsCount}
                          onChange={(e) => setExtraStopsCount(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Out of city km
                      </Label>
                      <Input
                        className="mt-1"
                        value={outOfCityKm}
                        onChange={(e) => setOutOfCityKm(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="mb-4 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => void handleEstimateFare()}
                      disabled={
                        estimateMutation.isPending ||
                        routeEstimateMutation.isPending ||
                        !parsedCoordinates.valid
                      }
                    >
                      Рассчитать тариф
                    </Button>
                    <Button
                      className="gold-gradient border-0 text-primary-foreground"
                      onClick={() => void handleCreateOrder()}
                      disabled={
                        createOrderMutation.isPending ||
                        routeEstimateMutation.isPending ||
                        !parsedCoordinates.valid
                      }
                    >
                      Создать заказ
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() =>
                        activeOrder?.id
                          ? cancelOrderMutation.mutate(String(activeOrder.id))
                          : undefined
                      }
                      disabled={
                        !activeOrder?.id || cancelOrderMutation.isPending
                      }
                    >
                      Отменить активный заказ
                    </Button>
                  </div>
                  {activeQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">
                      Загрузка активного заказа...
                    </p>
                  ) : activeOrder ? (
                    <div className="space-y-2 text-sm">
                      <p>
                        <span className="text-muted-foreground">ID:</span>{" "}
                        {readText(activeOrder, "id")}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Статус:</span>{" "}
                        <Badge variant="secondary">
                          {readText(activeOrder, "status")}
                        </Badge>
                      </p>
                      <p>
                        <span className="text-muted-foreground">Цена:</span>{" "}
                        {readText(activeOrder, "price")} ₽
                      </p>
                      <p>
                        <span className="text-muted-foreground">Service:</span>{" "}
                        {readText(activeOrder, "serviceLevel")}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Сейчас нет активного заказа.
                    </p>
                  )}
                  {estimateMutation.data?.status === 200 ? (
                    <div className="mt-4 rounded-md border border-border p-3 text-sm">
                      <p>
                        Расчет:{" "}
                        {readText(
                          (estimateMutation.data.body as OrderLike).pricing as OrderLike,
                          "totalPriceRub",
                        )}{" "}
                        ₽
                      </p>
                      {routePreview ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          По маршруту: {routePreview.distanceKm.toFixed(2)} км,{" "}
                          {routePreview.estimatedDurationMin} мин.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history" className="space-y-4">
              {historyQuery.isLoading ? (
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
                      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
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
                            <MapPin className="h-4 w-4 text-primary" />
                            {readText(order, "id")}
                          </p>
                          <p className="text-lg font-bold text-primary">
                            {readText(order, "price")} ₽
                          </p>
                        </div>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <p className="flex items-center gap-1">
                            <User className="h-3 w-3" /> Водитель:{" "}
                            {readText(order, "driverId")}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="profile">
              <Card className="max-w-md border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-lg">Профиль</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p>
                    <span className="text-muted-foreground">ID:</span> {user.id}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Телефон:</span>{" "}
                    {user.phone || "-"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Имя:</span>{" "}
                    {user.name || "Пассажир"}
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default PassengerDashboard;
