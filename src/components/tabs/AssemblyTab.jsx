import React from 'react';
import PlannerNode from '../PlannerNode.jsx';

function AssemblyTab({
    categories,
    selectedCategory,
    setSelectedCategory,
    searchText,
    setSearchText,
    selectedBlueprint,
    filteredBlueprints,
    persistSelectedBlueprintKey,
    plannerQuantity,
    persistPlannerQuantity,
    numberOrZero,
    addPlannerTarget,
    clearPlannerQueue,
    plannerViewportRef,
    handlePanStart,
    handlePanMove,
    handlePanEnd,
    plannerQueue,
    removePlannerNode,
    totalRawShortages
}) {
    return (
        <section className="panel assembly-panel">
            <div className="assembly-controls">
                <div className="field">
                    <label>Category</label>
                    <select
                        value={selectedCategory}
                        onChange={(event) => setSelectedCategory(event.target.value)}
                    >
                        {categories.map((category) => (
                            <option key={category} value={category}>
                                {category}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="field">
                    <label>Search</label>
                    <input
                        value={searchText}
                        onChange={(event) => setSearchText(event.target.value)}
                        placeholder="Search blueprint..."
                    />
                </div>

                <div className="field">
                    <label>Blueprint</label>
                    <select
                        value={selectedBlueprint?.blueprintKey || ''}
                        onChange={(event) => persistSelectedBlueprintKey(event.target.value)}
                    >
                        {filteredBlueprints.map((bp) => (
                            <option key={bp.blueprintKey} value={bp.blueprintKey}>
                                {bp.name} - {bp.machineLabel} - {bp.category}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="field small">
                    <label>Qty</label>
                    <input
                        type="number"
                        min="1"
                        value={plannerQuantity}
                        onChange={(event) =>
                            persistPlannerQuantity(
                                Math.max(1, numberOrZero(event.target.value) || 1)
                            )
                        }
                    />
                </div>

                <div className="row gap">
                    <button
                        className="small-button"
                        onClick={addPlannerTarget}
                        disabled={!selectedBlueprint}
                    >
                        Add to planner
                    </button>
                    <button className="small-button danger" onClick={clearPlannerQueue}>
                        Clear planner
                    </button>
                </div>
            </div>

            <div
                ref={plannerViewportRef}
                className="planner-viewport"
                onMouseDown={handlePanStart}
                onMouseMove={handlePanMove}
                onMouseUp={handlePanEnd}
                onMouseLeave={handlePanEnd}
            >
                <div className="planner-canvas">
                    {plannerQueue.length === 0 ? (
                        <div className="empty-state large">No assembly plan yet.</div>
                    ) : (
                        plannerQueue.map((node) => (
                            <PlannerNode
                                key={node.id}
                                node={node}
                                onRemove={removePlannerNode}
                            />
                        ))
                    )}
                </div>
            </div>

            {totalRawShortages.length > 0 ? (
                <div className="shortage-box">
                    <h3>Raw shortages</h3>
                    <ul>
                        {totalRawShortages.map((row, index) => (
                            <li key={`${row.typeId || row.name}-${index}`}>
                                {row.name} {row.typeId ? `(ID: ${row.typeId})` : ''} -{' '}
                                {row.quantity}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </section>
    );
}

export default AssemblyTab;