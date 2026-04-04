// ============================================================
// Cron — nightly jobs
//
// Three jobs, one runner:
//   1. Decay: apply XP decay to all non-permanent nodes
//   2. Similarity: re-evaluate cross-discipline connections
//   3. Daily push: generate slip challenges
//
// Run: npm run cron
// Or schedule via OS cron / systemd timer.
// ============================================================

import { initDb, getDb, closeDb } from "@/lib/db/connection";
import { applyDecay } from "./memory";
import { evaluateAllUsers } from "./similarity";
import { generateDailyPush } from "./daily-push";

export function runNightly(): void {
  initDb();
  const db = getDb();

  const users = db.prepare("SELECT id FROM users").all() as { id: string }[];

  console.log(`Running nightly for ${users.length} users...`);

  for (const user of users) {
    // 1. Decay
    const decay = applyDecay(user.id);
    console.log(`  ${user.id}: decayed=${decay.decayed} pruned=${decay.pruned} demoted=${decay.demoted}`);

    // 2. Daily push
    const challenges = generateDailyPush(user.id);
    console.log(`  ${user.id}: ${challenges.length} challenges generated`);
  }

  // 3. Similarity (all users at once)
  const simResults = evaluateAllUsers();
  for (const [userId, scores] of simResults) {
    console.log(`  ${userId}: ${scores.length} similarity scores evaluated`);
  }

  console.log("Nightly complete.");
}

// Run directly if called as script
runNightly();
closeDb();
