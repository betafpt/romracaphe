const http = require('http');
const data = JSON.stringify({
    name: 'Sữa Chuối Choco',
    size: 'L',
    is_new: true,
    is_best_seller: false,
    is_sold_out: false
});
const options = {
    hostname: 'localhost', port: 3000, path: '/api/recipes/48', method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
};
const req = http.request(options, res => {
    let body = '';
    res.on('data', c => body += c);
    res.on('end', () => console.log('Status: ' + res.statusCode, 'Body: ' + body));
});
req.write(data); req.end();
