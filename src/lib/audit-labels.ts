export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "member.bulk_created": "Created member account(s)",
  "member.password_reset": "Reset password",
  "member.role_changed": "Changed role",
  "quarter.created": "Created quarter",
  "quarter.deleted": "Deleted quarter",
  "quarter.activated": "Set quarter active",
  "quarter.deactivated": "Set quarter inactive",
  "settings.attendance_threshold_changed": "Changed attendance threshold",
  "settings.default_password_changed": "Changed default account password",
  "project.created": "Created project",
  "team_plan.created": "Created team draft",
  "team_plan.deleted": "Deleted team draft",
  "team_plan.finalized": "Finalized team draft",
  "team_plan.unfinalized": "Unfinalized team draft",
  "team_plan.applied": "Applied team draft to live rosters",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}
