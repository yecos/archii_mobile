'use client';

import { useMemo } from 'react';

/**
 * Hook that provides entity resolver functions
 * shared across screens (RFIs, Submittals, PunchList, Tasks, etc.)
 * Replaces the duplicated getProjectName/getUserName in each screen.
 */
export function useEntityResolvers(projects: any[], teamUsers: any[]) {
  const projectMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) {
      map.set(p.id, p?.data?.name || 'Sin proyecto');
    }
    return map;
  }, [projects]);

  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of teamUsers) {
      map.set(u.id, u?.data?.name || u.id);
    }
    return map;
  }, [teamUsers]);

  const getProjectName = (pid: string) => projectMap.get(pid) || 'Sin proyecto';

  const getUserName = (uid: string) => userMap.get(uid) || uid;

  return { getProjectName, getUserName, projectMap, userMap };
}
