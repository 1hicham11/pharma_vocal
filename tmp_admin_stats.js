require('dotenv').config();
const adminService = require('./services/adminService');
(async () => {
  try {
    const stats = await adminService.getDashboardStats();
    console.log('stats', stats);
  } catch (err) {
    console.error('errorMessage:', err.message);
    console.error(err.stack);
  }
})();
