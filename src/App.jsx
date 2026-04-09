import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';

const SHEET_LINK = 'https://docs.google.com/spreadsheets/d/1qA4v3ush0_zD3vtMKzmhC0KStUng2LK7/edit?usp=sharing&ouid=112953742266775020065&rtpof=true&sd=true';
const SHEET_ID = '1qA4v3ush0_zD3vtMKzmhC0KStUng2LK7';
const DEFAULT_XLSX_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;

const KEYS = {
  wallet: 'ef_wallet_address_v16',
  machines: 'ef_saved_machines_v16',
  blueprints: 'ef_blueprints_v16',
  blueprintMeta: 'ef_blueprint_meta_v16',
  system: 'ef_planner_system_v16',
  queue: 'ef_planner_queue_v16',
  typeNames: 'ef_type_names_v16',
};

const TABS = ['Wallet', 'Machines', 'Inventory', 'Assembly line', 'Codes', 'Other'];

const asArray = (v) => Array.isArray(v) ? v : [];
const asObject = (v) => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
function safeJsonParse(value, fallback) { try { return JSON.parse(value); } catch { return fallback; } }
function extractLeafType(fullType) { const p = String(fullType || '').split('::'); return p[p.length - 1] || String(fullType || ''); }
function titleCaseLoose(value) { return String(value || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, s => s.toUpperCase()).trim(); }
function normalizeName(value) { return String(value || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim(); }
function numberOrZero(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function getSheetIdFromUrl(url) { const m = String(url || '').match(/\/d\/([a-zA-Z0-9-_]+)/); return m ? m[1] : ''; }
function buildXlsxUrl(url) { const id = getSheetIdFromUrl(url) || SHEET_ID; return `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`; }

function readWorkbookRows(workbook, sheetName) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
}
function findColumn(row, candidates) {
  const keys = Object.keys(row || {});
  for (const candidate of candidates) {
    const hit = keys.find(k => normalizeName(k) === normalizeName(candidate));
    if (hit) return hit;
  }
  for (const candidate of candidates) {
    const hit = keys.find(k => normalizeName(k).includes(normalizeName(candidate)));
    if (hit) return hit;
  }
  return null;
}
function inferCategory(itemName, groupName) {
  const text = `${itemName || ''} ${groupName || ''}`.toLowerCase();
  if (/(ammo|charge|gyrojet)/.test(text)) return 'Ammo';
  if (/(frame)/.test(text)) return 'Frames';
  if (/(ship|protocol|carom|chumaq|embark|sojourn)/.test(text)) return 'Ships';
  if (/(coilgun|laser|plasma|disintegrator|howitzer|extractor|weapon)/.test(text)) return 'Weapons';
  if (/(weave|alloy|composite|ore|fuel|metals|grains|veins|tar|coolant|palladium|sulfide|nodules|circuit)/.test(text)) return 'Materials';
  if (/(armor|shield|array|afterburner|cargo|brace|generator|field|plates|sequencer|restorer|cd\d+)/.test(text)) return 'Modules';
  return 'Other';
}
function uniqueBlueprintKey(row, index, itemName, outputTypeId, machineLabel, category) {
  return ['bp', outputTypeId || 'na', normalizeName(itemName) || 'unnamed', normalizeName(machineLabel) || 'nomachine', normalizeName(category), index].join('-');
}

function parseWorkbookToBlueprints(workbook) {
  const blueRows = readWorkbookRows(workbook, 'Blueprints');
  const matRows = readWorkbookRows(workbook, 'Materials');
  const productRows = readWorkbookRows(workbook, 'Products');

  const bpNameCol = blueRows[0] ? findColumn(blueRows[0], ['Name', 'Blueprint Name', 'Item Name']) : null;
  const bpTypeCol = blueRows[0] ? findColumn(blueRows[0], ['Type ID', 'TypeID', 'typeID']) : null;
  const bpGroupCol = blueRows[0] ? findColumn(blueRows[0], ['Group', 'Group Name']) : null;
  const bpTimeCol = blueRows[0] ? findColumn(blueRows[0], ['Build Time', 'Time', 'Manufacturing Time']) : null;
  const bpLimitCol = blueRows[0] ? findColumn(blueRows[0], ['Max Production Limit', 'Production Limit']) : null;
  const bpMachineCol = blueRows[0] ? findColumn(blueRows[0], ['Machine', 'Factory', 'Building', 'Built In']) : null;
  const bpCategoryCol = blueRows[0] ? findColumn(blueRows[0], ['Category']) : null;

  const materialsNameCol = matRows[0] ? findColumn(matRows[0], ['Blueprint Name', 'Name', 'Item Name']) : null;
  const materialsTypeCol = matRows[0] ? findColumn(matRows[0], ['Blueprint Type ID', 'TypeID', 'Type ID']) : null;
  const matItemCol = matRows[0] ? findColumn(matRows[0], ['Material Name', 'Material', 'Input Name', 'Name']) : null;
  const matItemTypeCol = matRows[0] ? findColumn(matRows[0], ['Material Type ID', 'Input Type ID', 'TypeID']) : null;
  const matQtyCol = matRows[0] ? findColumn(matRows[0], ['Quantity', 'Qty']) : null;

  const prodNameCol = productRows[0] ? findColumn(productRows[0], ['Blueprint Name', 'Name', 'Item Name']) : null;
  const prodTypeCol = productRows[0] ? findColumn(productRows[0], ['Blueprint Type ID', 'TypeID', 'Type ID']) : null;
  const prodItemCol = productRows[0] ? findColumn(productRows[0], ['Product Name', 'Product', 'Output Name', 'Name']) : null;
  const prodItemTypeCol = productRows[0] ? findColumn(productRows[0], ['Product Type ID', 'Output Type ID', 'TypeID']) : null;
  const prodQtyCol = productRows[0] ? findColumn(productRows[0], ['Quantity', 'Qty']) : null;

  const list = [];
  blueRows.forEach((row, index) => {
    const itemName = String(row[bpNameCol] || '').trim();
    if (!itemName) return;
    const outputTypeId = numberOrZero(row[bpTypeCol]);
    const groupName = String(row[bpGroupCol] || '').trim();
    const machineLabel = String(row[bpMachineCol] || '').trim();
    const durationSeconds = numberOrZero(row[bpTimeCol]);
    const maxProductionLimit = numberOrZero(row[bpLimitCol]);
    const category = String(row[bpCategoryCol] || '').trim() || inferCategory(itemName, groupName);

    const matchedMaterials = (outputTypeId
      ? matRows.filter(m => numberOrZero(m[materialsTypeCol]) === outputTypeId || String(m[materialsNameCol] || '').trim() === itemName)
      : matRows.filter(m => String(m[materialsNameCol] || '').trim() === itemName)
    ).map(m => ({
      name: String(m[matItemCol] || '').trim(),
      typeId: numberOrZero(m[matItemTypeCol]),
      quantity: numberOrZero(m[matQtyCol]),
    })).filter(m => m.name);

    const matchedProducts = (outputTypeId
      ? productRows.filter(p => numberOrZero(p[prodTypeCol]) === outputTypeId || String(p[prodNameCol] || '').trim() === itemName)
      : productRows.filter(p => String(p[prodNameCol] || '').trim() === itemName)
    ).map(p => ({
      name: String(p[prodItemCol] || itemName).trim(),
      typeId: numberOrZero(p[prodItemTypeCol]) || outputTypeId,
      quantity: numberOrZero(p[prodQtyCol]) || 1,
    })).filter(p => p.name);

    const output = matchedProducts[0] || { name: itemName, typeId: outputTypeId, quantity: 1 };

    list.push({
      blueprintKey: uniqueBlueprintKey(row, index, itemName, outputTypeId, machineLabel || groupName, category),
      name: itemName,
      category,
      group: groupName,
      machineLabel: machineLabel || '',
      output,
      products: matchedProducts.length ? matchedProducts : [output],
      materials: matchedMaterials,
      durationSeconds,
      maxProductionLimit,
      sheetSource: 'Google Sheet',
    });
  });
  return list;
}

function parseMachineRawJson(text, existingSystem) {
  const obj = safeJsonParse(text, null);
  if (!obj || !obj.content?.fields) throw new Error('Invalid machine JSON');
  const fields = obj.content.fields;
  const metadataName = fields.metadata?.fields?.name || '';
  const typeLeaf = titleCaseLoose(extractLeafType(obj.type));
  const machineTypeId = String(fields.type_id || '').trim();
  const itemId = String(fields.key?.fields?.item_id || '').trim();
  return {
    id: obj.objectId,
    objectType: obj.type,
    typeLeaf,
    typeId: machineTypeId,
    itemId,
    customName: metadataName,
    displayName: metadataName || typeLeaf,
    system: existingSystem || 'IQF-RG7',
    rawJson: text,
    inventory: [],
  };
}
function parseInventoryRows(rawText) {
  const obj = safeJsonParse(rawText, null);
  const contents =
    obj?.content?.fields?.value?.fields?.items?.fields?.contents ||
    obj?.content?.fields?.items?.fields?.contents ||
    [];
  return contents.map(entry => {
    const f = entry?.fields || {};
    const v = f.value?.fields || {};
    return {
      typeId: String(f.key || v.type_id || '').trim(),
      itemId: String(v.item_id || '').trim(),
      quantity: numberOrZero(v.quantity),
      volume: numberOrZero(v.volume),
      name: '',
    };
  }).filter(x => x.typeId);
}

function aggregateInventory(machines, systemFilter, typeNames) {
  const totals = new Map();
  for (const machine of asArray(machines)) {
    if (systemFilter !== 'All systems' && machine.system !== systemFilter) continue;
    for (const row of asArray(machine.inventory)) {
      const key = String(row.typeId || normalizeName(row.name));
      const prev = totals.get(key) || { key, typeId: row.typeId || '', name: row.name || typeNames[row.typeId] || '', quantity: 0, sources: [] };
      prev.quantity += numberOrZero(row.quantity);
      if (!prev.name && row.name) prev.name = row.name;
      if (!prev.name && row.typeId && typeNames[row.typeId]) prev.name = typeNames[row.typeId];
      prev.sources.push(machine.displayName);
      totals.set(key, prev);
    }
  }
  return [...totals.values()].sort((a, b) => (a.name || a.typeId).localeCompare(b.name || b.typeId));
}
function chooseBlueprintVariants(blueprints, category, query) {
  return asArray(blueprints).filter(bp => {
    const catOk = !category || category === 'All' || bp.category === category;
    const queryOk = !query || normalizeName(bp.name).includes(normalizeName(query));
    return catOk && queryOk;
  }).sort((a, b) => a.name.localeCompare(b.name));
}
function buildStockLookup(invTotals) {
  const map = new Map();
  for (const row of invTotals) {
    if (row.typeId) map.set(`type:${row.typeId}`, row.quantity);
    if (row.name) map.set(`name:${normalizeName(row.name)}`, row.quantity);
  }
  return map;
}
function machineLabelForBlueprint(bp) {
  const machine = String(bp.machineLabel || '').trim();
  return machine ? `Assembly - ${machine}` : 'Assembly - Unknown';
}
function createPlanTree(targetBp, qty, bpByName, stockLookup, allocations) {
  const outputQty = numberOrZero(targetBp.output.quantity) || 1;
  const neededOutputs = qty;
  const nodeKey = targetBp.output.typeId ? `type:${targetBp.output.typeId}` : `name:${normalizeName(targetBp.output.name)}`;
  const available = stockLookup.get(nodeKey) || 0;
  const alreadyAllocated = allocations.get(nodeKey) || 0;
  const free = Math.max(0, available - alreadyAllocated);
  const useOwned = Math.min(free, neededOutputs);
  allocations.set(nodeKey, alreadyAllocated + useOwned);
  const remaining = Math.max(0, neededOutputs - useOwned);
  const runs = remaining > 0 ? Math.ceil(remaining / outputQty) : 0;

  const children = runs > 0 ? targetBp.materials.map((mat, idx) => {
    const childBp = bpByName.get(normalizeName(mat.name));
    const childQty = numberOrZero(mat.quantity) * runs;
    if (childBp) return createPlanTree(childBp, childQty, bpByName, stockLookup, allocations);
    const childKey = mat.typeId ? `type:${mat.typeId}` : `name:${normalizeName(mat.name)}`;
    const childAvailable = stockLookup.get(childKey) || 0;
    const childAllocated = allocations.get(childKey) || 0;
    const childFree = Math.max(0, childAvailable - childAllocated);
    const childUse = Math.min(childFree, childQty);
    allocations.set(childKey, childAllocated + childUse);
    return {
      id: `raw-${childKey}-${idx}-${childQty}`,
      name: mat.name || `Type ${mat.typeId}`,
      typeId: mat.typeId || '',
      machineLabel: 'Raw resource',
      quantityNeeded: childQty,
      owned: childAvailable,
      useOwned: childUse,
      quantityToCraft: Math.max(0, childQty - childUse),
      runs: 0,
      children: [],
    };
  }) : [];

  return {
    id: `${targetBp.blueprintKey}-${qty}`,
    name: targetBp.name,
    typeId: targetBp.output.typeId || '',
    machineLabel: machineLabelForBlueprint(targetBp),
    quantityNeeded: neededOutputs,
    owned: available,
    useOwned,
    quantityToCraft: remaining,
    runs,
    children,
  };
}
function collectRawShortages(node, out = []) {
  if (!node.children?.length && node.machineLabel === 'Raw resource' && node.quantityToCraft > 0) out.push({ name: node.name, quantity: node.quantityToCraft });
  for (const child of node.children || []) collectRawShortages(child, out);
  return out;
}

function PlannerNode({ node, depth = 0, onRemove, typeNames }) {
  const displayName = node.name || typeNames[node.typeId] || (node.typeId ? `Type ${node.typeId}` : 'Unknown item');
  return (
    <div className="planner-row">
      {node.children?.length ? (
        <div className="planner-children">
          {node.children.map((child, index) => (
            <div className="planner-edge-wrap" key={child.id + '-' + index}>
              <PlannerNode node={child} depth={depth + 1} typeNames={typeNames} />
              <div className="planner-edge" />
            </div>
          ))}
        </div>
      ) : null}
      <div className="planner-node">
        <div className="planner-node-title-row">
          <div className="planner-node-title">{displayName}</div>
          {depth === 0 && onRemove ? <button className="mini-btn danger" onClick={onRemove}>Remove</button> : null}
        </div>
        {node.typeId ? <div className="planner-node-id">ID: {node.typeId}</div> : null}
        <div className="planner-node-sub">{node.machineLabel}</div>
        <div className="planner-stats">
          <div>Need: <strong>{node.quantityNeeded}</strong></div>
          <div>Own: <strong>{node.owned}</strong></div>
          <div>Use: <strong>{node.useOwned}</strong></div>
          <div>{node.children?.length ? 'Craft' : 'Missing'}: <strong>{node.quantityToCraft}</strong></div>
          {node.runs ? <div>Runs: <strong>{node.runs}</strong></div> : null}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState('Assembly line');
  const [wallet, setWallet] = useState(localStorage.getItem(KEYS.wallet) || '');
  const [machines, setMachines] = useState(asArray(safeJsonParse(localStorage.getItem(KEYS.machines), [])));
  const [machineSystem, setMachineSystem] = useState('IQF-RG7');
  const [machineJson, setMachineJson] = useState('');
  const [inventoryJson, setInventoryJson] = useState('');
  const [blueprints, setBlueprints] = useState(asArray(safeJsonParse(localStorage.getItem(KEYS.blueprints), [])));
  const [blueprintMeta, setBlueprintMeta] = useState(asObject(safeJsonParse(localStorage.getItem(KEYS.blueprintMeta), { source: SHEET_LINK, loadedAt: '' })));
  const [typeNames, setTypeNames] = useState(asObject(safeJsonParse(localStorage.getItem(KEYS.typeNames), {})));
  const [codeMessage, setCodeMessage] = useState('');
  const [machineMessage, setMachineMessage] = useState('');
  const [plannerSystem, setPlannerSystem] = useState(localStorage.getItem(KEYS.system) || 'All systems');
  const [queue, setQueue] = useState(asArray(safeJsonParse(localStorage.getItem(KEYS.queue), [])));
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedBlueprintKey, setSelectedBlueprintKey] = useState('');
  const [selectedQty, setSelectedQty] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef({ down: false, x: 0, y: 0, ox: 0, oy: 0 });

  useEffect(() => { localStorage.setItem(KEYS.wallet, wallet); }, [wallet]);
  useEffect(() => { localStorage.setItem(KEYS.machines, JSON.stringify(asArray(machines))); }, [machines]);
  useEffect(() => { localStorage.setItem(KEYS.blueprints, JSON.stringify(asArray(blueprints))); }, [blueprints]);
  useEffect(() => { localStorage.setItem(KEYS.blueprintMeta, JSON.stringify(asObject(blueprintMeta))); }, [blueprintMeta]);
  useEffect(() => { localStorage.setItem(KEYS.typeNames, JSON.stringify(asObject(typeNames))); }, [typeNames]);
  useEffect(() => { localStorage.setItem(KEYS.system, plannerSystem); }, [plannerSystem]);
  useEffect(() => { localStorage.setItem(KEYS.queue, JSON.stringify(asArray(queue))); }, [queue]);

  async function fetchTypeName(typeId) {
    if (!typeId || typeNames[typeId]) return;
    try {
      const res = await fetch(`https://world-api-utopia.uat.pub.evefrontier.com/v2/types/${typeId}`);
      if (!res.ok) return;
      const data = await res.json();
      const name = data?.name || '';
      if (name) setTypeNames(prev => ({ ...prev, [typeId]: name }));
    } catch {}
  }

  async function loadBlueprintsFromSheet(url = blueprintMeta.source || SHEET_LINK, silent = false) {
    if (!silent) setCodeMessage('Loading blueprints from Google Sheet…');
    const xlsxUrl = buildXlsxUrl(url || SHEET_LINK || DEFAULT_XLSX_URL);
    const resp = await fetch(xlsxUrl);
    if (!resp.ok) throw new Error(`Failed to load sheet: ${resp.status}`);
    const buffer = await resp.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const parsed = parseWorkbookToBlueprints(workbook);
    setBlueprints(parsed);
    setBlueprintMeta({ source: url || SHEET_LINK, loadedAt: new Date().toISOString(), count: parsed.length });
    if (!silent) setCodeMessage(`Loaded ${parsed.length} blueprints from sheet.`);
  }

  useEffect(() => {
    if (!blueprints.length) {
      loadBlueprintsFromSheet(SHEET_LINK, true).catch(err => setCodeMessage(String(err.message || err)));
    }
  }, []);

  useEffect(() => {
    const pending = [];
    aggregateInventory(machines, 'All systems', typeNames).forEach(row => {
      if (!row.name && row.typeId) pending.push(row.typeId);
    });
    pending.slice(0, 50).forEach(fetchTypeName);
  }, [machines]);

  const categories = useMemo(() => ['All', ...new Set(asArray(blueprints).map(bp => bp.category || 'Other'))], [blueprints]);
  const visibleBlueprints = useMemo(() => chooseBlueprintVariants(blueprints, selectedCategory, search), [blueprints, selectedCategory, search]);
  const systems = useMemo(() => ['All systems', ...new Set(asArray(machines).map(m => m.system || 'IQF-RG7'))], [machines]);
  const inventoryTotals = useMemo(() => aggregateInventory(machines, plannerSystem, typeNames), [machines, plannerSystem, typeNames]);
  const bpByName = useMemo(() => {
    const map = new Map();
    asArray(blueprints).forEach(bp => { if (!map.has(normalizeName(bp.name))) map.set(normalizeName(bp.name), bp); });
    return map;
  }, [blueprints]);
  const stockLookup = useMemo(() => buildStockLookup(inventoryTotals), [inventoryTotals]);
  const queuedPlans = useMemo(() => {
    const allocations = new Map();
    return asArray(queue).map(q => {
      const bp = asArray(blueprints).find(x => x.blueprintKey === q.blueprintKey);
      return bp ? createPlanTree(bp, q.quantity, bpByName, stockLookup, allocations) : null;
    }).filter(Boolean);
  }, [queue, blueprints, bpByName, stockLookup]);

  function addMachine() {
    try {
      const parsed = parseMachineRawJson(machineJson, machineSystem);
      setMachines(prev => {
        const idx = prev.findIndex(x => x.id === parsed.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...parsed, inventory: next[idx].inventory || [] };
          return next;
        }
        return [...prev, parsed];
      });
      setMachineJson('');
      setMachineMessage('Machine saved.');
    } catch (err) {
      setMachineMessage(err.message || String(err));
    }
  }
  function attachInventory(machineId) {
    try {
      const rows = parseInventoryRows(inventoryJson);
      setMachines(prev => prev.map(m => m.id === machineId ? { ...m, inventory: rows } : m));
      rows.forEach(r => r.typeId && fetchTypeName(r.typeId));
      setInventoryJson('');
      setMachineMessage(`Attached ${rows.length} inventory rows.`);
    } catch (err) {
      setMachineMessage(err.message || String(err));
    }
  }
  function queueBlueprint() {
    const bp = asArray(blueprints).find(x => x.blueprintKey === selectedBlueprintKey);
    if (!bp) return;
    setQueue(prev => [...prev, { blueprintKey: bp.blueprintKey, quantity: Math.max(1, Number(selectedQty) || 1) }]);
  }
  function saveMachinesFile() {
    const blob = new Blob([JSON.stringify(asArray(machines), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'eve-frontier-machines.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function loadMachinesFile(ev) {
    const file = ev.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = asArray(safeJsonParse(String(reader.result || '[]'), []));
        setMachines(parsed);
        setMachineMessage(`Loaded ${parsed.length} machines from file.`);
      } catch (err) {
        setMachineMessage(`Load error: ${err.message || err}`);
      }
      ev.target.value = '';
    };
    reader.onerror = () => { setMachineMessage('Load error reading file.'); ev.target.value = ''; };
    reader.readAsText(file);
  }

  function onMouseDown(e) { dragRef.current = { down: true, x: e.clientX, y: e.clientY, ox: pan.x, oy: pan.y }; }
  function onMouseMove(e) { if (!dragRef.current.down) return; setPan({ x: dragRef.current.ox + (e.clientX - dragRef.current.x), y: dragRef.current.oy + (e.clientY - dragRef.current.y) }); }
  function onMouseUp() { dragRef.current.down = false; }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">EF Inventory App</div>
        <div className="tab-row">{TABS.map(name => <button key={name} className={`tab-btn ${tab===name?'active':''}`} onClick={() => setTab(name)}>{name}</button>)}</div>
      </header>
      <main className={`page ${tab === 'Assembly line' ? 'assembly-page' : ''}`}>
        {tab === 'Wallet' && <section className="panel"><h2>Wallet</h2><textarea className="mono-input" rows={5} value={wallet} onChange={e => setWallet(e.target.value)} /></section>}

        {tab === 'Machines' && (
          <div className="grid-two">
            <section className="panel">
              <h2>Add machine</h2>
              <label className="field-label">System</label>
              <input className="text-input" value={machineSystem} onChange={e => setMachineSystem(e.target.value)} />
              <label className="field-label">Machine raw JSON</label>
              <textarea className="mono-input" rows={12} value={machineJson} onChange={e => setMachineJson(e.target.value)} />
              <div className="button-row">
                <button className="primary-btn" onClick={addMachine}>Save machine</button>
                <button className="secondary-btn" onClick={saveMachinesFile}>Save machines file</button>
                <label className="secondary-btn file-btn">Load machines file<input type="file" accept="application/json" onChange={loadMachinesFile} hidden /></label>
              </div>
              <div className="status-text">{machineMessage}</div>
            </section>
            <section className="panel">
              <h2>Saved machines</h2>
              <div className="machine-list">
                {asArray(machines).map(machine => (
                  <div className="machine-card" key={machine.id}>
                    <div className="machine-title">{machine.displayName}</div>
                    <div className="machine-sub">{machine.typeLeaf} • Type ID {machine.typeId || '—'} • {machine.system}</div>
                    <div className="machine-id">{machine.id}</div>
                    <label className="field-label">Attach inventory JSON</label>
                    <textarea className="mono-input" rows={5} value={inventoryJson} onChange={e => setInventoryJson(e.target.value)} placeholder="Paste inventory JSON, then attach to this machine." />
                    <div className="button-row">
                      <button className="secondary-btn" onClick={() => attachInventory(machine.id)}>Attach inventory</button>
                      <button className="danger-btn" onClick={() => setMachines(prev => prev.filter(x => x.id !== machine.id))}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {tab === 'Inventory' && (
          <section className="panel">
            <h2>Inventory</h2>
            <select className="text-input small-select" value={plannerSystem} onChange={e => setPlannerSystem(e.target.value)}>
              {systems.map(sys => <option key={sys} value={sys}>{sys}</option>)}
            </select>
            <div className="table-wrap">
              <table className="grid-table">
                <thead><tr><th>Item</th><th>ID</th><th>Qty</th><th>Source machines</th></tr></thead>
                <tbody>
                  {inventoryTotals.map(row => (
                    <tr key={row.key}>
                      <td>{row.name || `Type ${row.typeId}`}</td>
                      <td>{row.typeId || '—'}</td>
                      <td>{row.quantity}</td>
                      <td>{[...new Set(row.sources)].join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'Assembly line' && (
          <div className="assembly-layout">
            <aside className="assembly-controls panel">
              <h2>Assembly line</h2>
              <label className="field-label">System</label>
              <select className="text-input small-select" value={plannerSystem} onChange={e => setPlannerSystem(e.target.value)}>
                {systems.map(sys => <option key={sys} value={sys}>{sys}</option>)}
              </select>
              <label className="field-label">Category</label>
              <select className="text-input small-select" value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              <label className="field-label">Search</label>
              <input className="text-input" value={search} onChange={e => setSearch(e.target.value)} />
              <label className="field-label">Item</label>
              <select className="text-input" value={selectedBlueprintKey} onChange={e => setSelectedBlueprintKey(e.target.value)}>
                <option value="">Select item…</option>
                {visibleBlueprints.map(bp => (
                  <option key={bp.blueprintKey} value={bp.blueprintKey}>{bp.name}</option>
                ))}
              </select>
              <label className="field-label">Qty</label>
              <input className="text-input small-select" type="number" min="1" value={selectedQty} onChange={e => setSelectedQty(e.target.value)} />
              <button className="primary-btn" onClick={queueBlueprint}>Queue</button>
              <div className="panel subtle">
                <div className="panel-title">Planner stock</div>
                <div className="table-mini">
                  {inventoryTotals.slice(0, 12).map(row => <div className="mini-row" key={row.key}><span>{row.name || `Type ${row.typeId}`}</span><strong>{row.quantity}</strong></div>)}
                </div>
              </div>
            </aside>

            <section className="assembly-canvas" onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
              <div className="assembly-stage" style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}>
                {queuedPlans.length ? queuedPlans.map((plan, idx) => (
                  <div className="queue-block" key={plan.id + '-' + idx}>
                    <PlannerNode node={plan} onRemove={() => setQueue(prev => prev.filter((_, i) => i !== idx))} typeNames={typeNames} />
                    <div className="panel subtle shortage-panel">
                      <div className="panel-title">Raw shortages</div>
                      {collectRawShortages(plan).length ? collectRawShortages(plan).map((r, i) => <div className="mini-row" key={r.name + i}><span>{r.name}</span><strong>{r.quantity}</strong></div>) : <div className="small-text">No raw shortage for this queue item.</div>}
                    </div>
                  </div>
                )) : <div className="empty-canvas">Queue an item to build the crafting flow.</div>}
              </div>
            </section>
          </div>
        )}

        {tab === 'Codes' && (
          <section className="panel">
            <h2>Codes</h2>
            <label className="field-label">Google Sheet link</label>
            <textarea className="mono-input" rows={4} value={blueprintMeta.source || SHEET_LINK} onChange={e => setBlueprintMeta(prev => ({ ...prev, source: e.target.value }))} />
            <div className="button-row"><button className="primary-btn" onClick={() => loadBlueprintsFromSheet(blueprintMeta.source || SHEET_LINK)}>Reload blueprints</button></div>
            <div className="status-text">{codeMessage}</div>
          </section>
        )}

        {tab === 'Other' && <section className="panel"><h2>Other</h2><p className="small-text">Reserved for future tools.</p></section>}
      </main>
    </div>
  );
}
