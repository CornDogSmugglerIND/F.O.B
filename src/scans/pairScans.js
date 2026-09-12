import { basename, extname } from "node:path";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"]);

const SIDE_RE = /[_\-\s]?(front|back|recto|verso|a|b|obverse|reverse)$/i;

/**
 * Normalize a filename stem into a pair id + side hint.
 */
export function parseScanStem(stem) {
  const raw = String(stem || "").trim();
  const sideMatch = raw.match(SIDE_RE);
  if (!sideMatch) {
    return { id: raw.toLowerCase(), side: null, label: raw };
  }
  const sideRaw = sideMatch[1].toLowerCase();
  const side =
    sideRaw === "back" || sideRaw === "verso" || sideRaw === "b" || sideRaw === "reverse"
      ? "back"
      : "front";
  const trimmed = raw.slice(0, sideMatch.index).replace(/[_\-\s]+$/g, "");
  return {
    id: (trimmed || raw).toLowerCase(),
    side,
    label: trimmed || raw,
  };
}

export function isImagePath(filePath) {
  return IMAGE_EXT.has(extname(filePath).toLowerCase());
}

/**
 * Pair scan files into front/back groups.
 * @param {string[]} filePaths
 * @param {{ sequential?: boolean }} [opts]
 */
export function pairScanFiles(filePaths, opts = {}) {
  const images = [...filePaths].filter(isImagePath).sort((a, b) =>
    basename(a).localeCompare(basename(b), undefined, { numeric: true, sensitivity: "base" })
  );

  if (opts.sequential) {
    const pairs = [];
    for (let i = 0; i < images.length; i += 2) {
      const front = images[i] || null;
      const back = images[i + 1] || null;
      const label = front ? basename(front, extname(front)) : `pair-${i / 2 + 1}`;
      pairs.push({
        id: `seq-${String(i / 2 + 1).padStart(3, "0")}`,
        label,
        front,
        back,
        files: [front, back].filter(Boolean),
      });
    }
    return pairs;
  }

  /** @type {Map<string, { id: string, label: string, front: string|null, back: string|null, unset: string[] }>} */
  const map = new Map();

  for (const filePath of images) {
    const stem = basename(filePath, extname(filePath));
    const parsed = parseScanStem(stem);
    if (!map.has(parsed.id)) {
      map.set(parsed.id, {
        id: parsed.id,
        label: parsed.label,
        front: null,
        back: null,
        unset: [],
      });
    }
    const entry = map.get(parsed.id);
    if (parsed.side === "front" && !entry.front) entry.front = filePath;
    else if (parsed.side === "back" && !entry.back) entry.back = filePath;
    else entry.unset.push(filePath);
  }

  const pairs = [];
  for (const entry of map.values()) {
    for (const extra of entry.unset) {
      if (!entry.front) entry.front = extra;
      else if (!entry.back) entry.back = extra;
      else {
        pairs.push({
          id: `${entry.id}-extra-${pairs.length}`,
          label: basename(extra, extname(extra)),
          front: extra,
          back: null,
          files: [extra],
        });
      }
    }
    pairs.push({
      id: entry.id,
      label: entry.label,
      front: entry.front,
      back: entry.back,
      files: [entry.front, entry.back].filter(Boolean),
    });
  }

  return pairs.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

/**
 * Draft card fields from a filename label.
 * Supports: "Set_Number_Card Name" or "Card Name"
 */
export function draftMetaFromLabel(label) {
  const text = String(label || "").trim();
  const parts = text.split(/[_/]+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    return {
      cardName: parts.slice(2).join(" "),
      setName: parts[0],
      cardNumber: parts[1].replace(/^0+(\d)/, "$1"),
    };
  }
  return {
    cardName: text.replace(/[_\-]+/g, " ").trim(),
    setName: "",
    cardNumber: "",
  };
}
