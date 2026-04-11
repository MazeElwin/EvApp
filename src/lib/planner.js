import { normalizeName, resolveItemName } from './blueprints.js';

function getStockAmount(stockLookup, typeId, fallbackName) {
    const byType = typeId ? stockLookup.get(`type:${typeId}`) : undefined;
    if (typeof byType === 'number') return byType;

    const byName = fallbackName
        ? stockLookup.get(`name:${normalizeName(fallbackName)}`)
        : undefined;

    return typeof byName === 'number' ? byName : 0;
}

function toBlueprintList(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

function getCandidateBlueprints(materialTypeId, materialName, context) {
    const byType = toBlueprintList(
        materialTypeId ? context.blueprintsByOutputTypeId.get(materialTypeId) : null
    );

    if (byType.length) {
        return byType;
    }

    return toBlueprintList(
        context.blueprintsByOutputName.get(normalizeName(materialName))
    );
}

function pickPreferredBlueprint(candidates, currentBlueprintKey, pathKeys) {
    const filtered = candidates.filter((bp) => {
        if (!bp?.blueprintKey) return false;
        if (bp.blueprintKey === currentBlueprintKey) return false;
        if (pathKeys.has(bp.blueprintKey)) return false;
        return true;
    });

    if (!filtered.length) {
        return null;
    }

    return [...filtered].sort((a, b) => {
        const aMaterials = Array.isArray(a.materials) ? a.materials.length : 0;
        const bMaterials = Array.isArray(b.materials) ? b.materials.length : 0;

        return (
            aMaterials - bMaterials ||
            (a.durationSeconds || 0) - (b.durationSeconds || 0) ||
            a.name.localeCompare(b.name)
        );
    })[0];
}

function makeCycleLeaf({
    materialTypeId,
    materialName,
    need,
    rawOwned,
    rawUseOwned,
    mode,
    reason
}) {
    return {
        id: `cycle-${materialTypeId || normalizeName(materialName)}-${need}-${mode}`,
        mode,
        name: materialName,
        typeId: materialTypeId,
        machineLabel: reason || 'Cycle blocked',
        quantityNeeded: need,
        owned: rawOwned,
        useOwned: rawUseOwned,
        quantityToCraft: Math.max(0, need - rawUseOwned),
        runs: 0,
        children: [],
        alternativeBlueprints: []
    };
}

export function createPlanTree(
    targetBlueprint,
    quantityNeeded,
    context,
    allocations = new Map(),
    options = {},
    state = {}
) {
    const mode = options.mode || 'planner';
    const { itemsById, stockLookup } = context;

    const pathKeys = state.pathKeys instanceof Set ? state.pathKeys : new Set();
    const depth = Number(state.depth || 0);
    const maxDepth = Number(options.maxDepth || 25);

    if (!targetBlueprint?.blueprintKey) {
        return {
            id: `invalid-blueprint-${depth}`,
            mode,
            name: 'Invalid blueprint',
            typeId: '',
            machineLabel: 'Invalid',
            quantityNeeded,
            owned: 0,
            useOwned: 0,
            quantityToCraft: quantityNeeded,
            runs: 0,
            children: [],
            alternativeBlueprints: []
        };
    }

    const outputTypeId = String(targetBlueprint.output?.typeId || '').trim();
    const outputName = resolveItemName(
        outputTypeId,
        targetBlueprint.output?.name,
        itemsById
    );

    const perRunOutput = Number(targetBlueprint.output?.quantity || 1) || 1;

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

    const expansionQuantity =
        mode === 'recipe' ? quantityNeeded : remainingToCraft;

    const expansionRuns =
        expansionQuantity > 0 ? Math.ceil(expansionQuantity / perRunOutput) : 0;

    const children = [];

    const nextPathKeys = new Set(pathKeys);
    nextPathKeys.add(targetBlueprint.blueprintKey);

    if (expansionRuns > 0 && depth < maxDepth) {
        for (let i = 0; i < targetBlueprint.materials.length; i += 1) {
            const mat = targetBlueprint.materials[i];
            const materialTypeId = String(mat.typeId || '').trim();
            const materialName = resolveItemName(materialTypeId, mat.name, itemsById);
            const need = Number(mat.quantity || 0) * expansionRuns;

            const candidateBlueprints = getCandidateBlueprints(
                materialTypeId,
                materialName,
                context
            );

            const nextBlueprint = pickPreferredBlueprint(
                candidateBlueprints,
                targetBlueprint.blueprintKey,
                nextPathKeys
            );

            if (nextBlueprint) {
                const child = createPlanTree(
                    nextBlueprint,
                    need,
                    context,
                    allocations,
                    options,
                    {
                        pathKeys: nextPathKeys,
                        depth: depth + 1
                    }
                );

                child.alternativeBlueprints = candidateBlueprints
                    .filter(
                        (bp) =>
                            bp.blueprintKey !== nextBlueprint.blueprintKey &&
                            bp.blueprintKey !== targetBlueprint.blueprintKey
                    )
                    .map((bp) => ({
                        blueprintKey: bp.blueprintKey,
                        name: bp.name,
                        machineLabel: bp.machineLabel,
                        category: bp.category
                    }));

                children.push(child);
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

            const hadBlockedCycleCandidate = candidateBlueprints.some(
                (bp) =>
                    bp?.blueprintKey === targetBlueprint.blueprintKey ||
                    nextPathKeys.has(bp?.blueprintKey)
            );

            children.push(
                hadBlockedCycleCandidate
                    ? makeCycleLeaf({
                        materialTypeId,
                        materialName,
                        need,
                        rawOwned,
                        rawUseOwned,
                        mode,
                        reason: 'Cycle blocked'
                    })
                    : {
                        id: `raw-${rawKey}-${i}-${need}-${mode}`,
                        mode,
                        name: materialName,
                        typeId: materialTypeId,
                        machineLabel: mode === 'recipe' ? 'Raw ingredient' : 'Raw resource',
                        quantityNeeded: need,
                        owned: rawOwned,
                        useOwned: rawUseOwned,
                        quantityToCraft: Math.max(0, need - rawUseOwned),
                        runs: 0,
                        children: [],
                        alternativeBlueprints: []
                    }
            );
        }
    } else if (expansionRuns > 0 && depth >= maxDepth) {
        children.push({
            id: `depth-limit-${targetBlueprint.blueprintKey}-${depth}`,
            mode,
            name: 'Depth limit reached',
            typeId: '',
            machineLabel: 'Depth limit',
            quantityNeeded: 0,
            owned: 0,
            useOwned: 0,
            quantityToCraft: 0,
            runs: 0,
            children: [],
            alternativeBlueprints: []
        });
    }

    return {
        id: `${targetBlueprint.blueprintKey}-${quantityNeeded}-${mode}-${depth}`,
        mode,
        name: outputName,
        typeId: outputTypeId,
        machineLabel: `Assembly - ${targetBlueprint.machineLabel || 'Assembler'}`,
        quantityNeeded,
        owned,
        useOwned,
        quantityToCraft: remainingToCraft,
        runs,
        children,
        alternativeBlueprints: []
    };
}

export function collectRawShortages(node, out = []) {
    if (!node) return out;

    if (node.mode === 'recipe') {
        return out;
    }

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