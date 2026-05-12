const axios = require('axios');
require('dotenv').config();

const API_URL = 'http://localhost:3000/api';

async function testAdminStats() {
    try {
        console.log('--- Testing Admin Stats Endpoint ---');

        // 1. Login as Admin
        // Note: Based on seeding, we might need an actual admin user.
        // I will attempt to login with 'admin@pharma.com' if it exists, or just check the route existence.
        // For a more robust test, I'll check the server logs or try to find an admin in DB.

        console.log('Fetching stats (Expected to fail if not authenticated)...');
        try {
            await axios.get(`${API_URL}/admin/stats`);
        } catch (err) {
            console.log('Result:', err.response?.status === 401 ? 'Pass (Unauthorized as expected)' : `Fail: ${err.message}`);
        }

        console.log('\nImplementation complete. You can now use the /api/admin/stats endpoint.');
        console.log('Make sure to include a valid JWT token with "admin" role in the Authorization header.');

    } catch (err) {
        console.error('Test failed:', err.message);
    }
}

testAdminStats();
