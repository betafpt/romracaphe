import os
import re

html_dir = "public"
files = ["index.html", "recipes.html", "inventory.html", "reports.html", "roles.html"]
links = {
    "Tổng quan": "index.html",
    "Công thức": "recipes.html",
    "Kho hàng": "inventory.html",
    "Kho nguyên liệu": "inventory.html",
    "Công thức pha chế": "recipes.html",
    "Báo cáo": "reports.html",
    "Phân quyền": "roles.html",
}

def setup_file(filename):
    filepath = os.path.join(html_dir, filename)
    if not os.path.exists(filepath):
        print(f"Skipping {filepath}, not found.")
        return
        
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Routing Links to Sidebar Nav (Mobile Nav or Desktop Sidebar)
    for text, link in links.items():
        # Match text exactly inside tags
        pattern = re.compile(rf'(>[\s\n]*)({text})([\s\n]*<)')
        replacement = rf'\1<a href="{link}" style="color:inherit; text-decoration:none; display:inline-block; w-full h-full">{text}</a>\3'
        content = pattern.sub(replacement, content)
        
    # 2. Link styles and scripts
    if 'responsive.css' not in content:
        content = content.replace('</head>', '    <link rel="stylesheet" href="css/responsive.css">\n</head>')
    if 'src="js/api.js"' not in content:
        content = content.replace('</body>', '    <script src="js/api.js"></script>\n</body>')
        
    # 3. Add IDs for API interactions
    if 'inventory.html' in filename:
        content = re.sub(r'<tbody[^>]*>[\s\S]*?</tbody>', '<tbody id="inventory-tbody"></tbody>', content)
        content = re.sub(r'(<button[^>]*>[\s\S]*?THÊM MỚI[\s\S]*?</button>)', r'<button id="btn-add-inventory" class="flex-1 h-12 bg-primary neobrutal-border neobrutal-shadow-sm flex items-center justify-center gap-2 font-bold active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"><span class="material-symbols-outlined">add_circle</span> THÊM MỚI </button>', content, count=1, flags=re.IGNORECASE)

    if 'roles.html' in filename:
        content = re.sub(r'<section class="grid[^>]*>[\s\S]*?</section>', '<section id="users-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"></section>', content)
        content = re.sub(r'(<button[^>]*>[\s\S]*?Thêm tài khoản mới[\s\S]*?</button>)', r'<button id="btn-add-user" class="h-14 bg-primary neobrutal-border neobrutal-shadow flex items-center justify-center gap-2 font-black uppercase text-lg px-6 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all w-full md:w-auto"><span class="material-symbols-outlined text-3xl">add_circle</span> Thêm tài khoản mới</button>', content, count=1, flags=re.IGNORECASE)

    if 'index.html' in filename:
        content = re.sub(r'(<p class="text-2xl font-black">)12\.5M(</p>)', r'\g<1><span id="stat-revenue">12.5M</span>\g<2>', content)
        content = re.sub(r'(<p class="text-2xl font-black text-red-500">)08(</p>)', r'\g<1><span id="stat-low-stock">08</span>\g<2>', content)

    # 4. Hide mobile nav on desktop if required (basic tailwind class update)
    # The generated <nav> block is typically fixed at the bottom.
    content = content.replace('<nav class="fixed bottom-0', '<nav class="fixed bottom-0 md:hidden')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
        
    print(f"Processed {filepath}")

for f in files:
    setup_file(f)
