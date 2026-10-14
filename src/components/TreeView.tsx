import React from 'react';
/**
 * TreeView — wrapper around the battle-tested third-party tree component
 * `react-checkbox-tree` (https://jakezatecky.github.io/react-checkbox-tree/).
 *
 * The library provides tri-state checkboxes (checked / half-checked with
 * parent↔child cascading), expand/collapse state, native accessible
 * <input type="checkbox"> elements (no button-in-button DOM nesting issues)
 * and RTL support out of the box. This file keeps the app's existing data
 * model (nested TreeNode<T> lists with numeric DB ids) and re-skins the
 * library to match our theme:
 *   • classic [+]/− expander boxes, folder/leaf icons and hover row actions
 *   • brand-blue (#0A6ED1) checkbox accent, 13px Vazir rows, subtle hover
 *
 * Consumers pass the SAME props as before; internally we translate them to
 * react-checkbox-tree's controlled `nodes` / `checked` / `expanded` model.
 */
import CheckboxTree from 'react-checkbox-tree';
import 'react-checkbox-tree/lib/react-checkbox-tree.css';

export type CheckState = 'checked' | 'unchecked' | 'indeterminate';

/** Minimal shape a node's data must provide. PascalCase (DB) or camelCase both work. */
export interface TreeData {
  id: number;
  parentId?: number | null;
}

/** Generic tree node. `id`/`parentId` are normalized to camelCase for the component. */
export interface TreeNode<T extends TreeData = TreeData> {
  data: T;
  children?: TreeNode<T>[];
}

/**
 * NaN-safe id extraction — a row missing Id must not collide on key/focus/select.
 * NOTE: `??` is nullish-only, so a camelCase `id: 0` must not be skipped in favour
 * of PascalCase `Id`. Use explicit null/undefined checks instead.
 */
const pickField = (v: any, camel: string, pascal: string): any => {
  const c = v?.[camel];
  if (c !== undefined && c !== null) return c;
  const p = v?.[pascal];
  if (p !== undefined && p !== null) return p;
  return undefined;
};
const rawId = (v: any): number => {
  const n = Number(pickField(v, 'id', 'Id'));
  return Number.isFinite(n) ? n : NaN;
};
const rawParentId = (v: any): number | null => {
  const p = v?.parentId ?? v?.ParentId;
  if (p == null || p === '') return null;
  const n = Number(p);
  return Number.isFinite(n) ? n : null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Pure tree utilities (data-model helpers — independent of the UI library)
// ─────────────────────────────────────────────────────────────────────────────

/** Locate a node object by id anywhere in the forest. */
export function findNode<T extends TreeData>(nodes: TreeNode<T>[], id: number): TreeNode<T> | undefined {
  for (const n of nodes) {
    if (rawId(n.data) === id) return n;
    if (n.children?.length) {
      const hit = findNode(n.children, id);
      if (hit) return hit;
    }
  }
  return undefined;
}

/** All descendant *nodes* of a given id (excluding itself). */
export function collectDescendants<T extends TreeData>(nodes: TreeNode<T>[], id: number): TreeNode<T>[] {
  const target = findNode(nodes, id);
  if (!target?.children?.length) return [];
  const out: TreeNode<T>[] = [];
  const walk = (list: TreeNode<T>[]) => {
    for (const n of list) {
      out.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(target.children);
  return out;
}

/**
 * Normalize any tree payload into TreeNode[] with camelCase `id`/`parentId`.
 * Accepts nested trees from the server (`{ Id, ParentId, children }`, or
 * `{ id, parentId, units }`) as well as flat row lists.
 */
export function toTreeNodes<T extends TreeData>(input: any): TreeNode<T>[] {
  if (!Array.isArray(input)) return [];
  return input.map((item: any) => {
    const data = { ...item, id: rawId(item), parentId: rawParentId(item) } as any;
    delete data.children;
    delete data.units;
    const kids = item.children ?? item.units;
    const children = Array.isArray(kids) && kids.length ? toTreeNodes<T>(kids) : undefined;
    return children ? ({ data, children } as TreeNode<T>) : ({ data } as TreeNode<T>);
  });
}

/** Convert flat DB rows (Id/ParentId, camelCase or PascalCase) into TreeNode list. */
export function buildTree<T extends { id?: number; Id?: number; parentId?: number | null; ParentId?: number | null }>(rows: T[]): TreeNode<T & TreeData>[] {
  const typedRows = rows.map(r => ({ ...r, id: rawId(r), parentId: rawParentId(r) })) as (T & TreeData)[];
  const byId = new Map<number, TreeNode<T & TreeData>>();
  typedRows.forEach(r => byId.set(Number(r.id), { data: r, children: [] }));
  const roots: TreeNode<T & TreeData>[] = [];
  for (const node of Array.from(byId.values())) {
    const parent = node.data.parentId != null ? byId.get(Number(node.data.parentId)) : undefined;
    if (parent && parent !== node) parent.children!.push(node);
    else roots.push(node);
  }
  return roots;
}

/** Collect every node id in a tree (depth-first). */
export function collectNodeIds(nodes: TreeNode<any>[]): number[] {
  const ids: number[] = [];
  const walk = (list: TreeNode<any>[]) => {
    for (const n of list) {
      ids.push(rawId(n.data));
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return ids;
}

/** All descendant ids of a node inside a tree (excluding itself). */
export function descendantIdsOf(nodes: TreeNode<any>[], id: number): number[] {
  return collectDescendants(nodes, id)
    .map(n => rawId(n.data))
    .filter(Number.isFinite);
}

/** Tri-state for a "select all" header checkbox over the whole forest. */
export function treeCheckState(
  nodes: TreeNode<any>[],
  stateOf: (id: number) => CheckState
): CheckState {
  let any = false;
  let all = true;
  const walk = (list: TreeNode<any>[]) => {
    for (const n of list) {
      const s = stateOf(rawId(n.data));
      if (s !== 'unchecked') any = true;
      if (s !== 'checked') all = false;
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  if (!any) return 'unchecked';
  return all ? 'checked' : 'indeterminate';
}

/** Set of ancestor ids for a given node id (parents up to root). */
export function ancestorIdsOf(nodes: TreeNode<any>[], id: number): number[] {
  const chain: number[] = [];
  const walk = (list: TreeNode<any>[], ancestors: number[]): boolean => {
    for (const n of list) {
      const nid = rawId(n.data);
      if (nid === id) { chain.push(...ancestors); return true; }
      if (n.children?.length && walk(n.children, [...ancestors, nid])) return true;
    }
    return false;
  };
  walk(nodes, []);
  return chain;
}

/** parent-of-id map for a forest (NaN-safe; roots omitted). */
export function buildParentMap(nodes: TreeNode<any>[]): Map<number, number> {
  const map = new Map<number, number>();
  const walk = (list: TreeNode<any>[], parent: number | null) => {
    for (const n of list) {
      const id = rawId(n.data);
      if (!Number.isFinite(id)) continue;
      if (parent != null) map.set(id, parent);
      if (n.children?.length) walk(n.children, id);
    }
  };
  walk(nodes, null);
  return map;
}

/** Ancestor ids of `id`, nearest first. Empty for unknown ids / roots. */
export function ancestorsOf(id: number, parentMap: Map<number, number>): number[] {
  const chain: number[] = [];
  let cur = parentMap.get(id);
  // Guard against malformed cycles in the data.
  while (cur != null && !chain.includes(cur)) {
    chain.push(cur);
    cur = parentMap.get(cur);
  }
  return chain;
}

/**
 * Bottom-up tri-state rollup for the whole forest.
 *   checked        – explicitly selected or implied by a selected ancestor
 *   indeterminate  – some (possibly implied) descendant is selected
 * Returns a plain Map so consumers can memoize with a stable identity.
 */
export function computeCheckStates(
  nodes: TreeNode<any>[],
  selectedIds: Iterable<number>
): Map<number, CheckState> {
  const explicit = new Set<number>();
  for (const id of selectedIds) {
    const n = Number(id);
    if (Number.isFinite(n)) explicit.add(n);
  }
  const parentMap = buildParentMap(nodes);
  const states = new Map<number, CheckState>();

  // Effective state of a node ignoring descendants: explicit or implied-by-ancestor.
  const selfState = (id: number): boolean =>
    explicit.has(id) || ancestorsOf(id, parentMap).some(a => explicit.has(a));

  const visit = (node: TreeNode<any>): CheckState => {
    const id = rawId(node.data);
    if (!Number.isFinite(id)) return 'unchecked';
    const kids = node.children ?? [];
    let anyKid = false;
    let allKids = true;
    for (const k of kids) {
      const s = visit(k);
      if (s !== 'unchecked') anyKid = true;
      if (s !== 'checked') allKids = false;
    }
    const mine = selfState(id);
    const st: CheckState = mine ? 'checked' : anyKid ? (allKids ? 'checked' : 'indeterminate') : 'unchecked';
    states.set(id, st);
    return st;
  };
  for (const root of nodes) visit(root);
  return states;
}

/**
 * Toggle a subtree check and return the new explicit-selection array.
 *   check=true  – select the node and every descendant explicitly
 *   check=false – clear the node and all descendants
 */
export function applySubtreeCheck(
  nodes: TreeNode<any>[],
  currentSelected: Iterable<number>,
  id: number,
  check: boolean
): number[] {
  const set = new Set<number>();
  for (const x of currentSelected) {
    const n = Number(x);
    if (Number.isFinite(n)) set.add(n);
  }
  if (!Number.isFinite(id)) return [...set];

  const subtree = [id, ...descendantIdsOf(nodes, id)];
  if (check) {
    for (const nid of subtree) set.add(nid);
    return [...set];
  }
  for (const nid of subtree) set.delete(nid);
  return [...set];
}

/** Ids of every branch (node with children) — handy for expand-all. */
export function collectBranchIds(nodes: TreeNode<any>[]): number[] {
  const ids: number[] = [];
  const walk = (list: TreeNode<any>[]) => {
    for (const n of list) {
      if (n.children?.length) {
        const id = rawId(n.data);
        if (Number.isFinite(id)) ids.push(id);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return ids;
}

/** Expansion-set hook with expand/collapse-all, matching the old API. */
export function useTreeExpansion(
  nodes: TreeNode<any>[]
): {
  expandedIds: Set<number>;
  setExpandedIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  toggleExpand: (id: number) => void;
  expandAll: () => void;
  collapseAll: () => void;
} {
  const [expandedIds, setExpandedIds] = React.useState<Set<number>>(new Set());

  // Auto-expand branches that appear for the first time (fresh load) while
  // preserving manual collapses/expansions across refreshes.
  const seenRef = React.useRef<Set<number>>(new Set());
  React.useEffect(() => {
    const branchIds = collectBranchIds(nodes);
    const fresh = branchIds.filter(id => !seenRef.current.has(id));
    branchIds.forEach(id => seenRef.current.add(id));
    if (fresh.length) {
      setExpandedIds(prev => {
        const next = new Set(prev);
        for (const id of fresh) next.add(id);
        return next;
      });
    }
  }, [nodes]);

  const toggleExpand = React.useCallback((id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = React.useCallback(() => {
    setExpandedIds(new Set(collectNodeIds(nodes)));
  }, [nodes]);

  const collapseAll = React.useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  return { expandedIds, setExpandedIds, toggleExpand, expandAll, collapseAll };
}

// ─────────────────────────────────────────────────────────────────────────────
// react-checkbox-tree adapter
// ─────────────────────────────────────────────────────────────────────────────

interface TreeViewProps<T extends TreeData = TreeData> {
  nodes: TreeNode<T>[];
  /** Render the label/content of a node (no expander/checkbox/icon — TreeView adds those). */
  renderNode: (data: T, depth: number, node: TreeNode<T>) => React.ReactNode;
  expandedIds?: Set<number>;
  onToggleExpand?: (id: number) => void;
  /** Provide to enable checkboxes. */
  checkStateOf?: (data: T) => CheckState;
  onToggleCheck?: (data: T, nextChecked: boolean) => void;
  /** Optional trailing actions (edit/delete buttons…) rendered right-to-left. */
  renderActions?: (data: T, depth: number, node: TreeNode<T>) => React.ReactNode;
  /** Highlight rows whose id is in this set (e.g. current selection). */
  selectedId?: number | null;
  onSelect?: (data: T) => void;
  /** Custom icon for branch nodes (default: folder). */
  branchIcon?: React.ReactNode;
  /** Custom icon for leaf nodes (default: document bullet). */
  leafIcon?: React.ReactNode;
  emptyMessage?: string;
  className?: string;
}

/** Classic [+]/[−] expander box styled like Windows Explorer. */
function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0" aria-hidden="true">
      {open ? (
        <>
          <path d="M1.5 13V3.5h4l1.5 1.5H13V7H4.5L1.5 13z" fill="#F6B93C" stroke="#D69A1E" strokeWidth="0.7" />
          <path d="M4.5 7H14l-2.8 6H1.7L4.5 7z" fill="#FFD666" stroke="#D69A1E" strokeWidth="0.7" />
        </>
      ) : (
        <path d="M1.5 13V3.5h4.5L7.5 5h7v8h-13z" fill="#F0B22E" stroke="#D69A1E" strokeWidth="0.7" />
      )}
    </svg>
  );
}

function LeafIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0" aria-hidden="true">
      <rect x="3.5" y="2.5" width="9" height="11" rx="1" fill="#FFFFFF" stroke="#8A8E93" strokeWidth="1" />
      <line x1="5.5" y1="6" x2="10.5" y2="6" stroke="#B9BDC4" strokeWidth="1" />
      <line x1="5.5" y1="8.5" x2="10.5" y2="8.5" stroke="#B9BDC4" strokeWidth="1" />
      <line x1="5.5" y1="11" x2="8.5" y2="11" stroke="#B9BDC4" strokeWidth="1" />
    </svg>
  );
}

/** Theme overrides for react-checkbox-tree (scoped to .treeview-themed).
 *
 *  LAYOUT MODEL: each row is the library's natural DOM sequence
 *      .rct-text > [+/− expander] [label: <input> + checkbox glyph] [content]
 *  laid out as a plain flex row in NATURAL ORDER with `direction: ltr`
 *  forced on the row itself. This is deliberate: the stock stylesheet puts
 *  `flex-direction: row-reverse` on the shell which mirrors children onto
 *  the wrong side — that is what scattered the checkboxes to the far/left
 *  edge in earlier screenshots. Persian text still renders RTL inside the
 *  content cell (the row div carries dir="rtl").
 *
 *  Indentation uses the library's OWN nested-<ol> mechanism (overridden to
 *  be RTL-aware via padding-inline-start), which creates an indent gutter at
 *  every depth. Explorer-style connector lines are drawn in that gutter:
 *  a vertical guide line on each nested list (::before) plus a horizontal
 *  tick per child row (::after) reaching from the guide to the child's
 *  expander slot. */
const TREE_THEME_CSS = `
/* ── Shell & lists ─────────────────────────────────────────────────────── */
.treeview-themed .react-checkbox-tree { font-size: 13px; color: #3C4043; display: block; }
.treeview-themed .react-checkbox-tree ol,
.treeview-themed .react-checkbox-tree ul {
  margin: 0; padding: 0; padding-inline-start: 24px; list-style: none; position: relative;
}
.treeview-themed .react-checkbox-tree > ol,
.treeview-themed .react-checkbox-tree > ul { padding-inline-start: 0; }

/* ── Row: logical order [expander][glyph][content], RTL-aware ──────────── */
/* No "direction" override here: in an RTL context the flex main axis runs
   right-to-left, so the expander lands at the far RIGHT and the checkbox
   glyph sits immediately to its left - the Explorer layout. Forcing LTR on
   the row flipped the whole anatomy (checkboxes drifted to the far side,
   disconnected from their labels). Persian text inside the content column
   is already dir="rtl" via our .tv-row element. */
.treeview-themed .rct-text {
  display: flex; align-items: stretch;
  min-height: 26px; position: relative;
}

/* ── Guide lines (Explorer connectors) ─────────────────────────────────── */
/* Geometry contract with expanderCss (see component below):
     - nested lists reserve a 24px indent gutter via padding-inline-start
       (declared above in "Shell & lists");
     - each collapsed parent reserves a 24px-wide inline-flex slot holding a
       16px [+]/[−] box => the parent expander CENTRE sits at gutter-edge +
       12px, i.e. 8px inside the content area.
   All insets are LOGICAL so everything mirrors automatically under RTL (the
   gutter then sits on the right side of the rows).

   Vertical guide (::before on each nested list): spans the FULL list height,
   which also covers the children's own nested lists - this is what keeps the
   line continuous through subtrees instead of breaking between groups. It is
   centred exactly on the parent's expander column (12px into the 24px
   gutter). */
.treeview-themed .rct-node { display: block; margin: 0; }
.treeview-themed .react-checkbox-tree ol ol,
.treeview-themed .react-checkbox-tree ol ul,
.treeview-themed .react-checkbox-tree ul ol,
.treeview-themed .react-checkbox-tree ul ul {
  position: relative;
}
.treeview-themed .react-checkbox-tree ol ol::before,
.treeview-themed .react-checkbox-tree ol ul::before,
.treeview-themed .react-checkbox-tree ul ol::before,
.treeview-themed .react-checkbox-tree ul ul::before {
  content: ''; position: absolute; inset-block-start: 0; inset-inline-start: 12px;
  width: 1px; background: #DDE1E6; pointer-events: none;
}
/* Vertical guide TRIMMING (classic Explorer): the list's ::before above
   spans the full list height, which would push the line BELOW the last
   child's tick — a stub hanging past the final node looked "disconnected".
   The last child paints an opaque white block over everything under its
   connector row (::after, z-index 1, drawn from its top edge to the li's
   bottom). Because this overlay lives INSIDE the last li it can never bleed
   into the next sibling group, so the gap between two consecutive top-level
   trees stays clean. */
.treeview-themed .react-checkbox-tree ol ol > .rct-node:last-child::after,
.treeview-themed .react-checkbox-tree ol ul > .rct-node:last-child::after,
.treeview-themed .react-checkbox-tree ul ol > .rct-node:last-child::after,
.treeview-themed .react-checkbox-tree ul ul > .rct-node:last-child::after {
  top: 14px; height: auto; bottom: 0; width: 24px;
  background: #fff; z-index: 1;
}
/* Horizontal tick per child row. Drawn as ::after on each child <li>: the
   li is position:relative (rule above) and its border box starts exactly at
   the nested list's CONTENT edge (the 24px gutter is the list's own
   padding), so inset-inline-start:-24px + width:12px spans precisely from
   the vertical guide (content edge - 12px) to the child's expander slot
   start (content edge). No :first-child exclusion — every child, including
   the first, gets its connector (the old combination of per-row anchors and
   :not(:first-child) silently dropped the first child's line). The row
   (.rct-text) stays position:static so nothing shadows the li anchor. */
.treeview-themed .react-checkbox-tree ol ol > .rct-node,
.treeview-themed .react-checkbox-tree ol ul > .rct-node,
.treeview-themed .react-checkbox-tree ul ol > .rct-node,
.treeview-themed .react-checkbox-tree ul ul > .rct-node {
  position: relative;
}
.treeview-themed .react-checkbox-tree ol ol > .rct-node::after,
.treeview-themed .react-checkbox-tree ol ul > .rct-node::after,
.treeview-themed .react-checkbox-tree ul ol > .rct-node::after,
.treeview-themed .react-checkbox-tree ul ul > .rct-node::after {
  content: ''; position: absolute; top: 13px; inset-inline-start: -24px;
  width: 12px; height: 1px; background: #DDE1E6; pointer-events: none;
}

/* ── Expander column ───────────────────────────────────────────────────── */
/* Slot geometry (24px for BOTH the real [+]/[−] button and the leaf
   placeholder span, box centred inside) is declared once in expanderCss on
   the component — see the GEOMETRY CONTRACT comment there. Nothing to size
   here; just keep both cells out of the flex-grow race. */
.treeview-themed .rct-collapse { flex: 0 0 auto; align-self: center; }

/* ── Checkbox column: ONE visible checkbox per node ────────────────────── */
/* The library renders a native <input type=checkbox> AND our tri-state
   glyph span inside the same label. Stock CSS positions the input
   absolutely with no positioned ancestor, so it ESCAPES its row and floats
   over unrelated rows at the far edge — the "second phantom checkbox".
   Pin it at zero size inside its own (relative) label: kept in the DOM for
   a11y/form semantics and keyboard focus, invisible, never duplicated. */
.treeview-themed .react-checkbox-tree label {
  flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center;
  position: relative; margin: 0; padding: 0 4px; cursor: pointer; width: auto;
  align-self: center;
}
.treeview-themed .react-checkbox-tree:not(.rct-native-display) input {
  position: absolute !important; inset-inline-start: 0; top: 0; width: 0; height: 0;
  margin: 0; padding: 0; opacity: 0;
}
.treeview-themed .rct-checkbox { display: inline-flex; align-items: center; justify-content: center; padding: 0; margin: 0; }
.treeview-themed .rct-checkbox > * { width: auto; margin: 0; }
/* Focus ring drawn around our glyph instead of the invisible input. */
.treeview-themed .react-checkbox-tree:not(.rct-native-display) input:focus-visible + .rct-checkbox {
  outline: 2px solid rgba(10,110,209,.55); outline-offset: 1px; border-radius: 3px;
}

/* ── Content column ────────────────────────────────────────────────────── */
/* In checkbox mode the clickable span is a SIBLING of the label; in browse
   mode it is nested inside .rct-bare-label — unwrap both cases so it always
   becomes the flex-growing third cell of the row. */
.treeview-themed .rct-bare-label { display: contents; }
.treeview-themed .rct-node-clickable {
  display: block; flex: 1 1 auto; min-width: 0; padding: 0;
  cursor: default; border-radius: 4px;
}
.treeview-themed .rct-node-clickable:hover,
.treeview-themed .rct-node-clickable:focus { background: transparent; outline: none; }

/* ── Neutralise leftovers ──────────────────────────────────────────────── */
.treeview-themed .react-checkbox-tree input { margin: 0; }
.treeview-themed .rct-node-icon { display: none; }
/* Kill the library's bootstrap-ish purple highlights; hover/selection lives
   on our own inner div (.tv-row). */
.treeview-themed .react-checkbox-tree label:hover,
.treeview-themed .react-checkbox-tree label:active,
.treeview-themed .react-checkbox-tree label:focus-within { background: transparent; }
.treeview-themed .tv-row { transition: background-color .12s ease; border-radius: 4px; }
.treeview-themed .tv-row:hover { background: #EEF1F5; }
.treeview-themed .tv-row.tv-selected { background: #E8F2FD; box-shadow: inset 0 0 0 1px rgba(10,110,209,.35); }
`;

/**
 * Tri-state checkbox glyph rendered through the library's icon slots
 * (check / uncheck / halfCheck). The adjacent native <input> carries the
 * accessible checked/indeterminate state.
 */
function CheckGlyph({ state }: { state: CheckState }) {
  if (state === 'checked') {
    return (
      <span className="w-4 h-4 shrink-0 rounded-[3px] bg-[#0A6ED1] border border-[#0A6ED1] flex items-center justify-center">
        <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" aria-hidden="true">
          <path d="M2.5 6.2 5 8.7l4.5-5.4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (state === 'indeterminate') {
    return (
      <span className="w-4 h-4 shrink-0 rounded-[3px] bg-[#0A6ED1]/15 border border-[#0A6ED1] flex items-center justify-center">
        <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" aria-hidden="true">
          <path d="M2.8 6h6.4" stroke="#0A6ED1" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  return <span className="w-4 h-4 shrink-0 rounded-[3px] bg-white border border-[#B9BDC4]" />;
}

/** Cheap stable signature of the current checked-set (kept for potential
 *  debugging; no longer used as an effect key — see flushPendingAutoExpand). */
function sigKey(nodes: TreeNode<any>[], checkStateOf?: (d: any) => CheckState): string {
  if (!checkStateOf) return '';
  const ids: number[] = [];
  const walk = (list: TreeNode<any>[]) => {
    for (const n of list) {
      const id = rawId(n.data);
      if (Number.isFinite(id) && checkStateOf(n.data) === 'checked') ids.push(id);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return ids.sort((a, b) => a - b).join(',');
}
void sigKey; // referenced only to silence unused warnings in some setups

let treeViewSeq = 0;

export default function TreeView<T extends TreeData>({
  nodes,
  renderNode,
  expandedIds,
  onToggleExpand,
  checkStateOf,
  onToggleCheck,
  renderActions,
  selectedId,
  onSelect,
  branchIcon,
  leafIcon,
  emptyMessage = 'هیچ موردی یافت نشد',
  className = '',
}: TreeViewProps<T>) {
  const treeId = React.useMemo(() => `treeview-${++treeViewSeq}`, []);

  // id -> depth map + node lookup, computed once per `nodes` change.
  const layout = React.useMemo(() => {
    const depthById = new Map<number, number>();
    const nodeById = new Map<number, TreeNode<T>>();
    const walk = (list: TreeNode<T>[], depth: number) => {
      for (const n of list) {
        const id = rawId(n.data);
        if (Number.isFinite(id)) {
          depthById.set(id, depth);
          nodeById.set(id, n);
        }
        if (n.children?.length) walk(n.children, depth + 1);
      }
    };
    walk(nodes, 0);
    return { depthById, nodeById };
  }, [nodes]);

  const checkboxMode = !!onToggleCheck;

  // react-checkbox-tree renders a real <input type="checkbox"> per node, but
  // never sets the DOM `indeterminate` property (it only swaps icons). We
  // sync it from our own tri-state model so screen readers and native form
  // semantics report half-checked parents correctly. The glyph itself is
  // driven by the library's shallow child-scan (checkState 2 → halfCheck
  // icon), which agrees with `computeCheckStates`, so no DOM override is
  // needed for the visual state.
  const rootRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!checkboxMode || !checkStateOf) return;
    const apply = () => {
      const root = rootRef.current;
      if (!root) return;
      root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(input => {
        const val = input.value || '';
        if (!val.startsWith('n:')) return;
        const node = layout.nodeById.get(Number(val.slice(2)));
        if (!node) return;
        input.indeterminate = checkStateOf(node.data) === 'indeterminate';
      });
    };
    apply();
    // Re-sync after React commits child effects (the library's own ref effect
    // may reset `indeterminate` during the same commit).
    const raf = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(raf);
  });

  // ── Auto-expand ancestors of newly checked nodes ───────────────────────
  // When a *user action* checks nodes whose ancestors are collapsed (e.g.
  // "انتخاب همه"), reveal those ancestors so the selection is visible.
  // We only run this inside click handlers (via pendingAutoExpandRef), NEVER
  // as a render effect — an effect-driven version used to fire toggleExpand
  // during the same commit as a checkbox click, re-rendering the row under
  // the pointer and swallowing the un-check gesture.
  const pendingAutoExpandRef = React.useRef(false);
  const flushPendingAutoExpand = React.useCallback(() => {
    if (!pendingAutoExpandRef.current) return;
    pendingAutoExpandRef.current = false;
    if (!checkboxMode || !checkStateOf || !onToggleExpand) return;
    const parentMap = buildParentMap(nodes);
    const toOpen = new Set<number>();
    layout.nodeById.forEach((node, id) => {
      if (checkStateOf(node.data) === 'unchecked') return;
      let p = parentMap.get(id);
      while (p != null && Number.isFinite(p)) {
        if (!(expandedIds && expandedIds.has(p))) toOpen.add(p);
        p = parentMap.get(p);
      }
    });
    for (const pid of toOpen) onToggleExpand(pid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkboxMode, checkStateOf, onToggleExpand, nodes, layout, expandedIds]);

  // The library's expand <button> renders with an empty icon (we supply blank
  // React nodes instead of FontAwesome glyphs), so we inject our own [+]/−
  // box into it via CSS ::after. The button stays the real control: keyboard,
  // aria and clicks all work without any nested interactive elements.
  // DOM order inside .rct-text is [expand button][label/clickable span], so
  // in RTL flow the expander sits at the far right; a small logical margin
  // separates it from the checkbox glyph / row content that follows.
  //
  // GEOMETRY CONTRACT with TREE_THEME_CSS "Guide lines": every parent — leaf
  // or branch — reserves an identical 24px inline-flex slot as the FIRST cell
  // of its row. Inside that slot the 16px box is centred, which puts each
  // parent's expander centre exactly 8px past the slot start = 12px into its
  // children's 24px indent gutter (padding-inline-start declared there). The
  // vertical guide (::before at inset-inline-start:12px) therefore threads
  // through every parent's [+]/[−] column at all depths, and the per-row tick
  // (::after spanning edge+12px -> edge+24px) lands flush on the child's slot
  // start. If you ever change the slot width here, update the two 12px
  // constants in TREE_THEME_CSS to half of it.
  const expanderCss = React.useMemo(() => `
.tv-exp-${treeId} .rct-collapse { flex: 0 0 auto; align-self: center; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 26px; padding: 0; margin: 0; }
/* Leaf placeholder keeps the SAME slot geometry as a real expander - this is
   what aligns connector ticks across mixed leaf/branch siblings. */
.tv-exp-${treeId} .rct-collapse:not(.rct-collapse-btn) { visibility: hidden; }
.tv-exp-${treeId} .rct-collapse.rct-collapse-btn { background: none; border: 0; cursor: pointer; }
.tv-exp-${treeId} .rct-collapse.rct-collapse-btn > span { display: none; }
.tv-exp-${treeId} .rct-collapse.rct-collapse-btn::after {
  content: '+'; display: flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; border: 1px solid #8A8E93; background: #fff;
  color: #3C4043; font-size: 11px; font-weight: 700; line-height: 1;
  user-select: none; border-radius: 2px;
}
.tv-exp-${treeId} .rct-node-expanded > .rct-text > .rct-collapse.rct-collapse-btn::after { content: '\\2212'; }
.tv-exp-${treeId} .rct-collapse.rct-collapse-btn:hover::after { border-color: #0A6ED1; color: #0A6ED1; }
`, [treeId]);

  // Translate our TreeNode forest into react-checkbox-tree's Node shape.
  // Values are stringified ids ("n:<id>"). Labels carry the full custom row
  // markup (expander glyph, folder/leaf icon, content, hover actions).
  const rctNodes = React.useMemo(() => {
    const convert = (node: TreeNode<T>): any | null => {
      const id = rawId(node.data);
      if (!Number.isFinite(id)) return null;
      const depth = layout.depthById.get(id) ?? 0;
      const hasChildren = !!(node.children && node.children.length);
      const kids = (node.children ?? []).map(convert).filter(Boolean);
      const checkState = checkStateOf ? checkStateOf(node.data) : undefined;
      const isSelected = selectedId != null && selectedId === id;
      const open = !!(expandedIds && expandedIds.has(id));

      // Row anatomy (left-to-right, enforced via `direction: ltr` on the row
      // in TREE_THEME_CSS): [+/− expander][checkbox glyph][icon + label …
      // actions]. The expander box is injected into the library's own expand
      // button via CSS (see expanderCss) and the checkbox glyph is rendered
      // by the library through our CheckGlyph icons — both live OUTSIDE this
      // row so they stay aligned at every depth. Indentation comes from the
      // library's nested-<ol> padding (RTL-aware), NOT from per-row padding,
      // so the guide-line gutter lines up with each level; the row content
      // itself is dir="rtl" for Persian text.
      const nodeIcon = hasChildren ? branchIcon ?? <FolderIcon open={open} /> : leafIcon ?? <LeafIcon />;
      const row = (
        <div
          dir="rtl"
          className={'tv-row flex items-center gap-1.5 py-0.5 min-w-0' + (isSelected ? ' tv-selected' : '')}
        >
          {/* Exactly ONE icon per node: in checkbox mode it renders here, at
              the head of the row content (the library's own NodeIcon slot is
              disabled via blank parent/leaf icons). In browse mode there is no
              leading label, so the same element sits at the row start. */}
          {nodeIcon}
          <div className="group flex items-center gap-2 flex-1 min-w-0">
            <div className="flex-1 min-w-0">{renderNode(node.data, depth, node)}</div>
            {renderActions && (
              <div
                className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0"
                onClick={e => e.stopPropagation()}
                onKeyDown={e => e.stopPropagation()}
              >
                {renderActions(node.data, depth, node)}
              </div>
            )}
          </div>
        </div>
      );

      const n: any = { value: `n:${id}`, label: row };
      if (kids.length) n.children = kids;
      // Per-node opt-out of the checkbox slot. In browse mode EVERY node must
      // explicitly set showCheckbox=false: the library's NodeModel defaults
      // it to TRUE, and passing an undefined `checked` list would otherwise
      // still render a phantom native <input> + glyph per row (the "two
      // checkboxes" screenshot bug). Rows whose check state is unknown
      // (read-only branches inside a checkbox tree) also opt out individually.
      if (!checkboxMode || checkState === undefined) n.showCheckbox = false;
      return n;
    };
    return nodes.map(convert).filter(Boolean);
  }, [nodes, layout, checkStateOf, checkboxMode, renderNode, renderActions, selectedId, expandedIds, branchIcon, leafIcon]);

  // Checkbox mode needs the library's native <input> + tri-state glyph slots
  // enabled; browse mode disables them entirely so rows are pure clickable
  // labels (this is what previously produced "two checkboxes per node" when
  // both modes shared one configuration).
  const showCheckboxes = checkboxMode && !!checkStateOf;

  // Controlled checked list. react-checkbox-tree's 'all' check model expects
  // EVERY node whose effective state is "checked" (including parents whose
  // whole subtree is selected) to be present in this list — it does NOT
  // derive parent states from children during deserialization. Our app model
  // stores *explicit* ids plus ancestor-implied selections, so we feed the
  // library exactly that: every node our own tri-state pass reports as
  // 'checked'. Half-checked parents are simply absent → the library renders
  // them via its shallow child-scan (state 2), which matches our model.
  const checkedValues = React.useMemo(() => {
    if (!checkboxMode || !checkStateOf) return undefined;
    const out: string[] = [];
    const walk = (list: TreeNode<T>[]) => {
      for (const n of list) {
        const id = rawId(n.data);
        if (Number.isFinite(id) && checkStateOf(n.data) === 'checked') out.push(`n:${id}`);
        if (n.children?.length) walk(n.children);
      }
    };
    walk(nodes);
    return out;
  }, [nodes, checkStateOf, checkboxMode]);

  // CRITICAL STABILITY GUARD. The library deep-equals `nodes` vs its cached
  // prop; when they differ it REBUILDS the internal NodeModel from scratch —
  // and a rebuild re-derives every check state from the CURRENT `checked`
  // list only, wiping half-checked/indeterminate marks and any per-node
  // derived state. Because our labels embed live data (selection highlight,
  // hover actions, icons), `rctNodes` gets a new identity on many unrelated
  // re-renders (e.g. hovering a row). Without this memo keyed on CONTENT
  // ONLY, every such render silently rebuilt the model — one visible symptom
  // was checkboxes losing their glyph size/state between interactions. We
  // therefore keep the last converted tree whenever the structural signature
  // below is unchanged.
  const rctSignature = React.useMemo(() => {
    const parts: string[] = [];
    const walk = (list: TreeNode<T>[]) => {
      for (const n of list) {
        const id = rawId(n.data);
        const kids = n.children?.length ?? 0;
        const open = expandedIds && Number.isFinite(id) ? (expandedIds.has(id) ? '1' : '0') : '?';
        const sel = selectedId != null && selectedId === id ? 'S' : '-';
        const cs = checkStateOf && Number.isFinite(id) ? checkStateOf(n.data)[0] : '?';
        parts.push(`${id}:${kids}:${open}:${sel}:${cs}`);
        if (n.children?.length) walk(n.children);
      }
    };
    walk(nodes);
    return parts.join('|');
  }, [nodes, expandedIds, selectedId, checkStateOf]);

  const stableRctNodesRef = React.useRef<any[]>([]);
  const lastSigRef = React.useRef<string | null>(null);
  if (rctSignature !== lastSigRef.current) {
    stableRctNodesRef.current = rctNodes;
    lastSigRef.current = rctSignature;
  }
  const stableRctNodes = stableRctNodesRef.current;

  const expandedValues = React.useMemo(
    () => (expandedIds ? [...expandedIds].map(id => `n:${id}`) : undefined),
    [expandedIds]
  );

  // Single source of truth for toggling a row's check state. The caller owns
  // the cascade semantics (applySubtreeCheck), so we always just forward
  // "toggle node X" with the desired next state computed from OUR tri-state
  // model — never from the library's optimistic guess.
  const toggleCheckOf = React.useCallback(
    (value: unknown) => {
      if (!checkboxMode || !onToggleCheck || !checkStateOf) return;
      const id = Number(String(value).slice(2));
      const node = layout.nodeById.get(id);
      if (!node) return;
      const state = checkStateOf(node.data);
      // checked or half-checked → clear the subtree; unchecked → select it.
      onToggleCheck(node.data, state !== 'checked');
    },
    [checkboxMode, onToggleCheck, checkStateOf, layout]
  );

  // NOTE: there is deliberately NO time-based debounce here. A previous
  // version guarded against "double firing" with a 350ms window, which made
  // legitimate consecutive clicks on the SAME node (un-check right after
  // check!) silently no-op for a third of a second — that is what felt like
  // "un-checking is impossible". The real double-fire risk was structural:
  // in checkbox mode react-checkbox-tree wires BOTH the native <input>'s
  // onClick (→ onCheck) AND the clickable label span's onClick (→ onClick)
  // to our handlers, and both compute "toggle node X" from OUR tri-state
  // model — so one pointer gesture ran the toggle TWICE (check → un-check →
  // net zero; un-check → check → net zero). That is why checking worked but
  // un-checking never did. Fix: in checkbox mode we pass `onClick={null}`
  // to the library. TreeNode then renders its label WITHOUT any click
  // handler ("bare label"), so exactly ONE path can ever toggle a row:
  //   • pointer → the <label htmlFor> focuses/activates the native input →
  //     input click → handleCheck (the input keeps pointer-events:auto; a
  //     previous attempt to disable it broke un-checking completely);
  //   • keyboard → Space/Enter on the focused input → keyup handler →
  //     handleCheck.
  // Both routes land in handleCheck below, once per gesture.
  const handleCheck = React.useCallback(
    (_checkedList: string[], nodeInfo: any) => {
      toggleCheckOf(nodeInfo.value);
      pendingAutoExpandRef.current = true;
      flushPendingAutoExpand();
    },
    [toggleCheckOf, flushPendingAutoExpand]
  );

  // Non-checkbox mode (e.g. unit/user selection): the library only wraps the
  // native <input> in a clickable <label> when `showCheckbox` is true; with
  // bare labels it renders no click handler at all unless onClick is provided.
  // So in browse mode we must pass onClick ourselves — otherwise rows are dead
  // and no node can be selected. Branch nodes expand/collapse on click, leaves
  // invoke onSelect. In checkbox mode this handler is NOT wired (see above).
  const handleBrowseClick = React.useCallback(
    (nodeInfo: any) => {
      const id = Number(String(nodeInfo.value).slice(2));
      const node = layout.nodeById.get(id);
      if (!node) return;
      const hasChildren = !!(node.children && node.children.length);
      if (hasChildren) onToggleExpand?.(id);
      else onSelect?.(node.data);
    },
    [layout, onToggleExpand, onSelect]
  );

  const handleExpand = React.useCallback(
    (_expandedList: string[], nodeInfo: any) => {
      const id = Number(String(nodeInfo.value).slice(2));
      if (!Number.isFinite(id)) return;
      onToggleExpand?.(id);
    },
    [onToggleExpand]
  );

  const icons = React.useMemo(() => {
    const blank = <span aria-hidden="true" />;
    return {
      // Glyph slots are ONLY consulted in checkbox mode (checked/unchecked/
      // half-check states). In browse mode no label renders them at all.
      check: <CheckGlyph state="checked" />,
      uncheck: <CheckGlyph state="unchecked" />,
      halfCheck: <CheckGlyph state="indeterminate" />,
      // Chevron glyphs are blank — the visible [+]/− box is injected into the
      // library's own expand button via CSS (see expanderCss).
      expandClose: blank,
      expandOpen: blank,
      expandAll: blank,
      collapseAll: blank,
      // Node-icon slots stay blank too: our row renders exactly one folder/
      // leaf icon itself (see rctNodes), so nothing is ever duplicated.
      parentClose: blank,
      parentOpen: blank,
      leaf: blank,
    };
  }, []);

  const lang = React.useMemo(
    () => ({ collapseAll: 'بستن همه', collapseNode: 'بستن', expandAll: 'باز کردن همه', expandNode: 'باز کردن' }),
    []
  );

  if (!nodes.length) {
    return <p className="text-sm text-gray-500 text-center py-6">{emptyMessage}</p>;
  }

  return (
    <div
      dir="rtl"
      ref={rootRef}
      className={`tv-exp-${treeId} font-[Vazir,Tahoma,sans-serif] text-[13px] treeview-themed ${showCheckboxes ? 'treeview-sized' : 'treeview-browse'} ${className}`}>
      <style>{expanderCss}</style>
      <style>{TREE_THEME_CSS}</style>
      <CheckboxTree
        id={treeId}
        nodes={stableRctNodes as any}
        direction="rtl"
        checkModel="all"
        showNodeIcon={false}
        expandOnClick={false}
        checked={(checkboxMode ? checkedValues : undefined) as any}
        expanded={expandedValues as any}
        onCheck={handleCheck as any}
        onClick={checkboxMode ? null : (handleBrowseClick as any)}
        onExpand={handleExpand as any}
        icons={icons as any}
        lang={lang as any}
      />
    </div>
  );
}
