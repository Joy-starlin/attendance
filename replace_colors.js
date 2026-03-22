const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'frontend', 'src', 'pages');

const replacements = [
  [/text-slate-50\b/g, 'text-foreground'],
  [/text-slate-100\b/g, 'text-foreground'],
  [/text-slate-200\b/g, 'text-foreground'],
  [/text-slate-300\b/g, 'text-foreground/80'],
  [/text-slate-400\b/g, 'text-muted-foreground'],
  [/text-slate-500\b/g, 'text-muted-foreground'],
  [/text-white\b/g, 'text-foreground'],
  
  [/bg-slate-950\b/g, 'bg-background'],
  [/bg-slate-900\b/g, 'bg-card'],
  [/bg-slate-800\b/g, 'bg-secondary'],
  [/bg-slate-700\b/g, 'bg-muted'],
  [/bg-slate-500\b/g, 'bg-muted-foreground'],
  
  [/border-slate-800\b/g, 'border-border'],
  [/border-slate-700\b/g, 'border-border'],
  
  [/text-sky-400\b/g, 'text-primary'],
  [/text-sky-300\b/g, 'text-primary'],
  [/text-sky-200\b/g, 'text-primary/80'],
  [/bg-sky-600\b/g, 'bg-primary'],
  [/bg-sky-500\b/g, 'bg-primary'],
  [/ring-sky-500\b/g, 'ring-primary'],
  [/border-sky-500\b/g, 'border-primary'],
  
  [/text-emerald-400\b/g, 'text-emerald-500'],
  [/text-rose-400\b/g, 'text-rose-500']
];

const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx'));

for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;
  
  for (const [regex, replacement] of replacements) {
    content = content.replace(regex, replacement);
  }
  
  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file}`);
  }
}
console.log("Done");
