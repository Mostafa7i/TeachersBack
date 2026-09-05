const Schedule = require("../models/Schedule.model");
const Week = require("../models/Week.model");
const Subject = require("../models/Subject.model");
const User = require("../models/User.model");
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

  // Find schedules specifically assigned to this teacher for this week
  const schedules = await Schedule.find({
    week: targetWeekId,
    teacher: user._id,
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
      return {
        week: weekId,
        day: e.day,
        dayDate: resolvedDate,
        period: Number(e.period),
        subject: e.subject,
        teacher: teacherId,
        className: e.className ? e.className.trim() : "",
        room: e.room ? e.room.trim() : "",
        lessonTitle: e.lessonTitle || "",
        homework: e.homework || "",
        activities: e.activities || "",
        notes: e.notes || "",
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
