import { Navigate, Route, Routes } from 'react-router-dom';
import { LegacyHtmlFrame } from './components/LegacyHtmlFrame';
import { RedirectPreserveQuery } from './components/RedirectPreserveQuery';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';

export default function App() {
    return (
        <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            <Route path="/dashboard" element={<LegacyHtmlFrame file="dashboard.html" title="Tableau de bord" />} />
            <Route path="/session" element={<LegacyHtmlFrame file="session.html" title="Session" />} />
            <Route path="/meeting-translate" element={<LegacyHtmlFrame file="meeting-translate.html" title="Réunion multilingue" />} />
            <Route path="/create-agent" element={<LegacyHtmlFrame file="create-agent.html" title="Créer un agent" />} />
            <Route path="/personalize" element={<LegacyHtmlFrame file="personalize.html" title="Personnaliser" />} />
            <Route path="/agent-knowledge" element={<LegacyHtmlFrame file="agent-knowledge.html" title="Connaissances" />} />
            <Route path="/settings" element={<LegacyHtmlFrame file="settings.html" title="Paramètres" />} />
            <Route path="/all-sessions" element={<LegacyHtmlFrame file="all-sessions.html" title="Sessions" />} />
            <Route path="/mascot-sprite-demo" element={<LegacyHtmlFrame file="mascot-sprite-demo.html" title="Sprite" />} />
            <Route path="/rag-base" element={<LegacyHtmlFrame file="rag-base.html" title="RAG" />} />
            <Route path="/experts" element={<LegacyHtmlFrame file="experts.html" title="Experts" />} />
            <Route path="/help" element={<LegacyHtmlFrame file="help.html" title="Aide" />} />
            <Route path="/solutions" element={<LegacyHtmlFrame file="solutions.html" title="Solutions" />} />
            <Route path="/fonctionnalites" element={<LegacyHtmlFrame file="fonctionnalites.html" title="Fonctionnalités" />} />
            <Route path="/contact" element={<LegacyHtmlFrame file="contact.html" title="Contact" />} />
            <Route path="/admin-board" element={<LegacyHtmlFrame file="admin.html" title="Administration" />} />

            {/* Chemins .html (navigation client) → routes SPA, query conservée */}
            <Route path="/dashboard.html" element={<RedirectPreserveQuery to="/dashboard" />} />
            <Route path="/session.html" element={<RedirectPreserveQuery to="/session" />} />
            <Route path="/meeting-translate.html" element={<RedirectPreserveQuery to="/meeting-translate" />} />
            <Route path="/create-agent.html" element={<RedirectPreserveQuery to="/create-agent" />} />
            <Route path="/personalize.html" element={<RedirectPreserveQuery to="/personalize" />} />
            <Route path="/agent-knowledge.html" element={<RedirectPreserveQuery to="/agent-knowledge" />} />
            <Route path="/settings.html" element={<RedirectPreserveQuery to="/settings" />} />
            <Route path="/all-sessions.html" element={<RedirectPreserveQuery to="/all-sessions" />} />
            <Route path="/login.html" element={<RedirectPreserveQuery to="/login" />} />
            <Route path="/register.html" element={<RedirectPreserveQuery to="/register" />} />
            <Route path="/solutions.html" element={<RedirectPreserveQuery to="/solutions" />} />
            <Route path="/fonctionnalites.html" element={<RedirectPreserveQuery to="/fonctionnalites" />} />
            <Route path="/contact.html" element={<RedirectPreserveQuery to="/contact" />} />
            <Route path="/admin.html" element={<RedirectPreserveQuery to="/admin-board" />} />
            <Route path="/index.html" element={<Navigate to="/" replace />} />

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}
