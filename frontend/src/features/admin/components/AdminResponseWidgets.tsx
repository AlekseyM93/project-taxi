import { Badge } from "@/components/ui/badge";

export type QueryLike = {
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

export function QueryStatus({ query }: { query: QueryLike }) {
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

export function JsonDebug({ value }: { value: unknown }) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground">Сырой ответ</summary>
      <pre className="mt-2 overflow-auto rounded-md bg-secondary p-3">{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}
