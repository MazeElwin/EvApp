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

function dedupeBlueprints(list) {
    const seen = new Set();
    const out = [];

    for (const bp of list) {
        if (!bp?.blueprintKey || seen.has(bp.blueprintKey)) continue;
        seen.add(bp.blueprintKey);
        out.push(bp);
    }

    return out;
}

function getCandidateBlueprints(outputTypeId, outputName, context) {
    const byType = toBlueprintList(
        outputTypeId ? context.blueprintsByOutputTypeId.get(outputTypeId) : null
    );

    if (byType.length) {
        return dedupeBlueprints(byType);
    }

    return dedupeBlueprints(
        toBlueprintList(context.blueprintsByOutputName.get(normalizeName(outputName)))
    );
}

function chooseBlueprint(candidates, fallbackBlueprint, forcedBlueprintKey, blockedKeys) {
    const merged = dedupeBlueprints([
        ...(fallbackBlueprint ? [fallbackBlueprint] : []),
        ...candidates
    ]);

    if (forcedBlueprintKey) {
        const forced = merged.find((bp) => bp.blueprintKey === forcedBlueprintKey);
        if (forced && !blockedKeys.has(forced.blueprintKey)) {
            return forced;
        }
    }

    return (
        merged.find((bp) => !blockedKeys.has(bp.blueprintKey)) ||
        fallbackBlueprint ||
        null
    );
}

function toBlueprintOptions(candidates) {
    return candidates.map((bp) => ({
        blueprintKey: bp.blueprintKey,
        name: bp.name,
        machineLabel: bp.machineLabel,
        category: bp.category
    }));
}

export function createPlanTree(
    targetBlueprint,
    quantityNeeded,
    context,
    allocations = new Map(),
    options = {},
    state = {}
) {
    const pathKey = state.pathKey || options.rootNodeId || 'root';
    const rootNodeId = state.rootNodeId || options.rootNodeId || pathKey;
    const rootBlueprintKey = state.rootBlueprintKey || targetBlueprint.blueprintKey;
    const rootQuantityNeeded = state.rootQuantityNeeded || quantityNeeded;
    const blockedKeys =
        state.blockedKeys instanceof Set ? state.blockedKeys : new Set();

    const currentCandidates = getCandidateBlueprints(
        String(targetBlueprint.output?.typeId || '').trim(),
        targetBlueprint.output?.name,
        context
    );

    const activeBlueprint = chooseBlueprint(
        currentCandidates,
        targetBlueprint,
        options.pathOverrides?.[pathKey],
        blockedKeys
    );

    if (!activeBlueprint) {
        return null;
    }

    const nextBlockedKeys = new Set(blockedKeys);
    nextBlockedKeys.add(activeBlueprint.blueprintKey);

    const { itemsById, stockLookup } = context;

    const outputTypeId = String(activeBlueprint.output.typeId || '').trim();
    const outputName = resolveItemName(
        outputTypeId,
        activeBlueprint.output.name,
        itemsById
    );

    const perRunOutput = Number(activeBlueprint.output.quantity || 1) || 1;

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
        for (let i = 0; i < activeBlueprint.materials.length; i += 1) {
            const mat = activeBlueprint.materials[i];
            const materialTypeId = String(mat.typeId || '').trim();
            const materialName = resolveItemName(materialTypeId, mat.name, itemsById);
            const need = Number(mat.quantity || 0) * runs;
            const childPathKey = `${pathKey}.${i}`;

            const childCandidates = getCandidateBlueprints(
                materialTypeId,
                materialName,
                context
            );

            const nextBlueprint = chooseBlueprint(
                childCandidates,
                null,
                options.pathOverrides?.[childPathKey],
                nextBlockedKeys
            );

            if (nextBlueprint) {
                const child = createPlanTree(
                    nextBlueprint,
                    need,
                    context,
                    allocations,
                    options,
                    {
                        pathKey: childPathKey,
                        rootNodeId,
                        rootBlueprintKey,
                        rootQuantityNeeded,
                        blockedKeys: nextBlockedKeys
                    }
                );

                if (child) {
                    children.push(child);
                    continue;
                }
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
                id: `raw-${childPathKey}-${need}`,
                pathKey: childPathKey,
                rootNodeId,
                rootBlueprintKey,
                rootQuantityNeeded,
                blueprintKey: '',
                blueprintOptions: [],
                name: materialName,
                typeId: materialTypeId,
                machineLabel: 'Raw resource',
                quantityNeeded: need,
                owned: rawOwned,
                useOwned: rawUseOwned,
                quantityToCraft: Math.max(0, need - rawUseOwned),
                runs: 0,
                children: [],
                alternativeBlueprints: []
            });
        }
    }

    return {
        id: `${pathKey}:${activeBlueprint.blueprintKey}:${quantityNeeded}`,
        pathKey,
        rootNodeId,
        rootBlueprintKey,
        rootQuantityNeeded,
        blueprintKey: activeBlueprint.blueprintKey,
        blueprintOptions: toBlueprintOptions(
            dedupeBlueprints([activeBlueprint, ...currentCandidates])
        ),
        alternativeBlueprints: toBlueprintOptions(
            dedupeBlueprints([activeBlueprint, ...currentCandidates]).filter(
                (bp) => bp.blueprintKey !== activeBlueprint.blueprintKey
            )
        ),
        name: outputName,
        typeId: outputTypeId,
        machineLabel: `Assembly - ${activeBlueprint.machineLabel || 'Assembler'}`,
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