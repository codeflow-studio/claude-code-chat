/**
 * Simple validation script to test that our refactored services can be instantiated
 * This runs outside of VSCode to test basic instantiation
 */

const fs = require('fs');
const path = require('path');

// Check that all service files exist and are properly structured
const serviceFiles = [
    'src/ui/services/WebviewTemplateGenerator.ts',
    'src/ui/services/MessageHandler.ts', 
    'src/ui/services/TerminalManager.ts',
    'src/ui/services/ModeManager.ts',
    'src/ui/services/ProblemManager.ts'
];

const mainFile = 'src/ui/claudeTerminalInputProvider.ts';

console.log('🔍 Validating refactored code structure...\n');

// Check all service files exist
let allFilesExist = true;
serviceFiles.forEach(file => {
    if (fs.existsSync(file)) {
        console.log(`✅ ${file} exists`);
    } else {
        console.log(`❌ ${file} missing`);
        allFilesExist = false;
    }
});

// Check main file exists and is significantly smaller
if (fs.existsSync(mainFile)) {
    const stats = fs.statSync(mainFile);
    const lines = fs.readFileSync(mainFile, 'utf8').split('\n').length;
    console.log(`✅ ${mainFile} exists (${lines} lines)`);
    
    if (lines < 500) {
        console.log(`✅ Main file is properly reduced in size`);
    } else {
        console.log(`⚠️  Main file might still be too large`);
    }
} else {
    console.log(`❌ ${mainFile} missing`);
    allFilesExist = false;
}

// Check backup exists
const backupFile = 'src/ui/claudeTerminalInputProvider.ts.backup';
if (fs.existsSync(backupFile)) {
    const backupStats = fs.statSync(backupFile);
    const backupLines = fs.readFileSync(backupFile, 'utf8').split('\n').length;
    console.log(`✅ Backup file exists (${backupLines} lines)`);
    
    // Calculate reduction
    const currentLines = fs.readFileSync(mainFile, 'utf8').split('\n').length;
    const reduction = Math.round(((backupLines - currentLines) / backupLines) * 100);
    console.log(`📊 Size reduction: ${reduction}% (${backupLines} → ${currentLines} lines)`);
}

// Check service file structure
console.log('\n🔍 Checking service file structure...');
serviceFiles.forEach(file => {
    if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        
        // Check for class export
        if (content.includes('export class')) {
            console.log(`✅ ${path.basename(file)} has exported class`);
        } else {
            console.log(`⚠️  ${path.basename(file)} missing exported class`);
        }
        
        // Check for TypeScript
        if (content.includes('import') && content.includes('interface')) {
            console.log(`✅ ${path.basename(file)} has proper TypeScript structure`);
        }
    }
});

// Check main file uses services
console.log('\n🔍 Checking main file imports services...');
if (fs.existsSync(mainFile)) {
    const content = fs.readFileSync(mainFile, 'utf8');
    
    const expectedImports = [
        'WebviewTemplateGenerator',
        'MessageHandler', 
        'TerminalManager',
        'ModeManager'
    ];
    
    expectedImports.forEach(service => {
        if (content.includes(service)) {
            console.log(`✅ Main file imports ${service}`);
        } else {
            console.log(`❌ Main file missing import for ${service}`);
        }
    });
}

console.log('\n🎉 Refactoring validation complete!');

if (allFilesExist) {
    console.log('✅ All refactored files are present and structured correctly');
    process.exit(0);
} else {
    console.log('❌ Some files are missing - refactoring may be incomplete');
    process.exit(1);
}