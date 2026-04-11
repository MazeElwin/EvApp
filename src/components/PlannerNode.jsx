import React from 'react';

function PlannerNode({ node, onRemove, depth = 0 }) {
    const children = Array.isArray(node?.children) ? node.children : [];
    const alternativeCount = node?.alternativeBlueprints?.length || 0;
    const isRecipe = node?.mode === 'recipe';
    const isRoot = depth === 0;

    return (
        <div
            className={[
                'planner-tree-node',
                children.length ? 'has-children' : 'is-leaf',
                isRecipe ? 'is-recipe' : 'is-planner',
                isRoot ? 'is-root' : ''
            ].join(' ')}
        >
            {children.length > 0 ? (
                <div
                    className={[
                        'planner-tree-children',
                        children.length === 1 ? 'single-child' : ''
                    ].join(' ')}
                >
                    {children.map((child) => (
                        <div key={child.id} className="planner-tree-child">
                            <PlannerNode node={child} onRemove={onRemove} depth={depth + 1} />
                        </div>
                    ))}
                </div>
            ) : null}

            <div className="planner-node-card">
                {children.length > 0 ? (
                    <span className="planner-port planner-port-in" />
                ) : null}

                {!isRoot ? (
                    <span className="planner-port planner-port-out" />
                ) : null}

                <div className="planner-node-header">
                    <div className="planner-node-title">{node?.name || 'Unknown'}</div>

                    {isRoot && onRemove ? (
                        <button
                            className="small-button danger planner-node-remove"
                            onClick={() => onRemove(node.id)}
                        >
                            Remove
                        </button>
                    ) : null}
                </div>

                {node?.typeId ? (
                    <div className="planner-node-subtitle">ID: {node.typeId}</div>
                ) : null}

                <div className="planner-node-machine">{node?.machineLabel || 'Assembly'}</div>

                <div className="planner-node-stat-grid">
                    <div>
                        <span>Need</span>
                        <strong>{node?.quantityNeeded ?? 0}</strong>
                    </div>
                    <div>
                        <span>Own</span>
                        <strong>{node?.owned ?? 0}</strong>
                    </div>
                    <div>
                        <span>Use</span>
                        <strong>{node?.useOwned ?? 0}</strong>
                    </div>
                    <div>
                        <span>{children.length ? 'Craft' : 'Missing'}</span>
                        <strong>{node?.quantityToCraft ?? 0}</strong>
                    </div>
                    {node?.runs ? (
                        <div>
                            <span>Runs</span>
                            <strong>{node.runs}</strong>
                        </div>
                    ) : null}
                </div>

                <div className="planner-node-badges">
                    {isRecipe ? (
                        <div className="planner-node-badge">Recipe preview</div>
                    ) : null}

                    {alternativeCount > 0 ? (
                        <div className="planner-node-badge secondary">
                            Alt paths: {alternativeCount}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

export default PlannerNode;