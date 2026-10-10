// CodeSync Pro — CP Snippets, Templates & IntelliSense Completions Library
'use strict';

const CP_TEMPLATES = [
  {
    id: 'mini_cpp',
    name: 'Mini Template for CP (C++)',
    language: 'cpp',
    isBuiltin: true,
    description: 'Clean & minimal CP template with fast I/O, solve() function and multi-test loop',
    code: `#include <bits/stdc++.h>
using namespace std;

void solve() {
    
}

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    int t = 1;
    cin >> t;
    while (t--) {
        solve();
    }
    return 0;
}
`
  },
  {
    id: 'standard_cpp',
    name: 'Standard CP Template (C++)',
    language: 'cpp',
    isBuiltin: true,
    description: 'Full-featured competitive programming template with fast I/O, common macros, and type aliases',
    code: `#include <bits/stdc++.h>
using namespace std;

#define int long long
#define pb push_back
#define all(x) (x).begin(), (x).end()
#define sz(x) (int)(x).size()

const int INF = 1e18;
const int MOD = 1e9 + 7;

void solve() {
    
}

int32_t main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    int t = 1;
    cin >> t;
    while (t--) {
        solve();
    }
    return 0;
}
`
  },
  {
    id: 'python_cp',
    name: 'Standard Python 3 Template',
    language: 'python',
    isBuiltin: true,
    description: 'Fast I/O template for Python with recursion limit & solve() structure',
    code: `import sys

def input():
    return sys.stdin.readline().rstrip()

def solve():
    pass

def main():
    t = 1
    # t = int(input())
    for _ in range(t):
        solve()

if __name__ == '__main__':
    main()
`
  },
  {
    id: 'java_cp',
    name: 'Standard Java Template',
    language: 'java',
    isBuiltin: true,
    description: 'Fast I/O Java template using BufferedReader and StringTokenizer',
    code: `import java.io.*;
import java.util.*;

public class Main {
    static class FastScanner {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        StringTokenizer st = new StringTokenizer("");
        String next() {
            while (!st.hasMoreTokens()) {
                try { st = new StringTokenizer(br.readLine()); }
                catch (IOException e) { e.printStackTrace(); }
            }
            return st.nextToken();
        }
        int nextInt() { return Integer.parseInt(next()); }
        long nextLong() { return Long.parseLong(next()); }
    }

    public static void main(String[] args) {
        FastScanner in = new FastScanner();
        PrintWriter out = new PrintWriter(System.out);

        int t = 1;
        // t = in.nextInt();
        while (t-- > 0) {
            solve(in, out);
        }
        out.flush();
    }

    static void solve(FastScanner in, PrintWriter out) {
        
    }
}
`
  }
];

const CP_SNIPPETS = {
  cpp: [
    {
      prefix: 'fastio',
      label: 'Fast I/O Setup',
      body: 'ios_base::sync_with_stdio(false);\ncin.tie(NULL);'
    },
    {
      prefix: 'using_namespace_std',
      label: 'using namespace std;',
      body: 'using namespace std;'
    },
    {
      prefix: 'solve_fn',
      label: 'solve() function',
      body: 'void solve() {\n    ${1}\n}'
    },
    {
      prefix: 'while_testcases',
      label: 'Testcases while (t--)',
      body: 'int t = 1;\ncin >> t;\nwhile (t--) {\n    ${1:solve();}\n}'
    },
    {
      prefix: 'fori',
      label: 'for (int i = 0; i < n; ++i)',
      body: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ++${1:i}) {\n    ${3}\n}'
    },
    {
      prefix: 'forauto',
      label: 'for (auto& x : container)',
      body: 'for (auto& ${1:x} : ${2:v}) {\n    ${3}\n}'
    },
    {
      prefix: 'cin_vector',
      label: 'Read vector from cin',
      body: 'vector<${1:int}> ${2:a}(${3:n});\nfor (int i = 0; i < ${3:n}; ++i) cin >> ${2:a}[i];'
    },
    {
      prefix: 'all',
      label: 'all(container)',
      body: '(${1:v}).begin(), (${1:v}).end()'
    },
    {
      prefix: 'dsu',
      label: 'Disjoint Set Union (DSU)',
      body: [
        'struct DSU {',
        '    vector<int> parent, size;',
        '    DSU(int n) {',
        '        parent.resize(n + 1);',
        '        size.assign(n + 1, 1);',
        '        iota(parent.begin(), parent.end(), 0);',
        '    }',
        '    int find(int i) {',
        '        if (parent[i] == i) return i;',
        '        return parent[i] = find(parent[i]);',
        '    }',
        '    bool unite(int i, int j) {',
        '        int root_i = find(i), root_j = find(j);',
        '        if (root_i != root_j) {',
        '            if (size[root_i] < size[root_j]) swap(root_i, root_j);',
        '            parent[root_j] = root_i;',
        '            size[root_i] += size[root_j];',
        '            return true;',
        '        }',
        '        return false;',
        '    }',
        '};'
      ].join('\n')
    },
    {
      prefix: 'segtree',
      label: 'Segment Tree (Point Update, Range Query)',
      body: [
        'struct SegTree {',
        '    int n;',
        '    vector<int> tree;',
        '    SegTree(int n) : n(n), tree(4 * n, 0) {}',
        '    void build(const vector<int>& a, int v, int tl, int tr) {',
        '        if (tl == tr) { tree[v] = a[tl]; return; }',
        '        int tm = (tl + tr) / 2;',
        '        build(a, 2 * v, tl, tm);',
        '        build(a, 2 * v + 1, tm + 1, tr);',
        '        tree[v] = tree[2 * v] + tree[2 * v + 1];',
        '    }',
        '    void update(int v, int tl, int tr, int pos, int val) {',
        '        if (tl == tr) { tree[v] = val; return; }',
        '        int tm = (tl + tr) / 2;',
        '        if (pos <= tm) update(2 * v, tl, tm, pos, val);',
        '        else update(2 * v + 1, tm + 1, tr, pos, val);',
        '        tree[v] = tree[2 * v] + tree[2 * v + 1];',
        '    }',
        '    int query(int v, int tl, int tr, int l, int r) {',
        '        if (l > r) return 0;',
        '        if (l == tl && r == tr) return tree[v];',
        '        int tm = (tl + tr) / 2;',
        '        return query(2 * v, tl, tm, l, min(r, tm))',
        '             + query(2 * v + 1, tm + 1, tr, max(l, tm + 1), r);',
        '    }',
        '};'
      ].join('\n')
    },
    {
      prefix: 'modint',
      label: 'Modular Arithmetic / Modulo Combinatorics',
      body: [
        'const int MOD = 1e9 + 7;',
        'long long power(long long base, long long exp) {',
        '    long long res = 1; base %= MOD;',
        '    while (exp > 0) {',
        '        if (exp % 2 == 1) res = (__int128)res * base % MOD;',
        '        base = (__int128)base * base % MOD;',
        '        exp /= 2;',
        '    }',
        '    return res;',
        '}',
        'long long modInverse(long long n) { return power(n, MOD - 2); }',
        'long long modAdd(long long a, long long b) { return (a + b) % MOD; }',
        'long long modSub(long long a, long long b) { return ((a - b) % MOD + MOD) % MOD; }',
        'long long modMul(long long a, long long b) { return ((a % MOD) * (b % MOD)) % MOD; }'
      ].join('\n')
    },
    {
      prefix: 'dijkstra',
      label: 'Dijkstra Shortest Path',
      body: [
        'vector<long long> dijkstra(int start, const vector<vector<pair<int, int>>>& adj) {',
        '    int n = adj.size();',
        '    vector<long long> dist(n, 1e18);',
        '    priority_queue<pair<long long, int>, vector<pair<long long, int>>, greater<>> pq;',
        '    dist[start] = 0;',
        '    pq.push({0, start});',
        '    while (!pq.empty()) {',
        '        auto [d, u] = pq.top(); pq.pop();',
        '        if (d > dist[u]) continue;',
        '        for (auto [v, w] : adj[u]) {',
        '            if (dist[u] + w < dist[v]) {',
        '                dist[v] = dist[u] + w;',
        '                pq.push({dist[v], v});',
        '            }',
        '        }',
        '    }',
        '    return dist;',
        '}'
      ].join('\n')
    }
  ],
  python: [
    {
      prefix: 'fastio',
      label: 'Python Fast I/O',
      body: 'import sys\ninput = sys.stdin.readline'
    },
    {
      prefix: 'read_ints',
      label: 'Read space-separated integers',
      body: 'list(map(int, input().split()))'
    },
    {
      prefix: 'defaultdict',
      label: 'collections.defaultdict',
      body: 'from collections import defaultdict\n${1:d} = defaultdict(${2:int})'
    },
    {
      prefix: 'counter',
      label: 'collections.Counter',
      body: 'from collections import Counter\n${1:cnt} = Counter(${2:a})'
    }
  ]
};

// // ── Full Microsoft VS Code-Grade IntelliSense Engine ──────────────────────────
// Complete dictionaries & context-aware completion providers for all 8 supported languages

const INTELLISENSE_CPP = [
  // --- Fundamental Types & Storage Qualifiers (Global + Local) ---
  { label: 'int', kind: 'Keyword', detail: '32-bit signed integer type', insertText: 'int ', isGlobalAllowed: true, priority: 0 },
  { label: 'long long', kind: 'Keyword', detail: '64-bit signed integer type', insertText: 'long long ', acronym: 'll', isGlobalAllowed: true, priority: 0 },
  { label: 'double', kind: 'Keyword', detail: 'Double-precision IEEE 754 floating point', insertText: 'double ', isGlobalAllowed: true, priority: 0 },
  { label: 'float', kind: 'Keyword', detail: 'Single-precision IEEE 754 floating point', insertText: 'float ', isGlobalAllowed: true, priority: 0 },
  { label: 'char', kind: 'Keyword', detail: 'Character type', insertText: 'char ', isGlobalAllowed: true, priority: 0 },
  { label: 'bool', kind: 'Keyword', detail: 'Boolean type (true / false)', insertText: 'bool ', isGlobalAllowed: true, priority: 0 },
  { label: 'void', kind: 'Keyword', detail: 'Absence of type or parameter', insertText: 'void ', isGlobalAllowed: true, priority: 0 },
  { label: 'auto', kind: 'Keyword', detail: 'Type deduced automatically from initializer', insertText: 'auto ', isGlobalAllowed: true, priority: 0 },
  { label: 'const', kind: 'Keyword', detail: 'Constant variable or parameter specifier', insertText: 'const ', isGlobalAllowed: true, priority: 0 },
  { label: 'constexpr', kind: 'Keyword', detail: 'Compile-time constant expression', insertText: 'constexpr ', isGlobalAllowed: true, priority: 0 },
  { label: 'inline', kind: 'Keyword', detail: 'Inline function specifier', insertText: 'inline ', isGlobalAllowed: true, priority: 0 },
  { label: 'static', kind: 'Keyword', detail: 'Static storage duration specifier', insertText: 'static ', isGlobalAllowed: true, priority: 0 },
  { label: 'unsigned', kind: 'Keyword', detail: 'Unsigned integer modifier', insertText: 'unsigned ', isGlobalAllowed: true, priority: 0 },
  { label: 'signed', kind: 'Keyword', detail: 'Signed integer modifier', insertText: 'signed ', isGlobalAllowed: true, priority: 0 },
  { label: 'short', kind: 'Keyword', detail: '16-bit integer type', insertText: 'short ', isGlobalAllowed: true, priority: 0 },
  { label: 'long double', kind: 'Keyword', detail: 'Extended-precision floating point type', insertText: 'long double ', acronym: 'ld', isGlobalAllowed: true, priority: 0 },
  { label: 'nullptr', kind: 'Keyword', detail: 'Pointer literal representing null pointer', insertText: 'nullptr', isGlobalAllowed: false, priority: 0 },
  { label: 'true', kind: 'Keyword', detail: 'Boolean true literal', insertText: 'true', isGlobalAllowed: false, priority: 0 },
  { label: 'false', kind: 'Keyword', detail: 'Boolean false literal', insertText: 'false', isGlobalAllowed: false, priority: 0 },
  { label: 'sizeof', kind: 'Keyword', detail: 'Size of type or object in bytes', insertText: 'sizeof(${1})', isGlobalAllowed: true, priority: 0 },
  { label: 'decltype', kind: 'Keyword', detail: 'Type of an entity or expression', insertText: 'decltype(${1}) ', isGlobalAllowed: true, priority: 0 },

  // --- Fixed-Width Types & CP Limits ---
  { label: 'int32_t', kind: 'Class', detail: 'Exact 32-bit signed integer (cstdint)', insertText: 'int32_t ', isGlobalAllowed: true, priority: 1 },
  { label: 'int64_t', kind: 'Class', detail: 'Exact 64-bit signed integer (cstdint)', insertText: 'int64_t ', isGlobalAllowed: true, priority: 1 },
  { label: 'uint32_t', kind: 'Class', detail: 'Exact 32-bit unsigned integer', insertText: 'uint32_t ', isGlobalAllowed: true, priority: 1 },
  { label: 'uint64_t', kind: 'Class', detail: 'Exact 64-bit unsigned integer', insertText: 'uint64_t ', isGlobalAllowed: true, priority: 1 },
  { label: 'size_t', kind: 'Class', detail: 'Unsigned integer type for sizes and counts', insertText: 'size_t ', isGlobalAllowed: true, priority: 1 },
  { label: 'int128_t', kind: 'Class', detail: '__int128 128-bit signed integer', insertText: '__int128 ', acronym: 'i128', isGlobalAllowed: true, priority: 1 },
  { label: 'INT_MAX', kind: 'Constant', detail: 'Maximum value of 32-bit int: 2,147,483,647', insertText: 'INT_MAX', isGlobalAllowed: true, priority: 1 },
  { label: 'INT_MIN', kind: 'Constant', detail: 'Minimum value of 32-bit int: -2,147,483,648', insertText: 'INT_MIN', isGlobalAllowed: true, priority: 1 },
  { label: 'LLONG_MAX', kind: 'Constant', detail: 'Maximum value of 64-bit int: 9,223,372,036,854,775,807', insertText: 'LLONG_MAX', isGlobalAllowed: true, priority: 1 },
  { label: 'LLONG_MIN', kind: 'Constant', detail: 'Minimum value of 64-bit int: -9,223,372,036,854,775,808', insertText: 'LLONG_MIN', isGlobalAllowed: true, priority: 1 },
  { label: 'INF', kind: 'Constant', detail: 'Infinity constant: 1e18 or 1e9', insertText: 'INF', isGlobalAllowed: true, priority: 1 },
  { label: 'MOD', kind: 'Constant', detail: 'Modulo constant: 1e9 + 7 or 998244353', insertText: 'MOD', isGlobalAllowed: true, priority: 1 },

  // --- Declarations & Namespaces (Global Scope) ---
  { label: 'using namespace std;', kind: 'Snippet', detail: 'Import entire standard library namespace', insertText: 'using namespace std;', isGlobalAllowed: true, priority: 0 },
  { label: 'using', kind: 'Keyword', detail: 'Type alias or namespace directive', insertText: 'using ${1:ll} = ${2:long long};', isGlobalAllowed: true, priority: 0 },
  { label: 'namespace', kind: 'Keyword', detail: 'Define a namespace block', insertText: 'namespace ${1:name} {\n    ${0}\n}', isGlobalAllowed: true, priority: 0 },
  { label: 'struct', kind: 'Keyword', detail: 'Define a data structure', insertText: 'struct ${1:Name} {\n    ${0}\n};', isGlobalAllowed: true, priority: 0 },
  { label: 'class', kind: 'Keyword', detail: 'Define a class', insertText: 'class ${1:Name} {\npublic:\n    ${0}\n};', isGlobalAllowed: true, priority: 0 },
  { label: 'enum', kind: 'Keyword', detail: 'Enumeration type definition', insertText: 'enum class ${1:Name} {\n    ${0}\n};', isGlobalAllowed: true, priority: 0 },
  { label: 'template', kind: 'Keyword', detail: 'Template declaration', insertText: 'template <typename ${1:T}>\n', isGlobalAllowed: true, priority: 0 },
  { label: 'typename', kind: 'Keyword', detail: 'Template type parameter', insertText: 'typename ', isGlobalAllowed: true, priority: 0 },
  { label: 'typedef', kind: 'Keyword', detail: 'Type definition alias', insertText: 'typedef ${1:long long} ${2:ll};', isGlobalAllowed: true, priority: 0 },
  { label: 'int main()', kind: 'Snippet', detail: 'C++ program entry point', insertText: 'int main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n    \n    ${0}\n    return 0;\n}', isGlobalAllowed: true, priority: 0 },
  { label: 'void solve()', kind: 'Snippet', detail: 'CP standard test case solve function', insertText: 'void solve() {\n    ${0}\n}', isGlobalAllowed: true, priority: 0 },

  // --- Standard Library Containers (Global + Local) ---
  { label: 'vector', kind: 'Class', detail: 'std::vector dynamic array', insertText: 'vector<${1:int}> ${2:v};', isGlobalAllowed: true, priority: 1 },
  { label: 'vector<int>', kind: 'Class', detail: 'Dynamic array of 32-bit integers', insertText: 'vector<int> ${1:v};', acronym: 'vi', isGlobalAllowed: true, priority: 1 },
  { label: 'vector<long long>', kind: 'Class', detail: 'Dynamic array of 64-bit integers', insertText: 'vector<long long> ${1:v};', acronym: 'vll', isGlobalAllowed: true, priority: 1 },
  { label: 'vector<string>', kind: 'Class', detail: 'Dynamic array of strings', insertText: 'vector<string> ${1:v};', acronym: 'vs', isGlobalAllowed: true, priority: 1 },
  { label: 'vector<pair<int, int>>', kind: 'Class', detail: 'Dynamic array of integer pairs', insertText: 'vector<pair<int, int>> ${1:v};', acronym: 'vpii', isGlobalAllowed: true, priority: 1 },
  { label: 'string', kind: 'Class', detail: 'std::string dynamic character sequence', insertText: 'string ${1:s};', isGlobalAllowed: true, priority: 1 },
  { label: 'pair', kind: 'Class', detail: 'std::pair two heterogeneous objects', insertText: 'pair<${1:int}, ${2:int}> ${3:p};', isGlobalAllowed: true, priority: 1 },
  { label: 'pair<int, int>', kind: 'Class', detail: 'std::pair of two integers', insertText: 'pair<int, int> ${1:p};', acronym: 'pii', isGlobalAllowed: true, priority: 1 },
  { label: 'tuple', kind: 'Class', detail: 'std::tuple fixed-size collection of heterogeneous values', insertText: 'tuple<${1:int}, ${2:int}, ${3:int}> ${4:t};', isGlobalAllowed: true, priority: 1 },
  { label: 'map', kind: 'Class', detail: 'std::map self-balancing red-black tree (O(log n))', insertText: 'map<${1:int}, ${2:int}> ${3:mp};', isGlobalAllowed: true, priority: 1 },
  { label: 'unordered_map', kind: 'Class', detail: 'std::unordered_map hash table (O(1) average)', insertText: 'unordered_map<${1:int}, ${2:int}> ${3:mp};', acronym: 'ump', isGlobalAllowed: true, priority: 1 },
  { label: 'set', kind: 'Class', detail: 'std::set sorted unique elements (O(log n))', insertText: 'set<${1:int}> ${2:st};', isGlobalAllowed: true, priority: 1 },
  { label: 'unordered_set', kind: 'Class', detail: 'std::unordered_set unique elements hash set', insertText: 'unordered_set<${1:int}> ${2:st};', acronym: 'ust', isGlobalAllowed: true, priority: 1 },
  { label: 'multiset', kind: 'Class', detail: 'std::multiset sorted multiple duplicate elements', insertText: 'multiset<${1:int}> ${2:st};', isGlobalAllowed: true, priority: 1 },
  { label: 'priority_queue', kind: 'Class', detail: 'std::priority_queue Max-Heap container adaptor', insertText: 'priority_queue<${1:int}> ${2:pq};', acronym: 'pq', isGlobalAllowed: true, priority: 1 },
  { label: 'priority_queue_min', kind: 'Snippet', detail: 'std::priority_queue Min-Heap container adaptor', insertText: 'priority_queue<${1:int}, vector<${1:int}>, greater<${1:int}>> ${2:min_pq};', acronym: 'minpq', isGlobalAllowed: true, priority: 1 },
  { label: 'queue', kind: 'Class', detail: 'std::queue FIFO container adaptor', insertText: 'queue<${1:int}> ${2:q};', isGlobalAllowed: true, priority: 1 },
  { label: 'stack', kind: 'Class', detail: 'std::stack LIFO container adaptor', insertText: 'stack<${1:int}> ${2:stk};', isGlobalAllowed: true, priority: 1 },
  { label: 'deque', kind: 'Class', detail: 'std::deque double-ended queue sequence', insertText: 'deque<${1:int}> ${2:dq};', isGlobalAllowed: true, priority: 1 },
  { label: 'bitset', kind: 'Class', detail: 'std::bitset fixed-size sequence of N bits', insertText: 'bitset<${1:32}> ${2:bs};', isGlobalAllowed: true, priority: 1 },
  { label: 'array', kind: 'Class', detail: 'std::array fixed-size sequence container', insertText: 'array<${1:int}, ${2:N}> ${3:arr};', isGlobalAllowed: true, priority: 1 },

  // --- Control Flow Statements (INSIDE FUNCTIONS ONLY!) ---
  { label: 'for', kind: 'Snippet', detail: 'Standard for loop 0 to n', insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ++${1:i}) {\n    ${0}\n}', isStatement: true, priority: 3 },
  { label: 'for_range', kind: 'Snippet', detail: 'Range-based for loop (C++11)', insertText: 'for (const auto &${1:x} : ${2:container}) {\n    ${0}\n}', isStatement: true, priority: 3 },
  { label: 'while', kind: 'Snippet', detail: 'While loop', insertText: 'while (${1:condition}) {\n    ${0}\n}', isStatement: true, priority: 3 },
  { label: 'while_testcases', kind: 'Snippet', detail: 'While t-- multi-testcase loop', insertText: 'int t = 1;\ncin >> t;\nwhile (t--) {\n    ${0}\n}', isStatement: true, priority: 3 },
  { label: 'if', kind: 'Snippet', detail: 'If conditional statement', insertText: 'if (${1:condition}) {\n    ${0}\n}', isStatement: true, priority: 3 },
  { label: 'ifelse', kind: 'Snippet', detail: 'If-Else conditional statement', insertText: 'if (${1:condition}) {\n    ${2}\n} else {\n    ${0}\n}', isStatement: true, priority: 3 },
  { label: 'else', kind: 'Keyword', detail: 'Else conditional branch', insertText: 'else {\n    ${0}\n}', isStatement: true, priority: 3 },
  { label: 'switch', kind: 'Snippet', detail: 'Switch statement', insertText: 'switch (${1:expr}) {\ncase ${2:val}:\n    ${0}\n    break;\ndefault:\n    break;\n}', isStatement: true, priority: 3 },
  { label: 'return', kind: 'Keyword', detail: 'Return from function', insertText: 'return ${1:0};', isStatement: true, priority: 3 },
  { label: 'break', kind: 'Keyword', detail: 'Break out of loop or switch', insertText: 'break;', isStatement: true, priority: 3 },
  { label: 'continue', kind: 'Keyword', detail: 'Continue to next loop iteration', insertText: 'continue;', isStatement: true, priority: 3 },

  // --- I/O Streams (INSIDE FUNCTIONS ONLY!) ---
  { label: 'cin', kind: 'Variable', detail: 'Standard console input stream', insertText: 'cin >> ${1};', isStatement: true, priority: 2 },
  { label: 'cout', kind: 'Variable', detail: 'Standard console output stream', insertText: 'cout << ${1} << "\\n";', isStatement: true, priority: 2 },
  { label: 'cout_yesno', kind: 'Snippet', detail: 'Print YES / NO based on condition', insertText: 'cout << (${1:ok} ? "YES\\n" : "NO\\n");', isStatement: true, priority: 2 },
  { label: 'endl', kind: 'Variable', detail: 'Flush output buffer and print newline', insertText: 'endl', isStatement: true, priority: 2 },
  { label: 'cerr', kind: 'Variable', detail: 'Standard error stream for debug output', insertText: 'cerr << ${1} << endl;', isStatement: true, priority: 2 },
  { label: 'fast_io', kind: 'Snippet', detail: 'Fast C++ standard I/O untie', insertText: 'ios_base::sync_with_stdio(false);\ncin.tie(NULL);', isStatement: true, priority: 2 },

  // --- Standard Algorithms & Utility Functions ---
  { label: 'sort', kind: 'Function', detail: 'Sort container in ascending order std::sort', insertText: 'sort(${1:v}.begin(), ${1:v}.end());', isStatement: true, priority: 2 },
  { label: 'sort_desc', kind: 'Snippet', detail: 'Sort container descending with greater<T>()', insertText: 'sort(${1:v}.begin(), ${1:v}.end(), greater<${2:int}>());', isStatement: true, priority: 2 },
  { label: 'reverse', kind: 'Function', detail: 'Reverse sequence of elements std::reverse', insertText: 'reverse(${1:v}.begin(), ${1:v}.end());', isStatement: true, priority: 2 },
  { label: 'min', kind: 'Function', detail: 'Returns the smaller of two values std::min', insertText: 'min(${1:a}, ${2:b})', isGlobalAllowed: true, priority: 2 },
  { label: 'max', kind: 'Function', detail: 'Returns the greater of two values std::max', insertText: 'max(${1:a}, ${2:b})', isGlobalAllowed: true, priority: 2 },
  { label: 'abs', kind: 'Function', detail: 'Absolute value std::abs', insertText: 'abs(${1:x})', isGlobalAllowed: true, priority: 2 },
  { label: 'gcd', kind: 'Function', detail: 'Greatest common divisor std::gcd', insertText: 'std::gcd(${1:a}, ${2:b})', isGlobalAllowed: true, priority: 2 },
  { label: 'lcm', kind: 'Function', detail: 'Least common multiple std::lcm', insertText: 'std::lcm(${1:a}, ${2:b})', isGlobalAllowed: true, priority: 2 },
  { label: 'swap', kind: 'Function', detail: 'Exchange values of two objects std::swap', insertText: 'swap(${1:a}, ${2:b});', isStatement: true, priority: 2 },
  { label: 'iota', kind: 'Function', detail: 'Fill range with sequentially increasing values', insertText: 'iota(${1:v}.begin(), ${1:v}.end(), ${2:0});', isStatement: true, priority: 2 },
  { label: 'accumulate', kind: 'Function', detail: 'Sum of elements in range std::accumulate', insertText: 'accumulate(${1:v}.begin(), ${1:v}.end(), 0LL)', isStatement: true, priority: 2 },
  { label: 'lower_bound', kind: 'Function', detail: 'Iterator to first element >= value', insertText: 'lower_bound(${1:v}.begin(), ${1:v}.end(), ${2:val})', isStatement: true, priority: 2 },
  { label: 'upper_bound', kind: 'Function', detail: 'Iterator to first element > value', insertText: 'upper_bound(${1:v}.begin(), ${1:v}.end(), ${2:val})', isStatement: true, priority: 2 },
  { label: 'binary_search', kind: 'Function', detail: 'Test if value exists in sorted sequence', insertText: 'binary_search(${1:v}.begin(), ${1:v}.end(), ${2:val})', isStatement: true, priority: 2 },
  { label: 'min_element', kind: 'Function', detail: 'Iterator to smallest element in range', insertText: 'min_element(${1:v}.begin(), ${1:v}.end())', isStatement: true, priority: 2 },
  { label: 'max_element', kind: 'Function', detail: 'Iterator to largest element in range', insertText: 'max_element(${1:v}.begin(), ${1:v}.end())', isStatement: true, priority: 2 },
  { label: 'next_permutation', kind: 'Function', detail: 'Transform range to next lexicographical permutation', insertText: 'next_permutation(${1:v}.begin(), ${1:v}.end())', isStatement: true, priority: 2 },
  { label: 'unique', kind: 'Function', detail: 'Remove consecutive duplicate elements', insertText: '${1:v}.erase(unique(${1:v}.begin(), ${1:v}.end()), ${1:v}.end());', isStatement: true, priority: 2 },
  { label: 'make_pair', kind: 'Function', detail: 'Construct a std::pair object', insertText: 'make_pair(${1:a}, ${2:b})', acronym: 'mp', isGlobalAllowed: true, priority: 2 },
  { label: 'make_tuple', kind: 'Function', detail: 'Construct a std::tuple object', insertText: 'make_tuple(${1:a}, ${2:b}, ${3:c})', isGlobalAllowed: true, priority: 2 },

  // --- Member Methods (ONLY TRIGGERED AFTER . OR ->) ---
  { label: 'push_back', kind: 'Method', detail: 'Append element to end of container', insertText: 'push_back(${1})', isMemberOnly: true, acronym: 'pb', priority: 4 },
  { label: 'emplace_back', kind: 'Method', detail: 'Construct element in-place at end', insertText: 'emplace_back(${1})', isMemberOnly: true, acronym: 'eb', priority: 4 },
  { label: 'pop_back', kind: 'Method', detail: 'Remove the last element', insertText: 'pop_back()', isMemberOnly: true, priority: 4 },
  { label: 'push', kind: 'Method', detail: 'Insert element into queue/stack/priority_queue', insertText: 'push(${1})', isMemberOnly: true, priority: 4 },
  { label: 'pop', kind: 'Method', detail: 'Remove top/front element from queue/stack', insertText: 'pop()', isMemberOnly: true, priority: 4 },
  { label: 'top', kind: 'Method', detail: 'Access top element of stack/priority_queue', insertText: 'top()', isMemberOnly: true, priority: 4 },
  { label: 'front', kind: 'Method', detail: 'Access first element of container', insertText: 'front()', isMemberOnly: true, priority: 4 },
  { label: 'back', kind: 'Method', detail: 'Access last element of container', insertText: 'back()', isMemberOnly: true, priority: 4 },
  { label: 'insert', kind: 'Method', detail: 'Insert element into set/map/vector', insertText: 'insert(${1})', isMemberOnly: true, priority: 4 },
  { label: 'erase', kind: 'Method', detail: 'Erase element by key or iterator', insertText: 'erase(${1})', isMemberOnly: true, priority: 4 },
  { label: 'find', kind: 'Method', detail: 'Find element by key in set/map', insertText: 'find(${1})', isMemberOnly: true, priority: 4 },
  { label: 'count', kind: 'Method', detail: 'Count occurrences of key in set/map', insertText: 'count(${1})', isMemberOnly: true, priority: 4 },
  { label: 'size', kind: 'Method', detail: 'Number of elements in container', insertText: 'size()', isMemberOnly: true, priority: 4 },
  { label: 'empty', kind: 'Method', detail: 'Check if container is empty', insertText: 'empty()', isMemberOnly: true, priority: 4 },
  { label: 'clear', kind: 'Method', detail: 'Clear all elements from container', insertText: 'clear()', isMemberOnly: true, priority: 4 },
  { label: 'begin', kind: 'Method', detail: 'Iterator to beginning', insertText: 'begin()', isMemberOnly: true, priority: 4 },
  { label: 'end', kind: 'Method', detail: 'Iterator to end', insertText: 'end()', isMemberOnly: true, priority: 4 },
  { label: 'rbegin', kind: 'Method', detail: 'Reverse iterator to reverse beginning', insertText: 'rbegin()', isMemberOnly: true, priority: 4 },
  { label: 'rend', kind: 'Method', detail: 'Reverse iterator to reverse end', insertText: 'rend()', isMemberOnly: true, priority: 4 },
  { label: 'resize', kind: 'Method', detail: 'Change number of elements stored', insertText: 'resize(${1:n})', isMemberOnly: true, priority: 4 },
  { label: 'reserve', kind: 'Method', detail: 'Reserve storage space for vector', insertText: 'reserve(${1:n})', isMemberOnly: true, priority: 4 },
  { label: 'substr', kind: 'Method', detail: 'Generate substring (pos, count)', insertText: 'substr(${1:pos}, ${2:count})', isMemberOnly: true, priority: 4 },
  { label: 'length', kind: 'Method', detail: 'Return length of string', insertText: 'length()', isMemberOnly: true, priority: 4 },
  { label: 'first', kind: 'Field', detail: 'First member of pair', insertText: 'first', isMemberOnly: true, priority: 4 },
  { label: 'second', kind: 'Field', detail: 'Second member of pair', insertText: 'second', isMemberOnly: true, priority: 4 }
];

const INTELLISENSE_PYTHON = [
  // Keywords
  { label: 'def', kind: 'Keyword', detail: 'Define a function', insertText: 'def ${1:solve}():\n    ${0}', priority: 0 },
  { label: 'class', kind: 'Keyword', detail: 'Define a class', insertText: 'class ${1:Name}:\n    def __init__(self):\n        ${0}', priority: 0 },
  { label: 'return', kind: 'Keyword', detail: 'Return from function', insertText: 'return ${1}', priority: 0 },
  { label: 'if', kind: 'Snippet', detail: 'If conditional statement', insertText: 'if ${1:condition}:\n    ${0}', priority: 0 },
  { label: 'elif', kind: 'Snippet', detail: 'Elif conditional statement', insertText: 'elif ${1:condition}:\n    ${0}', priority: 0 },
  { label: 'else', kind: 'Keyword', detail: 'Else clause', insertText: 'else:\n    ${0}', priority: 0 },
  { label: 'for', kind: 'Snippet', detail: 'For loop over range or iterable', insertText: 'for ${1:i} in range(${2:n}):\n    ${0}', priority: 0 },
  { label: 'while', kind: 'Snippet', detail: 'While loop', insertText: 'while ${1:condition}:\n    ${0}', priority: 0 },
  { label: 'break', kind: 'Keyword', detail: 'Break out of loop', insertText: 'break', priority: 0 },
  { label: 'continue', kind: 'Keyword', detail: 'Continue to next loop iteration', insertText: 'continue', priority: 0 },
  { label: 'import', kind: 'Keyword', detail: 'Import module', insertText: 'import ${1:sys}', priority: 0 },
  { label: 'from', kind: 'Keyword', detail: 'Import specific identifiers from module', insertText: 'from ${1:collections} import ${2:deque}', priority: 0 },
  { label: 'lambda', kind: 'Keyword', detail: 'Anonymous inline function', insertText: 'lambda ${1:x}: ${0}', priority: 0 },
  { label: 'pass', kind: 'Keyword', detail: 'Null statement placeholder', insertText: 'pass', priority: 0 },
  { label: 'in', kind: 'Keyword', detail: 'Membership test operator', insertText: 'in ', priority: 0 },
  { label: 'is', kind: 'Keyword', detail: 'Identity test operator', insertText: 'is ', priority: 0 },
  { label: 'not', kind: 'Keyword', detail: 'Boolean NOT operator', insertText: 'not ', priority: 0 },
  { label: 'and', kind: 'Keyword', detail: 'Boolean AND operator', insertText: 'and ', priority: 0 },
  { label: 'or', kind: 'Keyword', detail: 'Boolean OR operator', insertText: 'or ', priority: 0 },
  { label: 'True', kind: 'Keyword', detail: 'Boolean True', insertText: 'True', priority: 0 },
  { label: 'False', kind: 'Keyword', detail: 'Boolean False', insertText: 'False', priority: 0 },
  { label: 'None', kind: 'Keyword', detail: 'None singleton object', insertText: 'None', priority: 0 },

  // Built-in Types & Functions
  { label: 'int', kind: 'Class', detail: 'Convert or construct integer', insertText: 'int(${1})', priority: 1 },
  { label: 'float', kind: 'Class', detail: 'Convert or construct float', insertText: 'float(${1})', priority: 1 },
  { label: 'str', kind: 'Class', detail: 'Convert or construct string', insertText: 'str(${1})', priority: 1 },
  { label: 'bool', kind: 'Class', detail: 'Convert to boolean', insertText: 'bool(${1})', priority: 1 },
  { label: 'list', kind: 'Class', detail: 'Dynamic array list constructor', insertText: 'list(${1})', priority: 1 },
  { label: 'dict', kind: 'Class', detail: 'Hash map dictionary constructor', insertText: 'dict()', priority: 1 },
  { label: 'set', kind: 'Class', detail: 'Hash set of unique elements', insertText: 'set()', priority: 1 },
  { label: 'tuple', kind: 'Class', detail: 'Immutable sequence tuple', insertText: 'tuple(${1})', priority: 1 },
  { label: 'len', kind: 'Function', detail: 'Return length of object', insertText: 'len(${1})', priority: 1 },
  { label: 'range', kind: 'Function', detail: 'Generate arithmetic progression', insertText: 'range(${1:n})', priority: 1 },
  { label: 'print', kind: 'Function', detail: 'Print to standard output', insertText: 'print(${1})', priority: 1 },
  { label: 'input', kind: 'Function', detail: 'Read line from standard input', insertText: 'input()', priority: 1 },
  { label: 'min', kind: 'Function', detail: 'Smallest of two or more values', insertText: 'min(${1})', priority: 1 },
  { label: 'max', kind: 'Function', detail: 'Largest of two or more values', insertText: 'max(${1})', priority: 1 },
  { label: 'sum', kind: 'Function', detail: 'Sum of items in iterable', insertText: 'sum(${1})', priority: 1 },
  { label: 'abs', kind: 'Function', detail: 'Absolute value', insertText: 'abs(${1})', priority: 1 },
  { label: 'sorted', kind: 'Function', detail: 'Return sorted list from iterable', insertText: 'sorted(${1})', priority: 1 },
  { label: 'enumerate', kind: 'Function', detail: 'Enumerate iterable with index', insertText: 'enumerate(${1})', priority: 1 },
  { label: 'zip', kind: 'Function', detail: 'Aggregate elements from iterables', insertText: 'zip(${1:a}, ${2:b})', priority: 1 },
  { label: 'map', kind: 'Function', detail: 'Apply function to items of iterable', insertText: 'map(${1:int}, ${2:input().split()})', priority: 1 },

  // CP Stdlib Snippets
  { label: 'fast_input', kind: 'Snippet', detail: 'sys.stdin.readline fast I/O', insertText: 'import sys\ninput = sys.stdin.readline', priority: 2 },
  { label: 'map_int_input', kind: 'Snippet', detail: 'Read multiple integers from line', insertText: 'map(int, input().split())', priority: 2 },
  { label: 'list_int_input', kind: 'Snippet', detail: 'Read integer array from line', insertText: 'list(map(int, input().split()))', priority: 2 },
  { label: 'deque', kind: 'Class', detail: 'Double-ended queue (collections.deque)', insertText: 'deque()', priority: 2 },
  { label: 'Counter', kind: 'Class', detail: 'Frequency counter dict (collections.Counter)', insertText: 'Counter(${1})', priority: 2 },
  { label: 'defaultdict', kind: 'Class', detail: 'Dictionary with default factory', insertText: 'defaultdict(${1:int})', priority: 2 },
  { label: 'heappush', kind: 'Function', detail: 'Push value onto heap', insertText: 'heapq.heappush(${1:h}, ${2:val})', priority: 2 },
  { label: 'heappop', kind: 'Function', detail: 'Pop smallest value from heap', insertText: 'heapq.heappop(${1:h})', priority: 2 },
  { label: 'bisect_left', kind: 'Function', detail: 'Binary search leftmost insertion index', insertText: 'bisect.bisect_left(${1:arr}, ${2:x})', priority: 2 },
  { label: 'bisect_right', kind: 'Function', detail: 'Binary search rightmost insertion index', insertText: 'bisect.bisect_right(${1:arr}, ${2:x})', priority: 2 },

  // Member Methods (isMemberOnly: true)
  { label: 'append', kind: 'Method', detail: 'Append item to end of list', insertText: 'append(${1})', isMemberOnly: true, priority: 3 },
  { label: 'extend', kind: 'Method', detail: 'Extend list by appending iterable elements', insertText: 'extend(${1})', isMemberOnly: true, priority: 3 },
  { label: 'pop', kind: 'Method', detail: 'Remove and return item at index (default last)', insertText: 'pop()', isMemberOnly: true, priority: 3 },
  { label: 'remove', kind: 'Method', detail: 'Remove first occurrence of value', insertText: 'remove(${1})', isMemberOnly: true, priority: 3 },
  { label: 'clear', kind: 'Method', detail: 'Remove all items from collection', insertText: 'clear()', isMemberOnly: true, priority: 3 },
  { label: 'count', kind: 'Method', detail: 'Return number of occurrences of value', insertText: 'count(${1})', isMemberOnly: true, priority: 3 },
  { label: 'index', kind: 'Method', detail: 'Return index of first occurrence', insertText: 'index(${1})', isMemberOnly: true, priority: 3 },
  { label: 'insert', kind: 'Method', detail: 'Insert item before index', insertText: 'insert(${1:index}, ${2:value})', isMemberOnly: true, priority: 3 },
  { label: 'keys', kind: 'Method', detail: 'Dictionary keys view', insertText: 'keys()', isMemberOnly: true, priority: 3 },
  { label: 'values', kind: 'Method', detail: 'Dictionary values view', insertText: 'values()', isMemberOnly: true, priority: 3 },
  { label: 'items', kind: 'Method', detail: 'Dictionary (key, value) pairs view', insertText: 'items()', isMemberOnly: true, priority: 3 },
  { label: 'get', kind: 'Method', detail: 'Get value for key with optional default', insertText: 'get(${1:key}, ${2:None})', isMemberOnly: true, priority: 3 },
  { label: 'split', kind: 'Method', detail: 'Split string by delimiter (default whitespace)', insertText: 'split()', isMemberOnly: true, priority: 3 },
  { label: 'strip', kind: 'Method', detail: 'Remove leading and trailing whitespace', insertText: 'strip()', isMemberOnly: true, priority: 3 },
  { label: 'join', kind: 'Method', detail: 'Concatenate iterable of strings', insertText: 'join(${1})', isMemberOnly: true, priority: 3 }
];

const INTELLISENSE_JAVA = [
  { label: 'public', kind: 'Keyword', detail: 'Public access modifier', insertText: 'public ', isGlobalAllowed: true, priority: 0 },
  { label: 'private', kind: 'Keyword', detail: 'Private access modifier', insertText: 'private ', isGlobalAllowed: true, priority: 0 },
  { label: 'static', kind: 'Keyword', detail: 'Static member modifier', insertText: 'static ', isGlobalAllowed: true, priority: 0 },
  { label: 'final', kind: 'Keyword', detail: 'Final variable or class specifier', insertText: 'final ', isGlobalAllowed: true, priority: 0 },
  { label: 'class', kind: 'Keyword', detail: 'Class definition', insertText: 'class ${1:Main} {\n    ${0}\n}', isGlobalAllowed: true, priority: 0 },
  { label: 'void', kind: 'Keyword', detail: 'Void return type', insertText: 'void ', isGlobalAllowed: true, priority: 0 },
  { label: 'int', kind: 'Keyword', detail: '32-bit signed primitive integer', insertText: 'int ', isGlobalAllowed: true, priority: 0 },
  { label: 'long', kind: 'Keyword', detail: '64-bit signed primitive integer', insertText: 'long ', isGlobalAllowed: true, priority: 0 },
  { label: 'double', kind: 'Keyword', detail: 'Double precision floating point', insertText: 'double ', isGlobalAllowed: true, priority: 0 },
  { label: 'boolean', kind: 'Keyword', detail: 'Boolean primitive type', insertText: 'boolean ', isGlobalAllowed: true, priority: 0 },
  { label: 'char', kind: 'Keyword', detail: '16-bit Unicode character type', insertText: 'char ', isGlobalAllowed: true, priority: 0 },
  { label: 'String', kind: 'Class', detail: 'Immutable sequence of characters', insertText: 'String ', isGlobalAllowed: true, priority: 0 },
  { label: 'new', kind: 'Keyword', detail: 'Instantiate new object or array', insertText: 'new ', priority: 0 },
  { label: 'return', kind: 'Keyword', detail: 'Return from method', insertText: 'return ${1};', isStatement: true, priority: 0 },
  { label: 'if', kind: 'Snippet', detail: 'If conditional statement', insertText: 'if (${1:condition}) {\n    ${0}\n}', isStatement: true, priority: 0 },
  { label: 'for', kind: 'Snippet', detail: 'For loop', insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n    ${0}\n}', isStatement: true, priority: 0 },
  { label: 'while', kind: 'Snippet', detail: 'While loop', insertText: 'while (${1:condition}) {\n    ${0}\n}', isStatement: true, priority: 0 },
  { label: 'System.out.println', kind: 'Snippet', detail: 'Print to standard output with newline', insertText: 'System.out.println(${1});', isStatement: true, priority: 1 },
  { label: 'Scanner', kind: 'Class', detail: 'java.util.Scanner', insertText: 'Scanner sc = new Scanner(System.in);', isStatement: true, priority: 1 },
  { label: 'Arrays.sort', kind: 'Function', detail: 'Sort array elements java.util.Arrays', insertText: 'Arrays.sort(${1:arr});', isStatement: true, priority: 1 },
  { label: 'ArrayList', kind: 'Class', detail: 'java.util.ArrayList dynamic resizable array', insertText: 'ArrayList<${1:Integer}> ${2:list} = new ArrayList<>();', isGlobalAllowed: true, priority: 1 },
  { label: 'HashMap', kind: 'Class', detail: 'java.util.HashMap hash table map', insertText: 'HashMap<${1:Integer}, ${2:Integer}> ${3:map} = new HashMap<>();', isGlobalAllowed: true, priority: 1 },
  { label: 'HashSet', kind: 'Class', detail: 'java.util.HashSet hash set of unique elements', insertText: 'HashSet<${1:Integer}> ${2:set} = new HashSet<>();', isGlobalAllowed: true, priority: 1 },
  // Methods
  { label: 'add', kind: 'Method', detail: 'Add element to collection', insertText: 'add(${1});', isMemberOnly: true, priority: 2 },
  { label: 'get', kind: 'Method', detail: 'Get element at index or by key', insertText: 'get(${1})', isMemberOnly: true, priority: 2 },
  { label: 'size', kind: 'Method', detail: 'Number of elements in collection', insertText: 'size()', isMemberOnly: true, priority: 2 },
  { label: 'length', kind: 'Method', detail: 'Length of string or array', insertText: 'length()', isMemberOnly: true, priority: 2 }
];

const INTELLISENSE_RUST = [
  { label: 'fn', kind: 'Keyword', detail: 'Define a function', insertText: 'fn ${1:name}(${2}) {\n    ${0}\n}', isGlobalAllowed: true, priority: 0 },
  { label: 'let', kind: 'Keyword', detail: 'Bind variable', insertText: 'let ${1:x} = ${2};', isStatement: true, priority: 0 },
  { label: 'let mut', kind: 'Keyword', detail: 'Bind mutable variable', insertText: 'let mut ${1:x} = ${2};', isStatement: true, priority: 0 },
  { label: 'mut', kind: 'Keyword', detail: 'Mutable binding modifier', insertText: 'mut ', priority: 0 },
  { label: 'struct', kind: 'Keyword', detail: 'Define a struct', insertText: 'struct ${1:Name} {\n    ${0}\n}', isGlobalAllowed: true, priority: 0 },
  { label: 'impl', kind: 'Keyword', detail: 'Implement methods or trait', insertText: 'impl ${1:Name} {\n    ${0}\n}', isGlobalAllowed: true, priority: 0 },
  { label: 'return', kind: 'Keyword', detail: 'Return expression', insertText: 'return ${1};', isStatement: true, priority: 0 },
  { label: 'if', kind: 'Snippet', detail: 'If conditional expression', insertText: 'if ${1:condition} {\n    ${0}\n}', isStatement: true, priority: 0 },
  { label: 'for', kind: 'Snippet', detail: 'For loop over iterator', insertText: 'for ${1:i} in 0..${2:n} {\n    ${0}\n}', isStatement: true, priority: 0 },
  { label: 'while', kind: 'Snippet', detail: 'While loop', insertText: 'while ${1:condition} {\n    ${0}\n}', isStatement: true, priority: 0 },
  { label: 'loop', kind: 'Snippet', detail: 'Infinite loop', insertText: 'loop {\n    ${0}\n}', isStatement: true, priority: 0 },
  { label: 'match', kind: 'Snippet', detail: 'Pattern match expression', insertText: 'match ${1:expr} {\n    ${2:pat} => ${0},\n}', isStatement: true, priority: 0 },
  { label: 'println!', kind: 'Snippet', detail: 'Print line to stdout macro', insertText: 'println!("${1:{}", ${2:val});', isStatement: true, priority: 1 },
  { label: 'print!', kind: 'Snippet', detail: 'Print to stdout macro', insertText: 'print!("${1:{}", ${2:val});', isStatement: true, priority: 1 },
  { label: 'vec!', kind: 'Snippet', detail: 'Create a Vec dynamic array', insertText: 'vec![${1:0}; ${2:n}]', priority: 1 },
  { label: 'i32', kind: 'Keyword', detail: '32-bit signed integer type', insertText: 'i32', isGlobalAllowed: true, priority: 1 },
  { label: 'i64', kind: 'Keyword', detail: '64-bit signed integer type', insertText: 'i64', isGlobalAllowed: true, priority: 1 },
  { label: 'usize', kind: 'Keyword', detail: 'Pointer-sized unsigned integer type', insertText: 'usize', isGlobalAllowed: true, priority: 1 },
  { label: 'Vec', kind: 'Class', detail: 'std::vec::Vec dynamic array', insertText: 'Vec<${1:i32}>', isGlobalAllowed: true, priority: 1 },
  { label: 'String', kind: 'Class', detail: 'Growable UTF-8 string', insertText: 'String', isGlobalAllowed: true, priority: 1 },
  // Methods
  { label: 'push', kind: 'Method', detail: 'Append element to Vec', insertText: 'push(${1});', isMemberOnly: true, priority: 2 },
  { label: 'pop', kind: 'Method', detail: 'Remove and return last element', insertText: 'pop()', isMemberOnly: true, priority: 2 },
  { label: 'len', kind: 'Method', detail: 'Number of elements', insertText: 'len()', isMemberOnly: true, priority: 2 },
  { label: 'is_empty', kind: 'Method', detail: 'Check if collection has 0 elements', insertText: 'is_empty()', isMemberOnly: true, priority: 2 }
];

const INTELLISENSE_GO = [
  { label: 'package main', kind: 'Snippet', detail: 'Main package declaration', insertText: 'package main\n', isGlobalAllowed: true, priority: 0 },
  { label: 'import', kind: 'Keyword', detail: 'Import declaration', insertText: 'import (\n    "${1:fmt}"\n)', isGlobalAllowed: true, priority: 0 },
  { label: 'func', kind: 'Keyword', detail: 'Function definition', insertText: 'func ${1:name}(${2}) ${3} {\n    ${0}\n}', isGlobalAllowed: true, priority: 0 },
  { label: 'func main()', kind: 'Snippet', detail: 'Go main entry function', insertText: 'func main() {\n    ${0}\n}', isGlobalAllowed: true, priority: 0 },
  { label: 'var', kind: 'Keyword', detail: 'Variable declaration', insertText: 'var ${1:name} ${2:int}', isGlobalAllowed: true, priority: 0 },
  { label: 'const', kind: 'Keyword', detail: 'Constant declaration', insertText: 'const ${1:name} = ${2}', isGlobalAllowed: true, priority: 0 },
  { label: 'return', kind: 'Keyword', detail: 'Return statement', insertText: 'return ${1}', isStatement: true, priority: 0 },
  { label: 'if', kind: 'Snippet', detail: 'If condition', insertText: 'if ${1:condition} {\n    ${0}\n}', isStatement: true, priority: 0 },
  { label: 'for', kind: 'Snippet', detail: 'For loop', insertText: 'for ${1:i} := 0; ${1:i} < ${2:n}; ${1:i}++ {\n    ${0}\n}', isStatement: true, priority: 0 },
  { label: 'for range', kind: 'Snippet', detail: 'For range loop', insertText: 'for ${1:i}, ${2:val} := range ${3:slice} {\n    ${0}\n}', isStatement: true, priority: 0 },
  { label: 'make', kind: 'Function', detail: 'Allocate and initialize slice/map/chan', insertText: 'make([]${1:int}, ${2:n})', priority: 1 },
  { label: 'append', kind: 'Function', detail: 'Append elements to a slice', insertText: 'append(${1:slice}, ${2:val})', priority: 1 },
  { label: 'len', kind: 'Function', detail: 'Length of slice/map/string', insertText: 'len(${1})', priority: 1 },
  { label: 'fmt.Println', kind: 'Function', detail: 'Print to stdout with newline', insertText: 'fmt.Println(${1})', isStatement: true, priority: 1 },
  { label: 'fmt.Printf', kind: 'Function', detail: 'Formatted print to stdout', insertText: 'fmt.Printf("${1:%v\\n}", ${2:val})', isStatement: true, priority: 1 },
  { label: 'int', kind: 'Keyword', detail: 'Signed integer type', insertText: 'int', isGlobalAllowed: true, priority: 1 },
  { label: 'int64', kind: 'Keyword', detail: '64-bit signed integer type', insertText: 'int64', isGlobalAllowed: true, priority: 1 },
  { label: 'string', kind: 'Keyword', detail: 'String type', insertText: 'string', isGlobalAllowed: true, priority: 1 }
];

const INTELLISENSE_JS = [
  { label: 'const', kind: 'Keyword', detail: 'Declare constant variable', insertText: 'const ${1:name} = ${2};', isGlobalAllowed: true, priority: 0 },
  { label: 'let', kind: 'Keyword', detail: 'Declare block-scoped variable', insertText: 'let ${1:name} = ${2};', isGlobalAllowed: true, priority: 0 },
  { label: 'function', kind: 'Keyword', detail: 'Function declaration', insertText: 'function ${1:name}(${2}) {\n    ${0}\n}', isGlobalAllowed: true, priority: 0 },
  { label: 'return', kind: 'Keyword', detail: 'Return from function', insertText: 'return ${1};', isStatement: true, priority: 0 },
  { label: 'if', kind: 'Snippet', detail: 'If statement', insertText: 'if (${1:condition}) {\n    ${0}\n}', isStatement: true, priority: 0 },
  { label: 'for', kind: 'Snippet', detail: 'For loop', insertText: 'for (let ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n    ${0}\n}', isStatement: true, priority: 0 },
  { label: 'while', kind: 'Snippet', detail: 'While loop', insertText: 'while (${1:condition}) {\n    ${0}\n}', isStatement: true, priority: 0 },
  { label: 'console.log', kind: 'Snippet', detail: 'Output message to console', insertText: 'console.log(${1});', isStatement: true, priority: 1 },
  { label: 'Math.min', kind: 'Function', detail: 'Smallest of given numbers', insertText: 'Math.min(${1:a}, ${2:b})', priority: 1 },
  { label: 'Math.max', kind: 'Function', detail: 'Largest of given numbers', insertText: 'Math.max(${1:a}, ${2:b})', priority: 1 },
  { label: 'Math.abs', kind: 'Function', detail: 'Absolute value of number', insertText: 'Math.abs(${1:x})', priority: 1 },
  { label: 'parseInt', kind: 'Function', detail: 'Parse string to integer', insertText: 'parseInt(${1:str}, 10)', priority: 1 },
  // Methods
  { label: 'push', kind: 'Method', detail: 'Append elements to array', insertText: 'push(${1});', isMemberOnly: true, priority: 2 },
  { label: 'pop', kind: 'Method', detail: 'Remove last element from array', insertText: 'pop()', isMemberOnly: true, priority: 2 },
  { label: 'slice', kind: 'Method', detail: 'Extract section of array or string', insertText: 'slice(${1:start}, ${2:end})', isMemberOnly: true, priority: 2 },
  { label: 'map', kind: 'Method', detail: 'Create array with results of callback', insertText: 'map(${1:x} => ${0})', isMemberOnly: true, priority: 2 },
  { label: 'filter', kind: 'Method', detail: 'Filter array elements by predicate', insertText: 'filter(${1:x} => ${0})', isMemberOnly: true, priority: 2 },
  { label: 'length', kind: 'Property', detail: 'Length of array or string', insertText: 'length', isMemberOnly: true, priority: 2 }
];

const INTELLISENSE_CSHARP = [
  { label: 'using', kind: 'Keyword', detail: 'Using directive or statement', insertText: 'using ${1:System};', isGlobalAllowed: true, priority: 0 },
  { label: 'namespace', kind: 'Keyword', detail: 'Namespace declaration', insertText: 'namespace ${1:Solution} {\n    ${0}\n}', isGlobalAllowed: true, priority: 0 },
  { label: 'class', kind: 'Keyword', detail: 'Class definition', insertText: 'class ${1:Program} {\n    ${0}\n}', isGlobalAllowed: true, priority: 0 },
  { label: 'struct', kind: 'Keyword', detail: 'Struct definition', insertText: 'struct ${1:Point} {\n    ${0}\n}', isGlobalAllowed: true, priority: 0 },
  { label: 'static', kind: 'Keyword', detail: 'Static member modifier', insertText: 'static ', isGlobalAllowed: true, priority: 0 },
  { label: 'void', kind: 'Keyword', detail: 'Void return type', insertText: 'void ', isGlobalAllowed: true, priority: 0 },
  { label: 'int', kind: 'Keyword', detail: '32-bit signed integer', insertText: 'int ', isGlobalAllowed: true, priority: 0 },
  { label: 'long', kind: 'Keyword', detail: '64-bit signed integer', insertText: 'long ', isGlobalAllowed: true, priority: 0 },
  { label: 'double', kind: 'Keyword', detail: 'Double precision floating point', insertText: 'double ', isGlobalAllowed: true, priority: 0 },
  { label: 'float', kind: 'Keyword', detail: 'Single precision floating point', insertText: 'float ', isGlobalAllowed: true, priority: 0 },
  { label: 'bool', kind: 'Keyword', detail: 'Boolean primitive type', insertText: 'bool ', isGlobalAllowed: true, priority: 0 },
  { label: 'char', kind: 'Keyword', detail: 'Character primitive type', insertText: 'char ', isGlobalAllowed: true, priority: 0 },
  { label: 'string', kind: 'Keyword', detail: 'String reference type', insertText: 'string ', isGlobalAllowed: true, priority: 0 },
  { label: 'var', kind: 'Keyword', detail: 'Implicitly-typed local variable', insertText: 'var ', isStatement: true, priority: 0 },
  { label: 'new', kind: 'Keyword', detail: 'Instantiate object or array', insertText: 'new ', priority: 0 },
  { label: 'return', kind: 'Keyword', detail: 'Return from method', insertText: 'return ${1};', isStatement: true, priority: 0 },
  { label: 'if', kind: 'Snippet', detail: 'If conditional statement', insertText: 'if (${1:condition}) {\n    ${0}\n}', isStatement: true, priority: 0 },
  { label: 'else', kind: 'Keyword', detail: 'Else branch', insertText: 'else {\n    ${0}\n}', isStatement: true, priority: 0 },
  { label: 'for', kind: 'Snippet', detail: 'For loop', insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n    ${0}\n}', isStatement: true, priority: 0 },
  { label: 'foreach', kind: 'Snippet', detail: 'Foreach loop over collection', insertText: 'foreach (var ${1:item} in ${2:collection}) {\n    ${0}\n}', isStatement: true, priority: 0 },
  { label: 'while', kind: 'Snippet', detail: 'While loop', insertText: 'while (${1:condition}) {\n    ${0}\n}', isStatement: true, priority: 0 },
  { label: 'break', kind: 'Keyword', detail: 'Break from loop or switch', insertText: 'break;', isStatement: true, priority: 0 },
  { label: 'continue', kind: 'Keyword', detail: 'Continue to next loop iteration', insertText: 'continue;', isStatement: true, priority: 0 },
  // I/O & CP Utilities
  { label: 'Console.WriteLine', kind: 'Snippet', detail: 'Print to standard output with newline', insertText: 'Console.WriteLine(${1});', isStatement: true, priority: 1 },
  { label: 'Console.Write', kind: 'Snippet', detail: 'Print to standard output without newline', insertText: 'Console.Write(${1});', isStatement: true, priority: 1 },
  { label: 'Console.ReadLine', kind: 'Snippet', detail: 'Read line from standard input', insertText: 'Console.ReadLine()', isStatement: true, priority: 1 },
  { label: 'read_ints', kind: 'Snippet', detail: 'Read array of ints from input line', insertText: 'Console.ReadLine().Split(\' \', StringSplitOptions.RemoveEmptyEntries).Select(int.Parse).ToArray()', isStatement: true, priority: 1 },
  { label: 'int.Parse', kind: 'Function', detail: 'Parse string to 32-bit int', insertText: 'int.Parse(${1:Console.ReadLine()})', isStatement: true, priority: 1 },
  { label: 'long.Parse', kind: 'Function', detail: 'Parse string to 64-bit long', insertText: 'long.Parse(${1:Console.ReadLine()})', isStatement: true, priority: 1 },
  { label: 'Math.Min', kind: 'Function', detail: 'Returns smaller of two values', insertText: 'Math.Min(${1:a}, ${2:b})', priority: 1 },
  { label: 'Math.Max', kind: 'Function', detail: 'Returns larger of two values', insertText: 'Math.Max(${1:a}, ${2:b})', priority: 1 },
  { label: 'Math.Abs', kind: 'Function', detail: 'Absolute value of number', insertText: 'Math.Abs(${1:x})', priority: 1 },
  { label: 'Array.Sort', kind: 'Function', detail: 'Sort one-dimensional array', insertText: 'Array.Sort(${1:arr});', isStatement: true, priority: 1 },
  // Collections
  { label: 'List', kind: 'Class', detail: 'List<T> dynamic array', insertText: 'List<${1:int}> ${2:list} = new List<${1:int}>();', isStatement: true, priority: 1 },
  { label: 'Dictionary', kind: 'Class', detail: 'Dictionary<TKey, TValue> hash map', insertText: 'Dictionary<${1:int}, ${2:int}> ${3:map} = new Dictionary<${1:int}, ${2:int}>();', isStatement: true, priority: 1 },
  { label: 'HashSet', kind: 'Class', detail: 'HashSet<T> unique set', insertText: 'HashSet<${1:int}> ${2:set} = new HashSet<${1:int}>();', isStatement: true, priority: 1 },
  { label: 'Queue', kind: 'Class', detail: 'Queue<T> FIFO queue', insertText: 'Queue<${1:int}> ${2:q} = new Queue<${1:int}>();', isStatement: true, priority: 1 },
  { label: 'Stack', kind: 'Class', detail: 'Stack<T> LIFO stack', insertText: 'Stack<${1:int}> ${2:stk} = new Stack<${1:int}>();', isStatement: true, priority: 1 },
  { label: 'PriorityQueue', kind: 'Class', detail: 'PriorityQueue<TElement, TPriority>', insertText: 'PriorityQueue<${1:int}, ${2:int}> ${3:pq} = new PriorityQueue<${1:int}, ${2:int}>();', isStatement: true, priority: 1 },
  // Methods
  { label: 'Add', kind: 'Method', detail: 'Add element to collection', insertText: 'Add(${1});', isMemberOnly: true, priority: 2 },
  { label: 'Remove', kind: 'Method', detail: 'Remove element from collection', insertText: 'Remove(${1});', isMemberOnly: true, priority: 2 },
  { label: 'Contains', kind: 'Method', detail: 'Check if collection contains element', insertText: 'Contains(${1})', isMemberOnly: true, priority: 2 },
  { label: 'ContainsKey', kind: 'Method', detail: 'Check if dictionary contains key', insertText: 'ContainsKey(${1})', isMemberOnly: true, priority: 2 },
  { label: 'Count', kind: 'Property', detail: 'Number of elements in collection', insertText: 'Count', isMemberOnly: true, priority: 2 },
  { label: 'Length', kind: 'Property', detail: 'Length of array or string', insertText: 'Length', isMemberOnly: true, priority: 2 },
  { label: 'Clear', kind: 'Method', detail: 'Remove all elements', insertText: 'Clear();', isMemberOnly: true, priority: 2 },
  { label: 'ToArray', kind: 'Method', detail: 'Convert IEnumerable to array', insertText: 'ToArray()', isMemberOnly: true, priority: 2 },
  { label: 'ToList', kind: 'Method', detail: 'Convert IEnumerable to List', insertText: 'ToList()', isMemberOnly: true, priority: 2 },
  { label: 'Select', kind: 'Method', detail: 'LINQ projection', insertText: 'Select(${1:x} => ${0})', isMemberOnly: true, priority: 2 },
  { label: 'Where', kind: 'Method', detail: 'LINQ filter predicate', insertText: 'Where(${1:x} => ${0})', isMemberOnly: true, priority: 2 },
  { label: 'OrderBy', kind: 'Method', detail: 'LINQ sort ascending', insertText: 'OrderBy(${1:x} => ${0})', isMemberOnly: true, priority: 2 }
];

const INTELLISENSE_KOTLIN = [
  { label: 'fun', kind: 'Keyword', detail: 'Function definition', insertText: 'fun ${1:solve}() {\n    ${0}\n}', isGlobalAllowed: true, priority: 0 },
  { label: 'fun main()', kind: 'Snippet', detail: 'Kotlin main entry point', insertText: 'fun main() {\n    val t = readln().toInt()\n    repeat(t) {\n        ${0}\n    }\n}', isGlobalAllowed: true, priority: 0 },
  { label: 'val', kind: 'Keyword', detail: 'Read-only variable declaration', insertText: 'val ${1:x} = ${2}', priority: 0 },
  { label: 'var', kind: 'Keyword', detail: 'Mutable variable declaration', insertText: 'var ${1:x} = ${2}', priority: 0 },
  { label: 'class', kind: 'Keyword', detail: 'Class definition', insertText: 'class ${1:Name} {\n    ${0}\n}', isGlobalAllowed: true, priority: 0 },
  { label: 'data class', kind: 'Snippet', detail: 'Data class definition', insertText: 'data class ${1:Point}(val ${2:x}: Int, val ${3:y}: Int)', isGlobalAllowed: true, priority: 0 },
  { label: 'if', kind: 'Snippet', detail: 'If conditional expression', insertText: 'if (${1:condition}) {\n    ${0}\n}', isStatement: true, priority: 0 },
  { label: 'else', kind: 'Keyword', detail: 'Else branch', insertText: 'else {\n    ${0}\n}', isStatement: true, priority: 0 },
  { label: 'when', kind: 'Snippet', detail: 'When conditional expression (switch)', insertText: 'when (${1:x}) {\n    ${2:val} -> ${0}\n    else -> {}\n}', isStatement: true, priority: 0 },
  { label: 'for', kind: 'Snippet', detail: 'For loop over range or collection', insertText: 'for (${1:i} in 0 until ${2:n}) {\n    ${0}\n}', isStatement: true, priority: 0 },
  { label: 'repeat', kind: 'Snippet', detail: 'Repeat block n times', insertText: 'repeat(${1:t}) {\n    ${0}\n}', isStatement: true, priority: 0 },
  { label: 'while', kind: 'Snippet', detail: 'While loop', insertText: 'while (${1:condition}) {\n    ${0}\n}', isStatement: true, priority: 0 },
  { label: 'return', kind: 'Keyword', detail: 'Return from function', insertText: 'return ${1}', isStatement: true, priority: 0 },
  { label: 'break', kind: 'Keyword', detail: 'Break from loop', insertText: 'break', isStatement: true, priority: 0 },
  { label: 'continue', kind: 'Keyword', detail: 'Continue to next loop iteration', insertText: 'continue', isStatement: true, priority: 0 },
  // Types
  { label: 'Int', kind: 'Class', detail: '32-bit signed integer', insertText: 'Int', isGlobalAllowed: true, priority: 1 },
  { label: 'Long', kind: 'Class', detail: '64-bit signed integer', insertText: 'Long', isGlobalAllowed: true, priority: 1 },
  { label: 'Double', kind: 'Class', detail: 'Double precision floating point', insertText: 'Double', isGlobalAllowed: true, priority: 1 },
  { label: 'Boolean', kind: 'Class', detail: 'Boolean type', insertText: 'Boolean', isGlobalAllowed: true, priority: 1 },
  { label: 'String', kind: 'Class', detail: 'String type', insertText: 'String', isGlobalAllowed: true, priority: 1 },
  { label: 'IntArray', kind: 'Class', detail: 'Array of primitive integers', insertText: 'IntArray(${1:n})', priority: 1 },
  { label: 'LongArray', kind: 'Class', detail: 'Array of primitive longs', insertText: 'LongArray(${1:n})', priority: 1 },
  // I/O & CP Utilities
  { label: 'println', kind: 'Function', detail: 'Print to stdout with newline', insertText: 'println(${1})', isStatement: true, priority: 1 },
  { label: 'print', kind: 'Function', detail: 'Print to stdout without newline', insertText: 'print(${1})', isStatement: true, priority: 1 },
  { label: 'readln', kind: 'Function', detail: 'Read line from standard input', insertText: 'readln()', priority: 1 },
  { label: 'read_ints', kind: 'Snippet', detail: 'Read multiple integers from line', insertText: 'readln().split(" ").map { it.toInt() }', isStatement: true, priority: 1 },
  { label: 'read_int_array', kind: 'Snippet', detail: 'Read IntArray from line', insertText: 'readln().split(" ").map { it.toInt() }.toIntArray()', isStatement: true, priority: 1 },
  { label: 'minOf', kind: 'Function', detail: 'Return smallest of values', insertText: 'minOf(${1:a}, ${2:b})', priority: 1 },
  { label: 'maxOf', kind: 'Function', detail: 'Return largest of values', insertText: 'maxOf(${1:a}, ${2:b})', priority: 1 },
  { label: 'kotlin.math.abs', kind: 'Function', detail: 'Absolute value', insertText: 'kotlin.math.abs(${1:x})', priority: 1 },
  // Collections
  { label: 'mutableListOf', kind: 'Function', detail: 'Create mutable List', insertText: 'mutableListOf<${1:Int}>()', priority: 1 },
  { label: 'listOf', kind: 'Function', detail: 'Create read-only List', insertText: 'listOf(${1})', priority: 1 },
  { label: 'mutableMapOf', kind: 'Function', detail: 'Create mutable Map', insertText: 'mutableMapOf<${1:Int}, ${2:Int}>()', priority: 1 },
  { label: 'mutableSetOf', kind: 'Function', detail: 'Create mutable Set', insertText: 'mutableSetOf<${1:Int}>()', priority: 1 },
  { label: 'ArrayList', kind: 'Class', detail: 'java.util.ArrayList', insertText: 'ArrayList<${1:Int}>()', priority: 1 },
  { label: 'HashMap', kind: 'Class', detail: 'java.util.HashMap', insertText: 'HashMap<${1:Int}, ${2:Int}>()', priority: 1 },
  { label: 'HashSet', kind: 'Class', detail: 'java.util.HashSet', insertText: 'HashSet<${1:Int}>()', priority: 1 },
  { label: 'ArrayDeque', kind: 'Class', detail: 'Double-ended queue ArrayDeque', insertText: 'ArrayDeque<${1:Int}>()', priority: 1 },
  // Methods
  { label: 'add', kind: 'Method', detail: 'Add element to collection', insertText: 'add(${1})', isMemberOnly: true, priority: 2 },
  { label: 'remove', kind: 'Method', detail: 'Remove element from collection', insertText: 'remove(${1})', isMemberOnly: true, priority: 2 },
  { label: 'contains', kind: 'Method', detail: 'Check if element exists', insertText: 'contains(${1})', isMemberOnly: true, priority: 2 },
  { label: 'size', kind: 'Property', detail: 'Number of elements', insertText: 'size', isMemberOnly: true, priority: 2 },
  { label: 'isEmpty', kind: 'Method', detail: 'Check if collection is empty', insertText: 'isEmpty()', isMemberOnly: true, priority: 2 },
  { label: 'clear', kind: 'Method', detail: 'Remove all elements', insertText: 'clear()', isMemberOnly: true, priority: 2 },
  { label: 'sort', kind: 'Method', detail: 'Sort mutable list or array in-place', insertText: 'sort()', isMemberOnly: true, priority: 2 },
  { label: 'sorted', kind: 'Method', detail: 'Return sorted copy of collection', insertText: 'sorted()', isMemberOnly: true, priority: 2 },
  { label: 'sortedDescending', kind: 'Method', detail: 'Return descending sorted copy', insertText: 'sortedDescending()', isMemberOnly: true, priority: 2 },
  { label: 'sum', kind: 'Method', detail: 'Sum of all elements', insertText: 'sum()', isMemberOnly: true, priority: 2 },
  { label: 'filter', kind: 'Method', detail: 'Filter collection by predicate', insertText: 'filter { ${1:it} ${0} }', isMemberOnly: true, priority: 2 },
  { label: 'map', kind: 'Method', detail: 'Transform elements of collection', insertText: 'map { ${1:it} ${0} }', isMemberOnly: true, priority: 2 },
  { label: 'toInt', kind: 'Method', detail: 'Convert to Int', insertText: 'toInt()', isMemberOnly: true, priority: 2 },
  { label: 'toLong', kind: 'Method', detail: 'Convert to Long', insertText: 'toLong()', isMemberOnly: true, priority: 2 }
];

const LANGUAGE_DICT_MAP = {
  cpp: INTELLISENSE_CPP,
  c: INTELLISENSE_CPP,
  python: INTELLISENSE_PYTHON,
  java: INTELLISENSE_JAVA,
  rust: INTELLISENSE_RUST,
  go: INTELLISENSE_GO,
  javascript: INTELLISENSE_JS,
  csharp: INTELLISENSE_CSHARP,
  kotlin: INTELLISENSE_KOTLIN
};

// Global exports
if (typeof globalThis !== 'undefined') {
  globalThis.CP_TEMPLATES = CP_TEMPLATES;
  globalThis.CP_SNIPPETS = CP_SNIPPETS;
  globalThis.STL_COMPLETIONS_CPP = INTELLISENSE_CPP;
  globalThis.LANGUAGE_DICT_MAP = LANGUAGE_DICT_MAP;
  globalThis.INTELLISENSE_CPP = INTELLISENSE_CPP;
  globalThis.INTELLISENSE_PYTHON = INTELLISENSE_PYTHON;
  globalThis.INTELLISENSE_JAVA = INTELLISENSE_JAVA;
  globalThis.INTELLISENSE_RUST = INTELLISENSE_RUST;
  globalThis.INTELLISENSE_GO = INTELLISENSE_GO;
  globalThis.INTELLISENSE_JS = INTELLISENSE_JS;
  globalThis.INTELLISENSE_CSHARP = INTELLISENSE_CSHARP;
  globalThis.INTELLISENSE_KOTLIN = INTELLISENSE_KOTLIN;
}

