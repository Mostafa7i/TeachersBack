const Subject = require('../models/Subject.model');

const REQUIRED_SUBJECTS = [
  { name: 'فنية', nameEn: 'Art Education', code: 'ART', color: '#ec4899' },
  { name: 'رياضيات', nameEn: 'Mathematics', code: 'MATH', color: '#2563eb' },
  { name: 'رقمية', nameEn: 'Digital Skills', code: 'DIGITAL', color: '#0284c7' },
  { name: 'توحيد', nameEn: 'Tawhid', code: 'TAWHID', color: '#059669' },
  { name: 'English', nameEn: 'English Language', code: 'ENG', color: '#7c3aed' },
  { name: 'لغتي', nameEn: 'Arabic (Lughati)', code: 'LUGHATI', color: '#10b981' },
  { name: 'بدنية', nameEn: 'Physical Education', code: 'PE', color: '#f59e0b' },
  { name: 'تفسير', nameEn: 'Tafsir', code: 'TAFSIR', color: '#0d9488' },
  { name: 'اجتماعيات', nameEn: 'Social Studies', code: 'SOCIAL', color: '#d97706' },
  { name: 'حديث', nameEn: 'Hadith', code: 'HADITH', color: '#84cc16' },
  { name: 'علوم', nameEn: 'Science', code: 'SCI', color: '#06b6d4' },
];

const ensureSubjects = async () => {
  try {
    for (const sub of REQUIRED_SUBJECTS) {
      const existing = await Subject.findOne({
        $or: [
          { code: sub.code },
          { name: sub.name },
          { name: { $regex: new RegExp(`^${sub.name}$`, 'i') } },
        ],
      });

      if (!existing) {
        await Subject.create(sub);
        console.log(`📚 تم إنشاء مادة: ${sub.name} (${sub.code})`);
      }
    }
  } catch (err) {
    console.error('Error ensuring default subjects:', err.message);
  }
};

module.exports = { ensureSubjects, REQUIRED_SUBJECTS };
