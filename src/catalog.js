/** Category hubs — amber-gold only (no cyan/blue Base44 chrome). */
export const CATEGORIES = [
  { value: "pokemon_sealed", label: "Pokemon Sealed", core: "#E8B04B", hi: "#FFD98A", icon: "📦" },
  { value: "graded_slabs", label: "Graded Slabs", core: "#C9922F", hi: "#E8B04B", icon: "🏆" },
  { value: "raw_cards", label: "Raw Cards", core: "#D4A84A", hi: "#FFE0A0", icon: "🃏" },
  { value: "sports_cards", label: "Sports Cards", core: "#B8862E", hi: "#E8B04B", icon: "⚾" },
  { value: "other", label: "Other", core: "#A67C2A", hi: "#D4A84A", icon: "📋" },
];

export const CATEGORY_BY_VALUE = Object.fromEntries(CATEGORIES.map((c) => [c.value, c]));
