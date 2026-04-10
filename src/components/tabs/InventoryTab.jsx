import React from 'react';

function InventoryTab({ systemFilter, persistSystemFilter, systems, inventoryTotals }) {
    return (
        <section className="panel">
            <div className="panel-header">
                <h2>Inventory totals</h2>

                <select
                    value={systemFilter}
                    onChange={(event) => persistSystemFilter(event.target.value)}
                >
                    {systems.map((system) => (
                        <option key={system} value={system}>
                            {system}
                        </option>
                    ))}
                </select>
            </div>

            {inventoryTotals.length === 0 ? (
                <div className="empty-state">No inventory totals to show.</div>
            ) : (
                <div className="table-like">
                    <div className="table-row table-head">
                        <div>Name</div>
                        <div>Type ID</div>
                        <div>Qty</div>
                        <div>Sources</div>
                    </div>

                    {inventoryTotals.map((row) => (
                        <div key={row.key} className="table-row">
                            <div>{row.name}</div>
                            <div>{row.typeId || '-'}</div>
                            <div>{row.quantity}</div>
                            <div>{row.sources.length}</div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

export default InventoryTab;