import React from 'react';

function WalletTab({
  walletLoadStatus,
  handleWalletFile,
  saveWalletFile,
  walletAddress,
  setWalletAddress,
  network,
  setNetwork,
  loading,
  handleFetchWallet,
  walletObjects,
  setMachineIdInput,
  setActiveTab,
  walletSelectedJson,
  setWalletSelectedJson,
  prettyJson
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Wallet</h2>
        <div className="row gap">
          <label className="file-button">
            Load wallet JSON
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleWalletFile}
              hidden
            />
          </label>
          <button
            className="small-button"
            onClick={saveWalletFile}
            disabled={!walletAddress.trim()}
          >
            Save wallet file
          </button>
        </div>
      </div>

      <p className="status-line">{walletLoadStatus}</p>

      <div className="grid cols-2">
        <div className="panel">
          <div className="field">
            <label>Network</label>
            <select value={network} onChange={(e) => setNetwork(e.target.value)}>
              <option value="testnet">testnet</option>
              <option value="mainnet">mainnet</option>
              <option value="devnet">devnet</option>
            </select>
          </div>

          <div className="field">
            <label>Full wallet address</label>
            <input
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              placeholder="0x..."
            />
          </div>

          <div className="button-row">
            <button
              onClick={() => void handleFetchWallet()}
              disabled={loading || !walletAddress.trim()}
            >
              {loading ? 'Loading…' : 'Fetch wallet objects'}
            </button>
          </div>

          <div className="panel" style={{ marginTop: 12 }}>
            <div className="key-value">
              <span>Saved wallet</span>
              <code className="smallwrap">{walletAddress || '—'}</code>
            </div>
            <div className="key-value">
              <span>Network</span>
              <code>{network}</code>
            </div>
            <div className="key-value">
              <span>Objects fetched</span>
              <code>{walletObjects.length}</code>
            </div>
          </div>
        </div>

        <div className="panel">
          <h3>Wallet objects</h3>
          {walletObjects.length === 0 ? (
            <div className="empty-state">No wallet objects fetched yet.</div>
          ) : (
            <div className="table-like">
              {walletObjects.slice(0, 50).map((obj, index) => {
                const data = obj?.data || obj;
                const objectId = String(data?.objectId || '');
                const type = String(data?.type || data?.content?.type || '');

                return (
                  <div key={`${objectId}-${index}`} className="machine-card">
                    <div className="machine-card-main">
                      <div className="machine-title">{objectId || 'Unknown object'}</div>
                      <div className="machine-meta break">{type || 'No type'}</div>
                    </div>

                    <div className="button-col">
                      <button
                        className="small-button secondary"
                        onClick={() => {
                          setMachineIdInput(objectId);
                          setActiveTab('Machines');
                        }}
                      >
                        Use ID
                      </button>
                      <button
                        className="small-button secondary"
                        onClick={() => setWalletSelectedJson(prettyJson(obj))}
                      >
                        View JSON
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {walletSelectedJson ? (
        <div className="panel">
          <h3>Selected JSON</h3>
          <div className="json-wrap">
            <pre>{walletSelectedJson}</pre>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default WalletTab;