import React from 'react';
import { extractMachineTypeLabel } from '../../lib/sui.js';

function MachinesTab({
  machineLoadStatus,
  handleMachineFile,
  clearMachines,
  machineIdInput,
  setMachineIdInput,
  systemInput,
  setSystemInput,
  machineSystemDefault,
  loading,
  handleInspectMachine,
  handleSaveCurrentInspection,
  inspection,
  prettyJson,
  machines,
  handleOpenMachine,
  handleCopyMachineId,
  removeMachine
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Machines</h2>
        <div className="row gap">
          <label className="file-button">
            Load machine JSON
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleMachineFile}
              hidden
            />
          </label>
          <button className="small-button danger" onClick={clearMachines}>
            Clear all
          </button>
        </div>
      </div>

      <p className="status-line">{machineLoadStatus}</p>

      <div className="grid wide-left">
        <div className="stack">
          <div className="panel">
            <div className="controls-row">
              <label className="field">
                Assembly ID
                <input
                  value={machineIdInput}
                  onChange={(e) => setMachineIdInput(e.target.value)}
                  placeholder="0x..."
                />
              </label>

              <label className="field">
                System
                <input
                  value={systemInput}
                  onChange={(e) => setSystemInput(e.target.value)}
                  placeholder={machineSystemDefault}
                />
              </label>
            </div>

            <div className="button-row">
              <button
                onClick={() => void handleInspectMachine(false)}
                disabled={loading || !machineIdInput.trim()}
              >
                {loading ? 'Loading…' : 'Inspect'}
              </button>
              <button
                className="secondary"
                onClick={() => void handleInspectMachine(true)}
                disabled={loading || !machineIdInput.trim()}
              >
                {loading ? 'Loading…' : 'Inspect + save'}
              </button>
              <button
                className="secondary"
                onClick={() => void handleSaveCurrentInspection()}
                disabled={loading || !inspection}
              >
                Save current inspection
              </button>
            </div>
          </div>

          {inspection ? (
            <div className="panel">
              <h3>Inspection summary</h3>
              <div className="inspection-summary">
                <span>Root ID</span>
                <code className="smallwrap">{inspection.rootId}</code>
              </div>
              <div className="inspection-summary">
                <span>Dynamic fields</span>
                <strong>{inspection.dynamicFields?.length || 0}</strong>
              </div>
              <div className="inspection-summary">
                <span>Dynamic field objects</span>
                <strong>{inspection.dynamicFieldObjects?.length || 0}</strong>
              </div>
              <div className="inspection-summary">
                <span>Parsed inventories</span>
                <strong>{inspection.parsedInventories?.length || 0}</strong>
              </div>
              <div className="inspection-summary">
                <span>Linked IDs</span>
                <strong>{inspection.linkedIds?.length || 0}</strong>
              </div>

              {inspection.notes?.length ? (
                <div style={{ marginTop: 12 }}>
                  {inspection.notes.map((note, index) => (
                    <div key={index} className="hint">
                      {note}
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="json-wrap" style={{ marginTop: 12 }}>
                <pre>{prettyJson(inspection.object)}</pre>
              </div>
            </div>
          ) : null}
        </div>

        <div className="panel">
          <h3>Saved machines</h3>
          {machines.length === 0 ? (
            <div className="empty-state">No saved machines yet.</div>
          ) : (
            <div className="machine-list">
              {machines.map((machine) => (
                <div key={machine.id} className="machine-card">
                  <div className="machine-card-main">
                    <div className="machine-title">{machine.displayName}</div>
                    <div className="machine-meta">ID: {machine.id}</div>
                    <div className="machine-meta">
                      System: {machine.system || 'Unknown system'}
                    </div>
                    <div className="machine-meta">
                      Type:{' '}
                      {machine.machineSubtype ||
                        extractMachineTypeLabel(machine.broadType || '')}
                    </div>
                    <div className="machine-meta">
                      Inventories: {(machine.parsedInventories || []).length}
                    </div>
                  </div>

                  <div className="button-col">
                    <button
                      className="small-button secondary"
                      onClick={() => handleOpenMachine(machine)}
                    >
                      Open
                    </button>
                    <button
                      className="small-button secondary"
                      onClick={() => handleCopyMachineId(machine.id)}
                    >
                      Copy ID
                    </button>
                    <button
                      className="small-button danger"
                      onClick={() => removeMachine(machine.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default MachinesTab;