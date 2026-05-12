from pathlib import Path
text = Path('public/dashboard.html').read_text(encoding='utf-8').splitlines()
for idx,line in enumerate(text,1):
    if 'function openAvatarModal()' in line:
        print('openAvatarModal line', idx)
    if 'public/dashboard.html' in line:
        pass
