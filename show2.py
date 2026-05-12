from pathlib import Path
lines = Path('public/dashboard.html').read_text(encoding='utf-8').splitlines()
for i,line in enumerate(lines,1):
    if 590 <= i <= 660:
        print(f"{i:03}: {line.encode('unicode_escape').decode('ascii')}")
