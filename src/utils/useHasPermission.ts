/**
 * useHasPermission — client-side mirror of the server's effective-permission
 * resolution (role tree + permission tree inheritance, see
 * server/services/permissionTree.mjs).
 *
 * Usage: const can = useHasPermission('devices.realtime');
 * Result is cached per permission name for the lifetime of the token so
 * several components can ask the same question with one HTTP round-trip.
 *
 * NOTE: this only gates UI affordances (e.g. whether to open the SSE live
 * feed). The server independently enforces the permission on /api/stream —
 * never treat a `true` here as an authorization decision.
 */

import { useEffect, useState } from 'react';
import { permissionsAPI } from './api';

const cache = new Map<string, Set<string>>(); // token -> effective permission names

async function loadEffectivePermissionNames(): Promise<Set<string>> {
  const token = localStorage.getItem('auth_token') || '';
  if (cache.has(token)) return cache.get(token)!;

  const names = new Set<string>();
  try {
    const raw = localStorage.getItem('auth_user');
    const userId = raw ? JSON.parse(raw)?.id : null;
    if (userId != null) {
      const res = await permissionsAPI.getUserPermissions(String(userId));
      const list: Array<{ Name?: string; name?: string }> =
        (res as any)?.permissions ?? (Array.isArray(res) ? res : []);
      for (const p of list) names.add(p.Name ?? p.name ?? '');
    }
  } catch {
    /* fail closed: no permission names -> gated features stay hidden/offline */
  }

  cache.set(token, names);
  return names;
}

export function useHasPermission(permissionName: string): boolean | null {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let disposed = false;
    loadEffectivePermissionNames().then((names) => {
      if (!disposed) setAllowed(names.has(permissionName));
    });
    return () => { disposed = true; };
  }, [permissionName]);

  return allowed;
}
