import React from 'react';
import PlannerNode from '../PlannerNode.jsx';


function normalizeName(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

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
    addRecipePreview,
    clearPlannerQueue,
    plannerViewportRef,
    handlePanStart,
    handlePanMove,
    handlePanEnd,
    plannerQueue,
    removePlannerNode,
    totalRawShortages
}) {
    const uniqueSuggestions = [];
    const seenNames = new Set();

    for (const bp of filteredBlueprints) {
        const key = normalizeName(bp.name);
        if (!key || seenNames.has(key)) {
            continue;
        }
        seenNames.add(key);
        uniqueSuggestions.push(bp.name);
    }

    function handleSearchChange(event) {
        const next = event.target.value;
        setSearchText(next);

        const exactMatch = filteredBlueprints.find(
            (bp) => normalizeName(bp.name) === normalizeName(next)
        );

        if (exactMatch) {
            persistSelectedBlueprintKey(exactMatch.blueprintKey);
        }
    }

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
                        onChange={handleSearchChange}
                        placeholder="Search blueprint..."
                        list="blueprint-search-suggestions"
                    />
                    <datalist id="blueprint-search-suggestions">
                        {uniqueSuggestions.map((name) => (
                            <option key={name} value={name} />
                        ))}
                    </datalist>
                </div>

                <div className="field">
                    <label>Blueprint</label>
                    <select
                        value={selectedBlueprint?.blueprintKey || ''}
                        onChange={(event) => persistSelectedBlueprintKey(event.target.value)}
                    >
                        {filteredBlueprints.map((bp) => (
                            <option key={bp.blueprintKey} value={bp.blueprintKey}>
                                {bp.name}
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

                    <button
                        className="small-button secondary"
                        onClick={addRecipePreview}
                        disabled={!selectedBlueprint}
                    >
                        Preview recipe
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
                                {row.name} {row.typeId ? `(ID: ${row.typeId})` : ''} - {row.quantity}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </section>
    );
}

export default AssemblyTab;