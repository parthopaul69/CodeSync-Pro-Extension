// CodeSync Pro — Cloud Code Execution Layer (Paiza.IO, Judge0 & Piston)
'use strict';

class CodeExecutor {
  constructor() {
    this.provider = 'paiza'; // 'paiza', 'judge0', or 'piston'
    this.customUrl = '';
    this.apiKey = '';
    this.timeoutSec = 5;
    this.loadSettings();
  }

  async loadSettings() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const data = await chrome.storage.local.get(['execApi', 'execApiUrl', 'execApiKey', 'execTimeout']);
        if (data.execApi) this.provider = data.execApi;
        if (data.execApiUrl) this.customUrl = data.execApiUrl;
        if (data.execApiKey) this.apiKey = data.execApiKey;
        if (data.execTimeout) this.timeoutSec = data.execTimeout;
      }
    } catch (e) {
      console.warn('[CodeExecutor] Failed to load settings:', e);
    }
  }

  /**
   * Execute source code with stdin against cloud runner
   * @param {string} sourceCode 
   * @param {string} language - e.g. 'cpp', 'c', 'python', 'java', 'rust', 'go', 'javascript', 'csharp', 'kotlin'
   * @param {string} stdin
   * @returns {Promise<{stdout: string, stderr: string, exitCode: number, timeMs: number, memoryKb: number, status: string}>}
   */
  async execute(sourceCode, language, stdin = '') {
    await this.loadSettings();

    // 1. Custom or Piston explicitly selected
    if (this.provider === 'piston' || this.customUrl) {
      try {
        return await this.executePiston(sourceCode, language, stdin);
      } catch (err) {
        console.warn('[CodeExecutor] Piston failed, falling back to Paiza.IO:', err);
        return await this.executePaiza(sourceCode, language, stdin);
      }
    }

    // 2. Judge0 explicitly selected
    if (this.provider === 'judge0') {
      try {
        return await this.executeJudge0(sourceCode, language, stdin);
      } catch (err) {
        console.warn('[CodeExecutor] Judge0 failed, falling back to Paiza.IO:', err);
        return await this.executePaiza(sourceCode, language, stdin);
      }
    }

    // 3. Default: Paiza.IO (Fast, free, clang/gcc diagnostics)
    try {
      return await this.executePaiza(sourceCode, language, stdin);
    } catch (err) {
      console.warn('[CodeExecutor] Paiza.IO failed, trying Judge0 fallback:', err);
      try {
        return await this.executeJudge0(sourceCode, language, stdin);
      } catch (jErr) {
        throw new Error(`Execution failed: ${err.message || 'Runner unavailable'}`);
      }
    }
  }

  /**
   * Compile / syntax-check source code without running it
   * @param {string} sourceCode 
   * @param {string} language 
   * @returns {Promise<{buildSuccess: boolean, status: string, stderr: string, exitCode: number}>}
   */
  async compile(sourceCode, language) {
    await this.loadSettings();

    // 1. If custom or Piston explicitly selected
    if (this.provider === 'piston' || this.customUrl) {
      try {
        const res = await this.executePiston(sourceCode, language, '');
        return {
          buildSuccess: res.status !== 'CE',
          status: res.status === 'CE' ? 'CE' : 'AC',
          stderr: res.status === 'CE' ? res.stderr : '',
          exitCode: res.status === 'CE' ? res.exitCode : 0
        };
      } catch (err) {
        console.warn('[CodeExecutor] Piston compile failed, fallback to Paiza:', err);
      }
    }

    // 2. Default: Paiza.IO for fast GCC/Clang syntax & compile diagnostics
    try {
      const langMap = {
        'cpp': 'cpp', 'c': 'c', 'python': 'python3', 'python3': 'python3', 'py': 'python3',
        'java': 'java', 'rust': 'rust', 'rs': 'rust', 'go': 'go', 'javascript': 'javascript',
        'js': 'javascript', 'csharp': 'csharp', 'cs': 'csharp', 'kotlin': 'kotlin', 'kt': 'kotlin'
      };
      const targetLang = langMap[language] || 'cpp';

      const params = new URLSearchParams();
      params.append('source_code', sourceCode);
      params.append('language', targetLang);
      params.append('input', '');
      params.append('api_key', 'guest');

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);

      try {
        const createResp = await fetch('https://api.paiza.io/runners/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
          signal: controller.signal
        });

        if (!createResp.ok) throw new Error(`Paiza HTTP ${createResp.status}`);
        const createData = await createResp.json();
        if (!createData.id) throw new Error(createData.error || 'Runner init failed');

        const jobId = createData.id;
        const startTime = Date.now();

        // Fast poll for compilation/build
        while (Date.now() - startTime < 8000) {
          await new Promise(r => setTimeout(r, 200));
          if (controller.signal.aborted) break;

          try {
            const statusResp = await fetch(`https://api.paiza.io/runners/get_status?id=${jobId}&api_key=guest`, {
              signal: controller.signal
            });
            if (statusResp.ok) {
              const statusData = await statusResp.json();
              if (statusData.status === 'completed') break;
            }
          } catch (e) {
            if (controller.signal.aborted) break;
          }
        }

        const detailsResp = await fetch(`https://api.paiza.io/runners/get_details?id=${jobId}&api_key=guest`, {
          signal: controller.signal
        });
        if (!detailsResp.ok) throw new Error(`Details HTTP ${detailsResp.status}`);
        const det = await detailsResp.json();

        // Strictly evaluate the compilation / build result
        const buildStderr = det.build_stderr || '';
        const isBuildFailure = det.build_result === 'failure' || (buildStderr && /error:/i.test(buildStderr));

        if (isBuildFailure) {
          return {
            buildSuccess: false,
            status: 'CE',
            stderr: buildStderr || det.stderr || 'Compilation Failed',
            exitCode: parseInt(det.build_exit_code) || 1
          };
        }

        // Build succeeded! Any runtime crash from running with empty stdin is ignored for compilation
        return {
          buildSuccess: true,
          status: 'AC',
          stderr: buildStderr || '',
          exitCode: 0
        };
      } finally {
        clearTimeout(timer);
      }
    } catch (paizaErr) {
      console.warn('[CodeExecutor] Paiza compile check failed, falling back to Judge0:', paizaErr);
      try {
        const jRes = await this.executeJudge0(sourceCode, language, '');
        const isCE = jRes.status === 'CE';
        return {
          buildSuccess: !isCE,
          status: isCE ? 'CE' : 'AC',
          stderr: isCE ? jRes.stderr : '',
          exitCode: isCE ? jRes.exitCode : 0
        };
      } catch (jErr) {
        throw new Error(`Compiler service error: ${paizaErr.message}`);
      }
    }
  }

  /**
   * Execute via Paiza.IO API (Fast, Free, Clang/GCC error messages with line/col)
   */
  async executePaiza(sourceCode, language, stdin = '') {
    const langMap = {
      'cpp': 'cpp',
      'c': 'c',
      'python': 'python3',
      'python3': 'python3',
      'py': 'python3',
      'java': 'java',
      'rust': 'rust',
      'rs': 'rust',
      'go': 'go',
      'javascript': 'javascript',
      'js': 'javascript',
      'csharp': 'csharp',
      'cs': 'csharp',
      'kotlin': 'kotlin',
      'kt': 'kotlin'
    };
    const targetLang = langMap[language] || 'cpp';

    const params = new URLSearchParams();
    params.append('source_code', sourceCode);
    params.append('language', targetLang);
    params.append('input', stdin || '');
    params.append('api_key', 'guest');

    const controller = new AbortController();
    const timeoutMs = (this.timeoutSec || 5) * 1000 + 4000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const createResp = await fetch('https://api.paiza.io/runners/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
        signal: controller.signal
      });

      if (!createResp.ok) {
        throw new Error(`Paiza.IO returned HTTP ${createResp.status}`);
      }

      const createData = await createResp.json();
      if (!createData.id) {
        throw new Error(createData.error || 'Failed to initialize execution job on Paiza.IO');
      }

      const jobId = createData.id;
      const startTime = Date.now();
      const maxWait = (this.timeoutSec || 5) * 1000 + 2000;

      // Fast polling loop: check status every 220ms
      while (Date.now() - startTime < maxWait) {
        await new Promise(r => setTimeout(r, 220));
        if (controller.signal.aborted) break;

        try {
          const statusResp = await fetch(`https://api.paiza.io/runners/get_status?id=${jobId}&api_key=guest`, {
            signal: controller.signal
          });
          if (statusResp.ok) {
            const statusData = await statusResp.json();
            if (statusData.status === 'completed') {
              break;
            }
          }
        } catch (pollErr) {
          // Ignore transient polling fetch error and retry
          if (controller.signal.aborted) break;
        }
      }

      // Fetch final execution details
      const detailsResp = await fetch(`https://api.paiza.io/runners/get_details?id=${jobId}&api_key=guest`, {
        signal: controller.signal
      });
      if (!detailsResp.ok) {
        throw new Error(`Failed to fetch job details: HTTP ${detailsResp.status}`);
      }

      const det = await detailsResp.json();

      // If job is still running after maxWait, report Time Limit Exceeded
      if (det.status !== 'completed') {
        return {
          stdout: '',
          stderr: `Time Limit Exceeded (${this.timeoutSec}s timeout)`,
          exitCode: -1,
          timeMs: this.timeoutSec * 1000,
          memoryKb: 0,
          status: 'TLE',
          buildSuccess: true
        };
      }

      return this.formatPaizaResult(det);
    } catch (err) {
      if (err.name === 'AbortError') {
        return {
          stdout: '',
          stderr: `Time Limit Exceeded (${this.timeoutSec}s timeout)`,
          exitCode: -1,
          timeMs: this.timeoutSec * 1000,
          memoryKb: 0,
          status: 'TLE',
          buildSuccess: true
        };
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  formatPaizaResult(det) {
    const buildStderr = det.build_stderr || '';
    const runStderr = det.stderr || '';
    const isBuildFailure = det.build_result === 'failure' || 
      (buildStderr && /error:/i.test(buildStderr)) ||
      /SyntaxError:|IndentationError:|compile error|compilation error|fatal error:/i.test(runStderr);
    const buildTimeMs = Math.round((parseFloat(det.build_time) || 0) * 1000);
    const runTimeMs = Math.round((parseFloat(det.time) || 0) * 1000);
    const memoryKb = Math.round((parseInt(det.memory || det.build_memory) || 0) / 1024);

    // 1. Compilation Error
    if (isBuildFailure) {
      return {
        stdout: det.build_stdout || '',
        stderr: buildStderr || det.stderr || 'Compilation Failed',
        exitCode: parseInt(det.build_exit_code || det.exit_code) || 1,
        timeMs: buildTimeMs || runTimeMs,
        memoryKb: memoryKb,
        status: 'CE',
        buildSuccess: false
      };
    }

    // 2. Timeout (TLE)
    if (det.result === 'timeout' || (det.result === 'failure' && det.time === '0.00' && !det.stderr && parseInt(det.exit_code) === 1)) {
      return {
        stdout: det.stdout || '',
        stderr: `Time Limit Exceeded (${this.timeoutSec}s timeout)`,
        exitCode: -1,
        timeMs: this.timeoutSec * 1000,
        memoryKb: memoryKb,
        status: 'TLE',
        buildSuccess: true
      };
    }

    // 3. Runtime Error (RTE)
    const runExitCode = parseInt(det.exit_code) || 0;
    if (det.result === 'failure' || runExitCode !== 0) {
      return {
        stdout: det.stdout || '',
        stderr: det.stderr || `Process exited with code ${runExitCode}`,
        exitCode: runExitCode,
        timeMs: runTimeMs,
        memoryKb: memoryKb,
        status: 'RTE',
        buildSuccess: true
      };
    }

    // 4. Clean execution (AC)
    return {
      stdout: det.stdout || '',
      stderr: det.stderr || '',
      exitCode: 0,
      timeMs: runTimeMs,
      memoryKb: memoryKb,
      status: 'AC',
      buildSuccess: true
    };
  }

  /**
   * Execute via Judge0 CE API
   */
  async executeJudge0(sourceCode, language, stdin) {
    const langId = (typeof JUDGE0_LANG_IDS !== 'undefined' && JUDGE0_LANG_IDS[language]) || 105;
    const baseHost = this.customUrl || (this.apiKey && !this.customUrl ? 'https://judge0-ce.p.rapidapi.com' : 'https://ce.judge0.com');
    const isRapid = baseHost.includes('rapidapi.com');

    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      if (isRapid) {
        headers['X-RapidAPI-Key'] = this.apiKey;
        headers['X-RapidAPI-Host'] = 'judge0-ce.p.rapidapi.com';
      } else {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }
    }

    const payload = {
      source_code: sourceCode,
      language_id: langId,
      stdin: stdin || ''
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), (this.timeoutSec + 4) * 1000);

    try {
      let createResp = await fetch(`${baseHost}/submissions?base64_encoded=false&wait=true`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (createResp.status === 422) {
        const legacyLangMap = { 'cpp': 54, 'py': 71, 'python': 71, 'java': 62, 'js': 63, 'go': 60, 'rs': 73 };
        if (legacyLangMap[language]) {
          payload.language_id = legacyLangMap[language];
          createResp = await fetch(`${baseHost}/submissions?base64_encoded=false&wait=true`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: controller.signal
          });
        }
      }

      if (!createResp.ok) {
        return await this.fallbackJudge0Polling(baseHost, headers, payload, controller);
      }

      const result = await createResp.json();
      return this.formatJudge0Result(result);
    } catch (err) {
      if (err.name === 'AbortError') {
        return { stdout: '', stderr: `Time Limit Exceeded (${this.timeoutSec}s timeout)`, exitCode: -1, timeMs: this.timeoutSec * 1000, memoryKb: 0, status: 'TLE' };
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async fallbackJudge0Polling(baseHost, headers, payload, controller) {
    payload.wait = false;
    const resp = await fetch(`${baseHost}/submissions?base64_encoded=false`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined
    });
    if (!resp.ok) {
      throw new Error(`Execution runner returned HTTP ${resp.status}`);
    }
    const data = await resp.json();
    const token = data.token;

    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 400));
      const pollResp = await fetch(`${baseHost}/submissions/${token}?base64_encoded=false`, {
        headers,
        signal: controller ? controller.signal : undefined
      });
      if (pollResp.ok) {
        const pollData = await pollResp.json();
        if (pollData.status && pollData.status.id > 2) {
          return this.formatJudge0Result(pollData);
        }
      }
    }
    return { stdout: '', stderr: 'Execution timed out waiting for runner queue.', exitCode: -1, timeMs: this.timeoutSec * 1000, memoryKb: 0, status: 'TLE' };
  }

  formatJudge0Result(res) {
    const stdout = res.stdout || '';
    const stderr = res.compile_output || res.stderr || '';
    const exitCode = res.exit_code || 0;
    const timeMs = Math.round((parseFloat(res.time) || 0) * 1000);
    const memoryKb = res.memory || 0;

    let status = 'AC';
    let buildSuccess = true;
    if (res.status) {
      const statusId = res.status.id;
      if (statusId === 3) status = 'AC';
      else if (statusId === 4) status = 'WA';
      else if (statusId === 5) status = 'TLE';
      else if (statusId === 6 || /SyntaxError:|IndentationError:|compile error|fatal error:/i.test(stderr)) {
        status = 'CE';
        buildSuccess = false;
      } else {
        status = 'RTE';
      }
    } else if (stderr && /error:/i.test(stderr)) {
      status = 'CE';
      buildSuccess = false;
    }

    return { stdout, stderr, exitCode, timeMs, memoryKb, status, buildSuccess };
  }

  /**
   * Execute via Piston API
   */
  async executePiston(sourceCode, language, stdin) {
    const pistonLangMap = {
      'cpp': { language: 'c++', version: '*' },
      'python': { language: 'python', version: '*' },
      'java': { language: 'java', version: '*' },
      'rust': { language: 'rust', version: '*' },
      'go': { language: 'go', version: '*' },
      'javascript': { language: 'javascript', version: '*' },
      'kotlin': { language: 'kotlin', version: '*' },
      'csharp': { language: 'csharp', version: '*' }
    };

    const target = pistonLangMap[language] || { language, version: '*' };
    const baseHost = this.customUrl || 'https://emkc.org/api/v2/piston';

    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const payload = {
      language: target.language,
      version: target.version,
      files: [{ name: `main.${language === 'cpp' ? 'cpp' : language === 'python' ? 'py' : language === 'java' ? 'Main.java' : 'src'}`, content: sourceCode }],
      stdin: stdin,
      run_timeout: this.timeoutSec * 1000
    };

    const resp = await fetch(`${baseHost}/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      throw new Error(`Piston API HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const run = data.run || {};
    const compile = data.compile || {};

    const isCompileError = (compile.code && compile.code !== 0) ||
      /SyntaxError:|IndentationError:|compile error|compilation error|fatal error:/i.test(run.stderr || '') ||
      /SyntaxError:|IndentationError:|compile error|compilation error|fatal error:/i.test(compile.stderr || '');
    const stdout = run.stdout || '';
    const stderr = isCompileError ? (compile.stderr || compile.output || run.stderr || '') : (run.stderr || '');
    const exitCode = isCompileError ? (compile.code || 1) : (run.code || 0);

    let status = 'AC';
    if (isCompileError) status = 'CE';
    else if (run.signal === 'SIGKILL' || exitCode === 137) status = 'TLE';
    else if (exitCode !== 0) status = 'RTE';

    return {
      stdout,
      stderr,
      exitCode,
      timeMs: 0,
      memoryKb: 0,
      status,
      buildSuccess: !isCompileError
    };
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.CodeExecutor = CodeExecutor;
}
