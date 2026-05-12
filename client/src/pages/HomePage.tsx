import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

type AvatarExpert = {
    id: number;
    nom_avatar: string;
    icone?: string | null;
    image_url?: string | null;
    use_rag?: number | boolean;
    use_knowledge?: number | boolean;
};

type IconProps = {
    className?: string;
};

function PlusIcon({ className = 'w-4 h-4' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
        </svg>
    );
}

function PowerIcon({ className = 'w-4 h-4' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2v10" />
            <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
        </svg>
    );
}

function TrashIcon({ className = 'w-4 h-4' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 7h16" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
            <path d="M6 7l1 14h10l1-14" />
            <path d="M9 7V4h6v3" />
        </svg>
    );
}

function ArrowRightIcon({ className = 'w-3 h-3' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14" />
            <path d="m13 6 6 6-6 6" />
        </svg>
    );
}

function BoltIcon({ className = 'w-4 h-4' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
        </svg>
    );
}

function CloseIcon({ className = 'w-4 h-4' }: IconProps) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12" />
            <path d="M18 6 6 18" />
        </svg>
    );
}

export function HomePage() {
    const navigate = useNavigate();
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const isGuest = !token;

    const [statSessions, setStatSessions] = useState(() => (isGuest ? '—' : '0'));
    const [statScore, setStatScore] = useState(() => (isGuest ? '—' : '0%'));
    /** null = chargement (utilisateur connecté), [] = invité ou liste vide */
    const [experts, setExperts] = useState<AvatarExpert[] | null>(() => (isGuest ? [] : null));
    const [modalOpen, setModalOpen] = useState(false);
    const [currentStep, setCurrentStep] = useState(1);
    const [expName, setExpName] = useState('');
    const [expEmoji, setExpEmoji] = useState('');
    const [expPrompt, setExpPrompt] = useState('');
    const [expRag, setExpRag] = useState(true);
    const [expKnowledge, setExpKnowledge] = useState(false);

    const loadDashboard = useCallback(async () => {
        const t = localStorage.getItem('token');
        if (!t) return;
        try {
            const statsRes = await fetch('/api/dashboard/stats', { headers: { Authorization: `Bearer ${t}` } });
            const stats = await statsRes.json();
            setStatSessions(String(stats.totalSessions ?? 0));
            setStatScore(stats.averageScore != null ? `${stats.averageScore}` : '0%');

            const expertsRes = await fetch('/api/admin/avatars', { headers: { Authorization: `Bearer ${t}` } });
            const list = await expertsRes.json();
            setExperts(Array.isArray(list) ? list : []);
        } catch (e) {
            console.error(e);
        }
    }, []);

    useEffect(() => {
        if (!token) {
            setExperts([]);
            setStatSessions('—');
            setStatScore('—');
            return;
        }
        loadDashboard();
    }, [token, loadDashboard]);

    function logout() {
        localStorage.clear();
        navigate('/login', { replace: true });
    }

    function openExpertModal() {
        if (!localStorage.getItem('token')) {
            navigate('/login');
            return;
        }
        setCurrentStep(1);
        setModalOpen(true);
    }

    function closeExpertModal() {
        setModalOpen(false);
    }

    function nextStep() {
        if (currentStep < 4) {
            setCurrentStep((s) => s + 1);
        } else {
            saveNewExpert();
        }
    }

    function prevStep() {
        if (currentStep > 1) setCurrentStep((s) => s - 1);
    }

    async function saveNewExpert() {
        const t = localStorage.getItem('token');
        if (!t) return;
        const payload = {
            nom_avatar: expName,
            icone: expEmoji || '🤖',
            prompt_systeme: expPrompt,
            use_rag: expRag ? 1 : 0,
            use_knowledge: expKnowledge ? 1 : 0,
        };
        const res = await fetch('/api/admin/avatars', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
            body: JSON.stringify(payload),
        });
        if (res.ok) {
            closeExpertModal();
            loadDashboard();
        }
    }

    async function deleteExpert(id: number) {
        if (!confirm('Supprimer définitivement cet expert ?')) return;
        const t = localStorage.getItem('token');
        if (!t) return;
        await fetch(`/api/admin/avatars/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } });
        loadDashboard();
    }

    return (
        <div className="vox-home-page bg-gray-50 text-slate-900 antialiased selection:bg-emerald-500 selection:text-white min-h-screen">
            <nav className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between relative z-50">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center text-white font-bold text-sm">L</div>
                    <span className="font-bold text-lg tracking-tight text-emerald-950">Voxeleon</span>
                </div>
                <div className="hidden md:flex items-center gap-5 lg:gap-8 text-sm font-medium text-slate-600">
                    <span className="text-emerald-950 font-bold bg-green-50 px-3 py-1 rounded-full border border-green-100">
                        Mon Dashboard Personnel
                    </span>
                    <Link to="/solutions" className="hover:text-emerald-950 transition-colors">
                        Solutions
                    </Link>
                    <Link to="/fonctionnalites" className="hover:text-emerald-950 transition-colors">
                        Fonctionnalités
                    </Link>
                    <Link to="/contact" className="hover:text-emerald-950 transition-colors">
                        Contact
                    </Link>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        id="themeToggleBtn"
                        type="button"
                        className="theme-toggle-btn flex items-center justify-center"
                        aria-label="Basculer le theme"
                        title="Basculer le theme"
                    >
                        <span id="themeToggleIcon" />
                    </button>
                    {isGuest ? (
                        <>
                            <Link
                                to="/login"
                                className="text-sm font-semibold text-slate-600 hover:text-emerald-950 transition-colors"
                            >
                                Se connecter
                            </Link>
                            <Link
                                to="/register"
                                className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-5 py-2.5 rounded-full shadow-sm transition-colors"
                            >
                                Créer un compte
                            </Link>
                        </>
                    ) : (
                        <button
                            type="button"
                            onClick={logout}
                            className="bg-white border border-slate-200 hover:bg-red-50 text-slate-400 hover:text-red-500 p-2.5 rounded-full transition-all shadow-sm"
                            title="Déconnexion"
                        >
                            <PowerIcon />
                        </button>
                    )}
                </div>
            </nav>

            <section className="vox-home-hero relative pt-12 pb-16 text-center overflow-hidden">
                <div className="vox-hero-grid absolute inset-0 bg-grid z-0 opacity-40" />
                <div className="vox-hero-fade absolute inset-0 bg-gradient-to-t from-gray-50 to-transparent z-0" />

                <div className="max-w-4xl mx-auto px-6 relative z-10">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-50 text-green-700 text-xs font-semibold mb-8 border border-green-100/50 shadow-sm">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        Espace Créateur Personnel
                    </div>

                    <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-emerald-950 mb-6 leading-tight">
                        Gérez vos <br className="hidden md:block" />
                        <span className="text-green-600">Experts IA Vocaux</span>
                    </h1>

                    <p className="text-lg text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
                        Créez, configurez et testez vos agents intelligents. <br />
                        Basculez entre le mode documentaire (RAG) et la connaissance générale.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <button
                            type="button"
                            onClick={openExpertModal}
                            className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-8 py-3.5 rounded-full font-bold shadow-lg shadow-green-600/30 transition-all hover:-translate-y-1 flex items-center justify-center gap-2"
                        >
                            <PlusIcon />
                            {isGuest ? 'Créer un expert (connexion requise)' : 'Créer un nouvel expert'}
                        </button>
                        {isGuest && (
                            <Link
                                to="/login"
                                className="vox-secondary-cta w-full sm:w-auto border-2 border-emerald-950/15 text-emerald-950 px-8 py-3.5 rounded-full font-bold hover:bg-emerald-950/5 transition-colors text-center"
                            >
                                J&apos;ai déjà un compte
                            </Link>
                        )}
                    </div>
                </div>
            </section>

            <section className="max-w-4xl mx-auto px-6 pb-14 relative z-10">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Link
                        to="/fonctionnalites"
                        className="group bg-white border border-slate-100 rounded-3xl p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all"
                    >
                        <div className="w-11 h-11 rounded-2xl bg-green-50 text-green-700 flex items-center justify-center text-xl mb-4">
                            ✨
                        </div>
                        <h2 className="text-lg font-bold text-emerald-950 mb-2">Fonctionnalités</h2>
                        <p className="text-sm text-slate-600 leading-relaxed mb-4">
                            Découvrez le RAG, la voix, les mascottes et les outils de pilotage de vos experts IA.
                        </p>
                        <span className="inline-flex items-center gap-2 text-sm font-bold text-green-700 group-hover:text-green-800">
                            Voir les fonctionnalités <ArrowRightIcon />
                        </span>
                    </Link>
                    <Link
                        to="/contact"
                        className="group bg-white border border-slate-100 rounded-3xl p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all"
                    >
                        <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center text-xl mb-4">
                            💬
                        </div>
                        <h2 className="text-lg font-bold text-emerald-950 mb-2">Contact</h2>
                        <p className="text-sm text-slate-600 leading-relaxed mb-4">
                            Besoin d’aide, d’une démo ou d’un accompagnement pour configurer vos agents ?
                        </p>
                        <span className="inline-flex items-center gap-2 text-sm font-bold text-green-700 group-hover:text-green-800">
                            Nous contacter <ArrowRightIcon />
                        </span>
                    </Link>
                </div>
            </section>

            <section className="max-w-5xl mx-auto px-6 pb-20 border-b border-slate-200/60 relative z-10 text-center">
                <p className="text-sm font-semibold text-slate-400 mb-6 uppercase tracking-wider">
                    Propulsé par les meilleures technologies
                </p>
                <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-60 grayscale hover:grayscale-0 transition duration-500">
                    <span className="font-bold text-xl text-slate-800 flex items-center gap-2">Llama 3</span>
                    <span className="font-bold text-xl text-slate-800 flex items-center gap-2">Whisper</span>
                    <span className="font-bold text-xl text-slate-800 flex items-center gap-2">EdgeTTS</span>
                    <span className="font-bold text-xl text-green-700 flex items-center gap-2">Node.js</span>
                    <span className="font-bold text-xl text-blue-700 flex items-center gap-2">MySQL</span>
                </div>
            </section>

            <section className="max-w-6xl mx-auto px-6 py-20 relative z-10">
                <div className="flex justify-between items-end mb-10">
                    <div>
                        <h2 className="text-3xl font-bold text-emerald-950">Mes Simulateurs</h2>
                        <p className="text-slate-500">Agents rattachés à votre compte personnel.</p>
                    </div>
                    <div className="hidden md:flex gap-6">
                        <div className="text-center">
                            <div className="text-2xl font-bold text-emerald-950">{statSessions}</div>
                            <div className="text-[10px] uppercase font-bold text-slate-400">Sessions</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-emerald-950">{statScore}</div>
                            <div className="text-[10px] uppercase font-bold text-slate-400">Succès</div>
                        </div>
                    </div>
                </div>

                <div id="experts-container" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {experts === null ? (
                        <div className="col-span-full py-20 text-center bg-white rounded-[40px] border-2 border-dashed border-slate-200">
                            <div className="spinner mx-auto mb-4" />
                            <p className="text-slate-400">Synchronisation de vos agents...</p>
                        </div>
                    ) : isGuest ? (
                        <div className="col-span-full py-16 px-8 text-center bg-white rounded-[40px] border border-slate-100 shadow-sm">
                            <div className="max-w-md mx-auto">
                                <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-green-50 flex items-center justify-center text-3xl border border-green-100">
                                    🔐
                                </div>
                                <h3 className="text-xl font-bold text-emerald-950 mb-2">Vos simulateurs ici</h3>
                                <p className="text-slate-600 mb-8 text-sm leading-relaxed">
                                    Connectez-vous pour voir et lancer vos experts IA vocaux, ou créez un compte pour
                                    commencer l&apos;entraînement.
                                </p>
                                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                    <Link
                                        to="/login"
                                        className="inline-flex justify-center bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-full font-bold text-sm transition-colors"
                                    >
                                        Se connecter
                                    </Link>
                                    <Link
                                        to="/register"
                                        className="inline-flex justify-center border border-slate-200 text-emerald-950 px-6 py-3 rounded-full font-bold text-sm hover:bg-slate-50 transition-colors"
                                    >
                                        Créer un compte
                                    </Link>
                                </div>
                            </div>
                        </div>
                    ) : experts.length === 0 ? (
                        <div className="col-span-full py-20 text-center bg-white rounded-[40px] border-2 border-dashed border-slate-200">
                            <p className="text-slate-400">Vous n&apos;avez aucun agent. Créez-en un pour commencer !</p>
                        </div>
                    ) : (
                        experts.map((exp) => {
                            const ragOn = Boolean(exp.use_rag);
                            const knowOn = Boolean(exp.use_knowledge);
                            return (
                                <div
                                    key={exp.id}
                                    className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                                >
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center shadow-inner overflow-hidden border border-slate-100">
                                            {exp.image_url ? (
                                                <img src={exp.image_url} alt={exp.nom_avatar} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="text-3xl">{exp.icone || '🤖'}</div>
                                            )}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-emerald-950 text-lg">{exp.nom_avatar}</h3>
                                            <span className="text-[10px] bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full uppercase font-bold">
                                                Privé
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 mb-6">
                                        <span
                                            className={`text-[9px] font-bold px-2 py-1 rounded-md ${
                                                ragOn ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'
                                            }`}
                                        >
                                            RAG: {ragOn ? 'ON' : 'OFF'}
                                        </span>
                                        <span
                                            className={`text-[9px] font-bold px-2 py-1 rounded-md ${
                                                knowOn ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'
                                            }`}
                                        >
                                            LIBRE: {knowOn ? 'ON' : 'OFF'}
                                        </span>
                                    </div>
                                    <div className="flex gap-3">
                                        <button
                                            type="button"
                                            onClick={() => navigate(`/session?avatar_id=${exp.id}`)}
                                            className="flex-1 bg-emerald-950 text-white py-3.5 rounded-2xl font-bold text-sm hover:bg-emerald-900 transition-colors shadow-lg shadow-emerald-950/10"
                                        >
                                            Simuler
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => deleteExpert(exp.id)}
                                            className="px-4 bg-slate-50 text-slate-300 rounded-2xl hover:text-red-500 hover:bg-red-50 transition-colors border border-slate-100"
                                        >
                                            <TrashIcon />
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </section>

            <section className="max-w-6xl mx-auto px-6 py-24 relative z-10">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-emerald-950 mb-4">
                        Fonctionnalités avancées
                        <br /> pour assurer tout ce dont vous avez besoin
                    </h2>
                    <p className="text-slate-600 max-w-2xl mx-auto">
                        Maximisez la productivité de vos équipes avec notre suite d&apos;outils analytiques et
                        d&apos;intelligence artificielle.
                    </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="md:col-span-2 lg:col-span-3 bg-white p-8 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 flex flex-col md:flex-row items-center gap-8 group hover:-translate-y-1 transition-transform duration-300">
                        <div className="flex-1">
                            <h3 className="text-2xl font-bold text-emerald-950 mb-3">Tableau de bord analytique</h3>
                            <p className="text-slate-600 mb-6 text-sm leading-relaxed">
                                Analysez les performances des délégués pharmaceutiques, visualisez les scores en temps réel
                                et identifiez les opportunités d&apos;amélioration pour chaque argumentaire.
                            </p>
                            <span className="inline-flex items-center gap-2 bg-emerald-950 hover:bg-emerald-900 text-white px-5 py-2.5 rounded-full text-sm font-medium transition-colors">
                                Explorer <ArrowRightIcon />
                            </span>
                        </div>
                        <div className="flex-1 w-full bg-slate-50 rounded-2xl p-6 border border-slate-100">
                            <div className="flex items-center justify-between mb-6">
                                <span className="text-xs font-bold text-slate-500 uppercase">Scores par Session</span>
                            </div>
                            <div className="flex items-end justify-between gap-2 h-32 pl-2 border-l border-b border-slate-200 pb-1">
                                <div className="w-full bg-slate-200 rounded-t-sm h-12 group-hover:bg-slate-300 transition-colors" />
                                <div className="w-full bg-slate-200 rounded-t-sm h-20 group-hover:bg-slate-300 transition-colors" />
                                <div className="w-full bg-green-600 rounded-t-sm h-24 shadow-[0_0_15px_rgba(22,163,74,0.4)] relative">
                                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-0.5 rounded">
                                        95%
                                    </div>
                                </div>
                                <div className="w-full bg-slate-200 rounded-t-sm h-16 group-hover:bg-slate-300 transition-colors" />
                            </div>
                        </div>
                    </div>

                    <div className="md:col-span-1 lg:col-span-2 bg-white p-8 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 hover:-translate-y-1 transition-transform duration-300">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-xl font-bold text-emerald-950 mb-2">Évaluation en temps réel</h3>
                                <p className="text-slate-600 text-sm">Transcription instantanée et analyse conversationnelle.</p>
                            </div>
                            <span className="bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full">Live</span>
                        </div>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                                <div className="flex items-center gap-3">
                                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                                    <span className="text-sm font-medium text-slate-700">Détection : Paraphan</span>
                                </div>
                                <div className="w-8 h-4 bg-green-600 rounded-full relative">
                                    <div className="absolute right-0.5 top-0.5 w-3 h-3 bg-white rounded-full" />
                                </div>
                            </div>
                            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 opacity-60">
                                <div className="flex items-center gap-3">
                                    <div className="w-2 h-2 bg-slate-300 rounded-full" />
                                    <span className="text-sm font-medium text-slate-700">Effets secondaires</span>
                                </div>
                                <div className="w-8 h-4 bg-slate-300 rounded-full relative">
                                    <div className="absolute left-0.5 top-0.5 w-3 h-3 bg-white rounded-full" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="col-span-1 lg:col-span-1 bg-white p-8 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 hover:-translate-y-1 transition-transform duration-300">
                        <h3 className="text-xl font-bold text-emerald-950 mb-2">Base de données RAG</h3>
                        <p className="text-slate-600 text-sm mb-6">
                            Connaissance illimitée via l&apos;intégration de votre catalogue produits.
                        </p>
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                            <div className="flex items-start gap-3 mb-4">
                                <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-xs">📝</div>
                                <div>
                                    <p className="text-sm font-bold text-slate-800">Doc. Médical A</p>
                                    <p className="text-xs text-slate-500">Analysé ✅</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3 opacity-60">
                                <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-xs">💊</div>
                                <div>
                                    <p className="text-sm font-bold text-slate-800">Paraphan 500mg</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="bg-emerald-950 text-white rounded-[40px] max-w-6xl mx-auto px-6 py-24 my-10 relative overflow-hidden text-center shadow-2xl">
                <div className="absolute inset-0 opacity-10 bg-grid" />
                <div className="relative z-10 max-w-3xl mx-auto">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-emerald-100 text-xs font-semibold mb-6 border border-white/20">
                        <BoltIcon /> Intégration
                    </div>
                    <h2 className="text-4xl font-bold mb-4">N&apos;inventez rien. Intégrez votre catalogue.</h2>
                    <p className="text-emerald-100/80 mb-12 text-lg">
                        Nous comprenons l&apos;importance de la conformité médicale. L&apos;IA se base uniquement sur les
                        documents et produits que vous intégrez, garantissant ainsi l&apos;exactitude des arguments.
                    </p>
                    <div className="flex flex-wrap justify-center gap-4">
                        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-lg hover:scale-110 transition-transform">
                            <span className="text-3xl">💊</span>
                        </div>
                        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-lg hover:scale-110 transition-transform">
                            <span className="text-3xl">📄</span>
                        </div>
                        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-lg hover:scale-110 transition-transform">
                            <span className="text-3xl">🗄️</span>
                        </div>
                        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-lg hover:scale-110 transition-transform">
                            <span className="text-3xl">🔬</span>
                        </div>
                    </div>
                </div>
            </section>

            <section className="max-w-4xl mx-auto px-6 py-24 text-center">
                <div className="mb-12 relative">
                    <span className="text-green-600 text-6xl font-serif absolute -top-8 left-1/2 -translate-x-1/2 opacity-20">
                        &quot;
                    </span>
                    <p className="text-2xl md:text-3xl font-medium text-emerald-950 leading-relaxed italic z-10 relative">
                        &quot;Voxeleon aide nos équipes à diminuer le stress avant les visites médicales, tout en augmentant la
                        maîtrise de notre catalogue.&quot;
                    </p>
                    <div className="mt-8 flex flex-col items-center">
                        <div className="flex items-center justify-center w-12 h-12 bg-blue-100 rounded-full mb-3 text-xl">👤</div>
                        <h4 className="font-bold text-slate-800">Direction de Formation</h4>
                        <p className="text-sm text-slate-500">Laprophan</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                        <div className="text-4xl font-extrabold text-emerald-950 mb-2">24h/24</div>
                        <div className="text-sm text-slate-600 font-medium">Disponibilité</div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                        <div className="text-4xl font-extrabold text-emerald-950 mb-2">100%</div>
                        <div className="text-sm text-slate-600 font-medium">Catalogue intégré</div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                        <div className="text-4xl font-extrabold text-emerald-950 mb-2">&lt; 1s</div>
                        <div className="text-sm text-slate-600 font-medium">Latence vocale</div>
                    </div>
                </div>
            </section>

            <footer className="bg-emerald-950 text-white rounded-t-[40px] px-6 pt-24 pb-12 mt-10">
                <div className="max-w-5xl mx-auto">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16 text-sm text-emerald-100/70">
                        <div>
                            <div className="flex items-center gap-2 mb-6">
                                <div className="w-6 h-6 rounded bg-green-500 flex items-center justify-center text-emerald-950 font-bold text-[10px]">
                                    L
                                </div>
                                <span className="font-bold text-white text-lg">Laprophan</span>
                            </div>
                            <p className="mb-2">📞 +212 500 000 000</p>
                            <p>✉️ contact@laprophan.com</p>
                        </div>
                        <div>
                            <h4 className="font-bold text-white mb-4">Solutions</h4>
                            <ul className="space-y-3">
                                <li>Délégués</li>
                                <li>Managers</li>
                                <li>Analyses</li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-bold text-white mb-4">Ressources</h4>
                            <ul className="space-y-3">
                                <li>Blog</li>
                                <li>Tutoriels</li>
                                <li>Support</li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-bold text-white mb-4">Légal</h4>
                            <ul className="space-y-3">
                                <li>Confidentialité</li>
                                <li>CGU</li>
                            </ul>
                        </div>
                    </div>
                    <div className="flex flex-col md:flex-row justify-between items-center text-xs text-emerald-100/50 pt-8 border-t border-emerald-900/50">
                        <p>&copy; 2026 Laprophan. Tous droits réservés.</p>
                        <div className="flex gap-4 mt-4 md:mt-0">
                            <a href="#" className="hover:text-white">
                                Twitter
                            </a>
                            <a href="#" className="hover:text-white">
                                LinkedIn
                            </a>
                        </div>
                    </div>
                </div>
            </footer>

            <div
                id="expert-modal"
                className={`modal fixed inset-0 z-[100] bg-emerald-950/40 backdrop-blur-sm items-center justify-center p-4 ${modalOpen ? 'active' : ''}`}
            >
                <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden">
                    <div className="bg-slate-50 px-8 py-6 border-b border-slate-100 flex justify-between items-center">
                        <div className="flex gap-2">
                            {[1, 2, 3, 4].map((i) => (
                                <div
                                    key={i}
                                    className={`w-2 h-2 rounded-full ${i <= currentStep ? 'bg-green-500' : 'bg-slate-200'}`}
                                />
                            ))}
                        </div>
                        <span className="text-xs font-bold uppercase text-slate-400 tracking-widest">
                            Étape {currentStep} sur 4
                        </span>
                        <button type="button" onClick={closeExpertModal} className="text-slate-400 hover:text-slate-600">
                            <CloseIcon />
                        </button>
                    </div>

                    <div className="p-10">
                        {currentStep === 1 && (
                            <div className="step-content active">
                                <h2 className="text-2xl font-bold text-emerald-950 mb-2">Identité de l&apos;expert</h2>
                                <p className="text-slate-500 mb-8 text-sm">Comment s&apos;appelle votre agent et quel emoji le représente ?</p>
                                <div className="space-y-6">
                                    <input
                                        type="text"
                                        value={expName}
                                        onChange={(e) => setExpName(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-green-500"
                                        placeholder="Ex: Dr. Martin"
                                    />
                                    <input
                                        type="text"
                                        value={expEmoji}
                                        onChange={(e) => setExpEmoji(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-green-500"
                                        placeholder="Ex: 👨‍⚕️"
                                    />
                                </div>
                            </div>
                        )}
                        {currentStep === 2 && (
                            <div>
                                <h2 className="text-2xl font-bold text-emerald-950 mb-2">Définition du Rôle</h2>
                                <p className="text-slate-500 mb-8 text-sm">Décrivez sa personnalité et sa mission (Prompt Système).</p>
                                <textarea
                                    value={expPrompt}
                                    onChange={(e) => setExpPrompt(e.target.value)}
                                    className="w-full h-40 px-4 py-3 rounded-xl border border-slate-200 outline-none resize-none focus:ring-2 focus:ring-green-500"
                                    placeholder="Tu es un expert en..."
                                />
                            </div>
                        )}
                        {currentStep === 3 && (
                            <div>
                                <h2 className="text-2xl font-bold text-emerald-950 mb-2">Sources de Savoir</h2>
                                <p className="text-slate-500 mb-8 text-sm">Configurez l&apos;accès à l&apos;intelligence de l&apos;agent.</p>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between p-5 rounded-2xl bg-slate-50 border border-slate-100">
                                        <div>
                                            <div className="font-bold text-emerald-950">Base Documentaire (RAG)</div>
                                            <div className="text-xs text-slate-500">Réponses basées sur vos PDFs.</div>
                                        </div>
                                        <label className="switch">
                                            <input type="checkbox" checked={expRag} onChange={(e) => setExpRag(e.target.checked)} />
                                            <span className="slider" />
                                        </label>
                                    </div>
                                    <div className="flex items-center justify-between p-5 rounded-2xl bg-slate-50 border border-slate-100">
                                        <div>
                                            <div className="font-bold text-emerald-950">Connaissance Générale</div>
                                            <div className="text-xs text-slate-500">Réponses libres via le cerveau de l&apos;IA.</div>
                                        </div>
                                        <label className="switch">
                                            <input
                                                type="checkbox"
                                                checked={expKnowledge}
                                                onChange={(e) => setExpKnowledge(e.target.checked)}
                                            />
                                            <span className="slider" />
                                        </label>
                                    </div>
                                </div>
                            </div>
                        )}
                        {currentStep === 4 && (
                            <div>
                                <h2 className="text-2xl font-bold text-emerald-950 mb-2">Prêt pour le lancement ?</h2>
                                <div
                                    id="summary-view"
                                    className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100 text-sm text-emerald-900 space-y-2 mt-4"
                                >
                                    <p>
                                        <strong>Nom :</strong> {expName}
                                    </p>
                                    <p>
                                        <strong>RAG :</strong> {expRag ? '✅ Activé' : '❌ Désactivé'}
                                    </p>
                                    <p>
                                        <strong>Savoir Global :</strong> {expKnowledge ? '✅ Activé' : '❌ Désactivé'}
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-between mt-10">
                            <button
                                type="button"
                                onClick={prevStep}
                                className={`px-6 py-3 text-slate-400 font-bold hover:text-emerald-950 transition-colors ${
                                    currentStep === 1 ? 'invisible' : ''
                                }`}
                            >
                                Retour
                            </button>
                            <button
                                type="button"
                                onClick={nextStep}
                                className="bg-emerald-950 text-white px-8 py-3 rounded-full font-bold hover:bg-emerald-900 transition-all"
                            >
                                {currentStep === 4 ? "Créer l'expert" : 'Continuer'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
