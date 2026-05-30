import type { FirestoreDoc } from "./types";

export function formatCOP(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function findProjectByName(projects: FirestoreDoc[], name: string): FirestoreDoc | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  return (
    projects.find((p) => p.data?.name?.toLowerCase() === lower) ??
    projects.find((p) => p.data?.name?.toLowerCase().includes(lower))
  ) ?? null;
}

export function findTaskByTitle(tasks: FirestoreDoc[], title: string): FirestoreDoc | null {
  if (!title) return null;
  const lower = title.toLowerCase();
  return (
    tasks.find((t) => t.data?.title?.toLowerCase() === lower) ??
    tasks.find((t) => t.data?.title?.toLowerCase().includes(lower))
  ) ?? null;
}
