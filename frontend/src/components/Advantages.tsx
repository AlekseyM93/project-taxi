import { motion } from "framer-motion";
import { Users, BadgeRussianRuble, MapPinned, Package } from "lucide-react";

const advantages = [
  {
    icon: Users,
    title: "Свои водители",
    description: "Проверенные водители с опытом. Каждый проходит тщательную проверку и знает регион.",
  },
  {
    icon: BadgeRussianRuble,
    title: "Фиксированные цены",
    description: "Стоимость поездки известна заранее. Никаких скрытых наценок и неожиданных счётов.",
  },
  {
    icon: MapPinned,
    title: "По всей России",
    description: "Доставка из Ступино в любую точку Московской области и дальше. 250+ направлений.",
  },
  {
    icon: Package,
    title: "Доставка",
    description: "Бережная доставка документов, посылок и личных вещей по прозрачным тарифам.",
  },
];

const Advantages = () => {
  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
            Почему <span className="gold-text">выбирают нас</span>
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Такси Свои — это надёжный сервис с фиксированными ценами и проверенными водителями
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {advantages.map((adv, i) => (
            <motion.div
              key={adv.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="glass-card rounded-xl p-6 text-center group hover:border-primary/30 transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-xl gold-gradient flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                <adv.icon className="h-6 w-6 text-primary-foreground" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">{adv.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{adv.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Advantages;
