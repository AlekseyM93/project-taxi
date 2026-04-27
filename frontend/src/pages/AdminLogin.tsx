import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { roleMatches, useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Shield, Lock, User as UserIcon } from "lucide-react";
import { loginByPhonePassword } from "@/services/authApi";

const AdminLogin = () => {
  const { isAuthenticated, setSession, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const adminAuthDisabled =
    import.meta.env.VITE_ADMIN_AUTH_DISABLED === "true" &&
    import.meta.env.MODE !== "production";
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [loading, setLoading] = useState(false);

  const parseJwt = (token: string) => {
    try {
      const [, payload] = token.split(".");
      const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(atob(normalized)) as { sub?: string; role?: string };
    } catch {
      return null;
    }
  };

  if (adminAuthDisabled) {
    navigate("/admin", { replace: true });
  }

  if (
    isAuthenticated &&
    user &&
    (roleMatches(user.role, "ADMIN") || roleMatches(user.role, "DISPATCHER"))
  ) {
    navigate("/admin", { replace: true });
  }

  const handleLogin = async () => {
    setLoading(true);
    const response = await loginByPhonePassword({
      phone: phone.trim(),
      password,
      mfaCode: mfaCode.trim() || undefined,
    });
    setLoading(false);

    if (response.status !== 200 && response.status !== 201) {
      toast({
        title: "Ошибка входа",
        description:
          (response.body as { message?: string })?.message ||
          "Проверьте телефон/пароль",
        variant: "destructive",
      });
      return;
    }

    const token = (response.body as { accessToken?: string })?.accessToken;
    const refreshToken = (response.body as { refreshToken?: string })
      ?.refreshToken;
    if (!token) {
      toast({
        title: "Ошибка входа",
        description: "Токен доступа не получен",
        variant: "destructive",
      });
      return;
    }

    const jwt = parseJwt(token);
    const role = jwt?.role;
    if (role !== "ADMIN" && role !== "DISPATCHER") {
      toast({
        title: "Доступ запрещён",
        description: "Для входа нужен ADMIN или DISPATCHER",
        variant: "destructive",
      });
      return;
    }

    setSession({
      userId: jwt?.sub || "unknown-admin",
      role,
      phone: phone.trim(),
      name: role === "DISPATCHER" ? "Диспетчер" : "Администратор",
      accessToken: token,
      refreshToken,
    });
    toast({ title: "Вход выполнен", description: `Роль: ${role}` });
    navigate("/admin");
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-16 flex items-center justify-center min-h-[80vh]">
        <Card className="w-full max-w-md bg-card border-border">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="font-display text-2xl">
              Админ-<span className="gold-text">панель</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm text-muted-foreground">Логин</Label>
              <div className="relative mt-1">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="+7900..."
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="pl-10 bg-secondary/50 border-border"
                />
              </div>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Пароль</Label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 bg-secondary/50 border-border"
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
              </div>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">
                MFA код (Authenticator)
              </Label>
              <Input
                placeholder="123456"
                value={mfaCode}
                onChange={(e) =>
                  setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 8))
                }
                className="bg-secondary/50 border-border mt-1"
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>
            <Button
              onClick={handleLogin}
              disabled={loading}
              className="w-full gold-gradient text-primary-foreground border-0"
            >
              {loading ? "Входим..." : "Войти"}
            </Button>
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
};

export default AdminLogin;
