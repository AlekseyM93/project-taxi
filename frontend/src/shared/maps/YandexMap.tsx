import React, { useEffect, useRef, useState, useCallback } from 'react';

declare global {
  interface Window {
    ymaps: any;
  }
}

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
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const routeLinesRef = useRef<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const initMap = useCallback(() => {
    if (!window.ymaps || !containerRef.current) {
      setError('Yandex Maps API не загружен. Проверьте API ключ.');
      setIsLoading(false);
      return;
    }

    window.ymaps.ready(() => {
      if (!containerRef.current) return;

      try {
        const map = new window.ymaps.Map(containerRef.current, {
          center: [center.lat, center.lng],
          zoom,
          controls: ['zoomControl', 'geolocationControl'],
        });

        mapRef.current = map;
        setIsLoading(false);
        setError(null);

        if (onMapClick) {
          map.events.add('click', (e: any) => {
            const coords = e.get('coords');
            onMapClick(coords[0], coords[1]);
          });
        }

        if (onCameraMove) {
          map.events.add('boundschange', () => {
            const mapCenter = map.getCenter();
            const mapZoom = map.getZoom();
            onCameraMove({ lat: mapCenter[0], lng: mapCenter[1] }, mapZoom);
          });
        }

        if (myLocationEnabled) {
          navigator.geolocation?.getCurrentPosition(
            (pos) => {
              map.setCenter([pos.coords.latitude, pos.coords.longitude], 15);
            },
            () => {
              // geolocation denied — keep default center
            },
          );
        }
      } catch (err) {
        setError('Ошибка инициализации карты');
        setIsLoading(false);
      }
    });
  }, [center.lat, center.lng, zoom, onMapClick, onCameraMove, myLocationEnabled]);

  useEffect(() => {
    initMap();
    return () => {
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.ymaps) return;

    markersRef.current.forEach((m) => map.geoObjects.remove(m));
    markersRef.current = [];

    markers.forEach((marker) => {
      const color = marker.color || MARKER_COLORS[marker.icon || 'default'] || MARKER_COLORS.default;
      const placemark = new window.ymaps.Placemark(
        [marker.lat, marker.lng],
        { hintContent: marker.title || '' },
        {
          preset: 'islands#circleDotIcon',
          iconColor: color,
        },
      );
      map.geoObjects.add(placemark);
      markersRef.current.push(placemark);
    });
  }, [markers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.ymaps) return;

    routeLinesRef.current.forEach((r) => map.geoObjects.remove(r));
    routeLinesRef.current = [];

    routes.forEach((route) => {
      const coords = route.points.map((p) => [p.lat, p.lng]);
      const polyline = new window.ymaps.Polyline(
        coords,
        {},
        {
          strokeColor: route.color || '#3B82F6',
          strokeWidth: route.strokeWidth || 4,
          strokeOpacity: 0.8,
        },
      );
      map.geoObjects.add(polyline);
      routeLinesRef.current.push(polyline);
    });
  }, [routes]);

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
          onClick={initMap}
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
          Загрузка карты...
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 300 }} />
    </div>
  );
};

export default YandexMap;
