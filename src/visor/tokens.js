/**
 * Visor materials — single source of truth (Base44 visor.js pattern).
 * design/COMMAND-BRAIN.md §6 / BASE44-TRUTH.md §5.2
 * Synced with public/visor/tokens.css
 */
export const VISOR = Object.freeze({
  bg: "#050507",
  panel: "rgba(12,12,16,0.72)",
  raised: "rgba(18,18,24,0.85)",
  amber: "#F2A03D",
  amberHot: "#FFC46B",
  amberDim: "rgba(242,160,61,0.34)",
  cyan: "#8EC8D4",
  cyanDim: "rgba(142,200,212,0.35)",
  text: "#F2F3F5",
  textDim: "#9AA3AB",
  textMute: "#6B737A",
  danger: "#E85A6B",
  ok: "#6ECF8E",
  blur: "18px",
  cut: "12px",
  ease: "cubic-bezier(0.22, 1, 0.36, 1)",
  duration: "220ms",
  fontChrome: '"JetBrains Mono", ui-monospace, monospace',
  fontBody: '"Segoe UI", "Helvetica Neue", ui-sans-serif, system-ui, sans-serif',
});
