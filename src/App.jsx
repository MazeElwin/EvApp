import React, { useEffect, useMemo, useRef, useState } from 'react';
import { filterBlueprints, loadBlueprintData, numberOrZero, normalizeName, resolveItemName } from './lib/blueprints.js';
import { buildStockLookup } from './lib/inventory.js';
import { collectRawShortages, createPlanTree } from './lib/planner.js';
import { buildSavePayload, downloadSaveFile, parseSavePayload } from './lib/savefile.js';
import { buildWalletFilePayload, parseWalletFile } from './lib/wallet.js';
import { parseMachineFile } from './lib/machines.js';
import {
    extractMachineTypeLabel,
    fetchTypeInfo,
    fetchWalletObjects,
    inspectObjectId,
    machineFromInspection
} from './lib/sui.js';
import PlannerNode from './components/PlannerNode.jsx';

const STORAGE_KEYS = {
    network: 'ef_wallet_network_v23',
    machines: 'ef_saved_machines_v23',
    typeCache: 'ef_type_cache_v23',
    system: 'ef_planner_system_v23',
    selectedBlueprintKey: 'ef_selected_blueprint_key_v23',
    plannerQuantity: 'ef_planner_quantity_v23',
    plannerQueue: 'ef_planner_queue_v23',
    debugVisible: 'ef_debug_visible_v23'
};

const TABS = ['Wallet', 'Machines', 'Inventory', 'Assembly', 'Other'];
const MACHINE_SYSTEM_DEFAULT = 'IQF-RG7';

function loadStoredJson(key, fallback) {
    try {
        const raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

function makeSaveFilename() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp =
        [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join('-') +
        '_' +
        [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join('-');

    return `eve-frontier-save-${stamp}.json`;
}

function makeWalletFilename() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp =
        [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join('-') +
        '_' +
        [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join('-');

    return `wallet-${stamp}.json`;
}

function prettyJson(value) {
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

function upsertMachine(current, next) {
    return [next, ...current.filter((machine) => machine.id !== next.id)].sort(
        (a, b) =>
            String(a.system || '').localeCompare(String(b.system || '')) ||
            String(a.displayName || '').localeCompare(String(b.displayName || ''))
    );
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
    const [walletLoadStatus, setWalletLoadStatus] = useState('No wallet loaded yet.');
    const [walletObjects, setWalletObjects] = useState([]);
    const [walletSelectedJson, setWalletSelectedJson] = useState('');

    const [machineIdInput, setMachineIdInput] = useState('');
    const [systemInput, setSystemInput] = useState(MACHINE_SYSTEM_DEFAULT);
    const [inspection, setInspection] = useState(null);

    const [machines, setMachines] = useState(() =>
        loadStoredJson(STORAGE_KEYS.machines, [])
    );
    const [machineLoadStatus, setMachineLoadStatus] = useState('No machine inspection yet.');

    const [typeCache, setTypeCache] = useState(() =>
        loadStoredJson(STORAGE_KEYS.typeCache, {})
    );

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
    const [debugVisible, setDebugVisible] = useState(
        () => window.localStorage.getItem(STORAGE_KEYS.debugVisible) === '1'
    );
    const [saveLoadStatus, setSaveLoadStatus] = useState('No save file loaded yet.');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const plannerViewportRef = useRef(null);
    const panRef = useRef({
        active: false,
        startX: 0,
        startY: 0,
        scrollLeft: 0,
        scrollTop: 0
    });

    useEffect(() => {
        window.localStorage.setItem(STORAGE_KEYS.network, network);
    }, [network]);

    useEffect(() => {
        window.localStorage.setItem(STORAGE_KEYS.machines, JSON.stringify(machines));
    }, [machines]);

    useEffect(() => {
        window.localStorage.setItem(STORAGE_KEYS.typeCache, JSON.stringify(typeCache));
    }, [typeCache]);

    async function resolveTypeIds(typeIds) {
        const unique = Array.from(new Set(typeIds.filter(Boolean).map(String)));
        const pending = unique.filter((id) => !typeCache[id]);
        if (!pending.length) return;

        const updates = {};
        for (const id of pending) {
            try {
                const info = await fetchTypeInfo(id);
                updates[id] = {
                    info: {
                        id: String(info?.id || id),
                        name: String(info?.name || ''),
                        categoryName: String(info?.categoryName || info?.category_name || ''),
                        groupName: String(info?.groupName || info?.group_name || '')
                    },
                    updatedAt: new Date().toISOString()
                };
            } catch {
                updates[id] = {
                    info: {
                        id: String(id),
                        name: '',
                        categoryName: '',
                        groupName: ''
                    },
                    updatedAt: new Date().toISOString()
                };
            }
        }

        setTypeCache((current) => ({ ...current, ...updates }));
    }

    useEffect(() => {
        const ids = new Set();

        for (const machine of machines) {
            if (machine.machineTypeId) ids.add(String(machine.machineTypeId));
            for (const inv of machine.parsedInventories || []) {
                for (const row of inv.items || []) {
                    if (row.typeId) ids.add(String(row.typeId));
                }
            }
        }

        if (ids.size) {
            void resolveTypeIds(Array.from(ids));
        }
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
                        categoryName:
                            cachedInfo?.categoryName || inferRecipeCategory(itemName),
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
            const current = map.get(key) || {
                key,
                typeId: row.typeId,
                name: row.itemName,
                quantity: 0,
                sources: []
            };

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

    async function handleFetchWallet() {
        try {
            setLoading(true);
            setError('');
            const rows = await fetchWalletObjects(network, walletAddress.trim());
            setWalletObjects(rows);
            setWalletSelectedJson(prettyJson(rows));
            setWalletLoadStatus(`Fetched ${rows.length} wallet-owned objects.`);
        } catch (err) {
            setError(err?.message || 'Failed to fetch wallet objects.');
            setWalletLoadStatus('Wallet fetch failed.');
        } finally {
            setLoading(false);
        }
    }

    async function handleInspectMachine(saveAfter = false) {
        try {
            setLoading(true);
            setError('');
            const result = await inspectObjectId(network, machineIdInput.trim());
            setInspection(result);
            setWalletSelectedJson(prettyJson(result.object));

            const machine = await machineFromInspection(
                result,
                walletAddress.trim(),
                systemInput || MACHINE_SYSTEM_DEFAULT,
                typeCache
            );

            if (!machine) {
                setMachineLoadStatus('This object does not look like a saveable machine.');
            } else {
                setMachineLoadStatus(
                    `Inspected ${machine.displayName}. Parsed ${machine.parsedInventories.length} inventory object(s).`
                );
                if (saveAfter) {
                    setMachines((current) => upsertMachine(current, machine));
                }
            }
        } catch (err) {
            setError(err?.message || 'Failed to inspect object.');
            setMachineLoadStatus('Machine inspection failed.');
        } finally {
            setLoading(false);
        }
    }

    async function handleSaveCurrentInspection() {
        if (!inspection) return;

        try {
            setLoading(true);
            setError('');
            const machine = await machineFromInspection(
                inspection,
                walletAddress.trim(),
                systemInput || MACHINE_SYSTEM_DEFAULT,
                typeCache
            );

            if (!machine) {
                setMachineLoadStatus('This object does not look like a saveable machine.');
                return;
            }

            setMachines((current) => upsertMachine(current, machine));
            setMachineLoadStatus(`Saved ${machine.displayName}.`);
        } catch (err) {
            setError(err?.message || 'Failed to save machine.');
            setMachineLoadStatus('Save failed.');
        } finally {
            setLoading(false);
        }
    }

    function removeMachine(machineId) {
        setMachines((current) => current.filter((machine) => machine.id !== machineId));
    }

    function clearMachines() {
        setMachines([]);
        setInspection(null);
        setMachineLoadStatus('Cleared all machines.');
    }

    function saveWalletFile() {
        const payload = buildWalletFilePayload(walletAddress, machines);
        downloadSaveFile(makeWalletFilename(), payload);
        setWalletLoadStatus('Exported wallet + machines file.');
    }

    function handleWalletFile(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();

        reader.onload = () => {
            try {
                const rawText = String(reader.result || '');
                const walletResult = parseWalletFile(rawText);
                const machineResult = parseMachineFile(rawText);

                setWalletAddress(walletResult.walletAddress);

                if (machineResult.walletAddress && !walletResult.walletAddress) {
                    setWalletAddress(machineResult.walletAddress);
                }

                if (Array.isArray(machineResult.machines) && machineResult.machines.length) {
                    setMachines(machineResult.machines);
                    setMachineLoadStatus(machineResult.parseStatus);
                    void resolveTypeIds(
                        machineResult.machines.flatMap((machine) => [
                            machine.machineTypeId,
                            ...(machine.parsedInventories || []).flatMap((inv) =>
                                (inv.items || []).map((item) => item.typeId)
                            )
                        ])
                    );
                }

                setWalletLoadStatus('Loaded wallet file successfully.');
            } catch (err) {
                setWalletLoadStatus(err?.message || 'Failed to load wallet file.');
            }
        };

        reader.readAsText(file);
        event.target.value = '';
    }

    function handleCopyMachineId(id) {
        navigator.clipboard.writeText(id).catch(() => { });
    }

    function handleOpenMachine(machine) {
        setMachineIdInput(machine.id);
        setSystemInput(machine.system || MACHINE_SYSTEM_DEFAULT);
        setActiveTab('Machines');
    }

    function handleMachineFile(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();

        reader.onload = () => {
            try {
                const rawText = String(reader.result || '');
                const result = parseMachineFile(rawText);

                setMachines(result.machines);
                if (result.walletAddress) {
                    setWalletAddress(result.walletAddress);
                }

                setMachineLoadStatus(result.parseStatus);

                void resolveTypeIds(
                    result.machines.flatMap((machine) => [
                        machine.machineTypeId,
                        ...(machine.parsedInventories || []).flatMap((inv) =>
                            (inv.items || []).map((item) => item.typeId)
                        )
                    ])
                );
            } catch (err) {
                setMachineLoadStatus(err?.message || 'Failed to load machine file.');
            }
        };

        reader.readAsText(file);
        event.target.value = '';
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

    function handleSaveExport() {
        const payload = buildSavePayload({
            walletHash: walletAddress,
            machines,
            plannerQueue,
            selectedBlueprintKey,
            plannerQuantity,
            systemFilter,
            selectedCategory,
            searchText,
            walletLoadStatus,
            machineLoadStatus
        });

        downloadSaveFile(makeSaveFilename(), payload);
        setSaveLoadStatus('Exported unified save file.');
    }

    function handleSaveImport(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            try {
                const result = parseSavePayload(String(reader.result || ''));
                setWalletAddress(result.walletHash || '');
                setMachines(Array.isArray(result.machines) ? result.machines : []);
                persistPlannerQueue(Array.isArray(result.plannerQueue) ? result.plannerQueue : []);
                persistSelectedBlueprintKey(result.selectedBlueprintKey || '');
                persistPlannerQuantity(result.plannerQuantity || 1);
                persistSystemFilter(result.systemFilter || 'All systems');
                setSelectedCategory(result.selectedCategory || 'All');
                setSearchText(result.searchText || '');
                setWalletLoadStatus(result.walletLoadStatus || 'Loaded from save file.');
                setMachineLoadStatus(result.machineLoadStatus || 'Loaded from save file.');
                setSaveLoadStatus('Loaded unified save file successfully.');
            } catch (err) {
                setSaveLoadStatus(err?.message || 'Failed to load save file.');
            }
        };

        reader.readAsText(file);
        event.target.value = '';
    }

    function clearEverything() {
        setWalletAddress('');
        window.localStorage.removeItem('ef_wallet_address_v23');
        window.localStorage.removeItem('ef_wallet_hash_v21');
        window.localStorage.removeItem('ef_wallet_hash_v22');
        window.localStorage.removeItem('ef_wallet_inventory_v19');
        window.localStorage.removeItem('ef_wallet_inventory_v20');
        window.localStorage.removeItem('ef_wallet_text_input_v20');
        setWalletObjects([]);
        setInspection(null);
        setMachines([]);
        persistPlannerQueue([]);
        persistSelectedBlueprintKey('');
        persistPlannerQuantity(1);
        persistSystemFilter('All systems');
        setSelectedCategory('All');
        setSearchText('');
        setWalletLoadStatus('Cleared wallet.');
        setMachineLoadStatus('Cleared all machines.');
        setSaveLoadStatus('Cleared all in-app state.');
    }

    function handlePanStart(event) {
        if (!plannerViewportRef.current) return;
        if (
            event.target.closest('.planner-node') ||
            event.target.closest('button') ||
            event.target.closest('select') ||
            event.target.closest('input') ||
            event.target.closest('label') ||
            event.target.closest('textarea')
        ) {
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
                        Current UI with v9-style live wallet fetch and live machine inspection.
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

            {error ? <div className="error-banner">{error}</div> : null}

            {activeTab === 'Wallet' ? (
                <section className="panel">
                    <div className="panel-header">
                        <h2>Wallet</h2>
                        <div className="row gap">
                            <label className="file-button">
                                Load wallet JSON
                                <input type="file" accept=".json,application/json" onChange={handleWalletFile} hidden />
                            </label>
                            <button className="small-button" onClick={saveWalletFile} disabled={!walletAddress.trim()}>
                                Save wallet file
                            </button>
                        </div>
                    </div>

                    <p className="status-line">{walletLoadStatus}</p>

                    <div className="grid cols-2">
                        <div className="panel">
                            <div className="field">
                                <label>Network</label>
                                <select value={network} onChange={(e) => setNetwork(e.target.value)}>
                                    <option value="testnet">testnet</option>
                                    <option value="mainnet">mainnet</option>
                                    <option value="devnet">devnet</option>
                                </select>
                            </div>

                            <div className="field">
                                <label>Full wallet address</label>
                                <input
                                    value={walletAddress}
                                    onChange={(e) => setWalletAddress(e.target.value)}
                                    placeholder="0x..."
                                />
                            </div>

                            <div className="button-row">
                                <button
                                    onClick={() => void handleFetchWallet()}
                                    disabled={loading || !walletAddress.trim()}
                                >
                                    {loading ? 'Loading…' : 'Fetch wallet objects'}
                                </button>
                            </div>

                            <div className="panel" style={{ marginTop: 12 }}>
                                <div className="key-value">
                                    <span>Saved wallet</span>
                                    <code className="smallwrap">{walletAddress || '—'}</code>
                                </div>
                                <div className="key-value">
                                    <span>Network</span>
                                    <code>{network}</code>
                                </div>
                                <div className="key-value">
                                    <span>Objects fetched</span>
                                    <code>{walletObjects.length}</code>
                                </div>
                            </div>
                        </div>

                        <div className="panel">
                            <h3>Wallet objects</h3>
                            {walletObjects.length === 0 ? (
                                <div className="empty-state">No wallet objects fetched yet.</div>
                            ) : (
                                <div className="table-like">
                                    {walletObjects.slice(0, 50).map((obj, index) => {
                                        const data = obj?.data || obj;
                                        const objectId = String(data?.objectId || '');
                                        const type = String(data?.type || data?.content?.type || '');
                                        return (
                                            <div key={`${objectId}-${index}`} className="machine-card">
                                                <div className="machine-card-main">
                                                    <div className="machine-title">{objectId || 'Unknown object'}</div>
                                                    <div className="machine-meta break">{type || 'No type'}</div>
                                                </div>
                                                <div className="button-col">
                                                    <button
                                                        className="small-button secondary"
                                                        onClick={() => {
                                                            setMachineIdInput(objectId);
                                                            setActiveTab('Machines');
                                                        }}
                                                    >
                                                        Use ID
                                                    </button>
                                                    <button
                                                        className="small-button secondary"
                                                        onClick={() => setWalletSelectedJson(prettyJson(obj))}
                                                    >
                                                        View JSON
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {walletSelectedJson ? (
                        <div className="panel">
                            <h3>Selected JSON</h3>
                            <div className="json-wrap">
                                <pre>{walletSelectedJson}</pre>
                            </div>
                        </div>
                    ) : null}
                </section>
            ) : null}

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

                    <div className="grid wide-left">
                        <div className="stack">
                            <div className="panel">
                                <div className="controls-row">
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
                                            placeholder={MACHINE_SYSTEM_DEFAULT}
                                        />
                                    </label>
                                </div>

                                <div className="button-row">
                                    <button
                                        onClick={() => void handleInspectMachine(false)}
                                        disabled={loading || !machineIdInput.trim()}
                                    >
                                        {loading ? 'Loading…' : 'Inspect'}
                                    </button>
                                    <button
                                        className="secondary"
                                        onClick={() => void handleInspectMachine(true)}
                                        disabled={loading || !machineIdInput.trim()}
                                    >
                                        {loading ? 'Loading…' : 'Inspect + save'}
                                    </button>
                                    <button
                                        className="secondary"
                                        onClick={() => void handleSaveCurrentInspection()}
                                        disabled={loading || !inspection}
                                    >
                                        Save current inspection
                                    </button>
                                </div>
                            </div>

                            {inspection ? (
                                <div className="panel">
                                    <h3>Inspection summary</h3>
                                    <div className="inspection-summary">
                                        <span>Root ID</span>
                                        <code className="smallwrap">{inspection.rootId}</code>
                                    </div>
                                    <div className="inspection-summary">
                                        <span>Dynamic fields</span>
                                        <strong>{inspection.dynamicFields?.length || 0}</strong>
                                    </div>
                                    <div className="inspection-summary">
                                        <span>Dynamic field objects</span>
                                        <strong>{inspection.dynamicFieldObjects?.length || 0}</strong>
                                    </div>
                                    <div className="inspection-summary">
                                        <span>Parsed inventories</span>
                                        <strong>{inspection.parsedInventories?.length || 0}</strong>
                                    </div>
                                    <div className="inspection-summary">
                                        <span>Linked IDs</span>
                                        <strong>{inspection.linkedIds?.length || 0}</strong>
                                    </div>

                                    {inspection.notes?.length ? (
                                        <div style={{ marginTop: 12 }}>
                                            {inspection.notes.map((note, index) => (
                                                <div key={index} className="hint">
                                                    {note}
                                                </div>
                                            ))}
                                        </div>
                                    ) : null}

                                    <div className="json-wrap" style={{ marginTop: 12 }}>
                                        <pre>{prettyJson(inspection.object)}</pre>
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        <div className="panel">
                            <h3>Saved machines</h3>
                            {machines.length === 0 ? (
                                <div className="empty-state">No saved machines yet.</div>
                            ) : (
                                <div className="machine-list">
                                    {machines.map((machine) => (
                                        <div key={machine.id} className="machine-card">
                                            <div className="machine-card-main">
                                                <div className="machine-title">{machine.displayName}</div>
                                                <div className="machine-meta">ID: {machine.id}</div>
                                                <div className="machine-meta">System: {machine.system || 'Unknown system'}</div>
                                                <div className="machine-meta">Type: {machine.machineSubtype || extractMachineTypeLabel(machine.broadType || '')}</div>
                                                <div className="machine-meta">
                                                    Inventories: {(machine.parsedInventories || []).length}
                                                </div>
                                            </div>

                                            <div className="button-col">
                                                <button className="small-button secondary" onClick={() => handleOpenMachine(machine)}>
                                                    Open
                                                </button>
                                                <button className="small-button secondary" onClick={() => handleCopyMachineId(machine.id)}>
                                                    Copy ID
                                                </button>
                                                <button className="small-button danger" onClick={() => removeMachine(machine.id)}>
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
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
                                onChange={(event) =>
                                    persistPlannerQuantity(Math.max(1, numberOrZero(event.target.value) || 1))
                                }
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
                        <div className="row gap">
                            <label className="file-button">
                                Load app save
                                <input type="file" accept=".json,application/json" onChange={handleSaveImport} hidden />
                            </label>
                            <button className="small-button" onClick={handleSaveExport}>
                                Export app save
                            </button>
                            <button className="small-button danger" onClick={clearEverything}>
                                Clear all state
                            </button>
                            <button className="small-button" onClick={() => persistDebugVisible(!debugVisible)}>
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
                                <div className="debug-value break">{selectedBlueprint?.blueprintKey || '-'}</div>
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
            ) : null}
        </div>
    );
}

function inferRecipeCategory(name) {
    const lower = String(name || '').toLowerCase();
    if (/(sojourn|embark|reflex|ship|frigate|destroyer|cruiser)/.test(lower)) return 'Ship';
    if (/(ore|metals|materials|fuel|weave|alloy|composites|circuits)/.test(lower)) return 'Material';
    if (/(plates|grid|brace|generator|afterburner|field array|stasis|entangler|restorer)/.test(lower)) return 'Module';
    if (/(laser|autocannon|plasma|coilgun|disintegrator)/.test(lower)) return 'Weapon';
    return 'Other';
}

export default App;