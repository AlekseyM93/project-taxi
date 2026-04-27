import { Link } from "react-router-dom";
import { Phone, Mail, MapPin } from "lucide-react";

const Footer = () => {
  return (
    <footer id="contacts" className="border-t border-border bg-card/50">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <h3 className="font-display text-2xl font-bold gold-text mb-4">Такси Свои</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Служба заказов такси и доставки по г. Ступино и Московской области. Фиксированные цены, свои водители.
            </p>
          </div>

          {/* Contacts */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Контакты</h4>
            <div className="space-y-3">
              <a href="tel:+79001234567" className="flex items-center gap-3 text-sm text-muted-foreground hover:text-primary transition-colors">
                <Phone className="h-4 w-4 text-primary" />
                +7 (900) 123-45-67
              </a>
              <a href="mailto:info@taxisvoi.ru" className="flex items-center gap-3 text-sm text-muted-foreground hover:text-primary transition-colors">
                <Mail className="h-4 w-4 text-primary" />
                info@taxisvoi.ru
              </a>
              <div className="flex items-start gap-3 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 text-primary mt-0.5" />
                г. Ступино, Московская область
              </div>
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-semibold text-foreground mb-4">Информация</h4>
            <div className="space-y-3">
              <Link to="/privacy" className="block text-sm text-muted-foreground hover:text-primary transition-colors">
                Политика конфиденциальности
              </Link>
              <Link to="/offer" className="block text-sm text-muted-foreground hover:text-primary transition-colors">
                Публичная оферта
              </Link>
              <Link to="/admin" className="block text-sm text-muted-foreground hover:text-primary transition-colors">
                Для партнёров
              </Link>
            </div>
          </div>
        </div>

        <div className="border-t border-border mt-8 pt-8 text-center">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Такси Свои. Все права защищены.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
