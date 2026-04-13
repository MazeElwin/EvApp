import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { useWalletController } from './hooks/useWalletController.js';
import { useMachineController } from './hooks/useMachineController.js';
import { useTypeCacheController } from './hooks/useTypeCacheController.js';
import {
    inferRecipeCategory,
    loadStoredJson,
    MACHINE_SYSTEM_DEFAULT,
    makeSaveFilename,
    makeWalletFilename,
    prettyJson,
    STORAGE_KEYS,
    TABS
} from './lib/appHelpers.js';
import WalletTab from './components/tabs/WalletTab.jsx';
import MachinesTab from './components/tabs/MachinesTab.jsx';
import InventoryTab from './components/tabs/InventoryTab.jsx';
import AssemblyTab from './components/tabs/AssemblyTab.jsx';
import OtherTab from './components/tabs/OtherTab.jsx';

const ZOOM_KEY = 'ev_planner_zoom';

// ── Walk a node tree and rebuild one node by id using a new blueprint ───────
function rebuildNodeById(node, targetId, blueprintKey, blueprintsByKey, context, options) {
    if (!node) return node;

    // Found the node — rebuild its entire subtree with the new blueprint
    if (node.id === targetId) {
        const newBp = blueprintsByKey.get(blueprintKey);
        if (!newBp) return node; // blueprint not found, leave unchanged
        return createPlanTree(
            newBp,
            node.quantityNeeded,
            context,
            new Map(),   // fresh allocations for this subtree
            options,
            {}
        );
    }

    // Not this node — recurse into children
    if (!node.children?.length) return node;

    const newChildren = node.children.map(child =>
        rebuildNodeById(child, targetId, blueprintKey, blueprintsByKey, context, options)
    );

    // Only create a new object if something actually changed
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

    const [activeTab, setActiveTab] = useState('Wallet');
    const [network, setNetwork] = useState(
        () => window.localStorage.getItem(STORAGE_KEYS.network) || 'testnet'
    );
    const [walletAddress, setWalletAddress] = useState('');
    const [walletLoadStatus, setWalletLoadStatus] = useState('No wallet loaded.');
    const [walletObjects, setWalletObjects] = useState([]);
    const [walletSelectedJson, setWalletSelectedJson] = useState('');

    const [machineIdInput, setMachineIdInput] = useState('');
    const [systemInput, setSystemInput] = useState(MACHINE_SYSTEM_DEFAULT);
    const [inspection, setInspection] = useState(null);

    const [machines, setMachines] = useState(() =>
        loadStoredJson(STORAGE_KEYS.machines, [])
    );
    const [machineLoadStatus, setMachineLoadStatus] = useState(
        'No machine inspection yet.'
    );

    const { typeCache, resolveTypeIds } = useTypeCacheController({ machines });

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
    const [plannerQueue, setPlannerQueue] = useState(() =>
        loadStoredJson(STORAGE_KEYS.plannerQueue, [])
    );
    const [debugVisible, setDebugVisible] = useState(
        () => window.localStorage.getItem(STORAGE_KEYS.debugVisible) === '1'
    );
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // ── ZOOM (persisted) ───────────────────────────────────────────────────
    const [zoom, setZoom] = useState(() => {
        const stored = parseFloat(window.localStorage.getItem(ZOOM_KEY));
        return isNaN(stored) ? 1 : Math.min(2, Math.max(0.4, stored));
    });

    function handleZoomChange(next) {
        const clamped = Math.round(Math.min(2, Math.max(0.4, next)) * 10) / 10;
        setZoom(clamped);
        window.localStorage.setItem(ZOOM_KEY, String(clamped));
    }

    const plannerViewportRef = useRef(null);
    const panRef = useRef({ active: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 });

    useEffect(() => {
        window.localStorage.setItem(STORAGE_KEYS.network, network);
    }, [network]);

    useEffect(() => {
        window.localStorage.setItem(STORAGE_KEYS.machines, JSON.stringify(machines));
    }, [machines]);

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

    // ── The context object passed to createPlanTree / rebuildNodeById ────────
    const plannerContext = useMemo(() => ({
        blueprintsByOutputTypeId,
        blueprintsByOutputName,
        itemsById,
        stockLookup
    }), [blueprintsByOutputTypeId, blueprintsByOutputName, itemsById, stockLookup]);

    // ── PERSIST HELPERS ──────────────────────────────────────────────────────
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

    // ── PLANNER ACTIONS ──────────────────────────────────────────────────────
    function addPlannerTarget() {
        if (!selectedBlueprint) return;
        const quantity = Math.max(1, numberOrZero(plannerQuantity) || 1);
        const plan = createPlanTree(
            selectedBlueprint, quantity, plannerContext, new Map()
        );
        persistPlannerQueue([...plannerQueue, plan]);
    }

    function addRecipePreview() {
        if (!selectedBlueprint) return;
        const quantity = Math.max(1, numberOrZero(plannerQuantity) || 1);
        const plan = createPlanTree(
            selectedBlueprint, quantity, plannerContext, new Map(), { mode: 'recipe' }
        );
        persistPlannerQueue([...plannerQueue, plan]);
    }

    function removePlannerNode(nodeId) {
        persistPlannerQueue(plannerQueue.filter((node) => node.id !== nodeId));
    }

    function clearPlannerQueue() { persistPlannerQueue([]); }

    // ── SWAP BLUEPRINT IN A SUBTREE ──────────────────────────────────────────
    // Called by PlannerNode when user clicks USE on an alt path.
    // Finds the node anywhere in the queue tree and rebuilds it with the new blueprint.
    function swapNodeBlueprint(nodeId, blueprintKey) {
        const options = {}; // planner mode (not recipe) for sub-nodes
        const next = plannerQueue.map(root =>
            rebuildNodeById(root, nodeId, blueprintKey, blueprintsByKey, plannerContext, options)
        );
        persistPlannerQueue(next);
    }

    // ── CONTROLLERS ─────────────────────────────────────────────────────────
    const { saveLoadStatus, handleSaveExport, handleSaveImport, clearEverything } =
        useSaveController({
            makeSaveFilename, walletAddress, machines, plannerQueue,
            selectedBlueprintKey, plannerQuantity, systemFilter,
            selectedCategory, searchText, walletLoadStatus, machineLoadStatus,
            setWalletAddress, setWalletObjects, setWalletSelectedJson,
            setMachineIdInput, setSystemInput,
            machineSystemDefault: MACHINE_SYSTEM_DEFAULT,
            setInspection, setMachines, persistPlannerQueue,
            persistSelectedBlueprintKey, persistPlannerQuantity,
            persistSystemFilter, setSelectedCategory, setSearchText,
            setWalletLoadStatus, setMachineLoadStatus, setError
        });

    const { handleFetchWallet, saveWalletFile, handleWalletFile } =
        useWalletController({
            network, walletAddress, machines, prettyJson, makeWalletFilename,
            resolveTypeIds, setLoading, setError, setWalletObjects,
            setWalletSelectedJson, setWalletLoadStatus, setWalletAddress,
            setMachines, setMachineLoadStatus
        });

    const {
        handleInspectMachine, handleSaveCurrentInspection, removeMachine,
        clearMachines, handleMachineFile, handleCopyMachineId, handleOpenMachine
    } = useMachineController({
        network, machineIdInput, systemInput, walletAddress, typeCache,
        prettyJson, resolveTypeIds, machineSystemDefault: MACHINE_SYSTEM_DEFAULT,
        setLoading, setError, setInspection, setWalletSelectedJson,
        setMachineLoadStatus, setMachines, setWalletAddress,
        setMachineIdInput, setSystemInput, setActiveTab
    });

    // ── PAN HANDLERS ─────────────────────────────────────────────────────────
    function handlePanStart(event) {
        if (!plannerViewportRef.current) return;
        if (
            event.target.closest('.planner-node-card') ||
            event.target.closest('button') ||
            event.target.closest('select') ||
            event.target.closest('input') ||
            event.target.closest('label') ||
            event.target.closest('textarea')
        ) return;
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
            {/* ── TOP BAR ──────────────────────────────── */}
            <header className="topbar">
                <div className="topbar-brand">
                    <h1>EVE FRONTIER · INVENTORY PLANNER</h1>
                    <span className="version-badge">V1.0 / OFFLINE</span>
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
            </header>

            {/* ── TAB BAR ──────────────────────────────── */}
            <nav className="tabs">
                {TABS.map((tab) => (
                    <button
                        key={tab}
                        className={tab === activeTab ? 'tab active' : 'tab'}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab}
                    </button>
                ))}
            </nav>

            {error ? <div className="error-banner">{error}</div> : null}

            {/* ── TAB PANELS ───────────────────────────── */}
            {activeTab === 'Wallet' && (
                <WalletTab
                    walletLoadStatus={walletLoadStatus}
                    handleWalletFile={handleWalletFile}
                    saveWalletFile={saveWalletFile}
                    walletAddress={walletAddress}
                    setWalletAddress={setWalletAddress}
                    network={network}
                    setNetwork={setNetwork}
                    loading={loading}
                    handleFetchWallet={handleFetchWallet}
                    walletObjects={walletObjects}
                    setMachineIdInput={setMachineIdInput}
                    setActiveTab={setActiveTab}
                    walletSelectedJson={walletSelectedJson}
                    setWalletSelectedJson={setWalletSelectedJson}
                    prettyJson={prettyJson}
                />
            )}

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
                    handleOpenMachine={handleOpenMachine}
                    handleCopyMachineId={handleCopyMachineId}
                    removeMachine={removeMachine}
                />
            )}

            {activeTab === 'Inventory' && (
                <InventoryTab
                    systemFilter={systemFilter}
                    persistSystemFilter={persistSystemFilter}
                    systems={systems}
                    inventoryTotals={inventoryTotals}
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

            {activeTab === 'Other' && (
                <OtherTab
                    handleSaveImport={handleSaveImport}
                    handleSaveExport={handleSaveExport}
                    clearEverything={clearEverything}
                    debugVisible={debugVisible}
                    persistDebugVisible={persistDebugVisible}
                    saveLoadStatus={saveLoadStatus}
                    blueprints={blueprints}
                    machines={machines}
                    walletAddress={walletAddress}
                    plannerQueue={plannerQueue}
                    filteredBlueprints={filteredBlueprints}
                    selectedBlueprint={selectedBlueprint}
                    inventoryTotals={inventoryTotals}
                    walletLoadStatus={walletLoadStatus}
                    machineLoadStatus={machineLoadStatus}
                />
            )}
        </div>
    );
}

export default App;
