import { normalizeName, resolveItemName } from './blueprints.js';

function getStockAmount(stockLookup, typeId, fallbackName) {
    const byType = typeId ? stockLookup.get(`type:${typeId}`) : undefined;
    if (typeof byType === 'number') return byType;

    const byName = fallbackName
        ? stockLookup.get(`name:${normalizeName(fallbackName)}`)
        : undefined;

    return typeof byName === 'number' ? byName : 0;
}

export function createPlanTree(targetBlueprint, quantityNeeded, context, allocations = new Map()) {
    const { blueprintsByOutputTypeId, blueprintsByOutputName, itemsById, stockLookup } = context;

    const outputTypeId = String(targetBlueprint.output.typeId || '').trim();
    const outputName = resolveItemName(outputTypeId, targetBlueprint.output.name, itemsById);
    const perRunOutput = Number(targetBlueprint.output.quantity || 1) || 1;

    const stockKey = outputTypeId
        ? `type:${outputTypeId}`
        : `name:${normalizeName(outputName)}`;

    const owned = getStockAmount(stockLookup, outputTypeId, outputName);
    const allocated = allocations.get(stockKey) || 0;
    const freeOwned = Math.max(0, owned - allocated);
    const useOwned = Math.min(freeOwned, quantityNeeded);
    allocations.set(stockKey, allocated + useOwned);

    const remainingToCraft = Math.max(0, quantityNeeded - useOwned);
    const runs = remainingToCraft > 0 ? Math.ceil(remainingToCraft / perRunOutput) : 0;

    const children = [];

    if (runs > 0) {
        for (let i = 0; i < targetBlueprint.materials.length; i += 1) {
            const mat = targetBlueprint.materials[i];
            const materialTypeId = String(mat.typeId || '').trim();
            const materialName = resolveItemName(materialTypeId, mat.name, itemsById);
            const need = Number(mat.quantity || 0) * runs;

            const nextBlueprint =
                (materialTypeId && blueprintsByOutputTypeId.get(materialTypeId)) ||
                blueprintsByOutputName.get(normalizeName(materialName));

            if (nextBlueprint) {
                children.push(createPlanTree(nextBlueprint, need, context, allocations));
                continue;
            }

            const rawOwned = getStockAmount(stockLookup, materialTypeId, materialName);
            const rawKey = materialTypeId
                ? `type:${materialTypeId}`
                : `name:${normalizeName(materialName)}`;
            const rawAllocated = allocations.get(rawKey) || 0;
            const rawFree = Math.max(0, rawOwned - rawAllocated);
            const rawUseOwned = Math.min(rawFree, need);
            allocations.set(rawKey, rawAllocated + rawUseOwned);

            children.push({
                id: `raw-${rawKey}-${i}-${need}`,
                name: materialName,
                typeId: materialTypeId,
                machineLabel: 'Raw resource',
                quantityNeeded: need,
                owned: rawOwned,
                useOwned: rawUseOwned,
                quantityToCraft: Math.max(0, need - rawUseOwned),
                runs: 0,
                children: []
            });
        }
    }

    return {
        id: `${targetBlueprint.blueprintKey}-${quantityNeeded}`,
        name: outputName,
        typeId: outputTypeId,
        machineLabel: `Assembly - ${targetBlueprint.machineLabel || 'Assembler'}`,
        quantityNeeded,
        owned,
        useOwned,
        quantityToCraft: remainingToCraft,
        runs,
        children
    };
}

export function collectRawShortages(node, out = []) {
    if (!node) return out;

    if (
        (!node.children || node.children.length === 0) &&
        node.machineLabel === 'Raw resource' &&
        node.quantityToCraft > 0
    ) {
        out.push({
            name: node.name,
            typeId: node.typeId,
            quantity: node.quantityToCraft
        });
    }

    for (const child of node.children || []) {
        collectRawShortages(child, out);
    }

    return out;
}