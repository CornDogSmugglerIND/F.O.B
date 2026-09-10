/**
 * Cross-channel inventory sync.
 * H.U.D is canonical: sale anywhere → qty down; end remote listings when qty hits 0.
 */

import { getScoutItem, updateScoutItem } from "../store.js";
import { CHANNELS } from "./config.js";
import { syncChannelQuantity } from "./adapters.js";

/**
 * @typedef {{
 *   ebay?: { listingId: string | null, price: number | null, status: string | null },
 *   double_holo?: { listingId: string | null, price: number | null, status: string | null },
 *   misprint?: { listingId: string | null, price: number | null, status: string | null }
 * }} ChannelMap
 */

/**
 * Apply a sale against canonical inventory, then fan out qty/end to other channels.
 * Remote fan-out is best-effort until adapters are wired.
 *
 * @param {{ itemId: string, channel: string, quantitySold?: number, externalOrderId?: string | null }} sale
 */
export async function applySale(sale) {
  const qtySold = Math.max(1, Number(sale.quantitySold) || 1);
  const item = await getScoutItem(sale.itemId);
  if (!item) {
    const err = new Error("Item not found");
    err.code = "NOT_FOUND";
    throw err;
  }

  const nextQty = Math.max(0, (item.quantity || 0) - qtySold);
  /** @type {ChannelMap} */
  const channels = { ...(item.channels || {}) };
  const source = sale.channel;
  if (CHANNELS.includes(source) && channels[source]) {
    channels[source] = {
      ...channels[source],
      status: nextQty === 0 ? "ended" : channels[source].status || "active",
    };
  }

  const updated = await updateScoutItem(item.id, {
    quantity: nextQty,
    channels,
    lastSaleAt: new Date().toISOString(),
    lastSaleChannel: source,
    lastSaleExternalId: sale.externalOrderId ?? null,
  });

  const fanout = [];
  for (const channelId of CHANNELS) {
    if (channelId === source) continue;
    const listing = channels[channelId];
    if (!listing?.listingId) continue;
    try {
      await syncChannelQuantity(channelId, {
        listingId: listing.listingId,
        quantity: nextQty,
        endIfZero: true,
      });
      fanout.push({ channelId, ok: true });
    } catch (err) {
      fanout.push({
        channelId,
        ok: false,
        code: err.code || "FANOUT_ERROR",
        error: err.message,
      });
    }
  }

  return { item: updated, fanout };
}
