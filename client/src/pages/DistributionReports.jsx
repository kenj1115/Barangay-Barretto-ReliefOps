import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { useSocket } from '../contexts/SocketContext';

export default function DistributionReports() {
  const { addToast } = useToast();
  const { socket } = useSocket() || {};

  const [report, setReport] = useState(null);
  const [distributions, setDistributions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchReportData = useCallback(async () => {
    try {
      const [reportRes, distRes] = await Promise.all([
        api.get('/reports/distribution'),
        api.get('/distributions', { params: { limit: 25 } }),
      ]);
      setReport(reportRes.data || null);
      setDistributions(distRes.data?.distributions || []);
    } catch {
      addToast('Failed to load distribution reports', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => fetchReportData();
    socket.on('claim:update', refresh);
    socket.on('inventory:update', refresh);
    socket.on('donation:created', refresh);
    socket.on('cash:disbursement', refresh);
    return () => {
      socket.off('claim:update', refresh);
      socket.off('inventory:update', refresh);
      socket.off('donation:created', refresh);
      socket.off('cash:disbursement', refresh);
    };
  }, [socket, fetchReportData]);

  const summary = report?.summary || {};
  const purokCards = report?.purok_breakdown || [];

  const formatPHP = (val) =>
    new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
    }).format(Number(val || 0));

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    });
  };

  const handleGenerateDSWDReport = () => {
    const headers = [
      'Purok / Sitio',
      'Registered Households',
      'Served Households',
      'Coverage (%)',
      'Claims Fulfilled',
      'Units Distributed',
      'Remaining Unserved Households',
    ];
    const rows = purokCards.map((p) => [
      `"${p.purok}"`,
      p.registered_households,
      p.served_households,
      `${p.coverage_pct}%`,
      p.claims_fulfilled,
      p.goods_units_distributed,
      p.remaining_unserved,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `barretto-dswd-distribution-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    addToast('DSWD / COA Distribution Report generated!', 'success');
  };

  return (
    <div className="flex flex-col gap-section">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-gutter-md">
        <div className="flex flex-col gap-gutter-xs">
          <h1 className="font-headline text-headline-lg text-on-surface">
            Distribution Reports &amp; Household Coverage
          </h1>
          <p className="font-body text-body-md text-on-surface-variant">
            Real-time fund-flow summaries, per-purok aid saturation, and FEFO release records from PostgreSQL.
          </p>
        </div>

        <div className="flex items-center gap-gutter-sm shrink-0">
          <button
            type="button"
            onClick={handleGenerateDSWDReport}
            className="inline-flex items-center justify-center gap-gutter-sm px-4 py-2.5 rounded bg-primary text-on-primary font-body text-label-lg hover:opacity-95 transition-colors duration-state-change"
          >
            <span className="material-symbols-outlined text-title-sm" aria-hidden="true">
              summarize
            </span>
            <span>Generate DSWD Report</span>
          </button>
        </div>
      </header>

      {/* Coverage KPI Row */}
      <section aria-label="Distribution Metrics" className="grid grid-cols-1 sm:grid-cols-3 gap-gutter-md items-stretch">
        <article className="h-full bg-surface-container-lowest border border-outline-variant rounded-md p-5 flex flex-col justify-between gap-gutter-sm shadow-sm">
          <header className="flex items-center justify-between gap-gutter-sm">
            <h2 className="font-body text-label-md text-on-surface-variant">Household Coverage Rate</h2>
            <span className="material-symbols-outlined text-primary text-title-md" aria-hidden="true">
              groups
            </span>
          </header>
          <div className="flex items-center justify-between gap-gutter-sm">
            <p className="font-headline text-display-md text-on-surface tabular-nums">
              {loading ? '...' : `${summary.coverage_rate_pct ?? 0}%`}
            </p>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-success-container text-on-success-container font-body text-label-sm tabular-nums">
              {summary.served_households ?? 0} / {summary.registered_households ?? 0} HH
            </span>
          </div>
        </article>

        <article className="h-full bg-surface-container-lowest border border-outline-variant rounded-md p-5 flex flex-col justify-between gap-gutter-sm shadow-sm">
          <header className="flex items-center justify-between gap-gutter-sm">
            <h2 className="font-body text-label-md text-on-surface-variant">Goods Utilization</h2>
            <span className="material-symbols-outlined text-primary text-title-md" aria-hidden="true">
              inventory
            </span>
          </header>
          <div className="flex items-center justify-between gap-gutter-sm">
            <p className="font-headline text-display-md text-on-surface tabular-nums">
              {loading ? '...' : `${summary.goods_utilization_pct ?? 0}%`}
            </p>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-primary-container text-on-primary-container font-body text-label-sm tabular-nums">
              {Number(summary.goods_units_distributed || 0).toLocaleString()} /{' '}
              {(
                Number(summary.goods_units_distributed || 0) +
                Number(summary.goods_units_allocated || 0) +
                Number(summary.goods_units_remaining || 0)
              ).toLocaleString()}
            </span>
          </div>
          <p className="font-body text-body-sm text-on-surface-variant">
            {Number(summary.goods_units_allocated || 0).toLocaleString()} units approved, awaiting physical release
          </p>
        </article>

        <article className="h-full bg-surface-container-lowest border border-outline-variant rounded-md p-5 flex flex-col justify-between gap-gutter-sm shadow-sm">
          <header className="flex items-center justify-between gap-gutter-sm">
            <h2 className="font-body text-label-md text-on-surface-variant">Cash Fund Balance</h2>
            <span className="material-symbols-outlined text-primary text-title-md" aria-hidden="true">
              payments
            </span>
          </header>
          <div className="flex items-center justify-between gap-gutter-sm">
            <p className="font-headline text-headline-lg text-on-surface tabular-nums">
              {loading ? '...' : formatPHP(summary.cash_remaining_balance)}
            </p>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-success-container text-on-success-container font-body text-label-sm tabular-nums">
              from {formatPHP(summary.total_cash_received)}
            </span>
          </div>
        </article>
      </section>

      {/* Purok Saturation & Release Records */}
      <section className="bg-surface-container-lowest border border-outline-variant rounded-md shadow-sm flex flex-col">
        <div className="px-5 py-4 border-b border-outline-variant flex flex-wrap items-center justify-between gap-gutter-sm">
          <div className="flex flex-col gap-gutter-xs">
            <h2 className="font-headline text-title-md text-on-surface">
              Purok-Level Distribution &amp; Saturation Report
            </h2>
            <p className="font-body text-body-sm text-on-surface-variant">
              Live registered vs. served household counts and distributed units per purok.
            </p>
          </div>
          <span className="font-mono text-mono-sm text-on-surface-variant tabular-nums">
            Live BDRRMC Ledger
          </span>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-gutter-md">
          {purokCards.length === 0 ? (
            <p className="font-body text-body-sm text-on-surface-variant">
              No registered purok households found.
            </p>
          ) : (
            purokCards.map((p) => {
              const barWidth = Math.max(p.coverage_pct > 0 ? 4 : 0, Math.min(100, p.coverage_pct));
              const isHigh = p.coverage_pct >= 70;
              return (
                <div
                  key={p.purok}
                  className="p-4 rounded-md bg-surface border border-outline-variant flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-body text-title-sm text-on-surface">{p.purok}</span>
                    <span className="font-mono text-mono-sm text-on-surface-variant tabular-nums">
                      {p.coverage_pct}% served ({p.served_households}/{p.registered_households})
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-surface-container overflow-hidden">
                    <div
                      className={`h-full rounded-full ${isHigh ? 'bg-emerald-verified' : 'bg-primary'}`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <p className="font-body text-body-sm text-on-surface-variant tabular-nums">
                    {p.goods_units_distributed} units released • {p.claims_fulfilled} released claims •{' '}
                    {p.goods_units_allocated} units awaiting release •{' '}
                    {p.remaining_unserved} unserved HH
                  </p>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Official FEFO Distribution & Release Ledger */}
      <section className="bg-surface-container-lowest border border-outline-variant rounded-md shadow-sm flex flex-col">
        <div className="px-5 py-4 border-b border-outline-variant flex items-center justify-between gap-gutter-sm">
          <div className="flex flex-col gap-gutter-xs">
            <h2 className="font-headline text-title-md text-on-surface">
              Official Distribution &amp; FEFO Release Records
            </h2>
            <p className="font-body text-body-sm text-on-surface-variant">
              Batch-level traceability for physically released claims, with approved allocations tracked separately.
            </p>
          </div>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-primary-container text-on-primary-container font-body text-label-sm tabular-nums">
            {distributions.length} Records
          </span>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[820px] text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant">
                <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Claim / Ref</th>
                <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Household</th>
                <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Item &amp; Qty</th>
                <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">FEFO Batch Deductions</th>
                <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Officer</th>
                <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Date</th>
                <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {distributions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center font-body text-body-sm text-on-surface-variant">
                    No physical distribution releases recorded yet.
                  </td>
                </tr>
              ) : (
                distributions.map((dist) => (
                  <tr
                    key={dist.claim_id}
                    className="hover:bg-surface-container-low transition-colors duration-state-change"
                  >
                    <td className="px-4 py-3.5 whitespace-nowrap font-mono text-mono-sm text-on-surface-variant tabular-nums">
                      #{String(dist.claim_id).slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="font-body text-body-md text-on-surface">{dist.head_name}</span>
                        <span className="font-mono text-mono-sm text-on-surface-variant">
                          {dist.household_code} • {dist.purok || 'Barretto'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap font-body text-body-sm text-on-surface tabular-nums">
                      {dist.item_name} × {dist.approved_quantity || dist.requested_quantity}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-mono-sm text-on-surface-variant">
                      {(dist.batch_deductions || []).length === 0
                        ? '—'
                        : dist.batch_deductions
                            .map((b) => `${b.batch_number || 'BATCH'} (-${b.quantity_deducted})`)
                            .join(', ')}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap font-body text-body-sm text-on-surface">
                      {dist.approved_by_name || 'Duty Officer'}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap font-mono text-mono-sm text-on-surface-variant tabular-nums">
                      {formatDate(dist.released_at || dist.reviewed_at || dist.created_at)}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-body text-label-sm capitalize ${
                          dist.status === 'released'
                            ? 'bg-primary-container text-on-primary-container'
                            : 'bg-success-container text-on-success-container'
                        }`}
                      >
                        {dist.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
