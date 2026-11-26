import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { useSocket } from '../contexts/SocketContext';
import { useToast } from '../contexts/ToastContext';

const STATUS_TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'released', label: 'Released' },
  { key: 'denied', label: 'Denied' },
  { key: 'all', label: 'All' },
];

export default function ClaimQueue() {
  const { socket } = useSocket() || {};
  const { addToast } = useToast();

  const [claims, setClaims] = useState([]);
  const [counts, setCounts] = useState({});
  const [statusFilter, setStatusFilter] = useState('pending');
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [approvedQty, setApprovedQty] = useState(1);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchClaims = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 50 };
      if (statusFilter !== 'all') params.status = statusFilter;
      const [claimsRes, statsRes] = await Promise.all([
        api.get('/claims', { params }),
        api.get('/dashboard/stats'),
      ]);
      const list = claimsRes.data?.claims || [];
      setClaims(list);
      setCounts(statsRes.data?.claims || {});
      setSelectedClaim((prev) => {
        if (!prev) return list[0] || null;
        return list.find((c) => c.id === prev.id) || list[0] || null;
      });
    } catch {
      addToast('Failed to load claim approval queue', 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, addToast]);

  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  useEffect(() => {
    if (selectedClaim) {
      setApprovedQty(selectedClaim.approved_quantity || selectedClaim.requested_quantity || 1);
      setNotes(selectedClaim.notes || '');
    }
  }, [selectedClaim]);

  useEffect(() => {
    if (!socket) return;
    const handleUpdate = (claim) => {
      addToast(`Claim #${claim.id?.slice(0, 6)} updated (${claim.status})`, 'info');
      fetchClaims();
    };
    socket.on('claim:update', handleUpdate);
    return () => socket.off('claim:update', handleUpdate);
  }, [socket, fetchClaims, addToast]);

  const handleApprove = async (claim) => {
    setSubmitting(true);
    try {
      const qty =
        selectedClaim?.id === claim.id ? Number(approvedQty) : Number(claim.requested_quantity);
      await api.put(`/claims/${claim.id}/approve`, {
        approved_quantity: qty,
        notes: selectedClaim?.id === claim.id ? notes.trim() || undefined : undefined,
      });
      addToast('Claim approved & FEFO batches deducted atomically!', 'success');
      fetchClaims();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to approve claim', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeny = async (claim) => {
    setSubmitting(true);
    try {
      const denyNote =
        selectedClaim?.id === claim.id && notes.trim()
          ? notes.trim()
          : 'Denied by BDRRMC officer';
      await api.put(`/claims/${claim.id}/deny`, { notes: denyNote });
      addToast('Claim denied and logged to audit trail', 'info');
      fetchClaims();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to deny claim', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRelease = async (claim) => {
    setSubmitting(true);
    try {
      await api.post(`/distributions/${claim.id}/release`);
      addToast('Distribution release recorded to household!', 'success');
      fetchClaims();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to release claim', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const getTabCount = (key) => {
    if (key === 'pending') return counts.pending_claims ?? 0;
    if (key === 'approved') return counts.approved_claims ?? 0;
    if (key === 'released') return counts.released_claims ?? 0;
    if (key === 'denied') return counts.denied_claims ?? 0;
    return counts.total_claims ?? 0;
  };

  const getStatusBadge = (status) => {
    if (status === 'approved')
      return 'bg-success-container text-on-success-container';
    if (status === 'released')
      return 'bg-primary-container text-on-primary-container';
    if (status === 'denied')
      return 'bg-error-container text-on-error-container';
    return 'bg-warning-container text-on-warning-container';
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <div className="flex flex-col gap-section">
      {/* Header & Status Filter Tabs */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-gutter-md">
        <div className="flex flex-col gap-gutter-xs">
          <h1 className="font-headline text-headline-lg text-on-surface">
            Resident Claim Approval Queue
          </h1>
          <p className="font-body text-body-md text-on-surface-variant">
            Verify household eligibility, prevent double-claims, and trigger atomic FEFO stock deduction.
          </p>
        </div>

        <div
          className="inline-flex flex-wrap p-1 rounded bg-surface-container-lowest border border-outline-variant shrink-0"
          role="tablist"
          aria-label="Claim Status Filter"
        >
          {STATUS_TABS.map((tab) => {
            const active = statusFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setStatusFilter(tab.key)}
                className={`px-3.5 py-1.5 rounded-sm font-body text-label-md tabular-nums transition-colors duration-state-change ${
                  active
                    ? 'bg-primary text-on-primary'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {tab.label} ({getTabCount(tab.key)})
              </button>
            );
          })}
        </div>
      </header>

      {/* Split View: Queue Table + Slide-Over Detail Drawer */}
      <section className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-gutter-lg items-start">
        {/* Left: Claim Queue Table */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-md shadow-sm flex flex-col min-w-0">
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[780px] text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant">
                  <th className="px-3.5 py-3 font-body text-label-md text-on-surface-variant">Claim ID</th>
                  <th className="px-3.5 py-3 font-body text-label-md text-on-surface-variant">Resident Name</th>
                  <th className="px-3.5 py-3 font-body text-label-md text-on-surface-variant">Household ID</th>
                  <th className="px-3.5 py-3 font-body text-label-md text-on-surface-variant">Purok</th>
                  <th className="px-3.5 py-3 font-body text-label-md text-on-surface-variant">Requested Aid</th>
                  <th className="px-3.5 py-3 font-body text-label-md text-on-surface-variant">Status</th>
                  <th className="px-3.5 py-3 text-right font-body text-label-md text-on-surface-variant">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center font-body text-body-md text-on-surface-variant">
                      Loading claims...
                    </td>
                  </tr>
                ) : claims.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center font-body text-body-md text-on-surface-variant">
                      No claims found in this status filter.
                    </td>
                  </tr>
                ) : (
                  claims.map((claim) => {
                    const isSelected = selectedClaim?.id === claim.id;
                    return (
                      <tr
                        key={claim.id}
                        onClick={() => setSelectedClaim(claim)}
                        className={`cursor-pointer transition-colors duration-state-change ${
                          isSelected ? 'bg-primary-container/50' : 'hover:bg-surface-container-low'
                        }`}
                      >
                        <td className="px-3.5 py-3.5 whitespace-nowrap">
                          <span
                            className={`font-mono text-mono-sm tabular-nums ${
                              isSelected ? 'text-primary' : 'text-on-surface-variant'
                            }`}
                          >
                            #{String(claim.id).slice(0, 8).toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3.5 py-3.5 whitespace-nowrap font-body text-body-md text-on-surface">
                          {claim.head_name || claim.resident_name || 'Resident'}
                        </td>
                        <td className="px-3.5 py-3.5 whitespace-nowrap font-mono text-mono-sm text-on-surface-variant tabular-nums">
                          {claim.household_code || 'HH-N/A'}
                        </td>
                        <td className="px-3.5 py-3.5 whitespace-nowrap font-body text-body-sm text-on-surface-variant">
                          {claim.purok || 'Barretto'}
                        </td>
                        <td className="px-3.5 py-3.5 whitespace-nowrap font-body text-body-sm text-on-surface tabular-nums">
                          {claim.item_name} × {claim.requested_quantity}
                        </td>
                        <td className="px-3.5 py-3.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-body text-label-sm capitalize ${getStatusBadge(
                              claim.status
                            )}`}
                          >
                            {claim.status}
                          </span>
                        </td>
                        <td
                          className="px-3.5 py-3.5 whitespace-nowrap text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1.5">
                            {claim.status === 'pending' && (
                              <>
                                <button
                                  type="button"
                                  disabled={submitting}
                                  onClick={() => handleApprove(claim)}
                                  className="px-2.5 py-1 rounded bg-primary text-on-primary font-body text-label-sm hover:opacity-95 whitespace-nowrap"
                                >
                                  Approve &amp; FEFO
                                </button>
                                <button
                                  type="button"
                                  disabled={submitting}
                                  onClick={() => handleDeny(claim)}
                                  className="px-2.5 py-1 rounded border border-outline-variant bg-surface-container-lowest text-on-surface-variant font-body text-label-sm hover:bg-error-container hover:text-on-error-container"
                                >
                                  Deny
                                </button>
                              </>
                            )}
                            {claim.status === 'approved' && (
                              <button
                                type="button"
                                disabled={submitting}
                                onClick={() => handleRelease(claim)}
                                className="px-2.5 py-1 rounded bg-emerald-verified text-on-success font-body text-label-sm hover:opacity-95 whitespace-nowrap"
                              >
                                Mark Released
                              </button>
                            )}
                            {(claim.status === 'released' || claim.status === 'denied') && (
                              <button
                                type="button"
                                onClick={() => setSelectedClaim(claim)}
                                className="px-2.5 py-1 rounded border border-outline-variant bg-surface-container-lowest text-on-surface-variant font-body text-label-sm"
                              >
                                Inspect
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Claim Detail Drawer */}
        <aside
          aria-label="Claim Detail Drawer"
          className="bg-surface-container-lowest border border-outline-variant rounded-md shadow-sm p-5 flex flex-col gap-gutter-md"
        >
          {!selectedClaim ? (
            <div className="py-10 text-center flex flex-col items-center gap-2">
              <span className="material-symbols-outlined text-on-surface-variant text-headline-lg" aria-hidden="true">
                fact_check
              </span>
              <p className="font-body text-title-sm text-on-surface">Select a Claim</p>
              <p className="font-body text-body-sm text-on-surface-variant">
                Click any row in the queue to inspect eligibility, adjust approved quantity, or process release.
              </p>
            </div>
          ) : (
            <>
              <header className="flex items-start justify-between gap-gutter-sm pb-3 border-b border-outline-variant">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="font-mono text-mono-sm text-primary tabular-nums">
                    Claim #{String(selectedClaim.id).slice(0, 8).toUpperCase()}
                  </span>
                  <h2 className="font-headline text-title-md text-on-surface truncate">
                    {selectedClaim.head_name || selectedClaim.resident_name || 'Resident'}
                  </h2>
                  <p className="font-body text-body-sm text-on-surface-variant">
                    Household {selectedClaim.household_code || 'N/A'} • {selectedClaim.purok || 'Barangay Barretto'}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-body text-label-sm capitalize shrink-0 ${getStatusBadge(
                    selectedClaim.status
                  )}`}
                >
                  {selectedClaim.status}
                </span>
              </header>

              <div className="p-3 rounded-md bg-surface border border-outline-variant flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-body text-label-sm text-on-surface-variant">Requested Aid</span>
                  <span className="font-body text-title-sm text-on-surface">
                    {selectedClaim.item_name}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-body text-label-sm text-on-surface-variant">Quantity Requested</span>
                  <span className="font-mono text-mono-sm text-on-surface tabular-nums">
                    {selectedClaim.requested_quantity} {selectedClaim.item_unit || 'unit'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-body text-label-sm text-on-surface-variant">Submitted Date</span>
                  <span className="font-mono text-mono-sm text-on-surface-variant tabular-nums">
                    {formatDate(selectedClaim.created_at)}
                  </span>
                </div>
                {selectedClaim.reason && (
                  <p className="pt-1.5 border-t border-outline-variant font-body text-body-sm text-on-surface-variant">
                    Reason: {selectedClaim.reason}
                  </p>
                )}
              </div>

              {selectedClaim.status === 'pending' && (
                <div className="flex flex-col gap-gutter-sm">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="approved-qty" className="font-body text-label-md text-on-surface">
                      Approved Quantity (FEFO)
                    </label>
                    <input
                      id="approved-qty"
                      type="number"
                      min="1"
                      value={approvedQty}
                      onChange={(e) => setApprovedQty(e.target.value)}
                      className="w-full rounded border-outline-variant bg-surface text-body-md text-on-surface tabular-nums focus:border-primary focus:ring-primary"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="review-notes" className="font-body text-label-md text-on-surface">
                      Officer Notes / Denial Reason
                    </label>
                    <textarea
                      id="review-notes"
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Optional approval remark or required denial reason..."
                      className="w-full rounded border-outline-variant bg-surface text-body-sm text-on-surface focus:border-primary focus:ring-primary"
                    />
                  </div>
                </div>
              )}

              <footer className="pt-3 border-t border-outline-variant flex items-center gap-gutter-sm">
                {selectedClaim.status === 'pending' && (
                  <>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => handleApprove(selectedClaim)}
                      className="flex-1 px-3 py-2 rounded bg-primary text-on-primary font-body text-label-md hover:opacity-95 disabled:opacity-50"
                    >
                      Approve &amp; FEFO Deduct
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => handleDeny(selectedClaim)}
                      className="px-3 py-2 rounded bg-error text-on-error font-body text-label-md hover:opacity-95 disabled:opacity-50"
                    >
                      Deny
                    </button>
                  </>
                )}
                {selectedClaim.status === 'approved' && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleRelease(selectedClaim)}
                    className="flex-1 px-3 py-2 rounded bg-emerald-verified text-on-success font-body text-label-md hover:opacity-95 disabled:opacity-50"
                  >
                    Confirm Physical Release
                  </button>
                )}
                {(selectedClaim.status === 'released' || selectedClaim.status === 'denied') && (
                  <p className="font-body text-body-sm text-on-surface-variant">
                    This claim is finalized ({selectedClaim.status}) and recorded in the immutable audit ledger.
                  </p>
                )}
              </footer>
            </>
          )}
        </aside>
      </section>
    </div>
  );
}
