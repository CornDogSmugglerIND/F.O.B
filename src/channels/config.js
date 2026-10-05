/** Channel env config — values from secrets/.env, never hardcode keys. */

const CHANNELS = ["ebay", "double_holo", "misprint"];

/**
 * @typedef {{ id: string, label: string, configured: boolean, missing: string[] }} ChannelStatus
 */

function present(key) {
  const v = process.env[key];
  return typeof v === "string" && v.trim().length > 0;
}

/** @returns {ChannelStatus[]} */
export function getChannelStatuses() {
  return [
    {
      id: "ebay",
      label: "eBay",
      configured: present("EBAY_CLIENT_ID") && present("EBAY_CLIENT_SECRET") && present("EBAY_REFRESH_TOKEN"),
      missing: ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "EBAY_REFRESH_TOKEN", "EBAY_SELLER_ID"].filter(
        (k) => !present(k),
      ),
    },
    {
      id: "double_holo",
      label: "Double Holo",
      configured: present("DOUBLE_HOLO_API_KEY"),
      missing: ["DOUBLE_HOLO_API_KEY", "DOUBLE_HOLO_STORE_ID"].filter((k) => !present(k)),
    },
    {
      id: "misprint",
      label: "Misprint",
      // Keys alone mark "configured" for status; live calls also need MISPRINT_API_BASE.
      configured: present("MISPRINT_API_KEY") && present("MISPRINT_SELLER_ID"),
      ready: present("MISPRINT_API_KEY") && present("MISPRINT_SELLER_ID") && present("MISPRINT_API_BASE"),
      missing: ["MISPRINT_API_KEY", "MISPRINT_SELLER_ID", "MISPRINT_API_BASE"].filter((k) => !present(k)),
      keysPresent: present("MISPRINT_API_KEY") && present("MISPRINT_SELLER_ID"),
    },
  ];
}

export function getCanonicalInventory() {
  return process.env.CANONICAL_INVENTORY || "hud";
}

/**
 * eBay status that also honors the server-side connect flow: a stored refresh
 * token counts as configured even when EBAY_REFRESH_TOKEN env is absent.
 * Async because it reads the token store.
 */
export async function getEbayChannelStatus() {
  const { getEbayRefreshToken, getLastEbayAuthError } = await import("./ebayConnect.js");
  const base = getChannelStatuses().find((c) => c.id === "ebay");
  const refreshToken = await getEbayRefreshToken();
  const keysPresent = present("EBAY_CLIENT_ID") && present("EBAY_CLIENT_SECRET");
  const missing = ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "EBAY_SELLER_ID"].filter((k) => !present(k));
  if (!refreshToken) missing.push("EBAY_REFRESH_TOKEN");
  return {
    ...base,
    configured: keysPresent && Boolean(refreshToken),
    tokenStored: Boolean(refreshToken) && !present("EBAY_REFRESH_TOKEN"),
    missing,
    lastError: getLastEbayAuthError(),
  };
}

export { CHANNELS };
