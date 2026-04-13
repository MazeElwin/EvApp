import React from 'react';

function timeAgo(ts) {
    const secs = Math.floor((Date.now() - ts) / 1000);
    if (secs < 5) return 'just now';
    if (secs < 60) return `${secs}s ago`;
    return `${Math.floor(secs / 60)}m ago`;
}

export default function InventoryTab({
    systemFilter,
    persistSystemFilter,
    systems,
    inventoryTotals,
    lastRefreshed,
    onRefresh,
    loading,
}) {
    return (
        <section className="panel" style={{ padding: '14px 16px' }}>

            {/* ── HEADER ROW ── */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 10,
                marginBottom: 12,
                maxWidth: 680,
                margin: '0 auto 12px',
            }}>
                <h2 style={{ marginBottom: 0 }}>Inventory Totals</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <select
                        value={systemFilter}
                        onChange={(e) => persistSystemFilter(e.target.value)}
                        style={{ height: 30, padding: '0 8px', fontSize: 12 }}
                    >
                        {systems.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <span className="refresh-ts">Updated {timeAgo(lastRefreshed)}</span>
                    <button
                        className="small-button primary"
                        style={{ height: 30, padding: '0 12px' }}
                        onClick={onRefresh}
                        disabled={loading}
                    >
                        {loading ? 'REFRESHING…' : '↺ REFRESH'}
                    </button>
                </div>
            </div>

            {/* ── TABLE ── */}
            {inventoryTotals.length === 0 ? (
                <div className="empty-state" style={{ maxWidth: 680, margin: '0 auto' }}>
                    No inventory data — inspect and ADD machines on the Machines tab first.
                </div>
            ) : (
                <div style={{ maxWidth: 680, margin: '0 auto' }}>
                    {/* Header row */}
                    <div className="inv-table-row inv-table-head">
                        <span>Name</span>
                        <span style={{ textAlign: 'right' }}>Qty</span>
                        <span style={{ textAlign: 'right' }}>Sources</span>
                    </div>
                    {inventoryTotals.map((row) => (
                        <div key={row.key} className="inv-table-row">
                            <span className="inv-name" title={row.typeId || ''}>
                                {row.name}
                            </span>
                            <span className="inv-qty">
                                {row.quantity.toLocaleString()}
                            </span>
                            <span className="inv-src">
                                {row.sources.length}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
