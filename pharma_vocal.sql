-- ==========================================================
-- SCRIPT DE CRÉATION DE LA BASE DE DONNÉES (MYSQL)
-- Projet : Plateforme Multi-Agents Vocale V2
-- ==========================================================

-- 1. IDENTITÉS & SÉCURITÉ
-- ----------------------------------------------------------

-- Table pour le Panel Admin
CREATE TABLE ADMINISTRATEURS (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Table pour les Utilisateurs (App Client)
-- Utilisation de VARCHAR(36) pour stocker les UUID générés par Node.js
CREATE TABLE UTILISATEURS (
    id VARCHAR(36) PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    date_inscription TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. CONFIGURATION DES AGENTS (MULTI-AGENTS)
-- ----------------------------------------------------------

CREATE TABLE AVATARS_ASSISTANTS (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nom_avatar VARCHAR(50) NOT NULL,
    image_url VARCHAR(255),
    vocal_id VARCHAR(50),             -- ID pour ElevenLabs/OpenAI
    prompt_systeme TEXT NOT NULL,      -- Instructions métier pour LangChain
    ragflow_dataset_id VARCHAR(100),  -- ID de connaissance dans RagFlow
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 3. CŒUR OPÉRATIONNEL : SESSIONS & MESSAGES
-- ----------------------------------------------------------

CREATE TABLE SESSIONS_ASSISTANCE (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    avatar_id INT NOT NULL,
    statut VARCHAR(20) DEFAULT 'active', -- active, terminee
    date_debut TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_session_user FOREIGN KEY (user_id) 
        REFERENCES UTILISATEURS(id) ON DELETE CASCADE,
    CONSTRAINT fk_session_avatar FOREIGN KEY (avatar_id) 
        REFERENCES AVATARS_ASSISTANTS(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE MESSAGES (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(36) NOT NULL,
    auteur ENUM('utilisateur', 'assistant') NOT NULL,
    transcription_texte TEXT NOT NULL,
    audio_url VARCHAR(255),            -- Lien vers le stockage S3/Cloud
    date_envoi TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_msg_session FOREIGN KEY (session_id) 
        REFERENCES SESSIONS_ASSISTANCE(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 4. INTELLIGENCE & ANALYTICS (POWER BI)
-- ----------------------------------------------------------

-- Table de traçabilité des recherches RAG
CREATE TABLE ACTIONS_RECHERCHE (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    message_id BIGINT NOT NULL,
    requete_rag TEXT,
    sources_utilisees JSON,           -- Stocke les chunks de documents PDF
    date_action TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_action_msg FOREIGN KEY (message_id) 
        REFERENCES MESSAGES(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Table de synthèse finale pour extraction Power BI
CREATE TABLE SYNTHESE_ASSISTANCE (
    id VARCHAR(36) PRIMARY KEY,
    session_id VARCHAR(36) UNIQUE NOT NULL,
    resume_intervention TEXT,
    succes_aide BOOLEAN DEFAULT TRUE,
    donnees_metier_json JSON,         -- KPIs extraits par l'IA (format structuré)
    date_synthese TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_synthese_session FOREIGN KEY (session_id) 
        REFERENCES SESSIONS_ASSISTANCE(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 5. IMPORT EXCEL & DONNÉES DYNAMIQUES
-- ----------------------------------------------------------

-- Table pour enregistrer les schémas des fichiers Excel importés
CREATE TABLE excel_schemas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    avatar_id INT NOT NULL,
    table_name VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255),
    schema_json JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_excel_avatar FOREIGN KEY (avatar_id) 
        REFERENCES AVATARS_ASSISTANTS(id) ON DELETE CASCADE,
    INDEX idx_avatar_table (avatar_id, table_name),
    INDEX idx_created (created_at)
) ENGINE=InnoDB;