import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { useSocket } from '../contexts/SocketContext';

export default function Donations() {
  const { addToast } = useToast();
  const { socket } = useSocket() || {};

  const [donations, setDonations] = useState([]);
  const [report, setReport] = useState(null);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [purokFilter, setPurokFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  // Quick log form state
  const [mode, setMode] = useState('inkind'); // 'inkind' | 'cash'
  const [donorName, setDonorName] = useState('');
  const [donorType, setDonorType] = useState('government');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [quantityOrAmount, setQuantityOrAmount] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [listRes, reportRes, invRes] = await Promise.all([
        api.get('/donations'),
        api.get('/reports/distribution'),
        api.get('/inventory'),
      ]);
      const inv = invRes.data || [];
      setDonations(listRes.data || []);
      setReport(reportRes.data || null);
      setInventoryItems(inv);
      if (inv.length > 0 && !selectedItemId) {
        setSelectedItemId(inv[0].id);
      }
    } catch {
      addToast('Failed to load donations and fund-flow reports', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, selectedItemId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => fetchData();
    socket.on('inventory:update', refresh);
    socket.on('claim:update', refresh);
    socket.on('donation:created', refresh);
    socket.on('cash:disbursement', refresh);
    return () => {
      socket.off('inventory:update', refresh);
      socket.off('claim:update', refresh);
      socket.off('donation:created', refresh);
      socket.off('cash:disbursement', refresh);
    };
  }, [socket, fetchData]);

  const handleRecordDonation = async (e) => {
    e.preventDefault();
    if (!donorName.trim() || !quantityOrAmount || Number(quantityOrAmount) <= 0) {
      addToast('Please enter donor name and a positive amount/quantity.', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const selectedItem = inventoryItems.find((i) => String(i.id) === String(selectedItemId));
      const today = new Date().toISOString().split('T')[0];

      // Single atomic API call handles donation + batch creation + inventory sync + audit log
      await api.post('/donations', {
        donor_name: donorName.trim(),
        donor_type: donorType,
        category: mode === 'cash' ? 'Cash' : selectedItem?.category || 'Goods',
        amount: mode === 'cash' ? Number(quantityOrAmount) : null,
        received_date: today,
        items_description:
          mode === 'cash'
            ? `Cash Aid ₱${Number(quantityOrAmount).toLocaleString()}`
            : `${quantityOrAmount}x ${selectedItem?.name || 'Relief Goods'}`,
        notes: mode === 'inkind' ? 'Atomic intake batch' : 'Cash pool deposit',
        ...(mode === 'inkind' && selectedItemId
          ? {
              item_id: selectedItemId,
              quantity: Number(quantityOrAmount),
              batch_number: batchNumber.trim() || undefined,
              expiry_date: expiryDate || null,
            }
          : {}),
      });

      addToast('Donation & inventory recorded atomically!', 'success');
      setDonorName('');
      setQuantityOrAmount('');
      setBatchNumber('');
      setExpiryDate('');
      fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to record donation', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'Receipt ID',
      'Donor Name',
      'Donor Type',
      'Category',
      'Amount (PHP)',
      'Items Description',
      'Received Date',
      'Status',
    ];
    const rows = filteredDonations.map((d) => [
      d.id,
      `"${(d.donor_name || '').replace(/"/g, '""')}"`,
      d.donor_type || '',
      d.category || '',
      d.amount || 0,
      `"${(d.items_description || '').replace(/"/g, '""')}"`,
      d.received_date ? String(d.received_date).slice(0, 10) : '',
      d.status || '',
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `barretto-donations-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    addToast('Exported donations CSV report', 'success');
  };

  const formatPHP = (val) =>
    new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
    }).format(Number(val || 0));

  const filteredDonations =
    typeFilter === 'all' ? donations : donations.filter((d) => d.donor_type === typeFilter);

  const summary = report?.summary || {};
  const allPurokRows = report?.purok_breakdown || [];
  const purokRows =
    purokFilter === 'all'
      ? allPurokRows
      : allPurokRows.filter((p) => p.purok === purokFilter);

  const totals = purokRows.reduce(
    (acc, r) => ({
      registered: acc.registered + Number(r.registered_households || 0),
      served: acc.served + Number(r.served_households || 0),
      approved: acc.approved + Number(r.claims_fulfilled || 0),
      goods: acc.goods + Number(r.goods_units_distributed || 0),
      remaining: acc.remaining + Number(r.remaining_unserved || 0),
    }),
    { registered: 0, served: 0, approved: 0, goods: 0, remaining: 0 }
  );

  return (
    <div className="flex flex-col gap-section">
      {/* 1. Page Header & Filter Bar */}
      <header className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-gutter-md">
        <div className="flex flex-col gap-gutter-xs">
          <h1 className="font-headline text-headline-lg text-on-surface">
            Barangay Barretto — Donations &amp; Fund-Flow Reports
          </h1>
          <p className="font-body text-body-md text-on-surface-variant">
            Reconcile cash &amp; in-kind donor contributions atomically and audit purok-level distribution.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-gutter-sm shrink-0">
          <select
            aria-label="Purok or Sitio filter"
            value={purokFilter}
            onChange={(e) => setPurokFilter(e.target.value)}
            className="px-3 py-2 rounded bg-surface-container-lowest border border-outline-variant font-body text-label-md text-on-surface focus:border-primary focus:ring-primary"
          >
            <option value="all">All Registered Puroks</option>
            {allPurokRows.map((p) => (
              <option key={p.purok} value={p.purok}>
                {p.purok}
              </option>
            ))}
          </select>

          <select
            aria-label="Donor type filter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 rounded bg-surface-container-lowest border border-outline-variant font-body text-label-md text-on-surface focus:border-primary focus:ring-primary"
          >
            <option value="all">All Donors</option>
            <option value="government">LGU &amp; Government</option>
            <option value="organization">Private &amp; Business</option>
            <option value="ngo">Civic &amp; NGO Groups</option>
            <option value="individual">Individual / Family</option>
          </select>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center justify-center gap-gutter-sm px-3.5 py-2 rounded bg-surface-container-lowest border border-outline-variant text-primary font-body text-label-md transition-colors duration-state-change ease-state-change hover:bg-primary-container whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-title-sm" aria-hidden="true">
              download
            </span>
            <span>Export CSV Report</span>
          </button>
        </div>
      </header>

      {/* 2. Top Financial & Goods Reconciliation Cards (3 Cards) */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-gutter-md items-stretch">
        <article className="h-full bg-surface-container-lowest border border-outline-variant rounded-md p-5 flex flex-col justify-between gap-gutter-sm shadow-sm">
          <header className="flex items-center justify-between gap-gutter-sm">
            <h2 className="font-body text-label-md text-on-surface-variant">
              Total Donations Received
            </h2>
            <span className="material-symbols-outlined text-primary text-title-md shrink-0" aria-hidden="true">
              savings
            </span>
          </header>
          <div className="flex flex-col gap-gutter-xs">
            <p className="font-headline text-headline-lg text-on-surface tabular-nums">
              {formatPHP(summary.total_cash_received)}
            </p>
            <span className="font-body text-body-sm text-on-surface-variant tabular-nums">
              {summary.total_donations || 0} logged contributions +{' '}
              {(
                Number(summary.goods_units_remaining || 0) +
                Number(summary.goods_units_distributed || 0)
              ).toLocaleString()}{' '}
              unexpired goods units
            </span>
          </div>
        </article>

        <article className="h-full bg-surface-container-lowest border border-outline-variant rounded-md p-5 flex flex-col justify-between gap-gutter-sm shadow-sm">
          <header className="flex items-center justify-between gap-gutter-sm">
            <h2 className="font-body text-label-md text-on-surface-variant">
              Total Assistance Released
            </h2>
            <span className="material-symbols-outlined text-primary text-title-md shrink-0" aria-hidden="true">
              local_shipping
            </span>
          </header>
          <div className="flex flex-col gap-gutter-xs">
            <p className="font-headline text-headline-lg text-on-surface tabular-nums">
              {Number(summary.goods_units_distributed || 0).toLocaleString()} units
            </p>
            <span className="font-body text-body-sm text-on-surface-variant tabular-nums">
              {formatPHP(summary.total_cash_spent)} cash spent • {summary.served_households || 0} households served
            </span>
          </div>
        </article>

        <article className="h-full bg-surface-container-lowest border border-outline-variant rounded-md p-5 flex flex-col justify-between gap-gutter-sm shadow-sm">
          <header className="flex items-center justify-between gap-gutter-sm">
            <h2 className="font-body text-label-md text-on-surface-variant">
              Net Remaining Balance
            </h2>
            <span className="material-symbols-outlined text-emerald-verified text-title-md shrink-0" aria-hidden="true">
              verified
            </span>
          </header>
          <div className="flex flex-col gap-gutter-xs">
            <p className="font-headline text-headline-lg text-on-surface tabular-nums">
              {formatPHP(summary.cash_remaining_balance)}
            </p>
            <div className="flex items-center justify-between gap-gutter-sm">
              <span className="font-body text-body-sm text-on-surface-variant tabular-nums">
                {Number(summary.goods_units_remaining || 0).toLocaleString()} usable units on hand
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-success-container text-on-success-container font-body text-label-sm whitespace-nowrap">
                Reconciled
              </span>
            </div>
          </div>
        </article>
      </section>

      {/* 3. Middle Section (50% / 50%) */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-gutter-lg items-stretch">
        {/* Left: Donor Contribution Summary Table */}
        <div className="h-full bg-surface-container-lowest border border-outline-variant rounded-md shadow-sm flex flex-col min-w-0">
          <div className="px-5 py-4 border-b border-outline-variant flex items-center justify-between gap-gutter-sm">
            <div className="flex flex-col gap-gutter-xs">
              <h2 className="font-headline text-title-md text-on-surface">
                Donor Contribution Summary
              </h2>
              <p className="font-body text-body-sm text-on-surface-variant">
                Verified official receipts and atomic in-kind intake logs.
              </p>
            </div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-surface-container-low text-on-surface-variant font-body text-label-sm tabular-nums">
              {filteredDonations.length} Contributors
            </span>
          </div>

          <div className="w-full overflow-x-auto flex-1">
            <table className="w-full min-w-[540px] text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant">
                  <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Contributor</th>
                  <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Type</th>
                  <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Contribution</th>
                  <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Ref</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center font-body text-body-sm text-on-surface-variant">
                      Loading donations...
                    </td>
                  </tr>
                ) : filteredDonations.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center font-body text-body-sm text-on-surface-variant">
                      No donations match this filter.
                    </td>
                  </tr>
                ) : (
                  filteredDonations.map((d) => {
                    const isCash = Number(d.amount || 0) > 0;
                    return (
                      <tr
                        key={d.id}
                        className="hover:bg-surface-container-low transition-colors duration-state-change"
                      >
                        <td className="px-4 py-3.5 font-body text-body-md text-on-surface">
                          {d.donor_name}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full font-body text-label-sm ${
                              isCash
                                ? 'bg-primary-container text-on-primary-container'
                                : 'bg-success-container text-on-success-container'
                            }`}
                          >
                            {isCash ? 'Cash Donation' : 'In-Kind Goods'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-body text-body-sm text-on-surface tabular-nums">
                          {isCash ? formatPHP(d.amount) : d.items_description || d.category}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap font-mono text-mono-sm text-on-surface-variant tabular-nums">
                          #{String(d.id).slice(0, 6).toUpperCase()}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Quick Log Incoming Donation Form Card */}
        <article className="h-full bg-surface-container-lowest border border-outline-variant rounded-md shadow-sm p-5 flex flex-col justify-between gap-gutter-md">
          <header className="flex flex-wrap items-center justify-between gap-gutter-sm pb-3 border-b border-outline-variant">
            <div className="flex flex-col gap-gutter-xs">
              <h2 className="font-headline text-title-md text-on-surface">
                Quick Log Incoming Donation
              </h2>
              <p className="font-body text-body-sm text-on-surface-variant">
                Atomically logs donation, creates FEFO batch, and syncs live stock.
              </p>
            </div>

            {/* In-Kind / Cash Toggle */}
            <div
              className="inline-flex p-1 rounded bg-surface-container-low border border-outline-variant"
              role="tablist"
              aria-label="Donation Type"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'inkind'}
                onClick={() => setMode('inkind')}
                className={`px-3 py-1.5 rounded-sm font-body text-label-sm transition-colors duration-state-change ${
                  mode === 'inkind'
                    ? 'bg-primary text-on-primary'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                In-Kind Goods
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'cash'}
                onClick={() => setMode('cash')}
                className={`px-3 py-1.5 rounded-sm font-body text-label-sm transition-colors duration-state-change ${
                  mode === 'cash'
                    ? 'bg-primary text-on-primary'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Cash Donation
              </button>
            </div>
          </header>

          <form className="grid grid-cols-1 sm:grid-cols-2 gap-gutter-md" onSubmit={handleRecordDonation}>
            <div className="flex flex-col gap-1">
              <label htmlFor="donor-name" className="font-body text-label-md text-on-surface">
                Donor Name
              </label>
              <input
                id="donor-name"
                type="text"
                value={donorName}
                onChange={(e) => setDonorName(e.target.value)}
                placeholder="e.g., Subic Bay Civic Volunteers"
                className="w-full rounded border-outline-variant bg-surface text-body-md text-on-surface focus:border-primary focus:ring-primary"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="org-type" className="font-body text-label-md text-on-surface">
                Organization Type
              </label>
              <select
                id="org-type"
                value={donorType}
                onChange={(e) => setDonorType(e.target.value)}
                className="w-full rounded border-outline-variant bg-surface text-body-md text-on-surface focus:border-primary focus:ring-primary"
              >
                <option value="government">LGU / Government Agency</option>
                <option value="organization">Local Business / Resort</option>
                <option value="ngo">Civic / NGO Partner</option>
                <option value="individual">Individual / Family</option>
              </select>
            </div>

            {mode === 'inkind' && (
              <div className="flex flex-col gap-1">
                <label htmlFor="item-type" className="font-body text-label-md text-on-surface">
                  Item Type
                </label>
                <select
                  id="item-type"
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  className="w-full rounded border-outline-variant bg-surface text-body-md text-on-surface focus:border-primary focus:ring-primary"
                >
                  {inventoryItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.unit})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className={`flex flex-col gap-1 ${mode === 'cash' ? 'sm:col-span-2' : ''}`}>
              <label htmlFor="quantity" className="font-body text-label-md text-on-surface">
                {mode === 'cash' ? 'Amount (₱ PHP)' : 'Quantity (Units)'}
              </label>
              <input
                id="quantity"
                type="number"
                min="1"
                value={quantityOrAmount}
                onChange={(e) => setQuantityOrAmount(e.target.value)}
                placeholder={mode === 'cash' ? '25000' : '100'}
                className="w-full rounded border-outline-variant bg-surface text-body-md text-on-surface tabular-nums focus:border-primary focus:ring-primary"
              />
            </div>

            {mode === 'inkind' && (
              <>
                <div className="flex flex-col gap-1">
                  <label htmlFor="batch-number" className="font-body text-label-md text-on-surface">
                    Batch Number
                  </label>
                  <input
                    id="batch-number"
                    type="text"
                    value={batchNumber}
                    onChange={(e) => setBatchNumber(e.target.value)}
                    placeholder="BATCH-011"
                    className="w-full rounded border-outline-variant bg-surface font-mono text-mono-sm text-on-surface focus:border-primary focus:ring-primary"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="expiry-date" className="font-body text-label-md text-on-surface">
                    Expiry Date
                  </label>
                  <input
                    id="expiry-date"
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full rounded border-outline-variant bg-surface text-body-md text-on-surface tabular-nums focus:border-primary focus:ring-primary"
                  />
                </div>
              </>
            )}

            <div className="sm:col-span-2 pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-gutter-sm px-4 py-2.5 rounded bg-primary text-on-primary font-body text-label-lg transition-colors duration-state-change ease-state-change hover:opacity-95 disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-title-sm" aria-hidden="true">
                  broadcast_on_personal
                </span>
                <span>{submitting ? 'Recording...' : 'Record & Broadcast Stock Update'}</span>
              </button>
            </div>
          </form>
        </article>
      </section>

      {/* 4. Bottom Section: Full-Width Fund-Flow & Purok Distribution Breakdown Table */}
      <section className="bg-surface-container-lowest border border-outline-variant rounded-md shadow-sm flex flex-col">
        <div className="px-5 py-4 border-b border-outline-variant flex flex-wrap items-center justify-between gap-gutter-sm">
          <div className="flex flex-col gap-gutter-xs">
            <h2 className="font-headline text-title-md text-on-surface">
              Fund-Flow &amp; Purok Distribution Breakdown
            </h2>
            <p className="font-body text-body-sm text-on-surface-variant">
              Live household coverage and goods distributed per purok from PostgreSQL records.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success-container text-on-success-container font-body text-label-sm">
            <span className="material-symbols-outlined text-body-sm" aria-hidden="true">
              check_circle
            </span>
            <span>Live PostgreSQL Aggregation</span>
          </span>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[820px] text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant">
                <th className="px-4 py-3 text-left font-body text-label-md text-on-surface-variant">
                  Purok / Sitio
                </th>
                <th className="px-4 py-3 text-right font-body text-label-md text-on-surface-variant">
                  Registered Households
                </th>
                <th className="px-4 py-3 text-right font-body text-label-md text-on-surface-variant">
                  Served Households
                </th>
                <th className="px-4 py-3 text-right font-body text-label-md text-on-surface-variant">
                  Claims Fulfilled
                </th>
                <th className="px-4 py-3 text-right font-body text-label-md text-on-surface-variant">
                  Goods Units Distributed
                </th>
                <th className="px-4 py-3 text-right font-body text-label-md text-on-surface-variant">
                  Remaining Unserved Households
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {purokRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center font-body text-body-sm text-on-surface-variant">
                    No purok household records found.
                  </td>
                </tr>
              ) : (
                purokRows.map((row) => (
                  <tr
                    key={row.purok}
                    className="hover:bg-surface-container-low transition-colors duration-state-change"
                  >
                    <td className="px-4 py-3.5 whitespace-nowrap font-body text-body-md text-on-surface">
                      {row.purok}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums font-body text-body-md text-on-surface">
                      {row.registered_households}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums font-body text-body-md text-on-surface">
                      {row.served_households}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums font-body text-body-md text-on-surface">
                      {row.claims_fulfilled}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums font-body text-body-md text-on-surface">
                      {row.goods_units_distributed}
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-success-container text-on-success-container font-body text-label-sm">
                        {row.remaining_unserved}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="bg-surface-container-low border-t border-outline-variant">
                <th scope="row" className="px-4 py-3 text-left font-body text-label-md text-on-surface">
                  Total Across Registered Households
                </th>
                <td className="px-4 py-3 text-right tabular-nums font-body text-label-md text-on-surface">
                  {totals.registered.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-body text-label-md text-on-surface">
                  {totals.served.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-body text-label-md text-on-surface">
                  {totals.approved.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-body text-label-md text-on-surface">
                  {totals.goods.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-body text-label-md text-on-surface">
                  {totals.remaining.toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
