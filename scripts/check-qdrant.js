import http from 'http';

const url = 'http://127.0.0.1:5304/health';
console.log(`Checking ${url}...`);

const request = http.get(url, (res) => {
    console.log(`Response received: ${res.statusCode}`);
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            if (json.status === 'ok') {
                console.log('✅ Qdrant is healthy');
                process.exit(0);
            } else {
                console.log('⚠️ Qdrant status not ok');
                process.exit(1);
            }
        } catch (e) {
            console.log('⚠️ Failed to parse response');
            process.exit(1);
        }
    });
});

request.on('error', (err) => {
    console.log(`❌ Request error: ${err.message}`);
    process.exit(1);
});

// Manual timeout of 3 seconds
setTimeout(() => {
    console.log('⏰ Timeout reached, aborting...');
    request.destroy();
    process.exit(1);
}, 3000);

