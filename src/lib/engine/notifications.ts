import { getDb } from "@/lib/db/connection";
import { generateId } from "@/lib/utils/id";
import type {
  Notification,
  NotificationAction,
  NotificationDelivery,
  ContactPolicy,
  TimeWindow,
} from "@/lib/types/core";

/**
 * Evaluate delivery for an incoming notification.
 *
 * deliver(m, c) =
 *   block    if action(m) ∈ B_c
 *   block    if t ∉ T_c
 *   push     if action(m) ∈ A_c ∧ ρ(m) > τ
 *   queue    if action(m) ∈ A_c ∧ ρ(m) ≤ τ
 *   ai_handle otherwise
 */
export function evaluateDelivery(
  action: NotificationAction,
  urgency: number,
  policy: ContactPolicy | null,
  urgencyThreshold: number = 0.7
): NotificationDelivery {
  if (!policy) return "ai_handle";

  const blocked: NotificationAction[] = JSON.parse(
    typeof policy.blocked_actions === "string"
      ? policy.blocked_actions
      : JSON.stringify(policy.blocked_actions)
  );
  const allowed: NotificationAction[] = JSON.parse(
    typeof policy.allowed_actions === "string"
      ? policy.allowed_actions
      : JSON.stringify(policy.allowed_actions)
  );
  const windows: TimeWindow[] = JSON.parse(
    typeof policy.time_windows === "string"
      ? policy.time_windows
      : JSON.stringify(policy.time_windows)
  );

  // Block check
  if (blocked.includes(action)) return "block";

  // Time window check
  if (windows.length > 0 && !isInTimeWindow(windows)) return "block";

  // Allowed + urgency check
  if (allowed.includes(action)) {
    return urgency > urgencyThreshold ? "push" : "queue";
  }

  return "ai_handle";
}

function isInTimeWindow(windows: TimeWindow[]): boolean {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();

  return windows.some(
    (w) => w.day_of_week === day && hour >= w.start_hour && hour < w.end_hour
  );
}

/**
 * Create and store a notification with computed delivery.
 */
export function createNotification(params: {
  userId: string;
  contactId: string | null;
  action: NotificationAction;
  content: string;
  urgency: number;
  delivery: NotificationDelivery;
}): Notification {
  const db = getDb();
  const id = generateId();
  const now = Math.floor(Date.now() / 1000);

  db.prepare(`
    INSERT INTO notifications (id, user_id, contact_id, action, content, urgency, delivery, handled, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).run(id, params.userId, params.contactId, params.action, params.content, params.urgency, params.delivery, now);

  return {
    id,
    user_id: params.userId,
    contact_id: params.contactId,
    action: params.action,
    content: params.content,
    urgency: params.urgency,
    delivery: params.delivery,
    handled: false,
    created_at: now,
  };
}

/**
 * Get pending notifications for a user (queued + pushed, unhandled).
 */
export function getPendingNotifications(userId: string): Notification[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM notifications
    WHERE user_id = ? AND handled = 0 AND delivery IN ('push', 'queue')
    ORDER BY urgency DESC, created_at DESC
  `).all(userId) as Notification[];
}

/**
 * Get contact policy for a contact.
 */
export function getContactPolicy(contactId: string): ContactPolicy | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM contact_policies WHERE contact_id = ?"
  ).get(contactId) as ContactPolicy | undefined;
  return row ?? null;
}
