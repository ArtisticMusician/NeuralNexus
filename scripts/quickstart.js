import fs from 'fs';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import readline from 'readline';
import http from 'http';
import { fileURLToPath } from 'url';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function checkQdrant(showDiagnostics = true) {
    return new Promise((resolve) => {
        // Try multiple connection methods
        const urls = [
            'http://127.0.0.1:5304',
            'http://localhost:5304',
            'http://0.0.0.0:5304'
        ];
        
        let attemptCount = 0;
        const maxAttempts = urls.length;
        
        function tryUrl(url) {
            return new Promise((urlResolve) => {
                const req = http.get(url, (res) => {
                    let data = '';
                    res.on('data', d => data += d);
                    res.on('end', () => {
                        try {
                            const json = JSON.parse(data);
                            // Qdrant root returns {"title": "qdrant - vector database", "version": "..."}
                            urlResolve(json.title && json.title.includes('qdrant'));
                        } catch (e) {
                            urlResolve(false);
                        }
                    });
                });
                req.on('error', () => urlResolve(false));
                req.setTimeout(2000, () => {
                    req.destroy();
                    urlResolve(false);
                });
            });
        }
        
        // Try each URL sequentially
        function tryNext() {
            if (attemptCount < maxAttempts) {
                const url = urls[attemptCount];
                console.log(`📡 Checking Qdrant at ${url}...`);
                tryUrl(url).then(success => {
                    if (success) {
                        console.log(`✅ SUCCESS: Qdrant is online and responding at ${url}`);
                        resolve(true);
                    } else {
                        attemptCount++;
                        tryNext();
                    }
                });
            } else {
                if (!showDiagnostics) {
                    resolve(false);
                    return;
                }
                console.log('\n❌ ERROR: Qdrant health check failed on all URLs.');
                console.log('   Possible causes:');
                console.log('   1. Qdrant is not running on any interface');
                console.log('   2. Port 5304 is blocked by firewall');
                console.log('   3. Qdrant is running on different port');
                console.log('   4. Network connectivity issues');
                console.log('\n🔧 Network Diagnostics:');
                console.log('   Running basic connectivity tests...');
                
                // Test basic network connectivity
                try {
                    const req = http.get('http://httpbin.org/get', { timeout: 5000 }, (res) => {
                        let data = '';
                        res.on('data', chunk => data += chunk);
                        res.on('end', () => {
                            if (res.statusCode === 200) {
                                console.log('   ✅ Internet connectivity: OK');
                                console.log('   ✅ HTTP requests: Working');
                            } else {
                                console.log(`   ⚠️  HTTP test failed with status: ${res.statusCode}`);
                            }
                        });
                    });
                    req.on('error', (err) => {
                        console.log(`   ❌ Network error: ${err.message}`);
                    });
                } catch (netError) {
                    console.log(`   ❌ Network module error: ${netError.message}`);
                }
                
                console.log('\n🔧 Manual troubleshooting steps:');
                console.log('   1. Check if Qdrant is running: netstat -an | findstr :5304');
                console.log('   2. Try manual connection: curl http://localhost:5304');
                console.log('   3. Check Windows Firewall: Control Panel > Windows Defender Firewall');
                console.log('   4. Temporarily disable Windows Firewall for testing');
                console.log('   5. Restart Qdrant if needed');
                console.log('   6. Check if another Qdrant instance is running: tasklist | findstr qdrant');
                resolve(false);
            }
        }
        
        tryNext();
    });
}

async function run() {
    console.log('🧠 Neural Nexus - Quickstart');
    console.log('============================');

    // 0. Project Root Detection (Script-Relative)
    const __filename = fileURLToPath(import.meta.url);
    const projectRoot = path.resolve(path.dirname(__filename), '..');

    console.log(`📂 Project Root: ${projectRoot}`);

    // Verify package.json existence
    const pkgPath = path.resolve(projectRoot, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        console.error(`❌ ERROR: package.json not found at ${pkgPath}`);
        console.error('Please ensure you are running this from the project root.');
        process.exit(1);
    }

    // 1. .env setup
    const envPath = path.resolve(projectRoot, '.env');
    const examplePath = path.resolve(projectRoot, '.env.example');

    if (!fs.existsSync(envPath)) {
        console.log('⚠️  No .env file found. Creating one now...');
        
        if (!fs.existsSync(examplePath)) {
            console.error('❌ ERROR: .env.example file not found!');
            process.exit(1);
        }
        
        try {
            fs.copyFileSync(examplePath, envPath);
        } catch (error) {
            console.error('❌ ERROR copying .env.example:', error.message);
            process.exit(1);
        }
        
        console.log('\n🔐 Security Setup');
        const pass1 = await question('   Set your Master Password: ');
        const pass2 = await question('   Confirm Master Password: ');

        let finalPass = pass1 || 'nexus-password';
        if (pass1 !== pass2) {
            console.log('   ❌ Passwords do not match. Using default password.');
            finalPass = 'nexus-password';
        } else {
            console.log('   ✅ Password verified.');
        }

        let content = fs.readFileSync(envPath, 'utf8');
        console.log('   🔧 Applying password to configuration...');
        
        // Replace all instances of the placeholder
        const originalContent = content;
        content = content.replace(/your_secret_key_here/g, finalPass);
        
        // Verify that replacements were made
        if (content === originalContent) {
            console.log('   ⚠️  Warning: No placeholders found to replace. Using default configuration.');
        } else {
            const replacements = (originalContent.match(/your_secret_key_here/g) || []).length;
            console.log(`   ✅ Applied password to ${replacements} configuration fields.`);
        }
        
        fs.writeFileSync(envPath, content, 'utf8');
        console.log('✅ Configuration created.');
    } else {
        console.log('✅ .env file found.');
    }

    // 2. Mode Selection
    console.log('\nSelect your startup mode:');
    console.log('1) ⚡ Native Mode (Lighter, no Docker)');
    console.log('2) 🐳 Docker Mode (Containerized)');
    const mode = await question('Selection [1-2]: ');

    if (mode === '2') {
        console.log('🚀 Launching via Docker...');
        spawn('docker-compose', ['up', '--build', '-d'], { stdio: 'inherit', shell: true, cwd: projectRoot });
        console.log('🎉 Done! API at http://localhost:8008');
        process.exit(0);
    }

    // 3. Native Mode
    console.log('🚀 Launching Native Mode...');
    const qdrantOk = await checkQdrant(false);
    if (qdrantOk) {
        console.log('✅ Qdrant instance already detected at http://localhost:5304');
        console.log('   Skipping Qdrant setup and proceeding with existing instance...');
    } else {
        console.log('⚠️  No Qdrant instance detected at http://localhost:5304');
        const setup = await question('   Would you like to automatically download and setup Qdrant? [Y/n]: ');
        if (setup.toLowerCase() !== 'n') {
            const isWindows = process.platform === 'win32';
            const scriptPath = isWindows ? 'scripts/setup-qdrant.ps1' : 'scripts/setup-qdrant.sh';
            
            console.log(`🛠️  Running ${scriptPath}...`);
            if (isWindows) {
                const result = spawnSync('powershell', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath], { stdio: 'inherit', cwd: projectRoot });
                if (result.error || result.status !== 0) {
                    console.error('\n❌ ERROR: Qdrant setup failed. Please check the error messages above.');
                    process.exit(1);
                }
            } else {
                const result = spawnSync('bash', [scriptPath], { stdio: 'inherit', cwd: projectRoot });
                if (result.error || result.status !== 0) {
                    console.error('\n❌ ERROR: Qdrant setup failed. Please check the error messages above.');
                    process.exit(1);
                }
            }
            
            console.log('\n🚀 Launching Qdrant in a new terminal...');
            console.log('\n--- Qdrant Launch Status ---');
            if (isWindows) {
                const runPath = path.resolve(projectRoot, 'scripts/run-qdrant.ps1');
                console.log(`📍 Starting Qdrant with: ${runPath}`);
                
                // Check if the run script exists
                if (!fs.existsSync(runPath)) {
                    console.error('❌ Qdrant run script not found!');
                    console.error('Please ensure the setup completed successfully.');
                    process.exit(1);
                }
                
                console.log('🔄 Attempting to launch Qdrant terminal...');
                
                // Try multiple methods to open PowerShell
                try {
                    // Method 1: Direct PowerShell start
                    const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', runPath], { 
                        detached: true, 
                        stdio: 'ignore',
                        shell: true 
                    });
                    console.log('✅ Qdrant launch initiated (Method 1)');
                    
                    // Give it a moment and check if it's running
                    setTimeout(async () => {
                        const check = await checkQdrant();
                        if (check) {
                            console.log('✅ Qdrant is responding!');
                        } else {
                            console.log('⏳ Qdrant still starting up...');
                        }
                    }, 3000);
                    
                } catch (error1) {
                    console.log('⚠️  Method 1 failed, trying Method 2...');
                    try {
                        // Method 2: Start new PowerShell process
                        spawn('powershell', ['-Command', `Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "${runPath}"`], { 
                            detached: true, 
                            stdio: 'ignore',
                            shell: true 
                        });
                        console.log('✅ Qdrant launch initiated (Method 2)');
                    } catch (error2) {
                        console.log('⚠️  Method 2 failed, trying Method 3...');
                        try {
                            // Method 3: Simple start
                            spawn('cmd', ['/c', 'start', 'powershell', '-NoExit', '-ExecutionPolicy', 'Bypass', '-File', runPath], { 
                                detached: true, 
                                stdio: 'ignore',
                                shell: true 
                            });
                            console.log('✅ Qdrant launch initiated (Method 3)');
                        } catch (error3) {
                            console.error('❌ All automatic launch methods failed.');
                            console.error('\n📋 MANUAL START INSTRUCTIONS:');
                            console.error('1. Open a new PowerShell window manually');
                            console.error('2. Navigate to your project directory');
                            console.error('3. Run: powershell -ExecutionPolicy Bypass -File scripts/run-qdrant.ps1');
                            console.error(`\n   Or directly: powershell -ExecutionPolicy Bypass -File "${runPath}"`);
                        }
                    }
                }
            } else if (process.platform === 'darwin') {
                const runPath = path.resolve(projectRoot, 'scripts/run-qdrant.sh');
                spawnSync('chmod', ['+x', runPath], { cwd: projectRoot });
                spawn('osascript', ['-e', `tell application "Terminal" to do script "${runPath}"`], { detached: true });
            } else {
                const runPath = path.resolve(projectRoot, 'scripts/run-qdrant.sh');
                spawnSync('chmod', ['+x', runPath], { cwd: projectRoot });
                
                let launched = false;
                const terminals = [
                    { cmd: 'gnome-terminal', args: ['--', '/bin/bash', runPath] },
                    { cmd: 'xterm', args: ['-e', '/bin/bash', runPath] },
                    { cmd: 'konsole', args: ['-e', '/bin/bash', runPath] }
                ];

                for (const t of terminals) {
                    try {
                        spawn(t.cmd, t.args, { detached: true, stdio: 'ignore' });
                        launched = true;
                        break;
                    } catch (e) { continue; }
                }

            }
        } else if (process.platform === 'darwin') {
            const runPath = path.resolve(projectRoot, 'scripts/run-qdrant.sh');
            spawnSync('chmod', ['+x', runPath], { cwd: projectRoot });
            spawn('osascript', ['-e', `tell application "Terminal" to do script "${runPath}"`], { detached: true });
        } else {
            const runPath = path.resolve(projectRoot, 'scripts/run-qdrant.sh');
            spawnSync('chmod', ['+x', runPath], { cwd: projectRoot });
            
            let launched = false;
            const terminals = [
                { cmd: 'gnome-terminal', args: ['--', '/bin/bash', runPath] },
                { cmd: 'xterm', args: ['-e', '/bin/bash', runPath] },
                { cmd: 'konsole', args: ['-e', '/bin/bash', runPath] }
            ];

            for (const t of terminals) {
                try {
                    spawn(t.cmd, t.args, { detached: true, stdio: 'ignore' });
                    launched = true;
                    break;
                } catch (e) { continue; }
            }

            if (!launched) {
                console.log(`👉 PLEASE START QDRANT MANUALLY: ./scripts/run-qdrant.sh`);
            }
        }

        console.log('\n⏳ Waiting for Qdrant to respond...');
        let attempts = 0;
        let success = false;
        const maxAttempts = 30;
        
        while (attempts < maxAttempts && !success) {
            process.stdout.write(`   📡 Connection attempt ${attempts + 1}/${maxAttempts}...\r`);
            const ok = await checkQdrant(false);
            if (ok) {
                console.log('\n✅ SUCCESS: Qdrant is online and responding.');
                success = true;
            }
            await new Promise(r => setTimeout(r, 2000)); // Increased to 2 seconds
            attempts++;
        }

        if (!success) {
            await checkQdrant(true);
        }
    }

    console.log('\n📦 --- System Build ---');
    console.log('🏗️  Installing dependencies and building...');
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

    spawnSync(npmCmd, ['install', '--loglevel=error'], { stdio: 'inherit', shell: true, cwd: projectRoot });
    spawnSync(npmCmd, ['run', 'build', '--loglevel=error'], { stdio: 'inherit', shell: true, cwd: projectRoot });

    console.log('\n🚀 --- System Launch ---');
    console.log('✨ Starting system components...');
    spawn(npmCmd, ['run', 'dev:all'], { stdio: 'inherit', shell: true, cwd: projectRoot });
    rl.close();
}

run().catch(err => {
    console.error('❌ Quickstart failed:', err);
    process.exit(1);
});

