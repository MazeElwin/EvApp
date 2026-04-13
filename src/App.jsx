import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    filterBlueprints,
    loadBlueprintData,
    numberOrZero,
    normalizeName,
    resolveItemName
} from './lib/blueprints.js';
import { buildStockLookup } from './lib/inventory.js';
import { collectRawShortages, createPlanTree } from './lib/planner.js';
import { useSaveController } from './hooks/useSaveController.js';
import { useMachineController } from './hooks/useMachineController.js';
import { useTypeCacheController } from './hooks/useTypeCacheController.js';
import {
    inferRecipeCategory,
    loadStoredJson,
    MACHINE_SYSTEM_DEFAULT,
    makeSaveFilename,
    prettyJson,
    STORAGE_KEYS,
} from './lib/appHelpers.js';
import MachinesTab from './components/tabs/MachinesTab.jsx';
import InventoryTab from './components/tabs/InventoryTab.jsx';
import AssemblyTab from './components/tabs/AssemblyTab.jsx';
import OtherTab from './components/tabs/OtherTab.jsx';

const ZOOM_KEY = 'ev_planner_zoom';
const TABS = ['Machines', 'Inventory', 'Assembly', 'Settings'];
const INVENTORY_REFRESH_INTERVAL = 60_000; // 60 seconds

// Walk planner tree, rebuild a node by id with a new blueprint
function rebuildNodeById(node, targetId, blueprintKey, blueprintsByKey, context, options) {
    if (!node) return node;
    if (node.id === targetId) {
        const newBp = blueprintsByKey.get(blueprintKey);
        if (!newBp) return node;
        return createPlanTree(newBp, node.quantityNeeded, context, new Map(), options, {});
    }
    if (!node.children?.length) return node;
    const newChildren = node.children.map(child =>
        rebuildNodeById(child, targetId, blueprintKey, blueprintsByKey, context, options)
    );
    const changed = newChildren.some((c, i) => c !== node.children[i]);
    if (!changed) return node;
    return { ...node, children: newChildren };
}

function App() {
    const data = useMemo(() => loadBlueprintData(), []);
    const {
        blueprints,
        blueprintsByKey,
        blueprintsByOutputTypeId,
        blueprintsByOutputName,
        itemsById,
        categories
    } = data;

    const [activeTab, setActiveTab] = useState('Machines');
    const [network] = useState(
        () => window.localStorage.getItem(STORAGE_KEYS.network) || 'testnet'
    );

    // ── MACHINES ─────────────────────────────────────────────────────────────
    const [machineIdInput, setMachineIdInput] = useState('');
    const [systemInput, setSystemInput] = useState(MACHINE_SYSTEM_DEFAULT);
    const [inspection, setInspection] = useState(null);
    const [machines, setMachines] = useState(() =>
        loadStoredJson(STORAGE_KEYS.machines, [])
    );
    const [machineLoadStatus, setMachineLoadStatus] = useState('No machine inspection yet.');
    const [isDirty, setIsDirty] = useState(false);   // unsaved changes flag

    // Track when machines change to set dirty flag
    const prevMachinesRef = useRef(machines);
    useEffect(() => {
        if (prevMachinesRef.current !== machines) {
            setIsDirty(true);
            prevMachinesRef.current = machines;
            window.localStorage.setItem(STORAGE_KEYS.machines, JSON.stringify(machines));
        }
    }, [machines]);

    const { typeCache, resolveTypeIds } = useTypeCacheController({ machines });

    // ── INVENTORY ────────────────────────────────────────────────────────────
    const [systemFilter, setSystemFilter] = useState(
        () => window.localStorage.getItem(STORAGE_KEYS.system) || 'All systems'
    );
    const [lastRefreshed, setLastRefreshed] = useState(Date.now());

    // Refresh inventory by re-inspecting all saved machines in background
    const refreshInventory = useCallback(async () => {
        if (machines.length === 0) return;
        try {
            const { inspectObjectId, machineFromInspection } = await import('./lib/sui.js');
            const updated = await Promise.all(
                machines.map(async (machine) => {
                    try {
                        const result = await inspectObjectId(network, machine.id);
                        const refreshed = await machineFromInspection(
                            result, machine.walletAddress || '', machine.system || MACHINE_SYSTEM_DEFAULT, typeCache
                        );
                        return refreshed || machine;
                    } catch {
                        return machine; // keep stale on error
                    }
                })
            );
            setMachines(updated);
            setLastRefreshed(Date.now());
            setIsDirty(false); // refresh counts as a save to cache
        } catch {
            // silently fail on background refresh
        }
    }, [machines, network, typeCache]);

    // Auto-refresh every 60s when on Inventory tab
    useEffect(() => {
        if (activeTab !== 'Inventory') return;
        const id = setInterval(refreshInventory, INVENTORY_REFRESH_INTERVAL);
        return () => clearInterval(id);
    }, [activeTab, refreshInventory]);

    // ── ASSEMBLY ─────────────────────────────────────────────────────────────
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [searchText, setSearchText] = useState('');
    const [selectedBlueprintKey, setSelectedBlueprintKey] = useState(
        () => window.localStorage.getItem(STORAGE_KEYS.selectedBlueprintKey) || ''
    );
    const [plannerQuantity, setPlannerQuantity] = useState(
        () => Number(window.localStorage.getItem(STORAGE_KEYS.plannerQuantity) || 1)
    );
    const [plannerQueue, setPlannerQueue] = useState(() =>
        loadStoredJson(STORAGE_KEYS.plannerQueue, [])
    );
    const [debugVisible, setDebugVisible] = useState(
        () => window.localStorage.getItem(STORAGE_KEYS.debugVisible) === '1'
    );
    const [zoom, setZoom] = useState(() => {
        const stored = parseFloat(window.localStorage.getItem(ZOOM_KEY));
        return isNaN(stored) ? 1 : Math.min(2, Math.max(0.4, stored));
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const plannerViewportRef = useRef(null);
    const panRef = useRef({ active: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 });

    // ── INVENTORY COMPUTED ────────────────────────────────────────────────────
    const inventoryRows = useMemo(() => {
        const rows = [];
        for (const machine of machines) {
            for (const inv of machine.parsedInventories || []) {
                for (const row of inv.items || []) {
                    const cachedInfo = typeCache[row.typeId]?.info;
                    const itemName =
                        cachedInfo?.name ||
                        itemsById[String(row.typeId || '')] ||
                        resolveItemName(row.typeId, '', itemsById);
                    rows.push({
                        typeId: String(row.typeId || ''),
                        itemId: String(row.itemId || ''),
                        quantity: Number(row.quantity || 0),
                        unitVolume: Number(row.unitVolume || 0),
                        totalVolume: Number(row.totalVolume || 0),
                        tenant: String(row.tenant || ''),
                        inventoryObjectId: String(row.inventoryObjectId || ''),
                        fieldName: String(row.fieldName || ''),
                        itemName,
                        categoryName: cachedInfo?.categoryName || inferRecipeCategory(itemName),
                        groupName: cachedInfo?.groupName || '',
                        machineId: machine.id,
                        machineName: machine.displayName,
                        machineSubtype: machine.machineSubtype,
                        system: machine.system
                    });
                }
            }
        }
        return rows.filter((row) => {
            if (systemFilter !== 'All systems' && row.system !== systemFilter) return false;
            return true;
        });
    }, [machines, typeCache, itemsById, systemFilter]);

    const inventoryTotals = useMemo(() => {
        const map = new Map();
        for (const row of inventoryRows) {
            const key = String(row.typeId || '').trim() || `name:${normalizeName(row.itemName)}`;
            const current = map.get(key) || { key, typeId: row.typeId, name: row.itemName, quantity: 0, sources: [] };
            current.quantity += row.quantity;
            current.sources.push(row.machineName);
            map.set(key, current);
        }
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [inventoryRows]);

    const stockLookup = useMemo(() => buildStockLookup(inventoryTotals), [inventoryTotals]);

    const systems = useMemo(() => {
        const set = new Set();
        for (const machine of machines) {
            if (machine.system) set.add(machine.system);
        }
        return ['All systems', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
    }, [machines]);

    const filteredBlueprints = useMemo(
        () => filterBlueprints(blueprints, selectedCategory, searchText),
        [blueprints, selectedCategory, searchText]
    );

    const selectedBlueprint =
        blueprintsByKey.get(selectedBlueprintKey) || filteredBlueprints[0] || null;

    const totalRawShortages = useMemo(() => {
        const shortages = [];
        for (const node of plannerQueue) collectRawShortages(node, shortages);
        return shortages;
    }, [plannerQueue]);

    const plannerContext = useMemo(() => ({
        blueprintsByOutputTypeId,
        blueprintsByOutputName,
        itemsById,
        stockLookup
    }), [blueprintsByOutputTypeId, blueprintsByOutputName, itemsById, stockLookup]);

    // ── PERSIST HELPERS ───────────────────────────────────────────────────────
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
    function persistSystemFilter(next) {
        setSystemFilter(next);
        window.localStorage.setItem(STORAGE_KEYS.system, next);
    }
    function persistDebugVisible(next) {
        setDebugVisible(next);
        window.localStorage.setItem(STORAGE_KEYS.debugVisible, next ? '1' : '0');
    }
    function handleZoomChange(next) {
        const clamped = Math.round(Math.min(2, Math.max(0.4, next)) * 10) / 10;
        setZoom(clamped);
        window.localStorage.setItem(ZOOM_KEY, String(clamped));
    }

    // ── MACHINES SAVE TO JSON ─────────────────────────────────────────────────
    function handleSaveMachinesToJson() {
        // Strip heavy inventory data — it gets re-fetched on load anyway
        const lean = machines.map(({ parsedInventories, ...rest }) => rest);
        const payload = JSON.stringify({ machines: lean, exportedAt: new Date().toISOString() }, null, 2);
        const blob = new Blob([payload], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `machines-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setIsDirty(false);
    }

    // ── MACHINE SAVE TO CACHE ─────────────────────────────────────────────────
    async function handleSaveToCache() {
        if (!inspection) return;
        try {
            const { machineFromInspection } = await import('./lib/sui.js');
            const { upsertMachine } = await import('./lib/appHelpers.js');
            const machine = await machineFromInspection(
                inspection, '', systemInput || MACHINE_SYSTEM_DEFAULT, typeCache
            );
            if (machine) {
                setMachines(current => upsertMachine(current, machine));
                setMachineLoadStatus(`Saved ${machine.displayName} to cache.`);
            }
        } catch (err) {
            setMachineLoadStatus(err?.message || 'Save to cache failed.');
        }
    }

    // ── PLANNER ACTIONS ───────────────────────────────────────────────────────
    function addPlannerTarget() {
        if (!selectedBlueprint) return;
        const quantity = Math.max(1, numberOrZero(plannerQuantity) || 1);
        const plan = createPlanTree(selectedBlueprint, quantity, plannerContext, new Map());
        persistPlannerQueue([...plannerQueue, plan]);
    }
    function addRecipePreview() {
        if (!selectedBlueprint) return;
        const quantity = Math.max(1, numberOrZero(plannerQuantity) || 1);
        const plan = createPlanTree(selectedBlueprint, quantity, plannerContext, new Map(), { mode: 'recipe' });
        persistPlannerQueue([...plannerQueue, plan]);
    }
    function removePlannerNode(nodeId) {
        persistPlannerQueue(plannerQueue.filter((node) => node.id !== nodeId));
    }
    function clearPlannerQueue() { persistPlannerQueue([]); }

    function swapNodeBlueprint(nodeId, blueprintKey) {
        const next = plannerQueue.map(root =>
            rebuildNodeById(root, nodeId, blueprintKey, blueprintsByKey, plannerContext, {})
        );
        persistPlannerQueue(next);
    }

    // ── MACHINE CONTROLLER ────────────────────────────────────────────────────
    function handleClearCache() {
        setMachines([]);
        setInspection(null);
        setIsDirty(false);
        setMachineLoadStatus('Cache cleared.');
    }
    const {
        handleInspectMachine,
        handleSaveCurrentInspection,
        removeMachine,
        clearMachines,
        handleMachineFile,
        handleCopyMachineId,
    } = useMachineController({
        network,
        machineIdInput,
        systemInput,
        walletAddress: '',
        typeCache,
        prettyJson,
        resolveTypeIds,
        machineSystemDefault: MACHINE_SYSTEM_DEFAULT,
        setLoading,
        setError,
        setInspection,
        setWalletSelectedJson: () => {},
        setMachineLoadStatus,
        setMachines,
        setWalletAddress: () => {},
        setMachineIdInput,
        setSystemInput,
        setActiveTab,
    });

    // ── SAVE CONTROLLER ───────────────────────────────────────────────────────
    const { saveLoadStatus, handleSaveExport, handleSaveImport, clearEverything } =
        useSaveController({
            makeSaveFilename,
            walletAddress: '',
            machines,
            plannerQueue,
            selectedBlueprintKey,
            plannerQuantity,
            systemFilter,
            selectedCategory,
            searchText,
            walletLoadStatus: '',
            machineLoadStatus,
            setWalletAddress: () => {},
            setWalletObjects: () => {},
            setWalletSelectedJson: () => {},
            setMachineIdInput,
            setSystemInput,
            machineSystemDefault: MACHINE_SYSTEM_DEFAULT,
            setInspection,
            setMachines,
            persistPlannerQueue,
            persistSelectedBlueprintKey,
            persistPlannerQuantity,
            persistSystemFilter,
            setSelectedCategory,
            setSearchText,
            setWalletLoadStatus: () => {},
            setMachineLoadStatus,
            setError,
        });

    // ── PAN HANDLERS ──────────────────────────────────────────────────────────
    function handlePanStart(event) {
        if (!plannerViewportRef.current) return;
        if (event.target.closest('.planner-node-card,button,select,input,label,textarea')) return;
        const viewport = plannerViewportRef.current;
        panRef.current = {
            active: true, startX: event.clientX, startY: event.clientY,
            scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop
        };
        viewport.classList.add('is-panning');
    }
    function handlePanMove(event) {
        if (!panRef.current.active || !plannerViewportRef.current) return;
        const viewport = plannerViewportRef.current;
        viewport.scrollLeft = panRef.current.scrollLeft - (event.clientX - panRef.current.startX);
        viewport.scrollTop = panRef.current.scrollTop - (event.clientY - panRef.current.startY);
    }
    function handlePanEnd() {
        if (!plannerViewportRef.current) return;
        panRef.current.active = false;
        plannerViewportRef.current.classList.remove('is-panning');
    }

    return (
        <div className="app-shell">
            {/* ── STICKY HEADER (topbar + tabs combined) ── */}
            <header className="topbar">
                <div className="topbar-main">
                    <div className="topbar-brand">
                        <h1>EVE FRONTIER · INVENTORY PLANNER</h1>
                        <span className="version-badge">V2.0</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.05em' }}>
                        {loading
                            ? <span style={{ color: 'var(--amber)' }}>● LOADING…</span>
                            : <span>
                                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--success-hi)', boxShadow: '0 0 6px var(--success-hi)', marginRight: 5, verticalAlign: 'middle' }} />
                                READY
                              </span>
                        }
                        <span>{network.toUpperCase()}</span>
                    </div>
                </div>
                <nav className="tabs">
                    {TABS.map((tab) => (
                        <button
                            key={tab}
                            className={tab === activeTab ? 'tab active' : 'tab'}
                            onClick={() => setActiveTab(tab)}
                        >
                            {tab}
                            {tab === 'Machines' && isDirty && (
                                <span className="tab-dirty-dot" title="Unsaved changes" />
                            )}
                        </button>
                    ))}
                </nav>
            </header>

            {error ? <div className="error-banner">{error}</div> : null}

            {activeTab === 'Machines' && (
                <MachinesTab
                    machineLoadStatus={machineLoadStatus}
                    handleMachineFile={handleMachineFile}
                    clearMachines={clearMachines}
                    machineIdInput={machineIdInput}
                    setMachineIdInput={setMachineIdInput}
                    systemInput={systemInput}
                    setSystemInput={setSystemInput}
                    machineSystemDefault={MACHINE_SYSTEM_DEFAULT}
                    loading={loading}
                    handleInspectMachine={handleInspectMachine}
                    handleSaveCurrentInspection={() => handleSaveCurrentInspection(inspection)}
                    inspection={inspection}
                    prettyJson={prettyJson}
                    machines={machines}
                    typeCache={typeCache}
                    handleCopyMachineId={handleCopyMachineId}
                    removeMachine={removeMachine}
                    onSaveToCache={handleSaveToCache}
                    onSaveToJson={handleSaveMachinesToJson}
                    onClearCache={handleClearCache}
                    isDirty={isDirty}
                />
            )}

            {activeTab === 'Inventory' && (
                <InventoryTab
                    systemFilter={systemFilter}
                    persistSystemFilter={persistSystemFilter}
                    systems={systems}
                    inventoryTotals={inventoryTotals}
                    lastRefreshed={lastRefreshed}
                    onRefresh={refreshInventory}
                    loading={loading}
                />
            )}

            {activeTab === 'Assembly' && (
                <AssemblyTab
                    categories={categories}
                    selectedCategory={selectedCategory}
                    setSelectedCategory={setSelectedCategory}
                    searchText={searchText}
                    setSearchText={setSearchText}
                    selectedBlueprint={selectedBlueprint}
                    filteredBlueprints={filteredBlueprints}
                    persistSelectedBlueprintKey={persistSelectedBlueprintKey}
                    plannerQuantity={plannerQuantity}
                    persistPlannerQuantity={persistPlannerQuantity}
                    numberOrZero={numberOrZero}
                    addPlannerTarget={addPlannerTarget}
                    addRecipePreview={addRecipePreview}
                    clearPlannerQueue={clearPlannerQueue}
                    plannerViewportRef={plannerViewportRef}
                    handlePanStart={handlePanStart}
                    handlePanMove={handlePanMove}
                    handlePanEnd={handlePanEnd}
                    plannerQueue={plannerQueue}
                    removePlannerNode={removePlannerNode}
                    totalRawShortages={totalRawShortages}
                    zoom={zoom}
                    onZoomChange={handleZoomChange}
                    onSwapBlueprint={swapNodeBlueprint}
                />
            )}

            {activeTab === 'Settings' && (
                <OtherTab
                    handleSaveImport={handleSaveImport}
                    handleSaveExport={handleSaveExport}
                    clearEverything={clearEverything}
                    debugVisible={debugVisible}
                    persistDebugVisible={persistDebugVisible}
                    saveLoadStatus={saveLoadStatus}
                    blueprints={blueprints}
                    machines={machines}
                    walletAddress=""
                    plannerQueue={plannerQueue}
                    filteredBlueprints={filteredBlueprints}
                    selectedBlueprint={selectedBlueprint}
                    inventoryTotals={inventoryTotals}
                    walletLoadStatus=""
                    machineLoadStatus={machineLoadStatus}
                />
            )}
        </div>
    );
}

export default App;
