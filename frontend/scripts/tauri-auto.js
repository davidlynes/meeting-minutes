#!/usr/bin/env node
/**
 * Auto-detect GPU and run Tauri with appropriate features
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Get the command (dev or build)
const command = process.argv[2];
if (!command || !['dev', 'build'].includes(command)) {
  console.error('Usage: node tauri-auto.js [dev|build]');
  process.exit(1);
}

// Detect GPU feature
let feature = '';

// Check for environment variable override first
if (process.env.TAURI_GPU_FEATURE) {
  feature = process.env.TAURI_GPU_FEATURE;
  console.log(`🔧 Using forced GPU feature from environment: ${feature}`);
} else {
  try {
    const result = execSync('node scripts/auto-detect-gpu.js', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'inherit']
    });
    feature = result.trim();
  } catch (err) {
    // If detection fails, continue with no features
  }
}

console.log(''); // Empty line for spacing

// Platform-specific environment variables
const platform = os.platform();
const env = { ...process.env };

if (platform === 'linux' && feature === 'cuda') {
  console.log('🐧 Linux/CUDA detected: Setting CMAKE flags for NVIDIA GPU');
  env.CMAKE_CUDA_ARCHITECTURES = '75';
  env.CMAKE_CUDA_STANDARD = '17';
  env.CMAKE_POSITION_INDEPENDENT_CODE = 'ON';
}

// Windows: Set CMAKE_GENERATOR=Ninja and initialize MSVC environment
// This avoids the "Visual Studio 18 2026" error from cmake-rs auto-detection
if (platform === 'win32' && !env.CMAKE_GENERATOR) {
  env.CMAKE_GENERATOR = 'Ninja';
  console.log('🔧 Windows: Set CMAKE_GENERATOR=Ninja');

  // Auto-detect and initialize MSVC developer environment if not already active
  if (!env.VCINSTALLDIR) {
    try {
      const vswherePath = path.join(
        process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
        'Microsoft Visual Studio', 'Installer', 'vswhere.exe'
      );
      const vsPath = execSync(
        `"${vswherePath}" -latest -property installationPath`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();

      if (vsPath) {
        const vcvarsall = path.join(vsPath, 'VC', 'Auxiliary', 'Build', 'vcvarsall.bat');
        // Run vcvarsall and capture the resulting environment
        const rawEnv = execSync(
          `"${vcvarsall}" x64 >nul 2>&1 && set`,
          { encoding: 'utf8', shell: 'cmd.exe', stdio: ['pipe', 'pipe', 'pipe'] }
        );
        // Parse and merge MSVC environment variables
        for (const line of rawEnv.split('\n')) {
          const idx = line.indexOf('=');
          if (idx > 0) {
            const key = line.substring(0, idx);
            const value = line.substring(idx + 1).trim();
            env[key] = value;
          }
        }
        env.CMAKE_GENERATOR = 'Ninja'; // re-set after merge
        console.log('✅ Windows: MSVC developer environment initialized');
      }
    } catch (err) {
      console.warn('⚠️  Could not auto-initialize MSVC environment:', err.message);
      console.warn('   Run from a "Developer Command Prompt" or use clean_run_windows.bat');
    }
  }
}

// Build the tauri command
let tauriCmd = `tauri ${command}`;
if (feature && feature !== 'none') {
  tauriCmd += ` -- --features ${feature}`;
  console.log(`🚀 Running: tauri ${command} with features: ${feature}`);
} else {
  console.log(`🚀 Running: tauri ${command} (CPU-only mode)`);
}
console.log('');

// Execute the command
try {
  execSync(tauriCmd, { stdio: 'inherit', env });
} catch (err) {
  process.exit(err.status || 1);
}
