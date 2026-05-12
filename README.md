# Pharma Vocal Agent 🩺🚀

Pharma Vocal Agent est une plateforme d'entraînement intelligente conçue pour aider les délégués pharmaceutiques à perfectionner leurs présentations médicales. Grâce à une IA conversationnelle (Dr. Martin), les délégués peuvent simuler des visites médicales en conditions réelles, en utilisant leur propre voix.

## 🌟 Fonctionnalités Clés

- **Interaction Vocale Native** : Utilisation de WebRTC pour une capture audio haute fidélité.
- **Dr. Martin (IA)** : Un personnage de médecin généraliste capable d'interagir en Français, Anglais et Darija Marocain.
- **Mode Visite Universelle** : Plus besoin de choisir un médicament. L'IA a accès à tout le catalogue et détecte automatiquement les produits dont vous parlez.
- **Évaluation Dynamique** : Après chaque visite, une analyse complète est générée (Précision technique, Persuasion, Aisance, Complétude).
- **Interruption en Temps Réel** : Grâce à une détection d'activité vocale (VAD) avancée, l'IA s'arrête instantanément si vous lui coupez la parole.
- **Historique & Progression** : Suivez l'évolution de vos scores et retrouvez vos échanges passés.

## 🏗️ Architecture Technique

Le projet repose sur une architecture hybride combinant un backend Express robuste et une orchestration d'IA flexible via n8n.

### Stack Technologique

- **Frontend** : HTML5, CSS3 Moderne (Glassmorphism, animations fluides), Vanilla JavaScript.
- **Backend** : Node.js & Express.js.
- **Base de Données** : MySQL (Persistance des utilisateurs, sessions, messages et fiches produits).
- **Intelligence Artificielle** :
  - **LLM** : Llama 3.3 70B (via Groq API) pour une latence ultra-faible.
  - **STT (Speech-to-Text)** : OpenAI Whisper V3 (via Groq) pour une transcription précise.
  - **TTS (Text-to-Speech)** : Web Speech API native.
- **Workflows** : n8n pour la gestion complexe des prompts et la logique multi-produits.

## 📂 Structure du Projet

```text
/
├── server.js            # Point d'entrée du serveur Express
├── routes/              # API Routes (Auth, Sessions, Chat, STT, etc.)
├── middleware/          # Securité & Intercepteurs (Auth JWT)
├── public/              # Frontend statique (Pages HTML, Styles CSS)
├── db/                  # Configuration de la connexion MySQL
├── n8n/                 # Export des workflows n8n utilisés par l'IA
└── pharma_vocal.sql     # Schéma de la base de données
```

## 🚀 Installation & Démarrage

### Prérequis
- Node.js (v18+)
- MySQL
- Une clé API [Groq](https://console.groq.com/)

### Configuration
1. Clonez le projet.
2. Créez un fichier `.env` à la racine :
   ```env
   DB_HOST=localhost
   DB_USER=votre_user
   DB_PASSWORD=votre_password
   DB_NAME=pharma_vocal
   JWT_SECRET=votre_secret_jwt
   GROQ_API_KEY=votre_cle_groq
   ```
3. Importez le fichier `pharma_vocal.sql` dans votre base MySQL.
4. Installez les dépendances :
   ```bash
   npm install
   ```

### Lancement
```bash
npm start
```
Le serveur sera disponible sur `http://localhost:3000`.

## 🛠️ Maintenance & Evolution

### Ajouter un médicament
Il suffit d'ajouter une ligne dans la table `medicaments`. Le Dr. Martin l'apprendra automatiquement lors de la prochaine session grâce à l'injection dynamique du catalogue dans son prompt.

### Modifier le comportement du médecin
La logique de dialogue se trouve dans `n8n/workflow_chat.json` et le prompt système est généré dynamiquement dans `routes/chat.js`.

---
*Développé pour l'excellence opérationnelle des forces de vente pharmaceutiques.*
