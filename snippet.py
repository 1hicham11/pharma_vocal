from pathlib import Path
lines = Path('public/dashboard.html').read_text(encoding='utf-8').splitlines()
for i,line in enumerate(lines,1):
    if 'logout()' in line and 'button' in line:
        start = max(1,i-8)
        end = min(len(lines),i+5)
        for j in range(start,end+1):
            print(f"{j:03}: {lines[j-1]}")
        break
