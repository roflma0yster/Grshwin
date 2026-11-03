// Copies the Basic Pitch model files from node_modules into public/ so the browser can fetch them.
// Run once after installing (`npm run setup:basic-pitch`) and commit public/basic-pitch.
import { cp, access } from "node:fs/promises";

const from = "node_modules/@spotify/basic-pitch/model";
const to = "public/basic-pitch";
try { await access(from); } catch {
  console.error(`Not found: ${from}. Install dependencies first, and check where the package keeps model.json.`);
  process.exit(1);
}
await cp(from, to, { recursive: true });
console.log(`Copied ${from} -> ${to}`);
