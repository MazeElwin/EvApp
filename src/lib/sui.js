import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

const PAGE_LIMIT = 50;
const MAX_LINKED_IDS = 25;
const WORLD_API_BASE = 'https://world-api-utopia.uat.pub.evefrontier.com';

export function getSuiClient(network) {
    return new SuiClient({ url: getFullnodeUrl(network || 'testnet') });
}

export async function fetchWalletObjects(network, owner) {
    const client = getSuiClient(network);
    const response = await client.getOwnedObjects({
        owner,
        limit: PAGE_LIMIT,
        options: {
            showType: true,
            showOwner: true,
            showContent: true,
            showDisplay: true
        }
    });

    return response?.data || [];
}

export async function inspectObjectId(network, objectId) {
    const client = getSuiClient(network);

    const objectResponse = await client.getObject({
        id: objectId,
        options: {
            showType: true,
            showOwner: true,
            showContent: true,
            showDisplay: true
        }
    });

    const rootObject = objectResponse?.data || objectResponse;
    const dynamicFields = await getDynamicFieldRows(client, objectId);
    const dynamicFieldObjects = await getDynamicFieldObjects(client, dynamicFields);
    const linkedIds = extractLinkedIds(rootObject)
        .filter((id) => id !== objectId)
        .slice(0, MAX_LINKED_IDS);

    const parsedInventories = parseInventories(rootObject, dynamicFieldObjects);
    const notes = buildInspectionNotes(rootObject, dynamicFields, dynamicFieldObjects, parsedInventories);

    return {
        rootId: objectId,
        object: rootObject,
        dynamicFields,
        dynamicFieldObjects,
        linkedIds,
        parsedInventories,
        notes
    };
}

async function getDynamicFieldRows(client, parentId) {
    const rows = [];
    let cursor = null;
    let hasNextPage = true;

    while (hasNextPage) {
        const response = await client.getDynamicFields({
            parentId,
            cursor,
            limit: PAGE_LIMIT
        });

        for (const field of response?.data || []) {
            rows.push({
                name: summarizeDynamicFieldName(field?.name),
                type: String(field?.type || 'unknown'),
                objectId: typeof field?.objectId === 'string' ? field.objectId : '',
                objectType: typeof field?.objectType === 'string' ? field.objectType : '',
                raw: field
            });
        }

        hasNextPage = Boolean(response?.hasNextPage);
        cursor = response?.nextCursor || null;
    }

    return rows;
}

async function getDynamicFieldObjects(client, rows) {
    const result = [];

    for (const row of rows) {
        if (!row.objectId) continue;

        try {
            const response = await client.getObject({
                id: row.objectId,
                options: {
                    showType: true,
                    showOwner: true,
                    showContent: true,
                    showDisplay: true
                }
            });

            const data = response?.data || response;
            result.push({
                objectId: String(data?.objectId || row.objectId),
                type: String(data?.type || ''),
                raw: data
            });
        } catch {
            // ignore unreadable objects
        }
    }

    return result;
}

function parseInventories(rootObject, dynamicFieldObjects) {
    const candidates = [rootObject, ...dynamicFieldObjects.map((item) => item.raw)];
    return candidates.map(parseInventoryObject).filter(Boolean);
}

function parseInventoryObject(candidate) {
    const object = unwrapRawObject(candidate);
    const type = String(object?.type || object?.content?.type || '');

    if (!type.includes('dynamic_field::Field') || !type.includes('inventory::Inventory')) {
        return null;
    }

    const fields = object?.content?.fields || object?.fields;
    const inventoryFields = fields?.value?.fields;
    const contents = inventoryFields?.items?.fields?.contents;

    if (!Array.isArray(contents)) return null;

    const rows = contents
        .map((entry) => {
            const value = entry?.fields?.value?.fields;
            if (!value) return null;

            const quantity = toNumber(value.quantity);
            const unitVolume = toNumber(value.volume);

            return {
                typeId: String(value.type_id || entry?.fields?.key || ''),
                itemId: String(value.item_id || ''),
                quantity,
                unitVolume,
                totalVolume: quantity * unitVolume,
                tenant: String(value.tenant || ''),
                inventoryObjectId: String(object?.objectId || fields?.id?.id || ''),
                fieldName: String(fields?.name || '')
            };
        })
        .filter(Boolean);

    const maxCapacity = toNumber(inventoryFields?.max_capacity);
    const usedCapacity = toNumber(inventoryFields?.used_capacity);

    return {
        inventoryObjectId: String(object?.objectId || fields?.id?.id || ''),
        fieldName: String(fields?.name || ''),
        maxCapacity,
        usedCapacity,
        fillPercent: maxCapacity > 0 ? (usedCapacity / maxCapacity) * 100 : 0,
        items: rows
    };
}

function unwrapRawObject(candidate) {
    return candidate?.data || candidate;
}

function toNumber(value) {
    if (value == null || value === '') return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function summarizeDynamicFieldName(name) {
    if (typeof name === 'string') return name;
    try {
        return JSON.stringify(name);
    } catch {
        return String(name);
    }
}

function buildInspectionNotes(object, dynamicFields, dynamicFieldObjects, parsedInventories) {
    const notes = [];
    const owner = object?.owner && typeof object.owner === 'object' ? Object.keys(object.owner)[0] : '';

    if (owner === 'Shared') notes.push('Shared object.');
    if (parsedInventories.length > 0) notes.push(`Parsed ${parsedInventories.length} inventory object(s).`);
    if (dynamicFields.length > 0 && dynamicFieldObjects.length === 0) {
        notes.push('Dynamic fields found, but none exposed direct object IDs.');
    }

    return notes;
}

function extractLinkedIds(value) {
    const ids = new Set();

    walkValue(value, (text) => {
        if (/^0x[a-f0-9]{8,}$/i.test(text)) {
            ids.add(text);
        }
    });

    return Array.from(ids);
}

function walkValue(value, onString) {
    if (typeof value === 'string') {
        onString(value);
        return;
    }

    if (value == null || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
        return;
    }

    if (Array.isArray(value)) {
        value.forEach((entry) => walkValue(entry, onString));
        return;
    }

    if (typeof value === 'object') {
        for (const [key, entry] of Object.entries(value)) {
            onString(key);
            walkValue(entry, onString);
        }
    }
}

function simplifyType(type) {
    return String(type || '').replace(/^0x[a-f0-9]+::/i, '');
}

export function extractMachineTypeLabel(typeValue) {
    const tail = simplifyType(typeValue).split('::').pop() || String(typeValue || '');
    return tail
        .replace(/StorageUnit/g, 'Storage Unit')
        .replace(/([a-z])([A-Z])/g, '$1 $2');
}

export async function fetchTypeInfo(typeId) {
    const response = await fetch(`${WORLD_API_BASE}/v2/types/${encodeURIComponent(typeId)}`, {
        headers: { accept: 'application/json' }
    });

    if (!response.ok) {
        throw new Error(`World API lookup failed for ${typeId}`);
    }

    return response.json();
}

export async function machineFromInspection(inspection, walletAddress, system, typeCache) {
    const object = inspection.object;
    const rootType = String(object?.type || object?.content?.type || '');
    const broadType = extractMachineTypeLabel(rootType);

    const fields = object?.content?.fields || object?.fields || {};
    const machineTypeId = String(fields?.type_id || '');
    const subtypeLabel = await resolveMachineSubtype(machineTypeId, broadType, typeCache);
    const customName = String(fields?.metadata?.fields?.name || '').trim();
    const itemId = String(fields?.key?.fields?.item_id || '');
    const displayName = customName || subtypeLabel || broadType || 'Machine';
    const status = String(fields?.status?.fields?.status?.variant || 'UNKNOWN');

    const lowered = `${broadType} ${subtypeLabel} ${rootType}`.toLowerCase();
    const looksMachineLike =
        /(assembly|storage|turret|printer|berth|factory|industry|refinery)/.test(lowered);

    if (!looksMachineLike && inspection.parsedInventories.length === 0) {
        return null;
    }

    return {
        id: inspection.rootId,
        walletAddress,
        system,
        displayName,
        customName,
        broadType,
        machineSubtype: subtypeLabel || broadType,
        machineTypeId,
        itemId,
        status,
        parsedInventories: inspection.parsedInventories,
        updatedAt: new Date().toISOString()
    };
}

async function resolveMachineSubtype(typeId, broadType, typeCache) {
    if (!typeId) return broadType;

    const cached = typeCache?.[typeId]?.info?.name;
    if (cached) return cached;

    try {
        const info = await fetchTypeInfo(typeId);
        return info?.name || broadType;
    } catch {
        return broadType;
    }
}