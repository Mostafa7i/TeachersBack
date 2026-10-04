const catchAsync = require('../utils/catchAsync');
const { success, error } = require('../utils/apiResponse');
const Schedule = require('../models/Schedule.model');
const Week = require('../models/Week.model');

/**
 * Helper: count frequency of each non-empty string value in an array.
 * Returns array sorted by frequency desc, limited to top N.
 */
function rankByFrequency(values, topN = 5) {
  const freq = {};
  for (const val of values) {
    if (typeof val === 'string' && val.trim() !== '') {
      const key = val.trim();
      freq[key] = (freq[key] || 0) + 1;
    }
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([v]) => v);
}

/**
 * Helper: detect sequential lesson patterns.
 * Given an ordered list of lessonTitles (per week, oldest first),
 * return candidate "next" lessons after the most-recent one.
 */
function detectNextLesson(orderedTitles, lastTitle) {
  if (!lastTitle) return [];
  const suggestions = [];
  for (let i = 0; i < orderedTitles.length - 1; i++) {
    if (orderedTitles[i] === lastTitle) {
      const next = orderedTitles[i + 1];
      if (next && next.trim() !== '' && next !== lastTitle) {
        suggestions.push(next.trim());
      }
    }
  }
  // Deduplicate while preserving order
  return [...new Set(suggestions)];
}

/**
 * POST /api/ai/suggest-lesson
 * Body: { scheduleId?, className, subjectId, day, period, weekId }
 */
const suggestLessonPlan = catchAsync(async (req, res) => {
  const { className, subjectId, day, period, weekId } = req.body;

  if (!subjectId || !className || !day || !period || !weekId) {
    return error(
      res,
      'البيانات المطلوبة ناقصة: subjectId, className, day, period, weekId',
      400
    );
  }

  // ── 1. Resolve the current week to find its start date ──────────────────
  const currentWeek = await Week.findById(weekId).lean();
  if (!currentWeek) {
    return error(res, 'الأسبوع المطلوب غير موجود', 404);
  }

  // Fetch the past 8 weeks (weeks that started before the current week)
  const pastWeeks = await Week.find({
    startDate: { $lt: currentWeek.startDate },
  })
    .sort({ startDate: -1 })
    .limit(8)
    .lean();

  const pastWeekIds = pastWeeks.map((w) => w._id);
  const weeksAnalyzed = pastWeekIds.length;

  if (weeksAnalyzed === 0) {
    return success(res, {
      lessonTitle: [],
      homework: [],
      activities: [],
      notes: [],
      classContext: { totalPastLessons: 0, weeksAnalyzed: 0 },
    }, 'لا توجد بيانات كافية للاقتراحات');
  }

  // ── 2. Fetch schedules at three priority levels ──────────────────────────

  // Priority 1: same subject + same className + same period (same slot)
  const p1Schedules = await Schedule.find({
    week: { $in: pastWeekIds },
    subject: subjectId,
    className,
    period: Number(period),
    day,
  })
    .sort({ 'week.startDate': 1 })
    .lean();

  // Priority 2: same subject + same className (any period / any day)
  const p2Schedules = await Schedule.find({
    week: { $in: pastWeekIds },
    subject: subjectId,
    className,
  })
    .lean();

  // Priority 3: same subject only (any class)
  const p3Schedules = await Schedule.find({
    week: { $in: pastWeekIds },
    subject: subjectId,
  })
    .lean();

  const totalPastLessons = p3Schedules.length;

  // ── 3. Collect field values per priority ────────────────────────────────
  const fields = ['lessonTitle', 'homework', 'activities', 'notes'];

  // Build weighted pool: p1 values repeated 3×, p2 2×, p3 1×
  const pool = {};
  for (const f of fields) pool[f] = [];

  for (const sch of p3Schedules) {
    for (const f of fields) {
      if (sch[f] && sch[f].trim() !== '') pool[f].push(sch[f].trim());
    }
  }
  for (const sch of p2Schedules) {
    for (const f of fields) {
      if (sch[f] && sch[f].trim() !== '') pool[f].push(sch[f].trim());
    }
  }
  // P1 added twice more (total weight = 3)
  for (const sch of p1Schedules) {
    for (const f of fields) {
      if (sch[f] && sch[f].trim() !== '') {
        pool[f].push(sch[f].trim());
        pool[f].push(sch[f].trim());
      }
    }
  }

  // ── 4. Sequential pattern detection for lessonTitle ─────────────────────
  // Build chronologically ordered list of lesson titles from p1 (same exact slot)
  const orderedP1Titles = p1Schedules
    .map((s) => (s.lessonTitle || '').trim())
    .filter(Boolean);

  // The last known lesson title for this slot
  const lastKnownTitle =
    orderedP1Titles.length > 0
      ? orderedP1Titles[orderedP1Titles.length - 1]
      : null;

  const sequentialSuggestions = detectNextLesson(orderedP1Titles, lastKnownTitle);

  // ── 5. Rank suggestions ──────────────────────────────────────────────────
  const freqLessonTitles = rankByFrequency(pool.lessonTitle, 5);

  // Merge sequential suggestions at the top of lessonTitle results
  const mergedLessonTitles = [
    ...sequentialSuggestions,
    ...freqLessonTitles.filter((t) => !sequentialSuggestions.includes(t)),
  ].slice(0, 5);

  const suggestions = {
    lessonTitle: mergedLessonTitles,
    homework: rankByFrequency(pool.homework, 5),
    activities: rankByFrequency(pool.activities, 5),
    notes: rankByFrequency(pool.notes, 5),
    classContext: {
      totalPastLessons,
      weeksAnalyzed,
    },
  };

  return success(res, suggestions, 'تم توليد اقتراحات خطة الدرس بنجاح');
});

module.exports = { suggestLessonPlan };
