/**
 * Archii — WhatsApp Commands
 * Parsea comandos del usuario y genera respuestas con datos de Firestore.
 */

import { fmtCOP, fmtDate } from './helpers';

interface CommandResult {
  text: string;
  buttons?: { id: string; title: string }[];
}

// ─── MAIN MENU ───
export function getMainMenu(): CommandResult {
  return {
    text: `*Archii Bot*\n\nElige una opcion:\n\n1. Mis tareas pendientes\n2. Estado de proyectos\n3. Presupuesto\n4. Equipo\n5. Proximos vencimientos`,
    buttons: [
      { id: 'cmd_tareas', title: 'Mis tareas' },
      { id: 'cmd_proyectos', title: 'Proyectos' },
      { id: 'cmd_presupuesto', title: 'Presupuesto' },
    ],
  };
}

// ─── COMMAND ROUTER ───
export async function processCommand(
  rawMessage: string,
  link: any,
  db: any
): Promise<CommandResult> {
  const msg = rawMessage.toLowerCase().trim();

  if (msg === 'cmd_tareas' || msg.includes('tarea') || msg === '1') {
    return await cmdMisTareas(link, db);
  }
  if (msg === 'cmd_proyectos' || msg.includes('proyecto') || msg === '2') {
    return await cmdProyectos(db);
  }
  if (msg === 'cmd_presupuesto' || msg.includes('presupuesto') || msg === '3' || msg.includes('gasto')) {
    return await cmdPresupuesto(db);
  }
  if (msg === 'cmd_equipo' || msg.includes('equipo') || msg === '4') {
    return await cmdEquipo(db);
  }
  if (msg === 'cmd_vencimientos' || msg.includes('vencimiento') || msg === '5' || msg.includes('fecha')) {
    return await cmdVencimientos(db);
  }
  if (msg.includes('menu') || msg.includes('inicio') || msg === '0') {
    return getMainMenu();
  }
  if (msg === 'ayuda' || msg.includes('help')) {
    return {
      text: `*Comandos disponibles:*\n\n• tareas — Ver mis tareas pendientes\n• proyectos — Estado de proyectos\n• presupuesto — Resumen de gastos\n• equipo — Ver equipo\n• vencimientos — Proximas fechas\n• menu — Volver al menu principal`,
    };
  }

  return {
    text: `No entendi ese comando. Escribe *menu* para ver las opciones disponibles.`,
  };
}

// ─── COMANDO: Mis tareas pendientes ───
async function cmdMisTareas(link: any, db: any): Promise<CommandResult> {
  try {
    // Consulta simple sin orderBy para evitar necesidad de índice compuesto
    const snap = await db
      .collection('tasks')
      .where('assigneeId', '==', link.userId)
      .limit(50)
      .get();

    if (snap.empty) {
      return { text: 'No tienes tareas asignadas.' };
    }

    // Filtrar y ordenar en JavaScript
    const activeStatuses = ['Pendiente', 'En progreso', 'Revision', 'Por hacer'];
    const tasks = snap.docs
      .map((d: any) => ({ id: d.id, ...d.data() }))
      .filter((t: any) => activeStatuses.includes(t.status))
      .sort((a: any, b: any) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      })
      .slice(0, 10);

    if (tasks.length === 0) {
      return { text: 'No tienes tareas pendientes. Todo al dia.' };
    }

    let text = `*Tus tareas pendientes (${tasks.length})*\n\n`;

    tasks.forEach((t: any, i: number) => {
      const prio = t.priority === 'Alta' ? '🔴' : t.priority === 'Media' ? '🟡' : '🟢';
      const status = t.status === 'En progreso' ? '🔄' : t.status === 'Revision' ? '👀' : '⬜';
      const due = t.dueDate ? ` — Vence: ${fmtDate(t.dueDate)}` : '';
      text += `${i + 1}. ${prio} ${status} *${t.title}*${due}\n`;
    });

    text += '\nEscribe "menu" para volver al menu principal';

    return { text };
  } catch (err: any) {
    console.error('[Archii WhatsApp] Error cmd tareas:', err.message);
    return { text: 'Error al obtener tus tareas. Intenta de nuevo.' };
  }
}

// ─── COMANDO: Estado de proyectos ───
async function cmdProyectos(db: any): Promise<CommandResult> {
  try {
    const snap = await db
      .collection('projects')
      .orderBy('updatedAt', 'desc')
      .limit(10)
      .get();

    if (snap.empty) {
      return { text: 'No hay proyectos registrados aun.' };
    }

    const projects = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

    let text = `*Proyectos (${projects.length})*\n\n`;

    projects.forEach((p: any, i: number) => {
      const status = p.status === 'En progreso' ? '🔄' : p.status === 'Completado' ? '✅' : p.status === 'Pausado' ? '⏸️' : '📌';
      const progress = p.progress !== undefined ? `${p.progress}%` : 'N/A';
      const budget = p.budget ? ` — ${fmtCOP(p.budget)}` : '';
      text += `${i + 1}. ${status} *${p.name}* [${progress}]${budget}\n`;
    });

    text += '\nEscribe "menu" para volver';

    return { text };
  } catch (err: any) {
    console.error('[Archii WhatsApp] Error cmd proyectos:', err.message);
    return { text: 'Error al obtener proyectos. Intenta de nuevo.' };
  }
}

// ─── COMANDO: Presupuesto ───
async function cmdPresupuesto(db: any): Promise<CommandResult> {
  try {
    const projectsSnap = await db
      .collection('projects')
      .orderBy('updatedAt', 'desc')
      .limit(5)
      .get();

    if (projectsSnap.empty) {
      return { text: 'No hay proyectos con presupuesto.' };
    }

    const projects = projectsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

    let text = '*Resumen de presupuestos*\n\n';

    for (const p of projects) {
      const budget = Number(p.budget) || 0;

      const expensesSnap = await db
        .collection('expenses')
        .where('projectId', '==', p.id)
        .get();

      const spent = expensesSnap.docs.reduce((sum: number, d: any) => {
        return sum + (Number(d.data().amount) || 0);
      }, 0);

      const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
      const bar = pct > 90 ? '🔴' : pct > 70 ? '🟡' : '🟢';

      text += `*${p.name}*\n`;
      text += `  Presupuesto: ${fmtCOP(budget)}\n`;
      text += `  Gastado: ${fmtCOP(spent)} (${pct}%)\n`;
      text += `  Disponible: ${fmtCOP(budget - spent)} ${bar}\n\n`;
    }

    text += 'Escribe "menu" para volver';

    return { text };
  } catch (err: any) {
    console.error('[Archii WhatsApp] Error cmd presupuesto:', err.message);
    return { text: 'Error al obtener presupuesto. Intenta de nuevo.' };
  }
}

// ─── COMANDO: Equipo ───
async function cmdEquipo(db: any): Promise<CommandResult> {
  try {
    // Los usuarios están en la colección 'users', no 'team'
    const snap = await db
      .collection('users')
      .limit(50)
      .get();

    if (snap.empty) {
      return { text: 'No hay miembros en el equipo.' };
    }

    const members = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

    let text = `*Equipo (${members.length})*\n\n`;

    members.forEach((m: any, i: number) => {
      const role = m.role || 'Miembro';
      const status = m.active === false ? ' ❌' : '';
      text += `${i + 1}. *${m.name}* — ${role}${status}\n`;
    });

    text += '\nEscribe "menu" para volver';

    return { text };
  } catch (err: any) {
    console.error('[Archii WhatsApp] Error cmd equipo:', err.message);
    return { text: 'Error al obtener equipo. Intenta de nuevo.' };
  }
}

// ─── COMANDO: Proximos vencimientos ───
async function cmdVencimientos(db: any): Promise<CommandResult> {
  try {
    const now = new Date().toISOString().split('T')[0];

    const snap = await db
      .collection('tasks')
      .where('status', 'in', ['Pendiente', 'En progreso', 'Por hacer'])
      .orderBy('dueDate', 'asc')
      .limit(10)
      .get();

    if (snap.empty) {
      return { text: 'No hay tareas con fecha limite proxima.' };
    }

    const tasks = snap.docs
      .map((d: any) => ({ id: d.id, ...d.data() }))
      .filter((t: any) => t.dueDate && t.dueDate >= now);

    if (tasks.length === 0) {
      return { text: 'No hay tareas con fecha limite proxima.' };
    }

    let text = `*Proximos vencimientos (${tasks.length})*\n\n`;

    tasks.forEach((t: any, i: number) => {
      const daysLeft = Math.ceil((new Date(t.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      const urgent = daysLeft <= 1 ? '🔴 URGENTE' : daysLeft <= 3 ? '🟡 Pronto' : '📅';
      text += `${i + 1}. ${urgent} *${t.title}*\n   Vence: ${fmtDate(t.dueDate)} (${daysLeft} dias)\n\n`;
    });

    text += 'Escribe "menu" para volver';

    return { text };
  } catch (err: any) {
    console.error('[Archii WhatsApp] Error cmd vencimientos:', err.message);
    return { text: 'Error al obtener vencimientos. Intenta de nuevo.' };
  }
}

// ─── LINKING FLOW (Firestore-persisted, serverless-compatible) ───

export function getWelcomeMessage(): CommandResult {
  return {
    text: `Bienvenido a *Archii Bot*!\n\nPara usar el bot necesitas vincular tu cuenta de Archii.\n\n*Paso 1:* Escribe tu email registrado en Archii.\n\nEjemplo: juan@email.com`,
    buttons: [{ id: 'link_start', title: 'Vincular cuenta' }],
  };
}

export function getLinkedSuccess(name: string): CommandResult {
  return {
    text: `Cuenta vinculada exitosamente!\n\nBienvenido, *${name}*.\n\nEscribe *menu* para ver las opciones disponibles.`,
    buttons: [
      { id: 'cmd_tareas', title: 'Mis tareas' },
      { id: 'cmd_proyectos', title: 'Proyectos' },
    ],
  };
}
