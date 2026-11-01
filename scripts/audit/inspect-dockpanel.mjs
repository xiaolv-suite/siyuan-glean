import fs from "fs";

const content = fs.readFileSync("src/ui/DockPanel.svelte", "utf8");
const lines = content.split("\n");

const buttons = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes("<button") || line.includes("role=\"button\"")) {
    buttons.push({ line: i + 1, text: line.trim() });
  }
}

console.log("Found button lines in DockPanel.svelte:", buttons.length);
console.log("First 10 buttons:");
buttons.slice(0, 10).forEach(b => console.log(`L${b.line}: ${b.text.slice(0, 80)}`));
