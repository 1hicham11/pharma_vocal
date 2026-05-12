import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export function LoginPage() {
    const navigate = useNavigate();
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (localStorage.getItem('token')) navigate('/dashboard', { replace: true });
    }, [navigate]);

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError('');
        setLoading(true);
        const form = e.currentTarget;
        const emailVal = (form.querySelector('#email') as HTMLInputElement)?.value;
        const passwordVal = (form.querySelector('#password') as HTMLInputElement)?.value;
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: emailVal, mot_de_passe: passwordVal }),
            });
            const data = await res.json();
            if (data.token) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                navigate('/dashboard', { replace: true });
            } else {
                throw new Error(data.error || 'Erreur de connexion');
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Email ou mot de passe incorrect';
            setError(`❌ ${msg}`);
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
                    <div className="auth-card fade-in">
                        <div className="auth-brand">
                            <div className="auth-brand-badge">V</div>
                            <div className="min-w-0">
                                <h1 className="auth-title">Voxeleon</h1>
                                <p className="auth-subtitle">Connectez-vous à votre espace de formation vocale.</p>
                            </div>
                        </div>

                        <div className="auth-tabs" role="tablist" aria-label="Connexion ou inscription">
                            <Link className="auth-tab active" to="/login" role="tab" aria-selected="true">
                                Connexion
                            </Link>
                            <Link className="auth-tab" to="/register" role="tab" aria-selected="false">
                                Inscription
                            </Link>
                        </div>

                        <form id="loginForm" className="auth-form-stack" onSubmit={onSubmit}>
                            <div className="auth-field">
                                <label className="auth-label" htmlFor="email">
                                    Adresse email
                                </label>
                                <input className="auth-input" type="email" id="email" placeholder="votre@email.com" required />
                            </div>

                            <div className="auth-field">
                                <label className="auth-label" htmlFor="password">
                                    Mot de passe
                                </label>
                                <input className="auth-input" type="password" id="password" placeholder="••••••••" required />
                            </div>

                            <div className="auth-muted-row">
                                <span>
                                    Compte démo : <strong>med@pharma.com</strong>
                                </span>
                                <Link to="/contact" className="text-emerald-700 hover:text-emerald-800 font-semibold">
                                    Besoin d'aide ?
                                </Link>
                            </div>

                            {error ? <p className="auth-error">{error}</p> : null}

                            <button type="submit" disabled={loading} className="auth-primary-btn">
                                {loading ? <div className="spinner" /> : <span>Se connecter</span>}
                            </button>
                        </form>

                        <div className="auth-divider">ou</div>

                        <Link to="/register" className="auth-secondary-btn">
                            Créer un compte
                        </Link>

                        <p className="auth-footnote auth-footnote--after-form">
                            En continuant, vous acceptez nos conditions et notre politique de confidentialité.
                        </p>
                    </div>
                </section>

            </div>
        </div>
    );
}
