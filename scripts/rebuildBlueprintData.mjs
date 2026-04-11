import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_URL = 'https://gamingwithdaopa.ellatha.com/media/evefrontier/blueprints.json';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const dataDir = path.join(projectRoot, 'data');

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cleanString(value) {
    return String(value ?? '').trim();
}

function numberOrZero(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function stableJson(value) {
    return JSON.stringify(value, null, 2) + '\n';
}

function inferCategory(itemName, groupName, blueprintName = '') {
    const text = [itemName, groupName, blueprintName].filter(Boolean).join(' ').toLowerCase();

    if (/(ammo|charge|round|munition)/.test(text)) return 'Ammo';

    if (/(ship|vessel|frigate|destroyer|cruiser|berth|hull|sojourn|embark|recurve|reiver|wend|chumaq|usv|haf|lorha|mcf|tades)/.test(text)) {
        return 'Ships';
    }

    if (/(frame|program frame|protocol frame|exotronic frame)/.test(text)) {
        return 'Frames';
    }

    if (/(weapon|laser|coilgun|autocannon|plasma|disintegrator|extractor|mining lens|tool)/.test(text)) {
        return 'Weapons & Tools';
    }

    if (/(module|shield|armor|afterburner|cargo|generator|field array|sequencer|stasis|entangler|brace|restorer|heat exchanger)/.test(text)) {
        return 'Modules';
    }

    if (/(alloy|weave|ore|grain|coolant|tar|circuit|composite|metal|fuel|material|residue|aggregate|nodule|foam|kernel|knot|packaged|batched|organics|ice|synthetic|salvage)/.test(text)) {
        return 'Materials & Resources';
    }

    return 'Other';
}

function inferMachineLabel(itemName, groupName, blueprintName, category) {
    const text = [itemName, groupName, blueprintName, category].filter(Boolean).join(' ').toLowerCase();

    // The source JSON does not provide facility/machine metadata directly.
    // These labels are only for UI grouping.
    if (/(packaged|batched)/.test(text)) return 'Heavy Refiner';
    if (/(ore|mineral|manufacturing component|fuel|salvage|synthetic|glint ores|comet ores|ingot ores|materials & resources)/.test(text)) {
        return 'Refinery';
    }
    if (/(ship|berth|dock|frame)/.test(text)) return 'Berth';
    if (/(printer|print)/.test(text)) return 'Mini Printer';
    return 'Assembler';
}

function normalizeMaterial(row) {
    const value = asObject(row);

    return {
        typeId: String(value.typeID ?? value.typeId ?? value.id ?? '').trim(),
        name: cleanString(value.name),
        quantity: numberOrZero(value.quantity ?? value.qty ?? value.amount)
    };
}

function normalizeProduct(row, manufacturingTime) {
    const value = asObject(row);

    return {
        typeId: String(value.typeID ?? value.typeId ?? value.id ?? '').trim(),
        name: cleanString(value.name),
        quantity: numberOrZero(value.quantity ?? value.qty ?? value.amount, 1) || 1,
        manufacturingTime
    };
}

function uniqueRows(rows) {
    const seen = new Set();
    const result = [];

    for (const row of rows) {
        const key = `${row.typeId}::${row.name}::${row.quantity}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(row);
    }

    return result;
}

function recipeDedupKey(recipe) {
    const materialsKey = recipe.materials
        .map((row) => `${row.typeId}:${row.quantity}:${row.name}`)
        .sort()
        .join('|');

    const productsKey = recipe.products
        .map((row) => `${row.typeId}:${row.quantity}:${row.name}`)
        .sort()
        .join('|');

    return [
        recipe.blueprintId,
        recipe.blueprintName,
        recipe.outputTypeId,
        recipe.outputQuantity,
        recipe.manufacturingTime,
        recipe.maxProductionLimit,
        materialsKey,
        productsKey
    ].join('::');
}

function addBlueprintId(target, blueprintId) {
    if (!blueprintId) return;
    if (!target.blueprintIds.includes(blueprintId)) {
        target.blueprintIds.push(blueprintId);
    }
}

async function fetchSourceBlueprints() {
    const response = await fetch(SOURCE_URL);

    if (!response.ok) {
        throw new Error(`Failed to fetch ${SOURCE_URL}: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();

    if (Array.isArray(json)) return json;
    if (Array.isArray(json?.items)) return json.items;
    if (Array.isArray(json?.rows)) return json.rows;
    if (Array.isArray(json?.blueprints)) return json.blueprints;

    throw new Error('Unexpected blueprint source shape.');
}

function buildRecipes(sourceRows) {
    const recipes = [];
    const seen = new Set();

    for (const entry of sourceRows) {
        const row = asObject(entry);
        const blueprintName = cleanString(row.name);

        if (!/blueprint$/i.test(blueprintName)) {
            continue;
        }

        const build = asObject(row.build);
        const manufacturing = asObject(asObject(build.activities).manufacturing);

        const materials = uniqueRows(
            asArray(manufacturing.materials).map(normalizeMaterial)
        ).filter((item) => item.typeId && item.name && item.quantity > 0);

        let products = asArray(manufacturing.products).map((item) =>
            normalizeProduct(item, numberOrZero(manufacturing.time ?? build.time))
        );

        if (!products.length && build.manufactures) {
            products = [
                normalizeProduct(build.manufactures, numberOrZero(manufacturing.time ?? build.time))
            ];
        }

        products = uniqueRows(products).filter(
            (item) => item.typeId && item.name && item.quantity > 0
        );

        if (!products.length) {
            continue;
        }

        const blueprintId = String(row.typeID ?? row.typeId ?? row.id ?? '').trim();
        const group = cleanString(row.group);
        const manufacturingTime = numberOrZero(manufacturing.time ?? build.time);
        const maxProductionLimit = numberOrZero(build.maxProductionLimit, 0) || null;

        for (const output of products) {
            const category = inferCategory(output.name, group, blueprintName);
            const machineLabel = inferMachineLabel(output.name, group, blueprintName, category);

            const recipe = {
                blueprintId: blueprintId || output.typeId,
                blueprintName,
                outputTypeId: output.typeId,
                outputName: output.name,
                outputQuantity: output.quantity,
                category,
                group: group || null,
                machineLabel,
                manufacturingTime,
                maxProductionLimit,
                materials,
                products
            };

            const key = recipeDedupKey(recipe);
            if (seen.has(key)) continue;
            seen.add(key);
            recipes.push(recipe);
        }
    }

    return recipes.sort((a, b) =>
        a.outputName.localeCompare(b.outputName) ||
        a.blueprintName.localeCompare(b.blueprintName) ||
        String(a.outputQuantity).localeCompare(String(b.outputQuantity))
    );
}

function buildItemsLookup(recipes) {
    const items = new Map();

    function ensureItem(typeId, name, group, category) {
        const key = String(typeId || '').trim();
        if (!key) return null;

        if (!items.has(key)) {
            items.set(key, {
                typeId: Number(key),
                name: cleanString(name) || `Type ${key}`,
                group: cleanString(group) || null,
                category: cleanString(category) || null,
                blueprintIds: []
            });
        }

        const item = items.get(key);

        if (!item.name && name) item.name = cleanString(name);
        if (!item.group && group) item.group = cleanString(group);
        if (!item.category && category) item.category = cleanString(category);

        return item;
    }

    for (const recipe of recipes) {
        for (const product of recipe.products) {
            const category = inferCategory(product.name, recipe.group, recipe.blueprintName);
            const item = ensureItem(product.typeId, product.name, recipe.group, category);
            if (item) addBlueprintId(item, Number(recipe.blueprintId));
        }

        for (const material of recipe.materials) {
            ensureItem(material.typeId, material.name, null, null);
        }
    }

    return Array.from(items.values())
        .map((item) => ({
            ...item,
            blueprintIds: item.blueprintIds.sort((a, b) => a - b)
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

function buildCategoryLookup(items) {
    return items
        .filter((item) => item.typeId && item.category)
        .map((item) => ({
            typeId: item.typeId,
            name: item.category
        }))
        .sort((a, b) => String(a.typeId).localeCompare(String(b.typeId)));
}

async function main() {
    const sourceRows = await fetchSourceBlueprints();
    const recipes = buildRecipes(sourceRows);
    const items = buildItemsLookup(recipes);
    const categories = buildCategoryLookup(items);

    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(path.join(dataDir, 'recipes.app.json'), stableJson(recipes));
    await fs.writeFile(path.join(dataDir, 'items.lookup.json'), stableJson(items));
    await fs.writeFile(path.join(dataDir, 'categories.lookup.json'), stableJson(categories));

    console.log(
        `Wrote ${recipes.length} recipes, ${items.length} items, and ${categories.length} category rows.`
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});