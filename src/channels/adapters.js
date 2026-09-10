/**
 * Channel adapters (skeleton).
 * Real eBay / Double Holo / Misprint API calls land after secrets + Claude dump.
 */

import { getChannelStatuses } from "./config.js";

function notReady(channelId) {
  const status = getChannelStatuses().find((c) => c.id === channelId);
  const err = new Error(
    `${status?.label || channelId} not configured — set secrets: ${(status?.missing || []).join(", ")}`,
  );
  err.code = "CHANNEL_NOT_CONFIGURED";
  return err;
}

/** @param {string} channelId */
export function assertChannelConfigured(channelId) {
  const status = getChannelStatuses().find((c) => c.id === channelId);
  if (!status?.configured) throw notReady(channelId);
}

/**
 * Push or update price on a channel listing.
 * @param {string} channelId
 * @param {{ listingId: string, price: number, currency?: string }} _payload
 */
export async function setChannelPrice(channelId, _payload) {
  assertChannelConfigured(channelId);
  throw new Error(`${channelId}: setChannelPrice not wired yet`);
}

/**
 * End or revise qty on a remote listing after a sale elsewhere.
 * @param {string} channelId
 * @param {{ listingId: string, quantity: number, endIfZero?: boolean }} _payload
 */
export async function syncChannelQuantity(channelId, _payload) {
  assertChannelConfigured(channelId);
  throw new Error(`${channelId}: syncChannelQuantity not wired yet`);
}

/**
 * @param {string} channelId
 * @param {import('../store.js').ScoutItem} _item
 */
export async function publishListing(channelId, _item) {
  assertChannelConfigured(channelId);
  throw new Error(`${channelId}: publishListing not wired yet`);
}
