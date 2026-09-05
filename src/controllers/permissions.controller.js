const Permission = require("../models/Permission.model");
const catchAsync = require("../utils/catchAsync");
const { success } = require("../utils/apiResponse");

exports.getAll = catchAsync(async (req, res) => {
  const permissions = await Permission.find().sort({ module: 1, action: 1 });

  // Group by module for easy UI display
  const grouped = permissions.reduce((acc, perm) => {
    if (!acc[perm.module]) {
      acc[perm.module] = [];
    }
    acc[perm.module].push(perm);
    return acc;
  }, {});

  return success(
    res,
    {
      list: permissions,
      grouped,
    },
    "تم جلب قائمة الصلاحيات بنجاح",
  );
});
