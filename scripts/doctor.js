#!/usr/bin/env node

/**
 * ApplyPilot Doctor - System diagnostics and setup checker
 * Inspired by OpenClaw's doctor command
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const CHECKS = {
  node: {
    name: 'Node.js',
    minVersion: '18.0.0',
    check: () => {
      const version = process.version.slice(1);
      return {
        ok: compareVersions(version, '18.0.0') >= 0,
        version,
        message: `Node.js ${version} installed`,
      };
    },
  },
  npm: {
    name: 'npm',
    check: () => {
      try {
        const version = execSync('npm --version', { encoding: 'utf8' }).trim();
        return {
          ok: true,
          version,
          message: `npm ${version} installed`,
        };
      } catch {
        return { ok: false, message: 'npm not found' };
      }
    },
  },
  turbo: {
    name: 'Turborepo',
    check: () => {
      try {
        const version = execSync('npx turbo --version', { encoding: 'utf8' }).trim();
        return {
          ok: true,
          version,
          message: `Turborepo ${version} installed`,
        };
      } catch {
        return { ok: false, message: 'Turborepo not found' };
      }
    },
  },
  git: {
    name: 'Git',
    check: () => {
      try {
        const version = execSync('git --version', { encoding: 'utf8' }).trim();
        return {
          ok: true,
          version: version.replace('git version ', ''),
          message: version,
        };
      } catch {
        return { ok: false, message: 'Git not found' };
      }
    },
  },
  env: {
    name: 'Environment File',
    check: () => {
      const envPath = join(process.cwd(), '.env');
      const envExamplePath = join(process.cwd(), '.env.example');
      
      if (existsSync(envPath)) {
        return {
          ok: true,
          message: '.env file exists',
        };
      } else if (existsSync(envExamplePath)) {
        return {
          ok: false,
          warning: true,
          message: '.env file missing (copy from .env.example)',
        };
      } else {
        return {
          ok: false,
          message: '.env file missing',
        };
      }
    },
  },
  deps: {
    name: 'Dependencies',
    check: () => {
      const nodeModulesPath = join(process.cwd(), 'node_modules');
      if (!existsSync(nodeModulesPath)) {
        return {
          ok: false,
          message: 'node_modules missing - run npm install',
        };
      }
      
      // Check if key packages are installed
      const keyPackages = ['@applypilot/core', '@applypilot/api', '@applypilot/web'];
      const missing = keyPackages.filter(pkg => 
        !existsSync(join(nodeModulesPath, pkg))
      );
      
      if (missing.length > 0) {
        return {
          ok: false,
          message: `Missing packages: ${missing.join(', ')}`,
        };
      }
      
      return {
        ok: true,
        message: 'All dependencies installed',
      };
    },
  },
  build: {
    name: 'Build Status',
    check: () => {
      const distPaths = [
        'packages/core/dist',
        'apps/api/dist',
        'apps/web/dist',
      ];
      
      const missing = distPaths.filter(p => !existsSync(join(process.cwd(), p)));
      
      if (missing.length > 0) {
        return {
          ok: false,
          warning: true,
          message: `Build artifacts missing - run npm run build`,
        };
      }
      
      return {
        ok: true,
        message: 'Build artifacts present',
      };
    },
  },
};

function compareVersions(a, b) {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const partA = partsA[i] || 0;
    const partB = partsB[i] || 0;
    
    if (partA > partB) return 1;
    if (partA < partB) return -1;
  }
  
  return 0;
}

function formatCheck(name, result) {
  const icon = result.ok ? '✓' : result.warning ? '⚠' : '✗';
  const color = result.ok ? '\x1b[32m' : result.warning ? '\x1b[33m' : '\x1b[31m';
  const reset = '\x1b[0m';
  
  console.log(`${color}${icon}${reset} ${name}: ${result.message}`);
}

async function main() {
  console.log('\n🔍 ApplyPilot Doctor\n');
  console.log('Checking system setup...\n');
  
  let passed = 0;
  let warnings = 0;
  let failed = 0;
  
  for (const [key, check] of Object.entries(CHECKS)) {
    const result = check.check();
    formatCheck(check.name, result);
    
    if (result.ok) passed++;
    else if (result.warning) warnings++;
    else failed++;
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(`Results: ${passed} passed, ${warnings} warnings, ${failed} failed`);
  
  if (failed > 0) {
    console.log('\n❌ Some checks failed. Please fix the issues above.');
    process.exit(1);
  } else if (warnings > 0) {
    console.log('\n⚠️  Some warnings present. System should work but may have issues.');
    process.exit(0);
  } else {
    console.log('\n✅ All checks passed! System is ready.');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Error running doctor:', err);
  process.exit(1);
});
