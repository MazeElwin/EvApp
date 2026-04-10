import { useState } from 'react';
import {
    buildSavePayload,
    downloadSaveFile,
    parseSavePayload
} from '../lib/savefile.js';

export function useSaveController({
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
    machineSystemDefault,
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
}) {
    const [saveLoadStatus, setSaveLoadStatus] = useState('No save file loaded yet.');

    function handleSaveExport() {
        const payload = buildSavePayload({
            walletAddress,
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
        if (!file) {
            return;
        }

        const reader = new FileReader();

        reader.onload = () => {
            try {
                const result = parseSavePayload(String(reader.result || ''));

                setWalletAddress(result.walletAddress || '');
                setMachines(Array.isArray(result.machines) ? result.machines : []);
                persistPlannerQueue(
                    Array.isArray(result.plannerQueue) ? result.plannerQueue : []
                );
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
        setWalletObjects([]);
        setWalletSelectedJson('');
        setMachineIdInput('');
        setSystemInput(machineSystemDefault);
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
        setError('');
    }

    return {
        saveLoadStatus,
        setSaveLoadStatus,
        handleSaveExport,
        handleSaveImport,
        clearEverything
    };
}