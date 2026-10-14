import React from 'react';
import { createRoot } from 'react-dom/client';
import TreeView, { buildTree, type CheckState } from '../src/components/TreeView';

// Flat rows like the permissions API: categories (parentId=null) + children.
const ROWS = [
  { id: 1, label: 'دسته‌بندی الف' },
  { id: 2, label: 'دسته‌بندی ب' },
  { id: 11, parentId: 1, label: 'مجوز ۱' },
  { id: 12, parentId: 1, label: 'مجوز ۲' },
  { id: 13, parentId: 1, label: 'مجوز ۳' },
  { id: 21, parentId: 2, label: 'مجوز ۴' },
  { id: 22, parentId: 2, label: 'مجوز ۵ با برچسب طولانی فارسی' },
];

interface Row { id: number; parentId?: number | null; label: string }

function App() {
  const nodes = React.useMemo(() => buildTree(ROWS as Row[]), []);
  const [checked, setChecked] = React.useState<Set<number>>(new Set([11]));
  const [expanded, setExpanded] = React.useState<Set<number>>(new Set([1, 2]));

  // tri-state model identical to RoleManagement's permStates map
  const checkStateOf = (d: Row): CheckState => {
    if (checked.has(d.id)) return 'checked';
    return 'unchecked';
  };
  // cascade: toggling a category toggles all its children in our flat set
  const onToggleCheck = (d: Row) => {
    setChecked(prev => {
      const next = new Set(prev);
      const kids = ROWS.filter(r => r.parentId === d.id);
      if (kids.length) {
        const allOn = kids.every(k => next.has(k.id));
        for (const k of kids) { if (allOn) next.delete(k.id); else next.add(k.id); }
        if (allOn) next.delete(d.id); else next.add(d.id);
      } else if (next.has(d.id)) next.delete(d.id);
      else next.add(d.id);
      return next;
    });
  };
  const onToggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <TreeView<Row & { id: number }>
      nodes={nodes as any}
      renderNode={(d) => <span>{(d as any).label}</span>}
      expandedIds={expanded}
      onToggleExpand={onToggleExpand}
      checkStateOf={(d) => {
        const st = checkStateOf(d as any);
        if (st !== 'unchecked') return st;
        // derive indeterminate for categories with some children checked
        const kids = ROWS.filter(r => r.parentId === (d as any).id);
        if (kids.some(k => checked.has(k.id))) return 'indeterminate';
        return 'unchecked';
      }}
      onToggleCheck={(d) => onToggleCheck(d as any)}
    />
  );
}

createRoot(document.getElementById('root')!).render(<App />);
