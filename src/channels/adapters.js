/**
 * Channel adapters.
 * eBay: live Sell Inventory API (needs secrets).
 * Double Holo / Misprint: stubs until API contracts are confirmed.
 */

import { getChannelStatuses } from "./config.js";
import {
  endEbayListing,
  publishEbayListing,
  updateEbayPriceQuantity,
} from "./ebay.js";

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
 * @param {{ listingId: string, price: number, currency?: string, sku?: string, quantity?: number }} payload
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export async function setChannelPrice(channelId, payload, opts = {}) {
  assertChannelConfigured(channelId);
  if (channelId === "ebay") {
    return updateEbayPriceQuantity(
      {
        listingId: payload.listingId,
        price: payload.price,
        quantity: payload.quantity,
        sku: payload.sku,
      },
      opts,
    );
  }
  throw new Error(`${channelId}: setChannelPrice not wired yet`);
}

/**
 * End or revise qty on a remote listing after a sale elsewhere.
 * @param {string} channelId
 * @param {{ listingId: string, quantity: number, endIfZero?: boolean, sku?: string }} payload
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export async function syncChannelQuantity(channelId, payload, opts = {}) {
  assertChannelConfigured(channelId);
  if (channelId === "ebay") {
    if (payload.endIfZero && Number(payload.quantity) <= 0) {
      return endEbayListing({ listingId: payload.listingId }, opts);
    }
    return updateEbayPriceQuantity(
      {
        listingId: payload.listingId,
        quantity: payload.quantity,
        sku: payload.sku,
      },
      opts,
    );
  }
  throw new Error(`${channelId}: syncChannelQuantity not wired yet`);
}

/**
 * @param {string} channelId
 * @param {import('../store.js').ScoutItem} item
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export async function publishListing(channelId, item, opts = {}) {
  assertChannelConfigured(channelId);
  if (channelId === "ebay") {
    return publishEbayListing(item, opts);
  }
  throw new Error(`${channelId}: publishListing not wired yet`);
}
