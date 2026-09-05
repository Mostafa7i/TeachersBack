require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Permission = require('../models/Permission.model');
const Role = require('../models/Role.model');
const Subject = require('../models/Subject.model');
const User = require('../models/User.model');
const Week = require('../models/Week.model');
const Schedule = require('../models/Schedule.model');
const SchoolSettings = require('../models/SchoolSettings.model');
const AuditLog = require('../models/AuditLog.model');

const permissionsList = [
  // Schedules permissions
  { name: 'schedules.view', description: 'مشاهدة الجداول الأسبوعية', module: 'schedules', action: 'view' },
  { name: 'schedules.create', description: 'إنشاء حصة أو جدول جديد', module: 'schedules', action: 'create' },
  { name: 'schedules.edit', description: 'تعديل كامل بيانات الحصة والجدول', module: 'schedules', action: 'edit' },
  { name: 'schedules.edit_title', description: 'تعديل عنوان الدرس فقط', module: 'schedules', action: 'edit_title' },
  { name: 'schedules.edit_homework', description: 'تعديل الواجبات فقط', module: 'schedules', action: 'edit_homework' },
  { name: 'schedules.edit_activities', description: 'تعديل الأنشطة فقط', module: 'schedules', action: 'edit_activities' },
  { name: 'schedules.edit_notes', description: 'تعديل الملاحظات فقط', module: 'schedules', action: 'edit_notes' },
  { name: 'schedules.delete', description: 'حذف حصة من الجدول', module: 'schedules', action: 'delete' },
  { name: 'schedules.copy_week', description: 'نسخ جدول أسبوع كامل إلى أسبوع آخر', module: 'schedules', action: 'copy_week' },
  { name: 'schedules.export', description: 'تصدير الجدول كصورة PNG أو مستند PDF', module: 'schedules', action: 'export' },

  // Users permissions
  { name: 'users.view', description: 'عرض قائمة المستخدمين والمعلمين', module: 'users', action: 'view' },
  { name: 'users.create', description: 'إضافة مستخدم أو معلم جديد', module: 'users', action: 'create' },
  { name: 'users.edit', description: 'تعديل بيانات المستخدم أو المعلم', module: 'users', action: 'edit' },
  { name: 'users.delete', description: 'حذف مستخدم أو معلم من النظام', module: 'users', action: 'delete' },

  // Roles permissions
  { name: 'roles.view', description: 'عرض الأدوار والصلاحيات', module: 'roles', action: 'view' },
  { name: 'roles.create', description: 'إنشاء دور جديد', module: 'roles', action: 'create' },
  { name: 'roles.edit', description: 'تعديل الأدوار والصلاحيات المسندة', module: 'roles', action: 'edit' },
  { name: 'roles.delete', description: 'حذف دور من النظام', module: 'roles', action: 'delete' },

  // Subjects permissions
  { name: 'subjects.view', description: 'عرض المواد الدراسية', module: 'subjects', action: 'view' },
  { name: 'subjects.create', description: 'إضافة مادة دراسية جديدة', module: 'subjects', action: 'create' },
  { name: 'subjects.edit', description: 'تعديل مادة دراسية', module: 'subjects', action: 'edit' },
  { name: 'subjects.delete', description: 'حذف مادة دراسية', module: 'subjects', action: 'delete' },

  // Settings permissions
  { name: 'settings.view', description: 'عرض إعدادات وبيانات المدرسة', module: 'settings', action: 'view' },
  { name: 'settings.edit', description: 'تعديل إعدادات وشعار المدرسة', module: 'settings', action: 'edit' },

  // Audit logs permissions
  { name: 'audit-logs.view', description: 'عرض سجل العمليات وتدقيق النظام', module: 'audit-logs', action: 'view' },
];

const seedData = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/school_schedule';
    console.log(`📡 جاري الاتصال بقاعدة البيانات: ${mongoUri}`);
    await mongoose.connect(mongoUri);
    console.log('✅ تم الاتصال بقاعدة البيانات بنجاح.');

    // 1) Clear existing data
    console.log('🧹 تنظيف البيانات السابقة...');
    await Promise.all([
      Permission.deleteMany({}),
      Role.deleteMany({}),
      Subject.deleteMany({}),
      User.deleteMany({}),
      Week.deleteMany({}),
      Schedule.deleteMany({}),
      SchoolSettings.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);

    // 2) Seed Permissions
    console.log('🔑 إنشاء الصلاحيات الأساسية...');
    const createdPermissions = await Permission.insertMany(permissionsList);
    const permMap = {};
    createdPermissions.forEach((p) => {
      permMap[p.name] = p._id;
    });

    // 3) Seed Roles
    console.log('👥 إنشاء الأدوار (Roles)...');
    const teacherPerms = [
      permMap['schedules.view'],
      permMap['schedules.edit_title'],
      permMap['schedules.edit_homework'],
      permMap['schedules.edit_activities'],
      permMap['schedules.edit_notes'],
      permMap['schedules.export'],
      permMap['subjects.view'],
    ].filter(Boolean);

    const superAdminRole = await Role.create({
      name: 'super_admin',
      description: 'مدير النظام بصلاحيات كاملة وغير مقيدة',
      permissions: createdPermissions.map((p) => p._id),
      isSystem: true,
    });

    const teacherRole = await Role.create({
      name: 'معلم (Teacher)',
      description: 'معلم مادة - صلاحيات تحضير وتعديل الحقول الخاصة بحصصه ومادته وتصدير الجدول',
      permissions: teacherPerms,
      isSystem: false,
    });

    // 4) Seed Subjects
    console.log('📚 إنشاء المواد الدراسية...');
    const subjects = await Subject.insertMany([
      { name: 'المهارات الرقمية', nameEn: 'Digital Skills', code: 'DIGITAL', color: '#0284c7' },
      { name: 'الرياضيات', nameEn: 'Mathematics', code: 'MATH', color: '#2563eb' },
      { name: 'اللغة العربية', nameEn: 'Arabic Language', code: 'ARABIC', color: '#059669' },
      { name: 'العلوم', nameEn: 'Science', code: 'SCI', color: '#d97706' },
      { name: 'اللغة الإنجليزية', nameEn: 'English Language', code: 'ENG', color: '#7c3aed' },
      { name: 'التربية الإسلامية', nameEn: 'Islamic Studies', code: 'ISLAMIC', color: '#0d9488' },
    ]);

    const digitalSubject = subjects.find((s) => s.code === 'DIGITAL');
    const mathSubject = subjects.find((s) => s.code === 'MATH');
    const scienceSubject = subjects.find((s) => s.code === 'SCI');

    // 5) Seed Users
    console.log('👤 إنشاء حسابات المستخدمين...');
    const adminUser = await User.create({
      name: 'أحمد الإداري (مدير النظام)',
      email: 'admin@school.com',
      password: 'Admin@123456',
      role: superAdminRole._id,
      isActive: true,
    });

    // Teacher Mostafa Mahmoud (matching the user's uploaded paper timetable image)
    const mostafaTeacher = await User.create({
      name: 'مصطفى محمود',
      email: 'teacher@school.com',
      password: 'Teacher@123456',
      role: teacherRole._id,
      subjects: [digitalSubject._id],
      isActive: true,
      createdBy: adminUser._id,
    });

    const mathTeacher = await User.create({
      name: 'أحمد محمد (معلم الرياضيات)',
      email: 'math.teacher@school.com',
      password: 'Teacher@123456',
      role: teacherRole._id,
      subjects: [mathSubject._id],
      isActive: true,
      createdBy: adminUser._id,
    });

    const scienceTeacher = await User.create({
      name: 'سارة خالد (معلمة العلوم)',
      email: 'science.teacher@school.com',
      password: 'Teacher@123456',
      role: teacherRole._id,
      subjects: [scienceSubject._id],
      isActive: true,
      createdBy: adminUser._id,
    });

    // 6) Seed Weeks
    console.log('📅 إنشاء الأسابيع الدراسية...');
    const week1Start = new Date('2026-09-06T00:00:00.000Z');
    const week1End = new Date('2026-09-10T23:59:59.999Z');

    const week2Start = new Date('2026-09-13T00:00:00.000Z');
    const week2End = new Date('2026-09-17T23:59:59.999Z');

    const week1 = await Week.create({
      weekNumber: 1,
      label: 'الأسبوع الأول (2026/09/06 - 2026/09/10)',
      startDate: week1Start,
      endDate: week1End,
      academicYear: '1447-1448هـ / 2026-2027م',
      isActive: true,
      createdBy: adminUser._id,
    });

    const week2 = await Week.create({
      weekNumber: 2,
      label: 'الأسبوع الثاني (2026/09/13 - 2026/09/17)',
      startDate: week2Start,
      endDate: week2End,
      academicYear: '1447-1448هـ / 2026-2027م',
      isActive: true,
      createdBy: adminUser._id,
    });

    // 7) Seed School Settings
    console.log('🏫 إنشاء إعدادات وشعار المدرسة...');
    await SchoolSettings.create({
      schoolName: 'مدارس برامج نت النموذجية',
      schoolNameEn: 'Baramej Net Model Schools',
      ministryHeader: 'المملكة العربية السعودية\nوزارة التعليم\nالإدارة العامة للتعليم',
      academicYear: '1447-1448هـ / 2026-2027م',
      term: 'الفصل الدراسي الأول',
      principalName: 'أ. عبدالعزيز الراجحي',
      academicAdvisorName: 'أ. فهد الشمري',
      periodsCount: 6,
      workDays: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'],
      phone: '+966 11 234 5678',
      email: 'info@school.edu.sa',
      address: 'المملكة العربية السعودية - الرياض',
      updatedBy: adminUser._id,
    });

    // 8) Seed exact Timetable for Mostafa Mahmoud matching the uploaded paper image
    console.log('🗓️ إنشاء جدول الحصص للمعلّم مصطفى محمود مطابق للصورة المرفقة...');
    const days = [
      { name: 'الأحد', date: new Date('2026-09-06') },
      { name: 'الإثنين', date: new Date('2026-09-07') },
      { name: 'الثلاثاء', date: new Date('2026-09-08') },
      { name: 'الأربعاء', date: new Date('2026-09-09') },
      { name: 'الخميس', date: new Date('2026-09-10') },
    ];

    // Slots from the paper image:
    // الأحد: 1 (ثاني ثاني), 2 (أول ثاني), 3 (أول أول)
    // الإثنين: 1 (أول أول), 2 (ثاني أول), 3 (ثالث أول)
    // الثلاثاء: 2 (ثالث ثاني), 3 (ثالث أول)
    // الأربعاء: 1 (ثاني ثالث), 2 (أول ثاني), 4 (ثاني ثالث)
    // الخميس: 1 (ثاني أول), 2 (ثاني ثاني), 3 (ثالث ثاني)

    const mostafaTimetableEntries = [
      // الأحد
      {
        week: week1._id,
        day: 'الأحد',
        dayDate: days[0].date,
        period: 1,
        subject: digitalSubject._id,
        teacher: mostafaTeacher._id,
        className: 'ثاني ثاني',
        lessonTitle: 'الوحدة الأولى: أساسيات الحاسب ونظام التشغيل',
        homework: 'حل التمرين الأول ص 14 في منصة مدرستي',
        activities: 'تطبيق عملي على فتح المجلدات وضبط الإعدادات في معمل الحاسب',
        notes: 'الالتزام بإحضار كراس الملاحظات',
        createdBy: adminUser._id,
      },
      {
        week: week1._id,
        day: 'الأحد',
        dayDate: days[0].date,
        period: 2,
        subject: digitalSubject._id,
        teacher: mostafaTeacher._id,
        className: 'أول ثاني',
        lessonTitle: 'مفهوم الشبكات والإنترنت وأمن المعلومات',
        homework: 'كتابة 3 نصائح لحماية كلمات المرور',
        activities: 'عرض تقديمي تفاعلي ومناقشة صفية',
        notes: '',
        createdBy: adminUser._id,
      },
      {
        week: week1._id,
        day: 'الأحد',
        dayDate: days[0].date,
        period: 3,
        subject: digitalSubject._id,
        teacher: mostafaTeacher._id,
        className: 'أول أول',
        lessonTitle: 'معالجة النصوص: تنسيق الفقرات والجداول',
        homework: 'تصميم جدول الحصص الأسبوعي باستخدام Word',
        activities: 'تطبيق فردي لكل طالب على جهازه',
        notes: 'تفاعل ممتاز من الطلاب',
        createdBy: adminUser._id,
      },

      // الإثنين
      {
        week: week1._id,
        day: 'الإثنين',
        dayDate: days[1].date,
        period: 1,
        subject: digitalSubject._id,
        teacher: mostafaTeacher._id,
        className: 'أول أول',
        lessonTitle: 'إدراج الصور والرسومات البيانية في المستندات',
        homework: 'تطبيق عملي وإرسال المستند عبر المنصة',
        activities: 'مسابقة أسرع تصميم مستند منسق',
        notes: '',
        createdBy: adminUser._id,
      },
      {
        week: week1._id,
        day: 'الإثنين',
        dayDate: days[1].date,
        period: 2,
        subject: digitalSubject._id,
        teacher: mostafaTeacher._id,
        className: 'ثاني أول',
        lessonTitle: 'الجداول الحسابية Excel: إدخال البيانات والمعادلات البسيطة',
        homework: 'حل تدريب ص 28 جمع القيم وحساب المتوسط',
        activities: 'تطبيق صيغ الجمع SUM والمتوسط AVERAGE',
        notes: 'التركيز على علامة المساواة = قبل الصيغة',
        createdBy: adminUser._id,
      },
      {
        week: week1._id,
        day: 'الإثنين',
        dayDate: days[1].date,
        period: 3,
        subject: digitalSubject._id,
        teacher: mostafaTeacher._id,
        className: 'ثالث أول',
        lessonTitle: 'لغة البرمجة بايثون: المتغيرات وأنواع البيانات',
        homework: 'كتابة كود طباعة رسالة ترحيبية وحساب العمر',
        activities: 'كتابة أول برنامج بايثون وتشغيله في بيئة IDLE',
        notes: 'مشاركة رائعة ومتميزة',
        createdBy: adminUser._id,
      },

      // الثلاثاء
      {
        week: week1._id,
        day: 'الثلاثاء',
        dayDate: days[2].date,
        period: 2,
        subject: digitalSubject._id,
        teacher: mostafaTeacher._id,
        className: 'ثالث ثاني',
        lessonTitle: 'البرمجة بلغة بايثون: الجمل الشرطية If...Else',
        homework: 'برنامج التحقق من درجة الطالب (ناجح / راسب)',
        activities: 'تحدي برمجي بين المجموعات لحل سيناريو شروط',
        notes: '',
        createdBy: adminUser._id,
      },
      {
        week: week1._id,
        day: 'الثلاثاء',
        dayDate: days[2].date,
        period: 3,
        subject: digitalSubject._id,
        teacher: mostafaTeacher._id,
        className: 'ثالث أول',
        lessonTitle: 'الحلقات التكرارية For Loop في بايثون',
        homework: 'كتابة برنامج لطباعة الأعداد من 1 إلى 10',
        activities: 'تتبع مسار تنفيذ الحلقات التكرارية خطوة بخطوة',
        notes: '',
        createdBy: adminUser._id,
      },

      // الأربعاء
      {
        week: week1._id,
        day: 'الأربعاء',
        dayDate: days[3].date,
        period: 1,
        subject: digitalSubject._id,
        teacher: mostafaTeacher._id,
        className: 'ثاني ثالث',
        lessonTitle: 'تصميم العروض التقديمية الاحترافية PowerPoint',
        homework: 'إعداد عرض من 3 شرائح عن الذكاء الاصطناعي',
        activities: 'إضافة الحركات والتأثيرات الانتقالية بين الشرائح',
        notes: '',
        createdBy: adminUser._id,
      },
      {
        week: week1._id,
        day: 'الأربعاء',
        dayDate: days[3].date,
        period: 2,
        subject: digitalSubject._id,
        teacher: mostafaTeacher._id,
        className: 'أول ثاني',
        lessonTitle: 'البحث الآمن عبر الإنترنت وتقييم المصادر',
        homework: 'البحث عن معلومة وتوثيق الرابط والمصدر',
        activities: 'تطبيق عملي لمهارات البحث المتقدم في محرك البحث',
        notes: '',
        createdBy: adminUser._id,
      },
      {
        week: week1._id,
        day: 'الأربعاء',
        dayDate: days[3].date,
        period: 4,
        subject: digitalSubject._id,
        teacher: mostafaTeacher._id,
        className: 'ثاني ثالث',
        lessonTitle: 'المخططات البيانية في Excel وتمثيل البيانات',
        homework: 'إنشاء مخطط أعمدة لمبيعات وهمية ص 40',
        activities: 'تحويل جدول البيانات إلى رسم بياني ملون',
        notes: '',
        createdBy: adminUser._id,
      },

      // الخميس
      {
        week: week1._id,
        day: 'الخميس',
        dayDate: days[4].date,
        period: 1,
        subject: digitalSubject._id,
        teacher: mostafaTeacher._id,
        className: 'ثاني أول',
        lessonTitle: 'مشروع ختامي: إنشاء نموذج لحساب الفاتورة',
        homework: 'مراجعة المهارات المكتسبة خلال الأسبوع',
        activities: 'تسليم ومناقشة المشاريع العملية في المعمل',
        notes: 'إجازة أسبوعية سعيدة',
        createdBy: adminUser._id,
      },
      {
        week: week1._id,
        day: 'الخميس',
        dayDate: days[4].date,
        period: 2,
        subject: digitalSubject._id,
        teacher: mostafaTeacher._id,
        className: 'ثاني ثاني',
        lessonTitle: 'مراجعة شاملة واختبار عملي قصير في معمل الحاسب',
        homework: 'لا يوجد',
        activities: 'حل الاختبار العملي التشخيصي وقياس نواتج التعلم',
        notes: 'تكريم الطلاب أصحاب الدرجات الكاملة',
        createdBy: adminUser._id,
      },
      {
        week: week1._id,
        day: 'الخميس',
        dayDate: days[4].date,
        period: 3,
        subject: digitalSubject._id,
        teacher: mostafaTeacher._id,
        className: 'ثالث ثاني',
        lessonTitle: 'تطوير مشروع بايثون بسيط وعرضه أمام الصف',
        homework: 'استكمال المشروع المنزلي',
        activities: 'عرض أعمال الطلاب المتميزة على الشاشة الرئيسية',
        notes: '',
        createdBy: adminUser._id,
      },
    ];

    await Schedule.insertMany(mostafaTimetableEntries);

    console.log(`=============================================`);
    console.log(`🎉 تم تهيئة بيانات النظام وتوزيع الحصص بنجاح!`);
    console.log(`---------------------------------------------`);
    console.log(`👤 حساب المدير (Admin):`);
    console.log(`   البريد: admin@school.com`);
    console.log(`   كلمة المرور: Admin@123456`);
    console.log(`---------------------------------------------`);
    console.log(`👨‍🏫 حساب المعلم (مصطفى محمود - مطابق للجدول المرفق):`);
    console.log(`   البريد: teacher@school.com`);
    console.log(`   كلمة المرور: Teacher@123456`);
    console.log(`=============================================`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ خطأ أثناء تشغيل Seed:', error);
    process.exit(1);
  }
};

seedData();
