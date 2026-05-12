from pathlib import Path
path = Path('public/dashboard.html')
text = path.read_text(encoding='utf-8')
split_start = text.split('<script>',1)
if len(split_start) != 2:
    raise SystemExit('No script block found')
pre_script, rest = split_start
script_content, post = rest.split('</script>',1)

body_template = """<div class=\"min-h-screen flex\">\n        <aside class=\"w-72 bg-white/95 border-r border-white/80 shadow-[0_20px_60px_rgba(15,23,42,0.12)] flex flex-col\">\n...""" 
