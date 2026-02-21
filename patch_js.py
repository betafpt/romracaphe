import os

js_path = 'public/js/app.js'
html_path = 'public/index.html'

with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

# Fix JS Modal Logic and hardcode styles to skip Tailwind CDN parsing issue for these specific cases
js = js.replace('class="fixed inset-0 bg-black/60 z-[100] hidden items-center justify-center p-4"', 'class="fixed inset-0 items-center justify-center p-4 content-center" style="display: none; background-color: rgba(0,0,0,0.6); z-index: 9999;"')
js = js.replace("document.getElementById('modal-inv').classList.add('hidden')", "document.getElementById('modal-inv').style.display='none'")
js = js.replace("document.getElementById('modal-inv').classList.remove('hidden').add('flex')", "document.getElementById('modal-inv').style.display='flex'")

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js)

# Inject JS into HTML so Tailwind CDN can parse all strings normally
with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

if '<script src="/js/app.js"></script>' in html:
    html = html.replace('<script src="/js/app.js"></script>', f'<script>\n{js}\n</script>')
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(html)
        print("Patched successfully!")
