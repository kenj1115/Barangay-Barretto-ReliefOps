import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useToast } from '../contexts/ToastContext';
import { BarangaySealSvg } from '../components/Layout';

const CATEGORY_ICONS = {
  Food: 'lunch_dining',
  Water: 'water_drop',
  Hygiene: 'sanitizer',
  Medical: 'medical_services',
  Shelter: 'night_shelter',
  Supplies: 'inventory_2',
};

export default function ResidentPortal() {
  const { user, logout } = useAuth();
  const { socket, connected } = useSocket() || {};
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [claims, setClaims] = useState([]);
  const [items, setItems] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [selectedItemId, setSelectedItemId] = useState('');
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('');
  const [cooldownMsg, setCooldownMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchPortalData = useCallback(async () => {
    try {
      const [claimsRes, invRes, notifRes] = await Promise.all([
        api.get('/claims', { params: { limit: 30 } }),
        api.get('/inventory'),
        api.get('/notifications', { params: { limit: 15 } }),
      ]);
      const claimList = claimsRes.data?.claims || [];
      const invList = invRes.data || [];
      setClaims(claimList);
      setItems(invList);
      setNotifications(notifRes.data?.notifications || []);
      setUnreadCount(Number(notifRes.data?.unread_count || 0));
      if (invList.length > 0 && !selectedItemId) {
        setSelectedItemId(invList[0].id);
      }
    } catch {
      addToast('Failed to load resident aid portal', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, selectedItemId]);

  useEffect(() => {
    fetchPortalData();
  }, [fetchPortalData]);

  useEffect(() => {
    if (!socket) return;
    const handleClaimUpdate = (updated) => {
      if (updated.resident_id === user?.id || updated.household_id === user?.household_id) {
        addToast(`Your claim status is now: ${String(updated.status || '').toUpperCase()}`, 'info');
        fetchPortalData();
      }
    };
    const handleNewNotification = (notif) => {
      addToast(notif.title || 'New relief notification', 'info');
      fetchPortalData();
    };
    socket.on('claim:update', handleClaimUpdate);
    socket.on('notification:new', handleNewNotification);
    return () => {
      socket.off('claim:update', handleClaimUpdate);
      socket.off('notification:new', handleNewNotification);
    };
  }, [socket, user, addToast, fetchPortalData]);

  const handleMarkAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      addToast('Failed to mark notifications as read', 'error');
    }
  };

  // Check if item has an active non-denied/cancelled claim within 24h cooldown
  const isItemInCooldown = (itemId) => {
    const now = Date.now();
    return claims.some((c) => {
      if (String(c.item_id) !== String(itemId)) return false;
      if (c.status === 'denied' || c.status === 'cancelled') return false;
      const ageHours = (now - new Date(c.created_at).getTime()) / (1000 * 60 * 60);
      return ageHours < 24;
    });
  };

  const handleSubmitClaim = async (e) => {
    e.preventDefault();
    setCooldownMsg('');
    if (!user?.household_id) {
      addToast('No household linked to your account.', 'error');
      return;
    }
    if (!selectedItemId) {
      addToast('Please select an aid item.', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/claims', {
        household_id: user.household_id,
        item_id: selectedItemId,
        requested_quantity: Number(qty),
        reason: reason.trim() || 'Household relief assistance request',
        priority: 'normal',
      });
      addToast('Aid claim submitted successfully!', 'success');
      setQty(1);
      setReason('');
      fetchPortalData();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to submit claim';
      if (err.response?.status === 409) {
        setCooldownMsg(msg);
      }
      addToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const activeClaim =
    claims.find((c) => c.status === 'approved' || c.status === 'pending' || c.status === 'released') ||
    null;

  const stepIndex = activeClaim
    ? activeClaim.status === 'released'
      ? 3
      : activeClaim.status === 'approved'
      ? 2
      : 1
    : 0;

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <div className="min-h-screen w-full bg-surface-container-low flex justify-center">
      <div className="min-h-screen w-full max-w-md bg-surface flex flex-col border-x border-outline-variant shadow-sm">
        {/* 1. Top Mobile Header */}
        <header className="bg-primary text-on-primary px-4 pt-4 pb-5 flex flex-col gap-gutter-md">
          <div className="flex items-center justify-between gap-gutter-sm">
            <div className="flex items-center gap-gutter-sm min-w-0">
              <div
                className="w-9 h-9 rounded-md bg-on-primary/15 border border-on-primary/25 flex items-center justify-center shrink-0"
                aria-hidden="true"
              >
                <BarangaySealSvg className="w-6 h-6 text-on-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="font-headline text-title-md text-on-primary leading-tight truncate">
                  Brgy. Barretto Aid Portal
                </h1>
                <p className="font-body text-body-sm text-on-primary/80">
                  Olongapo City, Zambales
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-on-primary/15 text-on-primary font-body text-label-sm">
                <span
                  className={`w-2 h-2 rounded-full ${
                    connected ? 'bg-emerald-verified animate-pulse' : 'bg-amber-fifo'
                  }`}
                />
                <span>{connected ? 'Live' : 'Sync'}</span>
              </span>
              <button
                type="button"
                onClick={handleLogout}
                title="Sign out"
                aria-label="Sign out"
                className="w-7 h-7 rounded-full bg-on-primary/15 text-on-primary flex items-center justify-center hover:bg-on-primary/25"
              >
                <span className="material-symbols-outlined text-body-md" aria-hidden="true">
                  logout
                </span>
              </button>
            </div>
          </div>

          {/* Resident Profile Pill */}
          <div className="bg-surface-container-lowest text-on-surface rounded-md p-3 flex items-center justify-between gap-gutter-sm border border-outline-variant shadow-sm">
            <div className="flex flex-col gap-0.5 min-w-0">
              <p className="font-body text-title-sm text-on-surface truncate">
                {user?.full_name || user?.username}
              </p>
              <p className="font-mono text-mono-sm text-on-surface-variant tabular-nums truncate">
                HH #{user?.household_id ? String(user.household_id).slice(0, 8).toUpperCase() : 'UNASSIGNED'} •{' '}
                {user?.purok || 'Barangay Barretto'}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-success-container text-on-success-container font-body text-label-sm shrink-0 whitespace-nowrap">
              <span
                className="material-symbols-outlined text-body-sm"
                style={{ fontVariationSettings: "'FILL' 1" }}
                aria-hidden="true"
              >
                verified
              </span>
              <span>Verified Resident</span>
            </span>
          </div>
        </header>

        {/* Main Scrollable Content */}
        <main className="flex-1 p-4 flex flex-col gap-gutter-lg">
          {/* 2. Live Status Notification Card (Hero Banner) */}
          {activeClaim && (
            <section
              aria-label="Active Claim Pass"
              className="bg-surface-container-lowest border border-outline-variant rounded-md p-4 shadow-sm flex flex-col gap-gutter-md"
            >
              <div className="flex items-start gap-gutter-sm">
                <div className="w-9 h-9 rounded-full bg-success-container text-on-success-container flex items-center justify-center shrink-0">
                  <span
                    className="material-symbols-outlined text-title-md"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                    aria-hidden="true"
                  >
                    notifications_active
                  </span>
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                  <h2 className="font-headline text-title-md text-on-surface">
                    Claim #{String(activeClaim.id).slice(0, 8).toUpperCase()} —{' '}
                    {activeClaim.status === 'approved'
                      ? 'Approved & Ready for Pickup'
                      : activeClaim.status === 'released'
                      ? 'Released to Household'
                      : 'Submitted & Under Review'}
                  </h2>
                  <p className="font-body text-body-sm text-on-surface-variant">
                    {activeClaim.item_name} ({activeClaim.approved_quantity || activeClaim.requested_quantity}{' '}
                    {activeClaim.item_unit || 'unit'}).{' '}
                    {activeClaim.status === 'approved'
                      ? 'Present this QR Claim Pass at Barangay Barretto Hall, National Highway, Olongapo City.'
                      : activeClaim.status === 'released'
                      ? 'Relief goods have been handed over and signed.'
                      : 'Awaiting BDRRMC officer verification.'}
                  </p>
                </div>
              </div>

              {/* 3-Step Horizontal Progress Bar */}
              <div className="bg-surface rounded-md p-3 border border-outline-variant flex flex-col gap-gutter-sm">
                <div className="flex items-center justify-between gap-1">
                  {/* Step 1 */}
                  <div className="flex flex-col items-center gap-1 flex-1 text-center">
                    <span className="w-6 h-6 rounded-full bg-emerald-verified text-on-success flex items-center justify-center">
                      <span className="material-symbols-outlined text-body-sm" aria-hidden="true">
                        check
                      </span>
                    </span>
                    <span className="font-body text-label-sm text-on-surface">Submitted</span>
                  </div>

                  <div
                    className={`h-0.5 flex-1 -mt-4 ${
                      stepIndex >= 2 ? 'bg-emerald-verified' : 'bg-surface-container-high'
                    }`}
                  />

                  {/* Step 2 */}
                  <div className="flex flex-col items-center gap-1 flex-1 text-center">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center ${
                        stepIndex >= 2
                          ? 'bg-emerald-verified text-on-success'
                          : 'bg-surface-container text-on-surface-variant'
                      }`}
                    >
                      <span className="material-symbols-outlined text-body-sm" aria-hidden="true">
                        {stepIndex >= 2 ? 'check' : 'hourglass_top'}
                      </span>
                    </span>
                    <span className="font-body text-label-sm text-on-surface">Verified &amp; Approved</span>
                  </div>

                  <div
                    className={`h-0.5 flex-1 -mt-4 ${
                      stepIndex >= 3
                        ? 'bg-emerald-verified'
                        : stepIndex === 2
                        ? 'bg-primary'
                        : 'bg-surface-container-high'
                    }`}
                  />

                  {/* Step 3 */}
                  <div className="flex flex-col items-center gap-1 flex-1 text-center">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center ${
                        stepIndex >= 3
                          ? 'bg-emerald-verified text-on-success'
                          : stepIndex === 2
                          ? 'bg-primary text-on-primary animate-pulse'
                          : 'bg-surface-container text-on-surface-variant'
                      }`}
                    >
                      <span className="material-symbols-outlined text-body-sm" aria-hidden="true">
                        {stepIndex >= 3 ? 'done_all' : 'qr_code_2'}
                      </span>
                    </span>
                    <span
                      className={`font-body text-label-sm ${
                        stepIndex === 2 ? 'text-primary' : 'text-on-surface'
                      }`}
                    >
                      {stepIndex >= 3 ? 'Released' : 'Ready for Release'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Embedded Crisp QR Code Pass when Approved */}
              {activeClaim.status === 'approved' && (
                <div className="bg-surface border border-outline-variant rounded-md p-4 flex flex-col items-center gap-gutter-sm">
                  <div className="bg-surface-container-lowest p-3 rounded border border-outline-variant">
                    <svg
                      viewBox="0 0 120 120"
                      className="w-28 h-28 text-on-surface"
                      fill="currentColor"
                      xmlns="http://www.w3.org/2000/svg"
                      role="img"
                      aria-label={`QR Claim Pass for ${activeClaim.id}`}
                    >
                      <path d="M8 8h32v32H8V8zm6 6v20h20V14H14z" />
                      <rect x="19" y="19" width="10" height="10" />
                      <path d="M80 8h32v32H80V8zm6 6v20h20V14H86z" />
                      <rect x="91" y="19" width="10" height="10" />
                      <path d="M8 80h32v32H8V80zm6 6v20h20V86H14z" />
                      <rect x="19" y="91" width="10" height="10" />
                      <rect x="48" y="8" width="6" height="6" />
                      <rect x="60" y="8" width="6" height="6" />
                      <rect x="48" y="20" width="12" height="6" />
                      <rect x="66" y="20" width="6" height="6" />
                      <rect x="48" y="32" width="6" height="12" />
                      <rect x="60" y="34" width="12" height="6" />
                      <rect x="8" y="48" width="6" height="12" />
                      <rect x="20" y="48" width="12" height="6" />
                      <rect x="52" y="48" width="14" height="14" />
                      <rect x="72" y="48" width="6" height="6" />
                      <rect x="84" y="48" width="12" height="6" />
                      <rect x="104" y="48" width="8" height="12" />
                      <rect x="72" y="60" width="12" height="12" />
                      <rect x="48" y="70" width="6" height="12" />
                      <rect x="48" y="88" width="12" height="6" />
                      <rect x="66" y="84" width="12" height="6" />
                      <rect x="84" y="80" width="12" height="12" />
                      <rect x="60" y="98" width="12" height="14" />
                      <rect x="96" y="96" width="16" height="16" />
                    </svg>
                  </div>
                  <p className="font-mono text-mono-sm text-on-surface tabular-nums">
                    #{String(activeClaim.id).slice(0, 8).toUpperCase()} • Valid for Pickup
                  </p>
                </div>
              )}
            </section>
          )}

          {/* Persistent Notifications Feed */}
          {notifications.length > 0 && (
            <section
              aria-label="Notifications"
              className="bg-surface-container-lowest border border-outline-variant rounded-md p-4 shadow-sm flex flex-col gap-gutter-sm"
            >
              <header className="flex items-center justify-between gap-gutter-sm pb-2 border-b border-outline-variant">
                <div className="flex items-center gap-1.5">
                  <h2 className="font-headline text-title-md text-on-surface">Notifications</h2>
                  {unreadCount > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary text-on-primary font-body text-label-sm tabular-nums">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="font-body text-label-sm text-primary hover:underline"
                  >
                    Mark all read
                  </button>
                )}
              </header>
              <ul className="divide-y divide-outline-variant flex flex-col">
                {notifications.slice(0, 5).map((n) => (
                  <li key={n.id} className={`py-2.5 flex flex-col gap-0.5 ${!n.is_read ? 'bg-primary-container/25 px-2 -mx-2 rounded' : ''}`}>
                    <div className="flex items-center justify-between gap-gutter-sm">
                      <span className="font-body text-title-sm text-on-surface">{n.title}</span>
                      {!n.is_read && (
                        <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                      )}
                    </div>
                    <p className="font-body text-body-sm text-on-surface-variant">{n.message}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 3. Household Aid Eligibility & Cooldown Rules Card */}
          <section
            aria-label="Household Aid Eligibility"
            className="bg-surface-container-lowest border border-outline-variant rounded-md p-4 shadow-sm flex flex-col gap-gutter-sm"
          >
            <header className="flex items-center justify-between gap-gutter-sm pb-2 border-b border-outline-variant">
              <h2 className="font-headline text-title-md text-on-surface">
                Aid Eligibility &amp; Cooldown Rules
              </h2>
              <span className="font-mono text-mono-sm text-on-surface-variant">24h Rule</span>
            </header>

            <ul className="divide-y divide-outline-variant flex flex-col">
              {items.slice(0, 4).map((item) => {
                const inCooldown = isItemInCooldown(item.id);
                const avail = Number(item.available_quantity ?? item.total_quantity ?? 0);
                return (
                  <li key={item.id} className="py-3 flex items-center justify-between gap-gutter-sm">
                    <div className="flex items-center gap-gutter-sm min-w-0">
                      <span
                        className={`material-symbols-outlined text-title-md shrink-0 ${
                          inCooldown || avail <= 0 ? 'text-amber-fifo' : 'text-emerald-verified'
                        }`}
                        style={!inCooldown && avail > 0 ? { fontVariationSettings: "'FILL' 1" } : undefined}
                        aria-hidden="true"
                      >
                        {inCooldown || avail <= 0 ? 'schedule' : 'check_circle'}
                      </span>
                      <span className="font-body text-body-md text-on-surface truncate">
                        {item.name}
                      </span>
                    </div>
                    {avail <= 0 ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-error-container text-on-error-container font-body text-label-sm shrink-0">
                        Out of Stock
                      </span>
                    ) : inCooldown ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-warning-container text-on-warning-container font-body text-label-sm shrink-0">
                        Cooldown Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-success-container text-on-success-container font-body text-label-sm shrink-0">
                        Eligible now
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {/* 4. "Request Assistance" Quick Form */}
          <section
            aria-label="Request Assistance"
            className="bg-surface-container-lowest border border-outline-variant rounded-md p-4 shadow-sm flex flex-col gap-gutter-md"
          >
            <header className="flex flex-col gap-0.5">
              <h2 className="font-headline text-title-md text-on-surface">Request Assistance</h2>
              <p className="font-body text-body-sm text-on-surface-variant">
                Tap an available relief item to submit a household claim.
              </p>
            </header>

            {cooldownMsg && (
              <div
                role="alert"
                className="p-3 rounded bg-error-container border border-error/20 text-on-error-container font-body text-body-sm"
              >
                {cooldownMsg}
              </div>
            )}

            <form onSubmit={handleSubmitClaim} className="flex flex-col gap-gutter-md">
              <div className="grid grid-cols-2 gap-gutter-sm">
                {items.slice(0, 6).map((item) => {
                  const selected = String(selectedItemId) === String(item.id);
                  const inCooldown = isItemInCooldown(item.id);
                  const avail = Number(item.available_quantity ?? item.total_quantity ?? 0);
                  const disabled = inCooldown || avail <= 0;
                  const icon = CATEGORY_ICONS[item.category] || 'inventory_2';

                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => setSelectedItemId(item.id)}
                      className={`p-3 rounded-md text-left flex flex-col gap-1 transition-colors duration-state-change ${
                        disabled
                          ? 'border border-outline-variant bg-surface-container-low cursor-not-allowed opacity-70'
                          : selected
                          ? 'border-2 border-primary bg-primary-container'
                          : 'border border-outline-variant bg-surface hover:border-primary'
                      }`}
                    >
                      <span
                        className={`material-symbols-outlined text-title-md ${
                          disabled
                            ? 'text-on-surface-variant'
                            : 'text-primary'
                        }`}
                        aria-hidden="true"
                      >
                        {icon}
                      </span>
                      <span
                        className={`font-body text-title-sm leading-tight ${
                          disabled
                            ? 'text-on-surface-variant'
                            : selected
                            ? 'text-primary'
                            : 'text-on-surface'
                        }`}
                      >
                        {item.name}
                      </span>
                      <span className="font-body text-body-sm text-on-surface-variant tabular-nums">
                        {inCooldown ? 'Cooldown Active' : `${avail} ${item.unit}s left`}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-[100px_1fr] gap-gutter-sm">
                <div className="flex flex-col gap-1">
                  <label htmlFor="claim-qty" className="font-body text-label-sm text-on-surface-variant">
                    Quantity
                  </label>
                  <input
                    id="claim-qty"
                    type="number"
                    min="1"
                    max="10"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="w-full rounded border-outline-variant bg-surface text-body-md text-on-surface tabular-nums focus:border-primary focus:ring-primary"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="claim-reason" className="font-body text-label-sm text-on-surface-variant">
                    Reason / Household Note
                  </label>
                  <input
                    id="claim-reason"
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g., Family relief allocation"
                    className="w-full rounded border-outline-variant bg-surface text-body-md text-on-surface focus:border-primary focus:ring-primary"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || loading}
                className="w-full inline-flex items-center justify-center gap-gutter-sm px-4 py-3 rounded bg-primary text-on-primary font-body text-label-lg transition-colors duration-state-change ease-state-change hover:opacity-95 disabled:opacity-60"
              >
                <span>{submitting ? 'Submitting Claim...' : 'Submit Claim Request'}</span>
              </button>
            </form>
          </section>

          {/* Recent Household Claims List */}
          <section
            aria-label="Recent Household Claims"
            className="bg-surface-container-lowest border border-outline-variant rounded-md p-4 shadow-sm flex flex-col gap-gutter-sm"
          >
            <header className="flex items-center justify-between gap-gutter-sm pb-2 border-b border-outline-variant">
              <h2 className="font-headline text-title-md text-on-surface">Recent Household Claims</h2>
              <span className="font-body text-body-sm text-on-surface-variant tabular-nums">
                {claims.length} entries
              </span>
            </header>

            {claims.length === 0 ? (
              <p className="py-4 text-center font-body text-body-sm text-on-surface-variant">
                No claims submitted by your household yet.
              </p>
            ) : (
              <ul className="divide-y divide-outline-variant flex flex-col">
                {claims.map((claim) => {
                  const badgeStyle =
                    claim.status === 'approved'
                      ? 'bg-success-container text-on-success-container'
                      : claim.status === 'denied'
                      ? 'bg-error-container text-on-error-container'
                      : claim.status === 'released'
                      ? 'bg-surface-container-low text-on-surface-variant'
                      : 'bg-warning-container text-on-warning-container';

                  return (
                    <li key={claim.id} className="py-3 flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-gutter-sm">
                        <span className="font-body text-title-sm text-on-surface">
                          {claim.item_name} × {claim.approved_quantity || claim.requested_quantity}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full font-body text-label-sm capitalize whitespace-nowrap ${badgeStyle}`}
                        >
                          {claim.status}
                        </span>
                      </div>
                      <p className="font-mono text-mono-sm text-on-surface-variant tabular-nums">
                        #{String(claim.id).slice(0, 8).toUpperCase()} • {formatDate(claim.created_at)}
                        {claim.notes ? ` • ${claim.notes}` : ''}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
