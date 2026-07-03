import { creemPlanIdForProductId } from "@/lib/billing/creem";
import {
  normalizeBillingStatus,
  parsePlan,
  type BillingPlanId,
} from "@/lib/billing/plans";

type Rec = Record<string, unknown>;

function rec(value: unknown): Rec {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : {};
}

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function idFrom(value: unknown) {
  if (typeof value === "string") return value.trim();
  const record = rec(value);
  return str(record.id);
}

function parsedRequest(value: unknown) {
  const requestId = str(value);
  const parts = requestId.split(":");
  if (parts.length < 4 || parts[0] !== "jobposted") {
    return { userId: "", plan: null as BillingPlanId | null };
  }
  return { userId: parts[1] || "", plan: parsePlan(parts[2]) };
}

function isoDate(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 1_000_000_000_000 ? value : value * 1000;
    const date = new Date(millis);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }

  if (typeof value !== "string") return null;

  const text = value.trim();
  if (!text) return null;

  if (/^\d+(\.\d+)?$/.test(text)) {
    return isoDate(Number(text));
  }

  const millis = Date.parse(text);
  if (!Number.isFinite(millis)) return null;
  return new Date(millis).toISOString();
}

function eventOccurredAt(root: Rec): string | null {
  const event = rec(root.event);
  const candidates = [
    root.event_created_at,
    root.eventCreatedAt,
    root.occurred_at,
    root.occurredAt,
    root.event_time,
    root.eventTime,
    root.timestamp,
    root.created_at,
    root.createdAt,
    root.created,
    event.event_created_at,
    event.eventCreatedAt,
    event.occurred_at,
    event.occurredAt,
    event.event_time,
    event.eventTime,
    event.timestamp,
    event.created_at,
    event.createdAt,
    event.created,
  ];

  for (const candidate of candidates) {
    const parsed = isoDate(candidate);
    if (parsed) return parsed;
  }

  return null;
}

export function statusFromEvent(eventType: string, value: unknown): ReturnType<typeof normalizeBillingStatus> {
  const type = eventType.toLowerCase();
  const payloadStatus = str(value);
  if (
    payloadStatus &&
    (type === "subscription.update" ||
      type === "subscription.updated" ||
      type === "subscription.scheduled_cancel")
  ) {
    return normalizeBillingStatus(payloadStatus);
  }

  if (type === "subscription.past_due") return "past_due";
  if (
    type === "subscription.canceled" ||
    type === "subscription.expired" ||
    type === "subscription.paused"
  ) {
    return "canceled";
  }
  if (type === "subscription.trialing") return "trialing";
  if (
    type === "subscription.active" ||
    type === "subscription.paid" ||
    type === "subscription.update" ||
    type === "subscription.scheduled_cancel" ||
    type === "checkout.completed"
  ) {
    return "active";
  }
  return normalizeBillingStatus(value ?? type);
}

function planFromCreemProduct(value: unknown): BillingPlanId | null {
  return creemPlanIdForProductId(idFrom(value));
}

export function normalizedBillingWebhookEvent(payload: unknown) {
  const root = rec(payload);
  const data = rec(root.object ?? root.data ?? root.subscription ?? root);
  const subscription = rec(data.subscription);
  const order = rec(data.order);
  const product = data.product ?? subscription.product ?? order.product;
  const metadata = {
    ...rec(root.metadata),
    ...rec(data.metadata),
    ...rec(subscription.metadata),
  };
  const request = parsedRequest(data.request_id ?? root.request_id ?? metadata.request_id);
  const plan =
    parsePlan(data.plan) ??
    parsePlan(data.plan_id) ??
    parsePlan(subscription.plan) ??
    parsePlan(subscription.plan_id) ??
    parsePlan(metadata.plan) ??
    parsePlan(metadata.plan_id) ??
    request.plan ??
    planFromCreemProduct(product);
  const userId =
    str(data.user_id) ||
    str(data.userId) ||
    str(data.client_reference_id) ||
    str(data.clientReferenceId) ||
    str(metadata.user_id) ||
    str(metadata.userId) ||
    str(metadata.client_reference_id) ||
    str(metadata.clientReferenceId) ||
    str(metadata.referenceId) ||
    str(metadata.internal_customer_id) ||
    request.userId;
  const eventType = str(root.eventType) || str(root.type);
  const status = statusFromEvent(eventType, data.status ?? subscription.status ?? order.status);
  const customer = data.customer ?? subscription.customer ?? order.customer;
  const subscriptionId = data.subscription ?? subscription;

  return {
    userId,
    plan,
    status,
    eventOccurredAt: eventOccurredAt(root),
    provider: str(root.provider) || str(data.provider) || "creem",
    providerCustomerId: str(data.customer_id) || str(data.customerId) || idFrom(customer),
    providerSubscriptionId:
      str(data.subscription_id) ||
      str(data.subscriptionId) ||
      idFrom(subscriptionId) ||
      str(data.id),
    currentPeriodEnd:
      str(data.current_period_end) ||
      str(data.currentPeriodEnd) ||
      str(data.current_period_end_date) ||
      str(data.currentPeriodEndDate) ||
      str(subscription.current_period_end_date) ||
      str(subscription.currentPeriodEndDate) ||
      null,
  };
}
