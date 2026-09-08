const Schedule = require("../models/Schedule.model");
const Week = require("../models/Week.model");
const Subject = require("../models/Subject.model");
const User = require("../models/User.model");
const Role = require("../models/Role.model");
const TimetableTemplate = require("../models/TimetableTemplate.model");
const { parseTimetablePdf } = require("../utils/pdfTimetableParser");
const catchAsync = require("../utils/catchAsync");
const { success, error } = require("../utils/apiResponse");
const { createAuditLog } = require("../middleware/auditLog.middleware");

const DAY_NAMES = [
  "الأحد",
  "الإثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];

/**
 * Helper to calculate the date for a given day in a week
 */
const calculateDayDate = (weekStartDate, dayName) => {
  const startDate = new Date(weekStartDate);
  const startDayIndex = startDate.getDay(); // 0 = Sunday, 1 = Monday...
  const targetDayIndex = DAY_NAMES.indexOf(dayName);

  if (targetDayIndex === -1) return startDate;

  let dayDiff = targetDayIndex - startDayIndex;
  if (dayDiff < 0) dayDiff += 7;

  const result = new Date(startDate);
  result.setDate(startDate.getDate() + dayDiff);
  return result;
};

exports.getByWeek = catchAsync(async (req, res) => {
  const { weekId } = req.params;
  const { teacherId, subjectId, className } = req.query;

  const week = await Week.findById(weekId);
  if (!week) {
    return error(res, "الأسبوع المحدد غير موجود", 404);
  }

  const query = { week: weekId };
  if (teacherId) query.teacher = teacherId;
  if (subjectId) query.subject = subjectId;
  if (className) query.className = className;

  const schedules = await Schedule.find(query)
    .populate("subject", "name nameEn code color")
    .populate("teacher", "name email")
    .sort({ day: 1, period: 1 });

  return success(
    res,
    {
      week,
      schedules,
    },
    "تم جلب جدول الأسبوع بنجاح",
  );
});

exports.getForTeacher = catchAsync(async (req, res) => {
  const { weekId } = req.query;
  const user = req.user;

  let targetWeekId = weekId;

  if (!targetWeekId) {
    const currentWeek = await Week.findOne({ isActive: true }).sort({
      startDate: -1,
    });
    if (!currentWeek) {
      return error(res, "لا يوجد أسبوع دراسي نشط", 404);
    }
    targetWeekId = currentWeek._id;
  }

  const week = await Week.findById(targetWeekId);
  if (!week) {
    return error(res, "الأسبوع غير موجود", 404);
  }

  const userSubjects = Array.isArray(user.subjects)
    ? user.subjects
        .map((s) => (typeof s === "object" && s ? s._id : s))
        .filter(Boolean)
    : [];

  const orConditions = [{ teacher: user._id }];
  if (userSubjects.length > 0) {
    orConditions.push({ subject: { $in: userSubjects } });
  }

  // Find schedules assigned to this teacher or matching their subjects for this week
  const schedules = await Schedule.find({
    week: targetWeekId,
    $or: orConditions,
  })
    .populate("subject", "name nameEn code color")
    .populate("teacher", "name email")
    .sort({ day: 1, period: 1 });

  return success(
    res,
    {
      week,
      schedules,
      teacher: user,
      teacherSubjects: user.subjects,
    },
    "تم جلب جدول المعلم بنجاح",
  );
});

exports.getTeacherTimetable = catchAsync(async (req, res) => {
  const { teacherId } = req.params;
  const { weekId } = req.query;

  const targetTeacher = await User.findById(teacherId)
    .populate("subjects", "name code color")
    .populate("role", "name");

  if (!targetTeacher) {
    return error(res, "المعلم غير موجود", 404);
  }

  let targetWeekId = weekId;
  if (!targetWeekId) {
    const currentWeek = await Week.findOne({ isActive: true }).sort({
      startDate: -1,
    });
    if (!currentWeek) {
      return error(res, "لا يوجد أسبوع دراسي مسجل", 404);
    }
    targetWeekId = currentWeek._id;
  }

  const week = await Week.findById(targetWeekId);
  if (!week) {
    return error(res, "الأسبوع غير موجود", 404);
  }

  const schedules = await Schedule.find({
    week: targetWeekId,
    teacher: teacherId,
  })
    .populate("subject", "name nameEn code color")
    .populate("teacher", "name email")
    .sort({ day: 1, period: 1 });

  return success(
    res,
    {
      teacher: targetTeacher,
      week,
      schedules,
    },
    "تم جلب جدول الحصص للمعلم بنجاح",
  );
});

/**
 * Bulk save/update teacher's weekly timetable matrix
 */
exports.saveTeacherTimetable = catchAsync(async (req, res) => {
  const { teacherId, weekId, entries } = req.body;

  if (!teacherId || !weekId || !Array.isArray(entries)) {
    return error(
      res,
      "البيانات المدخلة غير مكتملة (معرف المعلم والأسبوع والمصفوفة مطلوبة)",
      400,
    );
  }

  const [teacher, week] = await Promise.all([
    User.findById(teacherId),
    Week.findById(weekId),
  ]);

  if (!teacher || !week) {
    return error(res, "المعلم أو الأسبوع غير موجود", 404);
  }

  // Load existing schedules before deleting, to preserve any prepared lessons/homework
  const existingSchedules = await Schedule.find({
    week: weekId,
    teacher: teacherId,
  });

  const exactSlotMap = new Map();
  const classSubjectPool = new Map();

  existingSchedules.forEach((s) => {
    const slotKey = `${s.day}_${s.period}`;
    exactSlotMap.set(slotKey, s);

    const hasContent = Boolean(
      (s.lessonTitle && s.lessonTitle.trim()) ||
      (s.homework && s.homework.trim()) ||
      (s.activities && s.activities.trim()) ||
      (s.notes && s.notes.trim())
    );

    if (hasContent && s.subject) {
      const subjStr = (s.subject._id || s.subject).toString();
      const clsStr = (s.className || "").trim();
      const poolKey = `${subjStr}_${clsStr}`;
      if (!classSubjectPool.has(poolKey)) {
        classSubjectPool.set(poolKey, []);
      }
      classSubjectPool.get(poolKey).push({
        lessonTitle: s.lessonTitle || "",
        homework: s.homework || "",
        activities: s.activities || "",
        notes: s.notes || "",
        used: false,
      });
    }
  });

  // Remove existing schedule slots for this teacher in this week
  await Schedule.deleteMany({
    week: weekId,
    teacher: teacherId,
  });

  const validEntries = entries
    .filter((e) => e.day && e.period && e.subject)
    .map((e) => {
      const resolvedDate = e.dayDate
        ? new Date(e.dayDate)
        : calculateDayDate(week.startDate, e.day);

      const subjIdStr = (e.subject?._id || e.subject).toString();
      const clsName = e.className ? e.className.trim() : "";
      const slotKey = `${e.day}_${e.period}`;

      let lessonTitle = e.lessonTitle || "";
      let homework = e.homework || "";
      let activities = e.activities || "";
      let notes = e.notes || "";

      // 1. If empty, check if exact slot previously had preparation for the same subject & class
      const exactPrev = exactSlotMap.get(slotKey);
      if (!lessonTitle && !homework && exactPrev) {
        const prevSubjStr = (exactPrev.subject?._id || exactPrev.subject || "").toString();
        const prevCls = (exactPrev.className || "").trim();
        if (prevSubjStr === subjIdStr && prevCls === clsName) {
          lessonTitle = exactPrev.lessonTitle || "";
          homework = exactPrev.homework || "";
          activities = exactPrev.activities || "";
          notes = exactPrev.notes || "";
        }
      }

      // 2. If still empty, check the class/subject pool (this period moved from another day/slot!)
      if (!lessonTitle && !homework) {
        const poolKey = `${subjIdStr}_${clsName}`;
        const pool = classSubjectPool.get(poolKey);
        if (pool && pool.length > 0) {
          const available = pool.find((item) => !item.used);
          if (available) {
            available.used = true;
            lessonTitle = available.lessonTitle;
            homework = available.homework;
            activities = available.activities;
            notes = available.notes;
          }
        }
      }

      return {
        week: weekId,
        day: e.day,
        dayDate: resolvedDate,
        period: Number(e.period),
        subject: e.subject,
        teacher: teacherId,
        className: e.className ? e.className.trim() : "",
        className: clsName,
        room: e.room ? e.room.trim() : "",
        lessonTitle: e.lessonTitle || "",
        homework: e.homework || "",
        activities: e.activities || "",
        notes: e.notes || "",
        lessonTitle,
        homework,
        activities,
        notes,
        createdBy: req.user._id,
        updatedBy: req.user._id,
      };
    });

  let createdSchedules = [];
  if (validEntries.length > 0) {
    createdSchedules = await Schedule.insertMany(validEntries);
  }

  await createAuditLog({
    req,
    action: "UPDATE",
    module: "schedules",
    description: `تحديث جدول حصص المعلم: ${teacher.name} للأسبوع (${week.label}) بعدد ${validEntries.length} حصة.`,
    targetId: teacher._id,
    targetModel: "User",
  });

  return success(
    res,
    {
      savedCount: validEntries.length,
      schedules: createdSchedules,
    },
    `تم حفظ جدول حصص المعلم ${teacher.name} بنجاح ✅`,
  );
});

exports.getById = catchAsync(async (req, res) => {
  const schedule = await Schedule.findById(req.params.id)
    .populate("subject", "name code color")
    .populate("teacher", "name email")
    .populate("week");

  if (!schedule) {
    return error(res, "سجل الحصة غير موجود", 404);
  }

  return success(res, schedule, "تم جلب بيانات الحصة بنجاح");
});

exports.create = catchAsync(async (req, res) => {
  const {
    week: weekId,
    day,
    dayDate,
    period,
    subject: subjectId,
    teacher: teacherId,
    className,
    room,
    lessonTitle,
    homework,
    activities,
    notes,
  } = req.body;

  const week = await Week.findById(weekId);
  if (!week) {
    return error(res, "الأسبوع المحدد غير موجود", 404);
  }

  const subject = await Subject.findById(subjectId);
  if (!subject) {
    return error(res, "المادة المحددة غير موجودة", 404);
  }

  const user = req.user;
  const isSuperAdmin = user.role?.isSystem;

  if (!isSuperAdmin) {
    const userSubjectIds = (user.subjects || []).map((s) =>
      s._id ? s._id.toString() : s.toString(),
    );
    if (!userSubjectIds.includes(subjectId.toString())) {
      return error(res, "غير مصرح لك بإضافة جدول لمادة غير مسندة إليك", 403);
    }
  }

  const resolvedDate = dayDate
    ? new Date(dayDate)
    : calculateDayDate(week.startDate, day);

  // Check if entry already exists for this class/period or teacher/period
  const searchFilter = {
    week: weekId,
    day,
    period,
  };

  if (className && className.trim()) {
    searchFilter.className = className.trim();
  } else {
    searchFilter.teacher = teacherId || user._id;
  }

  let schedule = await Schedule.findOne(searchFilter);

  if (schedule) {
    schedule.subject = subjectId;
    if (className !== undefined) schedule.className = className.trim();
    if (room !== undefined) schedule.room = room.trim();
    if (lessonTitle !== undefined) schedule.lessonTitle = lessonTitle;
    if (homework !== undefined) schedule.homework = homework;
    if (activities !== undefined) schedule.activities = activities;
    if (notes !== undefined) schedule.notes = notes;
    schedule.updatedBy = user._id;
    await schedule.save();
  } else {
    schedule = await Schedule.create({
      week: weekId,
      day,
      dayDate: resolvedDate,
      period,
      subject: subjectId,
      teacher: teacherId || user._id,
      className: className ? className.trim() : "",
      room: room ? room.trim() : "",
      lessonTitle: lessonTitle || "",
      homework: homework || "",
      activities: activities || "",
      notes: notes || "",
      createdBy: user._id,
      updatedBy: user._id,
    });
  }

  const populated = await Schedule.findById(schedule._id)
    .populate("subject", "name code color")
    .populate("teacher", "name email");

  await createAuditLog({
    req,
    action: "CREATE",
    module: "schedules",
    description: `إضافة أو تحديث حصة: يوم ${day} - الحصة ${period} - فصل ${schedule.className || ""}`,
    targetId: schedule._id,
    targetModel: "Schedule",
    newValue: populated,
  });

  return success(res, populated, "تم حفظ الحصة بنجاح", 201);
});

exports.update = catchAsync(async (req, res) => {
  const schedule = await Schedule.findById(req.params.id);
  if (!schedule) {
    return error(res, "سجل الحصة غير موجود", 404);
  }

  const user = req.user;
  const userRole = user.role;
  const isSuperAdmin = userRole?.isSystem;

  const userPermNames = (userRole.permissions || []).map((p) =>
    typeof p === "string" ? p : p.name,
  );
  const hasFullEdit = isSuperAdmin || userPermNames.includes("schedules.edit");

  // Teacher Subject Restriction Check
  if (!isSuperAdmin) {
    const userSubjectIds = (user.subjects || []).map((s) =>
      s._id ? s._id.toString() : s.toString(),
    );
    const scheduleSubjectId = schedule.subject.toString();

    if (!userSubjectIds.includes(scheduleSubjectId)) {
      return error(
        res,
        "غير مصرح: لا يمكنك تعديل بيانات حصة لمادة لا تقوم بتدريسها.",
        403,
      );
    }
  }

  const oldValue = { ...schedule.toObject() };
  const {
    lessonTitle,
    homework,
    activities,
    notes,
    subject,
    teacher,
    className,
    room,
    period,
    day,
    dayDate,
  } = req.body;

  if (hasFullEdit) {
    if (lessonTitle !== undefined) schedule.lessonTitle = lessonTitle;
    if (homework !== undefined) schedule.homework = homework;
    if (activities !== undefined) schedule.activities = activities;
    if (notes !== undefined) schedule.notes = notes;
    if (subject) schedule.subject = subject;
    if (teacher) schedule.teacher = teacher;
    if (className !== undefined) schedule.className = className;
    if (room !== undefined) schedule.room = room;
    if (period !== undefined) schedule.period = period;
    if (day) schedule.day = day;
    if (dayDate) schedule.dayDate = new Date(dayDate);
  } else {
    let modifiedAny = false;

    if (lessonTitle !== undefined) {
      if (
        !userPermNames.includes("schedules.edit_title") &&
        !userPermNames.includes("schedules.edit")
      ) {
        return error(
          res,
          "ليس لديك صلاحية تعديل عنوان الدرس (schedules.edit_title).",
          403,
        );
      }
      schedule.lessonTitle = lessonTitle;
      modifiedAny = true;
    }

    if (homework !== undefined) {
      if (
        !userPermNames.includes("schedules.edit_homework") &&
        !userPermNames.includes("schedules.edit")
      ) {
        return error(
          res,
          "ليس لديك صلاحية تعديل الواجبات (schedules.edit_homework).",
          403,
        );
      }
      schedule.homework = homework;
      modifiedAny = true;
    }

    if (activities !== undefined) {
      if (
        !userPermNames.includes("schedules.edit_activities") &&
        !userPermNames.includes("schedules.edit")
      ) {
        return error(
          res,
          "ليس لديك صلاحية تعديل الأنشطة (schedules.edit_activities).",
          403,
        );
      }
      schedule.activities = activities;
      modifiedAny = true;
    }

    if (notes !== undefined) {
      if (
        !userPermNames.includes("schedules.edit_notes") &&
        !userPermNames.includes("schedules.edit")
      ) {
        return error(
          res,
          "ليس لديك صلاحية تعديل الملاحظات (schedules.edit_notes).",
          403,
        );
      }
      schedule.notes = notes;
      modifiedAny = true;
    }

    if (!modifiedAny) {
      return error(res, "لم يتم تقديم أي حقول مسموح لك بتعديلها.", 400);
    }
  }

  schedule.updatedBy = user._id;
  await schedule.save();

  const updatedSchedule = await Schedule.findById(schedule._id)
    .populate("subject", "name code color")
    .populate("teacher", "name email");

  await createAuditLog({
    req,
    action: "UPDATE",
    module: "schedules",
    description: `تحديث بيانات الحصة: يوم ${schedule.day} - الحصة ${schedule.period} - ${schedule.className || ""}`,
    targetId: schedule._id,
    targetModel: "Schedule",
    oldValue,
    newValue: updatedSchedule,
  });

  return success(res, updatedSchedule, "تم تحديث الحصة بنجاح");
});

exports.remove = catchAsync(async (req, res) => {
  const schedule = await Schedule.findById(req.params.id)
    .populate("subject", "name")
    .populate("teacher", "name");

  if (!schedule) {
    return error(res, "سجل الحصة غير موجود", 404);
  }

  await Schedule.findByIdAndDelete(req.params.id);

  await createAuditLog({
    req,
    action: "DELETE",
    module: "schedules",
    description: `حذف حصة: يوم ${schedule.day} - الحصة ${schedule.period}`,
    targetId: schedule._id,
    targetModel: "Schedule",
    oldValue: schedule,
  });

  return success(res, null, "تم حذف الحصة بنجاح");
});

exports.copyWeek = catchAsync(async (req, res) => {
  const { sourceWeekId, targetWeekId, overwrite } = req.body;

  if (!sourceWeekId || !targetWeekId) {
    return error(res, "يرجى تحديد الأسبوع المصدر والأسبوع الهدف", 400);
  }

  if (sourceWeekId === targetWeekId) {
    return error(res, "لا يمكن نسخ الأسبوع إلى نفسه", 400);
  }

  const [sourceWeek, targetWeek] = await Promise.all([
    Week.findById(sourceWeekId),
    Week.findById(targetWeekId),
  ]);

  if (!sourceWeek || !targetWeek) {
    return error(res, "أحد الأسابيع المحددة غير موجود", 404);
  }

  const existingTargetCount = await Schedule.countDocuments({
    week: targetWeekId,
  });
  if (existingTargetCount > 0 && !overwrite) {
    return error(
      res,
      `الأسبوع الهدف يحتوي بالفعل على ${existingTargetCount} حصة. يرجى تأكيد الاستبدال إذا كنت ترغب في ذلك.`,
      409,
    );
  }

  const sourceSchedules = await Schedule.find({ week: sourceWeekId });

  if (sourceSchedules.length === 0) {
    return error(res, "الأسبوع المصدر لا يحتوي على أي حصص لنسخها", 400);
  }

  if (overwrite) {
    await Schedule.deleteMany({ week: targetWeekId });
  }

  const newSchedules = sourceSchedules.map((s) => {
    const newDate = calculateDayDate(targetWeek.startDate, s.day);
    return {
      week: targetWeekId,
      day: s.day,
      dayDate: newDate,
      period: s.period,
      subject: s.subject,
      teacher: s.teacher,
      className: s.className || "",
      room: s.room || "",
      lessonTitle: s.lessonTitle || "",
      homework: s.homework || "",
      activities: s.activities || "",
      notes: s.notes || "",
      createdBy: req.user._id,
      updatedBy: req.user._id,
    };
  });

  await Schedule.insertMany(newSchedules);

  await createAuditLog({
    req,
    action: "COPY",
    module: "schedules",
    description: `نسخ جدول الأسبوع من (${sourceWeek.label}) إلى (${targetWeek.label}) بعدد ${newSchedules.length} حصة.`,
    targetId: targetWeek._id,
    targetModel: "Week",
  });

  return success(
    res,
    { copiedCount: newSchedules.length },
    `تم نسخ ${newSchedules.length} حصة بنجاح إلى ${targetWeek.label}`,
  );
});

// GET /api/schedules/completion-stats?weekId=...
exports.getWeeklyPlanCompletion = catchAsync(async (req, res) => {
  const { weekId } = req.query;

  let targetWeek = null;
  if (weekId) {
    targetWeek = await Week.findById(weekId);
  } else {
    const now = new Date();
    targetWeek = await Week.findOne({
      startDate: { $lte: now },
      endDate: { $gte: now },
    });
    if (!targetWeek) {
      targetWeek = await Week.findOne().sort({ startDate: -1 });
    }
  }

  if (!targetWeek) {
    return error(res, "لم يتم العثور على أي أسبوع دراسي", 404);
  }

  const users = await User.find({ isActive: true })
    .populate("role", "name isSystem")
    .populate("subjects", "name code color")
    .lean();

  const teachers = users.filter((u) => !u.role?.isSystem);

  const weekSchedules = await Schedule.find({ week: targetWeek._id })
    .populate("subject", "name code color")
    .populate("teacher", "name email")
    .lean();

  const schedulesByTeacher = {};
  weekSchedules.forEach((s) => {
    if (s.teacher?._id) {
      const tId = s.teacher._id.toString();
      if (!schedulesByTeacher[tId]) schedulesByTeacher[tId] = [];
      schedulesByTeacher[tId].push(s);
    }
  });

  const teacherStats = teachers.map((t) => {
    const tId = t._id.toString();
    const tSchedules = schedulesByTeacher[tId] || [];
    const totalAssigned = tSchedules.length;

    const missingSlots = [];
    let completedCount = 0;
    let missingLessonCount = 0;
    let missingHomeworkCount = 0;

    tSchedules.forEach((s) => {
      const hasLesson = !!(s.lessonTitle && s.lessonTitle.trim().length > 0);
      const hasHomework = !!(s.homework && s.homework.trim().length > 0);

      if (!hasLesson) missingLessonCount++;
      if (!hasHomework) missingHomeworkCount++;

      if (hasLesson && hasHomework) {
        completedCount++;
      } else {
        missingSlots.push({
          scheduleId: s._id,
          day: s.day,
          period: s.period,
          className: s.className || "غير محدد",
          subjectName: s.subject?.name || "",
          missingLessonTitle: !hasLesson,
          missingHomework: !hasHomework,
          lessonTitle: s.lessonTitle || "",
          homework: s.homework || "",
        });
      }
    });

    const completionRate =
      totalAssigned > 0
        ? Math.round((completedCount / totalAssigned) * 100)
        : 0;

    let status = "COMPLETED";
    if (totalAssigned === 0) {
      status = "NO_CLASSES";
    } else if (completedCount === totalAssigned) {
      status = "COMPLETED";
    } else if (completedCount === 0) {
      status = "NOT_STARTED";
    } else {
      status = "PARTIAL";
    }

    return {
      teacher: {
        _id: t._id,
        name: t.name,
        email: t.email,
        phone: t.phone || "",
        subjects: t.subjects || [],
      },
      totalAssigned,
      completedCount,
      missingLessonCount,
      missingHomeworkCount,
      missingSlotsCount: missingSlots.length,
      completionRate,
      status,
      missingSlots,
    };
  });

  const totalTeachers = teacherStats.filter((t) => t.totalAssigned > 0).length;
  const fullyCompletedTeachers = teacherStats.filter(
    (t) => t.status === "COMPLETED",
  ).length;
  const incompleteTeachers = teacherStats.filter(
    (t) => t.status === "PARTIAL" || t.status === "NOT_STARTED",
  ).length;
  const totalMissingLessons = teacherStats.reduce(
    (acc, t) => acc + t.missingLessonCount,
    0,
  );
  const totalMissingHomework = teacherStats.reduce(
    (acc, t) => acc + t.missingHomeworkCount,
    0,
  );

  const totalCompletedSlots = teacherStats.reduce(
    (acc, t) => acc + t.completedCount,
    0,
  );
  const totalAllAssignedSlots = teacherStats.reduce(
    (acc, t) => acc + t.totalAssigned,
    0,
  );

  return success(res, {
    week: {
      _id: targetWeek._id,
      label: targetWeek.label,
      startDate: targetWeek.startDate,
      endDate: targetWeek.endDate,
    },
    summary: {
      totalTeachersWithClasses: totalTeachers,
      fullyCompletedTeachers,
      incompleteTeachers,
      totalMissingLessons,
      totalMissingHomework,
      overallCompletionPercentage:
        totalAllAssignedSlots > 0
          ? Math.round((totalCompletedSlots / totalAllAssignedSlots) * 100)
          : 100,
    },
    teachers: teacherStats,
  });
});

// POST /api/schedules/master-cell (Assign/Update or Clear a single cell in master grid)
exports.saveMasterCell = catchAsync(async (req, res) => {
  const { weekId, day, period, teacherId, subjectId, className, room } =
    req.body;

  if (!weekId || !day || !period) {
    return error(res, "الأسبوع واليوم ورقم الحصة مطلوبة", 400);
  }

  const week = await Week.findById(weekId);
  if (!week) return error(res, "الأسبوع غير موجود", 404);

  const resolvedDate = calculateDayDate(week.startDate, day);

  // If clearing (no teacher or no subject provided)
  if (!teacherId || !subjectId) {
    if (teacherId) {
      await Schedule.deleteMany({
        week: weekId,
        day,
        period: Number(period),
        teacher: teacherId,
      });
    }
    return success(res, null, "تم تفريغ الحصة بنجاح ✅");
  }

  // Check / Upsert for this teacher/day/period
  let schedule = await Schedule.findOne({
    week: weekId,
    day,
    period: Number(period),
    teacher: teacherId,
  });

  if (schedule) {
    schedule.subject = subjectId;
    schedule.className = className ? className.trim() : "";
    schedule.room = room ? room.trim() : "";
    schedule.dayDate = resolvedDate;
    schedule.updatedBy = req.user._id;
    await schedule.save();
  } else {
    schedule = await Schedule.create({
      week: weekId,
      day,
      dayDate: resolvedDate,
      period: Number(period),
      subject: subjectId,
      teacher: teacherId,
      className: className ? className.trim() : "",
      room: room ? room.trim() : "",
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });
  }

  const populated = await Schedule.findById(schedule._id)
    .populate("subject", "name nameEn code color")
    .populate("teacher", "name email");

  return success(res, populated, "تم تعيين الحصة وحفظها بنجاح ✅");
});

/**
 * POST /api/schedules/swap-period
 * Move or swap a scheduled period to a different day/period, preserving all lesson preparations 100%!
 */
exports.swapPeriod = catchAsync(async (req, res) => {
  const { weekId, teacherId, fromDay, fromPeriod, toDay, toPeriod } = req.body;

  if (!weekId || !teacherId || !fromDay || !fromPeriod || !toDay || !toPeriod) {
    return error(res, "جميع بيانات النقل والتبديل مطلوبة", 400);
  }

  const week = await Week.findById(weekId);
  if (!week) return error(res, "الأسبوع غير موجود", 404);

  const sourceSchedule = await Schedule.findOne({
    week: weekId,
    teacher: teacherId,
    day: fromDay,
    period: Number(fromPeriod),
  });

  if (!sourceSchedule) {
    return error(res, "الحصة المراد نقلها غير موجودة", 404);
  }

  const targetSchedule = await Schedule.findOne({
    week: weekId,
    teacher: teacherId,
    day: toDay,
    period: Number(toPeriod),
  });

  const targetDate = calculateDayDate(week.startDate, toDay);
  const sourceDate = calculateDayDate(week.startDate, fromDay);

  if (!targetSchedule) {
    // MOVE: Target is empty -> simply move sourceSchedule to target
    sourceSchedule.day = toDay;
    sourceSchedule.period = Number(toPeriod);
    sourceSchedule.dayDate = targetDate;
    sourceSchedule.updatedBy = req.user._id;
    await sourceSchedule.save();

    await createAuditLog({
      req,
      action: "UPDATE",
      module: "schedules",
      description: `نقل حصة المعلم من (${fromDay} - حصة ${fromPeriod}) إلى (${toDay} - حصة ${toPeriod}) مع الاحتفاظ بالتحضير`,
      targetId: sourceSchedule._id,
      targetModel: "Schedule",
    });

    const populated = await Schedule.findById(sourceSchedule._id)
      .populate("subject", "name nameEn code color")
      .populate("teacher", "name email");

    return success(
      res,
      { mode: "move", source: populated, target: null },
      `تم نقل الحصة بنجاح إلى يوم ${toDay} (الحصة ${toPeriod}) مع الحفاظ التام على التحضير والواجبات ✅`
    );
  } else {
    // SWAP: Target exists -> swap day, period, and date
    sourceSchedule.day = toDay;
    sourceSchedule.period = Number(toPeriod);
    sourceSchedule.dayDate = targetDate;
    sourceSchedule.updatedBy = req.user._id;

    targetSchedule.day = fromDay;
    targetSchedule.period = Number(fromPeriod);
    targetSchedule.dayDate = sourceDate;
    targetSchedule.updatedBy = req.user._id;

    await Promise.all([sourceSchedule.save(), targetSchedule.save()]);

    await createAuditLog({
      req,
      action: "UPDATE",
      module: "schedules",
      description: `تبديل حصص المعلم بين (${fromDay} - حصة ${fromPeriod}) و (${toDay} - حصة ${toPeriod}) مع الاحتفاظ بالتحضير`,
      targetId: sourceSchedule._id,
      targetModel: "Schedule",
    });

    const [popSource, popTarget] = await Promise.all([
      Schedule.findById(sourceSchedule._id)
        .populate("subject", "name nameEn code color")
        .populate("teacher", "name email"),
      Schedule.findById(targetSchedule._id)
        .populate("subject", "name nameEn code color")
        .populate("teacher", "name email"),
    ]);

    return success(
      res,
      { mode: "swap", source: popSource, target: popTarget },
      `تم تبديل الحصتين بنجاح مع الحفاظ التام على تحضير وواجبات كل منهما ✅`
    );
  }
});

/**
 * Helper to extract grade/stage prefix from class names
 * e.g. "أول أول" -> "أول", "أول/2" -> "أول", "الصف الأول أ" -> "الصف الأول", "1/1" -> "1"
 */
const extractGradePrefix = (className) => {
  if (!className) return "";
  const cleaned = className.trim();

  // "الصف الأول", "الصف الثاني", ...
  const fullMatch = cleaned.match(
    /^(الصف\s+(?:الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر|الحادي\s+عشر|الثاني\s+عشر))/i,
  );
  if (fullMatch) return fullMatch[1];

  // "أولى", "أول", "ثاني", "ثالث", "رابع", "خامس", "سادس", "سابع", "ثامن", "تاسع", "عاشر"
  const wordMatch = cleaned.match(
    /^(أولى|أول|ثانية|ثاني|ثالثة|ثالث|رابعة|رابع|خامسة|خامس|سادسة|سادس|سابعة|سابع|ثامنة|ثامن|تاسعة|تاسع|عاشرة|عاشر)/i,
  );
  if (wordMatch) {
    const map = {
      أولى: "أول",
      ثانية: "ثاني",
      ثالثة: "ثالث",
      رابعة: "رابع",
      خامسة: "خامس",
      سادسة: "سادس",
    };
    return map[wordMatch[1]] || wordMatch[1];
  }

  // Numbers: "1/1", "1-A", "2/3" -> "1", "2"
  const numMatch = cleaned.match(/^(\d+)/);
  if (numMatch) return numMatch[1];

  // Fallback: split by space/slash/dash
  const parts = cleaned.split(/[\s\/\-_]+/);
  if (parts.length > 1) return parts[0];

  return cleaned;
};

/**
 * POST /api/schedules/bulk-fill-grade
 * يملأ عنوان الدرس والواجبات تلقائياً لجميع فصول نفس الصف (الفئة)
 * مثال: "أول أول" → سيملأ "أول ثاني", "أول ثالث"... في نفس الأسبوع أو نفس اليوم
 */
exports.bulkFillGrade = catchAsync(async (req, res) => {
  const {
    sourceScheduleId,
    lessonTitle,
    homework,
    activities,
    notes,
    scope = "week", // "week" | "day"
  } = req.body;

  if (!sourceScheduleId) {
    return error(res, "معرف الحصة المصدر مطلوب", 400);
  }

  const source = await Schedule.findById(sourceScheduleId).populate("subject");
  if (!source) {
    return error(res, "الحصة المصدر غير موجودة", 404);
  }

  const user = req.user;
  const isSuperAdmin = user.role?.isSystem;

  // Check teacher permission: must teach the source schedule's subject
  if (!isSuperAdmin) {
    const userSubjectIds = (user.subjects || []).map((s) =>
      s._id ? s._id.toString() : s.toString(),
    );
    const sourceSubId = (
      source.subject?._id ||
      source.subject ||
      ""
    ).toString();
    if (!userSubjectIds.includes(sourceSubId)) {
      return error(res, "غير مصرح: المادة غير مسندة إليك", 403);
    }
  }

  // Extract grade prefix from className
  const sourceClassName = (source.className || "").trim();
  const gradePrefix = extractGradePrefix(sourceClassName);

  if (!gradePrefix) {
    return error(res, "لا يمكن تحديد الصف الدراسي من اسم الفصل", 400);
  }

  // Build query for matching target schedules in the same week
  const query = {
    week: source.week,
    _id: { $ne: source._id },
  };

  // Restrict to same subject
  if (source.subject) {
    query.subject = source.subject._id || source.subject;
  }

  // If teacher (not admin), only touch their own schedules
  if (!isSuperAdmin) {
    query.$or = [
      { teacher: user._id },
      { subject: source.subject._id || source.subject },
    ];
  }

  // If scope is 'day', restrict to the same day
  if (scope === "day") {
    query.day = source.day;
  }

  const candidates = await Schedule.find(query)
    .populate("subject", "name nameEn code color")
    .populate("teacher", "name email");

  // Filter candidates that match the same grade prefix
  const targets = candidates.filter((s) => {
    const candidateGrade = extractGradePrefix(s.className || "");
    return (
      candidateGrade &&
      candidateGrade.toLowerCase() === gradePrefix.toLowerCase()
    );
  });

  if (targets.length === 0) {
    const scopeLabel =
      scope === "day" ? `في يوم ${source.day}` : "في هذا الأسبوع";
    return error(
      res,
      `لم يتم العثور على فصول أخرى من صف "${gradePrefix}" ${scopeLabel}`,
      400,
    );
  }

  // Update all target schedules
  const updateOps = targets.map((s) => ({
    updateOne: {
      filter: { _id: s._id },
      update: {
        $set: {
          lessonTitle: lessonTitle !== undefined ? lessonTitle : s.lessonTitle,
          homework: homework !== undefined ? homework : s.homework,
          activities: activities !== undefined ? activities : s.activities,
          notes: notes !== undefined ? notes : s.notes,
          updatedBy: user._id,
        },
      },
    },
  }));

  await Schedule.bulkWrite(updateOps);

  // Also update the source itself
  source.lessonTitle =
    lessonTitle !== undefined ? lessonTitle : source.lessonTitle;
  source.homework = homework !== undefined ? homework : source.homework;
  source.activities = activities !== undefined ? activities : source.activities;
  source.notes = notes !== undefined ? notes : source.notes;
  source.updatedBy = user._id;
  await source.save();

  const updatedIds = [source._id, ...targets.map((s) => s._id)];
  const updatedSchedules = await Schedule.find({ _id: { $in: updatedIds } })
    .populate("subject", "name code color")
    .populate("teacher", "name email");

  const targetDetails = targets.map((s) => ({
    _id: s._id,
    className: s.className,
    day: s.day,
    period: s.period,
  }));

  await createAuditLog({
    req,
    action: "UPDATE",
    module: "schedules",
    description: `إملاء تلقائي لصف "${gradePrefix}": تم تحديث ${targets.length + 1} حصة في الأسبوع (${scope === "day" ? `يوم ${source.day}` : "كامل الأسبوع"})`,
    targetId: source._id,
    targetModel: "Schedule",
  });

  return success(
    res,
    {
      updatedCount: updatedSchedules.length,
      gradePrefix,
      targetClasses: targets.map((s) => s.className),
      targetDetails,
      scope,
      schedules: updatedSchedules,
    },
    `تم إملاء بيانات التحضير لـ ${updatedSchedules.length} حصص من صف "${gradePrefix}" بنجاح ✅`,
  );
});

/**
 * GET /api/schedules/available-timetables
 * Retrieves available / unclaimed timetable profiles in the school
 */
exports.getAvailableTimetables = catchAsync(async (req, res) => {
  const { weekId } = req.query;
  const currentUserId = req.user?._id?.toString();

  let targetWeekId = weekId;
  if (!targetWeekId) {
    const currentWeek = await Week.findOne({ isActive: true }).sort({
      startDate: -1,
    });
    if (!currentWeek) {
      return error(res, "لا يوجد أسبوع دراسي مسجل", 404);
    }
    targetWeekId = currentWeek._id;
  }

  const week = await Week.findById(targetWeekId);
  if (!week) {
    return error(res, "الأسبوع المحدد غير موجود", 404);
  }

  // Find all schedules in this week that have a teacher assigned
  const schedules = await Schedule.find({ week: targetWeekId })
    .populate("subject", "name nameEn code color")
    .populate(
      "teacher",
      "name email googleId isProfileComplete isClaimed isActive role",
    )
    .sort({ day: 1, period: 1 });

  // Group schedules by teacher
  const teacherMap = {};

  schedules.forEach((s) => {
    if (!s.teacher) return;
    const t = s.teacher;
    const tId = t._id.toString();

    // Skip if it is the current user themselves
    if (tId === currentUserId) return;

    // Skip if teacher is already claimed or has a real active google account completed
    if (t.isClaimed === true) return;
    if (t.googleId && t.isProfileComplete === true) return;

    if (!teacherMap[tId]) {
      teacherMap[tId] = {
        teacherId: t._id,
        teacherName: t.name,
        teacherEmail: t.email,
        subjectsMap: {},
        classNamesSet: new Set(),
        totalClasses: 0,
        schedules: [],
      };
    }

    teacherMap[tId].totalClasses += 1;
    if (s.className && s.className.trim()) {
      teacherMap[tId].classNamesSet.add(s.className.trim());
    }
    if (s.subject && s.subject._id) {
      const subId = s.subject._id.toString();
      teacherMap[tId].subjectsMap[subId] = s.subject;
    }

    teacherMap[tId].schedules.push({
      _id: s._id,
      day: s.day,
      period: s.period,
      subject: s.subject,
      className: s.className || "",
      room: s.room || "",
      lessonTitle: s.lessonTitle || "",
      homework: s.homework || "",
      activities: s.activities || "",
      notes: s.notes || "",
    });
  });

  const availableTimetables = Object.values(teacherMap).map((t) => ({
    teacherId: t.teacherId,
    teacherName: t.teacherName,
    teacherEmail: t.teacherEmail,
    subjects: Object.values(t.subjectsMap),
    classNames: Array.from(t.classNamesSet),
    totalClasses: t.totalClasses,
    schedules: t.schedules,
  }));

  return success(
    res,
    {
      week,
      timetables: availableTimetables,
      count: availableTimetables.length,
    },
    "تم جلب الجداول المتاحة بنجاح",
  );
});

/**
 * POST /api/schedules/claim-timetable
 * Allows a teacher to claim an available timetable
 */
exports.claimTimetable = catchAsync(async (req, res) => {
  const { sourceTeacherId, weekId } = req.body;
  const user = req.user;

  if (!sourceTeacherId) {
    return error(res, "يرجى تحديد الجدول المراد اختياره", 400);
  }

  if (sourceTeacherId.toString() === user._id.toString()) {
    return error(res, "هذا الجدول مسند لحسابك بالفعل", 400);
  }

  const sourceTeacher = await User.findById(sourceTeacherId).populate(
    "subjects",
    "name nameEn code color",
  );

  if (!sourceTeacher) {
    return error(res, "الجدول أو المعلم المصدر غير موجود", 404);
  }

  if (sourceTeacher.isClaimed === true) {
    return error(res, "تم حجز وتعيين هذا الجدول مسبقاً لمعلم آخر", 409);
  }

  if (sourceTeacher.googleId && sourceTeacher.isProfileComplete === true) {
    return error(res, "هذا الجدول مرتبط بحساب معلم نشط ومفعل", 409);
  }

  // Reassign all schedules belonging to sourceTeacher across ALL weeks to req.user._id
  const transferResult = await Schedule.updateMany(
    { teacher: sourceTeacher._id },
    {
      $set: {
        teacher: user._id,
        updatedBy: user._id,
      },
    },
  );

  // Find distinct subjects in the transferred schedules and sourceTeacher.subjects
  const schedulesOfUser = await Schedule.find({ teacher: user._id });
  const transferredSubjectIds = new Set(
    schedulesOfUser.map((s) => s.subject.toString()),
  );

  (sourceTeacher.subjects || []).forEach((sub) => {
    const sId = (sub._id || sub).toString();
    transferredSubjectIds.add(sId);
  });

  (user.subjects || []).forEach((sub) => {
    const sId = (sub._id || sub).toString();
    transferredSubjectIds.add(sId);
  });

  // Update req.user document
  const userDoc = await User.findById(user._id);
  userDoc.subjects = Array.from(transferredSubjectIds);
  userDoc.isProfileComplete = true;

  if (
    (!userDoc.name || userDoc.name === "معلم جديد") &&
    sourceTeacher.name &&
    !sourceTeacher.name.includes("معلم جديد")
  ) {
    userDoc.name = sourceTeacher.name;
  }

  await userDoc.save({ validateBeforeSave: false });

  // Mark sourceTeacher as claimed
  sourceTeacher.isClaimed = true;
  sourceTeacher.claimedBy = user._id;
  sourceTeacher.isActive = false;
  await sourceTeacher.save({ validateBeforeSave: false });

  const populatedUser = await User.findById(user._id)
    .populate({
      path: "role",
      populate: {
        path: "permissions",
        select: "name module action description",
      },
    })
    .populate("subjects", "name nameEn code color");

  await createAuditLog({
    req,
    action: "UPDATE",
    module: "schedules",
    description: `قام المعلم ${populatedUser.name} باختيار وتعيين جدول (${sourceTeacher.name}) لحسابه بنجاح (${transferResult.modifiedCount} حصة).`,
    targetId: populatedUser._id,
    targetModel: "User",
  });

  return success(
    res,
    {
      user: populatedUser,
      transferredCount: transferResult.modifiedCount,
    },
    `تم تعيين وتثبيت جدول (${sourceTeacher.name}) لحسابك بنجاح 🎉 (${transferResult.modifiedCount} حصة)`,
  );
});

/**
 * POST /api/schedules/assign-timetable-to-teacher
 * Admin manually assigns an unclaimed or placeholder timetable to an existing registered teacher
 */
exports.assignTimetableToTeacher = catchAsync(async (req, res) => {
  const { sourceTeacherId, targetTeacherId, weekId } = req.body;

  if (!sourceTeacherId || !targetTeacherId) {
    return error(res, "يرجى تحديد الجدول المصدر والمعلم المستهدف للتعيين", 400);
  }

  const [sourceTeacher, targetTeacher] = await Promise.all([
    User.findById(sourceTeacherId).populate(
      "subjects",
      "name nameEn code color",
    ),
    User.findById(targetTeacherId).populate(
      "subjects",
      "name nameEn code color",
    ),
  ]);

  if (!sourceTeacher || !targetTeacher) {
    return error(res, "المعلم المصدر أو المعلم المستهدف غير موجود", 404);
  }

  // Transfer all schedules from sourceTeacher to targetTeacher across all weeks
  const transferResult = await Schedule.updateMany(
    { teacher: sourceTeacher._id },
    {
      $set: {
        teacher: targetTeacher._id,
        updatedBy: req.user._id,
      },
    },
  );

  // Merge subjects
  const schedulesOfTarget = await Schedule.find({ teacher: targetTeacher._id });
  const mergedSubjectIds = new Set(
    schedulesOfTarget.map((s) => s.subject.toString()),
  );

  (sourceTeacher.subjects || []).forEach((sub) => {
    const sId = (sub._id || sub).toString();
    mergedSubjectIds.add(sId);
  });

  (targetTeacher.subjects || []).forEach((sub) => {
    const sId = (sub._id || sub).toString();
    mergedSubjectIds.add(sId);
  });

  targetTeacher.subjects = Array.from(mergedSubjectIds);
  targetTeacher.isProfileComplete = true;
  await targetTeacher.save({ validateBeforeSave: false });

  // If source and target are different, mark source as claimed/deactivated
  if (sourceTeacher._id.toString() !== targetTeacher._id.toString()) {
    sourceTeacher.isClaimed = true;
    sourceTeacher.claimedBy = targetTeacher._id;
    sourceTeacher.isActive = false;
    await sourceTeacher.save({ validateBeforeSave: false });
  } else {
    sourceTeacher.isClaimed = true;
    await sourceTeacher.save({ validateBeforeSave: false });
  }

  await createAuditLog({
    req,
    action: "UPDATE",
    module: "schedules",
    description: `قام المشرف ${req.user.name} بتعيين جدول (${sourceTeacher.name}) إلى المعلم (${targetTeacher.name}) بعدد ${transferResult.modifiedCount} حصة.`,
    targetId: targetTeacher._id,
    targetModel: "User",
  });

  return success(
    res,
    {
      targetTeacher,
      transferredCount: transferResult.modifiedCount,
    },
    `تم تعيين جدول (${sourceTeacher.name}) إلى المعلم (${targetTeacher.name}) بنجاح ✅ (${transferResult.modifiedCount} حصة)`,
  );
});

/**
 * POST /api/schedules/toggle-timetable-claimed
 * Admin can mark an existing teacher's timetable as claimed (not vacant) or available (vacant)
 */
exports.toggleTimetableClaimed = catchAsync(async (req, res) => {
  const { teacherId, isClaimed } = req.body;

  if (!teacherId) {
    return error(res, "معرف المعلم مطلوب", 400);
  }

  const teacher = await User.findById(teacherId);
  if (!teacher) {
    return error(res, "المعلم غير موجود", 404);
  }

  teacher.isClaimed = Boolean(isClaimed);
  if (isClaimed) {
    teacher.isProfileComplete = true;
  }
  await teacher.save({ validateBeforeSave: false });

  await createAuditLog({
    req,
    action: "UPDATE",
    module: "schedules",
    description: `تغيير حالة الجدول للمعلم ${teacher.name} إلى: ${teacher.isClaimed ? "معين ومحجوز" : "شاغر متاح للاختيار"}`,
    targetId: teacher._id,
    targetModel: "User",
  });

  return success(
    res,
    teacher,
    `تم تحديث حالة الجدول للمعلم (${teacher.name}) إلى: ${teacher.isClaimed ? "معين ومحجوز 🔒" : "شاغر ومتاح للاختيار 🟢"}`,
  );
});

/**
 * POST /api/schedules/create-vacant-slot
 * Admin creates a new placeholder teacher (vacant timetable slot)
 * Role is resolved automatically from the database (no need to pass from frontend)
 */
exports.createVacantSlot = catchAsync(async (req, res) => {
  const { name, subjectId } = req.body;

  if (!name || !name.trim()) {
    return error(
      res,
      "اسم الجدول / الشاغر مطلوب (مثال: معلم رياضيات - شاغر 1)",
      400,
    );
  }

  // Find teacher role automatically
  const teacherRole = await Role.findOne({
    name: { $regex: /معلم|teacher/i },
  });

  if (!teacherRole) {
    return error(
      res,
      'لم يتم العثور على دور المعلم في النظام. يرجى إنشاء دور باسم "معلم" أولاً',
      400,
    );
  }

  const cleanEmail =
    "slot_" +
    Date.now() +
    "_" +
    Math.floor(Math.random() * 9999) +
    "@school.local";
  const cleanPassword = "Temp@" + Math.floor(100000 + Math.random() * 900000);

  const newTeacher = await User.create({
    name: name.trim(),
    email: cleanEmail,
    password: cleanPassword,
    role: teacherRole._id,
    subjects: subjectId ? [subjectId] : [],
    isActive: true,
    isClaimed: false,
  });

  await createAuditLog({
    req,
    action: "CREATE",
    module: "schedules",
    description: `قام المشرف ${req.user.name} بإنشاء جدول شاغر جديد: ${newTeacher.name}`,
    targetId: newTeacher._id,
    targetModel: "User",
  });

  const populated = await User.findById(newTeacher._id)
    .populate("role", "name description")
    .populate("subjects", "name code color");

  return success(
    res,
    populated,
    `تم إنشاء الجدول الشاغر (${newTeacher.name}) بنجاح ✅`,
    201,
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// TIMETABLE TEMPLATES (Vacant Slots) — No fake users involved
// ═════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/schedules/templates
 * Admin creates a new vacant timetable template (no user created)
 */
exports.createTemplate = catchAsync(async (req, res) => {
  const { name, subjects } = req.body;

  if (!name || !name.trim()) {
    return error(res, "اسم الجدول / الشاغر مطلوب", 400);
  }

  const template = await TimetableTemplate.create({
    name: name.trim(),
    subjects: subjects || [],
    entries: [],
    isClaimed: false,
    isActive: true,
    createdBy: req.user._id,
  });

  const populated = await TimetableTemplate.findById(template._id)
    .populate("subjects", "name code color")
    .populate("createdBy", "name");

  await createAuditLog({
    req,
    action: "CREATE",
    module: "schedules",
    description: `أنشأ المشرف ${req.user.name} جدولاً شاغراً جديداً: "${template.name}"`,
    targetId: template._id,
    targetModel: "TimetableTemplate",
  });

  return success(
    res,
    populated,
    `تم إنشاء الجدول الشاغر "${template.name}" بنجاح ✅`,
    201,
  );
});

/**
 * GET /api/schedules/templates
 * Get all active unclaimed timetable templates (with auto-heal for deleted users)
 */
exports.getTemplates = catchAsync(async (req, res) => {
  const { includeAll, includeClaimed } = req.query;

  // Auto-heal: Check any template marked as claimed where the user was deleted
  const claimedTemplates = await TimetableTemplate.find({ isClaimed: true });
  if (claimedTemplates.length > 0) {
    const User = require("../models/User.model");
    for (const t of claimedTemplates) {
      if (!t.claimedBy) {
        t.isClaimed = false;
        t.claimedBy = null;
        t.claimedAt = null;
        await t.save();
      } else {
        const userExists = await User.findById(t.claimedBy);
        if (!userExists) {
          t.isClaimed = false;
          t.claimedBy = null;
          t.claimedAt = null;
          await t.save();
        }
      }
    }
  }

  const filter = { isActive: true };
  if (includeAll !== "true" && includeClaimed !== "true") {
    filter.isClaimed = false;
  }

  const templates = await TimetableTemplate.find(filter)
    .populate("subjects", "name code color")
    .populate("claimedBy", "name email")
    .populate("createdBy", "name")
    .sort({ createdAt: -1 });

  return success(res, templates, "تم جلب الجداول الشاغرة بنجاح");
});

/**
 * GET /api/schedules/templates/:id
 * Get a single template with all entries
 */
exports.getTemplateById = catchAsync(async (req, res) => {
  const template = await TimetableTemplate.findById(req.params.id)
    .populate("subjects", "name code color")
    .populate("entries.subject", "name code color")
    .populate("claimedBy", "name email")
    .populate("createdBy", "name");

  if (!template) {
    return error(res, "الجدول الشاغر غير موجود", 404);
  }

  return success(res, template, "تم جلب الجدول الشاغر بنجاح");
});

/**
 * PUT /api/schedules/templates/:id
 * Admin updates template name/subjects
 */
exports.updateTemplate = catchAsync(async (req, res) => {
  const { name, subjects } = req.body;

  const template = await TimetableTemplate.findById(req.params.id);
  if (!template) return error(res, "الجدول الشاغر غير موجود", 404);
  if (template.isClaimed)
    return error(res, "لا يمكن تعديل جدول تم اختياره من معلم", 400);

  if (name) template.name = name.trim();
  if (subjects !== undefined) template.subjects = subjects;
  await template.save();

  const populated = await TimetableTemplate.findById(template._id).populate(
    "subjects",
    "name code color",
  );

  return success(res, populated, "تم تحديث الجدول الشاغر بنجاح");
});

/**
 * PUT /api/schedules/templates/:id/entries
 * Admin saves the full entries array for a template (bulk save)
 */
exports.saveTemplateEntries = catchAsync(async (req, res) => {
  const { entries } = req.body;

  const template = await TimetableTemplate.findById(req.params.id);
  if (!template) return error(res, "الجدول الشاغر غير موجود", 404);
  if (template.isClaimed)
    return error(res, "لا يمكن تعديل جدول تم اختياره من معلم", 400);

  template.entries = (entries || []).map((e) => ({
    day: e.day,
    period: Number(e.period),
    subject: e.subject || null,
    className: e.className || "",
    room: e.room || "",
  }));

  await template.save();

  const populated = await TimetableTemplate.findById(template._id)
    .populate("entries.subject", "name code color")
    .populate("subjects", "name code color");

  return success(res, populated, "تم حفظ حصص الجدول الشاغر بنجاح ✅");
});

/**
 * DELETE /api/schedules/templates/:id
 * Admin deletes a vacant template
 */
exports.deleteTemplate = catchAsync(async (req, res) => {
  const template = await TimetableTemplate.findById(req.params.id);
  if (!template) return error(res, "الجدول الشاغر غير موجود", 404);

  // If claimed, check if claimedBy user exists
  if (template.isClaimed && template.claimedBy) {
    const User = require("../models/User.model");
    const userExists = await User.findById(template.claimedBy);
    if (userExists) {
      return error(
        res,
        "لا يمكن حذف جدول تم اختياره من معلم مسجل. يرجى إلغاء تعيينه أولاً.",
        400,
      );
    }
  }

  await TimetableTemplate.deleteOne({ _id: template._id });

  await createAuditLog({
    req,
    action: "DELETE",
    module: "schedules",
    description: `حذف المشرف ${req.user.name} الجدول الشاغر: "${template.name}"`,
    targetId: template._id,
    targetModel: "TimetableTemplate",
  });

  return success(res, null, `تم حذف الجدول الشاغر "${template.name}" بنجاح`);
});

/**
 * POST /api/schedules/templates/:id/claim
 * Teacher claims a template — entries become real Schedule documents
 */
exports.claimTemplate = catchAsync(async (req, res) => {
  const { weekId } = req.body;
  const teacher = req.user;

  const template = await TimetableTemplate.findById(req.params.id).populate(
    "entries.subject",
    "_id",
  );

  if (!template) return error(res, "الجدول الشاغر غير موجود", 404);
  if (!template.isActive) return error(res, "هذا الجدول غير نشط", 400);
  if (template.isClaimed) {
    if (
      template.claimedBy &&
      template.claimedBy.toString() === teacher._id.toString()
    ) {
      return success(
        res,
        { template, alreadyClaimed: true },
        `تم اختيار الجدول "${template.name}" بنجاح مسبقاً لحسابك ✅`,
      );
    }
    return error(res, "تم اختيار هذا الجدول من قِبَل معلم آخر", 409);
  }

  // Resolve week
  let week = null;
  if (weekId) {
    week = await Week.findById(weekId);
  }
  if (!week) {
    week = await Week.findOne({ isActive: true }).sort({ startDate: -1 });
  }
  if (!week) {
    return error(res, "لا يوجد أسبوع نشط لتعيين الحصص عليه", 404);
  }

  // Get week day dates
  const dayDatesMap = {};
  const DAY_NAMES_ORDERED = [
    "الأحد",
    "الإثنين",
    "الثلاثاء",
    "الأربعاء",
    "الخميس",
  ];
  const weekStart = new Date(week.startDate);
  DAY_NAMES_ORDERED.forEach((d, i) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    dayDatesMap[d] = date;
  });

  // Convert entries to real Schedule documents (upsert)
  const scheduleOps = template.entries.map((entry) => {
    const dayDate = dayDatesMap[entry.day] || weekStart;
    return {
      updateOne: {
        filter: {
          week: week._id,
          day: entry.day,
          period: entry.period,
          teacher: teacher._id,
        },
        update: {
          $set: {
            week: week._id,
            day: entry.day,
            period: entry.period,
            dayDate,
            subject: entry.subject?._id || entry.subject,
            teacher: teacher._id,
            className: entry.className || "",
            room: entry.room || "",
            createdBy: teacher._id,
          },
        },
        upsert: true,
      },
    };
  });

  if (scheduleOps.length > 0) {
    await Schedule.bulkWrite(scheduleOps);
  }

  // Merge subjects into teacher profile
  const User = require("../models/User.model");
  const teacherDoc = await User.findById(teacher._id);
  const templateSubjects = template.subjects.map((s) => s.toString());
  const existingSubjects = (teacherDoc.subjects || []).map((s) => s.toString());
  const mergedSubjects = [
    ...new Set([...existingSubjects, ...templateSubjects]),
  ];
  teacherDoc.subjects = mergedSubjects;
  teacherDoc.isProfileComplete = true;
  await teacherDoc.save({ validateBeforeSave: false });

  // Mark template as claimed
  template.isClaimed = true;
  template.claimedBy = teacher._id;
  template.claimedAt = new Date();
  await template.save();

  await createAuditLog({
    req,
    action: "UPDATE",
    module: "schedules",
    description: `اختار المعلم ${teacher.name} الجدول الشاغر "${template.name}" وتم إنشاء ${scheduleOps.length} حصة.`,
    targetId: template._id,
    targetModel: "TimetableTemplate",
  });

  return success(
    res,
    { template, schedulesCreated: scheduleOps.length, week },
    `تم اختيار الجدول "${template.name}" بنجاح ✅ — تم إنشاء ${scheduleOps.length} حصة في الأسبوع الحالي`,
  );
});

/**
 * POST /api/schedules/templates/:id/assign
 * Admin assigns a template to an existing registered teacher
 */
exports.assignTemplateToTeacher = catchAsync(async (req, res) => {
  const { teacherId, weekId } = req.body;

  const template = await TimetableTemplate.findById(req.params.id).populate(
    "entries.subject",
    "_id",
  );

  if (!template) return error(res, "الجدول الشاغر غير موجود", 404);
  if (template.isClaimed) return error(res, "تم اختيار هذا الجدول مسبقاً", 409);

  const User = require("../models/User.model");
  const targetTeacher = await User.findById(teacherId);
  if (!targetTeacher) return error(res, "المعلم المستهدف غير موجود", 404);

  // Resolve week
  let week = null;
  if (weekId) week = await Week.findById(weekId);
  if (!week)
    week = await Week.findOne({ isActive: true }).sort({ startDate: -1 });
  if (!week) return error(res, "لا يوجد أسبوع نشط", 404);

  const weekStart = new Date(week.startDate);
  const DAY_NAMES_ORDERED = [
    "الأحد",
    "الإثنين",
    "الثلاثاء",
    "الأربعاء",
    "الخميس",
  ];
  const dayDatesMap = {};
  DAY_NAMES_ORDERED.forEach((d, i) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    dayDatesMap[d] = date;
  });

  const scheduleOps = template.entries.map((entry) => ({
    updateOne: {
      filter: {
        week: week._id,
        day: entry.day,
        period: entry.period,
        teacher: targetTeacher._id,
      },
      update: {
        $set: {
          week: week._id,
          day: entry.day,
          period: entry.period,
          dayDate: dayDatesMap[entry.day] || weekStart,
          subject: entry.subject?._id || entry.subject,
          teacher: targetTeacher._id,
          className: entry.className || "",
          room: entry.room || "",
          createdBy: req.user._id,
        },
      },
      upsert: true,
    },
  }));

  if (scheduleOps.length > 0) await Schedule.bulkWrite(scheduleOps);

  // Merge subjects
  const templateSubjects = template.subjects.map((s) => s.toString());
  const existingSubjects = (targetTeacher.subjects || []).map((s) =>
    s.toString(),
  );
  targetTeacher.subjects = [
    ...new Set([...existingSubjects, ...templateSubjects]),
  ];
  await targetTeacher.save({ validateBeforeSave: false });

  // Mark claimed
  template.isClaimed = true;
  template.claimedBy = targetTeacher._id;
  template.claimedAt = new Date();
  await template.save();

  await createAuditLog({
    req,
    action: "UPDATE",
    module: "schedules",
    description: `عيّن المشرف ${req.user.name} الجدول "${template.name}" للمعلم ${targetTeacher.name} (${scheduleOps.length} حصة)`,
    targetId: template._id,
    targetModel: "TimetableTemplate",
  });

  return success(
    res,
    { targetTeacher, schedulesCreated: scheduleOps.length },
    `تم تعيين الجدول "${template.name}" للمعلم ${targetTeacher.name} بنجاح ✅`,
  );
});

/**
 * POST /api/schedules/templates/:id/unclaim
 * Admin unclaims / releases a template so it becomes available for new teachers
 */
exports.unclaimTemplate = catchAsync(async (req, res) => {
  const template = await TimetableTemplate.findById(req.params.id);
  if (!template) return error(res, "الجدول الشاغر غير موجود", 404);

  const prevClaimedBy = template.claimedBy;
  template.isClaimed = false;
  template.claimedBy = null;
  template.claimedAt = null;
  await template.save();

  await createAuditLog({
    req,
    action: "UPDATE",
    module: "schedules",
    description: `قام المشرف ${req.user.name} بإلغاء تعيين الجدول "${template.name}" وإتاحته كشاغر مجدداً`,
    targetId: template._id,
    targetModel: "TimetableTemplate",
  });

  const populated = await TimetableTemplate.findById(template._id)
    .populate("subjects", "name code color")
    .populate("createdBy", "name");

  return success(
    res,
    populated,
    `تم إلغاء تعيين الجدول "${template.name}" وأصبح متاحاً للاختيار بنجاح ✅`,
  );
});

/**
 * POST /api/schedules/import-pdf
 * Uploads a school timetable PDF, parses it, and returns detected timetables for preview
 */
exports.importPdfTimetables = catchAsync(async (req, res) => {
  if (!req.file || !req.file.buffer) {
    return error(res, "يرجى رفع ملف PDF صالح", 400);
  }

  // Find teacher role
  const teacherRole = await Role.findOne({
    name: { $regex: /معلم|teacher/i },
  });

  const [existingTeachers, existingSubjects] = await Promise.all([
    User.find(teacherRole ? { role: teacherRole._id, isActive: true } : { isActive: true })
      .select("name email subjects")
      .populate("subjects", "name code color"),
    Subject.find({ isActive: true }).select("name code color"),
  ]);

  const detectedTimetables = await parseTimetablePdf(
    req.file.buffer,
    existingTeachers,
    existingSubjects
  );

  if (!detectedTimetables || detectedTimetables.length === 0) {
    return error(
      res,
      "تعذر العثور على جداول صالحة داخل ملف الـ PDF. يرجى التأكد من أن الملف نصي ويحتوي على جداول حصص.",
      422
    );
  }

  return success(
    res,
    {
      detectedCount: detectedTimetables.length,
      timetables: detectedTimetables,
      availableTeachers: existingTeachers.map((t) => ({
        _id: t._id,
        name: t.name,
        email: t.email,
        subjects: t.subjects,
      })),
      availableSubjects: existingSubjects,
    },
    `تم استخراج ${detectedTimetables.length} جدول بنجاح من ملف الـ PDF 📄✨`
  );
});

/**
 * POST /api/schedules/confirm-import-pdf
 * Confirms and executes saving the imported timetables
 */
exports.confirmImportPdf = catchAsync(async (req, res) => {
  const { timetables, weekId } = req.body;

  if (!Array.isArray(timetables) || timetables.length === 0) {
    return error(res, "لا توجد جداول محددة للحفظ", 400);
  }

  // Resolve week
  let week = null;
  if (weekId) week = await Week.findById(weekId);
  if (!week) week = await Week.findOne({ isActive: true }).sort({ startDate: -1 });
  if (!week) return error(res, "لا يوجد أسبوع نشط لتعيين الحصص عليه", 404);

  const existingSubjects = await Subject.find();
  const subjectMap = new Map();
  existingSubjects.forEach((s) => {
    subjectMap.set(s.name.trim(), s);
  });

  const DAY_NAMES_ORDERED = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس"];
  const weekStart = new Date(week.startDate);
  const dayDatesMap = {};
  DAY_NAMES_ORDERED.forEach((d, i) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    dayDatesMap[d] = date;
  });

  let assignedTeachersCount = 0;
  let vacantTemplatesCount = 0;
  let totalSchedulesCreated = 0;

  for (const item of timetables) {
    if (item.action === "skip") continue;

    // Resolve subject IDs for this timetable
    const resolvedSubjectIds = [];
    for (const subName of item.subjects || []) {
      const cleanSubName = subName ? subName.trim() : "مادة عامة";
      let subjDoc = subjectMap.get(cleanSubName);
      if (!subjDoc) {
        subjDoc = await Subject.create({
          name: cleanSubName,
          code: cleanSubName.slice(0, 3).toUpperCase() + Math.floor(Math.random() * 100),
          color: "#3b82f6",
          isActive: true,
          createdBy: req.user._id,
        });
        subjectMap.set(cleanSubName, subjDoc);
      }
      if (!resolvedSubjectIds.includes(subjDoc._id.toString())) {
        resolvedSubjectIds.push(subjDoc._id.toString());
      }
    }

    if (item.action === "assign" && item.targetTeacherId) {
      const targetTeacher = await User.findById(item.targetTeacherId);
      if (targetTeacher) {
        const scheduleOps = (item.entries || [])
          .map((entry) => {
            let subjDoc = subjectMap.get((entry.subjectName || "").trim());
            if (!subjDoc) {
              subjDoc = existingSubjects[0];
            }
            const dayDate = dayDatesMap[entry.day] || weekStart;

            return {
              updateOne: {
                filter: {
                  week: week._id,
                  day: entry.day,
                  period: Number(entry.period),
                  teacher: targetTeacher._id,
                },
                update: {
                  $set: {
                    week: week._id,
                    day: entry.day,
                    period: Number(entry.period),
                    dayDate,
                    subject: subjDoc ? subjDoc._id : null,
                    teacher: targetTeacher._id,
                    className: entry.className || "",
                    room: entry.room || "",
                    createdBy: req.user._id,
                    updatedBy: req.user._id,
                  },
                },
                upsert: true,
              },
            };
          })
          .filter((op) => op.updateOne.update.$set.subject);

        if (scheduleOps.length > 0) {
          await Schedule.bulkWrite(scheduleOps);
          totalSchedulesCreated += scheduleOps.length;
        }

        // Add subjects to teacher
        const existingTeacherSubs = (targetTeacher.subjects || []).map((s) => s.toString());
        targetTeacher.subjects = [...new Set([...existingTeacherSubs, ...resolvedSubjectIds])];
        targetTeacher.isProfileComplete = true;
        await targetTeacher.save({ validateBeforeSave: false });

        assignedTeachersCount++;
      }
    } else {
      // Create TimetableTemplate
      const templateEntries = (item.entries || []).map((entry) => {
        let subjDoc = subjectMap.get((entry.subjectName || "").trim());
        return {
          day: entry.day,
          period: Number(entry.period),
          subject: subjDoc ? subjDoc._id : null,
          className: entry.className || "",
          room: entry.room || "",
        };
      });

      await TimetableTemplate.create({
        name: item.extractedName || `جدول شاغر مستورد (${vacantTemplatesCount + 1})`,
        subjects: resolvedSubjectIds,
        entries: templateEntries,
        isClaimed: false,
        isActive: true,
        createdBy: req.user._id,
      });

      vacantTemplatesCount++;
    }
  }

  await createAuditLog({
    req,
    action: "CREATE",
    module: "schedules",
    description: `استيراد جداول من ملف PDF: تم تعيين ${assignedTeachersCount} معلم، وإنشاء ${vacantTemplatesCount} جدول شاغر جديد (${totalSchedulesCreated} حصة).`,
    targetModel: "TimetableTemplate",
  });

  return success(
    res,
    {
      assignedTeachersCount,
      vacantTemplatesCount,
      totalSchedulesCreated,
      week,
    },
    `تم استيراد الجداول بنجاح 🎉 (${assignedTeachersCount} معلم تم تعيينهم، ${vacantTemplatesCount} جدول شاغر متاح للمعلّمين الجدد)`
  );
});
