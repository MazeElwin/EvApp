import { asArray, normalizeName, resolveItemName } from './blueprints.js';

export function aggregateInventory(sources, systemFilter, itemsById) {
    const totals = new Map();

    for (const source of asArray(sources)) {
        if (systemFilter !== 'All systems' && source.system !== systemFilter) {
            continue;
        }

        for (const row of asArray(source.inventory)) {
            const typeId = String(row.typeId || '').trim();
            const name = resolveItemName(typeId, row.name, itemsById);
            const normalized = normalizeName(name);
            const key = typeId ? `type:${typeId}` : `name:${normalized}`;

            const existing = totals.get(key) || {
                key,
                typeId,
                name,
                quantity: 0,
                sources: []
            };

            existing.quantity += Number(row.quantity || 0);

            if (!existing.typeId && typeId) {
                existing.typeId = typeId;
            }

            if ((!existing.name || existing.name.startsWith('Type ')) && name) {
                existing.name = name;
            }

            existing.sources.push(source.displayName || source.id || 'Source');
            totals.set(key, existing);
        }
    }

    return Array.from(totals.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function buildStockLookup(invTotals) {
    const map = new Map();

    for (const row of asArray(invTotals)) {
        const typeId = String(row.typeId || '').trim();
        const qty = Number(row.quantity || 0);

        if (typeId) {
            map.set(`type:${typeId}`, qty);
        }

        if (row.name) {
            map.set(`name:${normalizeName(row.name)}`, qty);
        }
    }

    return map;
}