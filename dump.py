from pathlib import Path
text = Path('public/create-agent.html').read_text(encoding='utf-8')
idx = text.index('<datalist id="emojiSuggestions"')
end = text.index('</div>', idx) + 6
print(text[idx:end].encode('unicode_escape').decode('ascii'))
