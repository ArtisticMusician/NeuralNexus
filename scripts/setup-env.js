import fs from 'fs';
import path from 'path';

const password = process.argv[2];
const envFile = process.argv[3] || '.env';
const envPath = path.join(process.cwd(), envFile);

if (!password) {
    console.error('❌ No password provided');
    process.exit(1);
}

if (!fs.existsSync(envPath)) {
    console.error('❌ .env file not found');
    process.exit(1);
}

try {
    let content = fs.readFileSync(envPath, 'utf8');
    // Replace all placeholder instances
    content = content.replace(/your_secret_key_here/g, password);
    fs.writeFileSync(envPath, content, 'utf8');
    console.log('✅ .env updated successfully');
} catch (err) {
    console.error(`❌ Failed to update .env: ${err.message}`);
    process.exit(1);
}
