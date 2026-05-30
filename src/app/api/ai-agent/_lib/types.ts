import type { Firestore } from "firebase-admin/firestore";

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ExecutedAction {
  type: string;
  label: string;
  icon: string;
  details: string;
  success: boolean;
  error?: string;
}

export type FirestoreDoc = { id: string; data: Record<string, any> };

export interface ToolContext {
  db: Firestore;
  userUid: string;
  actions: ExecutedAction[];
  tenantId: string;
  userRole?: string;
}
