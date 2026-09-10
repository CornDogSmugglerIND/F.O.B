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
      configured: present("MISPRINT_API_KEY") && present("MISPRINT_SELLER_ID"),
      missing: ["MISPRINT_API_KEY", "MISPRINT_SELLER_ID"].filter((k) => !present(k)),
    },
  ];
}

export function getCanonicalInventory() {
  return process.env.CANONICAL_INVENTORY || "hud";
}

export { CHANNELS };
