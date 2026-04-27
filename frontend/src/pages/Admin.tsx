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
  getOpsPaymentsSecurity,
  getOpsPaymentsSecurityPolicyAudit,
  getOpsPaymentsSecurityPolicies,
  getOpsPaymentsSecurityRunbook,
  getOpsSlo,
  getOpsSummary,
  getAdminMetrics,
  getPricingTariffs,
  getSavedFilters,
  getSupportCases,
  upsertOpsPaymentsSecurityPolicy,
  upsertPricingTariff,
  type AdminListBody,
} from "@/services/adminApi";
import AdminOpsTab from "@/features/admin/components/AdminOpsTab";
import { JsonDebug, QueryStatus } from "@/features/admin/components/AdminResponseWidgets";
import {
  asRecord,
  extractList,
  getStatusBadgeVariant,
  loadWithAdminCache,
  mapRecordToRows,
  readNumber,
  readText,
} from "@/features/admin/admin-helpers";

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
    reason: "",
  });
  const [filterPayload, setFilterPayload] = useState("");
  const [createdFilterResult, setCreatedFilterResult] = useState<unknown>(null);
  const [pricingCityId, setPricingCityId] = useState("MOSCOW");
  const [pricingForm, setPricingForm] = useState({
    cityTier: "CITY_TIER_A",
    serviceLevel: "ECONOMY",
    fareBaseRub: "159",
    farePerKmRub: "14",
    farePerMinuteRub: "12",
    minFareRub: "179",
    includedKm: "1",
    includedMinutes: "3",
    freeWaitingSeconds: "180",
    waitingPerMinuteRub: "12",
    cancelFeeRub: "79",
    noShowFeeRub: "129",
    outOfCityPerKmRub: "20",
    airportSurchargeRub: "150",
    childSeatRub: "150",
    petRub: "100",
    extraStopRub: "100",
    maxSurgeMultiplier: "2",
    commissionPercent: "14",
    minimumPlatformFeeRub: "45",
  });
  const [paymentPolicyForm, setPaymentPolicyForm] = useState({
    ruleCode: "",
    reasonCode: "",
    severity: "WARN",
    comparator: "GTE",
    threshold: "",
    message: "",
    suggestedActions: "",
    isEnabled: "true",
  });
  const adminAuthDisabled = import.meta.env.VITE_ADMIN_AUTH_DISABLED === "true";

  const hasAdminAccess =
    adminAuthDisabled ||
    (!!user && (roleMatches(user.role, "ADMIN") || roleMatches(user.role, "DISPATCHER")));
  const canUseAdminApi = hasAdminAccess && (adminAuthDisabled || !!accessToken);

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
    enabled: canUseAdminApi,
  });

  const driverOpsQuery = useQuery({
    queryKey: ["admin-driver-ops", driverOpsQueryString],
    queryFn: () =>
      loadWithAdminCache(`drivers:${driverOpsQueryString}`, () =>
        getDriverOps(accessToken || "", driverOpsQueryString),
      ),
    enabled: canUseAdminApi,
  });

  const dispatchQuery = useQuery({
    queryKey: ["admin-dispatch", dispatchQueryString],
    queryFn: () =>
      loadWithAdminCache(`dispatch:${dispatchQueryString}`, () =>
        getDispatchTower(accessToken || "", dispatchQueryString),
      ),
    enabled: canUseAdminApi,
  });

  const opsSummaryQuery = useQuery({
    queryKey: ["ops-summary"],
    queryFn: () =>
      loadWithAdminCache("ops-summary:windowMinutes=60", () =>
        getOpsSummary(accessToken || "", "windowMinutes=60"),
      ),
    enabled: canUseAdminApi,
  });

  const opsSloQuery = useQuery({
    queryKey: ["ops-slo"],
    queryFn: () =>
      loadWithAdminCache("ops-slo:windowMinutes=60", () =>
        getOpsSlo(accessToken || "", "windowMinutes=60"),
      ),
    enabled: canUseAdminApi,
  });

  const opsAlertsQuery = useQuery({
    queryKey: ["ops-alerts"],
    queryFn: () =>
      loadWithAdminCache("ops-alerts:windowMinutes=60", () =>
        getOpsAlerts(accessToken || "", "windowMinutes=60"),
      ),
    enabled: canUseAdminApi,
  });

  const opsPaymentsSecurityQuery = useQuery({
    queryKey: ["ops-payments-security"],
    queryFn: () =>
      loadWithAdminCache("ops-payments-security:windowMinutes=60", () =>
        getOpsPaymentsSecurity(accessToken || "", "windowMinutes=60"),
      ),
    enabled: canUseAdminApi,
  });
  const opsPaymentsSecurityRunbookQuery = useQuery({
    queryKey: ["ops-payments-security-runbook"],
    queryFn: () =>
      loadWithAdminCache("ops-payments-security-runbook:windowMinutes=60", () =>
        getOpsPaymentsSecurityRunbook(accessToken || "", "windowMinutes=60"),
      ),
    enabled: canUseAdminApi,
  });
  const opsPaymentsSecurityPoliciesQuery = useQuery({
    queryKey: ["ops-payments-security-policies"],
    queryFn: () =>
      loadWithAdminCache("ops-payments-security-policies", () =>
        getOpsPaymentsSecurityPolicies(accessToken || ""),
      ),
    enabled: canUseAdminApi,
  });
  const opsPaymentsSecurityPolicyAuditQuery = useQuery({
    queryKey: ["ops-payments-security-policy-audit"],
    queryFn: () =>
      loadWithAdminCache("ops-payments-security-policy-audit:limit=50", () =>
        getOpsPaymentsSecurityPolicyAudit(accessToken || "", "limit=50"),
      ),
    enabled: canUseAdminApi,
  });

  const auditQuery = useQuery({
    queryKey: ["admin-audit-feed"],
    queryFn: () =>
      loadWithAdminCache("audit:limit=20&kind=ALL", () =>
        getAuditFeed(accessToken || "", "limit=20&kind=ALL"),
      ),
    enabled: canUseAdminApi,
  });

  const supportCasesQuery = useQuery({
    queryKey: ["support-cases"],
    queryFn: () =>
      loadWithAdminCache("support-cases:limit=30", () =>
        getSupportCases(accessToken || "", "limit=30"),
      ),
    enabled: canUseAdminApi,
  });

  const pricingQuery = useQuery({
    queryKey: ["admin-pricing-tariffs", pricingCityId],
    queryFn: () =>
      loadWithAdminCache(`pricing:${pricingCityId}`, () =>
        getPricingTariffs(accessToken || "", `cityId=${encodeURIComponent(pricingCityId)}`),
      ),
    enabled: canUseAdminApi,
  });

  const adminMetricsQuery = useQuery({
    queryKey: ["admin-metrics"],
    queryFn: () =>
      loadWithAdminCache("admin-metrics:windowMinutes=60", () =>
        getAdminMetrics(accessToken || "", "windowMinutes=60"),
      ),
    enabled: canUseAdminApi,
  });

  const actionsHistoryQuery = useQuery({
    queryKey: ["admin-actions-history"],
    queryFn: () =>
      loadWithAdminCache("actions-history:limit=20", () =>
        getActionsHistory(accessToken || "", "limit=20"),
      ),
    enabled: canUseAdminApi,
  });

  const actionTemplatesQuery = useQuery({
    queryKey: ["admin-action-templates"],
    queryFn: () =>
      loadWithAdminCache("action-templates", () => getActionTemplates(accessToken || "")),
    enabled: canUseAdminApi,
  });

  const actionExecutionsQuery = useQuery({
    queryKey: ["admin-action-executions"],
    queryFn: () =>
      loadWithAdminCache("action-executions:limit=20", () =>
        getActionExecutions(accessToken || "", "limit=20"),
      ),
    enabled: canUseAdminApi,
  });

  const savedFiltersQuery = useQuery({
    queryKey: ["admin-saved-filters"],
    queryFn: () =>
      loadWithAdminCache("saved-filters:scope=ORDERS", () =>
        getSavedFilters(accessToken || "", "scope=ORDERS"),
      ),
    enabled: canUseAdminApi,
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

  const upsertPricingMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => upsertPricingTariff(accessToken || "", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-pricing-tariffs"] });
      toast({
        title: "Тариф сохранен",
      });
    },
  });
  const upsertPaymentPolicyMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      upsertOpsPaymentsSecurityPolicy(accessToken || "", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ops-payments-security-policies"] });
      queryClient.invalidateQueries({ queryKey: ["ops-payments-security-runbook"] });
      queryClient.invalidateQueries({ queryKey: ["ops-payments-security-policy-audit"] });
      toast({
        title: "Политика webhook security сохранена",
      });
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
  const opsPaymentsSecurityLatest = useMemo(
    () => extractList((opsPaymentsSecurityQuery.data?.body as AdminListBody | undefined)?.latest),
    [opsPaymentsSecurityQuery.data],
  );
  const opsPaymentsSecurityReasons = useMemo(
    () =>
      mapRecordToRows(
        asRecord(opsPaymentsSecurityQuery.data?.body as unknown)?.byReason,
        "reasonCode",
        "count",
      ),
    [opsPaymentsSecurityQuery.data],
  );
  const opsPaymentsSecurityRunbookItems = useMemo(
    () => extractList((opsPaymentsSecurityRunbookQuery.data?.body as AdminListBody | undefined)?.items),
    [opsPaymentsSecurityRunbookQuery.data],
  );
  const opsPaymentsSecurityPolicies = useMemo(
    () => extractList((opsPaymentsSecurityPoliciesQuery.data?.body as AdminListBody | undefined)?.items),
    [opsPaymentsSecurityPoliciesQuery.data],
  );
  const opsPaymentsSecurityPolicyAuditRows = useMemo(
    () => extractList((opsPaymentsSecurityPolicyAuditQuery.data?.body as AdminListBody | undefined)?.items),
    [opsPaymentsSecurityPolicyAuditQuery.data],
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
  const pricingRows = useMemo(
    () => extractList(pricingQuery.data?.body as AdminListBody | undefined),
    [pricingQuery.data],
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

  const handleUpsertTariff = () => {
    upsertPricingMutation.mutate({
      cityId: pricingCityId.trim().toUpperCase(),
      cityTier: pricingForm.cityTier,
      serviceLevel: pricingForm.serviceLevel,
      fareBaseRub: Number(pricingForm.fareBaseRub),
      farePerKmRub: Number(pricingForm.farePerKmRub),
      farePerMinuteRub: Number(pricingForm.farePerMinuteRub),
      minFareRub: Number(pricingForm.minFareRub),
      includedKm: Number(pricingForm.includedKm),
      includedMinutes: Number(pricingForm.includedMinutes),
      freeWaitingSeconds: Number(pricingForm.freeWaitingSeconds),
      waitingPerMinuteRub: Number(pricingForm.waitingPerMinuteRub),
      cancelFeeRub: Number(pricingForm.cancelFeeRub),
      noShowFeeRub: Number(pricingForm.noShowFeeRub),
      outOfCityPerKmRub: Number(pricingForm.outOfCityPerKmRub),
      airportSurchargeRub: Number(pricingForm.airportSurchargeRub),
      childSeatRub: Number(pricingForm.childSeatRub),
      petRub: Number(pricingForm.petRub),
      extraStopRub: Number(pricingForm.extraStopRub),
      maxSurgeMultiplier: Number(pricingForm.maxSurgeMultiplier),
      commissionPercent: Number(pricingForm.commissionPercent),
      minimumPlatformFeeRub: Number(pricingForm.minimumPlatformFeeRub),
    });
  };

  const handleUpsertPaymentPolicy = () => {
    const threshold = Number(paymentPolicyForm.threshold);
    if (!Number.isFinite(threshold) || threshold < 0) {
      toast({
        title: "Некорректный threshold",
        variant: "destructive",
      });
      return;
    }
    const suggestedActions = paymentPolicyForm.suggestedActions
      .split("|")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    upsertPaymentPolicyMutation.mutate({
      ruleCode: paymentPolicyForm.ruleCode.trim().toUpperCase(),
      reasonCode: paymentPolicyForm.reasonCode.trim().toUpperCase(),
      severity: paymentPolicyForm.severity,
      comparator: paymentPolicyForm.comparator,
      threshold,
      message: paymentPolicyForm.message.trim(),
      suggestedActions,
      isEnabled: paymentPolicyForm.isEnabled === "true",
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
              <TabsTrigger value="pricing">
                <Zap className="mr-1 h-4 w-4" /> Тарифы
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
                      placeholder="Только рискованные (true/false)"
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

            <AdminOpsTab
              opsSummaryQuery={opsSummaryQuery}
              opsSloQuery={opsSloQuery}
              opsAlertsQuery={opsAlertsQuery}
              opsPaymentsSecurityQuery={opsPaymentsSecurityQuery}
              opsPaymentsSecurityRunbookQuery={opsPaymentsSecurityRunbookQuery}
              opsPaymentsSecurityPoliciesQuery={opsPaymentsSecurityPoliciesQuery}
              opsPaymentsSecurityPolicyAuditQuery={opsPaymentsSecurityPolicyAuditQuery}
              opsAlerts={opsAlerts}
              opsPaymentsSecurityReasons={opsPaymentsSecurityReasons}
              opsPaymentsSecurityLatest={opsPaymentsSecurityLatest}
              opsPaymentsSecurityRunbookItems={opsPaymentsSecurityRunbookItems}
              opsPaymentsSecurityPolicies={opsPaymentsSecurityPolicies}
              opsPaymentsSecurityPolicyAuditRows={opsPaymentsSecurityPolicyAuditRows}
              paymentPolicyForm={paymentPolicyForm}
              setPaymentPolicyForm={setPaymentPolicyForm}
              handleUpsertPaymentPolicy={handleUpsertPaymentPolicy}
              isUpsertPaymentPolicyPending={upsertPaymentPolicyMutation.isPending}
            />

            <TabsContent value="support" className="space-y-4">
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-lg">Обращения поддержки</CardTitle>
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
                  <CardTitle className="text-lg">Финансовая и риск-сводка</CardTitle>
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
                        <CardTitle className="text-sm">Метрики заказов</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <QueryStatus query={adminMetricsQuery} />
                        <JsonDebug value={adminMetricsQuery.data?.body} />
                      </CardContent>
                    </Card>
                    <Card className="border-border bg-background">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Риск-профиль водителей</CardTitle>
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

            <TabsContent value="pricing" className="space-y-4">
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-lg">Управление тарифами</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                    <Input
                      value={pricingCityId}
                      onChange={(e) => setPricingCityId(e.target.value.toUpperCase())}
                      placeholder="CITY_ID"
                    />
                    <Input
                      value={pricingForm.cityTier}
                      onChange={(e) => setPricingForm({ ...pricingForm, cityTier: e.target.value.toUpperCase() })}
                      placeholder="CITY_TIER_A..E"
                    />
                    <Input
                      value={pricingForm.serviceLevel}
                      onChange={(e) =>
                        setPricingForm({ ...pricingForm, serviceLevel: e.target.value.toUpperCase() })
                      }
                      placeholder="ECONOMY/COMFORT/BUSINESS"
                    />
                    <Button onClick={() => pricingQuery.refetch()} variant="outline">
                      <RefreshCw className="mr-1 h-4 w-4" /> Обновить
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    <Input value={pricingForm.fareBaseRub} onChange={(e) => setPricingForm({ ...pricingForm, fareBaseRub: e.target.value })} placeholder="fareBaseRub" />
                    <Input value={pricingForm.farePerKmRub} onChange={(e) => setPricingForm({ ...pricingForm, farePerKmRub: e.target.value })} placeholder="farePerKmRub" />
                    <Input value={pricingForm.farePerMinuteRub} onChange={(e) => setPricingForm({ ...pricingForm, farePerMinuteRub: e.target.value })} placeholder="farePerMinuteRub" />
                    <Input value={pricingForm.minFareRub} onChange={(e) => setPricingForm({ ...pricingForm, minFareRub: e.target.value })} placeholder="minFareRub" />
                    <Input value={pricingForm.includedKm} onChange={(e) => setPricingForm({ ...pricingForm, includedKm: e.target.value })} placeholder="includedKm" />
                    <Input value={pricingForm.includedMinutes} onChange={(e) => setPricingForm({ ...pricingForm, includedMinutes: e.target.value })} placeholder="includedMinutes" />
                    <Input value={pricingForm.freeWaitingSeconds} onChange={(e) => setPricingForm({ ...pricingForm, freeWaitingSeconds: e.target.value })} placeholder="freeWaitingSeconds" />
                    <Input value={pricingForm.waitingPerMinuteRub} onChange={(e) => setPricingForm({ ...pricingForm, waitingPerMinuteRub: e.target.value })} placeholder="waitingPerMinuteRub" />
                    <Input value={pricingForm.cancelFeeRub} onChange={(e) => setPricingForm({ ...pricingForm, cancelFeeRub: e.target.value })} placeholder="cancelFeeRub" />
                    <Input value={pricingForm.noShowFeeRub} onChange={(e) => setPricingForm({ ...pricingForm, noShowFeeRub: e.target.value })} placeholder="noShowFeeRub" />
                    <Input value={pricingForm.outOfCityPerKmRub} onChange={(e) => setPricingForm({ ...pricingForm, outOfCityPerKmRub: e.target.value })} placeholder="outOfCityPerKmRub" />
                    <Input value={pricingForm.airportSurchargeRub} onChange={(e) => setPricingForm({ ...pricingForm, airportSurchargeRub: e.target.value })} placeholder="airportSurchargeRub" />
                    <Input value={pricingForm.childSeatRub} onChange={(e) => setPricingForm({ ...pricingForm, childSeatRub: e.target.value })} placeholder="childSeatRub" />
                    <Input value={pricingForm.petRub} onChange={(e) => setPricingForm({ ...pricingForm, petRub: e.target.value })} placeholder="petRub" />
                    <Input value={pricingForm.extraStopRub} onChange={(e) => setPricingForm({ ...pricingForm, extraStopRub: e.target.value })} placeholder="extraStopRub" />
                    <Input value={pricingForm.maxSurgeMultiplier} onChange={(e) => setPricingForm({ ...pricingForm, maxSurgeMultiplier: e.target.value })} placeholder="maxSurgeMultiplier" />
                    <Input value={pricingForm.commissionPercent} onChange={(e) => setPricingForm({ ...pricingForm, commissionPercent: e.target.value })} placeholder="commissionPercent" />
                    <Input value={pricingForm.minimumPlatformFeeRub} onChange={(e) => setPricingForm({ ...pricingForm, minimumPlatformFeeRub: e.target.value })} placeholder="minimumPlatformFeeRub" />
                  </div>
                  <Button
                    onClick={handleUpsertTariff}
                    disabled={upsertPricingMutation.isPending}
                    className="gold-gradient border-0 text-primary-foreground"
                  >
                    Сохранить тариф
                  </Button>
                  <QueryStatus query={pricingQuery} />
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>City</TableHead>
                        <TableHead>Tier</TableHead>
                        <TableHead>Level</TableHead>
                        <TableHead>Base</TableHead>
                        <TableHead>PerKm</TableHead>
                        <TableHead>PerMin</TableHead>
                        <TableHead>Min</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pricingRows.map((row, index) => (
                        <TableRow key={`${readText(row, "id", "tariff")}-${index}`}>
                          <TableCell>{readText(row, "cityId")}</TableCell>
                          <TableCell>{readText(row, "cityTier")}</TableCell>
                          <TableCell>{readText(row, "serviceLevel")}</TableCell>
                          <TableCell>{readText(row, "fareBaseRub")}</TableCell>
                          <TableCell>{readText(row, "farePerKmRub")}</TableCell>
                          <TableCell>{readText(row, "farePerMinuteRub")}</TableCell>
                          <TableCell>{readText(row, "minFareRub")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <JsonDebug value={pricingQuery.data?.body} />
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
                      placeholder="Тип действия"
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
                      placeholder="Пробный режим (true/false)"
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
                      placeholder='Пример: {"statuses":["SEARCHING"]}'
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
