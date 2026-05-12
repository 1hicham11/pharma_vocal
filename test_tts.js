require('dotenv').config();
const axios = require('axios');
const jwt = require('jsonwebtoken');

async function testTTS() {
    const token = jwt.sign({ id: 1, role: 'delegue' }, process.env.JWT_SECRET);

    try {
        console.log('Sending request to http://localhost:3001/api/tts...');
        const response = await axios.get('http://localhost:3001/api/tts?text=test', {
            headers: { 'Authorization': `Bearer ${token}` },
            responseType: 'stream'
        });

        console.log('Response started. Status:', response.status);
        response.data.on('data', (chunk) => {
            console.log('Received chunk of size:', chunk.length);
        });
        response.data.on('end', () => console.log('Response ended.'));
    } catch (err) {
        if (err.response) {
            console.error('Error status:', err.response.status);
            // Read body from stream if possible
            let body = '';
            for await (const chunk of err.response.data) {
                body += chunk;
            }
            console.error('Error body:', body);
        } else {
            console.error('Error message:', err.message);
        }
    }
}

testTTS();
