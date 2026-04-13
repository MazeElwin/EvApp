import React, { useState } from 'react';
import { extractMachineTypeLabel } from '../../lib/sui.js';

// ── HELPERS ─────────────────────────────────────────────────────────────────
function shortHash(str) {
    if (!str || str.length < 12) return str;
    return `${str.slice(0, 6)}…${str.slice(-4)}`;
}
function isHash(str) {
    return typeof str === 'string' && /^0x[a-fA-F0-9]{10,}$/.test(str.trim());
}

// ── HASH PILL ────────────────────────────────────────────────────────────────
function HashPill({ value, selected, onSelect }) {
    return (
        <button
            className={`hash-pill${selected ? ' hash-pill--active' : ''}`}
            onClick={() => onSelect(value)}
            title={value}
        >
            {shortHash(value)}
        </button>
    );
}

// ── SIMPLE INSPECTION VIEW ───────────────────────────────────────────────────
function SimpleInspection({ inspection }) {
    const [selectedHash, setSelectedHash] = useState(null);

    const obj = inspection?.object || {};
    const fields = obj?.content?.fields || obj?.fields || {};
    const metadata = fields?.metadata?.fields || {};
    const status = fields?.status?.fields?.status?.variant || 'UNKNOWN';
    const location = fields?.location?.fields || {};

    // Collect all hashes from the object tree
    const allHashes = [];
    function collectHashes(val, depth = 0) {
        if (depth > 5 || !val) return;
        if (typeof val === 'string' && isHash(val)) { allHashes.push(val); return; }
        if (typeof val === 'object') {
            for (const v of Object.values(val)) collectHashes(v, depth + 1);
        }
    }
    collectHashes(obj);
    const uniqueHashes = [...new Set(allHashes)].filter(h => h !== inspection.rootId);

    const inventories = inspection.parsedInventories || [];

    function toggleHash(v) {
        setSelectedHash(prev => prev === v ? null : v);
    }

    function renderField(label, value) {
        const str = String(value ?? '');
        const val = isHash(str)
            ? <HashPill value={str} selected={selectedHash === str} onSelect={toggleHash} />
            : <span className="insp-val">{str || '—'}</span>;
        return (
            <div className="insp-row" key={label}>
                <span className="insp-key">{label}</span>
                {val}
            </div>
        );
    }

    return (
        <div className="centered-card">
            {/* Identity */}
            <div className="insp-section-label">IDENTITY</div>
            <div className="insp-rows">
                <div className="insp-row">
                    <span className="insp-key">Assembly ID</span>
                    <HashPill
                        value={inspection.rootId}
                        selected={selectedHash === inspection.rootId}
                        onSelect={toggleHash}
                    />
                </div>
                {metadata.name && renderField('Name', metadata.name)}
                <div className="insp-row">
                    <span className="insp-key">Status</span>
                    <span className={`insp-status insp-status--${status.toLowerCase()}`}>{status}</span>
                </div>
                {fields.type_id && renderField('Type ID', fields.type_id)}
                {(location.solar_system || location.x !== undefined) && renderField(
                    'Location',
                    location.solar_system
                        ? `System ${location.solar_system}`
                        : `${location.x ?? 0}, ${location.y ?? 0}, ${location.z ?? 0}`
                )}
            </div>

            {/* Inventories */}
            <div className="insp-section-label" style={{ marginTop: 10 }}>INVENTORIES</div>
            {inventories.length === 0 ? (
                <div className="insp-empty">No inventories found</div>
            ) : (
                inventories.map((inv, i) => (
                    <div key={i} className="insp-inv-block">
                        <div className="insp-inv-header">
                            <span className="insp-inv-name">{inv.fieldName || `Inventory ${i + 1}`}</span>
                            <span className="insp-inv-cap">
                                {inv.usedCapacity ?? '?'} / {inv.maxCapacity ?? '?'} vol
                            </span>
                        </div>
                        {inv.items?.length > 0 ? (
                            <div className="insp-inv-items">
                                {inv.items.slice(0, 8).map((item, j) => (
                                    <div key={j} className="insp-inv-item">
                                        <span className="insp-inv-item-name">
                                            {item.itemName || item.typeId || '—'}
                                        </span>
                                        <span className="insp-inv-item-qty">×{item.quantity}</span>
                                    </div>
                                ))}
                                {inv.items.length > 8 && (
                                    <div className="insp-inv-more">+{inv.items.length - 8} more</div>
                                )}
                            </div>
                        ) : (
                            <div className="insp-empty" style={{ padding: '6px 8px' }}>Empty</div>
                        )}
                    </div>
                ))
            )}

            {/* Linked hashes */}
            {uniqueHashes.length > 0 && (
                <>
                    <div className="insp-section-label" style={{ marginTop: 10 }}>LINKED IDs</div>
                    <div className="insp-hashes">
                        {uniqueHashes.slice(0, 12).map(h => (
                            <HashPill key={h} value={h} selected={selectedHash === h} onSelect={toggleHash} />
                        ))}
                    </div>
                </>
            )}

            {/* Notes */}
            {inspection.notes?.length > 0 && (
                <div className="insp-notes" style={{ marginTop: 8 }}>
                    {inspection.notes.map((note, i) => (
                        <div key={i} className="hint">{note}</div>
                    ))}
                </div>
            )}

            {/* Hash detail */}
            {selectedHash && (
                <div className="hash-detail">
                    <div className="hash-detail-header">
                        <span className="insp-section-label">HASH DETAIL</span>
                        <button className="hash-detail-close" onClick={() => setSelectedHash(null)}>✕</button>
                    </div>
                    <div className="hash-detail-body">
                        <div className="hash-detail-full">{selectedHash}</div>
                        <button
                            className="small-button secondary"
                            style={{ marginTop: 6 }}
                            onClick={() => navigator.clipboard?.writeText(selectedHash)}
                        >
                            COPY
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── MACHINES TAB ─────────────────────────────────────────────────────────────
export default function MachinesTab({
    machineLoadStatus,
    handleMachineFile,
    clearMachines,
    machineIdInput,
    setMachineIdInput,
    systemInput,
    setSystemInput,
    machineSystemDefault,
    loading,
    handleInspectMachine,
    inspection,
    prettyJson,
    machines,
    typeCache,
    handleCopyMachineId,
    removeMachine,
    onSaveToCache,
    onSaveToJson,
    onClearCache,
    isDirty,
}) {
    const [inspMode, setInspMode] = useState('simple');

    // Inspect from a saved card — populate fields then fire
    function handleQuickInspect(machine) {
        setMachineIdInput(machine.id);
        setSystemInput(machine.system || machineSystemDefault);
        setTimeout(() => void handleInspectMachine(false), 50);
    }

    return (
        <section className="panel">

            {/* ── TOOLBAR ── */}
            <div className="machine-toolbar">
                {/* File group */}
                <label className="file-button">
                    LOAD JSON
                    <input type="file" accept=".json,application/json" onChange={handleMachineFile} hidden />
                </label>
                <button onClick={onSaveToJson} disabled={machines.length === 0}>
                    SAVE JSON
                </button>

                <div className="toolbar-sep" />

                {/* Cache group */}
                <button onClick={onSaveToCache} disabled={!inspection}>
                    SAVE TO CACHE
                </button>
                <button onClick={onClearCache} disabled={machines.length === 0} className="danger">
                    CLEAR CACHE
                </button>

                {/* Dirty indicator pushed to right */}
                {isDirty && (
                    <span className="unsaved-badge" style={{ marginLeft: 'auto' }}>UNSAVED</span>
                )}
            </div>

            {/* Status line — hidden when empty/default */}
            {machineLoadStatus && machineLoadStatus !== 'No machine inspection yet.' && (
                <p className="status-line">{machineLoadStatus}</p>
            )}

            <div className="stack" style={{ padding: '10px 12px', gap: 10 }}>

                {/* ── INSPECT INPUTS ── */}
                <div className="panel" style={{ padding: '10px 12px' }}>
                    <div className="controls-row" style={{ marginBottom: 8 }}>
                        <label className="field">
                            Assembly ID
                            <input
                                value={machineIdInput}
                                onChange={(e) => setMachineIdInput(e.target.value)}
                                placeholder="0x..."
                            />
                        </label>
                        <label className="field">
                            System
                            <input
                                value={systemInput}
                                onChange={(e) => setSystemInput(e.target.value)}
                                placeholder={machineSystemDefault}
                            />
                        </label>
                    </div>
                    <div className="button-row">
                        <button
                            className="primary"
                            style={{ flex: 1 }}
                            onClick={() => void handleInspectMachine(false)}
                            disabled={loading || !machineIdInput.trim()}
                        >
                            {loading ? 'LOADING…' : 'INSPECT'}
                        </button>
                        <button
                            style={{ flex: 1 }}
                            onClick={() => void handleInspectMachine(true)}
                            disabled={loading || !machineIdInput.trim()}
                        >
                            {loading ? 'LOADING…' : 'ADD'}
                        </button>
                    </div>
                </div>

                {/* ── SAVED MACHINES ── */}
                <div className="panel" style={{ minWidth: 0 }}>
                    <div className="panel-header">
                        <h3 style={{ margin: 0 }}>SAVED MACHINES ({machines.length})</h3>
                    </div>
                    {machines.length === 0 ? (
                        <div className="empty-state">No saved machines yet. Inspect and ADD one above.</div>
                    ) : (
                        <div className="machine-list" style={{ maxHeight: 380, overflowY: 'auto', padding: '8px 10px' }}>
                            {machines.map((machine) => (
                                <div key={machine.id} className="machine-card" style={{ alignItems: 'flex-start' }}>
                                    <div className="machine-card-main" style={{ minWidth: 0, flex: 1 }}>
                                        <div className="machine-title">{machine.displayName}</div>
                                        <div className="machine-meta" style={{ overflowWrap: 'anywhere' }}>
                                            {shortHash(machine.id)}
                                        </div>
                                        <div className="machine-meta">
                                            {machine.system || 'Unknown system'} · {
                                                typeCache?.[machine.machineTypeId]?.info?.name ||
                                                machine.machineSubtype ||
                                                extractMachineTypeLabel(machine.broadType || '')
                                            }
                                        </div>
                                        <div className="machine-meta">
                                            {(machine.parsedInventories || []).length} inventor{(machine.parsedInventories || []).length === 1 ? 'y' : 'ies'}
                                        </div>
                                    </div>
                                    <div className="button-col" style={{ flexShrink: 0 }}>
                                        <button
                                            className="small-button primary"
                                            onClick={() => handleQuickInspect(machine)}
                                            disabled={loading}
                                        >
                                            INSPECT
                                        </button>
                                        <button
                                            className="small-button secondary"
                                            onClick={() => handleCopyMachineId(machine.id)}
                                        >
                                            COPY ID
                                        </button>
                                        <button
                                            className="small-button danger"
                                            onClick={() => removeMachine(machine.id)}
                                        >
                                            REMOVE
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── INSPECTION RESULT ── */}
                {inspection && (
                    <div className="panel">
                        <div className="panel-header">
                            <h3 style={{ margin: 0 }}>INSPECTION RESULT</h3>
                            <div className="row gap">
                                <button
                                    className={`mode-btn${inspMode === 'simple' ? ' mode-btn--active' : ''}`}
                                    onClick={() => setInspMode('simple')}
                                >SIMPLE</button>
                                <button
                                    className={`mode-btn${inspMode === 'dev' ? ' mode-btn--active' : ''}`}
                                    onClick={() => setInspMode('dev')}
                                >DEV</button>
                            </div>
                        </div>

                        <div style={{ padding: '12px', display: 'flex', justifyContent: 'center' }}>
                            {inspMode === 'simple' ? (
                                <SimpleInspection inspection={inspection} />
                            ) : (
                                <div className="centered-card">
                                    <div className="insp-rows">
                                        {[
                                            ['Root ID', <code className="smallwrap" key="rid">{inspection.rootId}</code>],
                                            ['Dynamic Fields', inspection.dynamicFields?.length || 0],
                                            ['Field Objects', inspection.dynamicFieldObjects?.length || 0],
                                            ['Inventories', inspection.parsedInventories?.length || 0],
                                            ['Linked IDs', inspection.linkedIds?.length || 0],
                                        ].map(([label, val]) => (
                                            <div className="insp-row" key={label}>
                                                <span className="insp-key">{label}</span>
                                                <span className="insp-val">{val}</span>
                                            </div>
                                        ))}
                                    </div>
                                    {inspection.notes?.length > 0 && (
                                        <div style={{ marginTop: 8 }}>
                                            {inspection.notes.map((n, i) => <div key={i} className="hint">{n}</div>)}
                                        </div>
                                    )}
                                    <div className="json-wrap" style={{ marginTop: 10 }}>
                                        <pre>{prettyJson(inspection.object)}</pre>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

            </div>
        </section>
    );
}
