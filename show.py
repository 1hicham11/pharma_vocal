from pathlib import Path
lines = Path('public/dashboard.html').read_text(encoding='utf-8').splitlines()
for i,line in enumerate(lines,1):
    if 520 <= i <= 780:
        print(f"{i:03}: {line}")
