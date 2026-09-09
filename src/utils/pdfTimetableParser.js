/**
 * PDF Timetable Parser for aSc Timetables and Arabic School Timetables
 * Uses coordinate-based text extraction via pdfjs-dist
 */

const CANONICAL_DAYS = {
  الأحد: "الأحد",
  الاحد: "الأحد",
  الإثنين: "الإثنين",
  الاثنين: "الإثنين",
  الثلاثاء: "الثلاثاء",
  "الث hisاء": "الثلاثاء",
  الأربعاء: "الأربعاء",
  الاربعاء: "الأربعاء",
  الخميس: "الخميس",
};

const DAY_DEFS = [
  { name: "الأحد", aliases: ["الاحد", "الأحد"] },
  { name: "الإثنين", aliases: ["الاثنين", "الإثنين"] },
  { name: "الثلاثاء", aliases: ["الثلاثاء"] },
  { name: "الأربعاء", aliases: ["الاربعاء", "الأربعاء"] },
  { name: "الخميس", aliases: ["الخميس"] },
];

// Common Arabic name dictionary for matching Arabic names with English/Transliterated accounts
const COMMON_NAME_PAIRS = {
  علي: ["ali", "aly"],
  على: ["ali", "aly"],
  زغلول: ["zaghloul", "zaghlul"],
  احمد: ["ahmed", "ahmad"],
  هشام: ["hesham", "hisham"],
  مصطفى: ["mustafa", "mostafa"],
  محمود: ["mahmoud", "mahmud"],
  محمد: ["mohamed", "mohammed", "muhammad", "mohd"],
  سعيد: ["saeid", "saeed", "said"],
  اسامة: ["osama", "ousama"],
  حسن: ["hassan", "hasan"],
  عبدالرحمن: ["abdelrahman", "abdulrahman", "abdurrahman"],
  "عبد الرحمن": ["abdelrahman", "abdulrahman", "abdurrahman"],
  بهاء: ["bahaa", "baha", "abomoomen"],
  صالح: ["saleh", "salih"],
  صالحي: ["salehi", "salhy", "al351961"],
  برقوقي: ["barqouqi", "albarqouqi"],
};

// Known common subject aliases and normalizations
const SUBJECT_ALIASES = [
  { canon: "رياضيات", aliases: ["رياضيات", "math", "maths"] },
  { canon: "علوم", aliases: ["العلوم", "علوم", "science"] },
  {
    canon: "لغة عربية",
    aliases: ["لغة عربية", "لغتي", "عربي", "اللغة العربية"],
  },
  {
    canon: "درسات اجتماعية",
    aliases: ["درسات اجتماعية", "دراسات اجتماعية", "اجتماعيات"],
  },
  {
    canon: "لغة انجليزية",
    aliases: ["لغة انجليزية", "لغة إنجليزية", "إنجليزي", "انجليزي", "english"],
  },
  {
    canon: "تربية اسلامية",
    aliases: ["تربية اسلامية", "تربية إسلامية", "إسلاميات", "اسلاميات", "دين"],
  },
  { canon: "رقمية", aliases: ["رقمية", "مهارات رقمية", "حاسب", "حاسوب"] },
  { canon: "بدنية", aliases: ["بدنية", "تربية بدنية", "رياضة"] },
  { canon: "فنية", aliases: ["فنية", "تربية فنية", "رسم"] },
  { canon: "قدرات كمي", aliases: ["قدرات كمي", "كمي"] },
  { canon: "قدرات لفظي", aliases: ["قدرات لفظي", "لفظي"] },
  { canon: "تفكير ناقد", aliases: ["تفكير ناقد"] },
  { canon: "رياحين", aliases: ["رياحين"] },
  { canon: "قرآن كريم", aliases: ["قرآن كريم", "قران", "قرآن"] },
  { canon: "توحيد", aliases: ["توحيد"] },
  { canon: "فقه", aliases: ["فقه", "فقة"] },
  { canon: "حديث", aliases: ["حديث"] },
  { canon: "تفسير", aliases: ["تفسير"] },
];

/**
 * Normalize Arabic text: strips diacritics, presentation forms, and standardizes characters
 */
function normalizeArabic(str) {
  if (!str) return "";
  return str
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670]/g, "") // remove tashkeel
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^a-z0-9\u0600-\u06FF\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Calculate Levenshtein similarity (0 to 1)
 */
function stringSimilarity(s1, s2) {
  const norm1 = normalizeArabic(s1);
  const norm2 = normalizeArabic(s2);
  if (!norm1 || !norm2) return 0;
  if (norm1 === norm2) return 1;
  if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.88;

  const len1 = norm1.length;
  const len2 = norm2.length;
  const maxLen = Math.max(len1, len2);
  if (maxLen === 0) return 1;

  const matrix = [];
  for (let i = 0; i <= len1; i++) matrix[i] = [i];
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = norm1[i - 1] === norm2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  const distance = matrix[len1][len2];
  return Math.max(0, (maxLen - distance) / maxLen);
}

/**
 * Match an extracted teacher name to the best user in the database
 */
function matchTeacherToUser(extractedName, existingTeachers = []) {
  if (!extractedName || !existingTeachers.length) return null;

  const normExtracted = normalizeArabic(extractedName);
  const extractedTokens = normExtracted
    .split(/\s+/)
    .filter((t) => t.length > 1);

  let bestTeacher = null;
  let highestScore = 0;

  for (const teacher of existingTeachers) {
    const teacherName = teacher.name || "";
    const teacherEmail = (teacher.email || "").toLowerCase();
    const normTeacher = normalizeArabic(teacherName);

    // 1. Direct Arabic match or inclusion
    if (normExtracted === normTeacher) {
      return { teacher, score: 1.0 };
    }
    if (
      normTeacher &&
      (normTeacher.includes(normExtracted) ||
        normExtracted.includes(normTeacher))
    ) {
      const score = 0.95;
      if (score > highestScore) {
        highestScore = score;
        bestTeacher = teacher;
      }
      continue;
    }

    // 2. Transliteration / Dictionary token match
    const searchableUserText = (normTeacher + " " + teacherEmail).toLowerCase();
    let matchedTokens = 0;

    for (const token of extractedTokens) {
      if (searchableUserText.includes(token)) {
        matchedTokens++;
        continue;
      }
      const aliases =
        COMMON_NAME_PAIRS[token] ||
        COMMON_NAME_PAIRS[token.replace(/ي$/, "ى")] ||
        [];
      if (aliases.some((a) => searchableUserText.includes(a))) {
        matchedTokens++;
      }
    }

    const tokenScore =
      extractedTokens.length > 0 ? matchedTokens / extractedTokens.length : 0;
    if (tokenScore > highestScore && tokenScore >= 0.5) {
      highestScore = tokenScore;
      bestTeacher = teacher;
      continue;
    }

    // 3. Levenshtein fallback
    const levSim = stringSimilarity(extractedName, teacherName);
    if (levSim > highestScore && levSim >= 0.6) {
      highestScore = levSim;
      bestTeacher = teacher;
    }
  }

  if (bestTeacher && highestScore >= 0.5) {
    return { teacher: bestTeacher, score: highestScore };
  }
  return null;
}

/**
 * Normalize subject name by matching against DB subjects or canonical list
 */
function normalizeSubject(rawSubject, existingSubjects = []) {
  if (!rawSubject) return "مادة دراسية";
  const cleaned = rawSubject.normalize("NFKC").trim();
  const norm = normalizeArabic(cleaned);

  // 1. Check existing DB subjects
  for (const sub of existingSubjects) {
    const subNorm = normalizeArabic(sub.name);
    if (norm === subNorm || norm.includes(subNorm) || subNorm.includes(norm)) {
      return sub.name;
    }
    if (
      sub.nameEn &&
      cleaned.toLowerCase().includes(sub.nameEn.toLowerCase())
    ) {
      return sub.name;
    }
  }

  // 2. Check aliases
  for (const item of SUBJECT_ALIASES) {
    for (const alias of item.aliases) {
      const aliasNorm = normalizeArabic(alias);
      if (norm === aliasNorm || norm.includes(aliasNorm)) {
        // If the DB has this canonical name, use it
        const dbMatch = existingSubjects.find(
          (s) => normalizeArabic(s.name) === normalizeArabic(item.canon),
        );
        return dbMatch ? dbMatch.name : item.canon;
      }
    }
  }

  return cleaned;
}

/**
 * Main parser function: processes PDF buffer using coordinate-based extraction
 * Supports aSc Timetables and other standard school schedule layouts
 */
async function parseTimetablePdf(
  buffer,
  existingTeachers = [],
  existingSubjects = [],
) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;

  const detectedTimetables = [];

  for (let pNum = 1; pNum <= doc.numPages; pNum++) {
    const page = await doc.getPage(pNum);
    const tc = await page.getTextContent();

    // Map and normalize all items
    const items = tc.items
      .map((it) => ({
        str: it.str.normalize("NFKC").trim(),
        x: Math.round(it.transform[4]),
        y: Math.round(it.transform[5]),
        w: Math.round(it.width),
        h: Math.round(it.height),
      }))
      .filter((it) => it.str);

    if (items.length === 0) continue;

    // 1. Extract Teacher Name
    // In aSc Timetables, teacher name is at the top (y >= 540) centered between x=250 and x=550
    let teacherName = "";
    const topCandidates = items
      .filter(
        (it) =>
          it.y >= 530 &&
          it.x < 700 &&
          !it.str.includes("مدارس") &&
          !it.str.includes("مدرسة") &&
          !it.str.includes("جدول") &&
          !it.str.includes("العام") &&
          !it.str.match(/^\d/),
      )
      .sort((a, b) => b.y - a.y);

    if (topCandidates.length > 0) {
      teacherName = topCandidates[0].str;
    } else {
      // Fallback: look for prefix "المعلم:", "الأستاذ:", "أ/"
      for (const it of items) {
        const m = it.str.match(
          /(?:المعلم|الأستاذ|الاستاذ|أ)\s*[:\/-]?\s*([^\n\r0-9]{3,30})/i,
        );
        if (m && m[1]) {
          teacherName = m[1].trim();
          break;
        }
      }
    }

    if (!teacherName) {
      teacherName = `معلم صفحة ${pNum}`;
    }

    // Clean teacher name
    teacherName = teacherName
      .replace(/^(الأستاذ|الاستاذ|المعلم|المعلمة|أستاذ|أ\.)\s*/, "")
      .trim();

    // 2. Detect Days and their Y positions
    const detectedDays = [];
    for (const d of DAY_DEFS) {
      const match = items.find(
        (it) => it.x > 680 && d.aliases.some((a) => it.str.includes(a)),
      );
      if (match) {
        let yMin = match.y - 25;
        let yMax = Math.min(match.y + 55, 482);
        if (d.name === "الخميس") {
          yMin = 35; // above bottom footer
        }
        detectedDays.push({
          day: d.name,
          labelY: match.y,
          yMin,
          yMax,
        });
      }
    }

    // Sort days top to bottom
    detectedDays.sort((a, b) => b.labelY - a.labelY);

    // If days were not found in right column, this page is not a timetable
    if (detectedDays.length < 3) {
      continue;
    }

    // 3. Detect Period Columns
    // Look for period header numbers 1-8 around y between 495 and 525
    const periodHeaderItems = items
      .filter((it) => it.y >= 495 && it.y <= 525 && /^[1-8]$/.test(it.str))
      .sort((a, b) => b.x - a.x); // RTL: highest x is period 1

    let periodCols = [];

    if (periodHeaderItems.length >= 4) {
      // Dynamic period calculation based on header coordinates
      for (let i = 0; i < periodHeaderItems.length; i++) {
        const pVal = Number(periodHeaderItems[i].str);
        const currX = periodHeaderItems[i].x;
        let xMin, xMax;

        if (i === 0) {
          // Rightmost column (period 1)
          const nextX = periodHeaderItems[i + 1]?.x ?? currX - 105;
          const halfWidth = (currX - nextX) / 2;
          xMax = currX + halfWidth;
          xMin = currX - halfWidth;
        } else {
          const prevX = periodHeaderItems[i - 1].x;
          // Check for break gap
          if (prevX - currX > 160) {
            xMax = currX + 55;
          } else {
            xMax = (currX + prevX) / 2;
          }

          if (i < periodHeaderItems.length - 1) {
            const nextX = periodHeaderItems[i + 1].x;
            if (currX - nextX > 160) {
              xMin = currX - 55;
            } else {
              xMin = (currX + nextX) / 2;
            }
          } else {
            xMin = Math.max(5, currX - 55);
          }
        }

        periodCols.push({ period: pVal, xMin, xMax });
      }
    } else {
      // Calibrated standard fallback for aSc Timetables (6 periods RTL)
      periodCols = [
        { period: 1, xMin: 640, xMax: 745 },
        { period: 2, xMin: 535, xMax: 640 },
        { period: 3, xMin: 425, xMax: 535 },
        { period: 4, xMin: 215, xMax: 320 },
        { period: 5, xMin: 110, xMax: 215 },
        { period: 6, xMin: 10, xMax: 110 },
      ];
    }

    // 4. Extract Lessons in Cells
    const entries = [];

    for (const day of detectedDays) {
      for (const col of periodCols) {
        // Collect text items belonging to this cell
        const cellItems = items.filter(
          (it) =>
            it.x >= col.xMin &&
            it.x <= col.xMax &&
            it.y >= day.yMin &&
            it.y <= day.yMax &&
            !it.str.match(/^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/) && // filter time intervals
            !it.str.match(/^(break|استراحة|فسحة)$/i) &&
            !it.str.includes("aSc Timetables") &&
            !it.str.includes("تم إنشاء الجدول"),
        );

        if (cellItems.length === 0) continue;

        // Sort items by Y descending (higher Y is subject, lower Y is class)
        cellItems.sort((a, b) => b.y - a.y);

        let subjectName = "";
        let className = "";

        if (cellItems.length === 1) {
          const str = cellItems[0].str;
          const classMatch = str.match(
            /(أول|ثاني|ثالث|رابع|خامس|سادس)\s+(أول|ثاني|ثالث|رابع|خامس|أ|ب|ج|د|1|2|3|4)/i,
          );
          if (classMatch) {
            className = classMatch[0];
            subjectName =
              str.replace(classMatch[0], "").trim() || "مادة دراسية";
          } else {
            subjectName = str;
            className = "عام";
          }
        } else {
          // Top item is Subject, subsequent items are Class Name
          subjectName = cellItems[0].str;
          className = cellItems
            .slice(1)
            .map((it) => it.str)
            .join(" ");
        }

        subjectName = normalizeSubject(subjectName, existingSubjects);

        entries.push({
          day: day.day,
          period: col.period,
          subjectName,
          className: className || "عام",
          room: "",
        });
      }
    }

    // 5. Match teacher against existing users in DB
    const matchResult = matchTeacherToUser(teacherName, existingTeachers);
    const matchedTeacher = matchResult ? matchResult.teacher : null;
    const matchConfidence = matchResult
      ? Math.round(matchResult.score * 100)
      : 0;
    const isHighConfidence = matchResult && matchResult.score >= 0.7;

    // Distinct subjects and classes
    const distinctSubjects = [
      ...new Set(entries.map((e) => e.subjectName).filter(Boolean)),
    ];
    const distinctClasses = [
      ...new Set(entries.map((e) => e.className).filter(Boolean)),
    ];

    detectedTimetables.push({
      pageNumber: pNum,
      extractedName: teacherName,
      matchedTeacherId: matchedTeacher ? matchedTeacher._id : null,
      matchedTeacherName: matchedTeacher ? matchedTeacher.name : null,
      matchConfidence,
      action: isHighConfidence ? "assign" : "vacant",
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
  normalizeArabic,
  stringSimilarity,
  normalizeSubject,
  matchTeacherToUser,
};