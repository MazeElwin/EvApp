import { parseMachineFile } from '../lib/machines.js';
import { inspectObjectId, machineFromInspection } from '../lib/sui.js';
import { upsertMachine } from '../lib/appHelpers.js';

export function useMachineController({
    network,
    machineIdInput,
    systemInput,
    walletAddress,
    typeCache,
    prettyJson,
    resolveTypeIds,
    machineSystemDefault,
    setLoading,
    setError,
    setInspection,
    setWalletSelectedJson,
    setMachineLoadStatus,
    setMachines,
    setWalletAddress,
    setMachineIdInput,
    setSystemInput,
    setActiveTab
}) {
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
                systemInput || machineSystemDefault,
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

    async function handleSaveCurrentInspection(inspection) {
        if (!inspection) {
            return;
        }

        try {
            setLoading(true);
            setError('');

            const machine = await machineFromInspection(
                inspection,
                walletAddress.trim(),
                systemInput || machineSystemDefault,
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
        setSystemInput(machine.system || machineSystemDefault);
        setActiveTab('Machines');
    }

    return {
        handleInspectMachine,
        handleSaveCurrentInspection,
        removeMachine,
        clearMachines,
        handleMachineFile,
        handleCopyMachineId,
        handleOpenMachine
    };
}