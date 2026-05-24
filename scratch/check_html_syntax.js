const fs = require('fs');
const path = require('path');
const vm = require('vm');

try {
    const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    
    // Trích xuất các khối script không có src (inline script)
    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    let count = 0;
    
    while ((match = scriptRegex.exec(html)) !== null) {
        const scriptCode = match[1].trim();
        if (!scriptCode) continue;
        count++;
        
        try {
            new vm.Script(scriptCode);
            console.log(`✅ Script #${count} cú pháp OK.`);
        } catch (err) {
            console.error(`❌ Script #${count} LỖI CÚ PHÁP:`, err.message);
            // In ra dòng bị lỗi để dễ debug
            const lines = scriptCode.split('\n');
            const matchLine = err.stack.match(/evalmachine\.<anonymous>:(\d+)/);
            if (matchLine) {
                const lineNum = parseInt(matchLine[1]) - 1;
                console.log(`Dòng lỗi (${lineNum}):`, lines[lineNum]);
                console.log(`Các dòng xung quanh:`);
                for (let i = Math.max(0, lineNum - 3); i <= Math.min(lines.length - 1, lineNum + 3); i++) {
                    console.log(`${i + 1}: ${lines[i]}`);
                }
            }
        }
    }
} catch (e) {
    console.error("Lỗi đọc file:", e.message);
}
