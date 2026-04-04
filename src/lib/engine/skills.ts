import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { getDb } from "@/lib/db/connection";
import { generateId } from "@/lib/utils/id";
import type { SkillFile } from "@/lib/types/core";

interface SkillFrontmatter {
  name: string;
  description: string;
  dimensions: string[]; // discipline IDs this skill applies to
  difficulty_min: number;
  difficulty_max: number;
}

interface MermaidNode {
  id: string;
  label: string; // the function to execute
}

interface MermaidEdge {
  from: string;
  to: string;
  label: string; // parameters: where/how to apply the node function
}

export interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  mermaid: string;
  nodes: MermaidNode[];
  edges: MermaidEdge[];
}

/**
 * Parse a .md skill file.
 *
 * Format:
 * ---
 * name: Socratic Drill
 * description: Guided questioning workflow
 * dimensions: [disc_id_1, disc_id_2]
 * difficulty_min: 0.2
 * difficulty_max: 0.8
 * ---
 *
 * ```mermaid
 * graph TD
 *     A[assess_current_level] -->|"d=target, w=0.5"| B[generate_question]
 *     ...
 * ```
 */
export function parseSkillFile(content: string): ParsedSkill {
  // Extract frontmatter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const frontmatter: SkillFrontmatter = {
    name: "Unnamed Skill",
    description: "",
    dimensions: [],
    difficulty_min: 0.1,
    difficulty_max: 1.0,
  };

  if (fmMatch) {
    const lines = fmMatch[1].split("\n");
    for (const line of lines) {
      const [key, ...rest] = line.split(":");
      const value = rest.join(":").trim();
      switch (key.trim()) {
        case "name":
          frontmatter.name = value;
          break;
        case "description":
          frontmatter.description = value;
          break;
        case "dimensions":
          frontmatter.dimensions = JSON.parse(value || "[]");
          break;
        case "difficulty_min":
          frontmatter.difficulty_min = parseFloat(value);
          break;
        case "difficulty_max":
          frontmatter.difficulty_max = parseFloat(value);
          break;
      }
    }
  }

  // Extract mermaid block
  const mermaidMatch = content.match(/```mermaid\n([\s\S]*?)```/);
  const mermaid = mermaidMatch?.[1]?.trim() ?? "";

  // Parse mermaid nodes and edges
  const nodes: MermaidNode[] = [];
  const edges: MermaidEdge[] = [];

  const nodePattern = /(\w+)\[([^\]]+)\]/g;
  const edgePattern = /(\w+)\s*-->\|"?([^"|]*)"?\|\s*(\w+)/g;
  const simpleEdgePattern = /(\w+)\s*-->\s*(\w+)/g;

  let match;
  const seenNodes = new Set<string>();

  while ((match = nodePattern.exec(mermaid)) !== null) {
    if (!seenNodes.has(match[1])) {
      nodes.push({ id: match[1], label: match[2] });
      seenNodes.add(match[1]);
    }
  }

  while ((match = edgePattern.exec(mermaid)) !== null) {
    edges.push({ from: match[1], to: match[3], label: match[2] });
  }

  while ((match = simpleEdgePattern.exec(mermaid)) !== null) {
    const exists = edges.some((e) => e.from === match![1] && e.to === match![2]);
    if (!exists) {
      edges.push({ from: match[1], to: match[2], label: "" });
    }
  }

  return { frontmatter, mermaid, nodes, edges };
}

/**
 * Load all skill files from the content/skills directory and register them in the DB.
 */
export function loadSkillFiles(skillsDir?: string): SkillFile[] {
  const dir = skillsDir ?? join(process.cwd(), "content/skills");
  const db = getDb();
  const skills: SkillFile[] = [];

  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }

  for (const filename of files) {
    const content = readFileSync(join(dir, filename), "utf-8");
    const parsed = parseSkillFile(content);

    const id = generateId();
    const skill: SkillFile = {
      id,
      filename,
      name: parsed.frontmatter.name,
      description: parsed.frontmatter.description,
      dimension_mask: JSON.stringify(parsed.frontmatter.dimensions),
      difficulty_min: parsed.frontmatter.difficulty_min,
      difficulty_max: parsed.frontmatter.difficulty_max,
      mermaid_source: parsed.mermaid,
    };

    db.prepare(`
      INSERT OR REPLACE INTO skill_files (id, filename, name, description, dimension_mask, difficulty_min, difficulty_max, mermaid_source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, filename, skill.name, skill.description, skill.dimension_mask, skill.difficulty_min, skill.difficulty_max, skill.mermaid_source);

    skills.push(skill);
  }

  return skills;
}

/**
 * Select the best skill for a discipline at a given difficulty.
 *
 * s* = argmax_{s ∈ S} (m_s · |Δ_u|) subject to w ∈ [w_min_s, w_max_s]
 */
export function selectSkill(
  disciplineId: string,
  difficulty: number
): SkillFile | null {
  const db = getDb();

  const skills = db.prepare(`
    SELECT * FROM skill_files
    WHERE difficulty_min <= ? AND difficulty_max >= ?
  `).all(difficulty, difficulty) as SkillFile[];

  if (skills.length === 0) return null;

  // Score by dimension mask alignment
  let bestSkill: SkillFile | null = null;
  let bestScore = -1;

  for (const skill of skills) {
    const mask: string[] = JSON.parse(skill.dimension_mask);
    const score = mask.includes(disciplineId) ? 1 : 0;
    if (score > bestScore) {
      bestScore = score;
      bestSkill = skill;
    }
  }

  return bestSkill ?? skills[0];
}
