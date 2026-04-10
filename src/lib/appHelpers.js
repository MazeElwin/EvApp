export const MACHINE_SYSTEM_DEFAULT = 'IQF-RG7';

export const STORAGE_KEYS = {
    network: 'ef_wallet_network_v23',
    machines: 'ef_saved_machines_v23',
    typeCache: 'ef_type_cache_v23',
    system: 'ef_planner_system_v23',
    selectedBlueprintKey: 'ef_selected_blueprint_key_v23',
    plannerQuantity: 'ef_planner_quantity_v23',
    plannerQueue: 'ef_planner_queue_v23',
    debugVisible: 'ef_debug_visible_v23'
};

export const TABS = ['Wallet', 'Machines', 'Inventory', 'Assembly', 'Other'];

export function loadStoredJson(key, fallback) {
    try {
        const raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

function makeTimestamp() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');

    return (
        [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join('-') +
        '_' +
        [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join('-')
    );
}

export function makeSaveFilename() {
    return `eve-frontier-save-${makeTimestamp()}.json`;
}

export function makeWalletFilename() {
    return `wallet-${makeTimestamp()}.json`;
}

export function prettyJson(value) {
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

export function upsertMachine(current, next) {
    return [
        next,
        ...current.filter((machine) => machine.id !== next.id)
    ].sort(
        (a, b) =>
            String(a.system || '').localeCompare(String(b.system || '')) ||
            String(a.displayName || '').localeCompare(String(b.displayName || ''))
    );
}

export function inferRecipeCategory(name) {
    const lower = String(name || '').toLowerCase();

    if (/(sojourn|embark|reflex|ship|frigate|destroyer|cruiser)/.test(lower)) {
        return 'Ship';
    }

    if (/(ore|metals|materials|fuel|weave|alloy|composites|circuits)/.test(lower)) {
        return 'Material';
    }

    if (
        /(plates|grid|brace|generator|afterburner|field array|stasis|entangler|restorer)/.test(
            lower
        )
    ) {
        return 'Module';
    }

    if (/(laser|autocannon|plasma|coilgun|disintegrator)/.test(lower)) {
        return 'Weapon';
    }

    return 'Other';
}