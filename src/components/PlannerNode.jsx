import React, { useState } from 'react';

// ── STATUS COLOUR ───────────────────────────────────────────────────────────
function getStatusClass(node) {
    if (!node.children?.length) {
        if (node.quantityToCraft > 0) return 'node-status--shortage';
        return 'node-status--ok';
    }
    return 'node-status--craft';
}

// ── ALTERNATIVE PATH BADGE ──────────────────────────────────────────────────
function AltPaths({ alts }) {
    const [expanded, setExpanded] = useState(false);
    if (!alts?.length) return null;

    return (
        <div className="node-alts">
            <button
                className="node-alts-btn"
                onClick={(e) => { e.stopPropagation(); setExpanded(x => !x); }}
            >
                {expanded ? '▼' : '▶'} {alts.length} ALT PATH{alts.length > 1 ? 'S' : ''}
            </button>
            {expanded && (
                <div className="node-alts-list">
                    {alts.map((alt) => (
                        <div key={alt.blueprintKey} className="node-alt-item">
                            <span className="node-alt-name">{alt.name}</span>
                            {alt.machineLabel && (
                                <span className="node-alt-machine">{alt.machineLabel}</span>
                            )}
                            {alt.category && (
                                <span className="node-alt-cat">{alt.category}</span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── PLANNER NODE ────────────────────────────────────────────────────────────
export default function PlannerNode({ node, onRemove, depth = 0 }) {
    const children = Array.isArray(node?.children) ? node.children : [];
    const alts = node?.alternativeBlueprints || [];
    const isRecipe = node?.mode === 'recipe';
    const isRoot = depth === 0;
    const isLeaf = children.length === 0;
    const isRaw = isLeaf && (node?.machineLabel === 'Raw resource' || node?.machineLabel === 'Raw ingredient');
    const isCycle = node?.machineLabel === 'Cycle blocked';
    const statusClass = getStatusClass(node);

    // Parse machine label — strip the "Assembly - " prefix for display
    const machineRaw = node?.machineLabel || '';
    const machineName = machineRaw.startsWith('Assembly - ')
        ? machineRaw.slice('Assembly - '.length)
        : machineRaw;

    // Build a summary of what goes INTO this node (its children = inputs)
    const inputSummary = children.slice(0, 4).map(c => c.name).join(', ');
    const inputOverflow = children.length > 4 ? ` +${children.length - 4} more` : '';

    return (
        <div
            className={[
                'planner-tree-node',
                children.length ? 'has-children' : 'is-leaf',
                isRecipe ? 'is-recipe' : 'is-planner',
                isRoot ? 'is-root' : '',
            ].join(' ')}
        >
            {/* CHILD NODES (rendered left of this card) */}
            {children.length > 0 && (
                <div className={['planner-tree-children', children.length === 1 ? 'single-child' : ''].join(' ')}>
                    {children.map((child) => (
                        <div key={child.id} className="planner-tree-child">
                            <PlannerNode node={child} onRemove={onRemove} depth={depth + 1} />
                        </div>
                    ))}
                </div>
            )}

            {/* NODE CARD */}
            <div className={`planner-node-card ${statusClass} ${isRaw ? 'node-raw' : ''} ${isCycle ? 'node-cycle' : ''}`}>
                {/* Connector ports */}
                {children.length > 0 && <span className="planner-port planner-port-in" />}
                {!isRoot && <span className="planner-port planner-port-out" />}

                {/* Header */}
                <div className="planner-node-header">
                    <div className="planner-node-title">{node?.name || 'Unknown'}</div>
                    {isRoot && onRemove && (
                        <button
                            className="planner-node-remove"
                            onClick={() => onRemove(node.id)}
                            title="Remove from planner"
                        >✕</button>
                    )}
                </div>

                {/* Machine / type row */}
                <div className="node-machine-row">
                    {isRaw ? (
                        <span className="node-machine-tag node-machine-raw">⬡ RAW MATERIAL</span>
                    ) : isCycle ? (
                        <span className="node-machine-tag node-machine-cycle">⚠ CYCLE BLOCKED</span>
                    ) : (
                        <span className="node-machine-tag">{machineName || 'Assembler'}</span>
                    )}
                    {isRecipe && <span className="node-recipe-tag">PREVIEW</span>}
                </div>

                {/* Stats grid */}
                <div className="planner-node-stat-grid">
                    <div>
                        <span>NEED</span>
                        <strong>{node?.quantityNeeded ?? 0}</strong>
                    </div>
                    <div>
                        <span>OWN</span>
                        <strong className={node?.owned > 0 ? 'stat-owned' : ''}>{node?.owned ?? 0}</strong>
                    </div>
                    <div>
                        <span>USE</span>
                        <strong>{node?.useOwned ?? 0}</strong>
                    </div>
                    <div>
                        <span>{children.length ? 'CRAFT' : 'MISSING'}</span>
                        <strong className={node?.quantityToCraft > 0 && !children.length ? 'stat-missing' : ''}>
                            {node?.quantityToCraft ?? 0}
                        </strong>
                    </div>
                    {node?.runs > 0 && (
                        <div>
                            <span>RUNS</span>
                            <strong>{node.runs}</strong>
                        </div>
                    )}
                </div>

                {/* Input summary (what materials feed this node) */}
                {inputSummary && (
                    <div className="node-inputs-row">
                        <span className="node-inputs-label">INPUTS</span>
                        <span className="node-inputs-list">{inputSummary}{inputOverflow}</span>
                    </div>
                )}

                {/* Type ID (subtle, only when useful) */}
                {node?.typeId && !isRaw && (
                    <div className="node-typeid">ID {node.typeId}</div>
                )}

                {/* Alternative paths */}
                <AltPaths alts={alts} />
            </div>
        </div>
    );
}
