import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { roleMatches, useAuth, UserRole } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Car, KeyRound, Phone, User } from "lucide-react";
import { loginByPhonePassword, registerByPhonePassword } from "@/services/authApi";

function parseJwt(token: string) {
  try {
    const [, payload] = token.split(".");
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(normalized)) as { sub?: string; role?: string };
  } catch {
    return null;
  }
}

const Login = () => {
  const { isAuthenticated, setSession, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("passenger");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      return;
    }
    if (roleMatches(user.role, "PASSENGER")) navigate("/passenger", { replace: true });
    else if (roleMatches(user.role, "DRIVER")) navigate("/driver", { replace: true });
    else if (roleMatches(user.role, "ADMIN") || roleMatches(user.role, "DISPATCHER")) {
      navigate("/admin", { replace: true });
    }
  }, [isAuthenticated, navigate, user]);

  const normalizedRole = roleMatches(role, "DRIVER") ? "DRIVER" : "PASSENGER";

  const handleSubmit = async () => {
    if (phone.trim().length < 10) {
      toast({
        title: "Введите корректный номер телефона",
        variant: "destructive",
      });
      return;
    }
    if (password.length < 6) {
      toast({
        title: "Пароль слишком короткий",
        description: "Минимум 6 символов",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    if (mode === "register") {
      const registerResponse = await registerByPhonePassword({
        phone: phone.trim(),
        password,
        role: normalizedRole,
      });
      if (registerResponse.status !== 200 && registerResponse.status !== 201) {
        setLoading(false);
        toast({
          title: "Ошибка регистрации",
          description:
            (registerResponse.body as { message?: string })?.message ||
            "Проверьте данные и попробуйте снова",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Аккаунт создан",
        description: "Теперь выполняется вход",
      });
    }

    const loginResponse = await loginByPhonePassword({
      phone: phone.trim(),
      password,
    });
    setLoading(false);

    if (loginResponse.status !== 200 && loginResponse.status !== 201) {
      toast({
        title: "Ошибка входа",
        description:
          (loginResponse.body as { message?: string })?.message ||
          "Проверьте телефон и пароль",
        variant: "destructive",
      });
      return;
    }

    const token = (loginResponse.body as { accessToken?: string })?.accessToken;
    if (!token) {
      toast({
        title: "Ошибка входа",
        description: "Токен доступа не получен",
        variant: "destructive",
      });
      return;
    }

    const jwt = parseJwt(token);
    const jwtRole = jwt?.role;
    if (jwtRole !== "PASSENGER" && jwtRole !== "DRIVER") {
      toast({
        title: "Роль не поддерживается",
        variant: "destructive",
      });
      return;
    }

    setSession({
      userId: jwt?.sub || `user-${Date.now()}`,
      role: jwtRole,
      phone: phone.trim(),
      name: jwtRole === "DRIVER" ? "Водитель" : "Пассажир",
      accessToken: token,
    });
    toast({ title: "Вход выполнен", description: `Роль: ${jwtRole}` });
    navigate(jwtRole === "DRIVER" ? "/driver" : "/passenger");
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="flex min-h-[80vh] items-center justify-center pb-16 pt-24">
        <Card className="w-full max-w-md border-border bg-card">
          <CardHeader className="text-center">
            <CardTitle className="font-display text-2xl">
              {mode === "register" ? "Регистрация" : "Вход"} в{" "}
              <span className="gold-text">личный кабинет</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant={role === "passenger" ? "default" : "outline"}
                onClick={() => setRole("passenger")}
                className={
                  role === "passenger"
                    ? "gold-gradient border-0 text-primary-foreground"
                    : "border-border"
                }
              >
                <User className="mr-2 h-4 w-4" />
                Пассажир
              </Button>
              <Button
                variant={role === "driver" ? "default" : "outline"}
                onClick={() => setRole("driver")}
                className={
                  role === "driver"
                    ? "gold-gradient border-0 text-primary-foreground"
                    : "border-border"
                }
              >
                <Car className="mr-2 h-4 w-4" />
                Водитель
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-sm text-muted-foreground">Телефон</Label>
                <div className="relative mt-1">
                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="+79001234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="border-border bg-secondary/50 pl-10"
                  />
                </div>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Пароль</Label>
                <div className="relative mt-1">
                  <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder="Минимум 6 символов"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="border-border bg-secondary/50 pl-10"
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  />
                </div>
              </div>
              <Button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full gold-gradient border-0 text-primary-foreground"
              >
                {loading
                  ? "Подождите..."
                  : mode === "register"
                    ? "Создать аккаунт и войти"
                    : "Войти"}
              </Button>
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => setMode(mode === "register" ? "login" : "register")}
              >
                {mode === "register"
                  ? "Уже есть аккаунт? Войти"
                  : "Нет аккаунта? Зарегистрироваться"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
};

export default Login;
