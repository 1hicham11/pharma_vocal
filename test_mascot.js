require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const mascotService = require('./services/mascotService');

async function runTest() {
    const avatarId = 9999;
    const avatarName = "Footballeur professionnel";
    const icon = "⚽";
    
    console.log("=== Début du test MascotService ===");
    console.log("1. Génération des candidats (portrait de référence)...");
    
    const candidatePath = path.join(__dirname, 'public', 'assets', 'avatars', 'generated', 'avatar-9999', 'candidates', 'candidate-01.png');
    console.log("Utilisation du candidat existant:", candidatePath);
    
    console.log("2. Génération de la planche de sprites (64 poses)...");
    const result = await mascotService.generateMascotSet({
        avatarId,
        avatarName,
        icon,
        selectedMasterAbsolutePath: candidatePath,
        onProgress: (p) => console.log(`[Progression Sprites] ${p.label}`)
    });
    
    console.log("=== Génération terminée ===");
    console.log("Chemin de la planche de sprites:", result.spriteSheet?.url);
    console.log("Manifest complet sauvegardé.");
}

runTest().catch(console.error);