import { useEffect, useState, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import api from '../lib/api';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard Overview', icon: 'dashboard', end: true },
  { to: '/donations', label: 'Incoming Donations', icon: 'volunteer_activism' },
  { to: '/cash-assistance', label: 'Cash Assistance', icon: 'payments' },
  { to: '/claims', label: 'Claim Approvals', icon: 'fact_check', showPendingBadge: true },
  { to: '/inventory', label: 'Batch Inventory & Expiry', icon: 'inventory_2' },
  { to: '/reports', label: 'Distribution Reports', icon: 'bar_chart' },
  { to: '/audit', label: 'Audit Logs', icon: 'receipt_long' },
];

function BarangaySealSvg({ className = 'w-7 h-7 text-on-primary' }) {
  return (
    <svg viewBox="0 0 36 36" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="18" cy="18" r="15" stroke="currentColor" strokeWidth="1.75" strokeOpacity="0.85" />
      <path
        d="M9 21.5C11.5 19.5 14 19.5 16.5 21.5C19 23.5 21.5 23.5 24 21.5C25.2 20.5 26.2 20 27 20"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M18 9L23 13.5V17.5C23 20.5 20.8 23.1 18 24C15.2 23.1 13 20.5 13 17.5V13.5L18 9Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="18" cy="15.5" r="1.75" fill="currentColor" />
    </svg>
  );
}

export { BarangaySealSvg };

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { socket, connected } = useSocket() || {};
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const fetchPendingCount = useCallback(async () => {
    try {
      const { data } = await api.get('/dashboard/stats');
      setPendingCount(Number(data?.claims?.pending_claims || 0));
    } catch {
      // Non-blocking badge fetch
    }
  }, []);

  useEffect(() => {
    fetchPendingCount();
  }, [fetchPendingCount]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => fetchPendingCount();
    socket.on('claim:update', refresh);
    return () => socket.off('claim:update', refresh);
  }, [socket, fetchPendingCount]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const fullName = user?.full_name || user?.username || 'Duty Officer';
  const initials = fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

  const roleLabel =
    user?.role === 'admin'
      ? 'BDRRMC Administrator'
      : user?.role === 'staff'
      ? 'BDRRMC Duty Officer'
      : 'Verified Resident';

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-surface text-on-surface font-body">
      {/* Left Navigation Sidebar */}
      <aside className="w-full lg:w-60 shrink-0 bg-surface-container-lowest border-b lg:border-b-0 lg:border-r border-outline-variant flex flex-col justify-between p-4 gap-gutter-lg">
        <div className="flex flex-col gap-gutter-lg">
          {/* Barangay Brand & Seal + Mobile Toggle */}
          <div className="flex items-center justify-between gap-gutter-sm">
            <div className="flex items-center gap-gutter-sm min-w-0">
              <div
                className="w-10 h-10 rounded-md bg-primary flex items-center justify-center shrink-0"
                aria-hidden="true"
              >
                <BarangaySealSvg />
              </div>
              <div className="min-w-0">
                <p className="font-headline text-title-sm text-on-surface leading-tight truncate">
                  Brgy. Barretto ReliefOps
                </p>
                <p className="font-body text-body-sm text-on-surface-variant truncate">
                  Olongapo City, Zambales
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle navigation menu"
              className="lg:hidden w-9 h-9 rounded border border-outline-variant flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low"
            >
              <span className="material-symbols-outlined text-title-md" aria-hidden="true">
                {mobileMenuOpen ? 'close' : 'menu'}
              </span>
            </button>
          </div>

          <div className={`${mobileMenuOpen ? 'flex' : 'hidden'} lg:flex flex-col gap-gutter-lg`}>
            {/* Live Socket.IO Connection Badge */}
            <div
              className={`flex items-center gap-gutter-sm px-3 py-2 rounded border border-outline-variant ${
                connected ? 'bg-success-container' : 'bg-warning-container'
              }`}
            >
              <span
                role="status"
                aria-label={connected ? 'Live Sync Connected' : 'Connecting Live Sync'}
                className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${
                  connected ? 'bg-emerald-verified animate-pulse' : 'bg-amber-fifo'
                }`}
              />
              <span
                className={`font-body text-label-md ${
                  connected ? 'text-on-success-container' : 'text-on-warning-container'
                }`}
              >
                {connected ? 'Live Sync Connected' : 'Sync Reconnecting...'}
              </span>
            </div>

            {/* Primary Navigation */}
            <nav aria-label="Main Navigation" className="flex flex-col gap-gutter-xs">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center justify-between gap-gutter-sm px-3 py-2.5 rounded font-body text-label-md transition-colors duration-state-change ease-state-change ${
                      isActive
                        ? 'bg-primary-container text-primary'
                        : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className="flex items-center gap-gutter-sm min-w-0">
                        <span
                          className="material-symbols-outlined text-title-md shrink-0"
                          style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                          aria-hidden="true"
                        >
                          {item.icon}
                        </span>
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.showPendingBadge && pendingCount > 0 && (
                        <span
                          role="status"
                          className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-primary text-on-primary font-body text-label-sm tabular-nums shrink-0"
                        >
                          {pendingCount}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>

        {/* Active Duty Officer Footer */}
        <div
          className={`${
            mobileMenuOpen ? 'flex' : 'hidden'
          } lg:flex pt-4 border-t border-outline-variant items-center justify-between gap-gutter-sm`}
        >
          <div className="flex items-center gap-gutter-sm min-w-0">
            <div className="w-9 h-9 rounded-full bg-primary-container text-primary flex items-center justify-center font-body text-label-md shrink-0">
              {initials || 'DO'}
            </div>
            <div className="min-w-0">
              <p className="font-body text-title-sm text-on-surface truncate">{fullName}</p>
              <p className="font-body text-body-sm text-on-surface-variant truncate">{roleLabel}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            title="Sign out"
            aria-label="Sign out"
            className="w-8 h-8 rounded flex items-center justify-center text-on-surface-variant hover:bg-error-container hover:text-on-error-container transition-colors duration-state-change shrink-0"
          >
            <span className="material-symbols-outlined text-title-md" aria-hidden="true">
              logout
            </span>
          </button>
        </div>
      </aside>

      {/* Main Operations Workspace */}
      <main className="flex-1 min-w-0 p-5 flex flex-col gap-section">{children}</main>
    </div>
  );
}
