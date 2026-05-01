import React, { useEffect, useRef, useState, useCallback } from 'react';

declare global {
  interface Window {
    mapgl?: MapGlApi;
  }
}

type LngLatTuple = [number, number];

type MapGlMap = {
  on: (eventName: string, callback: (event: unknown) => void) => void;
  getCenter: () => LngLatTuple;
  getZoom: () => number;
  setCenter: (center: LngLatTuple) => void;
  setZoom: (zoom: number) => void;
  destroy: () => void;
};

type MapGlMarkerInstance = { destroy?: () => void };
type MapGlPolylineInstance = { destroy?: () => void };

type MapGlApi = {
  Map: new (
    element: HTMLDivElement,
    options: { key: string; center: LngLatTuple; zoom: number },
  ) => MapGlMap;
  Marker: new (
    map: MapGlMap,
    options: { coordinates: LngLatTuple; color?: string },
  ) => MapGlMarkerInstance;
  Polyline: new (
    map: MapGlMap,
    options: { coordinates: LngLatTuple[]; color?: string; width?: number },
  ) => MapGlPolylineInstance;
};

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  color?: string;
  title?: string;
  icon?: 'pickup' | 'dropoff' | 'driver' | 'default';
}

export interface MapRoute {
  points: Array<{ lat: number; lng: number }>;
  color?: string;
  strokeWidth?: number;
}

interface YandexMapProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  markers?: MapMarker[];
  routes?: MapRoute[];
  onMapClick?: (lat: number, lng: number) => void;
  onCameraMove?: (center: { lat: number; lng: number }, zoom: number) => void;
  className?: string;
  style?: React.CSSProperties;
  /** При true при первой отрисовке карты один раз пробует браузерную геолокацию. */
  myLocationEnabled?: boolean;
}

const MARKER_COLORS: Record<string, string> = {
  pickup: '#10B981',
  dropoff: '#EF4444',
  driver: '#3B82F6',
  default: '#F59E0B',
};

export const YandexMap: React.FC<YandexMapProps> = ({
  center = { lat: 55.7558, lng: 37.6173 },
  zoom = 14,
  markers = [],
  routes = [],
  onMapClick,
  onCameraMove,
  className,
  style,
  myLocationEnabled = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapGlMap | null>(null);
  const markersRef = useRef<MapGlMarkerInstance[]>([]);
  const routeLinesRef = useRef<MapGlPolylineInstance[]>([]);
  const geolocationMarkerRef = useRef<MapGlMarkerInstance | null>(null);

  const onMapClickRef = useRef(onMapClick);
  const onCameraMoveRef = useRef(onCameraMove);
  onMapClickRef.current = onMapClick;
  onCameraMoveRef.current = onCameraMove;

  const centerRef = useRef(center);
  const zoomRef = useRef(zoom);
  centerRef.current = center;
  zoomRef.current = zoom;

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  /** Карта уже создана (чтобы синхронно двигать камеру, не уничтожая canvas). */
  const [mapMounted, setMapMounted] = useState(false);

  const loadMapGl = useCallback(async (): Promise<MapGlApi | undefined> => {
    const cssHref = 'https://mapgl.2gis.com/api/css/v1/mapgl.css';
    const hasCss = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .some((el) => (el as HTMLLinkElement).href.includes(cssHref));
    if (!hasCss) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = cssHref;
      document.head.appendChild(css);
    }

    if (window.mapgl) return window.mapgl;
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://mapgl.2gis.com/api/js/v1';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('2GIS script load failed'));
      document.head.appendChild(script);
    });
    return window.mapgl;
  }, []);

  const initMapOnce = useCallback(async () => {
    if (!containerRef.current || mapRef.current) return;

    const apiKey = import.meta.env.VITE_DGIS_API_KEY as string | undefined;
    if (!apiKey) {
      setError('2GIS API ключ не найден. Проверьте VITE_DGIS_API_KEY в frontend/.env');
      setIsLoading(false);
      return;
    }

    try {
      const mapgl = await loadMapGl();
      if (!mapgl) {
        setError('2GIS API не загружен. Проверьте сеть и API ключ.');
        setIsLoading(false);
        return;
      }

      const c = centerRef.current;
      const z = zoomRef.current;
      const map = new mapgl.Map(containerRef.current, {
        key: apiKey,
        center: [c.lng, c.lat],
        zoom: z,
      });

      mapRef.current = map;
      setMapMounted(true);
      setIsLoading(false);
      setError(null);

      map.on('click', (e: unknown) => {
        const handler = onMapClickRef.current;
        if (!handler) return;
        const lngLat = (e as { lngLat?: unknown })?.lngLat;
        const lng = Array.isArray(lngLat) ? lngLat[0] : undefined;
        const lat = Array.isArray(lngLat) ? lngLat[1] : undefined;
        if (typeof lat === 'number' && typeof lng === 'number') {
          handler(lat, lng);
        }
      });

      map.on('moveend', () => {
        const cb = onCameraMoveRef.current;
        if (!cb) return;
        const mc = map.getCenter();
        const mz = map.getZoom();
        cb({ lat: mc[1], lng: mc[0] }, mz);
      });

      if (myLocationEnabled) {
        navigator.geolocation?.getCurrentPosition(
          (pos) => {
            const coords: LngLatTuple = [pos.coords.longitude, pos.coords.latitude];
            map.setCenter(coords);
            map.setZoom(15);
            geolocationMarkerRef.current?.destroy?.();
            geolocationMarkerRef.current = new mapgl.Marker(map, {
              coordinates: coords,
              color: '#2563eb',
            });
          },
          () => {
            // родитель может показывать свою подсказку
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
        );
      }

      window.setTimeout(() => {
        if (!containerRef.current) return;
        const hasCanvas = containerRef.current.querySelector('canvas');
        if (!hasCanvas) {
          setError('2GIS карта не отрисовалась. Проверьте валидность API ключа и ограничения по домену.');
        }
      }, 1500);
    } catch (_err) {
      setError('Ошибка инициализации 2GIS карты');
      setIsLoading(false);
    }
  }, [loadMapGl, myLocationEnabled]);

  useEffect(() => {
    void initMapOnce();
    return () => {
      geolocationMarkerRef.current?.destroy?.();
      geolocationMarkerRef.current = null;
      mapRef.current?.destroy?.();
      mapRef.current = null;
      setMapMounted(false);
    };
  }, [initMapOnce]);

  /** Сдвигаем камеру при смене center извне (например после геолокации) — без пересоздания карты. */
  useEffect(() => {
    if (!mapMounted || !mapRef.current) return;
    mapRef.current.setCenter([center.lng, center.lat]);
  }, [center.lat, center.lng, mapMounted]);

  useEffect(() => {
    if (!mapMounted || !mapRef.current) return;
    mapRef.current.setZoom(zoom);
  }, [zoom, mapMounted]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.mapgl) return;

    markersRef.current.forEach((m) => m?.destroy?.());
    markersRef.current = [];

    markers.forEach((marker) => {
      const color = marker.color || MARKER_COLORS[marker.icon || 'default'] || MARKER_COLORS.default;
      const placemark = new window.mapgl!.Marker(map, {
        coordinates: [marker.lng, marker.lat],
        color,
      });
      markersRef.current.push(placemark);
    });
  }, [markers, mapMounted]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.mapgl) return;

    routeLinesRef.current.forEach((r) => r?.destroy?.());
    routeLinesRef.current = [];

    routes.forEach((route) => {
      const coords = route.points.map((p): LngLatTuple => [p.lng, p.lat]);
      if (coords.length < 2) return;
      const polyline = new window.mapgl!.Polyline(map, {
        coordinates: coords,
        color: route.color || '#3B82F6',
        width: route.strokeWidth || 4,
      });
      routeLinesRef.current.push(polyline);
    });
  }, [routes, mapMounted]);

  const retry = useCallback(async () => {
    setError(null);
    geolocationMarkerRef.current?.destroy?.();
    geolocationMarkerRef.current = null;
    mapRef.current?.destroy?.();
    mapRef.current = null;
    setMapMounted(false);
    setIsLoading(true);
    await initMapOnce();
  }, [initMapOnce]);

  if (error) {
    return (
      <div
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          backgroundColor: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          padding: 24,
          minHeight: 300,
          ...style,
        }}
      >
        <span style={{ color: '#ef4444', fontSize: 14 }}>{error}</span>
        <button
          type="button"
          onClick={() => void retry()}
          style={{
            marginTop: 12,
            padding: '8px 16px',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', ...style }} className={className}>
      {isLoading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f9fafb',
            zIndex: 1,
          }}
        >
          Загрузка 2GIS карты...
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 300 }} />
    </div>
  );
};

export default YandexMap;
