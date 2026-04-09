import React, { useMemo, useRef, useState } from 'react';
import { filterBlueprints, loadBlueprintData, numberOrZero } from './lib/blueprints.js';
import { aggregateInventory, buildStockLookup } from './lib/inventory.js';
import { getSystems, parseMachineFile } from './lib/machines.js';
import { collectRawShortages, createPlanTree } from './lib/planner.js';
import PlannerNode from './components/PlannerNode.jsx';

const STORAGE_KEYS = {
    machines: 'ef_saved_machines_v17',
    system: 'ef_planner_system_v17',
    selectedBlueprintKey: 'ef_selected_blueprint_key_v17',
    plannerQuantity: 'ef_planner_quantity_v17',
    plannerQueue: 'ef_planner_queue_v17',
    debugVisible: 'ef_debug_visible_v17'
};

const TABS = ['Machines', 'Inventory', 'Assembly', 'Other'];

function loadStoredJson(key, fallback) {
    try {
        const raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

function App() {
    const data = useMemo(() => loadBlueprintData(), []);
    const { blueprints, blueprintsByKey, blueprintsByOutputTypeId, blueprintsByOutputName, itemsById, categories } = data;

    const [activeTab, setActiveTab] = useState('Machines');
    const [machines, setMachines] = useState(() => loadStoredJson(STORAGE_KEYS.machines, []));
    const [systemFilter, setSystemFilter] = useState(
        () => window.localStorage.getItem(STORAGE_KEYS.system) || 'All systems'
    );
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [searchText, setSearchText] = useState('');
    const [selectedBlueprintKey, setSelectedBlueprintKey] = useState(
        () => window.localStorage.getItem(STORAGE_KEYS.selectedBlueprintKey) || ''
    );
    const [plannerQuantity, setPlannerQuantity] = useState(
        () => Number(window.localStorage.getItem(STORAGE_KEYS.plannerQuantity) || 1)
    );
    const [plannerQueue, setPlannerQueue] = useState(
        () => loadStoredJson(STORAGE_KEYS.plannerQueue, [])
    );
    const [machineLoadStatus, setMachineLoadStatus] = useState('No machine file loaded yet.');
    const [debugVisible, setDebugVisible] = useState(
        () => window.localStorage.getItem(STORAGE_KEYS.debugVisible) === '1'
    );

    const plannerViewportRef = useRef(null);
    const panRef = useRef({
        active: false,
        startX: 0,
        startY: 0,
        scrollLeft: 0,
        scrollTop: 0
    });

    const systems = useMemo(() => getSystems(machines), [machines]);

    const inventoryTotals = useMemo(
        () => aggregateInventory(machines, systemFilter, itemsById),
        [machines, systemFilter, itemsById]
    );

    const stockLookup = useMemo(() => buildStockLookup(inventoryTotals), [inventoryTotals]);

    const filteredBlueprints = useMemo(
        () => filterBlueprints(blueprints, selectedCategory, searchText),
        [blueprints, selectedCategory, searchText]
    );

    const selectedBlueprint =
        blueprintsByKey.get(selectedBlueprintKey) || filteredBlueprints[0] || null;

    function persistMachines(next) {
        setMachines(next);
        window.localStorage.setItem(STORAGE_KEYS.machines, JSON.stringify(next));
    }

    function persistSystemFilter(next) {
        setSystemFilter(next);
        window.localStorage.setItem(STORAGE_KEYS.system, next);
    }

    function persistSelectedBlueprintKey(next) {
        setSelectedBlueprintKey(next);
        window.localStorage.setItem(STORAGE_KEYS.selectedBlueprintKey, next);
    }

    function persistPlannerQuantity(next) {
        setPlannerQuantity(next);
        window.localStorage.setItem(STORAGE_KEYS.plannerQuantity, String(next));
    }

    function persistPlannerQueue(next) {
        setPlannerQueue(next);
        window.localStorage.setItem(STORAGE_KEYS.plannerQueue, JSON.stringify(next));
    }

    function persistDebugVisible(next) {
        setDebugVisible(next);
        window.localStorage.setItem(STORAGE_KEYS.debugVisible, next ? '1' : '0');
    }

    function handleMachineFile(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();

        reader.onload = () => {
            try {
                const result = parseMachineFile(String(reader.result || ''), itemsById);
                const merged = [...machines, ...result.machines];
                persistMachines(merged);
                setMachineLoadStatus(result.parseStatus);
            } catch (error) {
                setMachineLoadStatus(error instanceof Error ? error.message : 'Failed to load machine file.');
            }
        };

        reader.onerror = () => {
            setMachineLoadStatus('Failed to read machine file.');
        };

        reader.readAsText(file);
        event.target.value = '';
    }

    function removeMachine(machineId) {
        const next = machines.filter((machine) => machine.id !== machineId);
        persistMachines(next);
    }

    function clearMachines() {
        persistMachines([]);
        setMachineLoadStatus('Cleared all machines.');
    }

    function addPlannerTarget() {
        if (!selectedBlueprint) return;

        const quantity = Math.max(1, numberOrZero(plannerQuantity) || 1);

        const plan = createPlanTree(
            selectedBlueprint,
            quantity,
            {
                blueprintsByOutputTypeId,
                blueprintsByOutputName,
                itemsById,
                stockLookup
            },
            new Map()
        );

        persistPlannerQueue([...plannerQueue, plan]);
    }

    function removePlannerNode(nodeId) {
        persistPlannerQueue(plannerQueue.filter((node) => node.id !== nodeId));
    }

    function clearPlannerQueue() {
        persistPlannerQueue([]);
    }

    function handlePanStart(event) {
        if (!plannerViewportRef.current) return;
        if (event.target.closest('.planner-node') || event.target.closest('button') || event.target.closest('select') || event.target.closest('input')) {
            return;
        }

        const viewport = plannerViewportRef.current;
        panRef.current = {
            active: true,
            startX: event.clientX,
            startY: event.clientY,
            scrollLeft: viewport.scrollLeft,
            scrollTop: viewport.scrollTop
        };

        viewport.classList.add('is-panning');
    }

    function handlePanMove(event) {
        if (!panRef.current.active || !plannerViewportRef.current) return;

        const viewport = plannerViewportRef.current;
        const deltaX = event.clientX - panRef.current.startX;
        const deltaY = event.clientY - panRef.current.startY;

        viewport.scrollLeft = panRef.current.scrollLeft - deltaX;
        viewport.scrollTop = panRef.current.scrollTop - deltaY;
    }

    function handlePanEnd() {
        if (!plannerViewportRef.current) return;
        panRef.current.active = false;
        plannerViewportRef.current.classList.remove('is-panning');
    }

    const totalRawShortages = useMemo(() => {
        const shortages = [];
        for (const node of plannerQueue) {
            collectRawShortages(node, shortages);
        }
        return shortages;
    }, [plannerQueue]);

    return (
        <div className="app-shell">
            <header className="topbar">
                <div>
                    <h1>EVE Frontier Inventory Planner</h1>
                    <p className="muted">
                        Local runtime data only. No live spreadsheet loading.
                    </p>
                </div>

                <div className="tabs">
                    {TABS.map((tab) => (
                        <button
                            key={tab}
                            className={tab === activeTab ? 'tab active' : 'tab'}
                            onClick={() => setActiveTab(tab)}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </header>

            {activeTab === 'Machines' ? (
                <section className="panel">
                    <div className="panel-header">
                        <h2>Machines</h2>
                        <div className="row gap">
                            <label className="file-button">
                                Load machine JSON
                                <input type="file" accept=".json,application/json" onChange={handleMachineFile} hidden />
                            </label>
                            <button className="small-button danger" onClick={clearMachines}>
                                Clear all
                            </button>
                        </div>
                    </div>

                    <p className="status-line">{machineLoadStatus}</p>

                    {machines.length === 0 ? (
                        <div className="empty-state">No machines loaded.</div>
                    ) : (
                        <div className="machine-list">
                            {machines.map((machine) => (
                                <div key={machine.id} className="machine-card">
                                    <div className="machine-card-main">
                                        <div className="machine-title">{machine.displayName}</div>
                                        <div className="machine-meta">ID: {machine.id}</div>
                                        <div className="machine-meta">System: {machine.system || 'Unknown system'}</div>
                                        <div className="machine-meta">Inventory rows: {machine.inventory.length}</div>
                                    </div>
                                    <button className="small-button danger" onClick={() => removeMachine(machine.id)}>
                                        Remove
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            ) : null}

            {activeTab === 'Inventory' ? (
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
            ) : null}

            {activeTab === 'Assembly' ? (
                <section className="panel assembly-panel">
                    <div className="assembly-controls">
                        <div className="field">
                            <label>Category</label>
                            <select
                                value={selectedCategory}
                                onChange={(event) => setSelectedCategory(event.target.value)}
                            >
                                {categories.map((category) => (
                                    <option key={category} value={category}>
                                        {category}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="field">
                            <label>Search</label>
                            <input
                                value={searchText}
                                onChange={(event) => setSearchText(event.target.value)}
                                placeholder="Search blueprint..."
                            />
                        </div>

                        <div className="field">
                            <label>Blueprint</label>
                            <select
                                value={selectedBlueprint?.blueprintKey || ''}
                                onChange={(event) => persistSelectedBlueprintKey(event.target.value)}
                            >
                                {filteredBlueprints.map((bp) => (
                                    <option key={bp.blueprintKey} value={bp.blueprintKey}>
                                        {bp.name} — {bp.machineLabel} — {bp.category}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="field small">
                            <label>Qty</label>
                            <input
                                type="number"
                                min="1"
                                value={plannerQuantity}
                                onChange={(event) => persistPlannerQuantity(Math.max(1, numberOrZero(event.target.value) || 1))}
                            />
                        </div>

                        <div className="row gap">
                            <button className="small-button" onClick={addPlannerTarget} disabled={!selectedBlueprint}>
                                Add to planner
                            </button>
                            <button className="small-button danger" onClick={clearPlannerQueue}>
                                Clear planner
                            </button>
                        </div>
                    </div>

                    <div
                        ref={plannerViewportRef}
                        className="planner-viewport"
                        onMouseDown={handlePanStart}
                        onMouseMove={handlePanMove}
                        onMouseUp={handlePanEnd}
                        onMouseLeave={handlePanEnd}
                    >
                        <div className="planner-canvas">
                            {plannerQueue.length === 0 ? (
                                <div className="empty-state large">No assembly plan yet.</div>
                            ) : (
                                plannerQueue.map((node) => (
                                    <PlannerNode key={node.id} node={node} onRemove={removePlannerNode} />
                                ))
                            )}
                        </div>
                    </div>

                    {totalRawShortages.length > 0 ? (
                        <div className="shortage-box">
                            <h3>Raw shortages</h3>
                            <ul>
                                {totalRawShortages.map((row, index) => (
                                    <li key={`${row.typeId || row.name}-${index}`}>
                                        {row.name} {row.typeId ? `(ID: ${row.typeId})` : ''} — {row.quantity}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}
                </section>
            ) : null}

            {activeTab === 'Other' ? (
                <section className="panel">
                    <div className="panel-header">
                        <h2>Other</h2>
                        <button className="small-button" onClick={() => persistDebugVisible(!debugVisible)}>
                            {debugVisible ? 'Hide debug' : 'Show debug'}
                        </button>
                    </div>

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
                                <div className="debug-label">Queue size</div>
                                <div className="debug-value">{plannerQueue.length}</div>
                            </div>
                            <div className="debug-card">
                                <div className="debug-label">Selected category count</div>
                                <div className="debug-value">{filteredBlueprints.length}</div>
                            </div>
                            <div className="debug-card">
                                <div className="debug-label">Selected blueprint key</div>
                                <div className="debug-value break">{selectedBlueprint?.blueprintKey || '-'}</div>
                            </div>
                            <div className="debug-card">
                                <div className="debug-label">Inventory total count</div>
                                <div className="debug-value">{inventoryTotals.length}</div>
                            </div>
                            <div className="debug-card wide">
                                <div className="debug-label">Machine file parse status</div>
                                <div className="debug-value break">{machineLoadStatus}</div>
                            </div>
                        </div>
                    ) : (
                        <div className="empty-state">Debug panel hidden.</div>
                    )}
                </section>
            ) : null}
        </div>
    );
}

export default App;