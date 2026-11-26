import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { useToast } from '../contexts/ToastContext';

export default function AuditLog() {
  const { addToast } = useToast();

  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/audit-logs', {
        params: {
          action: actionFilter || undefined,
          entity_type: entityFilter || undefined,
          page,
          limit: 25,
        },
      });
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch {
      addToast('Failed to load audit log ledger', 'error');
    } finally {
      setLoading(false);
    }
  }, [actionFilter, entityFilter, page, addToast]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const formatTimestamp = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const filteredLogs = searchQuery.trim()
    ? logs.filter((l) => {
        const q = searchQuery.toLowerCase();
        return (
          String(l.id || '').toLowerCase().includes(q) ||
          String(l.entity_id || '').toLowerCase().includes(q) ||
          String(l.action || '').toLowerCase().includes(q) ||
          String(l.performer_name || '').toLowerCase().includes(q)
        );
      })
    : logs;

  const formatDeltaSummary = (log) => {
    if (log.new_value?.approved_quantity) {
      return `${log.entity_type} (-${log.new_value.approved_quantity} FEFO)`;
    }
    if (log.new_value?.total_quantity != null && log.old_value?.total_quantity != null) {
      return `threshold: ${log.old_value.low_stock_threshold} → ${log.new_value.low_stock_threshold}`;
    }
    if (log.new_value?.name) {
      return `${log.new_value.name} (${log.new_value.total_quantity ?? 0})`;
    }
    if (log.new_value?.status) {
      return `status → ${log.new_value.status}`;
    }
    return log.entity_type || 'system';
  };

  return (
    <div className="flex flex-col gap-section">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-gutter-md">
        <div className="flex flex-col gap-gutter-xs">
          <h1 className="font-headline text-headline-lg text-on-surface">
            Audit Log &amp; Transaction History
          </h1>
          <p className="font-body text-body-md text-on-surface-variant">
            Immutable ledger tracking every stock deduction, claim release, donation intake, and inventory update.
          </p>
        </div>

        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-success-container text-on-success-container font-body text-label-sm shrink-0">
          <span className="material-symbols-outlined text-body-sm" aria-hidden="true">
            verified_user
          </span>
          <span>COA / DSWD Tamper-Evident Ledger</span>
        </span>
      </header>

      {/* Search & Filter Controls */}
      <section
        aria-label="Audit Filters"
        className="bg-surface-container-lowest border border-outline-variant rounded-md p-4 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-gutter-md"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="audit-search" className="font-body text-label-sm text-on-surface-variant">
            Search Transaction / ID / Staff
          </label>
          <input
            id="audit-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search TX, action, or officer..."
            className="w-full rounded border-outline-variant bg-surface text-body-md text-on-surface focus:border-primary focus:ring-primary"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="audit-entity" className="font-body text-label-sm text-on-surface-variant">
            Entity Type
          </label>
          <select
            id="audit-entity"
            value={entityFilter}
            onChange={(e) => {
              setEntityFilter(e.target.value);
              setPage(1);
            }}
            className="w-full rounded border-outline-variant bg-surface text-body-md text-on-surface focus:border-primary focus:ring-primary"
          >
            <option value="">All Entities</option>
            <option value="claim">Claims</option>
            <option value="inventory_item">Inventory Items</option>
            <option value="user">User Sessions</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="audit-action" className="font-body text-label-sm text-on-surface-variant">
            Action Type
          </label>
          <select
            id="audit-action"
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            className="w-full rounded border-outline-variant bg-surface text-body-md text-on-surface focus:border-primary focus:ring-primary"
          >
            <option value="">All Actions</option>
            <option value="CLAIM_APPROVED">Claim Approved</option>
            <option value="CLAIM_RELEASED">Claim Released</option>
            <option value="CLAIM_DENIED">Claim Denied</option>
            <option value="ITEM_CREATED">Item Created</option>
            <option value="ITEM_UPDATED">Item Updated</option>
            <option value="USER_LOGIN">User Login</option>
          </select>
        </div>

        <div className="flex items-end">
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setEntityFilter('');
              setActionFilter('');
              setPage(1);
            }}
            className="w-full px-3 py-2 rounded border border-outline-variant bg-surface-container-lowest text-primary font-body text-label-md hover:bg-primary-container transition-colors duration-state-change"
          >
            Reset Filters ({total} total)
          </button>
        </div>
      </section>

      {/* Audit Table */}
      <section className="bg-surface-container-lowest border border-outline-variant rounded-md shadow-sm flex flex-col">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[920px] text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant">
                <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Timestamp</th>
                <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Transaction ID</th>
                <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Staff User</th>
                <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Action Taken</th>
                <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Item &amp; Delta</th>
                <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Reference ID</th>
                <th className="px-4 py-3 font-body text-label-md text-on-surface-variant">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center font-body text-body-md text-on-surface-variant">
                    Loading audit ledger...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center font-body text-body-md text-on-surface-variant">
                    No matching audit records found.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const isNegative = log.action?.includes('APPROVED') || log.action?.includes('DENIED');
                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-surface-container-low transition-colors duration-state-change"
                    >
                      <td className="px-4 py-3.5 whitespace-nowrap font-mono text-mono-sm text-on-surface-variant tabular-nums">
                        {formatTimestamp(log.created_at)}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap font-mono text-mono-sm text-on-surface tabular-nums">
                        TX-{String(log.id).slice(0, 6).toUpperCase()}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap font-body text-body-sm text-on-surface">
                        {log.performer_name || 'System'}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap font-body text-body-sm text-on-surface">
                        {log.action}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span
                          className={`font-mono text-mono-sm tabular-nums ${
                            isNegative ? 'text-crimson-alert' : 'text-success'
                          }`}
                        >
                          {formatDeltaSummary(log)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap font-mono text-mono-sm text-on-surface-variant tabular-nums">
                        #{log.entity_id ? String(log.entity_id).slice(0, 8).toUpperCase() : 'SYSTEM'}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-success-container text-on-success-container font-body text-label-sm">
                          Committed
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-4 py-3 border-t border-outline-variant flex items-center justify-between">
          <span className="font-body text-body-sm text-on-surface-variant tabular-nums">
            Showing {filteredLogs.length} of {total} transactions
          </span>
          <div className="flex items-center gap-gutter-sm">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1 rounded border border-outline-variant bg-surface-container-lowest text-on-surface font-body text-label-sm disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page * 25 >= total}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 rounded border border-outline-variant bg-surface-container-lowest text-on-surface font-body text-label-sm disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
