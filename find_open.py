from pathlib import Path
text = Path('public/dashboard.html').read_text(encoding='utf-8').splitlines()
for idx,line in enumerate(text,1):
    if 'function openAvatarModal()' in line:
        print(idx)
    if '<button onclick="openAvatarModal()"' in line:
        print('button at', idx)
