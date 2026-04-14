import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, Phone, Sun, Moon, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { roleMatches, useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";

const Header = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const cabinetLink = () => {
    if (!isAuthenticated) return "/login";
    if (user && (roleMatches(user.role, "ADMIN") || roleMatches(user.role, "DISPATCHER"))) return "/admin";
    if (user && roleMatches(user.role, "DRIVER")) return "/driver";
    return "/passenger";
  };

  const cabinetLabel = () => {
    if (!isAuthenticated) return "Личный кабинет";
    if (user && (roleMatches(user.role, "ADMIN") || roleMatches(user.role, "DISPATCHER"))) return "Админ-панель";
    if (user && roleMatches(user.role, "DRIVER")) return "Кабинет водителя";
    return "Кабинет пассажира";
  };

  const links = [
    { to: "/", label: "Главная" },
    { to: "/#delivery", label: "Доставка цветов" },
    { to: cabinetLink(), label: cabinetLabel() },
    { to: "/#contacts", label: "Контакты" },
  ];

  const handleLogout = () => {
    logout();
    navigate("/");
    setIsOpen(false);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass-card">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="font-display text-2xl font-bold gold-text">Такси Свои</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`text-sm font-medium transition-colors hover:text-primary ${
                location.pathname === link.to ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <button onClick={toggleTheme} className="p-2 rounded-md text-muted-foreground hover:text-primary transition-colors" aria-label="Переключить тему">
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <a href="tel:+79001234567" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
            <Phone className="h-4 w-4" />
            <span>+7 (900) 123-45-67</span>
          </a>
          {isAuthenticated ? (
            <Button onClick={handleLogout} variant="outline" size="sm" className="border-border text-muted-foreground">
              <LogOut className="h-4 w-4 mr-1" /> Выйти
            </Button>
          ) : (
            <Button asChild className="gold-gradient text-primary-foreground font-semibold border-0 hover:opacity-90">
              <a href="#calculator">Заказать</a>
            </Button>
          )}
        </div>

        {/* Mobile menu toggle */}
        <div className="md:hidden flex items-center gap-2">
          <button onClick={toggleTheme} className="p-2 text-muted-foreground">
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <button className="text-foreground" onClick={() => setIsOpen(!isOpen)}>
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {isOpen && (
        <div className="md:hidden glass-card border-t border-border">
          <div className="container mx-auto px-4 py-4 flex flex-col gap-3">
            {links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors py-2"
                onClick={() => setIsOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <a href="tel:+79001234567" className="flex items-center gap-2 text-sm text-primary py-2">
              <Phone className="h-4 w-4" />
              +7 (900) 123-45-67
            </a>
            {isAuthenticated ? (
              <Button onClick={handleLogout} variant="outline" className="border-border text-muted-foreground w-full">
                <LogOut className="h-4 w-4 mr-1" /> Выйти
              </Button>
            ) : (
              <Button asChild className="gold-gradient text-primary-foreground font-semibold border-0 w-full">
                <a href="#calculator">Заказать</a>
              </Button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
