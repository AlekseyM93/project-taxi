import { motion } from "framer-motion";
import { Package, Clock, Shield, Heart } from "lucide-react";

const Delivery = () => {
  return (
    <section id="delivery" className="py-20">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <span className="inline-block px-4 py-1.5 rounded-full text-xs font-medium tracking-wider uppercase bg-primary/10 text-primary border border-primary/20 mb-6">
              Доставка
            </span>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-6">
              Бережная доставка <span className="gold-text">посылок и грузов</span>
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-8">
              Мы доставляем документы, посылки и личные вещи по Ступино и Московской области.
              Наши водители обучены обращению с хрупкими и ценными грузами,
              чтобы отправление прибыло в идеальном состоянии.
            </p>

            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: Clock, text: "Быстрая доставка" },
                { icon: Shield, text: "Бережное обращение" },
                { icon: Heart, text: "Внимание к деталям" },
                { icon: Package, text: "Прозрачные тарифы" },
              ].map((item) => (
                <div key={item.text} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <item.icon className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-sm text-foreground">{item.text}</span>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="glass-card rounded-2xl p-8 text-center"
          >
            <Package className="h-16 w-16 text-primary mx-auto mb-4" />
            <h3 className="font-display text-2xl font-bold text-foreground mb-2">
              Тарифы на доставку
            </h3>
            <p className="text-muted-foreground mb-6 text-sm">
              Стоимость доставки рассчитывается по тем же прозрачным тарифам,
              что и поездки. Используйте калькулятор выше для расчета.
            </p>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-sm text-muted-foreground">По г. Ступино</span>
                <span className="text-sm font-semibold text-primary">от 250 ₽</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-sm text-muted-foreground">Ближний пригород</span>
                <span className="text-sm font-semibold text-primary">от 350 ₽</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border/50">
                <span className="text-sm text-muted-foreground">Дальний пригород</span>
                <span className="text-sm font-semibold text-primary">от 700 ₽</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-muted-foreground">Межгород</span>
                <span className="text-sm font-semibold text-primary">от 1000 ₽</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Delivery;
