import React, { useState, useRef, useEffect, useCallback } from 'react';
import PlannerNode from '../PlannerNode.jsx';

function normalizeName(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// ── SMART SEARCH COMPONENT ──────────────────────────────────────────────────
function BlueprintSearch({
    blueprints,
    categories,
    selectedCategory,
    setSelectedCategory,
    selectedBlueprint,
    persistSelectedBlueprintKey,
    searchText,
    setSearchText,
}) {
    const [open, setOpen] = useState(false);
    const [highlighted, setHighlighted] = useState(0);
    const inputRef = useRef(null);
    const listRef = useRef(null);
    const wrapRef = useRef(null);

    // Filter blueprints by search + category
    const filtered = blueprints.filter((bp) => {
        const catOk = selectedCategory === 'All' || bp.category === selectedCategory;
        const q = normalizeName(searchText);
        const nameOk = !q || normalizeName(bp.name).includes(q);
        return catOk && nameOk;
    });

    // Deduplicate by name for display
    const seen = new Set();
    const suggestions = filtered.filter((bp) => {
        const key = normalizeName(bp.name);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Close on outside click
    useEffect(() => {
        function handler(e) {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
        }
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Keep highlighted in view
    useEffect(() => {
        if (!listRef.current) return;
        const el = listRef.current.children[highlighted];
        if (el) el.scrollIntoView({ block: 'nearest' });
    }, [highlighted]);

    function handleSelect(bp) {
        setSearchText(bp.name);
        persistSelectedBlueprintKey(bp.blueprintKey);
        setOpen(false);
        inputRef.current?.blur();
    }

    function handleInputChange(e) {
        setSearchText(e.target.value);
        setHighlighted(0);
        setOpen(true);
    }

    function handleKeyDown(e) {
        if (!open) { if (e.key !== 'Escape') setOpen(true); return; }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlighted(h => Math.min(h + 1, suggestions.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlighted(h => Math.max(h - 1, 0));
        } else if (e.key === 'Enter') {
            if (suggestions[highlighted]) handleSelect(suggestions[highlighted]);
        } else if (e.key === 'Escape') {
            setOpen(false);
        }
    }

    function handleClear() {
        setSearchText('');
        setOpen(true);
        inputRef.current?.focus();
    }

    const displayValue = open ? searchText : (selectedBlueprint?.name || searchText);

    return (
        <div className="bp-search-wrap" ref={wrapRef}>
            {/* Category strip */}
            <div className="bp-cat-strip">
                {categories.map(cat => (
                    <button
                        key={cat}
                        className={`bp-cat-btn${selectedCategory === cat ? ' active' : ''}`}
                        onClick={() => { setSelectedCategory(cat); setOpen(true); setHighlighted(0); }}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {/* Search input */}
            <div className="bp-input-row">
                <div className="bp-input-wrap">
                    <span className="bp-search-icon">⌕</span>
                    <input
                        ref={inputRef}
                        className="bp-input"
                        value={displayValue}
                        onChange={handleInputChange}
                        onFocus={() => { setOpen(true); setSearchText(''); }}
                        onKeyDown={handleKeyDown}
                        placeholder="Search blueprints…"
                        autoComplete="off"
                        spellCheck={false}
                    />
                    {(searchText || selectedBlueprint) && (
                        <button className="bp-clear-btn" onClick={handleClear} tabIndex={-1}>✕</button>
                    )}
                    <span className="bp-count-badge">{suggestions.length}</span>
                </div>
            </div>

            {/* Selected blueprint info strip */}
            {!open && selectedBlueprint && (
                <div className="bp-selected-strip">
                    <span className="bp-sel-label">SELECTED</span>
                    <span className="bp-sel-name">{selectedBlueprint.name}</span>
                    {selectedBlueprint.machineLabel && (
                        <span className="bp-sel-machine">{selectedBlueprint.machineLabel}</span>
                    )}
                    {selectedBlueprint.category && (
                        <span className="bp-sel-cat">{selectedBlueprint.category}</span>
                    )}
                </div>
            )}

            {/* Dropdown list */}
            {open && suggestions.length > 0 && (
                <div className="bp-dropdown">
                    <ul className="bp-list" ref={listRef}>
                        {suggestions.slice(0, 80).map((bp, i) => {
                            const isActive = bp.blueprintKey === selectedBlueprint?.blueprintKey;
                            return (
                                <li
                                    key={bp.blueprintKey}
                                    className={`bp-item${i === highlighted ? ' highlighted' : ''}${isActive ? ' selected' : ''}`}
                                    onMouseDown={() => handleSelect(bp)}
                                    onMouseEnter={() => setHighlighted(i)}
                                >
                                    <span className="bp-item-name">{bp.name}</span>
                                    <span className="bp-item-meta">
                                        {bp.machineLabel && <span className="bp-item-machine">{bp.machineLabel}</span>}
                                        {bp.category && bp.category !== 'All' && <span className="bp-item-cat">{bp.category}</span>}
                                    </span>
                                </li>
                            );
                        })}
                        {suggestions.length > 80 && (
                            <li className="bp-item-more">…{suggestions.length - 80} more — refine search</li>
                        )}
                    </ul>
                </div>
            )}

            {open && suggestions.length === 0 && (
                <div className="bp-dropdown">
                    <div className="bp-empty">No blueprints match</div>
                </div>
            )}
        </div>
    );
}

// ── ASSEMBLY TAB ────────────────────────────────────────────────────────────
export default function AssemblyTab({
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
    totalRawShortages,
    zoom,
    onZoomChange,
}) {
    return (
        <section className="panel assembly-panel">
            {/* ── SEARCH BAR ── */}
            <BlueprintSearch
                blueprints={filteredBlueprints}
                categories={categories}
                selectedCategory={selectedCategory}
                setSelectedCategory={setSelectedCategory}
                selectedBlueprint={selectedBlueprint}
                persistSelectedBlueprintKey={persistSelectedBlueprintKey}
                searchText={searchText}
                setSearchText={setSearchText}
            />

            {/* ── ACTION BAR ── */}
            <div className="assembly-action-bar">
                <div className="field small">
                    <label>QTY</label>
                    <div className="qty-stepper">
                        <button
                            className="qty-btn"
                            onClick={() => persistPlannerQuantity(Math.max(1, (numberOrZero(plannerQuantity) || 1) - 1))}
                        >−</button>
                        <input
                            type="number"
                            min="1"
                            value={plannerQuantity}
                            onChange={(e) => persistPlannerQuantity(Math.max(1, numberOrZero(e.target.value) || 1))}
                            className="qty-input"
                        />
                        <button
                            className="qty-btn"
                            onClick={() => persistPlannerQuantity((numberOrZero(plannerQuantity) || 1) + 1)}
                        >+</button>
                    </div>
                </div>

                <div className="row gap" style={{ flex: 1 }}>
                    <button
                        className="small-button primary"
                        onClick={addPlannerTarget}
                        disabled={!selectedBlueprint}
                    >
                        ADD TO PLANNER
                    </button>
                    <button
                        className="small-button"
                        onClick={addRecipePreview}
                        disabled={!selectedBlueprint}
                    >
                        PREVIEW RECIPE
                    </button>
                    <button className="small-button danger" onClick={clearPlannerQueue}>
                        CLEAR
                    </button>
                </div>

                {/* Zoom controls */}
                <div className="zoom-controls">
                    <span className="zoom-label">ZOOM</span>
                    <button className="zoom-btn" onClick={() => onZoomChange(Math.max(0.4, zoom - 0.1))}>−</button>
                    <span className="zoom-value">{Math.round(zoom * 100)}%</span>
                    <button className="zoom-btn" onClick={() => onZoomChange(Math.min(2, zoom + 0.1))}>+</button>
                    <button className="zoom-btn zoom-reset" onClick={() => onZoomChange(1)}>↺</button>
                </div>
            </div>

            {/* ── PLANNER CANVAS ── */}
            <div
                ref={plannerViewportRef}
                className="planner-viewport"
                onMouseDown={handlePanStart}
                onMouseMove={handlePanMove}
                onMouseUp={handlePanEnd}
                onMouseLeave={handlePanEnd}
            >
                <div
                    className="planner-canvas"
                    style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
                >
                    {plannerQueue.length === 0 ? (
                        <div className="empty-state large">No assembly plan yet.<br /><small style={{ fontSize: 11, opacity: 0.6 }}>Search a blueprint above and click ADD TO PLANNER</small></div>
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

            {/* ── SHORTAGES ── */}
            {totalRawShortages.length > 0 && (
                <div className="shortage-box">
                    <h3>RAW MATERIAL SHORTAGES</h3>
                    <ul>
                        {totalRawShortages.map((row, i) => (
                            <li key={`${row.typeId || row.name}-${i}`}>
                                <strong>{row.quantity}×</strong> {row.name}
                                {row.typeId ? <span className="shortage-id"> [{row.typeId}]</span> : null}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </section>
    );
}
