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
import { buildWalletFilePayload, parseWalletFile } from './lib/wallet.js';
import { parseMachineFile } from './lib/machines.js';
import {
    fetchTypeInfo,
    fetchWalletObjects,
    inspectObjectId,
    machineFromInspection
} from './lib/sui.js';
import {
    inferRecipeCategory,
    loadStoredJson,
    MACHINE_SYSTEM_DEFAULT,
    makeSaveFilename,
    makeWalletFilename,
    prettyJson,
    STORAGE_KEYS,
    TABS,
    upsertMachine
} from './lib/appHelpers.js';
import { downloadSaveFile } from './lib/savefile.js';
import { useSaveController } from './hooks/useSaveController.js';
import WalletTab from './components/tabs/WalletTab.jsx';
import MachinesTab from './components/tabs/MachinesTab.jsx';
import InventoryTab from './components/tabs/InventoryTab.jsx';
import AssemblyTab from './components/tabs/AssemblyTab.jsx';
import OtherTab from './components/tabs/OtherTab.jsx';

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
    const [machineLoadStatus, setMachineLoadStatus] = useState(
        'No machine inspection yet.'
    );

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
    const [plannerQueue, setPlannerQueue] = useState(() =>
        loadStoredJson(STORAGE_KEYS.plannerQueue, [])
    );
    const [debugVisible, setDebugVisible] = useState(
        () => window.localStorage.getItem(STORAGE_KEYS.debugVisible) === '1'
    );
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

        if (!pending.length) {
            return;
        }

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
            if (machine.machineTypeId) {
                ids.add(String(machine.machineTypeId));
            }

            for (const inv of machine.parsedInventories || []) {
                for (const row of inv.items || []) {
                    if (row.typeId) {
                        ids.add(String(row.typeId));
                    }
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
            if (systemFilter !== 'All systems' && row.system !== systemFilter) {
                return false;
            }
            return true;
        });
    }, [machines, typeCache, itemsById, systemFilter]);

    const inventoryTotals = useMemo(() => {
        const map = new Map();

        for (const row of inventoryRows) {
            const key =
                String(row.typeId || '').trim() || `name:${normalizeName(row.itemName)}`;

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

    const stockLookup = useMemo(
        () => buildStockLookup(inventoryTotals),
        [inventoryTotals]
    );

    const systems = useMemo(() => {
        const set = new Set();

        for (const machine of machines) {
            if (machine.system) {
                set.add(machine.system);
            }
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

        for (const node of plannerQueue) {
            collectRawShortages(node, shortages);
        }

        return shortages;
    }, [plannerQueue]);

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
        if (!inspection) {
            return;
        }

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
        setMachines((current) =>
            current.filter((machine) => machine.id !== machineId)
        );
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
        if (!file) {
            return;
        }

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

    function handleMachineFile(event) {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

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

    function handleCopyMachineId(id) {
        navigator.clipboard.writeText(id).catch(() => { });
    }

    function handleOpenMachine(machine) {
        setMachineIdInput(machine.id);
        setSystemInput(machine.system || MACHINE_SYSTEM_DEFAULT);
        setActiveTab('Machines');
    }

    function addPlannerTarget() {
        if (!selectedBlueprint) {
            return;
        }

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

    const {
        saveLoadStatus,
        handleSaveExport,
        handleSaveImport,
        clearEverything
    } = useSaveController({
        makeSaveFilename,
        walletAddress,
        machines,
        plannerQueue,
        selectedBlueprintKey,
        plannerQuantity,
        systemFilter,
        selectedCategory,
        searchText,
        walletLoadStatus,
        machineLoadStatus,
        setWalletAddress,
        setWalletObjects,
        setWalletSelectedJson,
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
        setWalletLoadStatus,
        setMachineLoadStatus,
        setError
    });

    function handlePanStart(event) {
        if (!plannerViewportRef.current) {
            return;
        }

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
        if (!panRef.current.active || !plannerViewportRef.current) {
            return;
        }

        const viewport = plannerViewportRef.current;
        const deltaX = event.clientX - panRef.current.startX;
        const deltaY = event.clientY - panRef.current.startY;

        viewport.scrollLeft = panRef.current.scrollLeft - deltaX;
        viewport.scrollTop = panRef.current.scrollTop - deltaY;
    }

    function handlePanEnd() {
        if (!plannerViewportRef.current) {
            return;
        }

        panRef.current.active = false;
        plannerViewportRef.current.classList.remove('is-panning');
    }

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
            ) : null}

            {activeTab === 'Machines' ? (
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
                    handleSaveCurrentInspection={handleSaveCurrentInspection}
                    inspection={inspection}
                    prettyJson={prettyJson}
                    machines={machines}
                    handleOpenMachine={handleOpenMachine}
                    handleCopyMachineId={handleCopyMachineId}
                    removeMachine={removeMachine}
                />
            ) : null}

            {activeTab === 'Inventory' ? (
                <InventoryTab
                    systemFilter={systemFilter}
                    persistSystemFilter={persistSystemFilter}
                    systems={systems}
                    inventoryTotals={inventoryTotals}
                />
            ) : null}

            {activeTab === 'Assembly' ? (
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
                    clearPlannerQueue={clearPlannerQueue}
                    plannerViewportRef={plannerViewportRef}
                    handlePanStart={handlePanStart}
                    handlePanMove={handlePanMove}
                    handlePanEnd={handlePanEnd}
                    plannerQueue={plannerQueue}
                    removePlannerNode={removePlannerNode}
                    totalRawShortages={totalRawShortages}
                />
            ) : null}

            {activeTab === 'Other' ? (
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
            ) : null}
        </div>
    );
}

export default App;