import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Clock, LogOut, MapPin, User } from "lucide-react";
import { roleMatches, useAuth } from "@/contexts/AuthContext";
import { getPassengerActiveOrder, getPassengerOrders } from "@/services/passengerApi";

type OrderLike = Record<string, unknown>;

function readText(order: OrderLike, key: string, fallback = "-") {
  const value = order[key];
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return String(value);
}

function readNumber(order: OrderLike, key: string) {
  const value = order[key];
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

const PassengerDashboard = () => {
  const { user, logout, accessToken } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user || !roleMatches(user.role, "PASSENGER")) {
      navigate("/login", { replace: true });
    }
  }, [navigate, user]);

  const historyQuery = useQuery({
    queryKey: ["passenger-orders"],
    queryFn: () => getPassengerOrders(accessToken || "", "limit=30"),
    enabled: !!accessToken && !!user && roleMatches(user.role, "PASSENGER"),
  });

  const activeQuery = useQuery({
    queryKey: ["passenger-active-order"],
    queryFn: () => getPassengerActiveOrder(accessToken || ""),
    enabled: !!accessToken && !!user && roleMatches(user.role, "PASSENGER"),
  });

  const orders = useMemo(() => {
    const items = (historyQuery.data?.body as { items?: OrderLike[] } | undefined)?.items;
    return Array.isArray(items) ? items : [];
  }, [historyQuery.data]);

  const activeOrder = useMemo(() => {
    const data = activeQuery.data?.body as { activeOrder?: OrderLike | null } | undefined;
    return data?.activeOrder ?? null;
  }, [activeQuery.data]);

  const totalSpent = useMemo(
    () =>
      orders
        .filter((order) => readText(order, "status") === "DONE")
        .reduce((sum, order) => sum + readNumber(order, "price"), 0),
    [orders],
  );

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  if (!user || !roleMatches(user.role, "PASSENGER")) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pb-16 pt-24">
        <div className="container mx-auto px-4">
          <div className="mb-8 flex items-center justify-between">
            <h1 className="font-display text-3xl font-bold text-foreground md:text-4xl">
              Кабинет <span className="gold-text">пассажира</span>
            </h1>
            <Button variant="outline" onClick={handleLogout} className="border-border text-muted-foreground">
              <LogOut className="mr-2 h-4 w-4" /> Выйти
            </Button>
          </div>

          <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3">
            <Card className="border-border bg-card">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-primary">{orders.length}</p>
                <p className="text-xs text-muted-foreground">Всего заказов</p>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-primary">{Math.round(totalSpent)} ₽</p>
                <p className="text-xs text-muted-foreground">Потрачено</p>
              </CardContent>
            </Card>
            <Card className="hidden border-border bg-card md:block">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-primary">{activeOrder ? 1 : 0}</p>
                <p className="text-xs text-muted-foreground">Активный заказ</p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="active" className="space-y-6">
            <TabsList className="bg-secondary">
              <TabsTrigger value="active">Текущий заказ</TabsTrigger>
              <TabsTrigger value="history">История заказов</TabsTrigger>
              <TabsTrigger value="profile">Профиль</TabsTrigger>
            </TabsList>

            <TabsContent value="active">
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-lg">Активная поездка</CardTitle>
                </CardHeader>
                <CardContent>
                  {activeQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">Загрузка активного заказа...</p>
                  ) : activeOrder ? (
                    <div className="space-y-2 text-sm">
                      <p>
                        <span className="text-muted-foreground">ID:</span> {readText(activeOrder, "id")}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Статус:</span>{" "}
                        <Badge variant="secondary">{readText(activeOrder, "status")}</Badge>
                      </p>
                      <p>
                        <span className="text-muted-foreground">Цена:</span> {readText(activeOrder, "price")} ₽
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Сейчас нет активного заказа.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history" className="space-y-4">
              {historyQuery.isLoading ? (
                <Card className="border-border bg-card">
                  <CardContent className="p-4 text-sm text-muted-foreground">Загрузка истории...</CardContent>
                </Card>
              ) : orders.length === 0 ? (
                <Card className="border-border bg-card">
                  <CardContent className="p-4 text-sm text-muted-foreground">История заказов пуста.</CardContent>
                </Card>
              ) : (
                orders.map((order) => (
                  <Card key={readText(order, "id")} className="border-border bg-card">
                    <CardContent className="p-4">
                      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{readText(order, "status")}</Badge>
                            <span className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Clock className="h-3 w-3" /> {readText(order, "createdAt")}
                            </span>
                          </div>
                          <p className="flex items-center gap-1 font-medium text-foreground">
                            <MapPin className="h-4 w-4 text-primary" />
                            {readText(order, "id")}
                          </p>
                          <p className="text-lg font-bold text-primary">{readText(order, "price")} ₽</p>
                        </div>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <p className="flex items-center gap-1">
                            <User className="h-3 w-3" /> Водитель: {readText(order, "driverId")}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="profile">
              <Card className="max-w-md border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-lg">Профиль</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p>
                    <span className="text-muted-foreground">ID:</span> {user.id}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Телефон:</span> {user.phone || "-"}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Имя:</span> {user.name || "Пассажир"}
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default PassengerDashboard;
