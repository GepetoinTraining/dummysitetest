// ============================================================
// Function Executor — the knot crossing
//
// Maps Gemma's <|tool_call>call:NAME{...}<tool_call|>
// to engine functions. Returns results as tool_response.
//
// This is where AI meets engine. One function, one switch,
// no abstraction layers.
// ============================================================

import { recordUsage, queryByName } from "@/lib/engine/registry";
import {
  createMemoryNode,
  findNodeByTag,
  bumpNode,
  createMemoryEdge,
  getMemoryGraph,
} from "@/lib/engine/memory";
import { startSession, endSession, getActiveSession } from "@/lib/engine/session";
import { computeLattice } from "@/lib/engine/lattice";
import { getScores, findBridges } from "@/lib/engine/similarity";
import { generateDailyPush, completeChallenge, ignoreChallenge, getTodayChallenges } from "@/lib/engine/daily-push";
import { createPlan, getActivePlan } from "@/lib/engine/planner";
import { evaluateDelivery, createNotification, getContactPolicy, getPendingNotifications } from "@/lib/engine/notifications";
import { lookup, upsertEntry, entryToNode, search as dictSearch } from "@/lib/engine/dict";
import { grep, writeToPad, readPad, clearPad, padSize } from "@/lib/engine/autopilot";
import { queryTurns, queryByTag, getConversationStats } from "@/lib/engine/context";
import { selectSkill } from "@/lib/engine/skills";
import { updateDisciplineMetadata, updateProfessorMetadata } from "@/lib/engine/tabs";

export interface ExecutionResult {
  name: string;
  result: unknown;
  error?: string;
}

/**
 * Execute a function call from Gemma.
 *
 * Takes the function name and arguments from the tool_call,
 * runs the matching engine function, records usage, returns result.
 */
export function execute(
  userId: string,
  name: string,
  args: Record<string, unknown>,
  sessionId?: string
): ExecutionResult {
  try {
    const result = dispatch(userId, name, args, sessionId);
    recordUsage(name);
    return { name, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { name, result: null, error: message };
  }
}

function dispatch(
  userId: string,
  name: string,
  args: Record<string, unknown>,
  sessionId?: string
): unknown {
  switch (name) {
    // --- Memory ---
    case "create_memory_node":
      return createMemoryNode({
        userId,
        scope: (args.scope as "global" | "contact") ?? "global",
        contactId: args.contact_id as string | undefined,
        disciplineId: args.discipline_id as string | undefined,
        tag: args.tag as string,
        label: args.label as string,
      });

    case "find_memory_by_tag":
      return findNodeByTag(userId, args.tag as string);

    case "bump_memory":
      return bumpNode(args.node_id as string, (args.delta_xp as number) ?? 3);

    case "create_memory_edge":
      return createMemoryEdge({
        sourceId: args.source_id as string,
        targetId: args.target_id as string,
        relation: args.relation as "supports" | "clarifies" | "method" | "contradicts" | "prerequisite" | "applies_to",
        weight: args.weight as number | undefined,
        label: args.label as string | undefined,
      });

    case "get_memory_graph":
      return getMemoryGraph(
        userId,
        args.scope === "contact"
          ? { type: "contact", contactId: args.contact_id as string }
          : args.scope === "global"
            ? { type: "global" }
            : undefined
      );

    // --- Session ---
    case "start_session":
      return startSession(userId, args.discipline_id as string, args.skill_file as string | undefined);

    case "end_session":
      return endSession(args.session_id as string, args.self_assessment as number, args.ai_assessment as number);

    // --- Workspace ---
    case "generate_exercise": {
      const lattice = computeLattice(userId);
      const dim = lattice.dimensions.find((d) => d.discipline_id === args.discipline_id);
      const difficulty = (args.difficulty_override as number) ?? dim?.difficulty ?? 0.5;
      const skill = selectSkill(args.discipline_id as string, difficulty);
      return { skill_used: skill?.filename ?? null, difficulty, discipline: dim };
    }

    // --- Graph ---
    case "create_graph_blob":
      // Handled by API route (needs DB write of JSON blob)
      return { stub: true, name: args.name, skin: args.skin };

    case "add_node_from_dict": {
      const entry = lookup(args.domain as string, args.term as string);
      if (!entry) return { error: `Term "${args.term}" not found in domain "${args.domain}"` };
      return entryToNode(entry, args.position as [number, number, number] | undefined);
    }

    case "register_dict_term":
      return upsertEntry({
        domain: args.domain as string,
        term: args.term as string,
        category: args.category as string,
        properties: args.properties as Record<string, unknown> & { mass: number; charge: number; label: string },
        edge_rules: (args.edge_rules as []) ?? [],
        skin_overrides: (args.skin_overrides as Record<string, unknown>) ?? {},
        source: "ai",
      });

    case "add_simulation_rule":
      // Handled client-side by R3F loop
      return { stub: true, force_type: args.force_type, params: args.params };

    // --- Planner ---
    case "create_plan":
      return createPlan(
        userId,
        args.granularity as "monthly" | "weekly" | "daily",
        args.period_start as number,
        args.period_end as number,
        args.total_hours as number
      );

    case "schedule_task":
      // TODO: implement discrete task scheduling within a plan
      return { scheduled: true, ...args };

    // --- Notification ---
    case "evaluate_notification": {
      const policy = getContactPolicy(args.contact_id as string);
      return evaluateDelivery(
        args.action as "schedule_session" | "share_notes" | "ask_question" | "skill_exchange" | "study_invite",
        args.urgency as number,
        policy
      );
    }

    // --- Assessment ---
    case "assess_student": {
      const quality = (args.chat_quality as number) ?? 0.5;
      const exercises = (args.exercise_scores as number[]) ?? [];
      const engagement = (args.engagement as number) ?? 0.5;
      const avgExercise = exercises.length > 0
        ? exercises.reduce((a, b) => a + b, 0) / exercises.length
        : quality;
      return 0.4 * quality + 0.4 * avgExercise + 0.2 * engagement;
    }

    // --- Lattice ---
    case "get_lattice":
      return computeLattice(userId);

    case "get_connections":
      return getScores(userId, (args.epsilon as number) ?? 0.15);

    // --- Context ---
    case "query_turns":
      return queryTurns(userId, sessionId ?? null, args.from_turn as number, args.to_turn as number);

    case "query_by_tag":
      return queryByTag(userId, args.tag as string, sessionId);

    case "get_conversation_stats":
      return getConversationStats(userId, sessionId);

    // --- Grep + Pad ---
    case "grep":
      return grep(userId, args.query as string, args.sources as ("memory" | "ledger" | "chat" | "dict")[] | undefined, (args.limit as number) ?? 10);

    case "pad_write":
      writeToPad(userId, args.content as string, sessionId);
      return { written: true };

    case "pad_read":
      return readPad(userId, sessionId);

    case "pad_clear":
      clearPad(userId, sessionId, args.index as number | undefined);
      return { cleared: true };

    case "pad_size":
      return padSize(userId, sessionId);

    // --- Tab metadata ---
    case "update_discipline_context":
      updateDisciplineMetadata(args.discipline_id as string, args.updates as Record<string, unknown>);
      return { updated: true };

    case "update_teacher_profile":
      updateProfessorMetadata(args.professor_id as string, args.updates as Record<string, unknown>);
      return { updated: true };

    // --- Daily Push ---
    case "get_slipping_knowledge":
      return generateDailyPush(userId);

    default:
      throw new Error(`Unknown function: ${name}`);
  }
}
