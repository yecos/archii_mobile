// Tools that only Admin/Director/SuperAdmin should execute (write/update/delete operations)
export const ADMIN_ONLY_TOOLS = new Set([
  "create_task", "create_project", "create_expense", "create_supplier",
  "create_meeting", "create_rfi", "create_submittal", "create_punch_item",
  "create_inventory_product", "create_inventory_movement", "create_invoice",
  "create_time_entry", "create_company", "create_daily_log",
  "update_task_status", "update_project_status", "update_project_progress",
  "update_invoice_status", "delete_task",
]);

/**
 * Returns an error string if the user role is not allowed to execute the tool,
 * or null if the action is permitted.
 */
export function requireAdminRole(name: string, userRole?: string): string | null {
  if (!ADMIN_ONLY_TOOLS.has(name)) return null;
  const allowedRoles = ["Admin", "Director", "Super Admin"];
  if (!userRole || !allowedRoles.includes(userRole)) {
    return `Lo siento, solo Administradores o Directores pueden ejecutar "${name}". Contacta al admin de tu equipo.`;
  }
  return null;
}
