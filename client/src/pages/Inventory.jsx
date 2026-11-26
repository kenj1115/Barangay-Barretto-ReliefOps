import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { useSocket } from '../contexts/SocketContext';
import { useToast } from '../contexts/ToastContext';

export default function Inventory() {
  const { socket } = useSocket() || {};
  const { addToast } = useToast();

  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [thresholds, setThresholds] = useState({});
  const [savingId, setSavingId] = useState(null);

  // Modal state for + Register New Batch
  const [showModal, setShowModal] = useState(false);
  const [batchForm, setBatchForm] = useState({
    mode: 'existing', // 'existing' | 'new'
    item_id: '',
    name: '',
    category: 'Food',
    unit: 'pack',
    low_stock_threshold: 20,
    batch_number: '',
    quantity: 50,
    expiry_date: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchInventory = useCallback(async () => {
    try {
      const [invRes, sumRes] = await Promise.all([
        api.get('/inventory'),
        api.get('/inventory/stats/summary'),
      ]);
      const data = invRes.data || [];
      setItems(data);
      setSummary(sumRes.data || null);

      const tMap = {};
      data.forEach((item) => {
        tMap[item.id] = item.low_stock_threshold;
      });
      setThresholds(tMap);
      if (data.length > 0 && !batchForm.item_id) {
        setBatchForm((prev) => ({ ...prev, item_id: data[0].id }));
      }
    } catch {
      addToast('Failed to load batch inventory', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, batchForm.item_id]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => fetchInventory();
    const handleLowStock = (data) => {
      addToast(`Low stock alert: ${data.item_name} (${data.quantity} left)`, 'warning');
      fetchInventory();
    };
    socket.on('inventory:update', handleUpdate);
    socket.on('inventory:low-stock', handleLowStock);
    return () => {
      socket.off('inventory:update', handleUpdate);
      socket.off('inventory:low-stock', handleLowStock);
    };
  }, [socket, fetchInventory, addToast]);

  const handleSaveThreshold = async (itemId) => {
    const val = Number(thresholds[itemId]);
    if (Number.isNaN(val) || val < 0) {
      addToast('Threshold must be a non-negative number', 'warning');
      return;
    }
    setSavingId(itemId);
    try {
      await api.put(`/inventory/${itemId}`, { low_stock_threshold: val });
      addToast('Minimum stock alert rule saved!', 'success');
      fetchInventory();
    } catch {
      addToast('Failed to update threshold', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const handleRegisterBatch = async (e) => {
    e.preventDefault();
    if (!batchForm.quantity || Number(batchForm.quantity) <= 0) {
      addToast('Quantity must be greater than zero.', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      let targetItemId = batchForm.item_id;
      if (batchForm.mode === 'new') {
        if (!batchForm.name.trim()) {
          addToast('Item name is required.', 'warning');
          setSubmitting(false);
          return;
        }
        const created = await api.post('/inventory', {
          name: batchForm.name.trim(),
          category: batchForm.category,
          unit: batchForm.unit.trim() || 'unit',
          total_quantity: 0,
          low_stock_threshold: Number(batchForm.low_stock_threshold || 10),
        });
        targetItemId = created.data.id;
      }

      await api.post(`/inventory/${targetItemId}/batches`, {
        batch_number: batchForm.batch_number.trim() || `BATCH-${Date.now().toString().slice(-4)}`,
        quantity: Number(batchForm.quantity),
        expiry_date: batchForm.expiry_date || null,
      });

      addToast('New FEFO batch registered & synced!', 'success');
      setShowModal(false);
      setBatchForm((prev) => ({
        ...prev,
        mode: 'existing',
        name: '',
        batch_number: '',
        quantity: 50,
        expiry_date: '',
      }));
      fetchInventory();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to register batch', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const daysUntil = (iso) => {
    if (!iso) return null;
    return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  const formatDate = (iso) => {
    if (!iso) return 'Non-Expiring';
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    });
  };

  // Flatten and sort all unexpired batches in strict FEFO order (earliest expiry first, non-expiring last)
  const flattenedBatches = items
    .flatMap((item) => {
      const batches = item.batches && item.batches.length > 0 ? item.batches : [null];
      return batches.map((b) => ({
        rowKey: b ? `${item.id}-${b.id}` : `${item.id}-none`,
        itemId: item.id,
        itemName: item.name,
        category: item.category,
        unit: item.unit,
        totalQty: Number(item.total_quantity || 0),
        threshold: Number(item.low_stock_threshold || 0),
        batchNumber: b?.batch_number || 'NO UNEXPIRED STOCK',
        batchQty: b ? Number(b.quantity) : 0,
        expiryDate: b?.expiry_date || null,
      }));
    })
    .sort((a, b) => {
      const aTime = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
      const bTime = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
      return aTime - bTime;
    });

  const quarantinedBatches = items.flatMap((item) =>
    (item.expired_batches || []).map((b) => ({
      ...b,
      itemName: item.name,
      unit: item.unit,
    }))
  );

  const expiringWithin7 = flattenedBatches.filter((b) => {
    const d = daysUntil(b.expiryDate);
    return d !== null && d <= 7;
  }).length;

  return (
    <div className="flex flex-col gap-section">
      {/* Page Header */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-gutter-md">
        <div className="flex flex-col gap-gutter-xs">
          <h1 className="font-headline text-headline-lg text-on-surface">
            Inventory &amp; FEFO Batch Expiry Manager
          </h1>
          <p className="font-body text-body-md text-on-surface-variant">
            First-Expired, First-Out (FEFO) batch release sequencing and low-stock reorder threshold controls.
          </p>
        </div>

        <div className="flex items-center gap-gutter-sm shrink-0">
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center justify-center gap-gutter-sm px-4 py-2.5 rounded bg-primary text-on-primary font-body text-label-lg hover:opacity-95 transition-colors duration-state-change"
          >
            <span>+ Register New Batch</span>
          </button>
        </div>
      </header>

      {/* Top Summary Cards (3 Cards) */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-gutter-md items-stretch">
        <article className="h-full bg-surface-container-lowest border border-outline-variant rounded-md p-5 flex flex-col justify-between gap-gutter-sm shadow-sm">
          <header className="flex items-center justify-between gap-gutter-sm">
            <h2 className="font-body text-label-md text-on-surface-variant">Total Active SKUs</h2>
            <span className="material-symbols-outlined text-primary text-title-md shrink-0" aria-hidden="true">
              category
            </span>
          </header>
          <div className="flex items-center justify-between gap-gutter-sm">
            <div className="flex items-center gap-gutter-xs">
              <p className="font-headline text-display-md text-on-surface tabular-nums">
                {summary?.total_items || items.length}
              </p>
              <span className="font-body text-body-sm text-on-surface-variant">
                ({flattenedBatches.length} batches)
              </span>
            </div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-primary-container text-on-primary-container font-body text-label-sm tabular-nums">
              {Number(summary?.total_units || 0).toLocaleString()} total units
            </span>
          </div>
        </article>

        <article className="h-full bg-surface-container-lowest border border-outline-variant rounded-md p-5 flex flex-col justify-between gap-gutter-sm shadow-sm">
          <header className="flex items-center justify-between gap-gutter-sm">
            <h2 className="font-body text-label-md text-on-surface-variant">
              Expiring Within 7 Days / 30 Days
            </h2>
            <span className="material-symbols-outlined text-crimson-alert text-title-md shrink-0" aria-hidden="true">
              event_busy
            </span>
          </header>
          <div className="flex items-center justify-between gap-gutter-sm">
            <div className="flex items-center gap-gutter-xs">
              <p className="font-headline text-display-md text-on-surface tabular-nums">
                {summary?.expiring_soon ?? expiringWithin7}
              </p>
              <span className="font-body text-body-sm text-on-surface-variant">batches</span>
            </div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-error-container text-on-error-container font-body text-label-sm">
              Immediate FEFO
            </span>
          </div>
        </article>

        <article className="h-full bg-surface-container-lowest border border-outline-variant rounded-md p-5 flex flex-col justify-between gap-gutter-sm shadow-sm">
          <header className="flex items-center justify-between gap-gutter-sm">
            <h2 className="font-body text-label-md text-on-surface-variant">Low-Stock Alerts</h2>
            <span className="material-symbols-outlined text-amber-fifo text-title-md shrink-0" aria-hidden="true">
              warning
            </span>
          </header>
          <div className="flex items-center justify-between gap-gutter-sm">
            <div className="flex items-center gap-gutter-xs">
              <p className="font-headline text-display-md text-on-surface tabular-nums">
                {summary?.low_stock_items || 0}
              </p>
              <span className="font-body text-body-sm text-on-surface-variant">SKUs below min</span>
            </div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-error-container text-on-error-container font-body text-label-sm">
              Restock Check
            </span>
          </div>
        </article>
      </section>

      {/* Batch-Level FEFO Table */}
      <section className="bg-surface-container-lowest border border-outline-variant rounded-md shadow-sm flex flex-col">
        <div className="px-5 py-4 border-b border-outline-variant flex flex-wrap items-center justify-between gap-gutter-sm">
          <div className="flex flex-col gap-gutter-xs">
            <h2 className="font-headline text-title-md text-on-surface">
              Batch-Level Stock &amp; FEFO Expiry Queue
            </h2>
            <p className="font-body text-body-sm text-on-surface-variant">
              Adjust minimum stock thresholds inline to trigger automated BDRRMC low-stock alerts.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success-container text-on-success-container font-body text-label-sm">
            <span className="material-symbols-outlined text-body-sm" aria-hidden="true">
              sort
            </span>
            <span>Sorted: Earliest Expiry First</span>
          </span>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[980px] text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant">
                <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Batch ID</th>
                <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Item Name</th>
                <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Category</th>
                <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Batch Remaining</th>
                <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Expiry Date</th>
                <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Release Priority</th>
                <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Minimum Threshold</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center font-body text-body-md text-on-surface-variant">
                    Loading FEFO batches...
                  </td>
                </tr>
              ) : (
                flattenedBatches.map((row) => {
                  const d = daysUntil(row.expiryDate);
                  const isLow = row.totalQty <= row.threshold;
                  const isCriticalExp = d !== null && d <= 7;
                  const isWarnExp = d !== null && d > 7 && d <= 30;

                  return (
                    <tr
                      key={row.rowKey}
                      className="hover:bg-surface-container-low transition-colors duration-state-change"
                    >
                      <td className="px-4 py-3.5 whitespace-nowrap font-mono text-mono-sm text-on-surface-variant tabular-nums">
                        {row.batchNumber}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap font-body text-body-md text-on-surface">
                        {row.itemName}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-surface-container-low text-on-surface-variant font-body text-label-sm">
                          {row.category}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span
                          className={`font-body text-body-md tabular-nums ${
                            isLow ? 'text-crimson-alert font-semibold' : 'text-on-surface'
                          }`}
                        >
                          {row.batchQty} {row.unit}s {isLow ? '(Low)' : ''}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {row.expiryDate ? (
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full font-body text-label-sm tabular-nums ${
                              isCriticalExp
                                ? 'bg-error-container text-on-error-container'
                                : isWarnExp
                                ? 'bg-warning-container text-on-warning-container'
                                : 'bg-success-container text-on-success-container'
                            }`}
                          >
                            {formatDate(row.expiryDate)} • {d <= 0 ? 'Expired' : `${d} days left`}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-surface-container-low text-on-surface-variant font-body text-label-sm">
                            Non-Expiring
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full font-body text-label-sm ${
                            isCriticalExp
                              ? 'bg-primary-container text-on-primary-container'
                              : isWarnExp
                              ? 'bg-warning-container text-on-warning-container'
                              : 'bg-surface-container-low text-on-surface-variant'
                          }`}
                        >
                          {isCriticalExp
                            ? 'Next Out - FEFO'
                            : isWarnExp
                            ? 'Priority Queue'
                            : 'Standard FEFO'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            value={thresholds[row.itemId] ?? row.threshold}
                            onChange={(e) =>
                              setThresholds((prev) => ({
                                ...prev,
                                [row.itemId]: e.target.value,
                              }))
                            }
                            aria-label={`Minimum threshold for ${row.itemName}`}
                            className="w-16 px-2 py-1 rounded border-outline-variant bg-surface font-body text-body-sm text-on-surface tabular-nums focus:border-primary focus:ring-primary"
                          />
                          <button
                            type="button"
                            disabled={savingId === row.itemId}
                            onClick={() => handleSaveThreshold(row.itemId)}
                            className="px-2.5 py-1 rounded border border-outline-variant bg-surface-container-lowest text-primary font-body text-label-sm hover:bg-primary-container transition-colors duration-state-change whitespace-nowrap"
                          >
                            {savingId === row.itemId ? 'Saving...' : 'Save Alert Rule'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Quarantined / Expired Batches (Excluded from Distribution) */}
      {quarantinedBatches.length > 0 && (
        <section className="bg-surface-container-lowest border border-error/30 rounded-md shadow-sm flex flex-col">
          <div className="px-5 py-4 border-b border-outline-variant bg-error-container/50 flex flex-wrap items-center justify-between gap-gutter-sm">
            <div className="flex flex-col gap-gutter-xs">
              <h2 className="font-headline text-title-md text-on-error-container">
                Quarantined / Expired Batches ({quarantinedBatches.length})
              </h2>
              <p className="font-body text-body-sm text-on-error-container/90">
                Automatically excluded from available stock, Resident Portal ordering, and FEFO claim approvals.
              </p>
            </div>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-error text-on-error font-body text-label-sm">
              Blocked from Release
            </span>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[700px] text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant">
                  <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Batch ID</th>
                  <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Item Name</th>
                  <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Quarantined Qty</th>
                  <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Expired On</th>
                  <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {quarantinedBatches.map((qb) => (
                  <tr key={qb.id} className="hover:bg-surface-container-low">
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-mono-sm text-on-surface-variant">
                      {qb.batch_number}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-body text-body-md text-on-surface">
                      {qb.itemName}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-body text-body-md text-crimson-alert tabular-nums">
                      {qb.quantity} {qb.unit}s
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-mono-sm text-on-error-container tabular-nums">
                      {formatDate(qb.expiry_date)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-error-container text-on-error-container font-body text-label-sm">
                        Expired • Excluded
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Register New Batch Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 bg-inverse-surface/40 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="register-batch-title"
        >
          <div className="w-full max-w-lg bg-surface-container-lowest border border-outline-variant rounded-md shadow-lg p-6 flex flex-col gap-gutter-md">
            <header className="flex items-center justify-between pb-3 border-b border-outline-variant">
              <h2 id="register-batch-title" className="font-headline text-title-md text-on-surface">
                Register New Inventory Batch
              </h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                aria-label="Close modal"
                className="w-8 h-8 rounded flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low"
              >
                <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                  close
                </span>
              </button>
            </header>

            <div className="grid grid-cols-2 p-1 rounded bg-surface-container-low border border-outline-variant">
              <button
                type="button"
                onClick={() => setBatchForm((p) => ({ ...p, mode: 'existing' }))}
                className={`px-3 py-1.5 rounded-sm font-body text-label-sm ${
                  batchForm.mode === 'existing'
                    ? 'bg-primary text-on-primary'
                    : 'text-on-surface-variant'
                }`}
              >
                Existing Item SKU
              </button>
              <button
                type="button"
                onClick={() => setBatchForm((p) => ({ ...p, mode: 'new' }))}
                className={`px-3 py-1.5 rounded-sm font-body text-label-sm ${
                  batchForm.mode === 'new'
                    ? 'bg-primary text-on-primary'
                    : 'text-on-surface-variant'
                }`}
              >
                Create New SKU
              </button>
            </div>

            <form className="grid grid-cols-1 sm:grid-cols-2 gap-gutter-md" onSubmit={handleRegisterBatch}>
              {batchForm.mode === 'existing' ? (
                <div className="sm:col-span-2 flex flex-col gap-1">
                  <label className="font-body text-label-md text-on-surface">Inventory Item</label>
                  <select
                    value={batchForm.item_id}
                    onChange={(e) => setBatchForm((p) => ({ ...p, item_id: e.target.value }))}
                    className="w-full rounded border-outline-variant bg-surface text-body-md text-on-surface focus:border-primary focus:ring-primary"
                  >
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.unit})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div className="sm:col-span-2 flex flex-col gap-1">
                    <label className="font-body text-label-md text-on-surface">New Item Name</label>
                    <input
                      type="text"
                      value={batchForm.name}
                      onChange={(e) => setBatchForm((p) => ({ ...p, name: e.target.value }))}
                      placeholder="e.g., Ready-to-Eat Biscuit Ration"
                      className="w-full rounded border-outline-variant bg-surface text-body-md text-on-surface focus:border-primary focus:ring-primary"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-body text-label-md text-on-surface">Category</label>
                    <select
                      value={batchForm.category}
                      onChange={(e) => setBatchForm((p) => ({ ...p, category: e.target.value }))}
                      className="w-full rounded border-outline-variant bg-surface text-body-md text-on-surface focus:border-primary focus:ring-primary"
                    >
                      <option>Food</option>
                      <option>Water</option>
                      <option>Hygiene</option>
                      <option>Medical</option>
                      <option>Shelter</option>
                      <option>Supplies</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-body text-label-md text-on-surface">Unit</label>
                    <input
                      type="text"
                      value={batchForm.unit}
                      onChange={(e) => setBatchForm((p) => ({ ...p, unit: e.target.value }))}
                      placeholder="pack / can / bottle"
                      className="w-full rounded border-outline-variant bg-surface text-body-md text-on-surface focus:border-primary focus:ring-primary"
                    />
                  </div>
                </>
              )}

              <div className="flex flex-col gap-1">
                <label className="font-body text-label-md text-on-surface">Batch Number</label>
                <input
                  type="text"
                  value={batchForm.batch_number}
                  onChange={(e) => setBatchForm((p) => ({ ...p, batch_number: e.target.value }))}
                  placeholder="BATCH-012"
                  className="w-full rounded border-outline-variant bg-surface font-mono text-mono-sm text-on-surface focus:border-primary focus:ring-primary"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="font-body text-label-md text-on-surface">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={batchForm.quantity}
                  onChange={(e) => setBatchForm((p) => ({ ...p, quantity: e.target.value }))}
                  className="w-full rounded border-outline-variant bg-surface text-body-md text-on-surface tabular-nums focus:border-primary focus:ring-primary"
                />
              </div>

              <div className="sm:col-span-2 flex flex-col gap-1">
                <label className="font-body text-label-md text-on-surface">
                  Expiry Date (leave blank for non-expiring)
                </label>
                <input
                  type="date"
                  value={batchForm.expiry_date}
                  onChange={(e) => setBatchForm((p) => ({ ...p, expiry_date: e.target.value }))}
                  className="w-full rounded border-outline-variant bg-surface text-body-md text-on-surface tabular-nums focus:border-primary focus:ring-primary"
                />
              </div>

              <div className="sm:col-span-2 flex items-center justify-end gap-gutter-sm pt-2 border-t border-outline-variant">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded border border-outline-variant bg-surface-container-lowest text-on-surface-variant font-body text-label-md hover:bg-surface-container-low"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded bg-primary text-on-primary font-body text-label-md hover:opacity-95 disabled:opacity-60"
                >
                  {submitting ? 'Saving...' : 'Register Batch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
