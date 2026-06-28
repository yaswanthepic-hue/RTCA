const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: function (req, file, cb) {
    // Block only genuinely dangerous executable types
    const blockedExtensions = /\.(exe|bat|cmd|sh|ps1|msi|com|scr|vbs|jar)$/i;
    if (blockedExtensions.test(path.extname(file.originalname).toLowerCase())) {
      return cb(new Error('Executable file types are not allowed'));
    }
    cb(null, true);
  }
});

module.exports = upload;