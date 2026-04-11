import recipesData from '../../data/recipes.app.json';
import itemsLookupData from '../../data/items.lookup.json';
import categoriesLookupData from '../../data/categories.lookup.json';

export function asArray(value) {
    return Array.isArray(value) ? value : [];
}

export function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function normalizeName(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function numberOrZero(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function firstValue(...values) {
    for (const value of values) {
        if (value !== undefined && value !== null && String(value).trim() !== '') {
            return value;
        }
    }
    return '';
}

function toLookupMap(input) {
    if (Array.isArray(input)) {
        const map = {};
        for (const row of input) {
            const obj = asObject(row);
            const id = String(
                firstValue(obj.typeId, obj.type_id, obj.id, obj.itemId, obj.item_id)
            ).trim();
            const name = String(
                firstValue(obj.name, obj.itemName, obj.item_name, obj.label)
            ).trim();

            if (id && name) {
                map[id] = name;
            }
        }
        return map;
    }

    return asObject(input);
}

function inferMachineLabel(bp) {
    const text = [
        bp.machineLabel,
        bp.machine,
        bp.machineName,
        bp.station,
        bp.stationName,
        bp.building,
        bp.structure,
        bp.factory,
        bp.facility,
        bp.facilityType,
        bp.recipeType,
        bp.group,
        bp.category,
        bp.name
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    if (/(berth|shipyard|dock)/.test(text)) return 'Berth';
    if (/(mini printer|mini-printer|miniprinter)/.test(text)) return 'Mini Printer';
    if (/(assembler|assembly)/.test(text)) return 'Assembler';
    if (/(printer|print)/.test(text)) return 'Mini Printer';
    if (/(refiner|refinery)/.test(text)) return 'Refinery';

    return 'Assembler';
}

function inferCategory(bp, itemName) {
    const text = [
        bp.category,
        bp.group,
        bp.groupName,
        bp.marketGroup,
        bp.name,
        itemName
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    if (/(ship|vessel|berth|hull)/.test(text)) return 'Ships';
    if (/(ammo|charge|round|munition)/.test(text)) return 'Ammo';

    if (/(weapon|laser|coilgun|plasma|howitzer|turret|launcher|extractor)/.test(text)) {
        return 'Weapons';
    }

    if (/(module|shield|armor|afterburner|cargo|generator|field|array|sequencer)/.test(text)) {
        return 'Modules';
    }

    if (/(alloy|weave|ore|grain|coolant|tar|circuit|composite|metal|fuel|material)/.test(text)) {
        return 'Materials';
    }

    return 'Other';
}

function normalizeMaterial(mat, itemsById) {
    const row = asObject(mat);
    const typeId = String(
        firstValue(row.typeId, row.type_id, row.materialTypeId, row.inputTypeId, row.id)
    ).trim();

    const quantity = numberOrZero(
        firstValue(row.quantity, row.qty, row.amount, row.count, row.inputQuantity)
    );

    const name = String(
        firstValue(
            row.name,
            row.materialName,
            row.inputName,
            row.itemName,
            itemsById[typeId],
            typeId ? `Type ${typeId}` : 'Unknown item'
        )
    ).trim();

    return {
        typeId,
        quantity: quantity || 0,
        name
    };
}

function normalizeOutput(bp, itemsById) {
    const row = asObject(bp.output || {});

    const rawTypeId = String(
        firstValue(
            row.typeId,
            row.type_id,
            bp.outputTypeId,
            bp.output_type_id,
            bp.typeId,
            bp.type_id,
            bp.productTypeId,
            bp.product_type_id
        )
    ).trim();

    const name = String(
        firstValue(
            row.name,
            bp.outputName,
            bp.productName,
            bp.name,
            itemsById[rawTypeId],
            rawTypeId ? `Type ${rawTypeId}` : 'Unknown item'
        )
    ).trim();

    const quantity =
        numberOrZero(
            firstValue(row.quantity, bp.outputQuantity, bp.productQuantity, bp.quantity, 1)
        ) || 1;

    return {
        typeId: rawTypeId,
        name,
        quantity
    };
}

function uniqueBlueprintKey(bp, index, output, machineLabel, category) {
    const variant = [
        String(
            firstValue(bp.id, bp.recipeId, bp.recipe_id, bp.blueprintId, bp.blueprint_id)
        ).trim(),
        output.typeId,
        normalizeName(output.name),
        normalizeName(machineLabel),
        normalizeName(category),
        numberOrZero(
            firstValue(
                bp.durationSeconds,
                bp.time,
                bp.buildTime,
                bp.manufacturingTime
            )
        ),
        output.quantity,
        index
    ].join('::');

    return `bp-${variant}`;
}

function normalizeBlueprints(rawRecipes, itemsById, categoryMap) {
    const source = Array.isArray(rawRecipes)
        ? rawRecipes
        : asArray(rawRecipes.recipes || rawRecipes.blueprints || rawRecipes.items || rawRecipes.rows);

    return source
        .map((entry, index) => {
            const bp = asObject(entry);
            const output = normalizeOutput(bp, itemsById);
            const itemName = output.name;

            const machineLabel = String(
                firstValue(
                    bp.machineLabel,
                    bp.machine,
                    bp.machineName,
                    bp.station,
                    bp.stationName,
                    bp.building,
                    bp.structure,
                    bp.factory,
                    bp.facility,
                    bp.facilityType,
                    inferMachineLabel(bp)
                )
            ).trim();

            const category =
                String(
                    firstValue(
                        bp.category,
                        categoryMap[output.typeId],
                        categoryMap[normalizeName(itemName)]
                    )
                ).trim() || inferCategory(bp, itemName);

            const materials = asArray(
                bp.materials || bp.inputs || bp.ingredients || bp.requirements
            ).map((mat) => normalizeMaterial(mat, itemsById));

            const durationSeconds = numberOrZero(
                firstValue(
                    bp.durationSeconds,
                    bp.timeSeconds,
                    bp.buildTimeSeconds,
                    bp.duration,
                    bp.time,
                    bp.buildTime,
                    0
                )
            );

            return {
                blueprintKey: uniqueBlueprintKey(bp, index, output, machineLabel, category),
                name: itemName,
                category,
                group: String(firstValue(bp.group, bp.groupName, '')).trim(),
                machineLabel,
                output,
                materials,
                durationSeconds,
                raw: bp
            };
        })
        .filter((bp) => bp.name && (bp.output.typeId || bp.materials.length));
}

function pushMapArray(map, key, value) {
    if (!key) return;
    const list = map.get(key) || [];
    list.push(value);
    map.set(key, list);
}

export function loadBlueprintData() {
    const itemsById = toLookupMap(itemsLookupData);
    const categoryMap = toLookupMap(categoriesLookupData);
    const blueprints = normalizeBlueprints(recipesData, itemsById, categoryMap);

    const blueprintsByKey = new Map();
    const blueprintsByOutputTypeId = new Map();
    const blueprintsByOutputName = new Map();
    const categories = new Set();

    for (const bp of blueprints) {
        blueprintsByKey.set(bp.blueprintKey, bp);
        categories.add(bp.category);

        if (bp.output.typeId) {
            pushMapArray(blueprintsByOutputTypeId, bp.output.typeId, bp);
        }

        const normalizedOutputName = normalizeName(bp.output.name);
        if (normalizedOutputName) {
            pushMapArray(blueprintsByOutputName, normalizedOutputName, bp);
        }

        if (bp.output.typeId && bp.output.name && !itemsById[bp.output.typeId]) {
            itemsById[bp.output.typeId] = bp.output.name;
        }

        for (const material of bp.materials) {
            if (material.typeId && material.name && !itemsById[material.typeId]) {
                itemsById[material.typeId] = material.name;
            }
        }
    }

    return {
        blueprints,
        blueprintsByKey,
        blueprintsByOutputTypeId,
        blueprintsByOutputName,
        itemsById,
        categories: ['All', ...Array.from(categories).sort((a, b) => a.localeCompare(b))]
    };
}

export function resolveItemName(typeId, fallbackName, itemsById) {
    const key = String(typeId || '').trim();
    if (key && itemsById[key]) return itemsById[key];
    if (fallbackName) return String(fallbackName).trim();
    return key ? `Type ${key}` : 'Unknown item';
}

export function filterBlueprints(blueprints, category, query) {
    const normalizedQuery = normalizeName(query);

    return asArray(blueprints)
        .filter((bp) => {
            const categoryOk = !category || category === 'All' || bp.category === category;
            const queryOk =
                !normalizedQuery ||
                normalizeName(bp.name).includes(normalizedQuery) ||
                normalizeName(bp.machineLabel).includes(normalizedQuery) ||
                normalizeName(bp.category).includes(normalizedQuery);

            return categoryOk && queryOk;
        })
        .sort(
            (a, b) =>
                a.name.localeCompare(b.name) ||
                a.machineLabel.localeCompare(b.machineLabel) ||
                a.category.localeCompare(b.category)
        );
}