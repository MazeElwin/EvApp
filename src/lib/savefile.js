function safeArray(value) {
    return Array.isArray(value) ? value : [];
}

function safeString(value, fallback = '') {
    return typeof value === 'string' ? value : fallback;
}

function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

export function buildSavePayload(state) {
    return {
        format: 'eve-frontier-app-save',
        version: 3,
        savedAt: new Date().toISOString(),
        data: {
            walletAddress: safeString(state.walletAddress),
            machines: safeArray(state.machines),
            plannerQueue: safeArray(state.plannerQueue),
            selectedBlueprintKey: safeString(state.selectedBlueprintKey),
            plannerQuantity: safeNumber(state.plannerQuantity, 1),
            systemFilter: safeString(state.systemFilter, 'All systems'),
            selectedCategory: safeString(state.selectedCategory, 'All'),
            searchText: safeString(state.searchText),
            walletLoadStatus: safeString(
                state.walletLoadStatus,
                'No wallet file loaded yet.'
            ),
            machineLoadStatus: safeString(
                state.machineLoadStatus,
                'No machine file loaded yet.'
            )
        }
    };
}

export function parseSavePayload(text) {
    let parsed;

    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error('Save file is not valid JSON.');
    }

    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Save file is invalid.');
    }

    if (parsed.format !== 'eve-frontier-app-save') {
        throw new Error('This is not a valid app save file.');
    }

    const data = parsed.data || {};

    return {
        walletAddress: safeString(data.walletAddress || data.walletHash),
        machines: safeArray(data.machines),
        plannerQueue: safeArray(data.plannerQueue),
        selectedBlueprintKey: safeString(data.selectedBlueprintKey),
        plannerQuantity: Math.max(1, safeNumber(data.plannerQuantity, 1)),
        systemFilter: safeString(data.systemFilter, 'All systems'),
        selectedCategory: safeString(data.selectedCategory, 'All'),
        searchText: safeString(data.searchText),
        walletLoadStatus: safeString(
            data.walletLoadStatus,
            'Loaded from save file.'
        ),
        machineLoadStatus: safeString(
            data.machineLoadStatus,
            'Loaded from save file.'
        )
    };
}

export function downloadSaveFile(filename, payload) {
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
}