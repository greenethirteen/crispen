// Persistent job store: finished packages are written to the Railway volume
// so a refresh (or a week) can't lose a paid conversion.

import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { ReportRow } from "./pipeline";

const DIR = path.join(process.cwd(), ".data", "packages");
const INDEX = path.join(process.cwd(), ".data", "jobs.json");

export interface JobRecord {
  id: string;
  owner: string; // email, or "__admin__"
  createdAt: string;
  sizeBytes: number;
  widthIn: number;
  heightIn: number;
  layerNames: string[];
  vectorCount: number;
  report: ReportRow[];
}

interface JobIndex {
  jobs: Record<string, JobRecord>;
}

async function loadIndex(): Promise<JobIndex> {
  try {
    return JSON.parse(await fs.readFile(INDEX, "utf8"));
  } catch {
    return { jobs: {} };
  }
}

async function saveIndex(index: JobIndex): Promise<void> {
  await fs.mkdir(path.dirname(INDEX), { recursive: true });
  await fs.writeFile(INDEX, JSON.stringify(index, null, 2));
}

export async function saveJob(
  owner: string,
  zip: Buffer,
  meta: Omit<JobRecord, "id" | "owner" | "createdAt" | "sizeBytes">,
): Promise<JobRecord> {
  const id = randomUUID();
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(path.join(DIR, `${id}.zip`), zip);
  const record: JobRecord = {
    id,
    owner,
    createdAt: new Date().toISOString(),
    sizeBytes: zip.length,
    ...meta,
  };
  const index = await loadIndex();
  index.jobs[id] = record;
  await saveIndex(index);
  return record;
}

export async function listJobs(owner: string): Promise<JobRecord[]> {
  const index = await loadIndex();
  return Object.values(index.jobs)
    .filter((j) => j.owner === owner)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20);
}

export async function getJob(
  id: string,
): Promise<{ record: JobRecord; file: string } | null> {
  const index = await loadIndex();
  const record = index.jobs[id];
  if (!record) return null;
  return { record, file: path.join(DIR, `${id}.zip`) };
}
