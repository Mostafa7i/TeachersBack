const { PDFParse } = require("pdf-parse");

const ARABIC_DAYS = [
  "الأحد",
  "الإثنين",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الاربعاء",
  "الخميس",
];

const CANONICAL_DAYS = {
  الأحد: "الأحد",
  الإثنين: "الإثنين",
  الاثنين: "الإثنين",
  الثلاثاء: "الثلاثاء",
  الأربعاء: "الأربعاء",
  الاربعاء: "الأربعاء",
  الخميس: "الخميس",
};

const PERIOD_WORDS = {
  الأولى: 1,
  الاولى: 1,
  الثانية: 2,
  الثالثة: 3,
  الرابعة: 4,
  الخامسة: 5,
  السادسة: 6,
  السابعة: 7,
  الثامنة: 8,
};

// Common class regex patterns: "1/1", "1-1", "1/2", "أول أول", "ثاني ثالث", "الصف الأول أ", etc.
const CLASS_PATTERNS = [
  /(?:الصف\s+)?(أول|ثاني|ثالث|رابع|خامس|سادس)\s+(أول|ثاني|ثالث|رابع|خامس|أ|ب|ج|د|1|2|3|4)/i,
  /([1-6])\s*[\/\-]\s*([1-6])/i,
  /([1-6])\s*(أ|ب|ج|د|هـ)/i,
  /(أولى|ثانية|ثالثة|رابعة|خامسة|سادسة)\s+(أول|ثاني|ثالث|أ|ب|ج|1|2|3)/i,
];

// Common subject patterns to recognize in cells
const COMMON_SUBJECT_KEYWORDS = [
  "رياضيات",
  "علوم",
  "لغتي",
  "عربي",
  "اللغة العربية",
  "إنجليزي",
  "انجليزي",
  "English",
  "دراسات إسلامية",
  "إسلاميات",
  "قرآن",
  "قران",
  "توحيد",
  "فقه",
  "حديث",
  "تفسير",
  "دراسات اجتماعية",
  "اجتماعيات",
  "تاريخ",
  "جغرافيا",
  "مهارات رقمية",
  "حاسب",
  "تربية بدنية",
  "بدنية",
  "تربية فنية",
  "فنية",
  "كيمياء",
  "فيزياء",
  "أحياء",
  "مهارات حياتية",
  "تفكير ناقد",
  "علم البيئة",
];

/**
 * Normalize Arabic text for fuzzy matching
 */
function normalizeArabic(str) {
  if (!str) return "";
  return str
    .replace(/[\u064B-\u065F\u0670]/g, "") // remove tashkeel
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Calculate simple Levenshtein similarity (0 to 1)
 */
function stringSimilarity(s1, s2) {
  const norm1 = normalizeArabic(s1);
  const norm2 = normalizeArabic(s2);
  if (!norm1 || !norm2) return 0;
  if (norm1 === norm2) return 1;
  if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.85;

  const len1 = norm1.length;
  const len2 = norm2.length;
  const maxLen = Math.max(len1, len2);
  if (maxLen === 0) return 1;

  const matrix = [];
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = norm1[i - 1] === norm2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[len1][len2];
  return Math.max(0, (maxLen - distance) / maxLen);
}

/**
 * Extract teacher name from page text or header lines
 */
function extractTeacherName(text, pageNum) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Look for explicit prefix: "المعلم: ...", "الأستاذ: ...", "أ/ ...", "جدول المعلم: ..."
  const prefixRegex =
    /(?:المعلم|المعلمة|الأستاذ|الاستاذ|الأستاذة|الاستاذة|أ|أستاذ|اسم المعلم|جدول المعلم|جدول الأستاذ)\s*[\/:\-ـ]?\s*([^\n\r,\|0-9]{3,40})/i;

  for (const line of lines.slice(0, 15)) {
    const match = line.match(prefixRegex);
    if (match && match[1]) {
      const candidate = match[1]
        .replace(/مدرسة.*/g, "")
        .replace(/العام الدراسي.*/g, "")
        .replace(/الفصل.*/g, "")
        .replace(/جدول.*/g, "")
        .trim();
      if (candidate.length >= 3 && !/^(الحصة|الأحد|اليوم|الفصل)$/.test(candidate)) {
        return candidate;
      }
    }
  }

  // Check early lines that look like person names (2 to 4 Arabic words, no digits or table words)
  for (const line of lines.slice(0, 8)) {
    if (
      line.length >= 6 &&
      line.length <= 40 &&
      !line.match(/مدرسة|وزارة|تعليم|المملكة|جدول|الحصة|الأحد|الفصل|الإدارة/i) &&
      !line.match(/[0-9\/\-:]/)
    ) {
      const words = line.split(/\s+/).filter(Boolean);
      if (words.length >= 2 && words.length <= 5) {
        return line;
      }
    }
  }

  return `معلم جدول ${pageNum}`;
}

/**
 * Identify class name from string
 */
function detectClassName(str) {
  if (!str) return "";
  const cleaned = str.trim();

  // Check 1/1, 2/3, etc.
  const slashMatch = cleaned.match(/([1-6]\s*[\/\-]\s*[1-6])/);
  if (slashMatch) return slashMatch[1].replace(/\s+/g, "");

  // Check Arabic names "أول أول", "ثاني ثالث"
  const arabicMatch = cleaned.match(
    /(أول|ثاني|ثالث|رابع|خامس|سادس)\s+(أول|ثاني|ثالث|رابع|خامس|أ|ب|ج|د|1|2|3|4)/
  );
  if (arabicMatch) return `${arabicMatch[1]} ${arabicMatch[2]}`;

  return "";
}

/**
 * Identify subject name from string
 */
function detectSubjectName(str, knownSubjects = []) {
  if (!str) return "";
  const cleaned = str.trim();

  // Check against known subjects in DB first
  for (const sub of knownSubjects) {
    if (cleaned.includes(sub.name) || (sub.nameEn && cleaned.toLowerCase().includes(sub.nameEn.toLowerCase()))) {
      return sub.name;
    }
  }

  // Check against common keywords
  for (const kw of COMMON_SUBJECT_KEYWORDS) {
    if (cleaned.includes(kw)) {
      return kw;
    }
  }

  return "";
}

/**
 * Main parser function: processes PDF buffer and returns detected timetables
 */
async function parseTimetablePdf(buffer, existingTeachers = [], existingSubjects = []) {
  const parser = new PDFParse({ data: buffer });
  let textResult = null;
  let tableResult = null;

  try {
    textResult = await parser.getText();
  } catch (err) {
    console.warn("PDF getText failed:", err.message);
  }

  try {
    tableResult = await parser.getTable();
  } catch (err) {
    // getTable is optional / fallback
    console.warn("PDF getTable notice:", err.message);
  }

  const pages = textResult?.pages || [];
  const detectedTimetables = [];

  for (let pIdx = 0; pIdx < pages.length; pIdx++) {
    const pageObj = pages[pIdx];
    const pageText = pageObj.text || "";
    const pageNum = pageObj.num || pIdx + 1;

    // Check if this page contains schedule keywords (days / periods)
    const hasDays = ARABIC_DAYS.some((d) => pageText.includes(d));
    if (!hasDays && pageText.length < 50) {
      continue; // Skip title or blank pages
    }

    const teacherName = extractTeacherName(pageText, pageNum);

    // Extract entries from page text or page tables
    const entries = [];
    const lines = pageText.split("\n").map((l) => l.trim()).filter(Boolean);

    // Strategy A: Table-based extraction if getTable produced data for this page
    let tableEntriesFound = false;
    if (tableResult && tableResult.pages && tableResult.pages[pIdx]) {
      const pageTableData = tableResult.pages[pIdx]?.tables || [];
      for (const tbl of pageTableData) {
        if (Array.isArray(tbl)) {
          // Check rows
          let headerDays = [];
          for (let r = 0; r < tbl.length; r++) {
            const row = tbl[r];
            if (!Array.isArray(row)) continue;

            // Check if this row has days
            const daysInRow = row.filter((c) =>
              ARABIC_DAYS.some((d) => (c || "").includes(d))
            );

            if (daysInRow.length >= 3) {
              headerDays = row.map((cell) => {
                for (const d of ARABIC_DAYS) {
                  if ((cell || "").includes(d)) return CANONICAL_DAYS[d];
                }
                return null;
              });
              continue;
            }

            // Check if first cell is period number or day
            const firstCell = String(row[0] || "").trim();
            const periodNumMatch = firstCell.match(/^([1-8])$/);
            const dayMatch = ARABIC_DAYS.find((d) => firstCell.includes(d));

            if (periodNumMatch && headerDays.length > 0) {
              const period = Number(periodNumMatch[1]);
              for (let col = 1; col < row.length; col++) {
                const day = headerDays[col];
                const cellVal = String(row[col] || "").trim();
                if (day && cellVal && cellVal.length > 1) {
                  const className = detectClassName(cellVal);
                  const subjectName = detectSubjectName(cellVal, existingSubjects) || "مادة عامة";
                  if (className || cellVal.length >= 2) {
                    entries.push({
                      day,
                      period,
                      className: className || cellVal.slice(0, 15),
                      subjectName,
                      room: "",
                    });
                    tableEntriesFound = true;
                  }
                }
              }
            } else if (dayMatch) {
              // Row represents a Day, columns represent Periods 1-7
              const day = CANONICAL_DAYS[dayMatch];
              for (let col = 1; col < Math.min(row.length, 9); col++) {
                const cellVal = String(row[col] || "").trim();
                if (cellVal && cellVal !== "-" && cellVal !== "—") {
                  const className = detectClassName(cellVal);
                  const subjectName = detectSubjectName(cellVal, existingSubjects) || "مادة عامة";
                  entries.push({
                    day,
                    period: col,
                    className: className || cellVal.slice(0, 15),
                    subjectName,
                    room: "",
                  });
                  tableEntriesFound = true;
                }
              }
            }
          }
        }
      }
    }

    // Strategy B: Text-stream line-by-line parsing if table extraction didn't yield enough
    if (!tableEntriesFound || entries.length < 5) {
      let currentDay = null;
      for (const line of lines) {
        // Check if line specifies a day
        for (const d of ARABIC_DAYS) {
          if (line.includes(d)) {
            currentDay = CANONICAL_DAYS[d];
            break;
          }
        }

        if (!currentDay) continue;

        // Check for period patterns like: "1: رياضيات / أول أول" or "الحصة 2 - لغتي - 2/1"
        const periodMatch = line.match(
          /(?:حصة|الحصة)?\s*([1-8])\s*[\:\-ـ\|\/]\s*(.+)/i
        );

        if (periodMatch) {
          const pNum = Number(periodMatch[1]);
          const rest = periodMatch[2];
          const className = detectClassName(rest);
          const subjectName = detectSubjectName(rest, existingSubjects) || "مادة دراسية";

          if (className || rest.length >= 2) {
            // Avoid duplicate entry for same day & period
            if (!entries.some((e) => e.day === currentDay && e.period === pNum)) {
              entries.push({
                day: currentDay,
                period: pNum,
                className: className || rest.slice(0, 15),
                subjectName,
                room: "",
              });
            }
          }
        }
      }
    }

    // Match teacher against existing users
    let bestMatchTeacher = null;
    let highestSim = 0;

    for (const t of existingTeachers) {
      const sim = stringSimilarity(teacherName, t.name);
      if (sim > highestSim && sim >= 0.55) {
        highestSim = sim;
        bestMatchTeacher = t;
      }
    }

    // Collect distinct subjects and classes
    const distinctSubjects = [...new Set(entries.map((e) => e.subjectName).filter(Boolean))];
    const distinctClasses = [...new Set(entries.map((e) => e.className).filter(Boolean))];

    detectedTimetables.push({
      pageNumber: pageNum,
      extractedName: teacherName,
      matchedTeacherId: bestMatchTeacher ? bestMatchTeacher._id : null,
      matchedTeacherName: bestMatchTeacher ? bestMatchTeacher.name : null,
      matchConfidence: Math.round(highestSim * 100),
      action: bestMatchTeacher ? "assign" : "vacant", // "assign" | "vacant" | "skip"
      entriesCount: entries.length,
      subjects: distinctSubjects.length > 0 ? distinctSubjects : ["مادة عامة"],
      classes: distinctClasses,
      entries,
    });
  }

  return detectedTimetables;
}

module.exports = {
  parseTimetablePdf,
  stringSimilarity,
  normalizeArabic,
};
