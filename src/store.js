import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

/** Vercel serverless only allows writes under /tmp (ephemeral). */
let dataRoot = process.env.VERCEL
  ? join(tmpdir(), "scouter-data")
  : join(process.cwd(), "data");
let ready = false;

/** @typedef {{ id: string, filename: string, url: string, createdAt: string }} Photo */
/** @typedef {{ id: string, createdAt: string, updatedAt: string, title: string | null, barcode: string | null, quantity: number, category: string, brand: string | null, description: string | null, lookupSource: string | null, notes: string | null, photos: Photo[] }} ScoutItem */

function itemsFile() {
  return join(dataRoot, "scouter.json");
}

export function getUploadsDir() {
  return join(dataRoot, "uploads");
}

/** @param {string} root */
export function setDataRoot(root) {
  dataRoot = root;
  ready = false;
}

async function ensureReady() {
  if (ready) return;
  await mkdir(getUploadsDir(), { recursive: true });
  try {
    await readFile(itemsFile(), "utf8");
  } catch {
    await writeFile(itemsFile(), "[]", "utf8");
  }
  ready = true;
}

async function readItems() {
  await ensureReady();
  return /** @type {ScoutItem[]} */ (JSON.parse(await readFile(itemsFile(), "utf8")));
}

async function writeItems(items) {
  await ensureReady();
  await writeFile(itemsFile(), JSON.stringify(items, null, 2), "utf8");
}

export async function listScoutItems() {
  const items = await readItems();
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getScoutItem(id) {
  return (await readItems()).find((item) => item.id === id) ?? null;
}

export async function createScoutItem(partial = {}) {
  const now = new Date().toISOString();
  /** @type {ScoutItem} */
  const item = {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    title: partial.title ?? null,
    barcode: partial.barcode ?? null,
    quantity: Math.max(1, Number(partial.quantity) || 1),
    category: partial.category ?? "other",
    brand: partial.brand ?? null,
    description: partial.description ?? null,
    lookupSource: partial.lookupSource ?? null,
    notes: partial.notes ?? null,
    photos: [],
  };
  const items = await readItems();
  items.push(item);
  await writeItems(items);
  return item;
}

export async function updateScoutItem(id, patch) {
  const items = await readItems();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return null;

  const current = items[index];
  const next = {
    ...current,
    ...patch,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
    quantity: patch.quantity != null ? Math.max(1, Number(patch.quantity) || 1) : current.quantity,
    photos: patch.photos ?? current.photos,
  };
  items[index] = next;
  await writeItems(items);
  return next;
}

export async function deleteScoutItem(id) {
  const items = await readItems();
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) return false;
  await writeItems(next);
  return true;
}

export async function addPhotoToItem(id, photo) {
  const item = await getScoutItem(id);
  if (!item) return null;
  return updateScoutItem(id, { photos: [...item.photos, photo] });
}
