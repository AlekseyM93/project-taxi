import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Car, ListOrdered, LogOut, RefreshCw, ShieldAlert, Users, Zap } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { roleMatches, useAuth } from "@/contexts/AuthContext";
import {
  createSavedFilter,
  executeActionCenter,
  getActionExecutions,
  getActionTemplates,
  getActionsHistory,
  getAdminPanelOrders,
  getAuditFeed,
  getDispatchTower,
  getDriverOps,
  getOpsAlerts,
  getOpsSlo,
  getOpsSummary,
  getAdminMetrics,
  getSavedFilters,
  getSupportCases,
  type AdminListBody,
  type AdminRecord,
} from "@/services/adminApi";

const LIST_KEYS = [
  "items",
  "data",
  "rows",
  "orders",
  "drivers",
  "events",
  "executions",
  "filters",
  "templates",
  "history",
] as const;

type QueryLike = {
  isLoading: boolean;
  isFetching: boolean;
  data?: {
    status: number;
    body: unknown;
    meta?: {
      source?: "live" | "cache";
      cachedAt?: string;
      fallbackStatus?: number;
    };
  };
};

const ADMIN_CACHE_PREFIX = "admin_panel_cache_v1:";

type CachedQueryPayload = {
  status: number;
  body: AdminListBody;
  savedAt: string;
};

function asRecord(value: unknown): AdminRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as AdminRecord;
}

function extractList(body: unknown): AdminRecord[] {
  if (Array.isArray(body)) {
    return body.filter((item): item is AdminRecord => !!asRecord(item));
  }
  const record = asRecord(body);
  if (!record) {
    return [];
  }
  for (const key of LIST_KEYS) {
    const candidate = record[key];
    if (Array.isArray(candidate)) {
      return candidate.filter((item): item is AdminRecord => !!asRecord(item));
    }
  }
  return [];
}

function readText(row: AdminRecord, key: string, fallback = "-"): string {
  const value = row[key];
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function readNumber(row: AdminRecord, key: string): number | null {
  const value = row[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function getStatusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "DONE" || status === "READY" || status === "SUCCESS") {
    return "default";
  }
  if (status === "CANCELLED" || status === "FAILED" || status === "ERROR") {
    return "destructive";
  }
  if (status === "IN_PROGRESS" || status === "ASSIGNED" || status === "BUSY") {
    return "secondary";
  }
  return "outline";
}

function readCachedQuery(cacheKey: string): CachedQueryPayload | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(`${ADMIN_CACHE_PREFIX}${cacheKey}`);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as CachedQueryPayload;
  } catch {
    return null;
  }
}

function saveCachedQuery(cacheKey: string, status: number, body: AdminListBody) {
  if (typeof window === "undefined") {
    return;
  }
  const payload: CachedQueryPayload = {
    status,
    body,
    savedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(`${ADMIN_CACHE_PREFIX}${cacheKey}`, JSON.stringify(payload));
}

async function loadWithAdminCache(
  cacheKey: string,
  loader: () => Promise<{ status: number; body: AdminListBody }>,
) {
  const live = await loader();
  if (live.status >= 200 && live.status < 300) {
    saveCachedQuery(cacheKey, live.status, live.body);
    return {
      ...live,
      meta: { source: "live" as const },
    };
  }

  if (live.status === 0 || live.status >= 500) {
    const cached = readCachedQuery(cacheKey);
    if (cached) {
      return {
        status: cached.status,
        body: cached.body,
        meta: {
          source: "cache" as const,
          cachedAt: cached.savedAt,
          fallbackStatus: live.status,
        },
      };
    }
  }
  return {
    ...live,
    meta: { source: "live" as const },
  };
}

function QueryStatus({ query }: { query: QueryLike }) {
  const statusCode = query.data?.status ?? null;
  const isError = statusCode !== null && statusCode >= 400;
  const dataSource = query.data?.meta?.source;
  return (
    <div className="flex items-center gap-2 text-xs">
      <Badge variant={query.isLoading || query.isFetching ? "secondary" : "outline"}>
        {query.isLoading || query.isFetching ? "Загрузка" : "Ожидание"}
      </Badge>
      {dataSource ? (
        <Badge variant={dataSource === "cache" ? "secondary" : "outline"}>
          {dataSource === "cache" ? "Кэш (резерв)" : "Сеть"}
        </Badge>
      ) : null}
      {statusCode !== null ? (
        <Badge variant={isError ? "destructive" : "outline"}>HTTP {statusCode}</Badge>
      ) : null}
      {query.data?.meta?.cachedAt ? (
        <Badge variant="outline">Кэш от {query.data.meta.cachedAt}</Badge>
      ) : null}
    </div>
  );
}

function JsonDebug({ value }: { value: unknown }) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground">Сырой ответ</summary>
      <pre className="mt-2 overflow-auto rounded-md bg-secondary p-3">{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

const Admin = () => {
  const { toast } = useToast();
  const { user, logout, accessToken } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [orderStatuses, setOrderStatuses] = useState("");
  const [driverOpsState, setDriverOpsState] = useState("ALL");
  const [riskOnly, setRiskOnly] = useState("false");
  const [dispatchRiskOnly, setDispatchRiskOnly] = useState("false");
  const [actionPayload, setActionPayload] = useState({
    actionType: "FORCE_CANCEL_ORDER",
    orderId: "",
    driverId: "",
    dryRun: "true",
    reason: "Manual admin operation",
  });
  const [filterPayload, setFilterPayload] = useState('{"statuses":["SEARCHING"]}');
  const [createdFilterResult, setCreatedFilterResult] = useState<unknown>(null);

  const hasAdminAccess =
    !!user && (roleMatches(user.role, "ADMIN") || roleMatches(user.role, "DISPATCHER"));

  useEffect(() => {
    if (!hasAdminAccess) {
      navigate("/admin/login", { replace: true });
    }
  }, [hasAdminAccess, navigate]);

  const ordersQueryString = useMemo(() => {
    const search = new URLSearchParams();
    search.set("limit", "20");
    if (orderStatuses.trim().length > 0) {
      search.set("statuses", orderStatuses.trim().toUpperCase());
    }
    return search.toString();
  }, [orderStatuses]);

  const driverOpsQueryString = useMemo(() => {
    const search = new URLSearchParams();
    search.set("limit", "20");
    search.set("state", driverOpsState);
    search.set("riskOnly", riskOnly);
    return search.toString();
  }, [driverOpsState, riskOnly]);

  const dispatchQueryString = useMemo(() => {
    const search = new URLSearchParams();
    search.set("limit", "20");
    search.set("riskOnly", dispatchRiskOnly);
    search.set("slaSeconds", "120");
    return search.toString();
  }, [dispatchRiskOnly]);

  const ordersQuery = useQuery({
    queryKey: ["admin-orders", ordersQueryString],
    queryFn: () =>
      loadWithAdminCache(`orders:${ordersQueryString}`, () =>
        getAdminPanelOrders(accessToken || "", ordersQueryString),
      ),
    enabled: !!accessToken && hasAdminAccess,
  });

  const driverOpsQuery = useQuery({
    queryKey: ["admin-driver-ops", driverOpsQueryString],
    queryFn: () =>
      loadWithAdminCache(`drivers:${driverOpsQueryString}`, () =>
        getDriverOps(accessToken || "", driverOpsQueryString),
      ),
    enabled: !!accessToken && hasAdminAccess,
  });

  const dispatchQuery = useQuery({
    queryKey: ["admin-dispatch", dispatchQueryString],
    queryFn: () =>
      loadWithAdminCache(`dispatch:${dispatchQueryString}`, () =>
        getDispatchTower(accessToken || "", dispatchQueryString),
      ),
    enabled: !!accessToken && hasAdminAccess,
  });

  const opsSummaryQuery = useQuery({
    queryKey: ["ops-summary"],
    queryFn: () =>
      loadWithAdminCache("ops-summary:windowMinutes=60", () =>
        getOpsSummary(accessToken || "", "windowMinutes=60"),
      ),
    enabled: !!accessToken && hasAdminAccess,
  });

  const opsSloQuery = useQuery({
    queryKey: ["ops-slo"],
    queryFn: () =>
      loadWithAdminCache("ops-slo:windowMinutes=60", () =>
        getOpsSlo(accessToken || "", "windowMinutes=60"),
      ),
    enabled: !!accessToken && hasAdminAccess,
  });

  const opsAlertsQuery = useQuery({
    queryKey: ["ops-alerts"],
    queryFn: () =>
      loadWithAdminCache("ops-alerts:windowMinutes=60", () =>
        getOpsAlerts(accessToken || "", "windowMinutes=60"),
      ),
    enabled: !!accessToken && hasAdminAccess,
  });

  const auditQuery = useQuery({
    queryKey: ["admin-audit-feed"],
    queryFn: () =>
      loadWithAdminCache("audit:limit=20&kind=ALL", () =>
        getAuditFeed(accessToken || "", "limit=20&kind=ALL"),
      ),
    enabled: !!accessToken && hasAdminAccess,
  });

  const supportCasesQuery = useQuery({
    queryKey: ["support-cases"],
    queryFn: () =>
      loadWithAdminCache("support-cases:limit=30", () =>
        getSupportCases(accessToken || "", "limit=30"),
      ),
    enabled: !!accessToken && hasAdminAccess,
  });

  const adminMetricsQuery = useQuery({
    queryKey: ["admin-metrics"],
    queryFn: () =>
      loadWithAdminCache("admin-metrics:windowMinutes=60", () =>
        getAdminMetrics(accessToken || "", "windowMinutes=60"),
      ),
    enabled: !!accessToken && hasAdminAccess,
  });

  const actionsHistoryQuery = useQuery({
    queryKey: ["admin-actions-history"],
    queryFn: () =>
      loadWithAdminCache("actions-history:limit=20", () =>
        getActionsHistory(accessToken || "", "limit=20"),
      ),
    enabled: !!accessToken && hasAdminAccess,
  });

  const actionTemplatesQuery = useQuery({
    queryKey: ["admin-action-templates"],
    queryFn: () =>
      loadWithAdminCache("action-templates", () => getActionTemplates(accessToken || "")),
    enabled: !!accessToken && hasAdminAccess,
  });

  const actionExecutionsQuery = useQuery({
    queryKey: ["admin-action-executions"],
    queryFn: () =>
      loadWithAdminCache("action-executions:limit=20", () =>
        getActionExecutions(accessToken || "", "limit=20"),
      ),
    enabled: !!accessToken && hasAdminAccess,
  });

  const savedFiltersQuery = useQuery({
    queryKey: ["admin-saved-filters"],
    queryFn: () =>
      loadWithAdminCache("saved-filters:scope=ORDERS", () =>
        getSavedFilters(accessToken || "", "scope=ORDERS"),
      ),
    enabled: !!accessToken && hasAdminAccess,
  });

  const executeActionMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => executeActionCenter(accessToken || "", payload),
    onSuccess: (response) => {
      toast({
        title: response.status < 300 ? "Действие выполнено" : "Ошибка выполнения действия",
      });
      queryClient.invalidateQueries({ queryKey: ["admin-action-executions"] });
    },
  });

  const createFilterMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => createSavedFilter(accessToken || "", payload),
    onSuccess: (response) => {
      setCreatedFilterResult(response);
      queryClient.invalidateQueries({ queryKey: ["admin-saved-filters"] });
    },
  });

  const orders = useMemo(
    () => extractList(ordersQuery.data?.body as AdminListBody | undefined),
    [ordersQuery.data],
  );
  const driverOps = useMemo(
    () => extractList(driverOpsQuery.data?.body as AdminListBody | undefined),
    [driverOpsQuery.data],
  );
  const dispatchRows = useMemo(
    () => extractList(dispatchQuery.data?.body as AdminListBody | undefined),
    [dispatchQuery.data],
  );
  const opsAlerts = useMemo(
    () => extractList(opsAlertsQuery.data?.body as AdminListBody | undefined),
    [opsAlertsQuery.data],
  );
  const actionTemplates = useMemo(
    () => extractList(actionTemplatesQuery.data?.body as AdminListBody | undefined),
    [actionTemplatesQuery.data],
  );
  const actionExecutions = useMemo(
    () => extractList(actionExecutionsQuery.data?.body as AdminListBody | undefined),
    [actionExecutionsQuery.data],
  );
  const auditRows = useMemo(
    () => extractList(auditQuery.data?.body as AdminListBody | undefined),
    [auditQuery.data],
  );
  const actionHistoryRows = useMemo(
    () => extractList(actionsHistoryQuery.data?.body as AdminListBody | undefined),
    [actionsHistoryQuery.data],
  );
  const savedFilters = useMemo(
    () => extractList(savedFiltersQuery.data?.body as AdminListBody | undefined),
    [savedFiltersQuery.data],
  );
  const supportCases = useMemo(
    () => extractList(supportCasesQuery.data?.body as AdminListBody | undefined),
    [supportCasesQuery.data],
  );

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const handleExecuteAction = () => {
    executeActionMutation.mutate({
      actionType: actionPayload.actionType,
      orderId: actionPayload.orderId || undefined,
      driverId: actionPayload.driverId || undefined,
      dryRun: actionPayload.dryRun === "true",
      reason: actionPayload.reason,
    });
  };

  const handleCreateFilter = () => {
    let parsedPayload: unknown = null;
    try {
      parsedPayload = JSON.parse(filterPayload);
    } catch {
      toast({
        title: "Некорректный JSON payload",
        variant: "destructive",
      });
      return;
    }
    createFilterMutation.mutate({
      name: "Фильтр заказов (админ)",
      scope: "ORDERS",
      isPinned: false,
      payload: parsedPayload,
    });
  };

  if (!hasAdminAccess) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pb-16 pt-24">
        <div className="container mx-auto px-4">
          <div className="mb-8 flex items-center justify-between">
            <h1 className="font-display text-3xl font-bold text-foreground md:text-4xl">
              Админ-<span className="gold-text">панель</span>
            </h1>
            <Button variant="outline" onClick={handleLogout} className="border-border text-muted-foreground">
              <LogOut className="mr-2 h-4 w-4" /> Выйти
            </Button>
          </div>

          <Tabs defaultValue="orders" className="space-y-6">
            <TabsList className="bg-secondary">
              <TabsTrigger value="orders">
                <ListOrdered className="mr-1 h-4 w-4" /> Заказы
              </TabsTrigger>
              <TabsTrigger value="drivers">
                <Car className="mr-1 h-4 w-4" /> Водители
              </TabsTrigger>
              <TabsTrigger value="dispatch">
                <Zap className="mr-1 h-4 w-4" /> Диспетчеризация
              </TabsTrigger>
              <TabsTrigger value="ops">
                <ShieldAlert className="mr-1 h-4 w-4" /> Операции
              </TabsTrigger>
              <TabsTrigger value="support">
                <Users className="mr-1 h-4 w-4" /> Поддержка
              </TabsTrigger>
              <TabsTrigger value="finance">
                <ListOrdered className="mr-1 h-4 w-4" /> Финансы
              </TabsTrigger>
              <TabsTrigger value="action-center">
                <ShieldAlert className="mr-1 h-4 w-4" /> Центр действий
              </TabsTrigger>
              <TabsTrigger value="audit">
                <Users className="mr-1 h-4 w-4" /> Аудит
              </TabsTrigger>
            </TabsList>

            <TabsContent value="orders" className="space-y-4">
              <Card className="border-border bg-card">
                <CardContent className="space-y-3 p-4">
                  <Label>Статусы</Label>
                  <div className="flex gap-2">
                    <Input
                      value={orderStatuses}
                      onChange={(e) => setOrderStatuses(e.target.value)}
                      placeholder="SEARCHING,ASSIGNED,IN_PROGRESS"
                    />
                    <Button onClick={() => ordersQuery.refetch()} variant="outline">
                      <RefreshCw className="mr-1 h-4 w-4" /> Обновить
                    </Button>
                  </div>
                  <QueryStatus query={ordersQuery} />
                  {orders.length === 0 ? (
                    <p className="text-sm text-muted-foreground">По текущему фильтру заказы не найдены.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Заказ</TableHead>
                          <TableHead>Статус</TableHead>
                          <TableHead>Пассажир</TableHead>
                          <TableHead>Водитель</TableHead>
                          <TableHead>Создан</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orders.map((row, index) => {
                          const status = readText(row, "status");
                          return (
                            <TableRow key={`${readText(row, "id", "order")}-${index}`}>
                              <TableCell className="font-medium">{readText(row, "id")}</TableCell>
                              <TableCell>
                                <Badge variant={getStatusBadgeVariant(status)}>{status}</Badge>
                              </TableCell>
                              <TableCell>{readText(row, "passengerId")}</TableCell>
                              <TableCell>{readText(row, "driverId")}</TableCell>
                              <TableCell>{readText(row, "createdAt")}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                  <JsonDebug value={ordersQuery.data?.body} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="drivers" className="space-y-4">
              <Card className="border-border bg-card">
                <CardContent className="space-y-3 p-4">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <Input
                      value={driverOpsState}
                      onChange={(e) => setDriverOpsState(e.target.value.toUpperCase())}
                      placeholder="ALL / READY / BUSY / OFFLINE"
                    />
                    <Input
                      value={riskOnly}
                      onChange={(e) => setRiskOnly(e.target.value)}
                      placeholder="true/false"
                    />
                    <Button onClick={() => driverOpsQuery.refetch()} variant="outline">
                      <RefreshCw className="mr-1 h-4 w-4" /> Обновить
                    </Button>
                  </div>
                  <QueryStatus query={driverOpsQuery} />
                  {driverOps.length === 0 ? (
                    <p className="text-sm text-muted-foreground">В выбранном сегменте водители не найдены.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Водитель</TableHead>
                          <TableHead>Состояние</TableHead>
                          <TableHead>Активный заказ</TableHead>
                          <TableHead>Риск-оценка</TableHead>
                          <TableHead>Последняя активность</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {driverOps.map((row, index) => {
                          const state = readText(row, "state");
                          const riskScore = readNumber(row, "riskScore");
                          return (
                            <TableRow key={`${readText(row, "driverId", "driver")}-${index}`}>
                              <TableCell className="font-medium">{readText(row, "driverId")}</TableCell>
                              <TableCell>
                                <Badge variant={getStatusBadgeVariant(state)}>{state}</Badge>
                              </TableCell>
                              <TableCell>{readText(row, "activeOrderId")}</TableCell>
                              <TableCell>{riskScore !== null ? riskScore.toFixed(2) : "-"}</TableCell>
                              <TableCell>{readText(row, "lastSeenAt")}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                  <JsonDebug value={driverOpsQuery.data?.body} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="dispatch" className="space-y-4">
              <Card className="border-border bg-card">
                <CardContent className="space-y-3 p-4">
                  <div className="flex gap-2">
                    <Input
                      value={dispatchRiskOnly}
                      onChange={(e) => setDispatchRiskOnly(e.target.value)}
                      placeholder="riskOnly true/false"
                    />
                    <Button onClick={() => dispatchQuery.refetch()} variant="outline">
                      <RefreshCw className="mr-1 h-4 w-4" /> Обновить
                    </Button>
                  </div>
                  <QueryStatus query={dispatchQuery} />
                  {dispatchRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Активные записи диспетчеризации отсутствуют.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Заказ</TableHead>
                          <TableHead>Статус</TableHead>
                          <TableHead>Время в очереди (с)</TableHead>
                          <TableHead>Нарушение SLA</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dispatchRows.map((row, index) => {
                          const status = readText(row, "status");
                          const queueAge = readNumber(row, "queueAgeSeconds");
                          const slaBreach = readText(row, "slaBreach", "false");
                          return (
                            <TableRow key={`${readText(row, "orderId", "dispatch")}-${index}`}>
                              <TableCell className="font-medium">{readText(row, "orderId")}</TableCell>
                              <TableCell>
                                <Badge variant={getStatusBadgeVariant(status)}>{status}</Badge>
                              </TableCell>
                              <TableCell>{queueAge !== null ? queueAge : "-"}</TableCell>
                              <TableCell>
                                <Badge variant={slaBreach === "true" ? "destructive" : "outline"}>
                                  {slaBreach}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                  <JsonDebug value={dispatchQuery.data?.body} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="ops" className="space-y-4">
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-lg">Control Tower: SLO и алерты</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => opsSummaryQuery.refetch()} variant="outline">
                      Обновить сводку
                    </Button>
                    <Button onClick={() => opsSloQuery.refetch()} variant="outline">
                      Обновить SLO
                    </Button>
                    <Button onClick={() => opsAlertsQuery.refetch()} variant="outline">
                      Обновить алерты
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                    <Card className="border-border bg-background">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Сводка OPS</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <QueryStatus query={opsSummaryQuery} />
                        <JsonDebug value={opsSummaryQuery.data?.body} />
                      </CardContent>
                    </Card>
                    <Card className="border-border bg-background">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">SLO Snapshot</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <QueryStatus query={opsSloQuery} />
                        <JsonDebug value={opsSloQuery.data?.body} />
                      </CardContent>
                    </Card>
                    <Card className="border-border bg-background">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Алерты ({opsAlerts.length})</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <QueryStatus query={opsAlertsQuery} />
                        {opsAlerts.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Активных алертов нет.</p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Ключ</TableHead>
                                <TableHead>Серьезность</TableHead>
                                <TableHead>Сообщение</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {opsAlerts.map((row, index) => (
                                <TableRow key={`${readText(row, "key", "alert")}-${index}`}>
                                  <TableCell>{readText(row, "key")}</TableCell>
                                  <TableCell>
                                    <Badge variant={getStatusBadgeVariant(readText(row, "severity"))}>
                                      {readText(row, "severity")}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>{readText(row, "message")}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                        <JsonDebug value={opsAlertsQuery.data?.body} />
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="support" className="space-y-4">
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-lg">Support Cases</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Button onClick={() => supportCasesQuery.refetch()} variant="outline">
                      Обновить кейсы
                    </Button>
                  </div>
                  <QueryStatus query={supportCasesQuery} />
                  {supportCases.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Открытых обращений нет.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Кейс</TableHead>
                          <TableHead>Статус</TableHead>
                          <TableHead>Приоритет</TableHead>
                          <TableHead>Причина</TableHead>
                          <TableHead>Сообщение</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {supportCases.map((row, index) => (
                          <TableRow key={`${readText(row, "id", "case")}-${index}`}>
                            <TableCell>{readText(row, "id")}</TableCell>
                            <TableCell>
                              <Badge variant={getStatusBadgeVariant(readText(row, "status"))}>
                                {readText(row, "status")}
                              </Badge>
                            </TableCell>
                            <TableCell>{readText(row, "priority")}</TableCell>
                            <TableCell>{readText(row, "reasonCode")}</TableCell>
                            <TableCell>{readText(row, "message")}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  <JsonDebug value={supportCasesQuery.data?.body} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="finance" className="space-y-4">
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-lg">Финансовая и risk-сводка</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Button onClick={() => adminMetricsQuery.refetch()} variant="outline">
                      Обновить метрики
                    </Button>
                    <Button onClick={() => driverOpsQuery.refetch()} variant="outline">
                      Обновить risk-профили
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <Card className="border-border bg-background">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Order Metrics</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <QueryStatus query={adminMetricsQuery} />
                        <JsonDebug value={adminMetricsQuery.data?.body} />
                      </CardContent>
                    </Card>
                    <Card className="border-border bg-background">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Risk Driver Ops</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <QueryStatus query={driverOpsQuery} />
                        <JsonDebug value={driverOpsQuery.data?.body} />
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="action-center" className="space-y-4">
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-lg">Выполнение действия</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <Input
                      value={actionPayload.actionType}
                      onChange={(e) =>
                        setActionPayload({ ...actionPayload, actionType: e.target.value.toUpperCase() })
                      }
                      placeholder="FORCE_CANCEL_ORDER"
                    />
                    <Input
                      value={actionPayload.orderId}
                      onChange={(e) => setActionPayload({ ...actionPayload, orderId: e.target.value })}
                      placeholder="ID заказа"
                    />
                    <Input
                      value={actionPayload.driverId}
                      onChange={(e) => setActionPayload({ ...actionPayload, driverId: e.target.value })}
                      placeholder="ID водителя"
                    />
                    <Input
                      value={actionPayload.dryRun}
                      onChange={(e) => setActionPayload({ ...actionPayload, dryRun: e.target.value })}
                      placeholder="dryRun true/false"
                    />
                    <Input
                      value={actionPayload.reason}
                      onChange={(e) => setActionPayload({ ...actionPayload, reason: e.target.value })}
                      placeholder="Причина"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleExecuteAction}
                      disabled={executeActionMutation.isPending}
                      className="gold-gradient border-0 text-primary-foreground"
                    >
                      Выполнить
                    </Button>
                    <Button onClick={() => actionTemplatesQuery.refetch()} variant="outline">
                      Загрузить шаблоны
                    </Button>
                    <Button onClick={() => actionExecutionsQuery.refetch()} variant="outline">
                      Загрузить выполнения
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <Card className="border-border bg-background">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Шаблоны ({actionTemplates.length})</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <QueryStatus query={actionTemplatesQuery} />
                        <JsonDebug value={actionTemplatesQuery.data?.body} />
                      </CardContent>
                    </Card>
                    <Card className="border-border bg-background">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Выполнения ({actionExecutions.length})</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <QueryStatus query={actionExecutionsQuery} />
                        <JsonDebug value={actionExecutionsQuery.data?.body} />
                      </CardContent>
                    </Card>
                  </div>
                  <JsonDebug value={executeActionMutation.data} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="audit" className="space-y-4">
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-lg">Аудит и сохраненные фильтры</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => auditQuery.refetch()} variant="outline">
                      Загрузить аудит
                    </Button>
                    <Button onClick={() => actionsHistoryQuery.refetch()} variant="outline">
                      Загрузить историю действий
                    </Button>
                    <Button onClick={() => savedFiltersQuery.refetch()} variant="outline">
                      Загрузить фильтры
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={filterPayload}
                      onChange={(e) => setFilterPayload(e.target.value)}
                      placeholder='{"statuses":["SEARCHING"]}'
                    />
                    <Button onClick={handleCreateFilter} className="gold-gradient border-0 text-primary-foreground">
                      Создать фильтр
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                    <Card className="border-border bg-background">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Лента аудита ({auditRows.length})</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <QueryStatus query={auditQuery} />
                        <JsonDebug value={auditQuery.data?.body} />
                      </CardContent>
                    </Card>
                    <Card className="border-border bg-background">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">История действий ({actionHistoryRows.length})</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <QueryStatus query={actionsHistoryQuery} />
                        <JsonDebug value={actionsHistoryQuery.data?.body} />
                      </CardContent>
                    </Card>
                    <Card className="border-border bg-background">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Сохраненные фильтры ({savedFilters.length})</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <QueryStatus query={savedFiltersQuery} />
                        <JsonDebug value={savedFiltersQuery.data?.body} />
                      </CardContent>
                    </Card>
                  </div>
                  <JsonDebug value={createdFilterResult} />
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

export default Admin;
