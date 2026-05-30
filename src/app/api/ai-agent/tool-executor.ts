import type { Firestore } from "firebase-admin/firestore";
import { getAdminFieldValue } from "@/lib/firebase-admin";
import { getNextSequentialNumber, atomicStockUpdate } from "@/app/api/_lib/counter";
import { ADMIN_ONLY_TOOLS } from "./tools";

// ─── TOOL EXECUTION ENGINE ──────────────────────────────────────────

interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface ExecutedAction {
  type: string;
  label: string;
  icon: string;
  details: string;
  success: boolean;
  error?: string;
}

function formatCOP(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}

type FirestoreDoc = { id: string; data: Record<string, any> };

function findProjectByName(projects: FirestoreDoc[], name: string): FirestoreDoc | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  return (
    projects.find((p) => p.data?.name?.toLowerCase() === lower) ??
    projects.find((p) => p.data?.name?.toLowerCase().includes(lower))
  ) ?? null;
}

function findTaskByTitle(tasks: FirestoreDoc[], title: string): FirestoreDoc | null {
  if (!title) return null;
  const lower = title.toLowerCase();
  return (
    tasks.find((t) => t.data?.title?.toLowerCase() === lower) ??
    tasks.find((t) => t.data?.title?.toLowerCase().includes(lower))
  ) ?? null;
}

async function executeToolCall(
  name: string,
  args: Record<string, any>,
  db: Firestore,
  userUid: string,
  actions: ExecutedAction[],
  tenantId: string,
  userRole?: string
): Promise<string> {
  const FieldValue = getAdminFieldValue();
  const ts = FieldValue.serverTimestamp();

  try {
    // SECURITY: Role-based access control for write/update/delete operations
    if (ADMIN_ONLY_TOOLS.has(name)) {
      const allowedRoles = ["Admin", "Director", "Super Admin"];
      if (!userRole || !allowedRoles.includes(userRole)) {
        const error = `Lo siento, solo Administradores o Directores pueden ejecutar "${name}". Contacta al admin de tu equipo.`;
        actions.push({ type: "permission_denied", label: "Sin permisos", icon: "🔒", details: error, success: false, error });
        return error;
      }
    }

    switch (name) {
      // ── READ OPERATIONS ──
      case "get_projects": {
        let query = db.collection("projects").where("tenantId", "==", tenantId).orderBy("createdAt", "desc");
        const snap = await query.limit(20).get();
        const projects = snap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
        const filter = args.status_filter;
        const filtered = filter
          ? projects.filter((p: any) => p.data?.status === filter)
          : projects;

        if (filtered.length === 0) {
          return filter
            ? `No se encontraron proyectos con estado "${filter}".`
            : "No hay proyectos creados aún.";
        }

        const lines = filtered.map(
          (p: any) =>
            `- **${p.data.name}**: ${p.data.status || "Sin estado"} | Cliente: ${p.data.client || "N/A"} | ${p.data.location || ""} | Presupuesto: ${formatCOP(p.data.budget || 0)} | Progreso: ${p.data.progress || 0}% [ID: ${p.id}]`
        );
        return `Proyectos encontrados (${filtered.length}):\n${lines.join("\n")}`;
      }

      case "get_project_detail": {
        const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).orderBy("createdAt", "desc").limit(20).get();
        const allProjects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
        const project = args.project_id
          ? allProjects.find((p: any) => p.id === args.project_id)
          : args.project_name
          ? findProjectByName(allProjects, args.project_name)
          : null;

        if (!project) {
          return args.project_name
            ? `No encontré un proyecto llamado "${args.project_name}". Proyectos disponibles: ${allProjects.map((p: any) => p.data.name).join(", ") || "ninguno"}`
            : "No se especificó ningún proyecto. Por favor indica cuál proyecto quieres consultar.";
        }

        // Get tasks
        const tasksSnap = await db
          .collection("tasks")
          .where("tenantId", "==", tenantId)
          .where("projectId", "==", project.id)
          .limit(50)
          .get();
        const tasks = tasksSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));

        // Get expenses
        const expSnap = await db
          .collection("expenses")
          .where("tenantId", "==", tenantId)
          .where("projectId", "==", project.id)
          .limit(50)
          .get();
        const expenses = expSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));

        // Get phases
        const phasesSnap = await db
          .collection("projects")
          .doc(project.id)
          .collection("workPhases")
          .orderBy("order", "asc")
          .get();
        const phases = phasesSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));

        const totalExpenses = expenses.reduce((sum: number, e: any) => sum + (e.data.amount || 0), 0);
        const taskByStatus: Record<string, number> = {};
        tasks.forEach((t: any) => {
          const s = t.data.status || "Sin estado";
          taskByStatus[s] = (taskByStatus[s] || 0) + 1;
        });

        let detail = `## ${project.data.name}\n`;
        detail += `**Estado:** ${project.data.status} | **Progreso:** ${project.data.progress || 0}%\n`;
        detail += `**Cliente:** ${project.data.client || "N/A"} | **Ubicación:** ${project.data.location || "N/A"}\n`;
        detail += `**Presupuesto:** ${formatCOP(project.data.budget || 0)} | **Gastado:** ${formatCOP(totalExpenses)}\n`;
        if (project.data.description) detail += `**Descripción:** ${project.data.description}\n`;

        if (phases.length > 0) {
          detail += `\n### Fases de obra:\n`;
          phases.forEach((ph: any) => {
            detail += `- ${ph.data.name}: ${ph.data.status} ${ph.data.startDate ? `(${ph.data.startDate} → ${ph.data.endDate || "?"})` : ""}\n`;
          });
        }

        detail += `\n### Resumen de tareas (${tasks.length} total):\n`;
        Object.entries(taskByStatus).forEach(([status, count]) => {
          detail += `- ${status}: ${count}\n`;
        });

        if (expenses.length > 0) {
          detail += `\n### Últimos gastos:\n`;
          expenses.slice(0, 5).forEach((e: any) => {
            detail += `- ${e.data.concept}: ${formatCOP(e.data.amount)} (${e.data.category || "Otro"})\n`;
          });
        }

        detail += `\n[ID del proyecto: ${project.id}]`;
        return detail;
      }

      case "get_tasks": {
        let query = db.collection("tasks").where("tenantId", "==", tenantId).orderBy("createdAt", "desc");
        const snap = await query.limit(50).get();
        const allTasks = snap.docs.map((d: any) => ({ id: d.id, data: d.data() }));

        // Filter by project
        let filtered = allTasks;
        if (args.project_id) {
          filtered = allTasks.filter((t: any) => t.data.projectId === args.project_id);
        } else if (args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) filtered = allTasks.filter((t: any) => t.data.projectId === proj.id);
          else return `No encontré el proyecto "${args.project_name}".`;
        }

        // Filter by status
        if (args.status_filter) {
          filtered = filtered.filter((t: any) => t.data.status === args.status_filter);
        }

        if (filtered.length === 0) return "No se encontraron tareas con esos filtros.";

        const lines = filtered.map(
          (t: any) =>
            `- **${t.data.title}**: ${t.data.status || "Sin estado"} | Prioridad: ${t.data.priority || "N/A"} | Proyecto: ${t.data.projectId || "N/A"} | Fecha: ${t.data.dueDate || "N/A"} [ID: ${t.id}]`
        );
        return `Tareas encontradas (${filtered.length}):\n${lines.join("\n")}`;
      }

      case "get_team_members": {
        // Get tenant members
        const tenantSnap = await db.collection("tenants").doc(tenantId).get();
        const tenantData = tenantSnap.exists ? tenantSnap.data() : null;
        const memberIds: string[] = tenantData?.members || [];
        // Fetch only tenant members (not all users) - individual gets for reliability
        let members: { id: string; data: any }[] = [];
        if (memberIds.length > 0) {
          const memberPromises = memberIds.map(async (uid: string) => {
            const doc = await db.collection("users").doc(uid).get();
            if (doc.exists) return { id: doc.id, data: doc.data() };
            return null;
          });
          const results = await Promise.all(memberPromises);
          members = results.filter((m): m is { id: string; data: any } => m !== null);
        }
        if (members.length === 0) return "No hay miembros en este espacio de trabajo.";

        const lines = members.map(
          (m: any) =>
            `- **${m.data.name || "Sin nombre"}** (${m.data.role || "Miembro"}) — ${m.data.email || "Sin email"} [ID: ${m.id}]`
        );
        return `Equipo (${members.length} miembros):\n${lines.join("\n")}`;
      }

      case "get_budget_summary": {
        const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
        const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
        const project = args.project_id
          ? projects.find((p: any) => p.id === args.project_id)
          : args.project_name
          ? findProjectByName(projects, args.project_name)
          : null;

        if (!project) {
          return "No se encontró el proyecto. Especifica cuál proyecto quieres consultar.";
        }

        const expSnap = await db.collection("expenses").where("tenantId", "==", tenantId).where("projectId", "==", project.id).limit(100).get();
        const expenses = expSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));

        const byCategory: Record<string, number> = {};
        let total = 0;
        expenses.forEach((e: any) => {
          const cat = e.data.category || "Otro";
          byCategory[cat] = (byCategory[cat] || 0) + (e.data.amount || 0);
          total += e.data.amount || 0;
        });

        const budget = project.data.budget || 0;
        const pct = budget > 0 ? ((total / budget) * 100).toFixed(1) : "N/A";

        let summary = `## Resumen de presupuesto: ${project.data.name}\n`;
        summary += `**Presupuesto:** ${formatCOP(budget)}\n**Gastado:** ${formatCOP(total)}\n**Porcentaje ejecutado:** ${pct}%\n`;

        if (budget > 0 && total > budget) {
          summary += `\n⚠️ **ALERTA:** El gasto SUPERA el presupuesto en ${formatCOP(total - budget)}.\n`;
        }

        if (Object.keys(byCategory).length > 0) {
          summary += `\n### Gastos por categoría:\n`;
          Object.entries(byCategory)
            .sort(([, a], [, b]) => (b as number) - (a as number))
            .forEach(([cat, amount]) => {
              const catPct = total > 0 ? (((amount as number) / total) * 100).toFixed(1) : "0";
              summary += `- **${cat}**: ${formatCOP(amount as number)} (${catPct}%)\n`;
            });
        }

        return summary;
      }

      case "get_expenses": {
        const expSnap = await db.collection("expenses").where("tenantId", "==", tenantId).orderBy("createdAt", "desc").limit(50).get();
        let allExpenses = expSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));

        if (args.project_id) {
          allExpenses = allExpenses.filter((e: any) => e.data.projectId === args.project_id);
        } else if (args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) allExpenses = allExpenses.filter((e: any) => e.data.projectId === proj.id);
          else return `No encontré el proyecto "${args.project_name}".`;
        }

        if (args.category) {
          allExpenses = allExpenses.filter((e: any) => e.data.category === args.category);
        }

        if (allExpenses.length === 0) return "No se encontraron gastos con esos filtros.";

        const lines = allExpenses.map(
          (e: any) =>
            `- **${e.data.concept}**: ${formatCOP(e.data.amount)} | ${e.data.category || "Otro"} | ${e.data.date || "Sin fecha"} [ID: ${e.id}]`
        );
        return `Gastos encontrados (${allExpenses.length}):\n${lines.join("\n")}`;
      }

      // ── WRITE OPERATIONS ──
      case "create_task": {
        // Resolve project
        let projectId = args.project_id;
        if (!projectId && args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) projectId = proj.id;
        }

        // Resolve assignee
        let assigneeId: string | undefined;
        if (args.assignee_name) {
          // Only search within tenant members
          const taskTenantSnap = await db.collection("tenants").doc(tenantId).get();
          const taskTenantMembers = taskTenantSnap.exists ? (taskTenantSnap.data()?.members || []) : [];
          const taskUsersPromises = taskTenantMembers.map(async (uid: string) => {
            const doc = await db.collection("users").doc(uid).get();
            if (doc.exists) return { id: doc.id, data: doc.data() };
            return null;
          });
          const users = (await Promise.all(taskUsersPromises)).filter((u): u is { id: string; data: any } => u !== null);
          const lower = args.assignee_name.toLowerCase();
          const found = users.find(
            (u: any) =>
              u.data?.name?.toLowerCase().includes(lower) ||
              u.data?.email?.toLowerCase().includes(lower)
          );
          if (found) assigneeId = found.id;
        }

        const docRef = await db.collection("tasks").add({
          title: args.title,
          projectId: projectId || "",
          assigneeId: assigneeId || "",
          priority: args.priority || "Media",
          status: args.status || "Por hacer",
          dueDate: args.due_date || "",
          tenantId,
          createdAt: ts,
          createdBy: userUid,
        });

        actions.push({
          type: "task_created",
          label: `Tarea creada`,
          icon: "✅",
          details: args.title,
          success: true,
        });

        return `Tarea "${args.title}" creada exitosamente [ID: ${docRef.id}]. Proyecto: ${projectId || "Sin asignar"}, Prioridad: ${args.priority || "Media"}, Estado: ${args.status || "Por hacer"}`;
      }

      case "create_project": {
        const docRef = await db.collection("projects").add({
          name: args.name,
          status: "Concepto",
          client: args.client || "",
          location: args.location || "",
          budget: args.budget || 0,
          description: args.description || "",
          startDate: args.start_date || "",
          endDate: args.end_date || "",
          progress: 0,
          tenantId,
          createdAt: ts,
          createdBy: userUid,
          updatedAt: ts,
        });

        // Create default phases
        const defaultPhases = [
          "Concepto",
          "Diseño",
          "Planeación",
          "Pre-construcción",
          "Construcción",
          "Entrega",
        ];
        const batch = db.batch();
        defaultPhases.forEach((phaseName, i) => {
          const ref = db.collection("projects").doc(docRef.id).collection("workPhases").doc();
          batch.set(ref, {
            name: phaseName,
            description: "",
            status: "Pendiente",
            order: i,
            startDate: "",
            endDate: "",
            createdAt: ts,
          });
        });
        await batch.commit();

        actions.push({
          type: "project_created",
          label: `Proyecto creado`,
          icon: "🏗️",
          details: args.name,
          success: true,
        });

        return `Proyecto "${args.name}" creado exitosamente [ID: ${docRef.id}]. Cliente: ${args.client || "N/A"}, Ubicación: ${args.location || "N/A"}, Presupuesto: ${formatCOP(args.budget || 0)}. Fases iniciales creadas automáticamente.`;
      }

      case "create_expense": {
        let projectId = args.project_id;
        if (!projectId && args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) projectId = proj.id;
        }

        const docRef = await db.collection("expenses").add({
          concept: args.concept,
          projectId: projectId || "",
          category: args.category || "Otro",
          amount: args.amount || 0,
          date: args.date || new Date().toISOString().split("T")[0],
          tenantId,
          createdAt: ts,
          createdBy: userUid,
        });

        actions.push({
          type: "expense_created",
          label: `Gasto registrado`,
          icon: "💰",
          details: `${args.concept}: ${formatCOP(args.amount || 0)}`,
          success: true,
        });

        return `Gasto "${args.concept}" registrado exitosamente [ID: ${docRef.id}]. Monto: ${formatCOP(args.amount || 0)}, Categoría: ${args.category || "Otro"}, Proyecto: ${projectId || "Sin asignar"}`;
      }

      case "create_supplier": {
        const docRef = await db.collection("suppliers").add({
          name: args.name,
          category: args.category || "Otro",
          phone: args.phone || "",
          email: args.email || "",
          address: args.address || "",
          website: "",
          notes: args.notes || "",
          rating: 0,
          tenantId,
          createdAt: ts,
          createdBy: userUid,
        });

        actions.push({
          type: "supplier_created",
          label: `Proveedor registrado`,
          icon: "🤝",
          details: args.name,
          success: true,
        });

        return `Proveedor "${args.name}" registrado exitosamente [ID: ${docRef.id}]. Categoría: ${args.category || "Otro"}, Teléfono: ${args.phone || "N/A"}, Email: ${args.email || "N/A"}`;
      }

      case "create_meeting": {
        let projectId = args.project_id;
        if (!projectId && args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) projectId = proj.id;
        }

        const docRef = await db.collection("meetings").add({
          title: args.title,
          projectId: projectId || "",
          date: args.date || "",
          time: args.time || "",
          duration: args.duration || "",
          location: args.location || "",
          description: args.description || "",
          attendees: [],
          tenantId,
          createdBy: userUid,
          createdAt: ts,
        });

        actions.push({
          type: "meeting_created",
          label: `Reunión programada`,
          icon: "📅",
          details: `${args.title} — ${args.date} ${args.time}`,
          success: true,
        });

        return `Reunión "${args.title}" programada exitosamente [ID: ${docRef.id}]. Fecha: ${args.date} ${args.time}, Duración: ${args.duration || "N/A"}, Lugar: ${args.location || "N/A"}`;
      }

      case "update_task_status": {
        const tasksSnap = await db.collection("tasks").where("tenantId", "==", tenantId).limit(100).get();
        const allTasks = tasksSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));

        let task: FirestoreDoc | null = null;
        if (args.task_id) {
          task = allTasks.find((t: any) => t.id === args.task_id) ?? null;
        } else if (args.task_title) {
          task = findTaskByTitle(allTasks, args.task_title);
        }

        if (!task) {
          const error = `No encontré la tarea "${args.task_title || args.task_id}". Busca por título o ID exacto.`;
          actions.push({
            type: "task_update_failed",
            label: `Error al actualizar tarea`,
            icon: "❌",
            details: error,
            success: false,
            error,
          });
          return error;
        }

        const updateData: Record<string, any> = {
          status: args.new_status,
          updatedAt: ts,
        };
        // Set completedAt when marking as completed, clear it otherwise
        if (args.new_status === 'Completado') {
          updateData.completedAt = ts;
        } else {
          updateData.completedAt = null;
        }
        await db.collection("tasks").doc(task.id).update(updateData);

        actions.push({
          type: "task_updated",
          label: `Tarea actualizada`,
          icon: "🔄",
          details: `"${task.data.title}" → ${args.new_status}`,
          success: true,
        });

        return `Tarea "${task.data.title}" actualizada a estado "${args.new_status}" exitosamente.`;
      }

      case "get_rfis": {
        const rfiSnap = await db.collection("rfis").where("tenantId", "==", tenantId).orderBy("createdAt", "desc").limit(50).get();
        let allRFIs = rfiSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
        if (args.project_id) {
          allRFIs = allRFIs.filter((r: any) => r.data.projectId === args.project_id);
        } else if (args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) allRFIs = allRFIs.filter((r: any) => r.data.projectId === proj.id);
        }
        if (args.status_filter) allRFIs = allRFIs.filter((r: any) => r.data.status === args.status_filter);
        if (allRFIs.length === 0) return "No se encontraron RFIs con esos filtros.";
        const lines = allRFIs.map((r: any) => `- **${r.data.number}** ${r.data.subject}: ${r.data.status} | Prioridad: ${r.data.priority || "N/A"} | Proyecto: ${r.data.projectId || "N/A"}${r.data.dueDate ? ` | Vence: ${r.data.dueDate}` : ""}`);
        return `RFIs encontrados (${allRFIs.length}):\n${lines.join("\n")}`;
      }

      case "create_rfi": {
        let projectId = args.project_id;
        if (!projectId && args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) projectId = proj.id;
        }
        let assigneeId: string | undefined;
        if (args.assignee_name) {
          // Only search within tenant members
          const rfiTenantSnap = await db.collection("tenants").doc(tenantId).get();
          const rfiTenantMembers = rfiTenantSnap.exists ? (rfiTenantSnap.data()?.members || []) : [];
          const rfiUsersPromises = rfiTenantMembers.map(async (uid: string) => {
            const doc = await db.collection("users").doc(uid).get();
            if (doc.exists) return { id: doc.id, data: doc.data() };
            return null;
          });
          const users = (await Promise.all(rfiUsersPromises)).filter((u): u is { id: string; data: any } => u !== null);
          const lower = args.assignee_name.toLowerCase();
          const found = users.find((u: any) => u.data?.name?.toLowerCase().includes(lower) || u.data?.email?.toLowerCase().includes(lower));
          if (found) assigneeId = found.id;
        }
        const number = await getNextSequentialNumber("rfis", tenantId, "RFI");
        const docRef = await db.collection("rfis").add({
          number, subject: args.subject, question: args.question, response: "",
          projectId: projectId || "", assignedTo: assigneeId || "",
          priority: args.priority || "Media", status: "Abierto", dueDate: args.due_date || "",
          tenantId, createdAt: ts, createdBy: userUid,
        });
        actions.push({ type: "rfi_created", label: "RFI creado", icon: "❓", details: `${number}: ${args.subject}`, success: true });
        return `RFI "${number}" creado exitosamente [ID: ${docRef.id}]. Asunto: ${args.subject}, Prioridad: ${args.priority || "Media"}, Proyecto: ${projectId || "Sin asignar"}`;
      }

      case "get_submittals": {
        const subSnap = await db.collection("submittals").where("tenantId", "==", tenantId).orderBy("createdAt", "desc").limit(50).get();
        let allSubs = subSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
        if (args.project_id) {
          allSubs = allSubs.filter((s: any) => s.data.projectId === args.project_id);
        } else if (args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) allSubs = allSubs.filter((s: any) => s.data.projectId === proj.id);
        }
        if (args.status_filter) allSubs = allSubs.filter((s: any) => s.data.status === args.status_filter);
        if (allSubs.length === 0) return "No se encontraron submittals con esos filtros.";
        const lines = allSubs.map((s: any) => `- **${s.data.number}** ${s.data.title}: ${s.data.status}${s.data.specification ? ` | Spec: ${s.data.specification}` : ""}${s.data.dueDate ? ` | Vence: ${s.data.dueDate}` : ""}`);
        return `Submittals encontrados (${allSubs.length}):\n${lines.join("\n")}`;
      }

      case "get_punch_items": {
        const punchSnap = await db.collection("punchItems").where("tenantId", "==", tenantId).orderBy("createdAt", "desc").limit(50).get();
        let allPunch = punchSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
        if (args.project_id) {
          allPunch = allPunch.filter((p: any) => p.data.projectId === args.project_id);
        } else if (args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) allPunch = allPunch.filter((p: any) => p.data.projectId === proj.id);
        }
        if (args.status_filter) allPunch = allPunch.filter((p: any) => p.data.status === args.status_filter);
        if (args.location) allPunch = allPunch.filter((p: any) => p.data.location === args.location);
        if (allPunch.length === 0) return "No se encontraron items de punch list con esos filtros.";
        const lines = allPunch.map((p: any) => `- **${p.data.title}**: ${p.data.status} | ${p.data.priority || "Media"} | ${p.data.location || "Otro"}${p.data.dueDate ? ` | Vence: ${p.data.dueDate}` : ""}`);
        return `Items de Punch List (${allPunch.length}):\n${lines.join("\n")}`;
      }

      // ── INVENTORY OPERATIONS ──
      case "get_inventory_products": {
        const invSnap = await db.collection("invProducts").where("tenantId", "==", tenantId).orderBy("createdAt", "desc").limit(50).get();
        let allProducts = invSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));

        if (args.category) {
          allProducts = allProducts.filter((p: any) => p.data.category === args.category);
        }
        if (args.warehouse) {
          allProducts = allProducts.filter((p: any) => p.data.warehouse === args.warehouse);
        }
        if (args.search) {
          const searchLower = args.search.toLowerCase();
          allProducts = allProducts.filter((p: any) =>
            p.data.name?.toLowerCase().includes(searchLower) ||
            p.data.sku?.toLowerCase().includes(searchLower)
          );
        }

        if (allProducts.length === 0) return "No se encontraron productos en el inventario.";

        const lines = allProducts.map(
          (p: any) =>
            `- **${p.data.name}**: SKU: ${p.data.sku || "N/A"} | ${p.data.unit || "und"} | Precio: ${formatCOP(p.data.price || 0)} | Stock: ${p.data.stock || 0}${p.data.minStock ? ` (Mín: ${p.data.minStock})` : ""} | Bodega: ${p.data.warehouse || "N/A"} [ID: ${p.id}]`
        );
        return `Productos del inventario (${allProducts.length}):\n${lines.join("\n")}`;
      }

      case "create_inventory_product": {
        const docRef = await db.collection("invProducts").add({
          name: args.name,
          sku: args.sku || "",
          category: args.category || "",
          unit: args.unit || "unidades",
          price: args.price || 0,
          stock: args.stock || 0,
          minStock: args.min_stock || 0,
          warehouse: args.warehouse || "",
          warehouseStock: args.warehouse ? { [args.warehouse]: args.stock || 0 } : {},
          imageData: "",
          tenantId,
          createdAt: ts,
          createdBy: userUid,
        });

        actions.push({
          type: "inventory_product_created",
          label: "Producto creado",
          icon: "📦",
          details: args.name,
          success: true,
        });

        return `Producto "${args.name}" creado exitosamente en el inventario [ID: ${docRef.id}]. SKU: ${args.sku || "N/A"}, Categoría: ${args.category || "N/A"}, Precio: ${formatCOP(args.price || 0)}, Stock inicial: ${args.stock || 0} ${args.unit || "unidades"}`;
      }

      case "get_inventory_movements": {
        const movSnap = await db.collection("invMovements").where("tenantId", "==", tenantId).orderBy("createdAt", "desc").limit(50).get();
        let allMovements = movSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));

        if (args.product_id) {
          allMovements = allMovements.filter((m: any) => m.data.productId === args.product_id);
        }
        if (args.warehouse) {
          allMovements = allMovements.filter((m: any) => m.data.warehouse === args.warehouse);
        }
        if (args.movement_type) {
          allMovements = allMovements.filter((m: any) => m.data.type === args.movement_type);
        }

        if (allMovements.length === 0) return "No se encontraron movimientos de inventario.";

        const lines = allMovements.map(
          (m: any) =>
            `- **${m.data.type === "Entrada" ? "📥" : "📤"} ${m.data.type}**: ${m.data.quantity} und${m.data.reason ? ` | Motivo: ${m.data.reason}` : ""}${m.data.reference ? ` | Ref: ${m.data.reference}` : ""} | Bodega: ${m.data.warehouse || "N/A"} | Fecha: ${m.data.date || "N/A"} [ID: ${m.id}]`
        );
        return `Movimientos de inventario (${allMovements.length}):\n${lines.join("\n")}`;
      }

      case "create_inventory_movement": {
        let productId = args.product_id;
        if (!productId && args.product_name) {
          const prodSnap = await db.collection("invProducts").where("tenantId", "==", tenantId).limit(50).get();
          const products = prodSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const searchLower = args.product_name.toLowerCase();
          const found = products.find((p: any) => p.data.name?.toLowerCase() === searchLower || p.data.name?.toLowerCase().includes(searchLower));
          if (found) productId = found.id;
          else return `No encontré el producto "${args.product_name}" en el inventario.`;
        }
        if (!productId) {
          return "Debes proporcionar el ID del producto o el nombre del producto para registrar el movimiento.";
        }

        const today = new Date().toISOString().split("T")[0];
        const docRef = await db.collection("invMovements").add({
          productId,
          type: args.type || "Entrada",
          quantity: args.quantity || 0,
          reason: args.reason || "",
          reference: args.reference || "",
          date: today,
          warehouse: args.warehouse || "",
          tenantId,
          createdAt: ts,
          createdBy: userUid,
        });

        // Update product stock atomically (race-condition safe)
        const quantityChange = args.type === "Entrada" ? (args.quantity || 0) : -(args.quantity || 0);
        const newStock = await atomicStockUpdate(productId, quantityChange);

        actions.push({
          type: "inventory_movement_created",
          label: `${args.type === "Entrada" ? "📥 Entrada" : "📤 Salida"} registrada`,
          icon: args.type === "Entrada" ? "📥" : "📤",
          details: `${args.quantity} unidades`,
          success: true,
        });

        return `${args.type === "Entrada" ? "📥 Entrada" : "📤 Salida"} de ${args.quantity} unidades registrada exitosamente [ID: ${docRef.id}].${args.reason ? ` Motivo: ${args.reason}` : ""}${args.reference ? ` | Ref: ${args.reference}` : ""}`;
      }

      // ── INVOICES OPERATIONS ──
      case "get_invoices": {
        const invSnap = await db.collection("invoices").where("tenantId", "==", tenantId).orderBy("createdAt", "desc").limit(50).get();
        let allInvoices = invSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));

        if (args.project_id) {
          allInvoices = allInvoices.filter((i: any) => i.data.projectId === args.project_id);
        } else if (args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) allInvoices = allInvoices.filter((i: any) => i.data.projectId === proj.id);
        }
        if (args.status_filter) {
          allInvoices = allInvoices.filter((i: any) => i.data.status === args.status_filter);
        }

        if (allInvoices.length === 0) return "No se encontraron facturas con esos filtros.";

        const lines = allInvoices.map(
          (i: any) =>
            `- **${i.data.number || "Sin número"}**: ${i.data.projectName || "N/A"} | Cliente: ${i.data.clientName || "N/A"} | Total: ${formatCOP(i.data.total || 0)} | Estado: ${i.data.status || "Borrador"} | Emisión: ${i.data.issueDate || "N/A"} [ID: ${i.id}]`
        );
        return `Facturas encontradas (${allInvoices.length}):\n${lines.join("\n")}`;
      }

      case "create_invoice": {
        let projectId = args.project_id;
        let projectName = args.project_name || "";
        let clientName = args.client_name || "";

        if (!projectId && projectName) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, projectName);
          if (proj) {
            projectId = proj.id;
            if (!clientName) clientName = proj.data.client || "";
          }
        }

        const items = (args.items || []).map((item: any) => ({
          description: item.description || "",
          quantity: item.quantity || 1,
          unitPrice: item.unitPrice || 0,
          total: (item.quantity || 1) * (item.unitPrice || 0),
        }));
        const subtotal = items.reduce((sum: number, item: any) => sum + item.total, 0);
        const taxPercent = args.tax_percent ?? 19;
        const tax = Math.round(subtotal * (taxPercent / 100));
        const total = subtotal + tax;

        const number = await getNextSequentialNumber("invoices", tenantId, "INV");

        const docRef = await db.collection("invoices").add({
          number,
          projectId: projectId || "",
          projectName,
          clientName,
          description: args.description || "",
          items,
          subtotal,
          tax,
          taxPercent,
          total,
          status: "Borrador",
          issueDate: args.issue_date || new Date().toISOString().split("T")[0],
          dueDate: args.due_date || "",
          tenantId,
          createdAt: ts,
          createdBy: userUid,
        });

        actions.push({
          type: "invoice_created",
          label: "Factura creada",
          icon: "🧾",
          details: `${number}: ${formatCOP(total)}`,
          success: true,
        });

        return `Factura "${number}" creada exitosamente [ID: ${docRef.id}]. Proyecto: ${projectName || "N/A"}, Cliente: ${clientName || "N/A"}, Subtotal: ${formatCOP(subtotal)}, IVA (${taxPercent}%): ${formatCOP(tax)}, Total: ${formatCOP(total)}`;
      }

      case "update_invoice_status": {
        // SECURITY: Whitelist valid invoice statuses to prevent arbitrary data from LLM
        const VALID_INVOICE_STATUSES = [
          "Borrador", "Enviada", "Aprobada", "Pagada",
          "Vencida", "Cancelada", "Parcialmente Pagada",
        ];
        const newStatus = String(args.new_status || "").trim();
        if (!VALID_INVOICE_STATUSES.includes(newStatus)) {
          const error = `Estado de factura invalido "${newStatus}". Estados validos: ${VALID_INVOICE_STATUSES.join(", ")}`;
          actions.push({ type: "invoice_update_failed", label: "Estado invalido", icon: "⚠️", details: error, success: false, error });
          return error;
        }

        let invoice: FirestoreDoc | null = null;
        if (args.invoice_id) {
          const doc = await db.collection("invoices").doc(args.invoice_id).get();
          // SECURITY: Verify the invoice belongs to the requesting tenant (prevent cross-tenant IDOR)
          if (doc.exists && doc.data()?.tenantId === tenantId) {
            invoice = { id: doc.id, data: doc.data()! };
          }
        } else if (args.invoice_number) {
          const invSnap = await db.collection("invoices").where("tenantId", "==", tenantId).limit(50).get();
          const allInvoices = invSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          invoice = allInvoices.find((i: any) => i.data.number === args.invoice_number) ?? null;
        }

        if (!invoice) {
          const error = `No encontré la factura "${args.invoice_number || args.invoice_id}".`;
          actions.push({ type: "invoice_update_failed", label: "Error al actualizar factura", icon: "❌", details: error, success: false, error });
          return error;
        }

        await db.collection("invoices").doc(invoice.id).update({
          status: newStatus,
          updatedAt: ts,
        });

        actions.push({
          type: "invoice_updated",
          label: "Factura actualizada",
          icon: "🔄",
          details: `${invoice.data.number || invoice.id} → ${newStatus}`,
          success: true,
        });

        return `Factura "${invoice.data.number || invoice.id}" actualizada a estado "${newStatus}" exitosamente.`;
      }

      // ── TIME TRACKING OPERATIONS ──
      case "get_time_entries": {
        const teSnap = await db.collection("timeEntries").where("tenantId", "==", tenantId).orderBy("createdAt", "desc").limit(50).get();
        let allEntries = teSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));

        if (args.project_id) {
          allEntries = allEntries.filter((e: any) => e.data.projectId === args.project_id);
        } else if (args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) allEntries = allEntries.filter((e: any) => e.data.projectId === proj.id);
        }

        if (args.user_name) {
          const searchLower = args.user_name.toLowerCase();
          allEntries = allEntries.filter((e: any) => e.data.userName?.toLowerCase().includes(searchLower));
        }
        if (args.date_from) {
          allEntries = allEntries.filter((e: any) => e.data.date >= args.date_from);
        }
        if (args.date_to) {
          allEntries = allEntries.filter((e: any) => e.data.date <= args.date_to);
        }

        if (allEntries.length === 0) return "No se encontraron registros de tiempo.";

        const totalHours = allEntries.reduce((sum: number, e: any) => sum + (e.data.hours || 0), 0);
        const lines = allEntries.map(
          (e: any) =>
            `- **${e.data.description || "Sin descripción"}**: ${e.data.hours || 0}h | Usuario: ${e.data.userName || "N/A"} | Fase: ${e.data.phaseName || "N/A"} | ${e.data.billable ? "💰 Facturable" : "📝 No facturable"} | Fecha: ${e.data.date || "N/A"} [ID: ${e.id}]`
        );
        return `Registros de tiempo (${allEntries.length}), Total: ${totalHours}h:\n${lines.join("\n")}`;
      }

      case "create_time_entry": {
        let projectId = args.project_id;
        if (!projectId && args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) projectId = proj.id;
        }

        // Get user name
        const userDoc = await db.collection("users").doc(userUid).get();
        const userName = userDoc.exists ? (userDoc.data()?.name || "") : "";

        const docRef = await db.collection("timeEntries").add({
          userId: userUid,
          userName,
          projectId: projectId || "",
          phaseName: args.phase_name || "",
          description: args.description || "",
          hours: args.hours || 0,
          startTime: "",
          endTime: "",
          duration: "",
          billable: args.billable !== false,
          rate: args.rate || 0,
          date: args.date || new Date().toISOString().split("T")[0],
          tenantId,
          createdAt: ts,
          createdBy: userUid,
        });

        const totalAmount = (args.hours || 0) * (args.rate || 0);
        actions.push({
          type: "time_entry_created",
          label: "Tiempo registrado",
          icon: "⏱️",
          details: `${args.hours || 0}h ${args.description ? `— ${args.description}` : ""}`,
          success: true,
        });

        return `Registro de tiempo creado exitosamente [ID: ${docRef.id}]. Horas: ${args.hours || 0}, Proyecto: ${projectId || "N/A"}${args.description ? `, Descripción: ${args.description}` : ""}${totalAmount > 0 ? `, Valor: ${formatCOP(totalAmount)}` : ""}, Facturable: ${args.billable !== false ? "Sí" : "No"}`;
      }

      // ── SUBMITTAL CREATE ──
      case "create_submittal": {
        let projectId = args.project_id;
        if (!projectId && args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) projectId = proj.id;
        }

        let reviewerId: string | undefined;
        if (args.reviewer_name) {
          // Only search within tenant members
          const subTenantSnap = await db.collection("tenants").doc(tenantId).get();
          const subTenantMembers = subTenantSnap.exists ? (subTenantSnap.data()?.members || []) : [];
          const subUsersPromises = subTenantMembers.map(async (uid: string) => {
            const doc = await db.collection("users").doc(uid).get();
            if (doc.exists) return { id: doc.id, data: doc.data() };
            return null;
          });
          const users = (await Promise.all(subUsersPromises)).filter((u): u is { id: string; data: any } => u !== null);
          const lower = args.reviewer_name.toLowerCase();
          const found = users.find((u: any) => u.data?.name?.toLowerCase().includes(lower) || u.data?.email?.toLowerCase().includes(lower));
          if (found) reviewerId = found.id;
        }

        const number = await getNextSequentialNumber("submittals", tenantId, "SUB");

        const docRef = await db.collection("submittals").add({
          number,
          title: args.title,
          projectId: projectId || "",
          description: args.description || "",
          specification: args.specification || "",
          status: "Borrador",
          reviewer: reviewerId || "",
          submittedBy: userUid,
          dueDate: args.due_date || "",
          tenantId,
          createdAt: ts,
          createdBy: userUid,
        });

        actions.push({
          type: "submittal_created",
          label: "Submittal creado",
          icon: "📋",
          details: `${number}: ${args.title}`,
          success: true,
        });

        return `Submittal "${number}" creado exitosamente [ID: ${docRef.id}]. Título: ${args.title}${args.specification ? `, Spec: ${args.specification}` : ""}, Proyecto: ${projectId || "Sin asignar"}${args.reviewer_name ? `, Revisor: ${args.reviewer_name}` : ""}`;
      }

      // ── PUNCH ITEM CREATE ──
      case "create_punch_item": {
        let projectId = args.project_id;
        if (!projectId && args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) projectId = proj.id;
        }

        let assignedToId: string | undefined;
        if (args.assigned_to_name) {
          // Only search within tenant members
          const punchTenantSnap = await db.collection("tenants").doc(tenantId).get();
          const punchTenantMembers = punchTenantSnap.exists ? (punchTenantSnap.data()?.members || []) : [];
          const punchUsersPromises = punchTenantMembers.map(async (uid: string) => {
            const doc = await db.collection("users").doc(uid).get();
            if (doc.exists) return { id: doc.id, data: doc.data() };
            return null;
          });
          const users = (await Promise.all(punchUsersPromises)).filter((u): u is { id: string; data: any } => u !== null);
          const lower = args.assigned_to_name.toLowerCase();
          const found = users.find((u: any) => u.data?.name?.toLowerCase().includes(lower) || u.data?.email?.toLowerCase().includes(lower));
          if (found) assignedToId = found.id;
        }

        const docRef = await db.collection("punchItems").add({
          title: args.title,
          projectId: projectId || "",
          description: args.description || "",
          location: args.location || "Otro",
          status: "Pendiente",
          priority: args.priority || "Media",
          assignedTo: assignedToId || "",
          dueDate: args.due_date || "",
          photos: [],
          tenantId,
          createdAt: ts,
          createdBy: userUid,
        });

        actions.push({
          type: "punch_item_created",
          label: "Punch item creado",
          icon: "🔧",
          details: args.title,
          success: true,
        });

        return `Item de Punch List "${args.title}" creado exitosamente [ID: ${docRef.id}]. Ubicación: ${args.location || "Otro"}, Prioridad: ${args.priority || "Media"}, Proyecto: ${projectId || "Sin asignar"}`;
      }

      // ── COMPANIES OPERATIONS ──
      case "get_companies": {
        const compSnap = await db.collection("companies").where("tenantId", "==", tenantId).orderBy("createdAt", "desc").limit(50).get();
        let allCompanies = compSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));

        if (args.search) {
          const searchLower = args.search.toLowerCase();
          allCompanies = allCompanies.filter((c: any) =>
            c.data.name?.toLowerCase().includes(searchLower) ||
            c.data.nit?.toLowerCase().includes(searchLower) ||
            c.data.legalName?.toLowerCase().includes(searchLower)
          );
        }

        if (allCompanies.length === 0) return "No se encontraron empresas.";

        const lines = allCompanies.map(
          (c: any) =>
            `- **${c.data.name}**: NIT: ${c.data.nit || "N/A"} | Razón social: ${c.data.legalName || "N/A"} | ${c.data.email || "Sin email"} | ${c.data.phone || "Sin teléfono"} | ${c.data.address || "Sin dirección"} [ID: ${c.id}]`
        );
        return `Empresas encontradas (${allCompanies.length}):\n${lines.join("\n")}`;
      }

      case "create_company": {
        const docRef = await db.collection("companies").add({
          name: args.name,
          nit: args.nit || "",
          address: args.address || "",
          phone: args.phone || "",
          email: args.email || "",
          legalName: args.legal_name || "",
          tenantId,
          createdAt: ts,
          createdBy: userUid,
        });

        actions.push({
          type: "company_created",
          label: "Empresa registrada",
          icon: "🏢",
          details: args.name,
          success: true,
        });

        return `Empresa "${args.name}" registrada exitosamente [ID: ${docRef.id}]. NIT: ${args.nit || "N/A"}, Razón social: ${args.legal_name || args.name}, Email: ${args.email || "N/A"}, Teléfono: ${args.phone || "N/A"}`;
      }

      // ── DAILY LOGS OPERATIONS ──
      case "get_daily_logs": {
        let projectId = args.project_id;
        if (!projectId && args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) projectId = proj.id;
          else return `No encontré el proyecto "${args.project_name}".`;
        }
        if (!projectId) {
          return "Debes especificar un proyecto para consultar las bitácoras de obra.";
        }

        const dlSnap = await db.collection("projects").doc(projectId).collection("dailyLogs").orderBy("date", "desc").limit(30).get();
        let allLogs = dlSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));

        if (args.date_from) {
          allLogs = allLogs.filter((l: any) => l.data.date >= args.date_from);
        }
        if (args.date_to) {
          allLogs = allLogs.filter((l: any) => l.data.date <= args.date_to);
        }

        if (allLogs.length === 0) return "No se encontraron bitácoras de obra para ese proyecto.";

        const lines = allLogs.map(
          (l: any) =>
            `- **${l.data.date || "Sin fecha"}**: ${l.data.weather || "N/A"} | Personal: ${l.data.laborCount || 0} | Supervisor: ${l.data.supervisor || "N/A"} | Actividades: ${(l.data.activities || []).join(", ") || "N/A"} [ID: ${l.id}]`
        );
        return `Bitácoras de obra (${allLogs.length}):\n${lines.join("\n")}`;
      }

      case "create_daily_log": {
        let projectId = args.project_id;
        if (!projectId && args.project_name) {
          const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
          const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
          const proj = findProjectByName(projects, args.project_name);
          if (proj) projectId = proj.id;
          else return `No encontré el proyecto "${args.project_name}".`;
        }
        if (!projectId) {
          return "Debes especificar un proyecto para crear la bitácora de obra.";
        }

        const docRef = await db.collection("projects").doc(projectId).collection("dailyLogs").add({
          projectId,
          date: args.date || new Date().toISOString().split("T")[0],
          weather: args.weather || "",
          activities: args.activities || [],
          laborCount: args.labor_count || 0,
          photos: [],
          supervisor: args.supervisor || "",
          notes: args.notes || "",
          tenantId,
          createdAt: ts,
          createdBy: userUid,
        });

        actions.push({
          type: "daily_log_created",
          label: "Bitácora de obra creada",
          icon: "📓",
          details: `Fecha: ${args.date || "Hoy"}${args.weather ? ` | Clima: ${args.weather}` : ""}`,
          success: true,
        });

        return `Bitácora de obra creada exitosamente [ID: ${docRef.id}]. Fecha: ${args.date || "Hoy"}, Clima: ${args.weather || "N/A"}, Personal: ${args.labor_count || 0}${args.activities?.length ? `, Actividades: ${args.activities.join(", ")}` : ""}${args.supervisor ? `, Supervisor: ${args.supervisor}` : ""}`;
      }

      // ── PROJECT UPDATE OPERATIONS ──
      case "update_project_status": {
        const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
        const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
        const project = args.project_id
          ? projects.find((p: any) => p.id === args.project_id)
          : args.project_name
          ? findProjectByName(projects, args.project_name)
          : null;

        if (!project) {
          const error = args.project_name
            ? `No encontré el proyecto "${args.project_name}".`
            : "No se especificó ningún proyecto.";
          actions.push({ type: "project_update_failed", label: "Error al actualizar proyecto", icon: "❌", details: error, success: false, error });
          return error;
        }

        const oldStatus = project.data.status;
        await db.collection("projects").doc(project.id).update({
          status: args.new_status,
          updatedAt: ts,
        });

        actions.push({
          type: "project_status_updated",
          label: "Estado de proyecto actualizado",
          icon: "🔄",
          details: `${project.data.name}: ${oldStatus} → ${args.new_status}`,
          success: true,
        });

        return `Proyecto "${project.data.name}" actualizado de "${oldStatus}" a "${args.new_status}" exitosamente.`;
      }

      case "update_project_progress": {
        const projSnap = await db.collection("projects").where("tenantId", "==", tenantId).limit(20).get();
        const projects = projSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));
        const project = args.project_id
          ? projects.find((p: any) => p.id === args.project_id)
          : args.project_name
          ? findProjectByName(projects, args.project_name)
          : null;

        if (!project) {
          const error = args.project_name
            ? `No encontré el proyecto "${args.project_name}".`
            : "No se especificó ningún proyecto.";
          actions.push({ type: "project_update_failed", label: "Error al actualizar proyecto", icon: "❌", details: error, success: false, error });
          return error;
        }

        const clampedProgress = Math.min(100, Math.max(0, args.progress || 0));
        const oldProgress = project.data.progress || 0;
        await db.collection("projects").doc(project.id).update({
          progress: clampedProgress,
          updatedAt: ts,
        });

        actions.push({
          type: "project_progress_updated",
          label: "Progreso actualizado",
          icon: "📊",
          details: `${project.data.name}: ${oldProgress}% → ${clampedProgress}%`,
          success: true,
        });

        return `Progreso del proyecto "${project.data.name}" actualizado de ${oldProgress}% a ${clampedProgress}%.`;
      }

      // ── DELETE OPERATIONS ──
      case "delete_task": {
        const tasksSnap = await db.collection("tasks").where("tenantId", "==", tenantId).limit(100).get();
        const allTasks = tasksSnap.docs.map((d: any) => ({ id: d.id, data: d.data() }));

        let task: FirestoreDoc | null = null;
        if (args.task_id) {
          task = allTasks.find((t: any) => t.id === args.task_id) ?? null;
        } else if (args.task_title) {
          task = findTaskByTitle(allTasks, args.task_title);
        }

        if (!task) {
          const error = `No encontré la tarea "${args.task_title || args.task_id}".`;
          actions.push({ type: "task_delete_failed", label: "Error al eliminar tarea", icon: "❌", details: error, success: false, error });
          return error;
        }

        await db.collection("tasks").doc(task.id).delete();

        actions.push({
          type: "task_deleted",
          label: "Tarea eliminada",
          icon: "🗑️",
          details: `"${task.data.title}" eliminada permanentemente`,
          success: true,
        });

        return `Tarea "${task.data.title}" eliminada exitosamente.`;
      }

      default:
        return `Función "${name}" no reconocida.`;
    }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : "Error desconocido";
    actions.push({
      type: "error",
      label: `Error en ${name}`,
      icon: "❌",
      details: errMsg,
      success: false,
      error: errMsg,
    });
    return `Error ejecutando ${name}: ${errMsg}`;
  }
}

export { executeToolCall, formatCOP, findProjectByName, findTaskByTitle };
export type { ToolCall, ExecutedAction, FirestoreDoc };
