const evaluateService = require('./services/evaluateService');
const sessionRepository = require('./repositories/sessionRepository');
const chatRepository = require('./repositories/chatRepository');
const medicamentRepository = require('./repositories/medicamentRepository');
const medConnuesRepository = require('./repositories/medConnuesRepository');
const medInconnuesRepository = require('./repositories/medInconnuesRepository');
const evaluationRepository = require('./repositories/evaluationRepository');
const pool = require('./db/connection');

async function testDetection() {
    console.log('--- STARTING MEDICATION DETECTION TEST ---');

    // 1. Create a dummy session
    const sessionId = 'test-session-' + Date.now();
    await sessionRepository.create({ id: sessionId, delegue_id: 6494 });
    console.log('Created test session:', sessionId);

    // 2. Fetch active medications to use in the mock transcription
    const activeMeds = await medicamentRepository.getAllActive();
    console.log('Active medications in DB:', activeMeds.map(m => m.nom_commercial).join(', '));

    const knownMed = activeMeds.find(m => m.nom_commercial.includes('Paraphan') || m.nom_commercial.includes('Amoxiphan')) || activeMeds[0];
    if (!knownMed) {
        console.error('No medications found in DB. Please ensure Paraphan/Amoxiphan exist.');
        process.exit(1);
    }

    const knownMedName = knownMed.nom_commercial;
    const unknownMedName = 'SuperMed-Ultra-2000';

    console.log(`Testing with known med: "${knownMedName}" and unknown med: "${unknownMedName}"`);

    // 3. Insert mock messages
    await chatRepository.saveMessage(sessionId, 'delegue', `Bonjour Docteur. Je viens vous présenter le ${knownMedName}. C'est très efficace.`);
    await chatRepository.saveMessage(sessionId, 'medecin_ia', 'D\'accord, parlez-moi de la posologie.');
    await chatRepository.saveMessage(sessionId, 'delegue', `Pour le ${knownMedName}, c'est 1 comprimé par jour. Au fait, connaissez-vous aussi le ${unknownMedName} ?`);
    console.log('Mock messages saved.');

    // 4. Run analysis
    console.log('Running analyzeConversation...');
    try {
        const result = await evaluateService.analyzeConversation(sessionId);
        console.log('Evaluation result:', JSON.stringify(result, null, 2));

        // 5. Verify storage
        const knownStored = await medConnuesRepository.findBySessionId(sessionId);
        const unknownStored = await medInconnuesRepository.findBySessionId(sessionId);

        console.log('Known meds stored:', knownStored.map(m => m.nom_commercial));
        console.log('Unknown meds stored:', unknownStored.map(m => m.nom_medicament));

        const passKnown = knownStored.some(m => m.medicament_id === knownMed.id);
        const passUnknown = unknownStored.some(m => m.nom_medicament.toLowerCase() === unknownMedName.toLowerCase());

        if (passKnown && passUnknown) {
            console.log('✅ TEST PASSED: Known and Unknown medications correctly detected and stored.');
        } else {
            console.log('❌ TEST FAILED: Detection or storage incomplete.');
            if (!passKnown) console.log(`- Known med "${knownMedName}" not found in storage.`);
            if (!passUnknown) console.log(`- Unknown med "${unknownMedName}" not found in storage.`);
        }

    } catch (err) {
        console.error('❌ TEST ERROR:', err.message);
    } finally {
        // Cleanup
        console.log('Cleaning up test data...');
        await pool.execute('DELETE FROM sessions WHERE id = ?', [sessionId]);
        console.log('Cleanup done.');
        process.exit(0);
    }
}

testDetection();
