'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import type { TimeEntry, Invoice, InvoiceItem } from '@/lib/types';
import { getFirebase } from '@/lib/firebase-service';
import * as fbActions from '@/lib/firestore-actions';

/* ===== TYPES ===== */
export interface TimeTrackingContextValue {
  // Time Tracking State
  timeEntries: TimeEntry[];
  timeTab: 'tracker' | 'entries' | 'summary';
  setTimeTab: React.Dispatch<React.SetStateAction<'tracker' | 'entries' | 'summary'>>;
  timeFilterProject: string;
  setTimeFilterProject: React.Dispatch<React.SetStateAction<string>>;
  timeFilterDate: string;
  setTimeFilterDate: React.Dispatch<React.SetStateAction<string>>;
  timeSession: { entryId: string | null; startTime: number | null; description: string; projectId: string; phaseName: string; isRunning: boolean };
  timeTimerMs: number;

  // Invoice State
  invoices: Invoice[];
  invoiceTab: 'list' | 'create';
  setInvoiceTab: React.Dispatch<React.SetStateAction<'list' | 'create'>>;
  invoiceItems: InvoiceItem[];
  invoiceFilterStatus: string;
  setInvoiceFilterStatus: React.Dispatch<React.SetStateAction<string>>;

  // Functions
  startTimeTracking: () => void;
  stopTimeTracking: () => Promise<void>;
  saveManualTimeEntry: () => void;
  openNewInvoice: () => void;
  updateInvoiceItem: (idx: number, field: string, value: any) => void;
  addInvoiceItem: () => void;
  removeInvoiceItem: (idx: number) => void;
  saveInvoice: () => void;
}

const TimeTrackingContext = createContext<TimeTrackingContextValue>(null!);

/* ===== PROVIDER ===== */
export function TimeTrackingProvider({ children }: { children: React.ReactNode }) {
  const { authUser, activeTenantId, ready, forms, setForms, editingId, setEditingId, closeModal, showToast } = useApp();

  // ===== TIME TRACKING STATE =====
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [timeTab, setTimeTab] = useState<'tracker' | 'entries' | 'summary'>('tracker');
  const [timeFilterProject, setTimeFilterProject] = useState<string>('all');
  const [timeFilterDate, setTimeFilterDate] = useState<string>('');
  const [timeSession, setTimeSession] = useState<{ entryId: string | null; startTime: number | null; description: string; projectId: string; phaseName: string; isRunning: boolean }>({ entryId: null, startTime: null, description: '', projectId: '', phaseName: '', isRunning: false });
  const [timeTimerMs, setTimeTimerMs] = useState(0);

  // ===== INVOICE STATE =====
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceTab, setInvoiceTab] = useState<'list' | 'create'>('list');
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [invoiceFilterStatus, setInvoiceFilterStatus] = useState<string>('all');

  // ===== FIRESTORE LISTENERS =====

  // Load time entries (tenant-filtered)
  useEffect(() => {
    if (!ready || !authUser || !activeTenantId) { setTimeEntries([]); return; }
    const db = getFirebase().firestore();
    const unsub = db.collection('timeEntries').where('tenantId', '==', activeTenantId).orderBy('createdAt', 'desc').limit(200).onSnapshot(snap => {
      setTimeEntries(snap.docs.map((d: any) => ({ id: d.id, data: d.data() })));
    }, () => {});
    return () => unsub();
  }, [ready, authUser, activeTenantId]);

  // Load invoices (tenant-filtered)
  useEffect(() => {
    if (!ready || !authUser || !activeTenantId) { setInvoices([]); return; }
    const db = getFirebase().firestore();
    const unsub = db.collection('invoices').where('tenantId', '==', activeTenantId).orderBy('createdAt', 'desc').limit(100).onSnapshot(snap => {
      setInvoices(snap.docs.map((d: any) => ({ id: d.id, data: d.data() })));
    }, () => {});
    return () => unsub();
  }, [ready, authUser, activeTenantId]);

  // Time tracker: live timer update
  useEffect(() => {
    if (!timeSession.isRunning || !timeSession.startTime) return;
    const interval = setInterval(() => {
      setTimeTimerMs(Date.now() - timeSession.startTime!);
    }, 1000);
    return () => clearInterval(interval);
  }, [timeSession.isRunning, timeSession.startTime]);

  // ===== TIME TRACKING FUNCTIONS =====
  const startTimeTracking = () => {
    if (timeSession.isRunning) return;
    const desc = forms.teDescription || forms.teQuickDesc || 'Trabajo en proyecto';
    const projId = forms.teProject || '';
    const phase = forms.tePhase || '';
    if (!projId) { showToast('Selecciona un proyecto', 'error'); return; }
    const entryId = 'temp-' + Date.now();
    setTimeSession({ entryId: null, startTime: Date.now(), description: desc, projectId: projId, phaseName: phase, isRunning: true });
    setTimeTimerMs(0);
  };

  const stopTimeTracking = async () => {
    if (!timeSession.isRunning || !timeSession.startTime) return;
    const endTime = new Date();
    const startTime = new Date(timeSession.startTime);
    const durationMin = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
    if (durationMin < 1) { showToast('Mínimo 1 minuto', 'error'); return; }
    const dateStr = startTime.toISOString().split('T')[0];
    const startStr = startTime.toTimeString().substring(0, 5);
    const endStr = endTime.toTimeString().substring(0, 5);
    await fbActions.saveTimeEntry({
      teProject: timeSession.projectId,
      tePhase: timeSession.phaseName,
      teDescription: timeSession.description,
      teStartTime: startStr,
      teEndTime: endStr,
      teDuration: durationMin,
      teBillable: true,
      teRate: Number(forms.teRate) || 50000,
      teDate: dateStr,
    }, null, showToast, authUser, activeTenantId);
    setTimeSession({ entryId: null, startTime: null, description: '', projectId: '', phaseName: '', isRunning: false });
    setTimeTimerMs(0);
  };

  const saveManualTimeEntry = () => {
    const dur = Number(forms.teManualDuration) || 0;
    if (dur < 1) { showToast('Mínimo 1 minuto', 'error'); return; }
    if (!forms.teProject) { showToast('Selecciona un proyecto', 'error'); return; }
    fbActions.saveTimeEntry({
      teProject: forms.teProject,
      tePhase: forms.tePhase || '',
      teDescription: forms.teDescription || '',
      teStartTime: forms.teStartTime || '08:00',
      teEndTime: forms.teEndTime || '17:00',
      teDuration: dur,
      teBillable: forms.teBillable !== false,
      teRate: Number(forms.teRate) || 50000,
      teDate: forms.teDate || new Date().toISOString().split('T')[0],
    }, editingId, showToast, authUser, activeTenantId);
    closeModal('timeEntry');
  };

  /* ===== INVOICE FUNCTIONS ===== */
  const openNewInvoice = () => {
    setEditingId(null);
    setInvoiceItems([{ concept: '', phase: '', hours: 0, rate: 50000, amount: 0 }]);
    setForms(p => ({ ...p, invProject: '', invNumber: '', invStatus: 'Borrador', invTax: 19, invNotes: '', invIssueDate: new Date().toISOString().split('T')[0], invDueDate: '' }));
    setInvoiceTab('create');
  };

  const updateInvoiceItem = (idx: number, field: string, value: any) => {
    setInvoiceItems(prev => {
      const items = [...prev];
      items[idx] = { ...items[idx], [field]: value };
      if (field === 'hours' || field === 'rate') {
        items[idx].amount = (Number(items[idx].hours) || 0) * (Number(items[idx].rate) || 0);
      }
      return items;
    });
  };

  const addInvoiceItem = () => setInvoiceItems(prev => [...prev, { concept: '', phase: '', hours: 0, rate: 50000, amount: 0 }]);

  const removeInvoiceItem = (idx: number) => {
    if (invoiceItems.length <= 1) return;
    setInvoiceItems(prev => prev.filter((_, i) => i !== idx));
  };

  const saveInvoice = () => {
    if (!forms.invProject) { showToast('Selecciona un proyecto', 'error'); return; }
    const subtotal = invoiceItems.reduce((s, item) => s + (Number(item.amount) || 0), 0);
    const tax = Number(forms.invTax) || 19;
    const total = subtotal + (subtotal * tax / 100);
    fbActions.saveInvoice({
      invProject: forms.invProject,
      invNumber: forms.invNumber || '',
      invStatus: forms.invStatus || 'Borrador',
      invItems: invoiceItems,
      invSubtotal: subtotal,
      invTax: tax,
      invTotal: total,
      invNotes: forms.invNotes || '',
      invIssueDate: forms.invIssueDate || new Date().toISOString().split('T')[0],
      invDueDate: forms.invDueDate || '',
    }, editingId, showToast, authUser, activeTenantId);
    setInvoiceTab('list');
  };

  // ===== CONTEXT VALUE =====
  const value: TimeTrackingContextValue = {
    timeEntries, timeTab, setTimeTab, timeFilterProject, setTimeFilterProject,
    timeFilterDate, setTimeFilterDate, timeSession, timeTimerMs,
    invoices, invoiceTab, setInvoiceTab, invoiceItems, invoiceFilterStatus, setInvoiceFilterStatus,
    startTimeTracking, stopTimeTracking, saveManualTimeEntry,
    openNewInvoice, updateInvoiceItem, addInvoiceItem, removeInvoiceItem, saveInvoice,
  };

  return <TimeTrackingContext.Provider value={value}>{children}</TimeTrackingContext.Provider>;
}

/* ===== HOOK ===== */
export function useTimeTrackingContext() {
  const ctx = useContext(TimeTrackingContext);
  if (!ctx) throw new Error('useTimeTrackingContext must be used within a TimeTrackingProvider');
  return ctx;
}
