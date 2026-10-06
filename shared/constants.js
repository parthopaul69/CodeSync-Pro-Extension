// CodeSync Pro — Shared Constants v4.0
'use strict';

// ── Platform Configuration ───────────────────────────────────────────────────
const PLATFORM_CONFIG = {
  CF: {
    id: 'CF',
    label: 'Codeforces',
    shortLabel: 'CF',
    icon: '🔵',
    color: '#58a6ff',
    gradient: 'linear-gradient(135deg, #1f6feb, #2f81f7)',
    glowColor: 'rgba(47, 129, 247, 0.25)',
    url: 'https://codeforces.com',
    apiUrl: 'https://codeforces.com/api',
    segments: [
      { key: 'div1', label: 'Div. 1', color: '#ff8a80' },
      { key: 'div2', label: 'Div. 2', color: '#ffb74d' },
      { key: 'div3', label: 'Div. 3', color: '#81c784' },
      { key: 'div4', label: 'Div. 4', color: '#64b5f6' },
      { key: 'others', label: 'Others', color: '#ba68c8' }
    ],
    storageKeys: { handle: 'cfHandle', enabled: 'cfEnabled' },
    ghDir: 'Codeforces'
  },
  AC: {
    id: 'AC',
    label: 'AtCoder',
    shortLabel: 'AC',
    icon: '🔵',
    color: '#58a6ff',
    gradient: 'linear-gradient(135deg, #1f6feb, #2f81f7)',
    glowColor: 'rgba(47, 129, 247, 0.25)',
    url: 'https://atcoder.jp',
    apiUrl: 'https://kenkoooo.com/atcoder/atcoder-api',
    segments: [
      { key: 'abc', label: 'Beginner', color: '#64b5f6' },
      { key: 'arc', label: 'Regular', color: '#ffb74d' },
      { key: 'agc', label: 'Grand', color: '#ff8a80' },
      { key: 'other', label: 'Others', color: '#ba68c8' }
    ],
    storageKeys: { handle: 'acHandle', enabled: 'acEnabled' },
    ghDir: 'AtCoder'
  },
  LC: {
    id: 'LC',
    label: 'LeetCode',
    shortLabel: 'LC',
    icon: '🟡',
    color: '#58a6ff',
    gradient: 'linear-gradient(135deg, #1f6feb, #2f81f7)',
    glowColor: 'rgba(47, 129, 247, 0.25)',
    url: 'https://leetcode.com',
    apiUrl: 'https://leetcode.com/graphql',
    segments: [
      { key: 'Easy', label: 'Easy', color: '#4db6ac' },
      { key: 'Medium', label: 'Medium', color: '#ffe082' },
      { key: 'Hard', label: 'Hard', color: '#ff8a80' }
    ],
    storageKeys: { handle: 'lcHandle', enabled: 'lcEnabled' },
    ghDir: 'LeetCode'
  },
  TP: {
    id: 'TP',
    label: 'Toph',
    shortLabel: 'TP',
    icon: '🔵',
    color: '#58a6ff',
    gradient: 'linear-gradient(135deg, #1f6feb, #2f81f7)',
    glowColor: 'rgba(47, 129, 247, 0.25)',
    url: 'https://toph.co',
    apiUrl: null, // No official API — DOM scraping only
    segments: [
      { key: 'contest', label: 'Contest', color: '#58a6ff' },
      { key: 'practice', label: 'Practice', color: '#22c55e' }
    ],
    storageKeys: { handle: 'tpHandle', enabled: 'tpEnabled' },
    ghDir: 'Toph'
  },
  CSES: {
    id: 'CSES',
    label: 'CSES Problem Set',
    shortLabel: 'CSES',
    icon: '🔵',
    color: '#58a6ff',
    gradient: 'linear-gradient(135deg, #1f6feb, #2f81f7)',
    glowColor: 'rgba(47, 129, 247, 0.25)',
    url: 'https://cses.fi',
    apiUrl: null,
    segments: [],
    storageKeys: { handle: 'csesHandle', enabled: 'csesEnabled' },
    ghDir: 'CSES'
  }
};

// ── Language Extension Mapping ───────────────────────────────────────────────
const LANG_EXT_MAP = {
  'c': 'c',
  'c++': 'cpp', 'cpp': 'cpp', 'c++11': 'cpp', 'c++14': 'cpp', 'c++17': 'cpp', 'c++20': 'cpp',
  'g++': 'cpp', 'gcc': 'cpp', 'clang++': 'cpp', 'gnu c++': 'cpp', 'gnu c++14': 'cpp',
  'gnu c++17': 'cpp', 'gnu c++20': 'cpp', 'gnu c++17 (64)': 'cpp', 'gnu c++20 (64)': 'cpp',
  'java': 'java', 'java8': 'java', 'java11': 'java', 'java17': 'java', 'openjdk': 'java',
  'python': 'py', 'python2': 'py', 'python3': 'py', 'py': 'py', 'pypy': 'py', 'pypy3': 'py',
  'javascript': 'js', 'js': 'js', 'node': 'js', 'node.js': 'js',
  'typescript': 'ts', 'ts': 'ts',
  'rust': 'rs', 'rs': 'rs',
  'go': 'go', 'golang': 'go',
  'kotlin': 'kt', 'kt': 'kt',
  'c#': 'cs', 'csharp': 'cs', 'cs': 'cs', 'mono c#': 'cs',
  'ruby': 'rb', 'rb': 'rb',
  'swift': 'swift',
  'scala': 'scala',
  'haskell': 'hs', 'hs': 'hs',
  'php': 'php',
  'perl': 'pl', 'pl': 'pl',
  'pascal': 'pas', 'delphi': 'pas', 'free pascal': 'pas',
  'bash': 'sh', 'sh': 'sh',
  'd': 'd',
  'r': 'r',
  'ocaml': 'ml',
  'lua': 'lua',
  'elixir': 'ex',
  'erlang': 'erl',
  'clojure': 'clj',
  'dart': 'dart',
  'f#': 'fs', 'fsharp': 'fs'
};

// ── Judge0 Language ID Mapping (Modern Compilers on ce.judge0.com) ─────────────
const JUDGE0_LANG_IDS = {
  'c': 103,          // C (GCC 14.1.0)
  'cpp': 105,        // C++23 (GCC 14.1.0)
  'c++': 105,
  'cpp23': 105,
  'cpp20': 105,
  'cpp17': 76,       // C++17 (GCC 11.1.0)
  'java': 91,        // Java (JDK 17.0.6)
  'java21': 91,
  'py': 109,         // Python (3.13.2)
  'python': 109,
  'python313': 109,
  'python312': 92,   // Python 3.12.5
  'js': 102,         // JavaScript (Node.js 22.08.0)
  'javascript': 102,
  'node22': 102,
  'ts': 101,         // TypeScript (5.6.2)
  'typescript': 101,
  'rs': 108,         // Rust (1.85.0)
  'rust': 108,
  'rust185': 108,
  'go': 107,         // Go (1.23.5)
  'go123': 107,
  'kt': 111,         // Kotlin (2.1.10)
  'kotlin': 111,
  'kotlin21': 111,
  'cs': 51,          // C# (Mono 6.6.0.161)
  'csharp': 51,
  'rb': 72,          // Ruby (2.7.0)
  'ruby': 72,
  'swift': 83,       // Swift (5.2.3)
  'scala': 112,      // Scala (3.4.2)
  'hs': 61,          // Haskell (GHC 8.8.1)
  'haskell': 61,
  'php': 98,         // PHP (8.3.11)
  'pl': 85,          // Perl (5.28.1)
  'sh': 46,          // Bash (5.0.0)
  'r': 99,           // R (4.4.1)
  'lua': 64          // Lua (5.3.5)
};


// ── Editor Theme Definitions ─────────────────────────────────────────────────
const EDITOR_THEMES = [
  { id: 'vs-dark', label: 'VS Code Dark', isBuiltin: true },
  { id: 'dracula', label: 'Dracula', isBuiltin: false },
  { id: 'one-dark-pro', label: 'One Dark Pro', isBuiltin: false },
  { id: 'github-dark', label: 'GitHub Dark', isBuiltin: false },
  { id: 'monokai', label: 'Monokai', isBuiltin: false },
  { id: 'catppuccin', label: 'Catppuccin Mocha', isBuiltin: false }
];

// ── Editor Languages & Compiler Versions ────────────────────────────────────
const EDITOR_LANGUAGES = [
  { id: 'cpp', label: 'C++23 (Latest GCC 14.1)', monacoId: 'cpp', judge0Id: 105, defaultTemplate: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n    \n    \n    return 0;\n}\n' },
  { id: 'cpp20', label: 'C++20 (GCC 14.1)', monacoId: 'cpp', judge0Id: 105, defaultTemplate: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n    \n    \n    return 0;\n}\n' },
  { id: 'cpp17', label: 'C++17 (GCC 11.1)', monacoId: 'cpp', judge0Id: 76, defaultTemplate: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n    \n    \n    return 0;\n}\n' },
  { id: 'python', label: 'Python 3.13 (Latest)', monacoId: 'python', judge0Id: 109, defaultTemplate: 'import sys\ninput = sys.stdin.readline\n\ndef solve():\n    pass\n\nsolve()\n' },
  { id: 'python312', label: 'Python 3.12', monacoId: 'python', judge0Id: 92, defaultTemplate: 'import sys\ninput = sys.stdin.readline\n\ndef solve():\n    pass\n\nsolve()\n' },
  { id: 'java', label: 'Java 21 / 17 (OpenJDK)', monacoId: 'java', judge0Id: 91, defaultTemplate: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws Exception {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        \n        \n    }\n}\n' },
  { id: 'rust', label: 'Rust 1.85 (Latest)', monacoId: 'rust', judge0Id: 108, defaultTemplate: 'use std::io::{self, BufRead, Write, BufWriter};\n\nfn main() {\n    let stdin = io::stdin();\n    let stdout = io::stdout();\n    let mut out = BufWriter::new(stdout.lock());\n    \n    \n}\n' },
  { id: 'go', label: 'Go 1.23 (Latest)', monacoId: 'go', judge0Id: 107, defaultTemplate: 'package main\n\nimport (\n    "bufio"\n    "fmt"\n    "os"\n)\n\nfunc main() {\n    reader := bufio.NewReader(os.Stdin)\n    _ = reader\n    \n}\n' },
  { id: 'javascript', label: 'JavaScript (Node 22)', monacoId: 'javascript', judge0Id: 102, defaultTemplate: "'use strict';\nconst readline = require('readline');\nconst rl = readline.createInterface({ input: process.stdin });\nconst lines = [];\n\nrl.on('line', line => lines.push(line));\nrl.on('close', () => {\n    \n});\n" },
  { id: 'kotlin', label: 'Kotlin 2.1', monacoId: 'kotlin', judge0Id: 111, defaultTemplate: 'fun main() {\n    val br = System.`in`.bufferedReader()\n    \n}\n' },
  { id: 'csharp', label: 'C# (.NET 8)', monacoId: 'csharp', judge0Id: 51, defaultTemplate: 'using System;\nusing System.Collections.Generic;\nusing System.Linq;\n\nclass Program {\n    static void Main(string[] args) {\n        \n    }\n}\n' }
];

// ── Contest Platform Config ──────────────────────────────────────────────────
const CONTEST_PLATFORMS = [
  { id: 'cf', label: 'Codeforces', icon: '🔵', color: '#58a6ff', kontestsKey: 'codeforces', host: 'codeforces.com' },
  { id: 'ac', label: 'AtCoder', icon: '🔵', color: '#58a6ff', kontestsKey: 'at_coder', host: 'atcoder.jp' },
  { id: 'lc', label: 'LeetCode', icon: '🔵', color: '#58a6ff', kontestsKey: 'leet_code', host: 'leetcode.com' },
  { id: 'tp', label: 'Toph', icon: '🟢', color: '#22c55e', kontestsKey: 'toph', host: 'toph.co' },
  { id: 'cc', label: 'CodeChef', icon: '🟤', color: '#a78bfa', kontestsKey: 'code_chef', host: 'codechef.com' },
  { id: 'hr', label: 'HackerRank', icon: '🟩', color: '#10b981', kontestsKey: 'hacker_rank', host: 'hackerrank.com' },
  { id: 'tc', label: 'TopCoder', icon: '🔵', color: '#3b82f6', kontestsKey: 'top_coder', host: 'topcoder.com' }
];

// ── UI Design Tokens ─────────────────────────────────────────────────────────
const UI_COLORS = {
  bg: '#0a0e1a',
  surface: '#0f1525',
  surface2: '#1a2236',
  surface3: '#232d45',
  border: '#1e2a42',
  borderHover: '#2d3f5f',
  text: '#f0f4fc',
  textSecondary: '#c4cee4',
  muted: '#6b7a99',
  accent: '#2f81f7',
  accentHover: '#58a6ff',
  accentGlow: 'rgba(99, 102, 241, 0.3)',
  green: '#22c55e',
  greenGlow: 'rgba(34, 197, 94, 0.25)',
  red: '#ef4444',
  redGlow: 'rgba(239, 68, 68, 0.25)',
  orange: '#f97316',
  yellow: '#d29922',
  purple: '#8b5cf6',
  pink: '#8b5cf6',
  cyan: '#2f81f7'
};

// ── Verdict Types ────────────────────────────────────────────────────────────
const VERDICT = {
  AC: { label: 'Accepted', short: 'AC', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  WA: { label: 'Wrong Answer', short: 'WA', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  TLE: { label: 'Time Limit Exceeded', short: 'TLE', color: '#f97316', bg: 'rgba(249,115,22,0.12)' },
  MLE: { label: 'Memory Limit Exceeded', short: 'MLE', color: '#d29922', bg: 'rgba(210,153,34,0.12)' },
  RTE: { label: 'Runtime Error', short: 'RTE', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  CE: { label: 'Compilation Error', short: 'CE', color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
  PENDING: { label: 'Pending', short: '...', color: '#6b7a99', bg: 'rgba(107,122,153,0.12)' }
};

// Export for use across extension contexts (works in both module and script contexts)
if (typeof globalThis !== 'undefined') {
  globalThis.PLATFORM_CONFIG = PLATFORM_CONFIG;
  globalThis.LANG_EXT_MAP = LANG_EXT_MAP;
  globalThis.JUDGE0_LANG_IDS = JUDGE0_LANG_IDS;
  globalThis.EDITOR_THEMES = EDITOR_THEMES;
  globalThis.EDITOR_LANGUAGES = EDITOR_LANGUAGES;
  globalThis.CONTEST_PLATFORMS = CONTEST_PLATFORMS;
  globalThis.UI_COLORS = UI_COLORS;
  globalThis.VERDICT = VERDICT;
}
