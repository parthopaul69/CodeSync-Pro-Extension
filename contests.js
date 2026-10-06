// CodeSync Pro — Global Contest Hub & Upsolve Radar Controller v4.0
'use strict';

(function () {
  let allContests = [];
  let currentPlatform = 'all';
  let searchQuery = '';

  let allUpsolveProblems = [];

  const $ = (id) => document.getElementById(id);

  // ── 1. Fetch Contests (Multi-Platform) ─────────────────────────────────────────
  async function fetchContests() {
    renderContestsLoading();
    try {
      // Check local cache first (15-min TTL)
      const cached = await chrome.storage.local.get(['cached_contests', 'cached_contests_time']);
      const now = Date.now();
      if (cached.cached_contests && cached.cached_contests_time && (now - cached.cached_contests_time < 15 * 60 * 1000)) {
        allContests = cached.cached_contests.map(c => {
          const s = new Date(c.startTime);
          const e = new Date(c.endTime);
          return {
            ...c,
            startTime: s,
            endTime: e,
            isLive: now >= s.getTime() && now <= e.getTime(),
            isEnded: now > e.getTime()
          };
        });
        renderContests();
        return;
      }

      // Fetch from all 6 platforms in parallel with resilience
      const platformPromises = [
        fetchCodeforcesContests(),
        fetchAtCoderContests(),
        fetchLeetCodeContests(),
        fetchTophContests(),
        fetchCodeChefContests(),
        fetchHackerRankContests()
      ];

      const settled = await Promise.allSettled(platformPromises);
      const combined = [];
      settled.forEach((res, idx) => {
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
          combined.push(...res.value);
        } else {
          console.warn('Contest platform fetch failed for index', idx, res.reason);
        }
      });

      allContests = combined
        .filter(c => {
          if (!c.endTime || isNaN(c.endTime.getTime())) return false;
          // Keep live & upcoming contests
          if (c.endTime.getTime() > now) return true;
          // Keep recent concluded contests (up to 30 days) for upsolving
          return c.endTime.getTime() >= now - 30 * 86400 * 1000;
        })
        .sort((a, b) => {
          // 1. Live contests first
          if (a.isLive && !b.isLive) return -1;
          if (!a.isLive && b.isLive) return 1;
          // 2. Upcoming contests before concluded
          const aUpcoming = a.startTime.getTime() > now;
          const bUpcoming = b.startTime.getTime() > now;
          if (aUpcoming && !bUpcoming) return -1;
          if (!aUpcoming && bUpcoming) return 1;
          // If both upcoming, chronological (soonest first)
          if (aUpcoming && bUpcoming) return a.startTime.getTime() - b.startTime.getTime();
          // If both concluded, reverse chronological (most recently concluded first)
          return b.endTime.getTime() - a.endTime.getTime();
        });

      // Cache result
      await chrome.storage.local.set({
        cached_contests: allContests,
        cached_contests_time: now
      });

      renderContests();
    } catch (e) {
      console.warn('Contest fetch error:', e);
      renderContestsError('Failed to load contests. Please check your network connection.');
    }
  }

  async function fetchCodeforcesContests() {
    try {
      const resp = await fetch('https://codeforces.com/api/contest.list?gym=false');
      if (!resp.ok) return [];
      const json = await resp.json();
      if (json.status !== 'OK' || !Array.isArray(json.result)) return [];

      const upcoming = json.result.filter(c => c.phase === 'BEFORE' || c.phase === 'CODING');
      return upcoming.map(c => {
        const startTime = new Date(c.startTimeSeconds * 1000);
        const endTime = new Date((c.startTimeSeconds + c.durationSeconds) * 1000);
        return {
          name: c.name,
          url: `https://codeforces.com/contest/${c.id}`,
          platform: 'Codeforces',
          startTime: startTime,
          endTime: endTime,
          durationSec: c.durationSeconds,
          isLive: c.phase === 'CODING',
          in24Hours: (c.startTimeSeconds * 1000 - Date.now()) < 86400000
        };
      });
    } catch (e) {
      return [];
    }
  }

  async function fetchAtCoderContests() {
    try {
      // 1. First attempt: Scrape exact upcoming table from official AtCoder website
      const resp = await fetch('https://atcoder.jp/contests/');
      if (resp.ok) {
        const html = await resp.text();
        const match = html.match(/<div id="contest-table-upcoming"[\s\S]*?<\/table>/);
        if (match) {
          const rows = match[0].match(/<tr>[\s\S]*?<\/tr>/g) || [];
          const parsed = [];
          for (let i = 1; i < rows.length; i++) {
            const timeMatch = rows[i].match(/<time class='fixtime[^']*'>([^<]+)<\/time>/);
            const titleMatch = rows[i].match(/<a href="(\/contests\/[^"]+)">([^<]+)<\/a>/);
            const durMatch = rows[i].match(/(\d+):(\d+)/);

            if (timeMatch && titleMatch) {
              const startStr = timeMatch[1].replace(/(\+\d{2})(\d{2})/, '$1:$2');
              const startTime = new Date(startStr);
              let durationSec = 100 * 60; // default 1h40m
              if (durMatch) {
                const hours = parseInt(durMatch[1], 10) || 0;
                const mins = parseInt(durMatch[2], 10) || 0;
                durationSec = (hours * 3600) + (mins * 60);
              }
              const endTime = new Date(startTime.getTime() + (durationSec * 1000));
              const now = Date.now();
              const isLive = now >= startTime.getTime() && now <= endTime.getTime();

              if (!isNaN(startTime.getTime()) && !isNaN(endTime.getTime())) {
                parsed.push({
                  name: titleMatch[2].trim(),
                  url: `https://atcoder.jp${titleMatch[1]}`,
                  platform: 'AtCoder',
                  startTime: startTime,
                  endTime: endTime,
                  durationSec: durationSec,
                  isLive: isLive,
                  in24Hours: (startTime.getTime() - now) < 86400000
                });
              }
            }
          }
          if (parsed.length > 0) return parsed;
        }
      }
    } catch (e) {}

    // 2. Fallback: Kenkoooo API with duration sanity filter (discard 100-year tutorial guides)
    try {
      const resp = await fetch('https://kenkoooo.com/atcoder/resources/contests.json');
      if (!resp.ok) return [];
      const json = await resp.json();
      if (!Array.isArray(json)) return [];

      const now = Date.now() / 1000;
      // Filter out past contests AND contests longer than 2 days (eliminating Kenkoooo 876000-hr tutorial guides)
      const upcoming = json.filter(c => (c.start_epoch_second + c.duration_second) >= now && c.duration_second <= 172800);

      return upcoming.slice(0, 15).map(c => {
        const startTime = new Date(c.start_epoch_second * 1000);
        const endTime = new Date((c.start_epoch_second + c.duration_second) * 1000);
        const isLive = now >= c.start_epoch_second && now <= (c.start_epoch_second + c.duration_second);
        return {
          name: c.title,
          url: `https://atcoder.jp/contests/${c.id}`,
          platform: 'AtCoder',
          startTime: startTime,
          endTime: endTime,
          durationSec: c.duration_second,
          isLive: isLive,
          in24Hours: (c.start_epoch_second * 1000 - Date.now()) < 86400000
        };
      });
    } catch (e) {
      return [];
    }
  }

  async function fetchLeetCodeContests() {
    const contests = [];
    const now = new Date();

    // Dynamically calculate upcoming LeetCode Weekly and Biweekly contests
    // Weekly Contest: Every Sunday at 02:30 UTC (90 minutes)
    for (let w = 0; w < 3; w++) {
      const sunday = new Date();
      sunday.setUTCDate(now.getUTCDate() + ((7 - now.getUTCDay()) % 7) + (w * 7));
      sunday.setUTCHours(2, 30, 0, 0);

      if (sunday.getTime() + (90 * 60 * 1000) > now.getTime()) {
        const endTime = new Date(sunday.getTime() + (90 * 60 * 1000));
        const isLive = now >= sunday && now <= endTime;
        contests.push({
          name: `LeetCode Weekly Contest`,
          url: 'https://leetcode.com/contest/',
          platform: 'LeetCode',
          startTime: sunday,
          endTime: endTime,
          durationSec: 90 * 60,
          isLive: isLive,
          in24Hours: (sunday.getTime() - now.getTime()) < 86400000
        });
      }
    }

    // Biweekly Contest: Every alternate Saturday at 14:30 UTC (90 minutes)
    for (let s = 0; s < 3; s++) {
      const saturday = new Date();
      const daysUntilSaturday = ((6 - now.getUTCDay() + 7) % 7) + (s * 14);
      saturday.setUTCDate(now.getUTCDate() + daysUntilSaturday);
      saturday.setUTCHours(14, 30, 0, 0);

      if (saturday.getTime() + (90 * 60 * 1000) > now.getTime()) {
        const endTime = new Date(saturday.getTime() + (90 * 60 * 1000));
        const isLive = now >= saturday && now <= endTime;
        contests.push({
          name: `LeetCode Biweekly Contest`,
          url: 'https://leetcode.com/contest/',
          platform: 'LeetCode',
          startTime: saturday,
          endTime: endTime,
          durationSec: 90 * 60,
          isLive: isLive,
          in24Hours: (saturday.getTime() - now.getTime()) < 86400000
        });
      }
    }

    return contests;
  }

  async function fetchTophContests() {
    try {
      const resp = await fetch('https://toph.co/contests');
      if (!resp.ok) return [];
      const html = await resp.text();
      const splitItems = html.split(/<li\b[^>]*class=["']?cdeck__item["']?/i);
      const parsed = [];

      for (let i = 1; i < splitItems.length; i++) {
        const item = splitItems[i];
        const nameMatch = item.match(/<a\b[^>]*class=["']?cdeck__name["']?[^>]*href=["']?(\/c\/[^">\s]+)["']?[^>]*>([^<]+)<\/a>/i) ||
                          item.match(/<a\b[^>]*href=["']?(\/c\/[^">\s]+)["']?[^>]*class=["']?cdeck__name["']?[^>]*>([^<]+)<\/a>/i) ||
                          item.match(/<a\b[^>]*href=["']?(\/c\/[^">\s]+)["']?[^>]*>([^<]+)<\/a>/i);
        const timeMatch = item.match(/data-timestamp=["']?(\d+)["']?/i);

        if (nameMatch) {
          const startEpoch = timeMatch ? parseInt(timeMatch[1], 10) : Math.floor(Date.now() / 1000);
          const startTime = new Date(startEpoch * 1000);
          const durationSec = 3 * 3600; // default 3 hours
          const endTime = new Date(startTime.getTime() + (durationSec * 1000));
          const now = Date.now();

          // Keep upcoming, live, and recent concluded contests (last 30 days for upsolving)
          const isEnded = now > endTime.getTime();
          const isLive = now >= startTime.getTime() && now <= endTime.getTime();
          if (!isEnded || endTime.getTime() >= now - 30 * 86400 * 1000) {
            parsed.push({
              name: nameMatch[2].trim(),
              url: `https://toph.co${nameMatch[1]}`,
              platform: 'Toph',
              startTime: startTime,
              endTime: endTime,
              durationSec: durationSec,
              isLive: isLive,
              isEnded: isEnded,
              in24Hours: (startTime.getTime() - now) < 86400000 && (startTime.getTime() > now)
            });
          }
        }
      }
      return parsed;
    } catch (e) {
      console.warn('[CodeSync] Error fetching Toph contests:', e);
      return [];
    }
  }

  async function fetchCodeChefContests() {
    try {
      const resp = await fetch('https://www.codechef.com/api/list/contests/all', {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (!resp.ok) return [];
      const json = await resp.json();
      const list = [...(json.present_contests || []), ...(json.future_contests || [])];
      return list.map(c => {
        const startTime = new Date(c.contest_start_date_iso || c.contest_start_date);
        const endTime = new Date(c.contest_end_date_iso || c.contest_end_date);
        const durationSec = (parseInt(c.contest_duration, 10) || 120) * 60;
        const now = Date.now();
        if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) return null;
        return {
          name: c.contest_name || c.contest_code,
          url: `https://www.codechef.com/${c.contest_code}`,
          platform: 'CodeChef',
          startTime: startTime,
          endTime: endTime,
          durationSec: durationSec,
          isLive: now >= startTime.getTime() && now <= endTime.getTime(),
          in24Hours: (startTime.getTime() - now) < 86400000
        };
      }).filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  async function fetchHackerRankContests() {
    try {
      const resp = await fetch('https://www.hackerrank.com/rest/contests/upcoming', {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (!resp.ok) return [];
      const json = await resp.json();
      if (!Array.isArray(json.models)) return [];
      const now = Date.now();
      return json.models.map(c => {
        const startTime = new Date(c.epoch_starttime ? c.epoch_starttime * 1000 : c.get_starttimeiso);
        const endTime = new Date(c.epoch_endtime ? c.epoch_endtime * 1000 : c.get_endtimeiso);
        const durationSec = (c.epoch_endtime && c.epoch_starttime)
          ? (c.epoch_endtime - c.epoch_starttime)
          : Math.max(0, Math.floor((endTime.getTime() - startTime.getTime()) / 1000));
        if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) return null;
        return {
          name: c.name,
          url: `https://www.hackerrank.com/contests/${c.slug || ''}`,
          platform: 'HackerRank',
          startTime: startTime,
          endTime: endTime,
          durationSec: durationSec,
          isLive: now >= startTime.getTime() && now <= endTime.getTime(),
          in24Hours: (startTime.getTime() - now) < 86400000
        };
      }).filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  // ── 2. Render Contests ───────────────────────────────────────────────────────
  function renderContests() {
    const grid = $('contests-grid');
    const query = searchQuery.toLowerCase().trim();

    const filtered = allContests.filter(c => {
      if (currentPlatform !== 'all' && c.platform !== currentPlatform) return false;
      if (query && !c.name.toLowerCase().includes(query) && !c.platform.toLowerCase().includes(query)) return false;
      return true;
    });

    $('contests-count-label').textContent = `${filtered.length} Contest${filtered.length === 1 ? '' : 's'} Found`;

    if (filtered.length === 0) {
      grid.innerHTML = `<div class="state-box">
        <p>No upcoming contests matching your filters.</p>
      </div>`;
      return;
    }

    grid.innerHTML = '';
    filtered.forEach(c => {
      const card = document.createElement('div');
      card.className = `contest-card ${c.isLive ? 'live' : ''}`;

      const relTime = getRelativeTime(c.startTime, c.isLive);
      const durationStr = formatDuration(c.durationSec);
      const calLink = createGoogleCalendarLink(c.name, c.startTime, c.endTime, c.url);

      card.innerHTML = `
        <div>
          <div class="contest-card-header">
            <span class="platform-badge ${c.platform}">${c.platform}</span>
            ${c.isLive ? '<span class="live-indicator"><span class="live-dot"></span>LIVE NOW</span>' : c.isEnded ? '<span style="font-size:10px; font-weight:700; color:var(--text-muted); background:rgba(255,255,255,0.06); padding:2px 7px; border-radius:4px; border:1px solid var(--border);">Concluded • Upsolve</span>' : `<span style="font-size:10.5px; font-weight:700; color:var(--accent-hover);">${relTime}</span>`}
          </div>
          <a href="${c.url}" target="_blank" class="contest-name" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</a>
        </div>

        <div class="contest-meta-grid">
          <div class="meta-item">
            <span class="meta-label">Date & Time</span>
            <span class="meta-val">${formatDate(c.startTime)}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Duration</span>
            <span class="meta-val">${durationStr}</span>
          </div>
        </div>

        <div class="contest-card-actions">
          <a href="${c.url}" target="_blank" class="btn-card btn-register">
            <span>${c.isLive ? 'Enter Arena ↗' : c.isEnded ? 'Upsolve Arena ↗' : 'Register / View ↗'}</span>
          </a>
          ${c.isEnded ? '' : `<a href="${calLink}" target="_blank" class="btn-card btn-cal" title="Add to Google Calendar">
            <span>📅</span>
          </a>`}
        </div>
      `;

      grid.appendChild(card);
    });
  }

  function getRelativeTime(date, isLive, isEnded) {
    if (isLive) return 'Ongoing';
    if (isEnded) return 'Concluded';
    const diffMs = date.getTime() - Date.now();
    if (diffMs <= 0) return 'Starting soon';

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 1) return `In ${days} days`;
    if (days === 1) return 'Tomorrow';
    if (hours > 1) return `In ${hours} hours`;
    const mins = Math.floor(diffMs / (1000 * 60));
    return `In ${mins} mins`;
  }

  function formatDuration(seconds) {
    if (!seconds) return '2h';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (m === 0) return `${h} hrs`;
    return `${h}h ${m}m`;
  }

  function formatDate(d) {
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function createGoogleCalendarLink(title, start, end, url) {
    try {
      const toIso = (date) => (date instanceof Date && !isNaN(date.getTime()) ? date.toISOString() : new Date().toISOString()).replace(/-|:|\.\d+/g, '');
      const startIso = toIso(start);
      const endIso = toIso(end);
      const details = encodeURIComponent(`Competitive programming contest link: ${url}`);
      return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startIso}/${endIso}&details=${details}&location=${encodeURIComponent(url)}`;
    } catch (e) {
      return url;
    }
  }

  function renderContestsLoading() {
    $('contests-grid').innerHTML = `
      <div class="state-box">
        <div class="spinner"></div>
        <p>Fetching upcoming contests across competitive programming platforms…</p>
      </div>`;
  }

  function renderContestsError(msg) {
    $('contests-grid').innerHTML = `
      <div class="state-box">
        <p style="color:var(--red);">${msg}</p>
      </div>`;
  }

  // ── 3. Upsolve Radar Engine (Codeforces) ────────────────────────────────────
  async function loadUpsolveRadar() {
    const grid = $('upsolve-items-grid');
    grid.innerHTML = `
      <div class="state-box">
        <div class="spinner"></div>
        <p>Scanning Codeforces submissions for unsolved contest problems…</p>
      </div>`;

    const stored = await chrome.storage.local.get(['cfHandle', 'cfEnabled']);
    const cfHandle = (stored.cfHandle || '').trim();

    if (!cfHandle) {
      grid.innerHTML = `
        <div class="state-box" style="padding:24px;">
          <p style="font-size:13px; color:var(--text); font-weight:700; margin-bottom:6px;">No Codeforces handle configured</p>
          <p style="font-size:11px; color:var(--muted); margin-bottom:12px;">Add your Codeforces handle in Settings to activate automated tracking of unsolved problems from recent contests.</p>
          <button class="btn-nav btn-nav-primary" id="go-settings-upsolve-btn" style="margin:0 auto;">⚙️ Configure CF Handle</button>
        </div>`;
      $('go-settings-upsolve-btn')?.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
      });
      return;
    }

    const items = [];

    // Scan Codeforces Recent Submissions
    if (stored.cfEnabled !== false) {
      try {
        const resp = await fetch(`https://codeforces.com/api/user.status?handle=${encodeURIComponent(cfHandle)}&from=1&count=100`);
        if (resp.ok) {
          const json = await resp.json();
          if (json.status === 'OK' && Array.isArray(json.result)) {
            const subs = json.result;
            const solvedProbIds = new Set();
            subs.forEach(s => {
              if (s.verdict === 'OK' && s.contestId && s.problem) {
                solvedProbIds.add(`${s.contestId}_${s.problem.index}`);
              }
            });

            const unacceptedMap = new Map();
            subs.forEach(s => {
              if (!s.contestId || !s.problem) return;
              const probId = `${s.contestId}_${s.problem.index}`;
              if (!solvedProbIds.has(probId) && s.verdict !== 'OK') {
                if (!unacceptedMap.has(probId)) {
                  unacceptedMap.set(probId, {
                    id: `cf_${probId}`,
                    platform: 'Codeforces',
                    platformKey: 'CF',
                    title: `${s.contestId}${s.problem.index}: ${s.problem.name}`,
                    contestId: s.contestId,
                    index: s.problem.index,
                    slug: probId,
                    rating: s.problem.rating || null,
                    verdict: formatVerdictText(s.verdict),
                    url: `https://codeforces.com/contest/${s.contestId}/problem/${s.problem.index}`,
                    time: s.creationTimeSeconds * 1000
                  });
                }
              }
            });

            items.push(...unacceptedMap.values());
          }
        }
      } catch (e) {
        console.warn('Upsolve CF error:', e);
      }
    }

    allUpsolveProblems = items.sort((a, b) => b.time - a.time);
    renderUpsolveRadar();
  }

  function formatVerdictText(verdict) {
    if (!verdict) return 'Unsolved';
    return verdict.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  }

  function renderUpsolveRadar() {
    const grid = $('upsolve-items-grid');

    if (allUpsolveProblems.length === 0) {
      grid.innerHTML = `
        <div class="state-box" style="padding:24px;">
          <p style="font-size:13px; color:var(--green); font-weight:700; margin-bottom:4px;">🎉 All Recent Codeforces Problems Solved!</p>
          <p style="font-size:11px; color:var(--muted);">No pending unaccepted contest submissions found. Keep up the clean streak!</p>
        </div>`;
      return;
    }

    grid.innerHTML = '';
    allUpsolveProblems.slice(0, 12).forEach(p => {
      const card = document.createElement('div');
      card.className = 'upsolve-card';
      card.innerHTML = `
        <div>
          <div class="upsolve-card-hdr">
            <span class="platform-badge ${p.platform}">${p.platform}</span>
            <span class="badge-verdict-wa">${escapeHtml(p.verdict)}</span>
          </div>
          <a href="${p.url}" target="_blank" class="upsolve-prob-title" title="${escapeHtml(p.title)}">${escapeHtml(p.title)}</a>
          <div class="upsolve-meta-row" style="margin-top:8px;">
            ${p.rating ? `<span class="badge-rating">⭐ ${p.rating}</span>` : ''}
            <span style="font-size:10px; color:var(--muted);">${getRelativeTime(new Date(p.time), false)}</span>
          </div>
        </div>

        <button class="upsolve-btn-solve" data-id="${p.id}">
          <span>⚡ Upsolve in CodeSync IDE</span>
        </button>
      `;

      card.querySelector('.upsolve-btn-solve').addEventListener('click', () => {
        openUpsolveProblemInIde(p);
      });

      grid.appendChild(card);
    });
  }

  function openUpsolveProblemInIde(p) {
    const probData = {
      platform: p.platformKey,
      title: p.title,
      url: p.url,
      slug: p.slug,
      limits: { timeLimit: '1s', memoryLimit: '256MB' },
      samples: [],
      fromUpsolve: true,
      timestamp: Date.now()
    };
    chrome.runtime.sendMessage({
      type: 'OPEN_IDE',
      problemData: probData,
      problem: probData
    }).catch(() => {
      chrome.storage.local.set({ pendingProblem: probData });
      chrome.runtime.sendMessage({
        type: 'OPEN_OR_FOCUS_TAB',
        url: chrome.runtime.getURL('ide.html')
      }).catch(() => {
        chrome.tabs.create({ url: chrome.runtime.getURL('ide.html') });
      });
    });
  }

  // ── 4. Event Listeners ───────────────────────────────────────────────────────
  // Contests platform filter pills
  document.querySelectorAll('.filter-bar .platform-pills .pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-bar .platform-pills .pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentPlatform = pill.dataset.platform;
      renderContests();
    });
  });

  $('contest-search')?.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderContests();
  });

  $('refresh-contests-btn')?.addEventListener('click', async () => {
    await chrome.storage.local.remove(['cached_contests', 'cached_contests_time']);
    fetchContests();
  });

  $('refresh-upsolve-btn')?.addEventListener('click', () => {
    loadUpsolveRadar();
  });

  function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Initialize ───────────────────────────────────────────────────────────────
  fetchContests();
  loadUpsolveRadar();
})();
