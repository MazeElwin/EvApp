function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    } catch {
        throw new Error('Machine file is not valid JSON.');
    }
}

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function normalizeMachine(machine, index = 0) {
    const parsedInventories = asArray(machine.parsedInventories).map((inv) => ({
        inventoryObjectId: String(inv.inventoryObjectId || ''),
        fieldName: String(inv.fieldName || ''),
        maxCapacity: Number(inv.maxCapacity || 0),
        usedCapacity: Number(inv.usedCapacity || 0),
        fillPercent: Number(inv.fillPercent || 0),
        items: asArray(inv.items).map((item) => ({
            typeId: String(item.typeId || ''),
            itemId: String(item.itemId || ''),
            quantity: Number(item.quantity || 0),
            unitVolume: Number(item.unitVolume || 0),
            totalVolume: Number(item.totalVolume || 0),
            tenant: String(item.tenant || ''),
            inventoryObjectId: String(item.inventoryObjectId || inv.inventoryObjectId || ''),
            fieldName: String(item.fieldName || inv.fieldName || '')
        }))
    }));

    return {
        id: String(machine.id || `machine-${index + 1}`),
        walletAddress: String(machine.walletAddress || ''),
        system: String(machine.system || 'Unknown system'),
        displayName: String(machine.displayName || machine.customName || `Machine ${index + 1}`),
        customName: String(machine.customName || ''),
        broadType: String(machine.broadType || ''),
        machineSubtype: String(machine.machineSubtype || machine.broadType || ''),
        machineTypeId: String(machine.machineTypeId || ''),
        itemId: String(machine.itemId || ''),
        status: String(machine.status || ''),
        parsedInventories,
        updatedAt: String(machine.updatedAt || new Date().toISOString())
    };
}

export function parseMachineFile(text) {
    const parsed = safeJsonParse(text);

    const machineRows = Array.isArray(parsed)
        ? parsed
        : asArray(parsed.machines || parsed.items || parsed.rows);

    if (!machineRows.length) {
        throw new Error('Machine file does not contain any machines.');
    }

    const machines = machineRows.map((machine, index) => normalizeMachine(machine, index));

    return {
        machines,
        walletAddress: String(parsed.walletAddress || parsed.wallet_address || ''),
        parseStatus: `Loaded ${machines.length} machine(s) successfully.`
    };
}