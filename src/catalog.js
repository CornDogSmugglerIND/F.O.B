/** Category hubs — aligned with Coalition Command Core intake. */
export const CATEGORIES = [
  { value: "pokemon_sealed", label: "Pokemon Sealed", core: "#FFB43D", hi: "#FFD98A", icon: "📦" },
  { value: "graded_slabs", label: "Graded Slabs", core: "#2BD9C0", hi: "#8FF6E8", icon: "🏆" },
  { value: "raw_cards", label: "Raw Cards", core: "#4FA8D8", hi: "#BFE9FF", icon: "🃏" },
  { value: "sports_cards", label: "Sports Cards", core: "#2E6F91", hi: "#7FD4FF", icon: "⚾" },
  { value: "other", label: "Other", core: "#4FC3F7", hi: "#A8E4FF", icon: "📋" },
];

export const CATEGORY_BY_VALUE = Object.fromEntries(CATEGORIES.map((c) => [c.value, c]));
