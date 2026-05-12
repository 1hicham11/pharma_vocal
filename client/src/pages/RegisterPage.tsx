import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export function RegisterPage() {
    const navigate = useNavigate();
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError('');
        setLoading(true);
        const form = e.currentTarget;
        const payload = {
            nom: (form.querySelector('#nom') as HTMLInputElement)?.value,
            prenom: (form.querySelector('#prenom') as HTMLInputElement)?.value,
            email: (form.querySelector('#email') as HTMLInputElement)?.value,
            mot_de_passe: (form.querySelector('#password') as HTMLInputElement)?.value,
            entreprise: (form.querySelector('#entreprise') as HTMLInputElement)?.value,
            region: (form.querySelector('#region') as HTMLInputElement)?.value,
        };
        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (res.ok) {
                setSuccess(true);
                setTimeout(() => navigate('/login', { replace: true }), 1500);
            } else {
                setError(`❌ ${data.error || 'Erreur lors de la création'}`);
            }
        } catch {
            setError('❌ Serveur inaccessible');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="auth-page text-slate-900 antialiased selection:bg-emerald-500 selection:text-white">
            <video
                className="auth-bg-video"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                src="/FPV%20Drone%20Flight%20through%20Beautiful%20Iceland%20Canyon.mp4"
            />
            <div className="auth-bg-overlay" />
            <div className="auth-shell">
                <section className="auth-left">
                    <div className="auth-card auth-card--wide fade-in">
                        <div className="auth-brand">
                            <div className="auth-brand-badge">V</div>
                            <div className="min-w-0">
                                <h1 className="auth-title">Voxeleon</h1>
                                <p className="auth-subtitle">Créez votre compte et démarrez l’entraînement.</p>
                            </div>
                        </div>

                        <div className="auth-tabs" role="tablist" aria-label="Connexion ou inscription">
                            <Link className="auth-tab" to="/login" role="tab" aria-selected="false">
                                Connexion
                            </Link>
                            <Link className="auth-tab active" to="/register" role="tab" aria-selected="true">
                                Inscription
                            </Link>
                        </div>

                        <form id="registerForm" className="auth-form-stack" onSubmit={onSubmit}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="auth-field">
                                    <label className="auth-label" htmlFor="nom">
                                        Nom
                                    </label>
                                    <input className="auth-input" type="text" id="nom" placeholder="Ben Ali" required />
                                </div>
                                <div className="auth-field">
                                    <label className="auth-label" htmlFor="prenom">
                                        Prénom
                                    </label>
                                    <input className="auth-input" type="text" id="prenom" placeholder="Mohamed" required />
                                </div>
                            </div>

                            <div className="auth-field">
                                <label className="auth-label" htmlFor="email">
                                    Email professionnel
                                </label>
                                <input className="auth-input" type="email" id="email" placeholder="votre@email.com" required />
                            </div>

                            <div className="auth-field">
                                <label className="auth-label" htmlFor="password">
                                    Mot de passe
                                </label>
                                <input className="auth-input" type="password" id="password" placeholder="••••••••" required minLength={6} />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="auth-field">
                                    <label className="auth-label" htmlFor="entreprise">
                                        Entreprise
                                    </label>
                                    <input className="auth-input" type="text" id="entreprise" placeholder="Laprophan" />
                                </div>
                                <div className="auth-field">
                                    <label className="auth-label" htmlFor="region">
                                        Région
                                    </label>
                                    <input className="auth-input" type="text" id="region" placeholder="Casablanca" />
                                </div>
                            </div>

                            {error ? <p className="auth-error">{error}</p> : null}
                            {success ? <p className="auth-success">✅ Compte créé ! Redirection...</p> : null}

                            <button type="submit" disabled={loading} className="auth-primary-btn">
                                {loading ? <div className="spinner" /> : <span>Créer mon compte</span>}
                            </button>

                            <p className="auth-footnote">
                                Déjà un compte ? <Link to="/login">Se connecter</Link>
                            </p>
                        </form>
                    </div>
                </section>

            </div>
        </div>
    );
}
