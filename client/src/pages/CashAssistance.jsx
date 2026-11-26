import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { useSocket } from '../contexts/SocketContext';
import { useToast } from '../contexts/ToastContext';

export default function CashAssistance() {
  const { socket } = useSocket() || {};
  const { addToast } = useToast();
  const [households, setHouseholds] = useState([]);
  const [disbursements, setDisbursements] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [householdId, setHouseholdId] = useState('');
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [paymentReference, setPaymentReference] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [householdRes, disbursementRes, reportRes] = await Promise.all([
        api.get('/households'),
        api.get('/cash-disbursements', { params: { limit: 50 } }),
        api.get('/reports/distribution'),
      ]);
      const householdRows = householdRes.data?.households || [];
      setHouseholds(householdRows);
      setDisbursements(disbursementRes.data?.disbursements || []);
      setSummary(reportRes.data?.summary || null);
      setHouseholdId((current) => current || householdRows[0]?.id || '');
    } catch {
      addToast('Failed to load cash assistance ledger', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!socket) return;
    socket.on('cash:disbursement', fetchData);
    socket.on('donation:created', fetchData);
    return () => {
      socket.off('cash:disbursement', fetchData);
      socket.off('donation:created', fetchData);
    };
  }, [socket, fetchData]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!householdId || !amount || !purpose.trim()) {
      addToast('Choose a household and enter an amount and purpose.', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/cash-disbursements', {
        household_id: householdId,
        amount,
        purpose: purpose.trim(),
        payment_reference: paymentReference.trim() || undefined,
      });
      addToast('Cash assistance recorded and audited.', 'success');
      setAmount('');
      setPurpose('');
      setPaymentReference('');
      await fetchData();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to record cash assistance', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const formatPHP = (value) =>
    new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
    }).format(Number(value || 0));

  const formatDate = (value) =>
    value
      ? new Date(value).toLocaleString('en-PH', {
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : '—';

  return (
    <div className="flex flex-col gap-section">
      <header className="flex flex-col gap-gutter-xs">
        <h1 className="font-headline text-headline-lg text-on-surface">Cash Assistance Disbursements</h1>
        <p className="font-body text-body-md text-on-surface-variant">
          Record household payments against received cash donations. Each payment is balance-checked and audited.
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-gutter-md">
        <article className="rounded-md border border-outline-variant bg-surface-container-lowest p-5">
          <h2 className="font-body text-label-md text-on-surface-variant">Cash Received</h2>
          <p className="mt-2 font-headline text-headline-lg text-on-surface tabular-nums">
            {loading ? '...' : formatPHP(summary?.total_cash_received)}
          </p>
        </article>
        <article className="rounded-md border border-outline-variant bg-surface-container-lowest p-5">
          <h2 className="font-body text-label-md text-on-surface-variant">Cash Disbursed</h2>
          <p className="mt-2 font-headline text-headline-lg text-on-surface tabular-nums">
            {loading ? '...' : formatPHP(summary?.total_cash_spent)}
          </p>
        </article>
        <article className="rounded-md border border-outline-variant bg-surface-container-lowest p-5">
          <h2 className="font-body text-label-md text-on-surface-variant">Available Balance</h2>
          <p className="mt-2 font-headline text-headline-lg text-on-surface tabular-nums">
            {loading ? '...' : formatPHP(summary?.cash_remaining_balance)}
          </p>
        </article>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-gutter-md items-start">
        <form
          onSubmit={handleSubmit}
          className="xl:col-span-1 rounded-md border border-outline-variant bg-surface-container-lowest p-5 flex flex-col gap-gutter-md"
        >
          <h2 className="font-headline text-title-md text-on-surface">Record Cash Payment</h2>
          <label className="flex flex-col gap-1 font-body text-label-md text-on-surface">
            Household
            <select
              value={householdId}
              onChange={(event) => setHouseholdId(event.target.value)}
              required
              className="rounded border-outline-variant bg-surface text-body-md"
            >
              <option value="">Select a household</option>
              {households.map((household) => (
                <option key={household.id} value={household.id}>
                  {household.household_code} — {household.head_name} ({household.purok || 'Unassigned'})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 font-body text-label-md text-on-surface">
            Amount (PHP)
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
              className="rounded border-outline-variant bg-surface text-body-md tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1 font-body text-label-md text-on-surface">
            Assistance purpose
            <input
              type="text"
              maxLength={500}
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              required
              className="rounded border-outline-variant bg-surface text-body-md"
            />
          </label>
          <label className="flex flex-col gap-1 font-body text-label-md text-on-surface">
            Payment reference (optional)
            <input
              type="text"
              maxLength={100}
              value={paymentReference}
              onChange={(event) => setPaymentReference(event.target.value)}
              className="rounded border-outline-variant bg-surface text-body-md"
            />
          </label>
          <button
            type="submit"
            disabled={submitting || loading || households.length === 0}
            className="rounded bg-primary px-4 py-2.5 font-body text-label-lg text-on-primary disabled:opacity-60"
          >
            {submitting ? 'Recording...' : 'Record & Audit Payment'}
          </button>
        </form>

        <div className="xl:col-span-2 rounded-md border border-outline-variant bg-surface-container-lowest shadow-sm">
          <div className="border-b border-outline-variant px-5 py-4">
            <h2 className="font-headline text-title-md text-on-surface">Recent Cash Assistance Ledger</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left">
              <thead>
                <tr className="bg-surface-container-low">
                  <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Date</th>
                  <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Household</th>
                  <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Purpose / Reference</th>
                  <th className="px-4 py-3 text-right font-body text-label-md text-on-surface-variant">Amount</th>
                  <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Recorded by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center">Loading payments...</td></tr>
                ) : disbursements.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-on-surface-variant">No cash payments recorded.</td></tr>
                ) : (
                  disbursements.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-4 py-3 font-body text-body-sm">{formatDate(entry.disbursed_at)}</td>
                      <td className="px-4 py-3 font-body text-body-sm">
                        {entry.household_code} — {entry.head_name}
                      </td>
                      <td className="px-4 py-3 font-body text-body-sm">
                        {entry.purpose}
                        {entry.payment_reference && (
                          <span className="block text-on-surface-variant">Ref: {entry.payment_reference}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-body text-body-sm tabular-nums">{formatPHP(entry.amount)}</td>
                      <td className="px-4 py-3 font-body text-body-sm">{entry.disbursed_by_name || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
