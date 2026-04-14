import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Car, Clock, LogOut, MapPin, Save } from "lucide-react";
import { roleMatches, useAuth } from "@/contexts/AuthContext";
import {
  getDriverEarningsSummary,
  getDriverOrders,
  getDriverProfile,
  getDriverVehicles,
  updateDriverProfile,
} from "@/services/driverAppApi";
import { useToast } from "@/hooks/use-toast";

type DriverRecord = Record<string, unknown>;

function readText(row: DriverRecord, key: string, fallback = "-") {
  const value = row[key];
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return String(value);
}

const DriverDashboard = () => {
  const { user, logout, accessToken } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [city, setCity] = useState("");

  useEffect(() => {
    if (!user || !roleMatches(user.role, "DRIVER")) {
      navigate("/login", { replace: true });
    }
  }, [navigate, user]);

  const ordersQuery = useQuery({
    queryKey: ["driver-orders"],
    queryFn: () => getDriverOrders(accessToken || "", "limit=30"),
    enabled: !!accessToken && !!user && roleMatches(user.role, "DRIVER"),
  });

  const earningsQuery = useQuery({
    queryKey: ["driver-earnings"],
    queryFn: () => getDriverEarningsSummary(accessToken || ""),
    enabled: !!accessToken && !!user && roleMatches(user.role, "DRIVER"),
  });

  const profileQuery = useQuery({
    queryKey: ["driver-profile"],
    queryFn: () => getDriverProfile(accessToken || ""),
    enabled: !!accessToken && !!user && roleMatches(user.role, "DRIVER"),
  });

  const vehiclesQuery = useQuery({
    queryKey: ["driver-vehicles"],
    queryFn: () => getDriverVehicles(accessToken || ""),
    enabled: !!accessToken && !!user && roleMatches(user.role, "DRIVER"),
  });

  useEffect(() => {
    const profile = (profileQuery.data?.body as DriverRecord | undefined) || null;
    if (!profile) {
      return;
    }
    setFirstName(readText(profile, "firstName", ""));
    setLastName(readText(profile, "lastName", ""));
    setCity(readText(profile, "city", ""));
  }, [profileQuery.data]);

  const updateProfileMutation = useMutation({
    mutationFn: () =>
      updateDriverProfile(accessToken || "", {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        city: city.trim() || null,
      }),
    onSuccess: () => {
      toast({ title: "Профиль водителя обновлен" });
      queryClient.invalidateQueries({ queryKey: ["driver-profile"] });
    },
  });

  const orders = useMemo(() => {
    const body = ordersQuery.data?.body as { items?: DriverRecord[] } | undefined;
    return Array.isArray(body?.items) ? body.items : [];
  }, [ordersQuery.data]);

  const earnings = useMemo(() => {
    const body = earningsQuery.data?.body as
      | { totals?: { totalRub?: number; completedTrips?: number } }
      | undefined;
    return {
      totalRub: body?.totals?.totalRub ?? 0,
      completedTrips: body?.totals?.completedTrips ?? 0,
    };
  }, [earningsQuery.data]);

  const vehicles = useMemo(() => {
    const body = vehiclesQuery.data?.body;
    return Array.isArray(body) ? (body as DriverRecord[]) : [];
  }, [vehiclesQuery.data]);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  if (!user || !roleMatches(user.role, "DRIVER")) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pb-16 pt-24">
        <div className="container mx-auto px-4">
          <div className="mb-8 flex items-center justify-between">
            <h1 className="font-display text-3xl font-bold text-foreground md:text-4xl">
              Кабинет <span className="gold-text">водителя</span>
            </h1>
            <Button variant="outline" onClick={handleLogout} className="border-border text-muted-foreground">
              <LogOut className="mr-2 h-4 w-4" /> Выйти
            </Button>
          </div>

          <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3">
            <Card className="border-border bg-card">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-primary">{earnings.completedTrips}</p>
                <p className="text-xs text-muted-foreground">Выполнено поездок</p>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-primary">{Math.round(earnings.totalRub)} ₽</p>
                <p className="text-xs text-muted-foreground">Заработано</p>
              </CardContent>
            </Card>
            <Card className="hidden border-border bg-card md:block">
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-primary">{orders.length}</p>
                <p className="text-xs text-muted-foreground">Записей в истории</p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="profile" className="space-y-6">
            <TabsList className="bg-secondary">
              <TabsTrigger value="profile">Профиль и авто</TabsTrigger>
              <TabsTrigger value="history">История заказов</TabsTrigger>
            </TabsList>

            <TabsContent value="profile">
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Car className="h-5 w-5 text-primary" /> Данные водителя
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Имя</Label>
                      <Input
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="border-border bg-secondary/50"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Фамилия</Label>
                      <Input
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="border-border bg-secondary/50"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Город</Label>
                      <Input
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="border-border bg-secondary/50"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">Активные автомобили</p>
                    {vehiclesQuery.isLoading ? (
                      <p className="text-sm text-muted-foreground">Загрузка автомобилей...</p>
                    ) : vehicles.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Автомобили не найдены.</p>
                    ) : (
                      vehicles.map((vehicle) => (
                        <div
                          key={readText(vehicle, "id")}
                          className="rounded-md border border-border p-3 text-sm"
                        >
                          <p>
                            {readText(vehicle, "brand")} {readText(vehicle, "model")} •{" "}
                            {readText(vehicle, "plateNumber")}
                          </p>
                          <p className="text-muted-foreground">
                            Цвет: {readText(vehicle, "color")} • Активен:{" "}
                            {readText(vehicle, "isActive", "false")}
                          </p>
                        </div>
                      ))
                    )}
                  </div>

                  <Button
                    onClick={() => updateProfileMutation.mutate()}
                    disabled={updateProfileMutation.isPending}
                    className="gold-gradient border-0 text-primary-foreground"
                  >
                    <Save className="mr-1 h-4 w-4" /> Сохранить
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history" className="space-y-4">
              {ordersQuery.isLoading ? (
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
                      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{readText(order, "status")}</Badge>
                            <span className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Clock className="h-3 w-3" /> {readText(order, "createdAt")}
                            </span>
                          </div>
                          <p className="flex items-center gap-1 font-medium text-foreground">
                            <MapPin className="h-4 w-4 text-primary" /> {readText(order, "id")}
                          </p>
                        </div>
                        <p className="text-lg font-bold text-primary">{readText(order, "price")} ₽</p>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default DriverDashboard;
