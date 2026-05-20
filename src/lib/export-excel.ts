/**
 * export-excel.ts
 * Exportación a Excel usando SheetJS (xlsx).
 * Archii v2.0 — Exportar datos tabulares a .xlsx
 */

import * as XLSX from 'xlsx';
import { isOverdue as checkOverdue } from './kanban-helpers';

function fmtCOPFull(n: number): string {
  if (!n || n === 0) return '$0';
  return '$' + Number(n).toLocaleString('es-CO');
}

function fmtDurationMinutes(mins: number): string {
  if (!mins || mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().split('T')[0]}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ═══════════════════════════════════════════════
   EXPORTAR TAREAS A EXCEL
   ═══════════════════════════════════════════════ */

export function exportTasksExcel(tasks: any[], projects: any[], teamUsers: any[]) {
  const wb = XLSX.utils.book_new();

  const getAssigneeNames = (t: any): string => {
    const ids: string[] = Array.isArray(t.data.assigneeIds) && t.data.assigneeIds.length > 0
      ? t.data.assigneeIds
      : t.data.assigneeId ? [t.data.assigneeId] : [];
    return ids.map((uid: string) => {
      const u = teamUsers.find((tu: any) => tu.id === uid);
      return u?.data?.name || uid;
    }).join(', ') || '-';
  };

  const data = tasks.map(t => {
    const proj = projects.find(p => p.id === t.data.projectId);
    const sts: { text: string; done: boolean }[] = Array.isArray(t.data.subtasks) ? t.data.subtasks : [];
    const stDone = sts.filter(s => s.done).length;
    const tags = Array.isArray(t.data.tags) ? t.data.tags.join(', ') : '-';
    return {
      Tarea: t.data.title,
      Descripcion: t.data.description || '-',
      Proyecto: proj?.data?.name || '-',
      Prioridad: t.data.priority || '-',
      Estado: t.data.status || '-',
      Asignado: getAssigneeNames(t),
      'Fecha Limite': t.data.dueDate || '-',
      'Horas Estimadas': t.data.estimatedHours || '-',
      Subtareas: sts.length > 0 ? `${stDone}/${sts.length}` : '-',
      Etiquetas: tags,
      'Creado': t.data.createdAt ? (t.data.createdAt.toDate ? t.data.createdAt.toDate().toLocaleDateString('es-CO') : new Date(t.data.createdAt).toLocaleDateString('es-CO')) : '-',
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 35 }, { wch: 35 }, { wch: 25 }, { wch: 12 }, { wch: 14 },
    { wch: 25 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 20 }, { wch: 14 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Tareas');

  // Summary sheet
  const statuses: Record<string, number> = {};
  const prios: Record<string, number> = {};
  tasks.forEach(t => {
    statuses[t.data.status || 'Sin estado'] = (statuses[t.data.status || 'Sin estado'] || 0) + 1;
    prios[t.data.priority || 'Sin prioridad'] = (prios[t.data.priority || 'Sin prioridad'] || 0) + 1;
  });

  const summaryData = [
    { Metrica: 'Total tareas', Valor: tasks.length },
    { Metrica: 'Completadas', Valor: statuses['Completado'] || 0 },
    { Metrica: 'En progreso', Valor: statuses['En progreso'] || 0 },
    { Metrica: 'Por hacer', Valor: statuses['Por hacer'] || 0 },
    { Metrica: 'En revision', Valor: statuses['Revision'] || 0 },
    { Metrica: 'Prioridad Alta', Valor: prios['Alta'] || 0 },
    { Metrica: 'Prioridad Media', Valor: prios['Media'] || 0 },
    { Metrica: 'Prioridad Baja', Valor: prios['Baja'] || 0 },
  ];
  const ws2 = XLSX.utils.json_to_sheet(summaryData);
  ws2['!cols'] = [{ wch: 22 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Resumen');

  // Per-member productivity sheet
  const assigneeSummary: Record<string, { total: number; done: number; overdue: number }> = {};
  tasks.forEach(t => {
    const ids: string[] = Array.isArray(t.data.assigneeIds) && t.data.assigneeIds.length > 0
      ? t.data.assigneeIds
      : t.data.assigneeId ? [t.data.assigneeId] : [];
    ids.forEach(uid => {
      if (!uid) return;
      const name = teamUsers.find((u: any) => u.id === uid)?.data?.name || uid;
      if (!assigneeSummary[name]) assigneeSummary[name] = { total: 0, done: 0, overdue: 0 };
      assigneeSummary[name].total++;
      if (t.data.status === 'Completado') assigneeSummary[name].done++;
      if (t.data.status !== 'Completado' && t.data.dueDate && checkOverdue(t.data.dueDate)) assigneeSummary[name].overdue++;
    });
  });

  const memberRows = Object.entries(assigneeSummary).map(([name, d]) => ({
    Miembro: name,
    'Tareas Totales': d.total,
    Completadas: d.done,
    Vencidas: d.overdue,
    '% Cumplimiento': d.total > 0 ? Math.round((d.done / d.total) * 100) + '%' : '0%',
  }));
  if (memberRows.length > 0) {
    const ws3 = XLSX.utils.json_to_sheet(memberRows);
    ws3['!cols'] = [{ wch: 25 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Productividad');
  }

  downloadWorkbook(wb, 'archii-tareas');
}

/* ═══════════════════════════════════════════════
   EXPORTAR GASTOS A EXCEL
   ═══════════════════════════════════════════════ */

export function exportExpensesExcel(expenses: any[], projects: any[]) {
  const wb = XLSX.utils.book_new();

  const data = expenses.map(e => {
    const proj = projects.find(p => p.id === e.data.projectId);
    return {
      Concepto: e.data.concept,
      Proyecto: proj?.data.name || '-',
      Categoría: e.data.category || '-',
      Monto: e.data.amount || 0,
      Fecha: e.data.date || '-',
      'Método de pago': e.data.paymentMethod || '-',
      Proveedor: e.data.vendor || '-',
      Notas: e.data.notes || '-',
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 35 }, { wch: 25 }, { wch: 18 }, { wch: 15 }, { wch: 14 }, { wch: 18 }, { wch: 22 }, { wch: 30 },
  ];

  // Summary
  const catSummary: Record<string, number> = {};
  expenses.forEach(e => {
    const c = e.data.category || 'Otro';
    catSummary[c] = (catSummary[c] || 0) + (e.data.amount || 0);
  });

  const summaryRows = Object.entries(catSummary).sort((a, b) => b[1] - a[1]).map(([cat, total]) => ({
    Categoría: cat,
    Total: total,
    '%': expenses.length > 0 ? (total / expenses.reduce((s, e) => s + (e.data.amount || 0), 0) * 100).toFixed(1) + '%' : '0%',
  }));
  summaryRows.push({
    Categoría: 'TOTAL GENERAL',
    Total: expenses.reduce((s, e) => s + (e.data.amount || 0), 0),
    '%': '100%',
  });

  const ws2 = XLSX.utils.json_to_sheet(summaryRows);
  ws2['!cols'] = [{ wch: 20 }, { wch: 18 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Resumen Categorías');

  XLSX.utils.book_append_sheet(wb, ws, 'Gastos');
  // Move summary to first position
  wb.SheetNames = ['Resumen Categorías', 'Gastos'];

  downloadWorkbook(wb, 'archii-gastos');
}

/* ═══════════════════════════════════════════════
   EXPORTAR TIEMPO A EXCEL
   ═══════════════════════════════════════════════ */

export function exportTimeExcel(timeEntries: any[], projects: any[], teamUsers: any[]) {
  const wb = XLSX.utils.book_new();

  const data = timeEntries.map(e => {
    const proj = projects.find(p => p.id === e.data.projectId);
    const user = teamUsers.find(u => u.id === e.data.userId);
    return {
      Proyecto: proj?.data.name || '-',
      Fase: e.data.phaseName || '-',
      Miembro: e.data.userName || user?.data.name || '-',
      Descripción: e.data.description || '-',
      'Duración (min)': e.data.duration || 0,
      'Duración': fmtDurationMinutes(e.data.duration || 0),
      Facturable: e.data.billable ? 'Sí' : 'No',
      'Tarifa (COP/h)': e.data.rate || 0,
      'Valor (COP)': Math.round((e.data.duration || 0) * (e.data.rate || 0) / 60),
      Fecha: e.data.date || '-',
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 25 }, { wch: 18 }, { wch: 20 }, { wch: 35 }, { wch: 12 },
    { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Registros');

  // Summary by member
  const byMember: Record<string, { total: number; billable: number; value: number }> = {};
  timeEntries.forEach(e => {
    const name = e.data.userName || '-';
    if (!byMember[name]) byMember[name] = { total: 0, billable: 0, value: 0 };
    byMember[name].total += e.data.duration || 0;
    if (e.data.billable) {
      byMember[name].billable += e.data.duration || 0;
      byMember[name].value += Math.round((e.data.duration || 0) * (e.data.rate || 0) / 60);
    }
  });

  const memberRows = Object.entries(byMember).map(([name, data]) => ({
    Miembro: name,
    'Total Horas': fmtDurationMinutes(data.total),
    'Facturable': fmtDurationMinutes(data.billable),
    'Valor Facturable': data.value,
  }));

  const ws2 = XLSX.utils.json_to_sheet(memberRows);
  ws2['!cols'] = [{ wch: 25 }, { wch: 14 }, { wch: 14 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Por Miembro');

  wb.SheetNames = ['Registros', 'Por Miembro'];
  downloadWorkbook(wb, 'archii-tiempo');
}

/* ═══════════════════════════════════════════════
   EXPORTAR INVENTARIO A EXCEL
   ═══════════════════════════════════════════════ */

export function exportInventoryExcel(products: any[], categories: any[], movements: any[]) {
  const wb = XLSX.utils.book_new();

  // Products sheet
  const prodData = products.map(p => {
    const cat = categories.find(c => c.id === p.data.categoryId);
    return {
      Producto: p.data.name,
      SKU: p.data.sku || '-',
      Categoría: cat?.data.name || '-',
      Unidad: p.data.unit || '-',
      'Precio (COP)': p.data.price || 0,
      'Stock Total': p.data.stock || 0,
      'Stock Mínimo': p.data.minStock || 0,
      Bodega: p.data.warehouse || '-',
    };
  });

  const ws = XLSX.utils.json_to_sheet(prodData);
  ws['!cols'] = [
    { wch: 30 }, { wch: 15 }, { wch: 18 }, { wch: 10 }, { wch: 14 },
    { wch: 12 }, { wch: 12 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Productos');

  // Movements sheet
  const movData = movements.map(m => ({
    Producto: m.data.productId || '-',
    Tipo: m.data.type,
    Cantidad: m.data.quantity || 0,
    Razón: m.data.reason || '-',
    Referencia: m.data.reference || '-',
    Fecha: m.data.date || '-',
  }));

  if (movData.length > 0) {
    const ws2 = XLSX.utils.json_to_sheet(movData);
    ws2['!cols'] = [{ wch: 25 }, { wch: 10 }, { wch: 10 }, { wch: 25 }, { wch: 15 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Movimientos');
  }

  // Low stock alert
  const lowStock = products.filter(p => (p.data.stock || 0) <= (p.data.minStock || 0));
  if (lowStock.length > 0) {
    const lowData = lowStock.map(p => ({
      Producto: p.data.name,
      'Stock Actual': p.data.stock || 0,
      'Stock Mínimo': p.data.minStock || 0,
      'Diferencia': (p.data.stock || 0) - (p.data.minStock || 0),
    }));
    const ws3 = XLSX.utils.json_to_sheet(lowData);
    ws3['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Stock Bajo');
  }

  downloadWorkbook(wb, 'archii-inventario');
}

/* ═══════════════════════════════════════════════
   EXPORTAR PROYECTOS A EXCEL
   ═══════════════════════════════════════════════ */

export function exportProjectsExcel(projects: any[], tasks: any[], expenses: any[]) {
  const wb = XLSX.utils.book_new();

  const data = projects.map(p => {
    const projTasks = tasks.filter(t => t.data.projectId === p.id);
    const projExpenses = expenses.filter(e => e.data.projectId === p.id);
    const totalSpent = projExpenses.reduce((s, e) => s + (e.data.amount || 0), 0);
    const completedTasks = projTasks.filter(t => t.data.status === 'Completado').length;

    return {
      Proyecto: p.data.name,
      Estado: p.data.status,
      Cliente: p.data.client || '-',
      Ubicación: p.data.location || '-',
      Presupuesto: p.data.budget || 0,
      Gastado: totalSpent,
      'Saldo': (p.data.budget || 0) - totalSpent,
      Progreso: `${p.data.progress || 0}%`,
      'Tareas': projTasks.length,
      'Tareas Completadas': completedTasks,
      'Fecha Inicio': p.data.startDate || '-',
      'Fecha Entrega': p.data.endDate || '-',
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 30 }, { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 15 },
    { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 16 },
    { wch: 14 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Proyectos');

  downloadWorkbook(wb, 'archii-proyectos');
}

/* ═══════════════════════════════════════════════
   EXPORTAR EQUIPO A EXCEL
   ═══════════════════════════════════════════════ */

export function exportTeamExcel(teamUsers: any[], tasks: any[], timeEntries: any[]) {
  const wb = XLSX.utils.book_new();

  // Per-member data
  const memberData = teamUsers.map(u => {
    const userTasks = tasks.filter(t => t.data.assigneeId === u.id);
    const done = userTasks.filter(t => t.data.status === 'Completado').length;
    const overdue = userTasks.filter(t => t.data.status !== 'Completado' && t.data.dueDate && checkOverdue(t.data.dueDate)).length;
    const mins = timeEntries.filter(e => e.data.userId === u.id).reduce((s, e) => s + (e.data.duration || 0), 0);
    const role = u.data.role || 'Miembro';
    return {
      Miembro: u.data.name || '-',
      Rol: role,
      'Tareas Totales': userTasks.length,
      Completadas: done,
      'Pendientes': userTasks.length - done,
      Vencidas: overdue,
      '% Cumplimiento': userTasks.length > 0 ? Math.round((done / userTasks.length) * 100) + '%' : '0%',
      'Horas Registradas': fmtDurationMinutes(mins),
    };
  });

  const ws = XLSX.utils.json_to_sheet(memberData);
  ws['!cols'] = [
    { wch: 25 }, { wch: 15 }, { wch: 14 }, { wch: 12 },
    { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Productividad');

  // Role distribution summary
  const roleDist: Record<string, number> = {};
  teamUsers.forEach(u => { const r = u.data.role || 'Miembro'; roleDist[r] = (roleDist[r] || 0) + 1; });
  const roleRows = Object.entries(roleDist).sort((a, b) => b[1] - a[1]).map(([role, count]) => ({
    Rol: role,
    'Cantidad': count,
  }));
  const ws2 = XLSX.utils.json_to_sheet(roleRows);
  ws2['!cols'] = [{ wch: 20 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Roles');

  downloadWorkbook(wb, 'archii-equipo');
}

/* ═══════════════════════════════════════════════
   EXPORTAR OBRA A EXCEL
   ═══════════════════════════════════════════════ */

export function exportObraExcel(data: { rfis: any[]; submittals: any[]; punchItems: any[]; dailyLogs: any[]; projects: any[] }) {
  const wb = XLSX.utils.book_new();

  // RFIs sheet
  const rfiData = data.rfis.map(r => {
    const proj = data.projects.find(p => p.id === r.data.projectId);
    return {
      Numero: r.data.number || '-',
      Asunto: r.data.subject || '-',
      Estado: r.data.status || '-',
      Prioridad: r.data.priority || '-',
      Proyecto: proj?.data.name || '-',
      'Fecha Limite': r.data.dueDate || '-',
      'Asignado A': r.data.assignedTo || '-',
    };
  });
  if (rfiData.length > 0) {
    const ws = XLSX.utils.json_to_sheet(rfiData);
    ws['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 14 }, { wch: 12 }, { wch: 25 }, { wch: 14 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, 'RFIs');
  }

  // Submittals sheet
  const subData = data.submittals.map(s => {
    const proj = data.projects.find(p => p.id === s.data.projectId);
    return {
      Numero: s.data.number || '-',
      Titulo: s.data.title || '-',
      Estado: s.data.status || '-',
      Proyecto: proj?.data.name || '-',
      Especificacion: s.data.specification || '-',
      'Enviado Por': s.data.submittedBy || '-',
      'Revisor': s.data.reviewer || '-',
    };
  });
  if (subData.length > 0) {
    const ws2 = XLSX.utils.json_to_sheet(subData);
    ws2['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 14 }, { wch: 25 }, { wch: 20 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Submittals');
  }

  // Punch List sheet
  const punchData = data.punchItems.map(p => {
    const proj = data.projects.find(pr => pr.id === p.data.projectId);
    return {
      Titulo: p.data.title || '-',
      Estado: p.data.status || '-',
      Prioridad: p.data.priority || '-',
      Ubicacion: p.data.location || '-',
      'Asignado A': p.data.assignedTo || '-',
      Proyecto: proj?.data.name || '-',
      'Fecha Limite': p.data.dueDate || '-',
    };
  });
  if (punchData.length > 0) {
    const ws3 = XLSX.utils.json_to_sheet(punchData);
    ws3['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 12 }, { wch: 20 }, { wch: 18 }, { wch: 25 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Punch List');
  }

  // Summary sheet
  const rfiResolved = data.rfis.filter(r => r.data.status === 'Respondido' || r.data.status === 'Cerrado').length;
  const subApproved = data.submittals.filter(s => s.data.status === 'Aprobado').length;
  const punchDone = data.punchItems.filter(p => p.data.status === 'Completado').length;
  const summaryRows = [
    { Modulo: 'RFIs', 'Total': data.rfis.length, 'Resueltos': rfiResolved, 'Pendientes': data.rfis.length - rfiResolved },
    { Modulo: 'Submittals', 'Total': data.submittals.length, 'Aprobados': subApproved, 'Pendientes': data.submittals.length - subApproved },
    { Modulo: 'Punch List', 'Total': data.punchItems.length, 'Completados': punchDone, 'Pendientes': data.punchItems.length - punchDone },
    { Modulo: 'Bitacoras', 'Total': data.dailyLogs.length, 'Resueltos': '-', 'Pendientes': '-' },
  ];
  const ws4 = XLSX.utils.json_to_sheet(summaryRows);
  ws4['!cols'] = [{ wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws4, 'Resumen');

  // Move summary first
  wb.SheetNames = ['Resumen', 'RFIs', 'Submittals', 'Punch List'];

  downloadWorkbook(wb, 'archii-obra');
}
