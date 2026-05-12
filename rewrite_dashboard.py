#!/usr/bin/env python
# -*- coding: utf-8 -*-
from pathlib import Path

path = Path('public/dashboard.html')
text = path.read_text(encoding='utf-8')
start = text.index('<body')
script_start = text.index('<script>', start)
script_end = text.index('</script>', script_start) + len('</script>')
pre_body = text[:start]
post_script = text[script_end:]
script_block = text[script_start:script_end]

new_layout = """<body class=\"bg-[#edf3fb] text-slate-900 antialiased min-h-screen selection:bg-emerald-500 selection:text-white\">
    <div class=\"min-h-screen flex\">
        <aside class=\"w-72 bg-white/95 border-r border-white/80 shadow-[0_20px_60px_rgba(15,23,42,0.12)] flex flex-col\">
            <div class=\"px-6 py-6 border-b border-slate-100\">
                <div class=\"flex items-center gap-3\">
                    <div class=\"w-12 h-12 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white text-xl font-bold shadow-lg\">PV</div>
                    <div>
                        <p class=\"text-xs uppercase tracking-[0.35em] text-slate-400\">Donezo</p>
                        <p class=\"text-sm font-semibold text-slate-900\">Espace admin</p>
                    </div>
                </div>
                <p class=\"mt-3 text-xs text-slate-500\">Suivez vos KPIs, experts et documents.</p>
            </div>
            <div class=\"flex-1 px-6 py-6 space-y-6 overflow-y-auto\">
                <div>
                    <p class=\"text-[0.65rem] uppercase tracking-[0.5em] font-semibold text-slate-400 mb-3\">Navigation</p>
                    <div class=\"space-y-3\">
                        <button class=\"flex items-center gap-3 w-full rounded-2xl px-4 py-3 bg-slate-100 text-sm font-semibold text-emerald-700 shadow-inner shadow-slate-100\">
                            <span class=\"text-base\">📊</span>
                            Vue d\'ensemble
                        </button>
                        <button class=\"flex items-center gap-3 w-full rounded-2xl px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition\">
                            <span class=\"text-base\">📦</span>
                            Produits &amp; Services
                        </button>
                        <button class=\"flex items-center gap-3 w-full rounded-2xl px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition\">
                            <span class=\"text-base\">🗓️</span>
                            Toutes les Sessions
                        </button>
                        <button class=\"flex items-center gap-3 w-full rounded-2xl px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition\">
                            <span class=\"text-base\">❓</span>
                            Meds Inconnus
                        </button>
                        <button class=\"flex items-center gap-3 w-full rounded-2xl px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition\">
                            <span class=\"text-base\">🧑‍💼</span>
                            Experts (Personas)
                        </button>
                        <button class=\"flex items-center gap-3 w-full rounded-2xl px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition\">
                            <span class=\"text-base\">📁</span>
                            Base RAG
                        </button>
                    </div>
                </div>
                <div>
                    <p class=\"text-[0.65rem] uppercase tracking-[0.5em] font-semibold text-slate-400 mb-3\">Général</p>
                    <div class=\"space-y-2 text-sm text-slate-500\">
                        <button class=\"w-full text-left text-slate-500 hover:text-slate-900 hover:font-semibold transition\">Paramètres</button>
                        <button class=\"w-full text-left text-slate-500 hover:text-slate-900 hover:font-semibold transition\">Aide</button>
                    </div>
                </div>
            </div>
            <div class=\"px-6 py-4 border-t border-slate-100\">
                <button onclick=\"openAvatarModal()\" class=\"w-full rounded-2xl px-4 py-3 bg-emerald-600 text-white font-semibold shadow-lg shadow-emerald-500/30\">
                    + Ajouter un agent
                </button>
            </div>
        </aside>
        <div class=\"flex-1 flex flex-col\">
            <header class=\"px-6 lg:px-10 py-6 flex flex-col gap-4\">
                <div class=\"flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4\">
                    <div>
                        <p class=\"text-[0.65rem] uppercase tracking-[0.5em] font-semibold text-slate-500\">Administration</p>
                        <h1 class=\"text-2xl lg:text-3xl font-bold text-slate-900\">Tableau de bord administrateur</h1>
                        <p class=\"text-sm text-slate-500\">Les principaux KPIs et activités sont centralisés ici.</p>
                    </div>
                    <div class=\"flex items-center gap-3\">
                        <div id=\"adminLink\" style=\"display:none\" class=\"text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition\">Panel Admin</div>
                        <div class=\"flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-2xl shadow-sm\">
                            <div id=\"avatarInitials\" class=\"w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm shadow-inner\">?</div>
                            <div id=\"userName\" class=\"text-sm text-slate-700 font-medium\">Chargement...</div>
                        </div>
                        <button onclick=\"logout()\" class=\"text-sm text-slate-500 hover:text-red-500 transition\">Déconnexion</button>
                    </div>
                </div>
            </header>
            <main class=\"flex-1 overflow-y-auto px-6 lg:px-10 pb-10 space-y-6\">
                <section class=\"bg-white border border-slate-100 rounded-[2rem] p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)] space-y-6\">
                    <div class=\"flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4\">
                        <div>
                            <p class=\"text-[0.6rem] uppercase tracking-[0.5em] text-slate-400\">Statuts</p>
                            <h2 class=\"text-xl font-bold text-slate-900\">Vue d\'ensemble</h2>
                        </div>
                        <div class=\"flex flex-col sm:flex-row items-center gap-3\">
                            <div class=\"bg-slate-50 px-4 py-2 rounded-2xl text-xs text-slate-600\">Mise à jour 24 mars, 17:31</div>
                            <button class=\"px-5 py-2.5 bg-emerald-500 text-white rounded-full text-sm font-semibold shadow-lg shadow-emerald-500/30 hover:bg-emerald-400 transition\">Planifier un meeting</button>
                        </div>
                    </div>
                    <div class=\"grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4\">
                        <div class=\"rounded-2xl border border-slate-100 bg-white/70 p-5 shadow-sm\">
                            <p class=\"text-xs uppercase tracking-[0.4em] text-slate-400\">Sessions</p>
                            <p class=\"text-3xl font-bold text-emerald-600 mt-2\" id=\"statSessions\">—</p>
                            <p class=\"text-xs text-slate-500 mt-1\">Depuis le début de la semaine</p>
                        </div>
                        <div class=\"rounded-2xl border border-slate-100 bg-white/70 p-5 shadow-sm\">
                            <p class=\"text-xs uppercase tracking-[0.4em] text-slate-400\">Score moyen</p>
                            <p class=\"text-3xl font-bold text-slate-900 mt-2\" id=\"statMoyenne\">—</p>
                            <p class=\"text-xs text-slate-500 mt-1\">Sessions complétées</p>
                        </div>
                        <div class=\"rounded-2xl border border-slate-100 bg-white/70 p-5 shadow-sm\">
                            <p class=\"text-xs uppercase tracking-[0.4em] text-slate-400\">Délégués actifs</p>
                            <p class=\"text-3xl font-bold text-slate-900 mt-2\" id=\"statDelegues\">—</p>
                            <p class=\"text-xs text-slate-500 mt-1\">Experts disponibles</p>
                        </div>
                        <div class=\"rounded-2xl border border-slate-100 bg-white/70 p-5 shadow-sm\">
                            <p class=\"text-xs uppercase tracking-[0.4em] text-slate-400\">Documents</p>
                            <p class=\"text-3xl font-bold text-slate-900 mt-2\" id=\"statDocuments\">—</p>
                            <p class=\"text-xs text-slate-500 mt-1\">Référentiels RAG</p>
                        </div>
                    </div>
                </section>
                <section class=\"bg-emerald-950 rounded-[2rem] p-6 sm:p-10 text-white relative overflow-hidden shadow-[0_20px_40px_rgba(15,23,42,0.35)]\">
                    <div class=\"absolute inset-0 bg-[radial-gradient(circle_at_top,#1b5c3a,transparent_60%)] opacity-60\"></div>
                    <div class=\"relative space-y-6\">
                        <div>
                            <p class=\"text-sm uppercase tracking-[0.4em] text-emerald-100\">Démarrer une session</p>
                            <h2 class=\"text-3xl font-bold\">Choisissez un expert et lancez une session</h2>
                            <p class=\"text-sm text-emerald-100/80 mt-1\">L'IA s'adapte à votre domaine d'expertise et vous évalue à la fin.</p>
                        </div>
                        <div class=\"flex flex-wrap gap-3 items-center\">
                            <button onclick=\"openAvatarModal()\" class=\"flex items-center gap-2 px-4 py-2 bg-white/20 border border-white/40 rounded-full text-sm font-semibold hover:bg-white/30 transition\">
                                <span class=\"text-lg\">+</span>
                                Ajouter un agent
                            </button>
                            <button id=\"btnStart\" onclick=\"startSession()\" class=\"ml-auto bg-emerald-500 hover:bg-emerald-400 text-emerald-950 px-8 py-3 rounded-full font-bold shadow-lg shadow-emerald-500/40 transition\">
                                <span class=\"text-xl\">🎯</span> Commencer
                            </button>
                        </div>
                        <div id=\"personasContainer\" class=\"grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4\">
                            <div class=\"text-emerald-100/70 text-sm italic\">Chargement des profils d'experts...</div>
                        </div>
                    </div>
                </section>
                <div class=\"grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]\">
                    <div class=\"space-y-6\">
                        <div class=\"bg-white border border-slate-100 rounded-[2rem] p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)]\">
                            <div class=\"flex items-center justify-between mb-4\">
                                <div>
                                    <p class=\"text-xs uppercase tracking-[0.4em] text-slate-400\">Sessions</p>
                                    <h3 class=\"text-xl font-bold text-slate-900\">Activité des 7 derniers jours</h3>
                                </div>
                                <span class=\"text-xs text-slate-400\">Sessions</span>
                            </div>
                            <div class=\"flex items-end gap-3 h-36\">
                                <div class=\"flex-1\">
                                    <div class=\"bg-gradient-to-t from-emerald-500 to-emerald-300 h-4 rounded-full mb-1\"></div>
                                    <p class=\"text-xs text-slate-400\">Lun</p>
                                </div>
                                <div class=\"flex-1\">
                                    <div class=\"bg-gradient-to-t from-emerald-500/80 to-emerald-200 h-8 rounded-full mb-1\"></div>
                                    <p class=\"text-xs text-slate-400\">Mar</p>
                                </div>
                                <div class=\"flex-1\">
                                    <div class=\"bg-gradient-to-t from-emerald-500 to-emerald-200 h-6 rounded-full mb-1\"></div>
                                    <p class=\"text-xs text-slate-400\">Mer</p>
                                </div>
                                <div class=\"flex-1\">
                                    <div class=\"bg-gradient-to-t from-emerald-500/60 to-emerald-200 h-10 rounded-full mb-1\"></div>
                                    <p class=\"text-xs text-slate-400\">Jeu</p>
                                </div>
                                <div class=\"flex-1\">
                                    <div class=\"bg-gradient-to-t from-emerald-500 to-emerald-200 h-5 rounded-full mb-1\"></div>
                                    <p class=\"text-xs text-slate-400\">Ven</p>
                                </div>
                                <div class=\"flex-1\">
                                    <div class=\"bg-gradient-to-t from-emerald-500/70 to-emerald-200 h-9 rounded-full mb-1\"></div>
                                    <p class=\"text-xs text-slate-400\">Sam</p>
                                </div>
                                <div class=\"flex-1\">
                                    <div class=\"bg-gradient-to-t from-emerald-500 to-emerald-200 h-7 rounded-full mb-1\"></div>
                                    <p class=\"text-xs text-slate-400\">Dim</p>
                                </div>
                            </div>
                        </div>
                        <div class=\"bg-white border border-slate-100 rounded-[2rem] p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)]\">
                            <div class=\"flex items-center justify-between mb-4\">
                                <div>
                                    <p class=\"text-xs uppercase tracking-[0.4em] text-slate-400\">Analytics</p>
                                    <h3 class=\"text-xl font-bold text-slate-900\">Project Analytics</h3>
                                </div>
                                <span class=\"text-xs text-slate-400\">Vue générale</span>
                            </div>
                            <div class=\"flex items-center justify-between gap-6\">
                                <div class=\"w-1/2 h-40 rounded-full border-8 border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-transparent\"></div>
                                <div class=\"flex flex-col gap-3 text-sm text-slate-500\">
                                    <div class=\"flex items-center gap-2\"><span class=\"h-2 w-2 rounded-full bg-emerald-500\"></span> Dr. Martin</div>
                                    <div class=\"flex items-center gap-2\"><span class=\"h-2 w-2 rounded-full bg-emerald-400\"></span> SAP Spécialiste</div>
                                    <div class=\"flex items-center gap-2\"><span class=\"h-2 w-2 rounded-full bg-slate-300\"></span> Expert Logistique</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class=\"space-y-6\">
                        <div class=\"bg-white border border-slate-100 rounded-[2rem] p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)]\">
                            <h3 class=\"text-sm font-semibold text-slate-500 uppercase tracking-[0.4em]\">Historique</h3>
                            <div id=\"historyList\" class=\"flex flex-col divide-y divide-slate-100 mt-4\">
                                <div class=\"text-center py-10 text-slate-500 text-sm\">
                                    <div class=\"text-3xl mb-3\">🧾</div>
                                    Chargement...
                                </div>
                            </div>
                        </div>
                        <div class=\"bg-white border border-slate-100 rounded-[2rem] p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)]\">
                            <h3 class=\"text-sm font-semibold text-slate-500 uppercase tracking-[0.4em]\">Médicaments</h3>
                            <div class=\"grid gap-3 mt-4\" id=\"medsInfo\">
                                <div class=\"text-sm text-slate-500\">Chargement...</div>
                            </div>
                        </div>
                    </div>
                </div>
                <section class=\"space-y-6\">
                    <div class=\"grid lg:grid-cols-2 gap-6\">
                        <div class=\"bg-white border border-slate-100 rounded-[2rem] p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)]\">
                            <div class=\"flex items-center justify-between gap-3\">
                                <div>
                                    <h3 class=\"text-lg font-semibold text-slate-900\">Experts (Personas)</h3>
                                    <p class=\"text-sm text-slate-500\">Créez ou modifiez les agents IA directement depuis votre espace.</p>
                                </div>
                                <button onclick=\"openAvatarModal()\" class=\"px-4 py-2 text-xs font-semibold bg-emerald-500 text-white rounded-full shadow-lg shadow-emerald-500/30\">+ Nouvel Expert</button>
                            </div>
                            <div id=\"clientAvatarsList\" class=\"mt-6 space-y-3 text-sm text-slate-500\">
                                <p class=\"text-center py-6 text-slate-400\">Chargement des experts...</p>
                            </div>
                        </div>
                        <div class=\"bg-white border border-slate-100 rounded-[2rem] p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)]\">
                            <div class=\"flex items-center justify-between gap-3\">
                                <div>
                                    <h3 class=\"text-lg font-semibold text-slate-900\">Base RAG</h3>
                                    <p class=\"text-sm text-slate-500\">Ajoutez vos documents pour enrichir les agents.</p>
                                </div>
                                <button id=\"clientRagFileBtn\" class=\"px-4 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-full text-slate-600 hover:text-emerald-600 transition\">Sélectionner un fichier</button>
                            </div>
                            <div class=\"mt-4\">
                                <label class=\"block text-sm font-semibold text-slate-600 mb-1\">Affecter à un expert</label>
                                <select id=\"clientRagAvatarSelect\" class=\"w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500\">
                                    <option value=\"\">Choisir un expert...</option>
                                </select>
                            </div>
                            <div id=\"clientRagUploadZone\" class=\"border-2 border-dashed border-slate-200 rounded-[1.75rem] p-8 mt-5 text-center text-slate-500 cursor-pointer bg-slate-50 transition hover:border-emerald-300 hover:bg-white\" role=\"button\">
                                <div class=\"text-3xl mb-2\">📁</div>
                                <p class=\"font-semibold text-slate-700 text-sm\">Glissez-déposez vos fichiers ici</p>
                                <p class=\"text-xs text-slate-400 mt-1\">PDF, DOCX, TXT, MD, XLSX, PPTX · Max 50 MB</p>
                            </div>
                            <input type=\"file\" id=\"clientRagFileInput\" class=\"hidden\" accept=\".pdf,.docx,.doc,.txt,.md,.xlsx,.pptx\" multiple>
                            <div id=\"clientRagProgressWrap\" class=\"hidden mt-4\">
                                <div class=\"flex items-center justify-between text-xs text-slate-500 mb-2\">
                                    <span>Upload en cours...</span>
                                    <span id=\"clientRagProgressPct\" class=\"font-semibold text-emerald-500\">0%</span>
                                </div>
                                <div class=\"h-2.5 bg-slate-100 rounded-full overflow-hidden\">
                                    <div id=\"clientRagProgressBar\" class=\"h-full bg-gradient-to-r from-emerald-500 to-lime-400\" style=\"width:0%\"></div>
                                </div>
                            </div>
                            <p id=\"clientRagFeedback\" class=\"text-xs text-slate-500 mt-3 min-h-[1.25rem]\"></p>
                            <div class=\"mt-6\">
                                <h4 class=\"text-sm font-semibold text-slate-700 mb-3\">Documents vectorisés</h4>
                                <div id=\"clientRagDocsList\" class=\"space-y-3 text-sm text-slate-500\">
                                    <p class=\"text-center py-6 text-slate-400\">Chargement des documents...</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    </div>

    <!-- Modal Avatar -->
    <div id=\"avatarModal\" class=\"fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 hidden z-40\">
        <div class=\"bg-white rounded-[2rem] w-full max-w-3xl shadow-2xl relative\" id=\"avatarModalContent\">
            <button onclick=\"closeAvatarModal()\" class=\"absolute right-4 top-4 text-slate-400 hover:text-red-500 w-8 h-8 rounded-full flex items-center justify-center transition-colors\">&times;</button>
            <div class=\"flex flex-col md:flex-row min-h-[400px]\">
                <div class=\"w-full md:w-[40%] p-8 flex flex-col justify-center\">
                    <h3 class=\"text-3xl font-bold text-emerald-950 mb-2\" id=\"avatarModalTitle\">Nouvel Expert</h3>
                    <p class=\"text-sm text-slate-500\">Définissez un nom, un emoji et un prompt système.</p>
                </div>
                <div class=\"w-full md:w-[60%] p-8 md:pl-0\">
                    <form id=\"avatarForm\" class=\"space-y-6\">
                        <input type=\"hidden\" id=\"avatarId\">
                        <div class=\"flex gap-4\">
                            <div class=\"flex-1\">
                                <label class=\"block text-sm font-semibold text-slate-700 mb-2\">Nom de l'expert</label>
                                <input type=\"text\" id=\"avatar_nom\" required class=\"w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400\">
                            </div>
                            <div class=\"w-24\">
                                <label class=\"text-sm font-semibold text-slate-700 mb-2\">Emoji</label>
                                <input type=\"text\" id=\"avatar_icone\" required maxlength=\"2\" class=\"w-full px-3 py-3 bg-slate-100 border border-slate-200 rounded-2xl text-center text-xl focus:outline-none focus:ring-1 focus:ring-emerald-400\">
                            </div>
                        </div>
                        <div>
                            <label class=\"block text-sm font-semibold text-slate-700 mb-2\">Prompt système</label>
                            <textarea id=\"avatar_prompt\" rows=\"4\" required class=\"w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-2xl resize-none text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400\"></textarea>
                        </div>
                        <div class=\"flex justify-end gap-3\">
                            <button type=\"button\" onclick=\"closeAvatarModal()\" class=\"px-6 py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:text-slate-900 transition\">Annuler</button>
                            <button type=\"submit\" class=\"px-6 py-2 rounded-xl bg-emerald-500 text-white text-sm font-semibold shadow-lg shadow-emerald-500/30\">Enregistrer</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>
"""

new_text = pre_body + new_layout + '\n' + script_block + post_script
path.write_text(new_text, encoding='utf-8')
