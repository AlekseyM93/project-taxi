import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { MapPin, Navigation, Locate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { YandexMap, type MapMarker, type MapRoute } from "@/shared/maps";

const DEFAULT_CENTER = [54.9009, 38.0782]; // Ступино

interface MapSectionProps {
  routeFrom?: string;
  routeTo?: string;
}

const MapSection = ({ routeFrom, routeTo }: MapSectionProps) => {
  void routeFrom;
  void routeTo;
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [mapZoom, setMapZoom] = useState(13);
  const [center, setCenter] = useState({ lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] });

  const markers = useMemo<MapMarker[]>(() => {
    return [
      {
        id: "center",
        lat: center.lat,
        lng: center.lng,
        icon: "default",
        title: "Текущее местоположение",
      },
    ];
  }, [center.lat, center.lng]);

  const routes = useMemo<MapRoute[]>(() => {
    // На лендинге нет геокодинга, поэтому маршрут строим в рабочих кабинетах.
    return [];
  }, []);

  const handleLocate = () => {
    if (!navigator.geolocation) {
      setGeoError(
        "Геолокация недоступна: неподдерживаемый браузер или небезопасный контекст (нужны https или localhost).",
      );
      return;
    }
    setGeoError(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setMapZoom(15);
        setLocating(false);
      },
      (geoErr: GeolocationPositionError) => {
        setLocating(false);
        if (geoErr.code === geoErr.PERMISSION_DENIED) {
          setGeoError(
            "Доступ к геолокации запрещён. В адресной строке разрешите «Местоположение» для этого сайта.",
          );
        } else if (geoErr.code === geoErr.TIMEOUT) {
          setGeoError("Не удалось определить координаты за отведённое время. Повторите или проверьте службы локации в Windows.");
        } else if (geoErr.code === geoErr.POSITION_UNAVAILABLE) {
          setGeoError("Позиция недоступна (GPS/Wi‑Fi выключены или нет сигнала).");
        } else {
          setGeoError("Не удалось определить местоположение.");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
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
            {geoError ? (
              <span className="text-sm text-amber-600 max-w-xl">{geoError}</span>
            ) : null}
          </div>

          <YandexMap
            center={center}
            zoom={mapZoom}
            markers={markers}
            routes={routes}
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
