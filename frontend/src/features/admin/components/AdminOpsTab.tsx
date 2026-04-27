import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsContent } from "@/components/ui/tabs";
import type { AdminRecord } from "@/services/adminApi";
import { asRecord, getStatusBadgeVariant, readText } from "@/features/admin/admin-helpers";
import { JsonDebug, QueryStatus, type QueryLike } from "./AdminResponseWidgets";

type QueryWithRefetch = QueryLike & { refetch: () => unknown };

export type PaymentPolicyFormState = {
  ruleCode: string;
  reasonCode: string;
  severity: string;
  comparator: string;
  threshold: string;
  message: string;
  suggestedActions: string;
  isEnabled: string;
};

type AdminOpsTabProps = {
  opsSummaryQuery: QueryWithRefetch;
  opsSloQuery: QueryWithRefetch;
  opsAlertsQuery: QueryWithRefetch;
  opsPaymentsSecurityQuery: QueryWithRefetch;
  opsPaymentsSecurityRunbookQuery: QueryWithRefetch;
  opsPaymentsSecurityPoliciesQuery: QueryWithRefetch;
  opsPaymentsSecurityPolicyAuditQuery: QueryWithRefetch;
  opsAlerts: AdminRecord[];
  opsPaymentsSecurityReasons: AdminRecord[];
  opsPaymentsSecurityLatest: AdminRecord[];
  opsPaymentsSecurityRunbookItems: AdminRecord[];
  opsPaymentsSecurityPolicies: AdminRecord[];
  opsPaymentsSecurityPolicyAuditRows: AdminRecord[];
  paymentPolicyForm: PaymentPolicyFormState;
  setPaymentPolicyForm: React.Dispatch<React.SetStateAction<PaymentPolicyFormState>>;
  handleUpsertPaymentPolicy: () => void;
  isUpsertPaymentPolicyPending: boolean;
};

export default function AdminOpsTab({
  opsSummaryQuery,
  opsSloQuery,
  opsAlertsQuery,
  opsPaymentsSecurityQuery,
  opsPaymentsSecurityRunbookQuery,
  opsPaymentsSecurityPoliciesQuery,
  opsPaymentsSecurityPolicyAuditQuery,
  opsAlerts,
  opsPaymentsSecurityReasons,
  opsPaymentsSecurityLatest,
  opsPaymentsSecurityRunbookItems,
  opsPaymentsSecurityPolicies,
  opsPaymentsSecurityPolicyAuditRows,
  paymentPolicyForm,
  setPaymentPolicyForm,
  handleUpsertPaymentPolicy,
  isUpsertPaymentPolicyPending,
}: AdminOpsTabProps) {
  return (
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
            <Button onClick={() => opsPaymentsSecurityQuery.refetch()} variant="outline">
              Обновить платежную безопасность
            </Button>
            <Button onClick={() => opsPaymentsSecurityRunbookQuery.refetch()} variant="outline">
              Обновить рекомендации
            </Button>
            <Button onClick={() => opsPaymentsSecurityPoliciesQuery.refetch()} variant="outline">
              Обновить правила
            </Button>
            <Button onClick={() => opsPaymentsSecurityPolicyAuditQuery.refetch()} variant="outline">
              Обновить историю изменений
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
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
            <Card className="border-border bg-background">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Безопасность платежных webhook</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <QueryStatus query={opsPaymentsSecurityQuery} />
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded border border-border p-2">
                    <p className="text-muted-foreground">Accepted</p>
                    <p className="font-semibold">
                      {readText(
                        asRecord(opsPaymentsSecurityQuery.data?.body as unknown) || {},
                        "accepted",
                        "0",
                      )}
                    </p>
                  </div>
                  <div className="rounded border border-border p-2">
                    <p className="text-muted-foreground">Rejected</p>
                    <p className="font-semibold">
                      {readText(
                        asRecord(opsPaymentsSecurityQuery.data?.body as unknown) || {},
                        "rejected",
                        "0",
                      )}
                    </p>
                  </div>
                  <div className="rounded border border-border p-2">
                    <p className="text-muted-foreground">Reject rate</p>
                    <p className="font-semibold">
                      {readText(
                        asRecord(opsPaymentsSecurityQuery.data?.body as unknown) || {},
                        "rejectRatePct",
                        "0",
                      )}
                      %
                    </p>
                  </div>
                  <div className="rounded border border-border p-2">
                    <p className="text-muted-foreground">Total</p>
                    <p className="font-semibold">
                      {readText(asRecord(opsPaymentsSecurityQuery.data?.body as unknown) || {}, "total", "0")}
                    </p>
                  </div>
                </div>
                <JsonDebug value={opsPaymentsSecurityQuery.data?.body} />
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Card className="border-border bg-background">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Причины отклонения ({opsPaymentsSecurityReasons.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {opsPaymentsSecurityReasons.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Причины отклонений пока не накоплены.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Причина</TableHead>
                        <TableHead>Количество</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {opsPaymentsSecurityReasons.map((row, index) => (
                        <TableRow key={`${readText(row, "reasonCode", "reason")}-${index}`}>
                          <TableCell>{readText(row, "reasonCode")}</TableCell>
                          <TableCell>{readText(row, "count")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
            <Card className="border-border bg-background">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Последние webhook security события ({opsPaymentsSecurityLatest.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {opsPaymentsSecurityLatest.length === 0 ? (
                  <p className="text-sm text-muted-foreground">События отсутствуют.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Провайдер</TableHead>
                        <TableHead>Результат</TableHead>
                        <TableHead>Причина</TableHead>
                        <TableHead>Событие</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {opsPaymentsSecurityLatest.slice(0, 20).map((row, index) => (
                        <TableRow key={`${readText(row, "id", "security-event")}-${index}`}>
                          <TableCell>{readText(row, "provider")}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                readText(row, "outcome") === "REJECTED" ? "destructive" : "default"
                              }
                            >
                              {readText(row, "outcome")}
                            </Badge>
                          </TableCell>
                          <TableCell>{readText(row, "reasonCode")}</TableCell>
                          <TableCell>{readText(row, "eventType")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-border bg-background">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                Runbook рекомендации ({opsPaymentsSecurityRunbookItems.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <QueryStatus query={opsPaymentsSecurityRunbookQuery} />
              {opsPaymentsSecurityRunbookItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">Рекомендации пока не сформированы.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Проверка</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Текущее / Порог</TableHead>
                      <TableHead>Рекомендованные действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {opsPaymentsSecurityRunbookItems.map((row, index) => {
                      const suggestedActions = Array.isArray(row.suggestedActions)
                        ? row.suggestedActions
                            .map((entry) => (typeof entry === "string" ? entry : null))
                            .filter((entry): entry is string => entry !== null)
                            .join(" | ")
                        : readText(row, "suggestedActions");
                      return (
                        <TableRow key={`${readText(row, "id", "runbook")}-${index}`}>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="font-medium">{readText(row, "reasonCode")}</p>
                              <p className="text-xs text-muted-foreground">{readText(row, "message")}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={readText(row, "status") === "OPEN" ? "destructive" : "default"}
                            >
                              {readText(row, "status")}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {readText(row, "currentValue")} / {readText(row, "threshold")}
                          </TableCell>
                          <TableCell className="max-w-[480px] text-xs text-muted-foreground">
                            {suggestedActions}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
              <JsonDebug value={opsPaymentsSecurityRunbookQuery.data?.body} />
            </CardContent>
          </Card>

          <Card className="border-border bg-background">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Настройка правил ({opsPaymentsSecurityPolicies.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <QueryStatus query={opsPaymentsSecurityPoliciesQuery} />
              <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                <Input
                  value={paymentPolicyForm.ruleCode}
                  onChange={(e) =>
                    setPaymentPolicyForm({ ...paymentPolicyForm, ruleCode: e.target.value.toUpperCase() })
                  }
                  placeholder="Код правила"
                />
                <Input
                  value={paymentPolicyForm.reasonCode}
                  onChange={(e) =>
                    setPaymentPolicyForm({ ...paymentPolicyForm, reasonCode: e.target.value.toUpperCase() })
                  }
                  placeholder="Код причины"
                />
                <Input
                  value={paymentPolicyForm.severity}
                  onChange={(e) =>
                    setPaymentPolicyForm({ ...paymentPolicyForm, severity: e.target.value.toUpperCase() })
                  }
                  placeholder="Серьезность (WARN/CRITICAL)"
                />
                <Input
                  value={paymentPolicyForm.comparator}
                  onChange={(e) =>
                    setPaymentPolicyForm({ ...paymentPolicyForm, comparator: e.target.value.toUpperCase() })
                  }
                  placeholder="Сравнение (GT/GTE)"
                />
                <Input
                  value={paymentPolicyForm.threshold}
                  onChange={(e) => setPaymentPolicyForm({ ...paymentPolicyForm, threshold: e.target.value })}
                  placeholder="Порог"
                />
                <Input
                  value={paymentPolicyForm.isEnabled}
                  onChange={(e) => setPaymentPolicyForm({ ...paymentPolicyForm, isEnabled: e.target.value })}
                  placeholder="true/false"
                />
                <Input
                  className="md:col-span-2"
                  value={paymentPolicyForm.message}
                  onChange={(e) => setPaymentPolicyForm({ ...paymentPolicyForm, message: e.target.value })}
                  placeholder="Текст правила"
                />
                <Input
                  className="md:col-span-4"
                  value={paymentPolicyForm.suggestedActions}
                  onChange={(e) =>
                    setPaymentPolicyForm({ ...paymentPolicyForm, suggestedActions: e.target.value })
                  }
                  placeholder="Действия через |"
                />
              </div>
              <Button
                onClick={handleUpsertPaymentPolicy}
                disabled={isUpsertPaymentPolicyPending}
                className="gold-gradient border-0 text-primary-foreground"
              >
                Сохранить правило
              </Button>
              {opsPaymentsSecurityPolicies.length === 0 ? (
                <p className="text-sm text-muted-foreground">Политики пока не загружены.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Правило</TableHead>
                      <TableHead>Причина</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Comparator</TableHead>
                      <TableHead>Threshold</TableHead>
                      <TableHead>Enabled</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {opsPaymentsSecurityPolicies.map((row, index) => (
                      <TableRow
                        key={`${readText(row, "id", "policy")}-${index}`}
                        className="cursor-pointer"
                        onClick={() =>
                          setPaymentPolicyForm({
                            ruleCode: readText(row, "ruleCode", ""),
                            reasonCode: readText(row, "reasonCode", ""),
                            severity: readText(row, "severity", "WARN"),
                            comparator: readText(row, "comparator", "GTE"),
                            threshold: readText(row, "threshold", "0"),
                            message: readText(row, "message", ""),
                            suggestedActions: Array.isArray(row.suggestedActions)
                              ? row.suggestedActions
                                  .map((entry) => (typeof entry === "string" ? entry : null))
                                  .filter((entry): entry is string => entry !== null)
                                  .join(" | ")
                              : "",
                            isEnabled: readText(row, "isEnabled", "true"),
                          })
                        }
                      >
                        <TableCell>{readText(row, "ruleCode")}</TableCell>
                        <TableCell>{readText(row, "reasonCode")}</TableCell>
                        <TableCell>{readText(row, "severity")}</TableCell>
                        <TableCell>{readText(row, "comparator")}</TableCell>
                        <TableCell>{readText(row, "threshold")}</TableCell>
                        <TableCell>{readText(row, "isEnabled")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <JsonDebug value={opsPaymentsSecurityPoliciesQuery.data?.body} />
            </CardContent>
          </Card>

          <Card className="border-border bg-background">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                История изменений правил ({opsPaymentsSecurityPolicyAuditRows.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <QueryStatus query={opsPaymentsSecurityPolicyAuditQuery} />
              {opsPaymentsSecurityPolicyAuditRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Изменения правил пока не зафиксированы.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Время</TableHead>
                      <TableHead>Правило</TableHead>
                      <TableHead>Причина</TableHead>
                      <TableHead>Кто изменил</TableHead>
                      <TableHead>Действие</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {opsPaymentsSecurityPolicyAuditRows.map((row, index) => (
                      <TableRow key={`${readText(row, "id", "policy-audit")}-${index}`}>
                        <TableCell>{readText(row, "createdAt")}</TableCell>
                        <TableCell>{readText(row, "ruleCode")}</TableCell>
                        <TableCell>{readText(row, "reasonCode")}</TableCell>
                        <TableCell>{readText(row, "actorId")}</TableCell>
                        <TableCell>{readText(row, "actionType")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <JsonDebug value={opsPaymentsSecurityPolicyAuditQuery.data?.body} />
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
