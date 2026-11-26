import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useSocket } from '../contexts/SocketContext';
import { useToast } from '../contexts/ToastContext';

export default function Dashboard() {
  const { socket } = useSocket() || {};
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [stats, setStats] = useState(null);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [pendingClaims, setPendingClaims] = useState([]);
  const [purokReport, setPurokReport] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [processingId, setProcessingId] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      const [statsRes, invRes, pendingRes, reportRes] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/inventory'),
        api.get('/claims', { params: { status: 'pending', limit: 6 } }),
        api.get('/reports/distribution').catch(() => ({ data: { purok_breakdown: [] } })),
      ]);
      setStats(statsRes.data);
      setInventoryItems(invRes.data || []);
      setPendingClaims(pendingRes.data?.claims || []);
      setPurokReport(reportRes.data?.purok_breakdown || []);
    } catch {
      addToast('Failed to load dashboard overview data', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!socket) return;

    const handleClaimUpdate = () => {
      fetchAll();
    };
    const handleInventoryUpdate = () => {
      fetchAll();
    };
    const handleLowStock = (data) => {
      setBannerDismissed(false);
      addToast(
        `Low stock alert: ${data.item_name} (${data.quantity} left, threshold ${data.threshold})`,
        'warning'
      );
      fetchAll();
    };

    socket.on('claim:update', handleClaimUpdate);
    socket.on('inventory:update', handleInventoryUpdate);
    socket.on('inventory:low-stock', handleLowStock);
    socket.on('donation:created', handleInventoryUpdate);
    socket.on('cash:disbursement', handleInventoryUpdate);

    return () => {
      socket.off('claim:update', handleClaimUpdate);
      socket.off('inventory:update', handleInventoryUpdate);
      socket.off('inventory:low-stock', handleLowStock);
      socket.off('donation:created', handleInventoryUpdate);
      socket.off('cash:disbursement', handleInventoryUpdate);
    };
  }, [socket, fetchAll, addToast]);

  const handleQuickApprove = async (claim) => {
    setProcessingId(claim.id);
    try {
      await api.put(`/claims/${claim.id}/approve`, {
        approved_quantity: claim.requested_quantity,
        release_immediately: true,
      });
      addToast(
        `Approved & released claim for ${claim.head_name || claim.resident_name} (FEFO deducted)`,
        'success'
      );
      fetchAll();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to approve & release claim', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleQuickDeny = async (claim) => {
    setProcessingId(claim.id);
    try {
      await api.put(`/claims/${claim.id}/deny`, {
        notes: 'Denied from Dashboard Verification Queue',
      });
      addToast(`Claim denied for ${claim.head_name || claim.resident_name}`, 'info');
      fetchAll();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to deny claim', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const formatPHP = (val) =>
    new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(val || 0));

  const formatShortDate = (iso) => {
    if (!iso) return 'Non-Expiring';
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    });
  };

  const formatTime = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const daysUntil = (iso) => {
    if (!iso) return null;
    const diff = new Date(iso).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  // Compute expiring batches within 14 days (or 30 days)
  const allBatches = inventoryItems.flatMap((item) =>
    (item.batches || []).map((b) => ({ ...b, itemName: item.name }))
  );
  const expiringSoonBatches = allBatches.filter((b) => {
    const d = daysUntil(b.expiry_date);
    return d !== null && d <= 30;
  });

  const lowStockItems = inventoryItems.filter(
    (item) => Number(item.total_quantity) <= Number(item.low_stock_threshold)
  );

  // Sort inventory items by earliest batch expiry (FEFO) then low stock
  const fifoRows = [...inventoryItems]
    .sort((a, b) => {
      const aExp = a.batches?.[0]?.expiry_date ? new Date(a.batches[0].expiry_date).getTime() : Infinity;
      const bExp = b.batches?.[0]?.expiry_date ? new Date(b.batches[0].expiry_date).getTime() : Infinity;
      if (aExp !== bExp) return aExp - bExp;
      return Number(a.total_quantity) - Number(b.total_quantity);
    })
    .slice(0, 6);

  // Purok chart aggregation directly from /api/reports/distribution
  const purokBars = purokReport.map((p) => ({
    key: p.purok,
    label: p.purok,
    packs: Number(p.goods_units_distributed || 0),
    householdsServed: Number(p.served_households || 0),
    registeredHouseholds: Number(p.registered_households || 0),
  }));
  const maxPacks = Math.max(...purokBars.map((p) => p.packs), 1);
  const maxHouseholds = Math.max(...purokBars.map((p) => p.registeredHouseholds), 1);

  const claimsStats = stats?.claims || {};
  const inventoryStats = stats?.inventory || {};
  const donationStats = stats?.donations || {};
  const recentAudit = stats?.recent_audit || [];

  if (loading) {
    return (
      <div className="flex flex-col gap-section animate-pulse">
        <div className="h-12 rounded-md bg-surface-container" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-gutter-md">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-md bg-surface-container" />
          ))}
        </div>
        <div className="h-80 rounded-md bg-surface-container" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-section">
      {/* Top Dismissible Live Alert Banner */}
      {!bannerDismissed && lowStockItems.length > 0 && (
        <div
          role="alert"
          className="w-full flex items-center justify-between gap-gutter-md px-4 py-3 bg-error text-on-error rounded-md shadow-sm"
        >
          <div className="flex items-center gap-gutter-sm min-w-0">
            <span className="material-symbols-outlined text-title-md shrink-0" aria-hidden="true">
              warning
            </span>
            <span className="font-body text-label-md">
              LOW STOCK ALERT:{' '}
              {lowStockItems
                .slice(0, 3)
                .map((i) => `${i.name} (${i.total_quantity} ${i.unit} remaining)`)
                .join(' • ')}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setBannerDismissed(true)}
            aria-label="Dismiss alert"
            className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-on-error/15 transition-colors duration-state-change shrink-0"
          >
            <span className="material-symbols-outlined text-title-sm" aria-hidden="true">
              close
            </span>
          </button>
        </div>
      )}

      {/* Page Header & Quick Actions */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-gutter-md">
        <div className="flex flex-col gap-gutter-xs">
          <h1 className="font-headline text-headline-lg text-on-surface">
            Barangay Barretto — Relief Operations &amp; Inventory Overview
          </h1>
          <p className="font-body text-body-md text-on-surface-variant">
            Real-time BDRRMC relief stock, FEFO batch release queue, and household aid verification.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-gutter-sm shrink-0">
          <button
            type="button"
            onClick={() => navigate('/donations')}
            className="inline-flex items-center justify-center gap-gutter-sm px-4 py-2.5 rounded bg-surface-container-lowest border border-outline-variant text-primary font-body text-label-lg transition-colors duration-state-change ease-state-change hover:bg-primary-container"
          >
            <span>+ Log Donation</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/claims')}
            className="inline-flex items-center justify-center gap-gutter-sm px-4 py-2.5 rounded bg-primary text-on-primary font-body text-label-lg transition-colors duration-state-change ease-state-change hover:opacity-95"
          >
            <span>+ Process Claim</span>
          </button>
        </div>
      </header>

      {/* Top KPI Summary Row (4 Cards) */}
      <section
        aria-label="Key Performance Indicators"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-gutter-md items-stretch"
      >
        <article className="h-full bg-surface-container-lowest border border-outline-variant rounded-md p-4 flex flex-col justify-between gap-gutter-sm shadow-sm">
          <header className="flex items-center justify-between gap-gutter-sm">
            <h2 className="font-body text-label-md text-on-surface-variant">
              Available Relief Packs
            </h2>
            <span className="material-symbols-outlined text-primary text-title-md shrink-0" aria-hidden="true">
              inventory_2
            </span>
          </header>
          <div className="flex items-center justify-between gap-gutter-sm">
            <div className="flex items-center gap-gutter-xs">
              <p className="font-headline text-display-md text-on-surface tabular-nums">
                {Number(inventoryStats.total_units || 0).toLocaleString()}
              </p>
              <span className="font-body text-body-sm text-on-surface-variant">units</span>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-success-container text-on-success-container font-body text-label-sm tabular-nums whitespace-nowrap">
              {inventoryStats.total_items || 0} active SKUs
            </span>
          </div>
        </article>

        <article className="h-full bg-surface-container-lowest border border-outline-variant rounded-md p-4 flex flex-col justify-between gap-gutter-sm shadow-sm">
          <header className="flex items-center justify-between gap-gutter-sm">
            <h2 className="font-body text-label-md text-on-surface-variant">
              Cash Fund Balance
            </h2>
            <span className="material-symbols-outlined text-primary text-title-md shrink-0" aria-hidden="true">
              account_balance_wallet
            </span>
          </header>
          <div className="flex flex-col gap-gutter-xs">
            <p className="font-headline text-headline-lg text-on-surface tabular-nums">
              {formatPHP(donationStats.cash_balance_php)}
            </p>
            <p className="font-body text-body-sm text-on-surface-variant tabular-nums">
              {formatPHP(donationStats.total_cash_spent_php)} disbursed • {donationStats.total_donations || 0} donations
            </p>
          </div>
        </article>

        <article className="h-full bg-surface-container-lowest border border-outline-variant rounded-md p-4 flex flex-col justify-between gap-gutter-sm shadow-sm">
          <header className="flex items-center justify-between gap-gutter-sm">
            <h2 className="font-body text-label-md text-on-surface-variant">
              Pending Resident Claims
            </h2>
            <span className="material-symbols-outlined text-primary text-title-md shrink-0" aria-hidden="true">
              pending_actions
            </span>
          </header>
          <div className="flex flex-col gap-gutter-xs">
            <p className="font-headline text-display-md text-on-surface tabular-nums">
              {claimsStats.pending_claims || 0}
            </p>
            <p className="font-body text-body-sm text-on-surface-variant">
              requests awaiting verification
            </p>
          </div>
        </article>

        <article className="h-full bg-surface-container-lowest border border-outline-variant rounded-md p-4 flex flex-col justify-between gap-gutter-sm shadow-sm">
          <header className="flex items-center justify-between gap-gutter-sm">
            <h2 className="font-body text-label-md text-on-surface-variant">
              Expiring Within 30 Days
            </h2>
            <span className="material-symbols-outlined text-amber-fifo text-title-md shrink-0" aria-hidden="true">
              schedule
            </span>
          </header>
          <div className="flex items-center justify-between gap-gutter-sm">
            <div className="flex items-center gap-gutter-xs">
              <p className="font-headline text-display-md text-on-surface tabular-nums">
                {expiringSoonBatches.length}
              </p>
              <span className="font-body text-body-sm text-on-surface-variant">batches</span>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-warning-container text-on-warning-container font-body text-label-sm whitespace-nowrap">
              Priority FEFO
            </span>
          </div>
        </article>
      </section>

      {/* Main Two-Column Content Area (65% / 35%) */}
      <section className="grid grid-cols-1 xl:grid-cols-[65fr_35fr] gap-gutter-lg items-start">
        {/* Left (65%): Live Inventory & Batch Expiry Tracker (FEFO Order) */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-md shadow-sm flex flex-col min-w-0">
          <div className="px-5 py-4 border-b border-outline-variant flex flex-wrap items-center justify-between gap-gutter-sm">
            <div className="flex flex-col gap-gutter-xs">
              <h2 className="font-headline text-headline-md text-on-surface">
                Live Inventory &amp; Batch Expiry Tracker (FEFO Order)
              </h2>
              <p className="font-body text-body-sm text-on-surface-variant">
                Sorted by earliest expiration date to enforce First-Expired, First-Out disaster relief dispatch.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-low text-on-surface-variant font-body text-label-sm">
              <span className="material-symbols-outlined text-body-md" aria-hidden="true">
                sort
              </span>
              <span>FEFO Active</span>
            </span>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[740px] text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant">
                  <th className="px-3.5 py-3 font-body text-label-md text-on-surface-variant">Item Name</th>
                  <th className="px-3.5 py-3 font-body text-label-md text-on-surface-variant">Category</th>
                  <th className="px-3.5 py-3 font-body text-label-md text-on-surface-variant">Next Batch</th>
                  <th className="px-3.5 py-3 font-body text-label-md text-on-surface-variant">Expiry Date</th>
                  <th className="px-3.5 py-3 font-body text-label-md text-on-surface-variant">Available Stock</th>
                  <th className="px-3.5 py-3 font-body text-label-md text-on-surface-variant">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {fifoRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center font-body text-body-md text-on-surface-variant">
                      No active inventory items found.
                    </td>
                  </tr>
                ) : (
                  fifoRows.map((item) => {
                    const earliestBatch = item.batches?.[0];
                    const expDays = daysUntil(earliestBatch?.expiry_date);
                    const isLow = Number(item.total_quantity) <= Number(item.low_stock_threshold);
                    const isExpiring = expDays !== null && expDays <= 30;
                    const pct = Math.min(
                      100,
                      Math.max(
                        8,
                        Math.round(
                          (Number(item.total_quantity) / Math.max(Number(item.low_stock_threshold) * 3, 1)) *
                            100
                        )
                      )
                    );

                    const barColor = isLow
                      ? 'bg-crimson-alert'
                      : isExpiring
                      ? 'bg-amber-fifo'
                      : 'bg-emerald-verified';

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-surface-container-low transition-colors duration-state-change ease-state-change"
                      >
                        <td className="px-3.5 py-3.5 whitespace-nowrap font-body text-body-md text-on-surface">
                          {item.name}
                        </td>
                        <td className="px-3.5 py-3.5 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-surface-container-low text-on-surface-variant font-body text-label-sm">
                            {item.category}
                          </span>
                        </td>
                        <td className="px-3.5 py-3.5 whitespace-nowrap font-mono text-mono-sm text-on-surface-variant tabular-nums">
                          {earliestBatch?.batch_number || '—'}
                        </td>
                        <td className="px-3.5 py-3.5 whitespace-nowrap">
                          {isExpiring ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-warning-container text-on-warning-container font-body text-label-sm whitespace-nowrap">
                              <span className="material-symbols-outlined text-body-sm" aria-hidden="true">
                                schedule
                              </span>
                              <span>{formatShortDate(earliestBatch?.expiry_date)} • Release First</span>
                            </span>
                          ) : (
                            <span className="font-body text-body-sm text-on-surface-variant tabular-nums">
                              {formatShortDate(earliestBatch?.expiry_date)}
                            </span>
                          )}
                        </td>
                        <td className="px-3.5 py-3.5 min-w-36">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-body text-body-sm text-on-surface tabular-nums">
                                {item.total_quantity} {item.unit}s
                              </span>
                              <span className="font-body text-label-sm text-on-surface-variant tabular-nums">
                                Min: {item.low_stock_threshold}
                              </span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-surface-container overflow-hidden">
                              <div className={`h-full ${barColor} rounded-full`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="px-3.5 py-3.5 whitespace-nowrap">
                          {isLow ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-error-container text-on-error-container font-body text-label-sm">
                              Low Stock
                            </span>
                          ) : isExpiring ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-warning-container text-on-warning-container font-body text-label-sm">
                              Release First
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-success-container text-on-success-container font-body text-label-sm">
                              Healthy Stock
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right (35%): Incoming Claim Verification Queue */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-md shadow-sm flex flex-col min-w-0">
          <div className="px-4 py-4 border-b border-outline-variant flex items-center justify-between gap-gutter-sm">
            <div className="flex flex-col gap-gutter-xs min-w-0">
              <h2 className="font-headline text-title-sm text-on-surface">
                Incoming Claim Verification Queue
              </h2>
              <p className="font-body text-body-sm text-on-surface-variant">
                Automated household cooldown &amp; residency check.
              </p>
            </div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-primary-container text-primary font-body text-label-sm tabular-nums shrink-0">
              {pendingClaims.length} pending
            </span>
          </div>

          <div className="p-4 flex flex-col gap-gutter-md">
            {pendingClaims.length === 0 ? (
              <div className="py-8 text-center flex flex-col items-center gap-2">
                <span className="material-symbols-outlined text-emerald-verified text-headline-lg" aria-hidden="true">
                  task_alt
                </span>
                <p className="font-body text-title-sm text-on-surface">Queue All Clear</p>
                <p className="font-body text-body-sm text-on-surface-variant">
                  No pending household aid claims awaiting verification.
                </p>
              </div>
            ) : (
              pendingClaims.slice(0, 3).map((claim) => (
                <article
                  key={claim.id}
                  className="bg-surface border border-outline-variant rounded-md p-4 flex flex-col gap-gutter-sm"
                >
                  <header className="flex items-start justify-between gap-gutter-sm">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <h3 className="font-body text-title-sm text-on-surface truncate">
                        {claim.head_name || claim.resident_name || 'Verified Household'}
                      </h3>
                      <p className="font-mono text-mono-sm text-on-surface-variant tabular-nums truncate">
                        {claim.household_code || `#${claim.id.slice(0, 6)}`} • {claim.purok || 'Barangay Barretto'}
                      </p>
                    </div>
                  </header>

                  <div className="flex flex-wrap items-center justify-between gap-gutter-xs">
                    <p className="font-body text-body-md text-on-surface">
                      {claim.item_name} ({claim.requested_quantity} {claim.item_unit || 'unit'})
                    </p>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-success-container text-on-success-container font-body text-label-sm whitespace-nowrap">
                      Eligible • Verified Resident
                    </span>
                  </div>

                  <footer className="flex items-center gap-gutter-sm pt-2 border-t border-outline-variant">
                    <button
                      type="button"
                      disabled={processingId === claim.id}
                      onClick={() => handleQuickApprove(claim)}
                      className="flex-1 px-3 py-2 rounded bg-primary text-on-primary font-body text-label-md hover:opacity-95 disabled:opacity-50 transition-colors duration-state-change whitespace-nowrap"
                    >
                      {processingId === claim.id ? 'Processing...' : 'Approve & Release'}
                    </button>
                    <button
                      type="button"
                      disabled={processingId === claim.id}
                      onClick={() => handleQuickDeny(claim)}
                      className="px-3 py-2 rounded border border-outline-variant bg-surface-container-lowest text-on-surface-variant font-body text-label-md hover:bg-error-container hover:text-on-error-container transition-colors duration-state-change"
                    >
                      Deny
                    </button>
                  </footer>
                </article>
              ))
            )}

            {pendingClaims.length > 0 && (
              <button
                type="button"
                onClick={() => navigate('/claims')}
                className="w-full py-2 rounded border border-outline-variant bg-surface-container-lowest text-primary font-body text-label-md hover:bg-primary-container transition-colors duration-state-change"
              >
                Open Full Claim Approval Queue
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Bottom Section (2 Side-by-Side Panels) */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-gutter-lg items-stretch">
        {/* Bottom Left: Grouped Bar Chart by Purok / Sitio */}
        <article className="h-full bg-surface-container-lowest border border-outline-variant rounded-md shadow-sm p-5 flex flex-col justify-between gap-gutter-md">
          <header className="flex flex-wrap items-start justify-between gap-gutter-sm">
            <div className="flex flex-col gap-gutter-xs">
              <h2 className="font-headline text-title-md text-on-surface">
                Assistance Distribution by Purok / Sitio (Barangay Barretto)
              </h2>
              <p className="font-body text-body-sm text-on-surface-variant">
                Goods packs released vs. cash assistance disbursements across all 6 puroks.
              </p>
            </div>
            <div className="flex items-center gap-gutter-md">
              <span className="inline-flex items-center gap-1.5 font-body text-label-sm text-on-surface-variant">
                <span className="w-3 h-3 rounded-sm bg-primary inline-block" />
                <span>Goods Units Released</span>
              </span>
              <span className="inline-flex items-center gap-1.5 font-body text-label-sm text-on-surface-variant">
                <span className="w-3 h-3 rounded-sm bg-emerald-verified inline-block" />
                <span>Households Served</span>
              </span>
            </div>
          </header>

          <div className="flex flex-col gap-gutter-sm pt-2">
            {purokBars.length === 0 ? (
              <p className="py-8 text-center font-body text-body-sm text-on-surface-variant">
                No purok distribution data available.
              </p>
            ) : (
              <>
                <div
                  className="grid gap-gutter-xs items-end h-48 px-1 pb-2 border-b border-outline-variant"
                  style={{ gridTemplateColumns: `repeat(${purokBars.length}, minmax(0, 1fr))` }}
                >
                  {purokBars.map((p) => {
                    const goodsHeight = p.packs > 0 ? Math.max(10, Math.round((p.packs / maxPacks) * 100)) : 4;
                    const hhHeight =
                      p.householdsServed > 0
                        ? Math.max(10, Math.round((p.householdsServed / maxHouseholds) * 100))
                        : 4;
                    return (
                      <div key={p.key} className="flex flex-col items-center justify-end h-full gap-1.5">
                        <div className="flex items-end gap-1 h-40 w-full justify-center">
                          <div
                            className="w-4 bg-primary rounded-t-sm transition-all duration-surface-enter"
                            style={{ height: `${goodsHeight}%` }}
                            title={`${p.label}: ${p.packs} units distributed`}
                          />
                          <div
                            className="w-4 bg-emerald-verified rounded-t-sm transition-all duration-surface-enter"
                            style={{ height: `${hhHeight}%` }}
                            title={`${p.label}: ${p.householdsServed}/${p.registeredHouseholds} households served`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div
                  className="grid gap-gutter-xs px-1 text-center"
                  style={{ gridTemplateColumns: `repeat(${purokBars.length}, minmax(0, 1fr))` }}
                >
                  {purokBars.map((p) => (
                    <div key={p.key} className="flex flex-col min-w-0">
                      <span className="font-body text-label-sm text-on-surface truncate">{p.label}</span>
                      <span className="font-mono text-mono-sm text-on-surface-variant truncate tabular-nums">
                        {p.packs} units
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </article>

        {/* Bottom Right: Immutable Audit & Transaction Log */}
        <article className="h-full bg-surface-container-lowest border border-outline-variant rounded-md shadow-sm p-5 flex flex-col gap-gutter-md">
          <header className="flex items-center justify-between gap-gutter-sm">
            <div className="flex flex-col gap-gutter-xs min-w-0">
              <h2 className="font-headline text-title-md text-on-surface">
                Immutable Audit &amp; Transaction Log
              </h2>
              <p className="font-body text-body-sm text-on-surface-variant">
                Append-only atomic database ledger for full COA &amp; DSWD accountability.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success-container text-on-success-container font-body text-label-sm shrink-0">
              <span className="material-symbols-outlined text-body-sm" aria-hidden="true">
                verified_user
              </span>
              <span>Ledger Synced</span>
            </span>
          </header>

          <ul className="divide-y divide-outline-variant flex flex-col">
            {recentAudit.length === 0 ? (
              <li className="py-6 text-center font-body text-body-sm text-on-surface-variant">
                No audit transactions recorded yet.
              </li>
            ) : (
              recentAudit.map((entry) => {
                const dotColor =
                  entry.action?.includes('DENIED')
                    ? 'bg-crimson-alert'
                    : entry.action?.includes('APPROVED') || entry.action?.includes('RELEASED')
                    ? 'bg-emerald-verified'
                    : entry.action?.includes('ITEM')
                    ? 'bg-amber-fifo'
                    : 'bg-primary';
                return (
                  <li key={entry.id} className="py-3 flex items-center justify-between gap-gutter-sm">
                    <div className="flex items-center gap-gutter-sm min-w-0">
                      <span className={`w-2 h-2 rounded-full ${dotColor} shrink-0`} />
                      <p className="font-body text-body-sm text-on-surface tabular-nums truncate">
                        <span className="font-mono text-mono-sm text-on-surface-variant">
                          {formatTime(entry.created_at)}
                        </span>{' '}
                        • {entry.performer_name || 'System'} •{' '}
                        <span className="font-mono text-mono-sm">{entry.action}</span> •{' '}
                        <span className="font-mono text-mono-sm text-on-surface-variant">
                          #{entry.entity_id ? String(entry.entity_id).slice(0, 8) : 'SYS'}
                        </span>{' '}
                        • TX Committed
                      </p>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </article>
      </section>
    </div>
  );
}
