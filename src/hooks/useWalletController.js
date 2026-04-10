import { buildWalletFilePayload, parseWalletFile } from '../lib/wallet.js';
import { parseMachineFile } from '../lib/machines.js';
import { downloadSaveFile } from '../lib/savefile.js';
import { fetchWalletObjects } from '../lib/sui.js';

export function useWalletController({
    network,
    walletAddress,
    machines,
    prettyJson,
    makeWalletFilename,
    resolveTypeIds,
    setLoading,
    setError,
    setWalletObjects,
    setWalletSelectedJson,
    setWalletLoadStatus,
    setWalletAddress,
    setMachines,
    setMachineLoadStatus
}) {
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

    return {
        handleFetchWallet,
        saveWalletFile,
        handleWalletFile
    };
}