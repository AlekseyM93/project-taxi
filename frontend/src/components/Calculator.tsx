import { useState } from "react";
import { motion } from "framer-motion";
import { MapPin, ArrowRight, Calendar, Clock, Flower2, Car, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { searchLocations, findPrice, TOLL_ROAD_SURCHARGE, type PriceEntry } from "@/data/priceList";
import { useToast } from "@/hooks/use-toast";

interface CalculatorProps {
  onRouteChange?: (from: string, to: string) => void;
}

const Calculator = ({ onRouteChange }: CalculatorProps) => {
  const [from, setFrom] = useState("Ступино");
  const [to, setTo] = useState("");
  const [toSuggestions, setToSuggestions] = useState<PriceEntry[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mode, setMode] = useState<"taxi" | "flowers">("taxi");
  const [tollRoad, setTollRoad] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [calculatedPrice, setCalculatedPrice] = useState<number | null>(null);
  const [priceConfidence, setPriceConfidence] = useState<"exact" | "estimated">("exact");
  const { toast } = useToast();

  const handleToChange = (value: string) => {
    setTo(value);
    setCalculatedPrice(null);
    if (value.length >= 1) {
      const results = searchLocations(value);
      setToSuggestions(results);
      setShowSuggestions(results.length > 0);
    } else {
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (entry: PriceEntry) => {
    setTo(entry.name);
    setShowSuggestions(false);
    calculatePrice(entry.name);
    onRouteChange?.(from, entry.name);
  };

  const calculatePrice = (destination?: string) => {
    const dest = destination || to;
    if (!dest) return;

    const entry = findPrice(dest);
    if (entry) {
      let price = entry.price;
      if (tollRoad) {
        price = Math.round(price * (1 + TOLL_ROAD_SURCHARGE));
      }
      setCalculatedPrice(price);
      setPriceConfidence("exact");
      onRouteChange?.(from, dest);
    } else {
      setCalculatedPrice(null);
      setPriceConfidence("estimated");
      toast({
        title: "Направление не найдено в прайсе",
        description: "Позвоните нам для уточнения стоимости.",
        variant: "destructive",
      });
    }
  };

  const handleOrder = () => {
    if (!to) {
      toast({ title: "Укажите пункт назначения", variant: "destructive" });
      return;
    }
    if (!calculatedPrice) {
      calculatePrice();
      return;
    }
    toast({
      title: "Заявка отправлена!",
      description: `${from} → ${to}, ${calculatedPrice} ₽. Мы свяжемся с вами в ближайшее время.`,
    });
  };

  return (
    <section id="calculator" className="py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="glass-card rounded-2xl p-6 md:p-8 max-w-2xl mx-auto"
      >
        <h2 className="font-display text-2xl font-bold text-foreground mb-6">
          Рассчитать стоимость
        </h2>

        {/* Mode toggle */}
        <div className="flex gap-2 mb-6">
          <Button
            variant={mode === "taxi" ? "default" : "outline"}
            onClick={() => { setMode("taxi"); setCalculatedPrice(null); }}
            className={mode === "taxi" ? "gold-gradient border-0 text-primary-foreground" : "border-border"}
          >
            <Car className="h-4 w-4 mr-2" />
            Такси
          </Button>
          <Button
            variant={mode === "flowers" ? "default" : "outline"}
            onClick={() => { setMode("flowers"); setCalculatedPrice(null); }}
            className={mode === "flowers" ? "gold-gradient border-0 text-primary-foreground" : "border-border"}
          >
            <Flower2 className="h-4 w-4 mr-2" />
            Доставка цветов
          </Button>
        </div>

        {/* Route */}
        <div className="space-y-4 mb-6">
          <div className="relative">
            <MapPin className="absolute left-3 top-3 h-4 w-4 text-primary" />
            <Input
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="Откуда"
              className="pl-10 bg-secondary/50 border-border"
            />
          </div>

          <div className="flex justify-center">
            <div className="w-8 h-8 rounded-full border border-border flex items-center justify-center">
              <ArrowRight className="h-4 w-4 text-primary rotate-90" />
            </div>
          </div>

          <div className="relative">
            <MapPin className="absolute left-3 top-3 h-4 w-4 text-primary" />
            <Input
              value={to}
              onChange={(e) => handleToChange(e.target.value)}
              onFocus={() => to.length >= 1 && setShowSuggestions(toSuggestions.length > 0)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="Куда"
              className="pl-10 bg-secondary/50 border-border"
            />

            {showSuggestions && (
              <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
                {toSuggestions.map((entry) => (
                  <button
                    key={entry.name}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/50 transition-colors flex justify-between items-center"
                    onMouseDown={() => selectSuggestion(entry)}
                  >
                    <span>{entry.name}</span>
                    <span className="text-primary font-medium">{entry.price} ₽</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Date & time */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="relative">
            <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="pl-10 bg-secondary/50 border-border"
            />
          </div>
          <div className="relative">
            <Clock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="pl-10 bg-secondary/50 border-border"
            />
          </div>
        </div>

        {/* Toll road */}
        <div className="flex items-center space-x-2 mb-6">
          <Checkbox
            id="toll"
            checked={tollRoad}
            onCheckedChange={(checked) => {
              setTollRoad(!!checked);
              setCalculatedPrice(null);
            }}
          />
          <Label htmlFor="toll" className="text-sm text-muted-foreground cursor-pointer">
            Учитывать платные дороги (+15%)
          </Label>
        </div>

        {/* Price result */}
        {calculatedPrice !== null && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-secondary/30 rounded-xl p-4 mb-6 text-center"
          >
            <p className="text-sm text-muted-foreground mb-1">
              {mode === "taxi" ? "Стоимость поездки" : "Стоимость доставки"}
            </p>
            <p className="text-4xl font-bold gold-text">{calculatedPrice} ₽</p>
            {priceConfidence === "estimated" && (
              <p className="text-xs text-muted-foreground mt-2 flex items-center justify-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Примерная стоимость. Точную цену уточните по телефону.
              </p>
            )}
          </motion.div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => calculatePrice()}
            className="flex-1 border-primary/30 text-primary hover:bg-primary/10"
          >
            Рассчитать
          </Button>
          <Button
            onClick={handleOrder}
            className="flex-1 gold-gradient text-primary-foreground font-semibold border-0 hover:opacity-90"
          >
            Заказать
          </Button>
        </div>
      </motion.div>
    </section>
  );
};

export default Calculator;
