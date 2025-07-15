#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Environment variables to inject
const envVars = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  WORKER_URL: process.env.WORKER_URL
};

console.log('🔍 Checking environment variables...');
console.log('Available SUPABASE vars:', Object.keys(process.env).filter(k => k.includes('SUPABASE')));
console.log('Available WORKER vars:', Object.keys(process.env).filter(k => k.includes('WORKER')));

// Validate required environment variables
const missing = Object.entries(envVars)
  .filter(([key, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  console.error('❌ Missing required environment variables:', missing.join(', '));
  console.log('💡 Make sure these are set in Netlify Site Settings → Environment Variables');
  process.exit(1);
}

// Create environment config file
const configContent = `// Auto-generated environment configuration
window.SUPABASE_URL = '${envVars.SUPABASE_URL}';
window.SUPABASE_ANON_KEY = '${envVars.SUPABASE_ANON_KEY}';
window.WORKER_URL = '${envVars.WORKER_URL}';

console.log('✅ Environment variables loaded from build process');`;

// Write to public directory
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
  console.log('📁 Created public directory');
}

const configPath = path.join(publicDir, 'env-config.js');
fs.writeFileSync(configPath, configContent);

console.log('✅ Environment variables injected successfully');
console.log('📁 Created:', configPath);
console.log('🔧 Config contains:');
Object.entries(envVars).forEach(([key, value]) => {
  console.log(`   ${key}: ${value ? '✅ Set' : '❌ Missing'}`);
});
