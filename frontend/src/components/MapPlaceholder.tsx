import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { MapPin, Navigation, Locate } from "lucide-react";
import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    ymaps?: YMapsApi;
  }
}

type YMapsApi = {
  ready: (cb: () => void) => void;
  Map: new (
    element: HTMLElement,
    options: {
      center: number[];
      zoom: number;
      controls: string[];
    },
  ) => YMapsInstance;
  multiRouter: {
    MultiRoute: new (
      model: {
        referencePoints: string[];
        params: { routingMode: string };
      },
      options: Record<string, unknown>,
    ) => YMapsMultiRoute;
  };
};

type YMapsInstance = {
  destroy: () => void;
  setCenter: (coords: number[], zoom?: number) => void;
  geoObjects: {
    add: (item: unknown) => void;
    remove: (item: unknown) => void;
  };
};

type YMapsMultiRoute = {
  getActiveRoute: () => {
    properties: {
      get: (key: "distance" | "duration") => { text?: string } | undefined;
    };
  } | null;
  events: {
    add: (eventName: "update", handler: () => void) => void;
  };
};

const DEFAULT_CENTER = [54.9009, 38.0782]; // Ступино

interface MapSectionProps {
  routeFrom?: string;
  routeTo?: string;
}

const MapSection = ({ routeFrom, routeTo }: MapSectionProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<YMapsInstance | null>(null);
  const routeRef = useRef<YMapsMultiRoute | null>(null);
  const [locating, setLocating] = useState(false);
  const [routeInfo, setRouteInfo] = useState<string | null>(null);

  // Init map
  useEffect(() => {
    if (!containerRef.current) return;

    const initMap = () => {
      window.ymaps.ready(() => {
        if (mapRef.current) return;

        const map = new window.ymaps.Map(containerRef.current, {
          center: DEFAULT_CENTER,
          zoom: 11,
          controls: ["zoomControl", "fullscreenControl"],
        });

        mapRef.current = map;
      });
    };

    if (window.ymaps) {
      initMap();
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, []);

  // Build route from form inputs
  useEffect(() => {
    if (!mapRef.current || !window.ymaps || !routeFrom || !routeTo) return;

    const map = mapRef.current;

    // Clear previous route
    if (routeRef.current) {
      map.geoObjects.remove(routeRef.current);
      routeRef.current = null;
    }

    setRouteInfo(null);

    // Use geocoding-based multiRoute with city names
    const multiRoute = new window.ymaps.multiRouter.MultiRoute(
      {
        referencePoints: [routeFrom, routeTo],
        params: { routingMode: "auto" },
      },
      {
        boundsAutoApply: true,
        wayPointStartIconColor: "#22c55e",
        wayPointFinishIconColor: "#D4A853",
        routeActiveStrokeColor: "#D4A853",
        routeActiveStrokeWidth: 4,
      }
    );

    multiRoute.events.add("update", () => {
      try {
        const activeRoute = multiRoute.getActiveRoute();
        if (activeRoute) {
          const distance = activeRoute.properties.get("distance")?.text || "";
          const duration = activeRoute.properties.get("duration")?.text || "";
          setRouteInfo(`${distance} • ${duration}`);
        }
      } catch {
        // ignore
      }
    });

    map.geoObjects.add(multiRoute);
    routeRef.current = multiRoute;
  }, [routeFrom, routeTo]);

  const handleLocate = () => {
    if (!navigator.geolocation || !mapRef.current) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = [pos.coords.latitude, pos.coords.longitude];
        mapRef.current?.setCenter(coords, 13);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true }
    );
  };

  return (
    <section id="map" className="py-20">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-8"
        >
          <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
            Маршрут <span className="gold-text">на карте</span>
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Выберите направление в калькуляторе — маршрут отобразится автоматически
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="glass-card rounded-2xl p-4 md:p-6 max-w-5xl mx-auto"
        >
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Button
              onClick={handleLocate}
              disabled={locating}
              variant="outline"
              className="border-primary/30 hover:bg-primary/10"
            >
              <Locate className="h-4 w-4 mr-2" />
              {locating ? "Определяем…" : "Моё местоположение"}
            </Button>
            {routeInfo && (
              <span className="text-sm text-primary font-medium">{routeInfo}</span>
            )}
          </div>

          <div
            ref={containerRef}
            className="w-full aspect-video rounded-xl overflow-hidden border border-border/50"
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            {[
              { icon: Navigation, text: "Геолокация", desc: "Определение вашего местоположения" },
              { icon: MapPin, text: "Автомаршрут", desc: "Строится по данным из калькулятора" },
              { icon: MapPin, text: "Расстояние и время", desc: "Отображаются после расчёта" },
            ].map((item) => (
              <div key={item.text} className="bg-secondary/20 rounded-lg p-4 text-center">
                <item.icon className="h-5 w-5 text-primary mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground">{item.text}</p>
                <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default MapSection;
