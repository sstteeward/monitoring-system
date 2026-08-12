const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'src/components/JournalView.css');
let css = fs.readFileSync(cssPath, 'utf8');

// Find the LIGHT MODE OVERRIDES section
const lightModeRegex = /\/\*\s*══════════════════════════════════════════\s*LIGHT MODE OVERRIDES\s*══════════════════════════════════════════\s*\*\/([\s\S]+)/;
const match = css.match(lightModeRegex);

if (!match) {
    console.error("Could not find overrides");
    process.exit(1);
}

const overrides = match[1];
const baseCss = css.substring(0, match.index);

const ruleRegex = /html\[data-theme="light"\] ([^{]+)\s*\{\s*([^}]+)\s*\}/g;
let newDarkOverrides = '/* ══════════════════════════════════════════\n   DARK MODE OVERRIDES\n   ══════════════════════════════════════════ */\n';
let newBaseCss = baseCss;

let ruleMatch;
while ((ruleMatch = ruleRegex.exec(overrides)) !== null) {
    const rawSelectors = ruleMatch[1].split(',').map(s => s.trim());
    const rawProperties = ruleMatch[2].split(';').map(p => p.trim()).filter(p => p);
    
    let darkProperties = [];

    rawSelectors.forEach(selector => {
        // find the selector in base CSS
        // it might be .selector { ... } or something, so let's just find the exact selector block
        // escaping regex chars
        const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // This is risky because the selector might be grouped with others.
        // Let's just find the properties in the base CSS and swap them out.
    });
}
