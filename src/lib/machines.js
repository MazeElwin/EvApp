import { asArray, normalizeName, numberOrZero, resolveItemName } from './blueprints.js';

function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    } catch {
        throw new Error('File is not valid JSON.');
    }
}

function extractMachineArray(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.machines)) return payload.machines;
    if (Array.isArray(payload?.items)) return payload.items;
    if (payload && typeof payload === 'object') return [payload];
    throw new Error('JSON must be an object or array.');
}

function extractInventoryArray(rawMachine) {
    return asArray(
        rawMachine.inventory ||
        rawMachine.items ||
        rawMachine.contents ||
        rawMachine.hold ||
        rawMachine.storage ||
        rawMachine.cargo
    );
}

export function parseMachineFile(text, itemsById) {
    const parsed = safeJsonParse(text);
    const rows = extractMachineArray(parsed);

    const machines = rows.map((machine, index) => {
        const id = String(
            machine.id ||
            machine.objectId ||
            machine.machineId ||
            machine.itemId ||
            `machine-${index + 1}`
        ).trim();

        if (!id) {
            throw new Error(`Machine ${index + 1} is missing an id.`);
        }

        const displayName = String(
            machine.displayName ||
            machine.name ||
            machine.customName ||
            machine.label ||
            machine.type ||
            `Machine ${index + 1}`
        ).trim();

        const system = String(
            machine.system || machine.location || machine.region || 'Unknown system'
        ).trim();

        const typeLabel = String(
            machine.typeLabel || machine.machineType || machine.type || ''
        ).trim();

        const inventory = extractInventoryArray(machine).map((item, itemIndex) => {
            const typeId = String(
                item.typeId || item.type_id || item.id || item.itemTypeId || ''
            ).trim();

            const quantity = numberOrZero(
                item.quantity || item.qty || item.amount || item.count
            );

            const name = resolveItemName(
                typeId,
                item.name || item.itemName || item.label || '',
                itemsById
            );

            if (!typeId && !name) {
                throw new Error(
                    `Machine "${displayName}" has an invalid inventory row at ${itemIndex + 1}.`
                );
            }

            return {
                typeId,
                name,
                quantity
            };
        });

        return {
            id,
            displayName,
            system,
            typeLabel,
            inventory
        };
    });

    return {
        machines,
        parseStatus: `Loaded ${machines.length} machine(s) successfully.`
    };
}

export function getSystems(machines) {
    const systems = new Set();

    for (const machine of asArray(machines)) {
        if (machine.system) systems.add(machine.system);
    }

    return ['All systems', ...Array.from(systems).sort((a, b) => a.localeCompare(b))];
}