import React from 'react';

function PlannerNode({ node, onRemove, depth = 0 }) {
  return (
    <div className={`planner-row depth-${depth}`}>
      <div className="planner-row-children">
        {(node.children || []).map((child) => (
          <PlannerNode key={child.id} node={child} depth={depth + 1} />
        ))}
      </div>

      <div className="planner-node">
        <div className="planner-node-title">{node.name}</div>
        {node.typeId ? <div className="planner-node-subtitle">ID: {node.typeId}</div> : null}

        <div className="planner-node-machine">{node.machineLabel}</div>

        <div className="planner-node-stats">
          <div>Need: {node.quantityNeeded}</div>
          <div>Own: {node.owned}</div>
          <div>Use: {node.useOwned}</div>
          <div>{node.children?.length ? 'Craft' : 'Missing'}: {node.quantityToCraft}</div>
          {node.runs ? <div>Runs: {node.runs}</div> : null}
        </div>

        {depth === 0 && onRemove ? (
          <button className="small-button danger" onClick={() => onRemove(node.id)}>
            Remove
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default PlannerNode;