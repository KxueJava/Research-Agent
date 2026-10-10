import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  Clock3,
  Database,
  RefreshCw,
  Rows3,
  TriangleAlert,
} from "lucide-react";
import { usageStatsApi, type UsageRange, type UsageRequest, type UsageStatsResponse } from "@/services/usageStats";
import "./usage-stats.css";

type UsageStatsProps = { embedded?: boolean };

const rangeLabels: Record<UsageRange, string> = { today: "今天", "7d": "近 7 天", "30d": "近 30 天" };

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value || 0);
}

function formatTime(value?: string) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatDuration(value: number) {
  if (!value) return "--";
  return value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`;
}

function statusLabel(value: string) {
  return ({ SUCCESS: "成功", FAILED: "失败", TIMEOUT: "超时", STOPPED: "已停止", WAITING_INPUT: "等待输入", RUNNING: "运行中" } as Record<string, string>)[value] || value || "未知";
}

function statusClass(value: string) {
  return value === "SUCCESS" ? "is-success" : value === "RUNNING" || value === "WAITING_INPUT" ? "is-running" : "is-error";
}

type HeatmapMetric = "tokens" | "requests";

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function UsageHeatmap({ points, metric }: { points: UsageStatsResponse["trend"]; metric: HeatmapMetric }) {
  const calendar = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - (start.getDay() + 6) % 7 - 52 * 7);
    const daily = new Map<string, { tokens: number; requests: number }>();
    for (const point of points) {
      const key = point.bucket.slice(0, 10);
      const previous = daily.get(key) || { tokens: 0, requests: 0 };
      daily.set(key, { tokens: previous.tokens + point.totalTokens, requests: previous.requests + (point.requestCount || 0) });
    }
    const days = Array.from({ length: 53 * 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = dateKey(date);
      return { date, key, future: date > today, value: daily.get(key)?.[metric] || 0 };
    });
    const max = Math.max(1, ...days.filter((day) => !day.future).map((day) => day.value));
    const months: { column: number; label: string }[] = [];
    for (let week = 0; week < 53; week++) {
      const first = days[week * 7].date;
      const previous = week ? days[(week - 1) * 7].date : null;
      if (!previous || first.getMonth() !== previous.getMonth()) {
        // Leave enough room for the last month's label at the right edge.
        if (week <= 50) months.push({ column: week + 1, label: `${first.getMonth() + 1}月` });
      }
    }
    return { days, max, months, today: dateKey(today), total: days.filter((day) => !day.future).reduce((sum, day) => sum + day.value, 0) };
  }, [points, metric]);
  const [focusedDay, setFocusedDay] = useState(52 * 7 + (new Date().getDay() + 6) % 7);
  const [detail, setDetail] = useState("");
  const unit = metric === "tokens" ? "Tokens" : "次请求";
  return (
    <div className="usage-heatmap-wrap">
      <div className="usage-heatmap-scroll">
        <div className="usage-heatmap-calendar">
          <div />
          <div className="usage-heatmap-months" aria-hidden="true">{calendar.months.map((month) => <span key={month.column} style={{ gridColumn: `${month.column} / span 3` }}>{month.label}</span>)}</div>
          <div className="usage-heatmap-weekdays" aria-hidden="true">{["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="usage-heatmap-grid" role="group" aria-label="最近 53 周每日用量，使用方向键浏览日期">
            {calendar.days.map((day, index) => {
              const label = `${day.key}：${formatNumber(day.value)} ${unit}`;
              const level = day.value > 0 ? Math.min(4, Math.ceil(day.value / calendar.max * 4)) : 0;
              return <button key={day.key} type="button" className="usage-heatmap-cell" data-level={level} data-future={day.future || undefined} data-today={day.key === calendar.today || undefined} disabled={day.future} tabIndex={index === focusedDay ? 0 : -1} title={label} aria-label={label}
                onMouseEnter={() => setDetail(label)} onMouseLeave={() => setDetail("")}
                onFocus={() => { setFocusedDay(index); setDetail(label); }} onBlur={() => setDetail("")}
                onKeyDown={(event) => {
                  const offset = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }[event.key];
                  if (offset === undefined) return;
                  event.preventDefault();
                  const next = index + offset;
                  if (next < 0 || next >= calendar.days.length || calendar.days[next].future) return;
                  (event.currentTarget.parentElement?.children[next] as HTMLButtonElement | undefined)?.focus();
                }} />;
            })}
          </div>
        </div>
      </div>
      <div className="usage-heatmap-footer">
        <span className="usage-heatmap-detail" aria-live="polite">{detail || `最近 53 周：${formatNumber(calendar.total)} ${unit}`}</span>
        <div className="usage-heatmap-legend" aria-label="颜色越深，用量越高"><span>少</span>{[0, 1, 2, 3, 4].map((level) => <i key={level} className="usage-heatmap-cell" data-level={level} />)}<span>多</span></div>
      </div>
    </div>
  );
}

function RequestTable({ requests }: { requests: UsageRequest[] }) {
  return (
    <div className="usage-table-scroll">
      <table className="usage-table">
        <thead><tr><th>时间</th><th>请求</th><th>输入</th><th>输出</th><th>总量</th><th>耗时</th><th>状态</th></tr></thead>
        <tbody>
          {requests.map((request, index) => <tr key={request.requestId || `${request.timestamp}-${index}`}>
            <td className="usage-muted">{formatTime(request.timestamp)}</td>
            <td><span className="usage-request-id">{request.requestId ? `${request.requestId.slice(0, 8)}…` : "执行记录"}</span><span className="usage-source">{request.source || "agent"}</span></td>
            <td>{formatNumber(request.inputTokens)}</td><td>{formatNumber(request.outputTokens)}</td><td className="usage-total">{formatNumber(request.totalTokens)}</td>
            <td className="usage-muted">{formatDuration(request.durationMs)}</td><td><span className={`usage-status ${statusClass(request.status)}`}><i />{statusLabel(request.status)}</span></td>
          </tr>)}
        </tbody>
      </table>
      {!requests.length ? <div className="usage-table-empty"><Database size={18} />暂无请求记录</div> : null}
    </div>
  );
}

export default function UsageStats({ embedded = false }: UsageStatsProps) {
  const [range, setRange] = useState<UsageRange>("today");
  const [data, setData] = useState<UsageStatsResponse | null>(null);
  const [heatmapData, setHeatmapData] = useState<UsageStatsResponse | null>(null);
  const [heatmapMetric, setHeatmapMetric] = useState<HeatmapMetric>("tokens");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [source, setSource] = useState("all");

  const load = async (nextRange = range) => {
    setLoading(true); setError("");
    try {
      const [summary, history] = await Promise.all([usageStatsApi.get(nextRange), usageStatsApi.get("53w")]);
      setData(summary);
      setHeatmapData(history.range === "53w" ? history : null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "用量数据加载失败";
      setError(message.includes("不存在") || message.includes("404")
        ? "后端用量接口尚未更新，请重新构建并重启后端服务。"
        : message);
      setData(null);
      setHeatmapData(null);
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(range); }, [range]);

  const sources = useMemo(() => Array.from(new Set((data?.requests || []).map((item) => item.source).filter(Boolean) as string[])), [data]);
  const requests = useMemo(() => source === "all" ? (data?.requests || []) : (data?.requests || []).filter((item) => item.source === source), [data, source]);
  const totals = data?.totals;

  return <main className={`usage-page ${embedded ? "usage-page-embedded" : ""}`}>
    <div className="usage-shell">
      <header className="usage-header">
        <div><div className="usage-kicker"><Activity size={14} />执行台账 / 用量</div><h1>Token 用量</h1><p>查看你的 Agent 执行消耗与请求明细。</p></div>
        <div className="usage-controls"><label>来源<select value={source} onChange={(event) => setSource(event.target.value)}><option value="all">全部来源</option>{sources.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><div className="usage-range" role="tablist" aria-label="时间范围">{(Object.keys(rangeLabels) as UsageRange[]).map((item) => <button key={item} type="button" className={range === item ? "is-active" : ""} onClick={() => setRange(item)}>{rangeLabels[item]}</button>)}</div><button type="button" className="usage-refresh" onClick={() => void load()} aria-label="刷新用量" title="刷新"><RefreshCw size={16} className={loading ? "is-spinning" : ""} /></button></div>
      </header>

      {error ? <div className="usage-alert"><TriangleAlert size={17} /><span>{error}</span><button type="button" onClick={() => void load()}>重试</button></div> : null}
      {loading ? <div className="usage-loading" aria-label="正在加载"><div /><div /><div /></div> : <>
        <section className="usage-metrics" aria-label="用量摘要">
          {[{ label: "总 Token", value: formatNumber(totals?.totalTokens || 0), note: "输入 + 输出", icon: BarChart3 }, { label: "输入 Token", value: formatNumber(totals?.inputTokens || 0), note: "发送给模型", icon: ArrowUpFromLine }, { label: "输出 Token", value: formatNumber(totals?.outputTokens || 0), note: "模型生成", icon: ArrowDownToLine }, { label: "请求次数", value: formatNumber(totals?.requestCount || 0), note: "执行台账记录", icon: Rows3 }].map((metric) => { const Icon = metric.icon; return <div className="usage-metric" key={metric.label}><div className="usage-metric-top"><span>{metric.label}</span><Icon size={16} /></div><strong>{metric.value}</strong><small>{metric.note}</small></div>; })}
        </section>
        <section className="usage-panel usage-heatmap-panel">
          <div className="usage-panel-heading">
            <div><h2>用量热力图</h2><span>最近 53 周 / 全部来源</span></div>
            <div className="usage-heatmap-segmented" role="group" aria-label="热力图指标">
              <button type="button" aria-pressed={heatmapMetric === "tokens"} onClick={() => setHeatmapMetric("tokens")}>Tokens</button>
              <button type="button" aria-pressed={heatmapMetric === "requests"} disabled={!heatmapData || heatmapData.trend.some((point) => point.requestCount === undefined)} onClick={() => setHeatmapMetric("requests")}>请求</button>
              <button type="button" disabled title="当前执行台账未提供成本数据">成本</button>
            </div>
          </div>
          {heatmapData ? <UsageHeatmap points={heatmapData.trend} metric={heatmapMetric} /> : <div className="usage-table-empty">请更新并重启后端，以启用 53 周用量统计</div>}
          <p className="usage-heatmap-caption">按天汇总最近 100 个会话的执行台账；顶部时间范围用于摘要和请求日志。</p>
        </section>
        <section className="usage-panel usage-log-panel"><div className="usage-panel-heading"><div><h2>请求日志</h2><span>{requests.length ? `共 ${formatNumber(requests.length)} 条记录` : "当前范围内无记录"}</span></div><span className="usage-log-caption"><Clock3 size={14} />数据来自执行台账</span></div><RequestTable requests={requests} /></section>
      </>}
      {!loading && !error && !data?.requests.length ? <div className="usage-empty"><div className="usage-empty-icon"><Database size={22} /></div><h2>还没有用量记录</h2><p>完成一次 Agent 执行后，输入、输出和耗时会出现在这里。</p></div> : null}
    </div>
  </main>;
}
