#!/usr/bin/env python
# -*- coding: utf-8 -*-
from pathlib import Path
lines = Path('public/dashboard.html').read_text(encoding='utf-8').splitlines()
keywords = {
    'loadHistorique': 'async function loadHistorique()',
    'loadClientAvatars': 'async function loadClientAvatars()',
    'loadClientRagDocuments': 'async function loadClientRagDocuments()'
}
for idx, line in enumerate(lines, 1):
    for name, token in list(keywords.items()):
        if token in line:
            print(f"{name} line {idx}")
            keywords.pop(name)
            break
