import { useCallback, useEffect, useState } from 'react';
import { fetchTypeInfo } from '../lib/sui.js';
import { loadStoredJson, STORAGE_KEYS } from '../lib/appHelpers.js';

export function useTypeCacheController({ machines }) {
    const [typeCache, setTypeCache] = useState(() =>
        loadStoredJson(STORAGE_KEYS.typeCache, {})
    );

    useEffect(() => {
        window.localStorage.setItem(STORAGE_KEYS.typeCache, JSON.stringify(typeCache));
    }, [typeCache]);

    const resolveTypeIds = useCallback(
        async (typeIds) => {
            const unique = Array.from(new Set((typeIds || []).filter(Boolean).map(String)));
            const pending = unique.filter((id) => !typeCache[id]);

            if (!pending.length) {
                return;
            }

            const updates = {};

            for (const id of pending) {
                try {
                    const info = await fetchTypeInfo(id);
                    updates[id] = {
                        info: {
                            id: String(info?.id || id),
                            name: String(info?.name || ''),
                            categoryName: String(
                                info?.categoryName || info?.category_name || ''
                            ),
                            groupName: String(info?.groupName || info?.group_name || '')
                        },
                        updatedAt: new Date().toISOString()
                    };
                } catch {
                    updates[id] = {
                        info: {
                            id: String(id),
                            name: '',
                            categoryName: '',
                            groupName: ''
                        },
                        updatedAt: new Date().toISOString()
                    };
                }
            }

            setTypeCache((current) => ({ ...current, ...updates }));
        },
        [typeCache]
    );

    useEffect(() => {
        const ids = new Set();

        for (const machine of machines) {
            if (machine.machineTypeId) {
                ids.add(String(machine.machineTypeId));
            }

            for (const inv of machine.parsedInventories || []) {
                for (const row of inv.items || []) {
                    if (row.typeId) {
                        ids.add(String(row.typeId));
                    }
                }
            }
        }

        if (ids.size) {
            void resolveTypeIds(Array.from(ids));
        }
    }, [machines, resolveTypeIds]);

    return {
        typeCache,
        resolveTypeIds
    };
}