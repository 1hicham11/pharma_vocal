#!/usr/bin/env python
# -*- coding: utf-8 -*-
from pathlib import Path
lines = Path('public/dashboard.html').read_text(encoding='utf-8').splitlines()
keywords = {
    'body start': '<body class="bg-[#edf3fb] text-slate-900 antialiased min-h-screen selection:bg-emerald-500 selection:text-white"',
    'aside': '<aside class="w-72 bg-white/95 border-r border-white/80 shadow-[0_20px_60px_rgba(15,23,42,0.12)] flex flex-col"',
    'stats card': '<section class="bg-white border border-slate-100 rounded-[2rem] p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)] space-y-6"',
    'hero': '<section class="bg-emerald-950 rounded-[2rem] p-6 sm:p-10 text-white relative overflow-hidden shadow-[0_20px_40px_rgba(15,23,42,0.35)]"',
    'experts section': '<section class="space-y-6">'
}
for idx, line in enumerate(lines, 1):
    for name, token in keywords.items():
        if token in line:
            print(f"{name} line {idx}")
            keywords.pop(name)
            break
