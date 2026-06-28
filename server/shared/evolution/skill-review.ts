/**
 * Skill Review Gate — User confirmation flow for auto-generated skills
 *
 * All skills crafted by SkillCrafter must pass through this review
 * gate before being applied. The user can approve, reject, or
 * request edits.
 *
 * This is a critical safety mechanism: auto-generated skills
 * represent potential code injection vectors if not reviewed.
 */

import fs from 'fs';
import path from 'path';
import type { SkillDraft } from '../../../shared/types';

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface ReviewEntry {
  skill: SkillDraft;
  reviewedAt?: string;
  reviewNote?: string;
}

const REVIEW_FILE = 'skill-reviews.json';

/**
 * Get the path to the skill review queue file.
 */
function getReviewPath(kavisHomeDir: string): string {
  return path.join(kavisHomeDir, REVIEW_FILE);
}

/**
 * Load the current review queue from disk.
 */
export function loadReviewQueue(kavisHomeDir: string): ReviewEntry[] {
  const reviewPath = getReviewPath(kavisHomeDir);
  if (!fs.existsSync(reviewPath)) return [];

  try {
    return JSON.parse(fs.readFileSync(reviewPath, 'utf-8'));
  } catch (err) {
    // Queue file corrupt — log so the user knows we reset to empty.
    console.error('[Kavis evolution] skill review queue unreadable, resetting:', err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Save the review queue to disk.
 */
function saveReviewQueue(kavisHomeDir: string, queue: ReviewEntry[]): void {
  const reviewPath = getReviewPath(kavisHomeDir);
  const dir = path.dirname(reviewPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = reviewPath + '.tmp.' + Date.now();
  fs.writeFileSync(tmp, JSON.stringify(queue, null, 2), 'utf-8');
  fs.renameSync(tmp, reviewPath);
}

/**
 * Add a skill to the review queue.
 */
export function submitForReview(skill: SkillDraft, kavisHomeDir: string): void {
  const queue = loadReviewQueue(kavisHomeDir);

  // Check for duplicate
  const existing = queue.find((e) => e.skill.id === skill.id);
  if (existing) return;

  queue.push({ skill });
  saveReviewQueue(kavisHomeDir, queue);
}

/**
 * Add multiple skills to the review queue.
 */
export function submitManyForReview(skills: SkillDraft[], kavisHomeDir: string): void {
  const queue = loadReviewQueue(kavisHomeDir);
  const existingIds = new Set(queue.map((e) => e.skill.id));

  for (const skill of skills) {
    if (!existingIds.has(skill.id)) {
      queue.push({ skill });
    }
  }

  saveReviewQueue(kavisHomeDir, queue);
}

/**
 * Get pending reviews (skills awaiting user action).
 */
export function getPendingReviews(kavisHomeDir: string): ReviewEntry[] {
  const queue = loadReviewQueue(kavisHomeDir);
  return queue.filter((e) => e.skill.status === 'pending');
}

/**
 * Approve a skill and apply it.
 */
export function approveSkill(skillId: string, kavisHomeDir: string, note?: string): SkillDraft | null {
  const queue = loadReviewQueue(kavisHomeDir);
  const entry = queue.find((e) => e.skill.id === skillId);

  if (!entry) return null;

  entry.skill.status = 'approved';
  entry.reviewedAt = new Date().toISOString();
  entry.reviewNote = note;

  saveReviewQueue(kavisHomeDir, queue);

  // Apply the approved skill to the skill library
  applySkill(entry.skill, kavisHomeDir);

  return entry.skill;
}

/**
 * Reject a skill.
 */
export function rejectSkill(skillId: string, kavisHomeDir: string, note?: string): SkillDraft | null {
  const queue = loadReviewQueue(kavisHomeDir);
  const entry = queue.find((e) => e.skill.id === skillId);

  if (!entry) return null;

  entry.skill.status = 'rejected';
  entry.reviewedAt = new Date().toISOString();
  entry.reviewNote = note;

  saveReviewQueue(kavisHomeDir, queue);

  // Record rejection to avoid re-suggesting
  recordRejection(entry.skill, kavisHomeDir);

  return entry.skill;
}

/**
 * Apply an approved skill to the skill library.
 * Writes the skill content to ~/.kavis/skills/.
 */
function applySkill(skill: SkillDraft, kavisHomeDir: string): void {
  const skillsDir = path.join(kavisHomeDir, 'skills');
  if (!fs.existsSync(skillsDir)) {
    fs.mkdirSync(skillsDir, { recursive: true });
  }

  const skillFile = path.join(skillsDir, `${skill.name}.md`);
  const tmp = skillFile + '.tmp.' + Date.now();
  fs.writeFileSync(tmp, skill.content, 'utf-8');
  fs.renameSync(tmp, skillFile);
}

/**
 * Record a rejection to prevent re-suggesting the same skill.
 */
function recordRejection(skill: SkillDraft, kavisHomeDir: string): void {
  const rejectionsPath = path.join(kavisHomeDir, 'rejected-skills.json');

  let rejections: Array<{ name: string; reason: string; rejectedAt: string }> = [];
  if (fs.existsSync(rejectionsPath)) {
    try {
      rejections = JSON.parse(fs.readFileSync(rejectionsPath, 'utf-8'));
    } catch { /* ignore */ }
  }

  rejections.push({
    name: skill.name,
    reason: skill.description,
    rejectedAt: new Date().toISOString(),
  });

  // Keep only last 50 rejections
  if (rejections.length > 50) {
    rejections = rejections.slice(-50);
  }

  const tmp = rejectionsPath + '.tmp.' + Date.now();
  fs.writeFileSync(tmp, JSON.stringify(rejections, null, 2), 'utf-8');
  fs.renameSync(tmp, rejectionsPath);
}

/**
 * Check if a skill name has been previously rejected.
 */
export function wasRejected(skillName: string, kavisHomeDir: string): boolean {
  const rejectionsPath = path.join(kavisHomeDir, 'rejected-skills.json');
  if (!fs.existsSync(rejectionsPath)) return false;

  try {
    const rejections: Array<{ name: string }> = JSON.parse(
      fs.readFileSync(rejectionsPath, 'utf-8')
    );
    return rejections.some((r) => r.name === skillName);
  } catch (err) {
    // SECURITY: if the rejection log is unreadable, we treat the skill as not
    // rejected. Log loudly so a tampered/corrupt rejection list is visible.
    console.error('[Kavis evolution] wasRejected check failed, allowing skill through:', err instanceof Error ? err.message : err);
    return false;
  }
}
