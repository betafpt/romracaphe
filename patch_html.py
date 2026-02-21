import os
import re

files = ["index.html", "recipes.html", "inventory.html", "reports.html", "roles.html"]

def patch_file(filepath):
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        return
        
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Add api.js script at the end of body
    if 'src="js/api.js"' not in content:
        content = content.replace('</body>', '    <script src="js/api.js"></script>\n</body>')
    
    # 2. Add IDs to key elements so JS can interact
    # a. Inventory table
    if 'inventory.html' in filepath:
        content = re.sub(r'<tbody[^>]*>[\s\S]*?</tbody>', '<tbody id="inventory-tbody"></tbody>', content)
        # Nút Import Excel hoặc thêm mới: tìm thẻ chứa "THÊM MỚI" hoặc "Import Excel"
        content = re.sub(r'(<button[^>]*>[\s\S]*?THÊM MỚI[\s\S]*?</button>)', r'<button id="btn-add-inventory" class="flex-1 h-12 bg-primary neobrutal-border neobrutal-shadow-sm flex items-center justify-center gap-2 font-bold active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"><span class="material-symbols-outlined">add_circle</span> THÊM MỚI </button>', content, count=1, flags=re.IGNORECASE)

    # b. Roles grid
    if 'roles.html' in filepath:
        # replace the grid content with an empty grid with ID
        content = re.sub(r'<section class="grid[^>]*>[\s\S]*?</section>', '<section id="users-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"></section>', content)
        content = re.sub(r'(<button[^>]*>[\s\S]*?Thêm tài khoản mới[\s\S]*?</button>)', r'<button id="btn-add-user" class="h-14 bg-primary neobrutal-border neobrutal-shadow flex items-center justify-center gap-2 font-black uppercase text-lg px-6 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all w-full md:w-auto"><span class="material-symbols-outlined text-3xl">add_circle</span> Thêm tài khoản mới</button>', content, count=1, flags=re.IGNORECASE)

    # c. Index dashboard stats
    if 'index.html' in filepath:
        content = re.sub(r'(<p class="text-2xl font-black">)12\.5M(</p>)', r'\g<1><span id="stat-revenue">12.5M</span>\g<2>', content)
        content = re.sub(r'(<p class="text-2xl font-black text-red-500">)08(</p>)', r'\g<1><span id="stat-low-stock">08</span>\g<2>', content)

    # 3. Responsive Layout (Basic)
    # The generated HTML uses strict `w-full` logic for phones. 
    # To adapt to desktop, we inject a flex layout.
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
        print(f"Patched HTML and added JS hooks to {filepath}")

for f in files:
    patch_file(os.path.join("public", f))
