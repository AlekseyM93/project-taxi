import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

interface CalculatorProps {
  onRouteChange?: (from: string, to: string) => void;
}

const Calculator = ({ onRouteChange }: CalculatorProps) => {
  return (
    <section id="calculator" className="py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="glass-card rounded-2xl p-6 md:p-8 max-w-2xl mx-auto"
      >
        <h2 className="font-display text-2xl font-bold text-foreground mb-4">Pricing V2</h2>
        <p className="mb-6 text-muted-foreground">
          Расчет стоимости теперь выполняется только через backend pricing engine по данным тарифов из БД.
          Для оценки и создания поездки используйте личный кабинет пассажира.
        </p>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => onRouteChange?.("dashboard", "pricing-v2")}
            className="flex-1 border-primary/30 text-primary hover:bg-primary/10"
          >
            Открыть кабинет пассажира
          </Button>
        </div>
      </motion.div>
    </section>
  );
};

export default Calculator;
