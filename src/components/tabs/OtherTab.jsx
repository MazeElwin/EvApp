import React from 'react';

function OtherTab({
    handleSaveImport,
    handleSaveExport,
    clearEverything,
    debugVisible,
    persistDebugVisible,
    saveLoadStatus,
    blueprints,
    machines,
    walletAddress,
    plannerQueue,
    filteredBlueprints,
    selectedBlueprint,
    inventoryTotals,
    walletLoadStatus,
    machineLoadStatus
}) {
    return (
        <section className="panel">
            <div className="panel-header">
                <h2>Other</h2>
                <div className="row gap">
                    <label className="file-button">
                        Load app save
                        <input
                            type="file"
                            accept=".json,application/json"
                            onChange={handleSaveImport}
                            hidden
                        />
                    </label>
                    <button className="small-button" onClick={handleSaveExport}>
                        Export app save
                    </button>
                    <button className="small-button danger" onClick={clearEverything}>
                        Clear all state
                    </button>
                    <button
                        className="small-button"
                        onClick={() => persistDebugVisible(!debugVisible)}
                    >
                        {debugVisible ? 'Hide debug' : 'Show debug'}
                    </button>
                </div>
            </div>

            <p className="status-line">{saveLoadStatus}</p>

            {debugVisible ? (
                <div className="debug-grid">
                    <div className="debug-card">
                        <div className="debug-label">Loaded blueprint count</div>
                        <div className="debug-value">{blueprints.length}</div>
                    </div>
                    <div className="debug-card">
                        <div className="debug-label">Loaded machine count</div>
                        <div className="debug-value">{machines.length}</div>
                    </div>
                    <div className="debug-card">
                        <div className="debug-label">Wallet address</div>
                        <div className="debug-value break">{walletAddress || '-'}</div>
                    </div>
                    <div className="debug-card">
                        <div className="debug-label">Queue size</div>
                        <div className="debug-value">{plannerQueue.length}</div>
                    </div>
                    <div className="debug-card">
                        <div className="debug-label">Selected category count</div>
                        <div className="debug-value">{filteredBlueprints.length}</div>
                    </div>
                    <div className="debug-card">
                        <div className="debug-label">Selected blueprint key</div>
                        <div className="debug-value break">
                            {selectedBlueprint?.blueprintKey || '-'}
                        </div>
                    </div>
                    <div className="debug-card">
                        <div className="debug-label">Inventory total count</div>
                        <div className="debug-value">{inventoryTotals.length}</div>
                    </div>
                    <div className="debug-card wide">
                        <div className="debug-label">Wallet status</div>
                        <div className="debug-value break">{walletLoadStatus}</div>
                    </div>
                    <div className="debug-card wide">
                        <div className="debug-label">Machine status</div>
                        <div className="debug-value break">{machineLoadStatus}</div>
                    </div>
                    <div className="debug-card wide">
                        <div className="debug-label">Save file status</div>
                        <div className="debug-value break">{saveLoadStatus}</div>
                    </div>
                </div>
            ) : null}
        </section>
    );
}

export default OtherTab;