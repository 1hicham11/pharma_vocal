#!/usr/bin/env python
# -*- coding: utf-8 -*-
from pathlib import Path
lines = Path('public/dashboard.html').read_text(encoding='utf-8').splitlines()
def find(token):
    for idx,line in enumerate(lines,1):
        if token in line:
            print(f"{token} line {idx}")
find('avatarStep1')
find('avatarStep2')
find('avatarKnowledgeFiles')
find('submitAvatarWizard')
find('uploadAvatarWizardFiles')
