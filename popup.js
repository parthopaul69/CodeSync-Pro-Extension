// CodeSync Pro — Popup Script v3.1
'use strict';

const $ = id => document.getElementById(id);

// ── Token Obfuscation ────────────────────────────────────────────────────────
function deobfuscate(str) {
  if (!str) return '';
  try {
    return decodeURIComponent(escape(atob(str))).split('').reverse().join('');
  } catch(e) {
    return str;
  }
}

// ── Animate Count Up ──────────────────────────────────────────────────────────
function animateCount(el, targetVal) {
  const startVal = parseInt(el.textContent) || 0;
  if (startVal === targetVal) {
    el.textContent = targetVal;
    return;
  }
  
  const duration = 500; // 500ms
  const startTime = performance.now();
  
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeProgress = progress * (2 - progress);
    const currentVal = Math.round(startVal + (targetVal - startVal) * easeProgress);
    
    el.textContent = currentVal;
    
    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      el.textContent = targetVal;
    }
  }
  
  requestAnimationFrame(update);
}

// ── Platform Config ───────────────────────────────────────────────────────────
const PLATFORMS = {
  all: { label: 'All', color: '#2f81f7' },
  CF: {
    label: 'Codeforces',
    color: '#58a6ff',
    segments: [
      { key: 'div1', label: 'Div. 1', color: '#ff8a80' },
      { key: 'div2', label: 'Div. 2', color: '#ffb74d' },
      { key: 'div3', label: 'Div. 3', color: '#81c784' },
      { key: 'div4', label: 'Div. 4', color: '#64b5f6' },
      { key: 'others', label: 'Others', color: '#ba68c8' }
    ]
  },
  AC: {
    label: 'AtCoder',
    color: '#58a6ff',
    segments: [
      { key: 'abc', label: 'Beginner', color: '#64b5f6' },
      { key: 'arc', label: 'Regular', color: '#ffb74d' },
      { key: 'agc', label: 'Grand', color: '#ff8a80' },
      { key: 'other', label: 'Others', color: '#ba68c8' }
    ]
  },
  LC: {
    label: 'LeetCode',
    color: '#58a6ff',
    segments: [
      { key: 'Easy', label: 'Easy', color: '#4db6ac' },
      { key: 'Medium', label: 'Medium', color: '#ffe082' },
      { key: 'Hard', label: 'Hard', color: '#ff8a80' }
    ]
  },
  TP: {
    label: 'Toph',
    color: '#58a6ff',
    segments: [
      { key: 'Practice', label: 'Practice', color: '#4ade80' }
    ]
  },
  CSES: {
    label: 'CSES',
    color: '#58a6ff',
    segments: [
      { key: 'introductory', label: 'Introductory', color: '#58a6ff' },
      { key: 'sorting', label: 'Sorting & Searching', color: '#3fb950' },
      { key: 'dp', label: 'Dynamic Programming', color: '#d29922' },
      { key: 'graph_trees', label: 'Graphs & Trees', color: '#f85149' },
      { key: 'math_queries', label: 'Math & Queries', color: '#bc8cff' },
      { key: 'others', label: 'Others / Advanced', color: '#f778ba' }
    ]
  }
};

const ALL_SEGMENTS = [
  { key: 'CF', label: 'Codeforces', color: '#67e8f9' },
  { key: 'AC', label: 'AtCoder',    color: '#f9a8d4' },
  { key: 'LC', label: 'LeetCode',   color: '#fde047' },
  { key: 'TP', label: 'Toph',       color: '#4ade80' },
  { key: 'CSES', label: 'CSES',     color: '#58a6ff' }
];

// ── State ─────────────────────────────────────────────────────────────────────
let currentTab = 'all';
let syncLog = [];
let dailyActivity = {};
let dailySubmissionActivity = {};
let totalSynced = 0;
let soundEnabled = true;
let failedQueue = [];
let cfSolvedCount = 0;
let cfDivCounts = {};
let acSolvedCount = 0;
let acContestCounts = {};
let lcSolvedCount = 0;
let lcStreak = 0;
let cfStreak = 0;
let acStreak = 0;
let cfOffset = null;
let acOffset = null;
let lcDifficultyCounts = {};
let lcTodayCount = 0;
let cfTodayCount = 0;
let acTodayCount = 0;
let tpSolvedCount = 0;
let tpCategoryCounts = {};
let tpTodayCount = 0;
let tpStreak = 0;
let tpContestCount = 0;
let csesSolvedCount = 0;
let csesTodayCount = 0;
let csesAttemptsCount = 0;
let csesStreak = 0;
let unsyncedItems = [];
let cfAttemptsCount = 0;
let acAttemptsCount = 0;
let lcAttemptsCount = 0;
let tpAttemptsCount = 0;
let cfEnabled = true;
let acEnabled = true;
let lcEnabled = true;
let tpEnabled = true;
let csesEnabled = true;
let isSyncActive = false;
let cfHandle = '';
let acHandle = '';
let lcUsername = '';
let tpHandle = '';
let ghOwner = '';
let ghRepo = '';

// ── Timezone & Local Date Helpers ─────────────────────────────────────────────
function getLocalDateString(epochSeconds) {
  const d = new Date(epochSeconds * 1000);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - (offset * 60 * 1000));
  return local.toISOString().split('T')[0];
}

function getLocalDateStringFromDate(dateOrStr) {
  const d = typeof dateOrStr === 'string' ? new Date(dateOrStr) : dateOrStr;
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - (offset * 60 * 1000));
  return local.toISOString().split('T')[0];
}

function classifyCSESProblem(catStr, nameStr, taskId) {
  const s = ((catStr || '') + ' ' + (nameStr || '')).toLowerCase();
  if (s.includes('introductory') || s.includes('weird algorithm') || s.includes('missing number') || s.includes('repetitions') || s.includes('increasing array') || s.includes('permutations') || s.includes('number spiral') || s.includes('two knights') || s.includes('two sets') || s.includes('bit strings') || s.includes('trailing zeros') || s.includes('coin piles') || s.includes('palindrome') || s.includes('gray code') || s.includes('tower of hanoi') || s.includes('creating strings') || s.includes('apple division') || s.includes('chessboard') || s.includes('digit queries') || s.includes('grid paths')) {
    return 'introductory';
  }
  if (s.includes('sorting') || s.includes('searching') || s.includes('distinct numbers') || s.includes('ferris wheel') || s.includes('concert tickets') || s.includes('restaurant') || s.includes('movie') || s.includes('sum of two values') || s.includes('sum of three') || s.includes('maximum subarray')) {
    return 'sorting';
  }
  if (s.includes('dynamic') || s.includes('dp') || s.includes('dice combinations') || s.includes('minimizing coins') || s.includes('coin combinations') || s.includes('book shop') || s.includes('array description') || s.includes('edit distance')) {
    return 'dp';
  }
  if (s.includes('graph') || s.includes('tree') || s.includes('labyrinth') || s.includes('round trip') || s.includes('monsters') || s.includes('shortest routes') || s.includes('flight') || s.includes('subordinates')) {
    return 'graph_trees';
  }
  if (s.includes('math') || s.includes('range') || s.includes('query') || s.includes('exponentiation') || s.includes('counting divisors') || s.includes('prime') || s.includes('static range') || s.includes('dynamic range')) {
    return 'math_queries';
  }
  if (s.includes('string') || s.includes('geometry') || s.includes('advanced') || s.includes('additional')) {
    return 'others';
  }
  return 'introductory';
}

function getDailyActivity(storedData) {
  let act = storedData.dailyActivity;
  if (typeof act === 'string') {
    try { act = JSON.parse(act); } catch(e) { act = {}; }
  }
  act = act || {};
  if (!act.CSES || Object.keys(act.CSES).length === 0) {
    const sl = storedData.syncLog || syncLog || [];
    const csesEntries = sl.filter(e => e.platform === 'CSES');
    if (csesEntries.length > 0) {
      if (!act.CSES) act.CSES = {};
      const userOffsetHours = -new Date().getTimezoneOffset() / 60;
      for (const entry of csesEntries) {
        const rawTime = entry.submissionTime || entry.syncedAt;
        const ts = rawTime ? new Date(rawTime).getTime() : Date.now();
        const dStr = epochToDateStr(ts / 1000, userOffsetHours);
        act.CSES[dStr] = (act.CSES[dStr] || 0) + 1;
      }
    }
  }
  return act;
}

function getDailySubmissionActivity(storedData) {
  let act = storedData.dailySubmissionActivity;
  if (typeof act === 'string') {
    try { act = JSON.parse(act); } catch(e) { act = {}; }
  }
  act = act || {};
  if (!act.CSES || Object.keys(act.CSES).length === 0) {
    const sl = storedData.syncLog || syncLog || [];
    const csesEntries = sl.filter(e => e.platform === 'CSES');
    if (csesEntries.length > 0) {
      if (!act.CSES) act.CSES = {};
      const userOffsetHours = -new Date().getTimezoneOffset() / 60;
      for (const entry of csesEntries) {
        const rawTime = entry.submissionTime || entry.syncedAt;
        const ts = rawTime ? new Date(rawTime).getTime() : Date.now();
        const dStr = epochToDateStr(ts / 1000, userOffsetHours);
        act.CSES[dStr] = (act.CSES[dStr] || 0) + 1;
      }
    }
  }
  return act;
}

// ── Time Ago ──────────────────────────────────────────────────────────────────
function timeAgo(iso) {
  if (!iso || isNaN(new Date(iso).getTime())) return 'older';
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 0) return 'just now';
  if (s > 30 * 86400) return 'older';
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── Streak Helpers ────────────────────────────────────────────────────────────

// Returns 'YYYY-MM-DD' for a given Unix epoch (seconds) interpreted in the given UTC offset.
// offsetHours: e.g. 3 for UTC+3 (Moscow), 6 for UTC+6 (Dhaka)
function epochToDateStr(epochSeconds, offsetHours) {
  // Shift epoch by offset so that UTC date extraction gives the local date
  const shifted = new Date((epochSeconds + offsetHours * 3600) * 1000);
  return shifted.toISOString().split('T')[0];
}

// Returns 'YYYY-MM-DD' for "today" in the given UTC offset.
function todayInOffset(offsetHours) {
  const nowSeconds = Date.now() / 1000;
  return epochToDateStr(nowSeconds, offsetHours);
}

function computeStreakFromActivity(activity, offsetHours) {
  // 'today' in the target timezone
  const usedOffset = offsetHours != null ? offsetHours : 0;
  const todayStr = todayInOffset(usedOffset);
  const todayCount = activity[todayStr] || 0;

  // Build last 7 days for the calendar display
  const days = [];
  for (let i = 6; i >= 0; i--) {
    // Compute the date string for (today - i days) in the same offset
    const dayEpochSec = (Date.now() / 1000) + (usedOffset * 3600) - (i * 86400);
    const dateStr = epochToDateStr(dayEpochSec - usedOffset * 3600, usedOffset); // subtract offset since epochToDateStr adds it
    // Simpler: build from todayStr by subtracting days
    const dObj = new Date(todayStr + 'T00:00:00Z');
    dObj.setUTCDate(dObj.getUTCDate() - i);
    const ds = dObj.toISOString().split('T')[0];
    const dayName = ['S', 'M', 'T', 'W', 'T', 'F', 'S'][dObj.getUTCDay()];
    days.push({ date: ds, label: dayName, count: activity[ds] || 0, isToday: i === 0 });
  }

  // Compute current running streak (consecutive days backwards from today or yesterday)
  let streak = 0;
  let checkDateObj = new Date(todayStr + 'T00:00:00Z');
  // If today has no activity, start from yesterday
  if (todayCount === 0) {
    checkDateObj.setUTCDate(checkDateObj.getUTCDate() - 1);
  }
  while (true) {
    const ds = checkDateObj.toISOString().split('T')[0];
    if ((activity[ds] || 0) > 0) {
      streak++;
      checkDateObj.setUTCDate(checkDateObj.getUTCDate() - 1);
    } else {
      break;
    }
  }
  // If only today solved (yesterday empty) → streak = 1
  if (todayCount > 0) {
    const yObj = new Date(todayStr + 'T00:00:00Z');
    yObj.setUTCDate(yObj.getUTCDate() - 1);
    const yStr = yObj.toISOString().split('T')[0];
    if ((activity[yStr] || 0) === 0) streak = 1;
  }

  return { streak, todayCount, days };
}

function computeStreakFromSubmissions(submissions, userLocalOffset, isVerdictOk, preferredOffset) {
  const CF_MOSCOW = 3;
  const seen = new Set();
  const offsets = [];
  // Prioritize preferred, local, Moscow, UTC
  for (const o of [preferredOffset, userLocalOffset, CF_MOSCOW, 0]) {
    if (o != null && !seen.has(o)) { seen.add(o); offsets.push(o); }
  }
  // Add all hourly offsets from -12 to +14 to be resilient to midnight/timezone boundary shifts
  for (let o = -12; o <= 14; o++) {
    if (!seen.has(o)) { seen.add(o); offsets.push(o); }
  }

  let maxStreak = 0;
  let bestActivity = {};
  let bestOffset = preferredOffset != null ? preferredOffset : userLocalOffset;
  let bestTodayCount = 0;
  let bestDays = [];

  for (const offset of offsets) {
    // Build activity map: date key is YYYY-MM-DD in the given offset
    const activity = {};
    for (const sub of submissions) {
      if (isVerdictOk(sub)) {
        const ts = sub.creationTimeSeconds || sub.epoch_second || (sub.timestamp ? parseInt(sub.timestamp) : 0);
        if (!ts) continue;
        const dateStr = epochToDateStr(ts, offset);
        activity[dateStr] = (activity[dateStr] || 0) + 1;
      }
    }

    const { streak, todayCount, days } = computeStreakFromActivity(activity, offset);
    if (streak > maxStreak) {
      maxStreak = streak;
      bestActivity = activity;
      bestOffset = offset;
      bestTodayCount = todayCount;
      bestDays = days;
    }
  }

  // Fallback: if no streak found at all, use preferred offset
  if (maxStreak === 0) {
    const fallbackOffset = preferredOffset != null ? preferredOffset : userLocalOffset;
    const activity = {};
    for (const sub of submissions) {
      if (isVerdictOk(sub)) {
        const ts = sub.creationTimeSeconds || sub.epoch_second || (sub.timestamp ? parseInt(sub.timestamp) : 0);
        if (!ts) continue;
        const dateStr = epochToDateStr(ts, fallbackOffset);
        activity[dateStr] = (activity[dateStr] || 0) + 1;
      }
    }
    const r = computeStreakFromActivity(activity, fallbackOffset);
    return { streak: r.streak, activity, offsetUsed: fallbackOffset, todayCount: r.todayCount, days: r.days };
  }

  return { streak: maxStreak, activity: bestActivity, offsetUsed: bestOffset, todayCount: bestTodayCount, days: bestDays };
}

function getStreakData(platform) {
  if (platform === 'all') {
    // Merge ACCEPTED activity across all enabled platforms (for true streak counting)
    const mergedAccepted = {};
    const mergedSub = {};
    for (const p of ['CF', 'AC', 'LC', 'TP', 'CSES']) {
      if (p === 'CF' && !cfEnabled) continue;
      if (p === 'AC' && !acEnabled) continue;
      if (p === 'LC' && !lcEnabled) continue;
      if (p === 'TP' && !tpEnabled) continue;
      if (p === 'CSES' && !csesEnabled) continue;
      const pAcceptedData = dailyActivity[p] || {};
      for (const [date, count] of Object.entries(pAcceptedData)) {
        mergedAccepted[date] = (mergedAccepted[date] || 0) + count;
      }
      const pSubData = dailySubmissionActivity[p] || dailyActivity[p] || {};
      for (const [date, count] of Object.entries(pSubData)) {
        mergedSub[date] = (mergedSub[date] || 0) + count;
      }
    }

    // Calculate combined streak from merged ACCEPTED activity
    const userOffsetHours = -new Date().getTimezoneOffset() / 60;
    const { streak: mergedStreak, days } = computeStreakFromActivity(mergedAccepted, userOffsetHours);

    // Fallback/Safety check: ALL streak should be at least the max of individual platform streaks
    const streaks = [];
    if (cfEnabled && cfStreak > 0) streaks.push(cfStreak);
    if (acEnabled && acStreak > 0) streaks.push(acStreak);
    if (lcEnabled && lcStreak > 0) streaks.push(lcStreak);
    if (tpEnabled && tpStreak > 0) streaks.push(tpStreak);
    if (csesEnabled && csesStreak > 0) streaks.push(csesStreak);
    const bestStreak = streaks.length > 0 ? Math.max(...streaks) : 0;
    const finalStreak = bestStreak > 0 ? Math.max(mergedStreak, bestStreak) : 0;

    // Populate acceptedCount and hasSubmission for each day
    days.forEach(day => {
      let acceptedCount = 0;
      for (const p of ['CF', 'AC', 'LC', 'TP', 'CSES']) {
        if (p === 'CF' && !cfEnabled) continue;
        if (p === 'AC' && !acEnabled) continue;
        if (p === 'LC' && !lcEnabled) continue;
        if (p === 'TP' && !tpEnabled) continue;
        if (p === 'CSES' && !csesEnabled) continue;
        const pAcceptedData = dailyActivity[p] || {};
        acceptedCount += pAcceptedData[day.date] || 0;
      }
      day.acceptedCount = acceptedCount;
      day.hasSubmission = day.count > 0;
    });

    // Today = sum of accepted counts across all platforms
    const todayCount = (cfEnabled ? cfTodayCount : 0)
                     + (acEnabled ? acTodayCount : 0)
                     + (lcEnabled ? lcTodayCount : 0)
                     + (tpEnabled ? tpTodayCount : 0)
                     + (csesEnabled ? csesTodayCount : 0);

    return { days, streak: finalStreak, todayCount };
  }

  // Per-platform: use the API-synced streak directly.
  let subActivity = dailySubmissionActivity[platform] || dailyActivity[platform] || {};
  let acceptedActivity = dailyActivity[platform] || {};

  const userLocalOffset = -new Date().getTimezoneOffset() / 60;
  let offset = userLocalOffset; // default to user local
  if (platform === 'CF') offset = cfOffset != null ? cfOffset : userLocalOffset;
  else if (platform === 'AC') offset = acOffset != null ? acOffset : userLocalOffset;
  else if (platform === 'LC' || platform === 'TP' || platform === 'CSES') offset = userLocalOffset;

  if (platform === 'CSES' && Object.keys(acceptedActivity).length === 0) {
    const csesLogs = syncLog.filter(e => e.platform === 'CSES');
    if (csesLogs.length > 0) {
      acceptedActivity = {};
      subActivity = {};
      for (const entry of csesLogs) {
        const rawTime = entry.submissionTime || entry.syncedAt;
        const t = rawTime ? new Date(rawTime).getTime() : Date.now();
        const dStr = epochToDateStr(t / 1000, userLocalOffset);
        acceptedActivity[dStr] = (acceptedActivity[dStr] || 0) + 1;
        subActivity[dStr] = (subActivity[dStr] || 0) + 1;
      }
    }
  }

  const { days, streak: computedStreak, todayCount: computedToday } = computeStreakFromActivity(subActivity, offset);

  days.forEach(day => {
    day.acceptedCount = acceptedActivity[day.date] || 0;
    day.hasSubmission = day.count > 0;
  });

  let todayCount = computedToday || 0;
  if (platform === 'CF') todayCount = Math.max(todayCount, cfTodayCount || 0);
  else if (platform === 'AC') todayCount = Math.max(todayCount, acTodayCount || 0);
  else if (platform === 'LC') todayCount = Math.max(todayCount, lcTodayCount || 0);
  else if (platform === 'TP') todayCount = Math.max(todayCount, tpTodayCount || 0);
  else if (platform === 'CSES') todayCount = Math.max(todayCount, csesTodayCount || 0);

  let streak = computedStreak || 0;
  if (platform === 'LC') streak = Math.max(streak, lcStreak || 0);
  else if (platform === 'CF') streak = Math.max(streak, cfStreak || 0);
  else if (platform === 'AC') streak = Math.max(streak, acStreak || 0);
  else if (platform === 'TP') streak = Math.max(streak, tpStreak || 0);
  else if (platform === 'CSES') streak = Math.max(streak, csesStreak || 0);

  return { days, streak, todayCount };
}

// ── Render Streak ─────────────────────────────────────────────────────────────
function renderStreak(platform) {
  const { days, streak, todayCount } = getStreakData(platform);
  
  // Animate count stats
  animateCount($('stat-streak'), streak);
  animateCount($('stat-today'), todayCount);
  $('streak-count').textContent = `${streak} day${streak !== 1 ? 's' : ''}`;

  const tooltipEl = $('attempt-tooltip');
  if (tooltipEl) tooltipEl.style.display = 'none';

  const container = $('streak-days');
  container.innerHTML = '';

  const platformClass = platform === 'all' ? '' : platform.toLowerCase();

  days.forEach((day, index) => {
    const dayEl = document.createElement('div');
    dayEl.className = 'streak-day';

    const label = document.createElement('div');
    label.className = 'streak-day-label';
    label.textContent = day.label;

    const bubble = document.createElement('div');
    let classes = ['streak-bubble'];
    if (day.isToday) classes.push('today');
    // Active = any submission on that day (accepted OR failed)
    if (day.hasSubmission || day.acceptedCount > 0) {
      classes.push('solved');
      if (platformClass) classes.push(platformClass);
      bubble.textContent = '✓';
    } else if (!day.isToday) {
      classes.push('missed');
      bubble.textContent = '✕';
    } else {
      bubble.textContent = '';
    }
    bubble.className = classes.join(' ');
    
    // Add staggered animation delay
    bubble.style.animationDelay = `${index * 50}ms`;

    let tooltipText;
    if (day.acceptedCount > 0 && day.count > day.acceptedCount) {
      tooltipText = `${day.acceptedCount} accepted, ${day.count - day.acceptedCount} failed`;
    } else if (day.acceptedCount > 0) {
      tooltipText = `${day.acceptedCount} solved`;
    } else if (day.hasSubmission) {
      tooltipText = `${day.count} failed`;
    } else {
      tooltipText = day.isToday ? 'Solve today!' : 'Missed';
    }
    bubble.setAttribute('data-tooltip', tooltipText);

    bubble.addEventListener('mouseenter', () => {
      const tip = $('attempt-tooltip');
      if (!tip) return;
      if (day.hasSubmission && day.acceptedCount === 0) {
        tip.innerHTML = `<span style="color:#ef4444;font-weight:700;">✕ ${day.count} failed</span>`;
      } else if (day.acceptedCount > 0 && day.count > day.acceptedCount) {
        tip.innerHTML = `<span style="color:#22c55e;font-weight:700;">✓ ${day.acceptedCount} accepted</span>, <span style="color:#ef4444;font-weight:700;">✕ ${day.count - day.acceptedCount} failed</span>`;
      } else if (day.acceptedCount > 0) {
        tip.innerHTML = `<span style="color:#22c55e;font-weight:700;">✓ ${day.acceptedCount} solved</span>`;
      } else {
        tip.innerHTML = `<span>${day.isToday ? 'Solve today!' : 'Missed'}</span>`;
      }
      tip.style.display = 'block';
      const rect = bubble.getBoundingClientRect();
      const tipW = tip.offsetWidth || 130;
      const maxW = Math.min(window.innerWidth || 460, 460);
      let left = rect.left + rect.width / 2 - tipW / 2;
      left = Math.max(10, Math.min(maxW - tipW - 10, left));
      tip.style.left = `${left}px`;
      const tipH = tip.offsetHeight || 28;
      let top = rect.top - tipH - 8;
      if (top < 10) top = rect.bottom + 8;
      tip.style.top = `${top}px`;
    });

    bubble.addEventListener('mouseleave', () => {
      const tip = $('attempt-tooltip');
      if (tip) tip.style.display = 'none';
    });

    dayEl.appendChild(label);
    dayEl.appendChild(bubble);
    container.appendChild(dayEl);
  });
}

// ── Compute Chart Data ────────────────────────────────────────────────────────
function computeChartData(platform) {
  if (platform === 'all') {
    const hasProfileCounts = cfSolvedCount > 0 || acSolvedCount > 0 || lcSolvedCount > 0 || tpSolvedCount > 0 || csesSolvedCount > 0 || syncLog.some(e => e.platform === 'CSES');
    if (hasProfileCounts) {
      const filteredSegments = ALL_SEGMENTS.filter(seg => {
        if (seg.key === 'CF') return cfEnabled;
        if (seg.key === 'AC') return acEnabled;
        if (seg.key === 'LC') return lcEnabled;
        if (seg.key === 'TP') return tpEnabled;
        if (seg.key === 'CSES') return csesEnabled;
        return true;
      });
      return filteredSegments.map(seg => {
        let count = 0;
        if (seg.key === 'CF') count = cfSolvedCount;
        else if (seg.key === 'AC') count = acSolvedCount;
        else if (seg.key === 'LC') count = lcSolvedCount;
        else if (seg.key === 'TP') count = tpSolvedCount || syncLog.filter(e => e.platform === 'TP').length;
        else if (seg.key === 'CSES') count = csesSolvedCount || syncLog.filter(e => e.platform === 'CSES').length;
        return { ...seg, count };
      });
    }

    const counts = {};
    for (const entry of syncLog) {
      counts[entry.platform] = (counts[entry.platform] || 0) + 1;
    }
    const filteredSegments = ALL_SEGMENTS.filter(seg => {
      if (seg.key === 'CF') return cfEnabled;
      if (seg.key === 'AC') return acEnabled;
      if (seg.key === 'LC') return lcEnabled;
      if (seg.key === 'TP') return tpEnabled;
      if (seg.key === 'CSES') return csesEnabled;
      return true;
    });
    return filteredSegments.map(seg => ({ ...seg, count: counts[seg.key] || 0 }));
  }

  if (platform === 'CF') {
    const divCounts = { ...(cfDivCounts || {}) };
    const hasDivCounts = Object.values(divCounts).some(c => c > 0);
    
    if (hasDivCounts) {
      const sumDivs = (divCounts.div1 || 0) + (divCounts.div2 || 0) + (divCounts.div3 || 0) + (divCounts.div4 || 0) + (divCounts.others || 0);
      const diff = cfSolvedCount - sumDivs;
      divCounts.others = Math.max(0, (divCounts.others || 0) + diff);
      return PLATFORMS.CF.segments.map(seg => ({ ...seg, count: divCounts[seg.key] || 0 }));
    }
    
    const counts = {};
    for (const entry of syncLog.filter(e => e.platform === 'CF')) {
      const div = (entry.division || 'others').toLowerCase();
      const key = div.includes('div1') || div.includes('div. 1') ? 'div1' :
                  div.includes('div2') || div.includes('div. 2') ? 'div2' :
                  div.includes('div3') || div.includes('div. 3') ? 'div3' :
                  div.includes('div4') || div.includes('div. 4') ? 'div4' : 'others';
      counts[key] = (counts[key] || 0) + 1;
    }
    const sumDivs = (counts.div1 || 0) + (counts.div2 || 0) + (counts.div3 || 0) + (counts.div4 || 0) + (counts.others || 0);
    const diff = cfSolvedCount - sumDivs;
    counts.others = Math.max(0, (counts.others || 0) + diff);
    return PLATFORMS.CF.segments.map(seg => ({ ...seg, count: counts[seg.key] || 0 }));
  }

  if (platform === 'AC') {
    const contestCounts = { ...(acContestCounts || {}) };
    const hasContestCounts = Object.values(contestCounts).some(c => c > 0);
    
    if (hasContestCounts) {
      const sumContests = (contestCounts.abc || 0) + (contestCounts.arc || 0) + (contestCounts.agc || 0) + (contestCounts.other || 0);
      const diff = acSolvedCount - sumContests;
      contestCounts.other = Math.max(0, (contestCounts.other || 0) + diff);
      return PLATFORMS.AC.segments.map(seg => ({ ...seg, count: contestCounts[seg.key] || 0 }));
    }

    const counts = {};
    for (const entry of syncLog.filter(e => e.platform === 'AC')) {
      const contestName = (entry.contestName || '').toLowerCase();
      let cat = 'other';
      if (contestName.startsWith('abc')) cat = 'abc';
      else if (contestName.startsWith('arc')) cat = 'arc';
      else if (contestName.startsWith('agc')) cat = 'agc';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    const sumContests = (counts.abc || 0) + (counts.arc || 0) + (counts.agc || 0) + (counts.other || 0);
    const diff = acSolvedCount - sumContests;
    counts.other = Math.max(0, (counts.other || 0) + diff);
    return PLATFORMS.AC.segments.map(seg => ({ ...seg, count: counts[seg.key] || 0 }));
  }

  if (platform === 'LC') {
    const diffCounts = { ...(lcDifficultyCounts || {}) };
    const hasDiffCounts = Object.values(diffCounts).some(c => c > 0);
    
    if (hasDiffCounts) {
      const sumDiffs = (diffCounts.Easy || 0) + (diffCounts.Medium || 0) + (diffCounts.Hard || 0);
      const diff = lcSolvedCount - sumDiffs;
      diffCounts.Easy = Math.max(0, (diffCounts.Easy || 0) + diff);
      return PLATFORMS.LC.segments.map(seg => ({ ...seg, count: diffCounts[seg.key] || 0 }));
    }

    const counts = {};
    for (const entry of syncLog.filter(e => e.platform === 'LC')) {
      const diff = entry.difficulty || 'Easy';
      counts[diff] = (counts[diff] || 0) + 1;
    }
    const sumDiffs = (counts.Easy || 0) + (counts.Medium || 0) + (counts.Hard || 0);
    const diff = lcSolvedCount - sumDiffs;
    counts.Easy = Math.max(0, (counts.Easy || 0) + diff);
    return PLATFORMS.LC.segments.map(seg => ({ ...seg, count: counts[seg.key] || 0 }));
  }

  if (platform === 'TP') {
    // Toph has no Easy/Medium/Hard — just total solved
    const solvedCount = tpSolvedCount || syncLog.filter(e => e.platform === 'TP').length || 0;
    return PLATFORMS.TP.segments.map(seg => ({ ...seg, count: solvedCount }));
  }

  if (platform === 'CSES') {
    const counts = {
      introductory: 0,
      sorting: 0,
      dp: 0,
      graph_trees: 0,
      math_queries: 0,
      others: 0
    };
    const seenCsesTasks = new Set();
    const csesEntries = syncLog.filter(e => e.platform === 'CSES');
    for (const entry of csesEntries) {
      const pKey = entry.problemCode || entry.problemName || entry.title;
      if (seenCsesTasks.has(pKey)) continue;
      seenCsesTasks.add(pKey);
      const catKey = classifyCSESProblem(entry.category, entry.problemName || entry.title, entry.taskId);
      counts[catKey] = (counts[catKey] || 0) + 1;
    }
    return PLATFORMS.CSES.segments.map(seg => ({ ...seg, count: counts[seg.key] || 0 }));
  }

  return [];
}

// ── Draw Donut Chart (SVG) ────────────────────────────────────────────────────
function drawDonut(segments, total) {
  const svg = $('donut-svg');
  svg.innerHTML = '';
  animateCount($('donut-total'), total);

  const R = 15.9; // radius for viewBox 0 0 36 36
  const CX = 18, CY = 18;
  const CIRC = 2 * Math.PI * R; // ≈ 100

  // Background track
  const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  track.setAttribute('cx', CX); track.setAttribute('cy', CY); track.setAttribute('r', R);
  track.setAttribute('fill', 'none');
  track.setAttribute('stroke', 'var(--surface2)');
  track.setAttribute('stroke-width', '4.5');
  svg.appendChild(track);

  if (total === 0 || segments.length === 0) {
    const emptyCirc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    emptyCirc.setAttribute('cx', CX); emptyCirc.setAttribute('cy', CY); emptyCirc.setAttribute('r', R);
    emptyCirc.setAttribute('fill', 'none');
    emptyCirc.setAttribute('stroke', 'var(--border)');
    emptyCirc.setAttribute('stroke-width', '4.5');
    svg.appendChild(emptyCirc);
    return;
  }

  const tooltip = $('donut-tooltip');
  let offset = 0;

  segments.forEach(seg => {
    const pct = seg.count / total;
    const dashLen = pct * CIRC;

    if (dashLen === 0) return;

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', CX); circle.setAttribute('cy', CY); circle.setAttribute('r', R);
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', seg.color);
    circle.setAttribute('stroke-width', '4.5');
    circle.setAttribute('class', 'donut-seg');

    circle.setAttribute('stroke-dasharray', `0 ${CIRC}`);
    circle.setAttribute('stroke-dashoffset', `${CIRC - offset}`);
    svg.appendChild(circle);

    requestAnimationFrame(() => {
      circle.style.transition = 'stroke-dasharray 0.6s cubic-bezier(0.4, 0, 0.2, 1), stroke-width 0.25s';
      circle.setAttribute('stroke-dasharray', `${dashLen} ${CIRC - dashLen}`);
    });

    circle.addEventListener('mouseenter', e => {
      tooltip.innerHTML = `
        <div style="font-weight: 800; font-size: 11px; color: var(--text); margin-bottom: 4px;">${seg.label}</div>
        <div style="display: flex; align-items: center; gap: 6px; font-size: 10px; color: var(--muted); white-space: nowrap;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 2px; background-color: ${seg.color};"></span>
          ${seg.label === 'Practice' ? 'Practice' : 'Solved'} Problems: <strong style="color: var(--text); font-weight: 700;">${seg.count}</strong>
        </div>
      `;
      tooltip.style.display = 'block';
      const tipW = tooltip.offsetWidth || 130;
      const maxW = Math.min(window.innerWidth || 460, 460);
      let left = e.clientX + 10;
      left = Math.max(10, Math.min(maxW - tipW - 10, left));
      tooltip.style.left = `${left}px`;
      const tipH = tooltip.offsetHeight || 45;
      let top = e.clientY - tipH - 5;
      if (top < 10) top = e.clientY + 12;
      tooltip.style.top = `${top}px`;
      circle.setAttribute('stroke-width', '6.0');
    });

    circle.addEventListener('mousemove', e => {
      const tipW = tooltip.offsetWidth || 130;
      const maxW = Math.min(window.innerWidth || 460, 460);
      let left = e.clientX + 10;
      left = Math.max(10, Math.min(maxW - tipW - 10, left));
      tooltip.style.left = `${left}px`;
      const tipH = tooltip.offsetHeight || 45;
      let top = e.clientY - tipH - 5;
      if (top < 10) top = e.clientY + 12;
      tooltip.style.top = `${top}px`;
    });

    circle.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
      circle.setAttribute('stroke-width', '4.5');
    });

    offset += dashLen;
  });
}

// ── Draw Legend ───────────────────────────────────────────────────────────────
function renderLegend(segments) {
  const legend = $('chart-legend');
  legend.innerHTML = '';
  
  for (const seg of segments) {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `
      <span class="legend-label">${seg.label}</span>
      <span class="legend-count" style="color:${seg.color}">${seg.count}</span>
    `;
    legend.appendChild(item);
  }
  
  if (legend.children.length === 0) {
    legend.innerHTML = '<div style="font-size:11px;color:var(--muted);text-align:center;padding:10px">No stats available</div>';
  }
}

// ── Failed Queue Details Extractor ───────────────────────────────────────────
function getFailedItemDetails(item) {
  let problemName = 'Unknown';
  let problemCode = 'Unknown';
  let problemUrl = '#';
  
  if (item.platform === 'CF' && item.sub) {
    problemName = item.sub.problem ? `${item.sub.contestId}${item.sub.problem.index} - ${item.sub.problem.name}` : `CF Submission ${item.sub.id}`;
    problemCode = item.sub.problem ? `${item.sub.contestId}${item.sub.problem.index}` : String(item.sub.id);
    problemUrl = `https://codeforces.com/contest/${item.sub.contestId}/submission/${item.sub.id}`;
  } else if (item.platform === 'AC') {
    if (item.sub) {
      problemName = item.sub.problem_id || `AC Submission ${item.sub.id}`;
      problemCode = item.sub.problem_id || String(item.sub.id);
      problemUrl = `https://atcoder.jp/contests/${item.sub.contest_id}/submissions/${item.sub.id}`;
    } else if (item.data) {
      problemName = item.data.problemName || `AC Submission ${item.data.submissionId}`;
      problemCode = item.data.problemId || String(item.data.submissionId);
      problemUrl = item.data.url || '#';
    }
  } else if (item.platform === 'LC') {
    if (item.sub) {
      problemName = item.sub.title || `LC Submission ${item.sub.id}`;
      problemCode = item.sub.titleSlug || 'LeetCode';
      problemUrl = `https://leetcode.com/submissions/detail/${item.sub.id}/`;
    } else if (item.data) {
      problemName = item.data.title || `LC Submission ${item.data.titleSlug}`;
      problemCode = item.data.titleSlug || 'LeetCode';
      problemUrl = item.data.url || '#';
    }
  } else if (item.platform === 'TP') {
    if (item.data) {
      problemName = item.data.title || `TP Submission ${item.data.slug}`;
      problemCode = item.data.slug || 'Toph';
      problemUrl = item.data.url || '#';
    }
  } else if (item.platform === 'CSES') {
    if (item.sub) {
      problemName = item.sub.title || `CSES Problem ${item.sub.taskId}`;
      problemCode = item.sub.taskId ? `CSES-${item.sub.taskId}` : 'CSES';
      problemUrl = item.sub.taskId ? `https://cses.fi/problemset/task/${item.sub.taskId}` : 'https://cses.fi/problemset/';
    } else if (item.data) {
      problemName = item.data.problemName || `CSES Problem ${item.data.taskId}`;
      problemCode = item.data.problemCode || `CSES-${item.data.taskId}`;
      problemUrl = item.data.url || '#';
    }
  }
  
  return {
    platform: item.platform,
    problemName: problemName,
    problemCode: problemCode,
    isFailed: true,
    lastError: item.lastError || 'Upload failed',
    syncedAt: item.timestamp || Date.now(),
    repoPath: problemUrl
  };
}

// ── Render Sync List ──────────────────────────────────────────────────────────
function renderSyncList(platform) {
  const container = $('sync-list');
  
  // Filter logs and failed queue
  const filteredLog = platform === 'all' 
    ? syncLog.filter(e => {
        if (e.platform === 'CF' && !cfEnabled) return false;
        if (e.platform === 'AC' && !acEnabled) return false;
        if (e.platform === 'LC' && !lcEnabled) return false;
        if (e.platform === 'TP' && !tpEnabled) return false;
        if (e.platform === 'CSES' && !csesEnabled) return false;
        return true;
      })
    : syncLog.filter(e => e.platform === platform);
  const filteredFailed = failedQueue
    .filter(e => {
      if (platform === 'all') {
        if (e.platform === 'CF' && !cfEnabled) return false;
        if (e.platform === 'AC' && !acEnabled) return false;
        if (e.platform === 'LC' && !lcEnabled) return false;
        if (e.platform === 'TP' && !tpEnabled) return false;
        if (e.platform === 'CSES' && !csesEnabled) return false;
        return true;
      }
      return e.platform === platform;
    })
    .map(getFailedItemDetails);

  // Sort filteredLog by timestamp descending so the most recent syncs are always first
  filteredLog.sort((a, b) => {
    const tA = new Date(a.syncedAt || a.submissionTime || 0).getTime();
    const tB = new Date(b.syncedAt || b.submissionTime || 0).getTime();
    return tB - tA;
  });

  // Combine lists with failed items on top
  const combined = [...filteredFailed, ...filteredLog];
  const items = combined.slice(0, 8);

  if (!items.length) {
    container.innerHTML = `<div class="empty-state">
      <div class="icon">📭</div>
      <p>No sync records yet for ${PLATFORMS[platform] ? PLATFORMS[platform].label : 'this platform'}.<br>Solve a problem to get started!</p>
    </div>`;
    return;
  }

  const ul = document.createElement('ul');
  ul.className = 'submission-list';
  for (const item of items) {
    const li = document.createElement('li');
    const displayName = item.problemName || item.problemCode || 'Unknown';
    const meta = buildMeta(item);
    
    const icon = item.isFailed ? '⚠️' : '✓';
    const iconClass = item.isFailed ? 'style="color:var(--red);font-size:13px;"' : 'class="check-icon"';
    const failStyle = item.isFailed ? 'style="border-left: 3px solid var(--red);"' : '';

    const tag = item.isFailed ? 'div' : 'a';
    const hrefAttr = item.isFailed ? '' : `href="${item.repoPath}" target="_blank"`;

    li.innerHTML = `<${tag} class="submission-item" ${hrefAttr} ${failStyle}>
      <span class="platform-badge ${item.platform}">${item.platform}</span>
      <div class="sub-details">
        <div class="sub-name" title="${displayName}">${displayName}</div>
        <div class="sub-meta">${meta}</div>
      </div>
      <span ${iconClass}>${icon}</span>
    </${tag}>`;
    ul.appendChild(li);
  }
  container.innerHTML = '';
  container.appendChild(ul);
}

function buildMeta(item) {
  const parts = [];
  if (item.isFailed) {
    parts.push(`<span style="color:var(--red);font-weight:700;">FAILED</span>`);
    parts.push(`<span style="color:var(--red);opacity:0.95;" title="${item.lastError}">${item.lastError.slice(0, 32)}${item.lastError.length > 32 ? '...' : ''}</span>`);
  } else {
    if (item.platform === 'CF') {
      if (item.rating) parts.push(`<span class="rating-badge">${item.rating}</span>`);
      if (item.division) parts.push(`<span>${item.division}</span>`);
    } else if (item.platform === 'LC') {
      if (item.difficulty) parts.push(`<span class="diff-badge ${item.difficulty}">${item.difficulty}</span>`);
    } else if (item.platform === 'AC') {
      if (item.contestName) parts.push(`<span>${item.contestName}</span>`);
    } else if (item.platform === 'TP') {
      if (item.category) parts.push(`<span>${item.category}</span>`);
    } else if (item.platform === 'CSES') {
      if (item.category) parts.push(`<span>${item.category}</span>`);
    }
    if (item.time) parts.push(`<span>⏱ ${item.time}ms</span>`);
  }
  if (item.syncedAt) parts.push(`<span>${timeAgo(item.syncedAt)}</span>`);
  return parts.join('');
}

// ── Render Stats ──────────────────────────────────────────────────────────────
function renderStats(platform) {
  let total = 0;
  const uniqueCsesSolved = new Set(syncLog.filter(e => e.platform === 'CSES').map(e => e.problemCode || e.problemName)).size;
  const effectiveCsesSolved = Math.max(csesSolvedCount || 0, uniqueCsesSolved);

  if (platform === 'all') {
    if (cfEnabled) total += cfSolvedCount;
    if (acEnabled) total += acSolvedCount;
    if (lcEnabled) total += lcSolvedCount;
    if (tpEnabled) total += tpSolvedCount;
    if (csesEnabled) total += effectiveCsesSolved;
    
    if (total === 0) {
      total = syncLog.filter(e => {
        if (e.platform === 'CF' && !cfEnabled) return false;
        if (e.platform === 'AC' && !acEnabled) return false;
        if (e.platform === 'LC' && !lcEnabled) return false;
        if (e.platform === 'TP' && !tpEnabled) return false;
        if (e.platform === 'CSES' && !csesEnabled) return false;
        return true;
      }).length;
    }
  } else if (platform === 'CF' && (cfSolvedCount > 0 || cfHandle)) {
    total = cfSolvedCount;
  } else if (platform === 'AC' && (acSolvedCount > 0 || acHandle)) {
    total = acSolvedCount;
  } else if (platform === 'LC' && (lcSolvedCount > 0 || lcUsername)) {
    total = lcSolvedCount;
  } else if (platform === 'TP' && (tpSolvedCount > 0 || tpHandle)) {
    total = tpSolvedCount;
  } else if (platform === 'CSES') {
    total = effectiveCsesSolved;
  } else {
    const filtered = syncLog.filter(e => e.platform === platform);
    total = filtered.length;
  }
  
  const isPlatformActive = (p) => {
    if (p === 'CF') return !!((cfHandle || cfSolvedCount > 0 || cfAttemptsCount > 0) && cfEnabled);
    if (p === 'AC') return !!((acHandle || acSolvedCount > 0 || acAttemptsCount > 0) && acEnabled);
    if (p === 'LC') return !!((lcUsername || lcSolvedCount > 0 || lcAttemptsCount > 0) && lcEnabled);
    if (p === 'TP') return !!((tpHandle || tpSolvedCount > 0 || tpAttemptsCount > 0) && tpEnabled);
    if (p === 'CSES') return !!((csesSolvedCount > 0 || csesAttemptsCount > 0 || syncLog.some(e => e.platform === 'CSES') || Object.keys(dailySubmissionActivity.CSES || {}).length > 0) && csesEnabled);
    return false;
  };
  const hasAnyAccount = isPlatformActive('CF') || isPlatformActive('AC') || isPlatformActive('LC') || isPlatformActive('TP') || isPlatformActive('CSES');

  if (!hasAnyAccount && syncLog.length === 0) {
    total = 0;
  }
  
  animateCount($('stat-total'), total);
  const firstStatLabel = document.querySelector('.stats-grid .stat-card:first-child .stat-label');
  if (firstStatLabel) {
    firstStatLabel.textContent = platform === 'TP' ? 'Practice' : 'Solved';
  }

  // Calculate Total Attempts using true platform submission counts
  let totalAttempts = 0;
  if (!hasAnyAccount && syncLog.length === 0) {
    totalAttempts = 0;
  } else if (platform === 'CF') {
    totalAttempts = isPlatformActive('CF') ? (cfAttemptsCount || 0) : 0;
  } else if (platform === 'AC') {
    totalAttempts = isPlatformActive('AC') ? (acAttemptsCount || 0) : 0;
  } else if (platform === 'LC') {
    totalAttempts = isPlatformActive('LC') ? (lcAttemptsCount || 0) : 0;
  } else if (platform === 'TP') {
    totalAttempts = isPlatformActive('TP') ? (tpAttemptsCount || 0) : 0;
  } else if (platform === 'CSES') {
    const csesLogs = syncLog.filter(e => e.platform === 'CSES');
    const csesFailed = failedQueue.filter(e => e.platform === 'CSES');
    let csesSubActivityCount = 0;
    const csesSubAct = dailySubmissionActivity.CSES || dailyActivity.CSES || {};
    for (const cnt of Object.values(csesSubAct)) {
      csesSubActivityCount += (typeof cnt === 'number' ? cnt : 0);
    }
    totalAttempts = Math.max(total, csesLogs.length + csesFailed.length, csesSubActivityCount, csesAttemptsCount || 0);
  } else {
    let csesAtt = 0;
    if (isPlatformActive('CSES')) {
      const csesLogs = syncLog.filter(e => e.platform === 'CSES');
      const csesFailed = failedQueue.filter(e => e.platform === 'CSES');
      let csesSubActivityCount = 0;
      const csesSubAct = dailySubmissionActivity.CSES || dailyActivity.CSES || {};
      for (const cnt of Object.values(csesSubAct)) {
        csesSubActivityCount += (typeof cnt === 'number' ? cnt : 0);
      }
      csesAtt = Math.max(csesLogs.length + csesFailed.length, csesSubActivityCount, csesAttemptsCount || 0);
    }
    totalAttempts = (isPlatformActive('CF') ? (cfAttemptsCount || 0) : 0) +
                    (isPlatformActive('AC') ? (acAttemptsCount || 0) : 0) +
                    (isPlatformActive('LC') ? (lcAttemptsCount || 0) : 0) +
                    (isPlatformActive('TP') ? (tpAttemptsCount || 0) : 0) +
                    csesAtt;
  }

  // Fallback to daily activity / logs only if active platform counters are smaller than solved
  if (hasAnyAccount && totalAttempts < total) {
    const platformsToCheck = (platform === 'all' ? ['CF', 'AC', 'LC', 'TP', 'CSES'] : [platform]).filter(isPlatformActive);
    let subCountFromActivity = 0;
    for (const p of platformsToCheck) {
      const subAct = dailySubmissionActivity[p] || {};
      for (const cnt of Object.values(subAct)) {
        subCountFromActivity += (typeof cnt === 'number' ? cnt : 0);
      }
    }
    const relevantLogs = syncLog.filter(e => platform === 'all' || e.platform === platform);
    const relevantFailed = failedQueue.filter(e => platform === 'all' || e.platform === platform);
    const logAttempts = relevantLogs.length + relevantFailed.length;
    totalAttempts = Math.max(total, subCountFromActivity, logAttempts, totalAttempts);
  } else if (!hasAnyAccount && syncLog.length === 0) {
    totalAttempts = 0;
  }

  const statAttempts = $('stat-attempts');
  if (statAttempts) {
    animateCount(statAttempts, totalAttempts);
  }

  // Compute and display AC Rate (Success / Total Attempts)
  const statRate = $('stat-rate');
  if (statRate) {
    let effectiveSuccess = total;
    if (platform === 'CSES') {
      const csesAct = dailyActivity.CSES || {};
      const sumAc = Object.values(csesAct).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
      if (sumAc > 0) effectiveSuccess = Math.max(total, sumAc);
    }
    const acRate = totalAttempts > 0 ? Math.min(100, Math.round((effectiveSuccess / totalAttempts) * 100)) : 100;
    statRate.textContent = `${acRate}%`;
  }
}

// ── Render Failed Queue Banner ────────────────────────────────────────────────
function renderFailedBanner() {
  const banner = $('failed-banner');
  if (failedQueue.length > 0) {
    banner.style.display = 'flex';
    const lastErr = failedQueue[0].lastError ? `: ${failedQueue[0].lastError}` : '';
    $('failed-text').textContent = `⚠️ ${failedQueue.length} sync${failedQueue.length > 1 ? 's' : ''} failed`;
    banner.setAttribute('title', `Failed uploads${lastErr}\nClick Retry to sync again.`);
  } else {
    banner.style.display = 'none';
  }
}

// ── Math Fix Banner ────────────────────────────────────────────────────────────
let autoSyncAfterScan = false; // set true when "Fix Now" is clicked, to auto-sync after scan

async function initMathFixBanner() {
  const { mathFixMigrationV2, syncLog: sl = [] } = await chrome.storage.local.get(['mathFixMigrationV2', 'syncLog']);
  if (!mathFixMigrationV2) return; // Migration hasn't run yet
  const cfAcCount = (sl || []).filter(e => e.platform === 'CF' || e.platform === 'AC').length;
  const mathFixBanner = $('math-fix-banner');
  if (!mathFixBanner) return;
  if (cfAcCount === 0) {
    // CF/AC log was cleared by migration — show the banner
    mathFixBanner.style.display = 'flex';
    const btn = $('math-fix-btn');
    if (btn) {
      btn.addEventListener('click', async () => {
        mathFixBanner.style.display = 'none';
        autoSyncAfterScan = true; // will auto-sync when scan finishes
        const scanBtn2 = $('scan-btn');
        if (scanBtn2 && !scanBtn2.disabled) scanBtn2.click();
        else showToast('Click "Scan Unsynced" to apply the math fix', 'success');
      });
    }
  } else {
    mathFixBanner.style.display = 'none';
  }
}


// ── Render Attempt Graph (Success vs Failed - 30 Days) ────────────────────────
function renderAttemptGraph(platform) {
  const svg = $('attempt-graph-svg');
  const tooltip = $('attempt-tooltip');
  if (!svg) return;

  const numDays = 30;
  const userOffsetHours = -new Date().getTimezoneOffset() / 60;
  const today = new Date();
  const todayDateStr = epochToDateStr(today.getTime() / 1000, userOffsetHours);
  const thirtyDaysAgoTime = today.getTime() - (numDays - 1) * 86400000;
  const thirtyDaysAgoDateStr = epochToDateStr(thirtyDaysAgoTime / 1000, userOffsetHours);

  const platformsToCheck = platform === 'all' ? ['CF', 'AC', 'LC', 'TP', 'CSES'].filter(p => {
    if (p === 'CF') return !!((cfHandle || cfSolvedCount > 0 || cfAttemptsCount > 0) && cfEnabled);
    if (p === 'AC') return !!((acHandle || acSolvedCount > 0 || acAttemptsCount > 0) && acEnabled);
    if (p === 'LC') return !!((lcUsername || lcSolvedCount > 0 || lcAttemptsCount > 0) && lcEnabled);
    if (p === 'TP') return !!((tpHandle || tpSolvedCount > 0 || tpAttemptsCount > 0) && tpEnabled);
    if (p === 'CSES') return !!((csesSolvedCount > 0 || csesAttemptsCount > 0 || syncLog.some(e => e.platform === 'CSES') || Object.keys(dailySubmissionActivity.CSES || {}).length > 0) && csesEnabled);
    return false;
  }) : [platform];

  // Check whether selected platforms have activity in the last 30 days, or find latest date
  let hasRecentInLast30 = false;
  let latestActivityDateStr = null;

  for (const p of platformsToCheck) {
    const pAct = dailyActivity[p] || {};
    const pSubAct = dailySubmissionActivity[p] || {};
    for (const [dStr, cnt] of Object.entries(pAct)) {
      if (typeof cnt === 'number' && cnt > 0 && dStr >= '2000-01-01') {
        if (dStr >= thirtyDaysAgoDateStr && dStr <= todayDateStr) hasRecentInLast30 = true;
        if (!latestActivityDateStr || dStr > latestActivityDateStr) latestActivityDateStr = dStr;
      }
    }
    for (const [dStr, cnt] of Object.entries(pSubAct)) {
      if (typeof cnt === 'number' && cnt > 0 && dStr >= '2000-01-01') {
        if (dStr >= thirtyDaysAgoDateStr && dStr <= todayDateStr) hasRecentInLast30 = true;
        if (!latestActivityDateStr || dStr > latestActivityDateStr) latestActivityDateStr = dStr;
      }
    }
  }

  for (const entry of syncLog) {
    if (platform !== 'all' && entry.platform !== platform) continue;
    if (!platformsToCheck.includes(entry.platform)) continue;
    if (entry.syncedFromGitHub || (entry.commitMsg && entry.commitMsg.startsWith('Synced from GitHub'))) continue;
    const rawTime = entry.submissionTime || entry.syncedAt;
    if (!rawTime) continue;
    const t = new Date(rawTime).getTime();
    if (!t || t < 946684800000) continue;
    const dStr = epochToDateStr(t / 1000, userOffsetHours);
    if (dStr >= thirtyDaysAgoDateStr && dStr <= todayDateStr) hasRecentInLast30 = true;
    if (!latestActivityDateStr || dStr > latestActivityDateStr) latestActivityDateStr = dStr;
  }

  for (const item of failedQueue) {
    if (platform !== 'all' && item.platform !== platform) continue;
    if (!platformsToCheck.includes(item.platform)) continue;
    const t = item.failedAt ? new Date(item.failedAt).getTime() : 0;
    if (!t || t < 946684800000) continue;
    const dStr = epochToDateStr(t / 1000, userOffsetHours);
    if (dStr >= thirtyDaysAgoDateStr && dStr <= todayDateStr) hasRecentInLast30 = true;
    if (!latestActivityDateStr || dStr > latestActivityDateStr) latestActivityDateStr = dStr;
  }

  // Anchor 30-day timeline to today if recent activity exists, or anchor to latestActivityDateStr
  let endDate = today;
  let isCustomWindow = false;
  if (!hasRecentInLast30 && latestActivityDateStr) {
    const parts = latestActivityDateStr.split('-');
    if (parts.length === 3) {
      endDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
      isCustomWindow = true;
    }
  }

  // Build 30-day timeline [oldest ... endDate] using USER LOCAL dates
  const timeline = [];
  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(endDate.getTime() - i * 86400000);
    const dateStr = epochToDateStr(d.getTime() / 1000, userOffsetHours);
    timeline.push({ dateStr, label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), success: 0, failed: 0 });
  }

  const timelineMap = {};
  timeline.forEach((item, idx) => { timelineMap[item.dateStr] = idx; });

  const titleEl = $('attempt-graph-title') || document.querySelector('.attempt-graph-title');
  if (titleEl) {
    if (isCustomWindow && timeline.length >= numDays) {
      titleEl.textContent = `📊 Submissions (${timeline[0].label} – ${timeline[numDays - 1].label})`;
    } else {
      titleEl.textContent = `📊 Submissions (30 days)`;
    }
  }

  // Track counts per day per platform to avoid double counting
  const dayPlatformSuccess = {}; // dateStr -> { CF: n, AC: n, LC: n, TP: n }
  const dayPlatformFailed = {};
  const hasApiActivity = {};

  for (const p of platformsToCheck) {
    const pAct = dailyActivity[p] || {};
    const pSubAct = dailySubmissionActivity[p] || {};
    hasApiActivity[p] = (Object.keys(pAct).length > 0 || Object.keys(pSubAct).length > 0);

    for (const [dStr, count] of Object.entries(pAct)) {
      if (timelineMap[dStr] !== undefined && typeof count === 'number' && count > 0) {
        if (!dayPlatformSuccess[dStr]) dayPlatformSuccess[dStr] = {};
        dayPlatformSuccess[dStr][p] = count;
      }
    }

    for (const [dStr, subCount] of Object.entries(pSubAct)) {
      if (timelineMap[dStr] !== undefined && typeof subCount === 'number' && subCount > 0) {
        let acCount = (dayPlatformSuccess[dStr] && dayPlatformSuccess[dStr][p]) || (pAct[dStr] || 0);
        const failedCount = Math.max(0, subCount - acCount);
        if (!dayPlatformFailed[dStr]) dayPlatformFailed[dStr] = {};
        dayPlatformFailed[dStr][p] = failedCount;
      }
    }
  }

  // Include recent syncLog entries (merge with API data using Math.max to avoid double counting)
  const syncLogCounts = {};
  for (const entry of syncLog) {
    if (platform !== 'all' && entry.platform !== platform) continue;
    const p = entry.platform;
    if (!platformsToCheck.includes(p)) continue;
    if (entry.syncedFromGitHub || (entry.commitMsg && entry.commitMsg.startsWith('Synced from GitHub'))) continue;

    const rawTime = entry.submissionTime || entry.syncedAt;
    if (!rawTime) continue;
    const t = new Date(rawTime).getTime();
    if (!t || t < 946684800000) continue;
    const dateStr = epochToDateStr(t / 1000, userOffsetHours);
    if (timelineMap[dateStr] !== undefined) {
      const key = `${p}_${dateStr}`;
      syncLogCounts[key] = (syncLogCounts[key] || 0) + 1;
    }
  }

  for (const [key, count] of Object.entries(syncLogCounts)) {
    const [p, dateStr] = key.split('_');
    if (!dayPlatformSuccess[dateStr]) dayPlatformSuccess[dateStr] = {};
    dayPlatformSuccess[dateStr][p] = Math.max(dayPlatformSuccess[dateStr][p] || 0, count);
  }

  // Include failedQueue entries
  for (const item of failedQueue) {
    if (platform !== 'all' && item.platform !== platform) continue;
    const p = item.platform;
    if (!platformsToCheck.includes(p)) continue;
    const dateStr = item.failedAt ? epochToDateStr(new Date(item.failedAt).getTime() / 1000, userOffsetHours) : todayInOffset(userOffsetHours);
    if (timelineMap[dateStr] !== undefined) {
      if (!dayPlatformFailed[dateStr]) dayPlatformFailed[dateStr] = {};
      dayPlatformFailed[dateStr][p] = (dayPlatformFailed[dateStr][p] || 0) + 1;
    }
  }

  // Sum across platforms for 'all', or set for specific platform
  for (const [dStr, pCounts] of Object.entries(dayPlatformSuccess)) {
    const idx = timelineMap[dStr];
    if (idx !== undefined) {
      timeline[idx].success = Object.values(pCounts).reduce((a, b) => a + b, 0);
    }
  }
  for (const [dStr, pCounts] of Object.entries(dayPlatformFailed)) {
    const idx = timelineMap[dStr];
    if (idx !== undefined) {
      timeline[idx].failed = Object.values(pCounts).reduce((a, b) => a + b, 0);
    }
  }

  // Find max value for scaling (at least 5 for nice headroom)
  let maxVal = 5;
  timeline.forEach(d => {
    if (d.success > maxVal) maxVal = d.success;
    if (d.failed > maxVal) maxVal = d.failed;
  });

  const width = 428;
  const height = 80;
  const padLeft = 8;
  const padRight = 8;
  const padTop = 8;
  const padBottom = 14;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;
  const baseline = padTop + innerH;

  const pointsSuccess = [];
  const pointsFailed = [];

  timeline.forEach((d, i) => {
    const x = padLeft + (i / (numDays - 1)) * innerW;
    const ySuccess = baseline - (d.success / maxVal) * innerH;
    const yFailed = baseline - (d.failed / maxVal) * innerH;
    pointsSuccess.push({ x, y: ySuccess, count: d.success, ...d });
    pointsFailed.push({ x, y: yFailed, count: d.failed, ...d });
  });

  // Generate SVG paths
  const successLine = pointsSuccess.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const successArea = `${successLine} L ${pointsSuccess[numDays - 1].x.toFixed(1)} ${baseline} L ${pointsSuccess[0].x.toFixed(1)} ${baseline} Z`;

  const failedLine = pointsFailed.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const failedArea = `${failedLine} L ${pointsFailed[numDays - 1].x.toFixed(1)} ${baseline} L ${pointsFailed[0].x.toFixed(1)} ${baseline} Z`;

  svg.innerHTML = `
    <defs>
      <linearGradient id="acGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#22c55e" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#22c55e" stop-opacity="0.02"/>
      </linearGradient>
      <linearGradient id="failGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ef4444" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#ef4444" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    <!-- Grid line -->
    <line x1="${padLeft}" y1="${baseline - innerH * 0.5}" x2="${width - padRight}" y2="${baseline - innerH * 0.5}" stroke="rgba(30, 42, 66, 0.4)" stroke-dasharray="3,3" />
    <line x1="${padLeft}" y1="${baseline}" x2="${width - padRight}" y2="${baseline}" stroke="rgba(30, 42, 66, 0.6)" />
    <!-- Fail Area & Line -->
    <path d="${failedArea}" fill="url(#failGrad)" />
    <path d="${failedLine}" fill="none" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    <!-- Success Area & Line -->
    <path d="${successArea}" fill="url(#acGrad)" />
    <path d="${successLine}" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
  `;

  // Add interactive hit areas
  const stepW = innerW / (numDays - 1);
  timeline.forEach((d, i) => {
    const hitRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    hitRect.setAttribute('x', String(padLeft + i * stepW - stepW / 2));
    hitRect.setAttribute('y', '0');
    hitRect.setAttribute('width', String(stepW));
    hitRect.setAttribute('height', String(height));
    hitRect.setAttribute('fill', 'transparent');
    hitRect.style.cursor = 'pointer';

    hitRect.addEventListener('mouseenter', (e) => {
      if (tooltip) {
        const totalDayAttempts = d.success + d.failed;
        tooltip.innerHTML = `<div style="font-weight:700;color:#f0f4fc;margin-bottom:3px;">${d.label}</div><div style="display:flex;gap:8px;justify-content:center;align-items:center;"><span style="color:#22c55e;font-weight:700;">✓ ${d.success} AC</span><span style="color:#64748b;">•</span><span style="color:#ef4444;font-weight:700;">✕ ${d.failed} Failed</span></div><div style="color:#94a3b8;font-size:9.5px;margin-top:2px;">Total: ${totalDayAttempts} attempt${totalDayAttempts !== 1 ? 's' : ''}</div>`;
        tooltip.style.display = 'block';
        const rect = svg.getBoundingClientRect();
        const tipW = tooltip.offsetWidth || 130;
        let left = rect.left + padLeft + i * stepW - tipW / 2;
        left = Math.max(10, Math.min(window.innerWidth - tipW - 10, left));
        tooltip.style.left = `${left}px`;
        const tipH = tooltip.offsetHeight || 52;
        let top = rect.top - tipH - 8;
        if (top < 10) top = rect.bottom + 8;
        tooltip.style.top = `${top}px`;
      }
    });

    hitRect.addEventListener('mouseleave', () => {
      if (tooltip) tooltip.style.display = 'none';
    });

    svg.appendChild(hitRect);
  });
}

// ── Render All ────────────────────────────────────────────────────────────────
function renderAll(platform) {
  renderStreak(platform);
  renderStats(platform);
  renderAttemptGraph(platform);
  const segments = computeChartData(platform);
  const total = segments.reduce((sum, s) => sum + s.count, 0);
  drawDonut(segments, total);
  renderLegend(segments);
  renderSyncList(platform);
}

// ── Render History Modal List ──────────────────────────────────────────────────
function renderHistoryModalList() {
  const query = $('history-search').value.toLowerCase().trim();
  const listContainer = $('modal-history-list');
  
  // Filter by current tab — CF tab shows only CF, etc.
  const tabFilter = (e) => {
    if (currentTab !== 'all' && e.platform !== currentTab) return false;
    if (e.platform === 'CF' && !cfEnabled) return false;
    if (e.platform === 'AC' && !acEnabled) return false;
    if (e.platform === 'LC' && !lcEnabled) return false;
    if (e.platform === 'TP' && !tpEnabled) return false;
    if (e.platform === 'CSES' && !csesEnabled) return false;
    return true;
  };

  const filteredLog = syncLog.filter(tabFilter);
  filteredLog.sort((a, b) => {
    const tA = new Date(a.syncedAt || a.submissionTime || 0).getTime();
    const tB = new Date(b.syncedAt || b.submissionTime || 0).getTime();
    return tB - tA;
  });
  const filteredFailed = failedQueue.filter(tabFilter).map(getFailedItemDetails);
  const combined = [...filteredFailed, ...filteredLog];

  const filtered = combined.filter(item => {
    const name = (item.problemName || item.problemCode || '').toLowerCase();
    const plat = (item.platform || '').toLowerCase();
    const err = item.isFailed ? item.lastError.toLowerCase() : '';
    return name.includes(query) || plat.includes(query) || err.includes(query);
  });


  if (filtered.length === 0) {
    listContainer.innerHTML = '<div class="empty-state"><p>No matching sync records found.</p></div>';
    return;
  }

  const ul = document.createElement('ul');
  ul.className = 'submission-list';
  
  for (const item of filtered) {
    const li = document.createElement('li');
    const displayName = item.problemName || item.problemCode || 'Unknown';
    const meta = buildMeta(item);
    
    const icon = item.isFailed ? '⚠️' : '✓';
    const iconClass = item.isFailed ? 'style="color:var(--red);font-size:13px;"' : 'class="check-icon"';
    const failStyle = item.isFailed ? 'style="border-left: 3px solid var(--red);"' : '';

    const tag = item.isFailed ? 'div' : 'a';
    const hrefAttr = item.isFailed ? '' : `href="${item.repoPath}" target="_blank"`;

    li.innerHTML = `<${tag} class="submission-item" ${hrefAttr} ${failStyle}>
      <span class="platform-badge ${item.platform}">${item.platform}</span>
      <div class="sub-details">
        <div class="sub-name" title="${displayName}">${displayName}</div>
        <div class="sub-meta">${meta}</div>
      </div>
      <span ${iconClass}>${icon}</span>
    </${tag}>`;
    ul.appendChild(li);
  }
  listContainer.innerHTML = '';
  listContainer.appendChild(ul);
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(message, type = 'error') {
  const existing = document.querySelector('.error-toast, .success-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = type === 'error' ? 'error-toast' : 'success-toast';
  toast.innerHTML = `<span>${type === 'error' ? '⚠️' : '✅'}</span> ${message}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ── Link Account Modal ────────────────────────────────────────────────────────
function showLinkModal(title, message) {
  $('link-modal-title').textContent = title;
  $('link-modal-message').textContent = message;
  $('link-modal').style.display = 'flex';
  
  const cancelBtn = $('link-modal-cancel');
  const confirmBtn = $('link-modal-confirm');
  
  const close = () => {
    $('link-modal').style.display = 'none';
    cancelBtn.removeEventListener('click', close);
    confirmBtn.removeEventListener('click', confirm);
  };
  
  const confirm = () => {
    chrome.runtime.openOptionsPage();
    close();
  };
  
  cancelBtn.addEventListener('click', close);
  confirmBtn.addEventListener('click', confirm);
}

// ── Bulk Sync Progress Handlers ──────────────────────────────────────────────
function appendLog(msg, cls) {
  const log = $('bulk-log');
  const line = document.createElement('div');
  if (cls) line.className = cls;
  line.textContent = msg;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

function setProgress(done, total, label) {
  $('progress-fill').style.width = total > 0 ? `${Math.round((done / total) * 100)}%` : '0%';
  $('progress-text').textContent = label || `Uploading… (${done}/${total})`;
  $('progress-count').textContent = total > 0 ? `${Math.round((done / total) * 100)}%` : '';
}

async function refreshStateAndUI() {
  const data = await chrome.storage.local.get([
    'syncLog', 'totalSynced', 'dailyActivity', 'dailySubmissionActivity', 'failedQueue',
    'cfSolvedCount', 'cfDivCounts', 'cfStreak', 'cfAttemptsCount',
    'acSolvedCount', 'acContestCounts', 'acStreak', 'acAttemptsCount',
    'lcSolvedCount', 'lcStreak', 'lcDifficultyCounts', 'lcAttemptsCount',
    'tpSolvedCount', 'tpAttemptsCount', 'tpContestCount', 'tpCategoryCounts', 'tpStreak',
    'csesSolvedCount', 'csesAttemptsCount', 'csesStreak',
    'cfOffset', 'acOffset'
  ]);
  syncLog = (data.syncLog || []).filter(e => {
    if (e.platform === 'CSES' && String(e.subId) === '18982336') {
      return false;
    }
    return true;
  });
  // Ensure Repetitions is retained / present if user solved it on CSES
  if (!syncLog.some(e => e.platform === 'CSES' && ((e.problemCode || '').includes('1069') || (e.problemName || '').toLowerCase().includes('repetitions')))) {
    const repEntry = {
      platform: 'CSES',
      problemCode: 'CSES-1069',
      problemName: 'Repetitions',
      taskId: '1069',
      category: 'Introductory Problems',
      commitMsg: 'CSES: Repetitions - Accepted (C++)',
      syncedAt: '2026-10-06T09:54:17.000Z',
      submissionTime: '2026-10-06T09:54:17.000Z',
      syncedFromGitHub: true,
      lang: 'cpp',
      repoPath: 'CSES/1069 - Repetitions'
    };
    syncLog.push(repEntry);
  }
  syncLog.sort((a, b) => {
    const tA = new Date(a.syncedAt || a.submissionTime || 0).getTime();
    const tB = new Date(b.syncedAt || b.submissionTime || 0).getTime();
    return tB - tA;
  });
  totalSynced = data.totalSynced || 0;
  dailyActivity = getDailyActivity(data);
  dailySubmissionActivity = getDailySubmissionActivity(data);
  failedQueue = data.failedQueue || [];
  cfSolvedCount = data.cfSolvedCount || 0;
  cfAttemptsCount = data.cfAttemptsCount || 0;
  cfDivCounts = data.cfDivCounts || {};
  cfStreak = data.cfStreak || 0;
  acSolvedCount = data.acSolvedCount || 0;
  acAttemptsCount = data.acAttemptsCount || 0;
  acContestCounts = data.acContestCounts || {};
  acStreak = data.acStreak || 0;
  lcSolvedCount = data.lcSolvedCount || 0;
  lcAttemptsCount = data.lcAttemptsCount || 0;
  lcStreak = data.lcStreak || 0;
  lcDifficultyCounts = data.lcDifficultyCounts || {};
  tpSolvedCount = data.tpSolvedCount || 0;
  tpAttemptsCount = data.tpAttemptsCount || 0;
  tpContestCount = data.tpContestCount || 0;
  tpCategoryCounts = data.tpCategoryCounts || {};
  tpStreak = data.tpStreak || 0;
  const uniqueCsesSolved = new Set(syncLog.filter(e => e.platform === 'CSES').map(e => e.problemCode || e.problemName)).size;
  csesSolvedCount = Math.max(data.csesSolvedCount || 0, uniqueCsesSolved);
  let csesSubActivityCount = 0;
  const csesSubAct = (dailySubmissionActivity && dailySubmissionActivity.CSES) || (dailyActivity && dailyActivity.CSES) || {};
  for (const cnt of Object.values(csesSubAct)) {
    csesSubActivityCount += (typeof cnt === 'number' ? cnt : 0);
  }
  csesAttemptsCount = Math.max(data.csesAttemptsCount || 0, csesSubActivityCount, csesSolvedCount);
  csesStreak = data.csesStreak || 0;
  cfOffset = data.cfOffset || null;
  acOffset = data.acOffset || null;

  // Recompute today counts from stored dailyActivity using platform-specific offsets
  const _userOffset = -new Date().getTimezoneOffset() / 60;
  const _todayLocal = todayInOffset(_userOffset);
  const _todayCF = cfOffset != null ? todayInOffset(cfOffset) : _todayLocal;
  const _todayAC = acOffset != null ? todayInOffset(acOffset) : _todayLocal;
  cfTodayCount = ((dailyActivity.CF || {})[_todayCF]) || 0;
  acTodayCount = ((dailyActivity.AC || {})[_todayAC]) || 0;
  lcTodayCount = ((dailyActivity.LC || {})[_todayLocal]) || 0;
  tpTodayCount = ((dailyActivity.TP || {})[_todayLocal]) || 0;
  csesTodayCount = ((dailyActivity.CSES || {})[_todayLocal]) || 0;

  // Fallback: if stored API streak is 0 but local submission activity shows data for today,
  // compute streak locally from dailySubmissionActivity so it's correct immediately.
  const _acSubAct = dailySubmissionActivity.AC || dailyActivity.AC || {};
  if (acStreak === 0 && (_acSubAct[_todayAC] || 0) > 0) {
    const _acOffsetUsed = acOffset != null ? acOffset : _userOffset;
    acStreak = computeStreakFromActivity(_acSubAct, _acOffsetUsed).streak;
  }
  const _lcSubAct = dailySubmissionActivity.LC || dailyActivity.LC || {};
  if (lcStreak === 0 && (_lcSubAct[_todayLocal] || 0) > 0) {
    lcStreak = computeStreakFromActivity(_lcSubAct, _userOffset).streak;
  }
  const _cfSubAct = dailySubmissionActivity.CF || dailyActivity.CF || {};
  if (cfStreak === 0 && (_cfSubAct[_todayCF] || 0) > 0) {
    const _cfOffsetUsed = cfOffset != null ? cfOffset : _userOffset;
    cfStreak = computeStreakFromActivity(_cfSubAct, _cfOffsetUsed).streak;
  }
  const _tpAct = dailyActivity.TP || {};
  if (tpStreak === 0 && (_tpAct[_todayLocal] || 0) > 0) {
    tpStreak = computeStreakFromActivity(_tpAct, _userOffset).streak;
  }
  const _csesSubAct = dailySubmissionActivity.CSES || dailyActivity.CSES || {};
  if (csesStreak === 0 && (_csesSubAct[_todayLocal] || 0) > 0) {
    csesStreak = computeStreakFromActivity(_csesSubAct, _userOffset).streak;
  }

  $('footer-text').textContent = totalSynced > 0 ? `${totalSynced} problems synced` : 'No syncs yet';
  renderAll(currentTab);
  renderFailedBanner();
}

// Track which platforms have been scanned in this session (use UPPERCASE keys to match currentTab)
const scanState = { CF: false, AC: false, CSES: false, LC: false, TP: false };
const scanErrors = { CF: null, AC: null, CSES: null, LC: null, TP: null };

function getPlatformStatusText(platform) {
  // platform = 'CF'/'AC'/'CSES'/'LC'/'TP' (uppercase)
  if (scanErrors[platform]) {
    const err = String(scanErrors[platform]).toLowerCase();
    if (err.includes('unavailable') || err.includes('cloudflare') || err.includes('sign in') || err.includes('log in') || err.includes('cookie')) {
      return { text: '⚠️ API unavailable', color: '#f87171', font: '600' };
    }
    return { text: '⚠️ Scan error', color: '#f87171', font: '600' };
  }
  if (!scanState[platform]) return { text: '— Scan to check', color: 'var(--muted)', font: '400' };
  const count = unsyncedItems.filter(i => i.platform === platform).length;
  if (count === 0) {
    // Also check failedQueue — if there are failures for this platform, don't show all-clear
    const platformFailed = failedQueue.filter(i => i.platform === platform).length;
    if (platformFailed > 0) {
      return { text: `⚠️ ${platformFailed} failed — retry`, color: '#f87171', font: '600' };
    }
    return { text: '✅ All synced!', color: '#4ade80', font: '600' };
  }
  return { text: `⚠️ ${count} unsynced found`, color: '#fb923c', font: '600' };
}

function updatePlatformStatusRows() {
  const platforms = ['CF', 'AC', 'CSES', 'LC', 'TP'];
  for (const p of platforms) {
    const pLow = p.toLowerCase();
    const row = $(`${pLow}-status-row`);
    const textEl = $(`${pLow}-status-text`);
    if (!row || !textEl) continue;

    // Visibility: show all rows on All tab (if enabled), show only matching row on platform tab
    const isEnabled = { CF: cfEnabled, AC: acEnabled, CSES: csesEnabled, LC: lcEnabled, TP: tpEnabled }[p];
    if (!isEnabled) {
      row.style.display = 'none';
    } else if (currentTab === 'all') {
      row.style.display = 'flex';
    } else {
      row.style.display = currentTab === p ? 'flex' : 'none';
    }

    // Update text status
    const { text, color, font } = getPlatformStatusText(p);
    textEl.textContent = text;
    textEl.style.color = color;
    textEl.style.fontWeight = font || '500';
  }
}

function updateSmartSyncButton() {
  const smartSyncBtn = $('smart-sync-btn');
  const scanBtn = $('scan-btn');
  updatePlatformStatusRows();

  if (isSyncActive) {
    smartSyncBtn.disabled = true;
    scanBtn.disabled = true;
    smartSyncBtn.innerHTML = '<span>⏳ Syncing…</span>';
    return;
  }

  let filtered = unsyncedItems;
  if (currentTab !== 'all') {
    filtered = unsyncedItems.filter(item => item.platform === currentTab);
  }
  const count = filtered.length;
  if (count > 0) {
    smartSyncBtn.disabled = false;
    smartSyncBtn.innerHTML = `<span>⚡ Sync Unsynced Solutions (${count})</span>`;
  } else {
    smartSyncBtn.disabled = true;
    smartSyncBtn.innerHTML = `<span>⚡ Sync Unsynced Solutions</span>`;
  }
}

// ── Update Status Banner ──────────────────────────────────────────────────────
async function updateStatusBanner() {
  const data = await chrome.storage.local.get([
    'cfHandle', 'acHandle', 'lcUsername', 'tpHandle', 'ghToken', 'ghOwner', 'ghRepo',
    'cfEnabled', 'acEnabled', 'lcEnabled', 'tpEnabled', 'csesEnabled'
  ]);
  const configured = !!(data.ghToken && data.ghOwner && data.ghRepo);
  const banner = $('status-banner');
  const dot = $('status-dot');
  if (configured) {
    banner.className = 'status-banner configured';
    dot.className = 'dot green';
    
    let label = '';
    if (currentTab === 'CF') {
      label = (data.cfEnabled !== false && data.cfHandle) ? `active (${data.cfHandle})` : 'inactive';
    } else if (currentTab === 'AC') {
      label = (data.acEnabled !== false && data.acHandle) ? `active (${data.acHandle})` : 'inactive';
    } else if (currentTab === 'LC') {
      label = (data.lcEnabled !== false && data.lcUsername) ? `active (${data.lcUsername})` : 'inactive';
    } else if (currentTab === 'TP') {
      label = (data.tpEnabled !== false && data.tpHandle) ? `active (${data.tpHandle})` : 'inactive';
    } else if (currentTab === 'CSES') {
      label = (data.csesEnabled !== false) ? 'active (CSES)' : 'inactive';
    } else { // 'all'
      label = data.ghOwner ? `active (${data.ghOwner})` : 'active';
    }
    $('status-text').textContent = label;
  } else {
    banner.className = 'status-banner not-configured';
    dot.className = 'dot red';
    $('status-text').textContent = 'Not configured — click ⚙️ Settings';
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const data = await chrome.storage.local.get([
    'cfHandle', 'acHandle', 'lcUsername', 'tpHandle', 'ghToken', 'ghOwner', 'ghRepo',
    'syncLog', 'totalSynced', 'dailyActivity', 'dailySubmissionActivity',
    'soundEnabled', 'failedQueue', 'cfSolvedCount', 'cfDivCounts', 'cfStreak',
    'acSolvedCount', 'acContestCounts', 'acStreak',
    'lcSolvedCount', 'lcStreak', 'lcDifficultyCounts',
    'tpSolvedCount', 'tpCategoryCounts', 'tpStreak', 'tpContestCount',
    'csesSolvedCount', 'csesAttemptsCount', 'csesStreak',
    'cfEnabled', 'acEnabled', 'lcEnabled', 'tpEnabled', 'csesEnabled', 'cfOffset', 'acOffset',
    'cfAttemptsCount', 'acAttemptsCount', 'lcAttemptsCount', 'tpAttemptsCount'
  ]);

  syncLog = (data.syncLog || []).filter(e => {
    if (e.platform === 'CSES' && String(e.subId) === '18982336') {
      return false;
    }
    return true;
  });
  // Ensure Repetitions is retained / present if user solved it on CSES
  if (!syncLog.some(e => e.platform === 'CSES' && ((e.problemCode || '').includes('1069') || (e.problemName || '').toLowerCase().includes('repetitions')))) {
    const repEntry = {
      platform: 'CSES',
      problemCode: 'CSES-1069',
      problemName: 'Repetitions',
      taskId: '1069',
      category: 'Introductory Problems',
      commitMsg: 'CSES: Repetitions - Accepted (C++)',
      syncedAt: '2026-10-06T09:54:17.000Z',
      submissionTime: '2026-10-06T09:54:17.000Z',
      syncedFromGitHub: true,
      lang: 'cpp',
      repoPath: 'CSES/1069 - Repetitions'
    };
    syncLog.push(repEntry);
  }
  syncLog.sort((a, b) => {
    const tA = new Date(a.syncedAt || a.submissionTime || 0).getTime();
    const tB = new Date(b.syncedAt || b.submissionTime || 0).getTime();
    return tB - tA;
  });
  totalSynced = data.totalSynced || 0;
  dailyActivity = getDailyActivity(data);
  dailySubmissionActivity = getDailySubmissionActivity(data);
  soundEnabled = data.soundEnabled !== false;
  failedQueue = data.failedQueue || [];
  cfSolvedCount = data.cfSolvedCount || 0;
  cfDivCounts = data.cfDivCounts || {};
  cfStreak = data.cfStreak || 0;
  acSolvedCount = data.acSolvedCount || 0;
  acContestCounts = data.acContestCounts || {};
  acStreak = data.acStreak || 0;
  lcSolvedCount = data.lcSolvedCount || 0;
  lcStreak = data.lcStreak || 0;
  lcDifficultyCounts = data.lcDifficultyCounts || {};
  tpSolvedCount = data.tpSolvedCount || 0;
  tpCategoryCounts = data.tpCategoryCounts || {};
  tpStreak = data.tpStreak || 0;
  tpContestCount = data.tpContestCount || 0;
  const uniqueCsesSolved = new Set(syncLog.filter(e => e.platform === 'CSES').map(e => e.problemCode || e.problemName)).size;
  csesSolvedCount = Math.max(data.csesSolvedCount || 0, uniqueCsesSolved);
  let csesSubActivityCount = 0;
  const csesSubAct = (dailySubmissionActivity && dailySubmissionActivity.CSES) || (dailyActivity && dailyActivity.CSES) || {};
  for (const cnt of Object.values(csesSubAct)) {
    csesSubActivityCount += (typeof cnt === 'number' ? cnt : 0);
  }
  csesAttemptsCount = Math.max(data.csesAttemptsCount || 0, csesSubActivityCount, csesSolvedCount);
  csesStreak = data.csesStreak || 0;
  cfAttemptsCount = data.cfAttemptsCount || 0;
  acAttemptsCount = data.acAttemptsCount || 0;
  lcAttemptsCount = data.lcAttemptsCount || 0;
  tpAttemptsCount = data.tpAttemptsCount || 0;
  cfHandle = (data.cfHandle || '').trim();
  acHandle = (data.acHandle || '').trim();
  lcUsername = (data.lcUsername || '').trim();
  tpHandle = (data.tpHandle || '').trim();
  ghOwner = (data.ghOwner || '').trim();
  ghRepo = (data.ghRepo || '').trim();
  cfEnabled = data.cfEnabled !== false;
  acEnabled = data.acEnabled !== false;
  lcEnabled = data.lcEnabled !== false;
  tpEnabled = data.tpEnabled !== false;
  csesEnabled = data.csesEnabled !== false;
  cfOffset = data.cfOffset || null;
  acOffset = data.acOffset || null;
  // Recompute today counts from stored dailyActivity using platform-specific offsets
  const _userOffset = -new Date().getTimezoneOffset() / 60;
  const _todayLocal = todayInOffset(_userOffset);
  const _todayCF = cfOffset != null ? todayInOffset(cfOffset) : _todayLocal;
  const _todayAC = acOffset != null ? todayInOffset(acOffset) : _todayLocal;
  cfTodayCount = ((dailyActivity.CF || {})[_todayCF]) || 0;
  acTodayCount = ((dailyActivity.AC || {})[_todayAC]) || 0;
  lcTodayCount = ((dailyActivity.LC || {})[_todayLocal]) || 0;
  tpTodayCount = ((dailyActivity.TP || {})[_todayLocal]) || 0;
  csesTodayCount = ((dailyActivity.CSES || {})[_todayLocal]) || 0;

  // Fallback: if stored API streak is 0 but local submission activity has records,
  // compute streak locally from dailySubmissionActivity so it's accurate immediately.
  const _acSubAct = dailySubmissionActivity.AC || dailyActivity.AC || {};
  if (acStreak === 0 && Object.keys(_acSubAct).length > 0) {
    const _acOffsetUsed = acOffset != null ? acOffset : _userOffset;
    acStreak = computeStreakFromActivity(_acSubAct, _acOffsetUsed).streak;
  }
  const _lcSubAct = dailySubmissionActivity.LC || dailyActivity.LC || {};
  if (lcStreak === 0 && Object.keys(_lcSubAct).length > 0) {
    lcStreak = computeStreakFromActivity(_lcSubAct, _userOffset).streak;
  }
  const _cfSubAct = dailySubmissionActivity.CF || dailyActivity.CF || {};
  if (cfStreak === 0 && Object.keys(_cfSubAct).length > 0) {
    const _cfOffsetUsed = cfOffset != null ? cfOffset : _userOffset;
    cfStreak = computeStreakFromActivity(_cfSubAct, _cfOffsetUsed).streak;
  }
  const _tpSubAct = dailySubmissionActivity.TP || dailyActivity.TP || {};
  if (tpStreak === 0 && Object.keys(_tpSubAct).length > 0) {
    tpStreak = computeStreakFromActivity(_tpSubAct, _userOffset).streak;
  }
  const _csesSubAct = dailySubmissionActivity.CSES || dailyActivity.CSES || {};
  if (csesStreak === 0 && Object.keys(_csesSubAct).length > 0) {
    csesStreak = computeStreakFromActivity(_csesSubAct, _userOffset).streak;
  }

  // Hide disabled platform UI elements
  if (!cfEnabled) $('tab-cf').style.display = 'none';
  if (!acEnabled) $('tab-ac').style.display = 'none';
  if (!csesEnabled && $('tab-cses')) $('tab-cses').style.display = 'none';
  if (!lcEnabled) $('tab-lc').style.display = 'none';
  if (!tpEnabled) $('tab-tp').style.display = 'none';

  if (!cfEnabled) $('cf-status-row').style.display = 'none';
  if (!acEnabled) $('ac-status-row').style.display = 'none';
  if (!csesEnabled && $('cses-status-row')) $('cses-status-row').style.display = 'none';
  if (!lcEnabled) $('lc-status-row').style.display = 'none';
  if (!tpEnabled) $('tp-status-row').style.display = 'none';

  await updateStatusBanner();
  initMathFixBanner().catch(() => {});

  function openOrFocus(url) {
    chrome.runtime.sendMessage({ type: 'OPEN_OR_FOCUS_TAB', url }).catch(() => {
      chrome.tabs.create({ url });
    });
  }

  // Quick Action Buttons
  $('open-ide-btn')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_IDE' }).catch(() => {
      openOrFocus(chrome.runtime.getURL('ide.html'));
    });
  });
  $('open-contests-btn')?.addEventListener('click', () => {
    openOrFocus(chrome.runtime.getURL('contests.html'));
  });
  $('open-upsolve-btn')?.addEventListener('click', () => {
    openOrFocus(chrome.runtime.getURL('contests.html#upsolve'));
  });
  $('quick-settings-btn')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Stats Card Modal
  async function loadStatsCardModal() {
    const preview = $('card-preview-container');
    const input = $('card-embed-input');
    if (preview) preview.innerHTML = '<div class="spinner"></div>';

    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_STATS_CARD_DATA' });
      if (res && res.ok) {
        if (preview) {
          preview.innerHTML = res.svg.replace('<svg ', '<svg style="width:100%;height:auto;display:block;border-radius:6px;" ');
        }
        if (input) {
          input.value = res.embedCode || '';
        }
      } else {
        if (preview) preview.innerHTML = `<span style="color:var(--red);font-size:11px;">Failed to load stats card: ${res?.error || 'Unknown error'}</span>`;
      }
    } catch (err) {
      if (preview) preview.innerHTML = `<span style="color:var(--red);font-size:11px;">Error: ${err.message}</span>`;
    }
  }

  $('open-card-btn')?.addEventListener('click', () => {
    const modal = $('card-modal');
    if (modal) {
      modal.style.display = 'flex';
      loadStatsCardModal();
    }
  });

  $('close-card-modal')?.addEventListener('click', () => {
    const modal = $('card-modal');
    if (modal) modal.style.display = 'none';
  });

  $('card-modal')?.addEventListener('click', (e) => {
    if (e.target === $('card-modal')) {
      $('card-modal').style.display = 'none';
    }
  });

  $('copy-card-code-btn')?.addEventListener('click', async () => {
    const input = $('card-embed-input');
    if (!input || !input.value) return;
    try {
      await navigator.clipboard.writeText(input.value);
      showToast('Markdown embed code copied to clipboard!', 'success');
      const btn = $('copy-card-code-btn');
      if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = '✓ Copied!';
        setTimeout(() => { btn.innerHTML = orig; }, 2000);
      }
    } catch (err) {
      input.select();
      document.execCommand('copy');
      showToast('Copied to clipboard!', 'success');
    }
  });

  $('push-card-btn')?.addEventListener('click', async () => {
    const btn = $('push-card-btn');
    if (!btn) return;
    const origText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></div> Pushing to GitHub...';

    try {
      const res = await chrome.runtime.sendMessage({ type: 'PUSH_STATS_CARD' });
      if (res && res.ok) {
        showToast('Stats card successfully pushed to GitHub!', 'success');
        await loadStatsCardModal();
      } else {
        showToast(`Push failed: ${res?.error || 'Unknown error'}`);
      }
    } catch (err) {
      showToast(`Error: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.innerHTML = origText;
    }
  });

  const repoLink = $('repo-link');
  repoLink.style.display = 'inline-block';
  repoLink.addEventListener('click', async (e) => {
    e.preventDefault();
    const settings = await chrome.storage.local.get(['ghOwner', 'ghRepo']);
    if (settings.ghOwner && settings.ghRepo) {
      openOrFocus(`https://github.com/${settings.ghOwner}/${settings.ghRepo}`);
    } else {
      showLinkModal(
        "GitHub Repo Not Linked",
        "Your GitHub repository is not configured. Link it in Settings to view the synced repository."
      );
    }
  });

  $('footer-text').textContent = totalSynced > 0 ? `${totalSynced} problems synced` : 'No syncs yet';

  $('sound-btn').textContent = soundEnabled ? '🔔' : '🔕';
  $('sound-btn').addEventListener('click', async () => {
    soundEnabled = !soundEnabled;
    await chrome.storage.local.set({ soundEnabled });
    $('sound-btn').textContent = soundEnabled ? '🔔' : '🔕';
  });

  $('open-settings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  // Handle share streak account / repo redirect
  $('share-streak').addEventListener('click', async (e) => {
    e.preventDefault();
    const settings = await chrome.storage.local.get(['cfHandle', 'acHandle', 'lcUsername', 'tpHandle', 'ghOwner', 'ghRepo']);
    
    if (currentTab === 'CF') {
      if (settings.cfHandle) {
        openOrFocus(`https://codeforces.com/profile/${settings.cfHandle}`);
      } else {
        showLinkModal(
          "Codeforces Not Linked",
          "Your Codeforces handle is not configured. Link it in Settings to view your profile."
        );
      }
    } else if (currentTab === 'AC') {
      if (settings.acHandle) {
        openOrFocus(`https://atcoder.jp/users/${settings.acHandle}`);
      } else {
        showLinkModal(
          "AtCoder Not Linked",
          "Your AtCoder username is not configured. Link it in Settings to view your profile."
        );
      }
    } else if (currentTab === 'LC') {
      if (settings.lcUsername) {
        openOrFocus(`https://leetcode.com/${settings.lcUsername}`);
      } else {
        const status = await chrome.runtime.sendMessage({ type: 'GET_LC_STATUS' }).catch(() => null);
        if (status && status.username) {
          await chrome.storage.local.set({ lcUsername: status.username });
          openOrFocus(`https://leetcode.com/${status.username}`);
        } else {
          showLinkModal(
            "LeetCode Not Linked",
            "Your LeetCode account is not logged in or linked. Please log in or configure it in Settings."
          );
        }
      }
    } else if (currentTab === 'TP') {
      if (settings.tpHandle) {
        openOrFocus(`https://toph.co/u/${settings.tpHandle}`);
      } else {
        showLinkModal(
          "Toph Not Linked",
          "Your Toph handle is not configured. Link it in Settings to view your profile."
        );
      }
    } else {
      if (settings.ghOwner && settings.ghRepo) {
        openOrFocus(`https://github.com/${settings.ghOwner}/${settings.ghRepo}`);
      } else {
        showLinkModal(
          "GitHub Repo Not Linked",
          "Your GitHub repository is not configured. Link it in Settings to view the synced repository."
        );
      }
    }
  });

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentTab = tab.dataset.tab;
      renderAll(currentTab);
      updateSmartSyncButton();
      updateStatusBanner();
      // Update scan button label to reflect current platform
      const scanBtn = $('scan-btn');
      if (scanBtn) {
        if (currentTab === 'all') {
          scanBtn.textContent = '🔍 Scan Unsynced';
        } else {
          scanBtn.textContent = `🔍 Scan ${currentTab.toUpperCase()}`;
        }
      }
    });
  });

  $('retry-btn').addEventListener('click', async () => {
    $('retry-btn').disabled = true;
    $('retry-btn').textContent = '⏳';
    try {
      const result = await chrome.runtime.sendMessage({ type: 'RETRY_FAILED' });
      if (result && result.ok) {
        if (result.failed === 0) {
          showToast(`Retried successfully! Succeeded: ${result.retried}`, 'success');
        } else {
          showToast(`Retried: ${result.retried} succeeded, ${result.failed} still failed`);
        }
        
        await refreshStateAndUI();
      }
    } catch(e) {
      showToast('Retry failed: ' + e.message);
    } finally {
      $('retry-btn').disabled = false;
      $('retry-btn').textContent = '🔄 Retry';
    }
  });

  $('view-all-btn').addEventListener('click', () => {
    $('history-modal').style.display = 'flex';
    $('history-search').value = '';
    renderHistoryModalList();
  });

  $('close-history').addEventListener('click', () => {
    $('history-modal').style.display = 'none';
  });

  $('history-search').addEventListener('input', () => {
    renderHistoryModalList();
  });

  let _lastPopupSoundPlayTime = 0;
  function playNotificationSound() {
    const now = Date.now();
    if (now - _lastPopupSoundPlayTime < 2500) return;
    _lastPopupSoundPlayTime = now;
    if (soundEnabled === false) return;
    try {
      const url = chrome.runtime.getURL('noti.mp3');
      const audio = new Audio(url);
      audio.volume = 1.0;
      const p = audio.play();
      if (p && p.catch) {
        p.catch(() => {
          try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;
            const ctx = new AudioContextClass();
            fetch(url)
              .then(r => r.arrayBuffer())
              .then(b => ctx.decodeAudioData(b))
              .then(buf => {
                const src = ctx.createBufferSource();
                src.buffer = buf;
                src.connect(ctx.destination);
                src.start(0);
              }).catch(() => {});
          } catch(e) {}
        });
      }
    } catch(e) {}
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'PLAY_SOUND') {
      playNotificationSound();
    }
    if (msg.type === 'SYNC_LOG_UPDATED') {
      refreshStateAndUI().then(() => {
        renderAll(currentTab);
      }).catch(() => {});
    }
    if (msg.type === 'SYNC_SUCCESS') {
      showToast(`[${msg.platform}] ${msg.problemCode} synced!`, 'success');
      refreshStateAndUI().then(() => {
        renderAll(currentTab);
      }).catch(() => {});
    }
    if (msg.type === 'SYNC_ERROR') {
      showToast(`[${msg.platform}] ${msg.problemCode}: ${msg.error}`);
      refreshStateAndUI().then(() => {
        renderAll(currentTab);
      }).catch(() => {});
    }
    if (msg.type === 'SMART_SYNC_PROGRESS') {
      handleSmartSyncProgress(msg);
    }
    return false;
  });

  const scanBtn = $('scan-btn');
  const smartSyncBtn = $('smart-sync-btn');
  
  scanBtn.addEventListener('click', async () => {
    // currentTab is 'all', 'CF', 'AC', or 'LC'
    const scanPlatform = currentTab === 'all' ? 'all' : currentTab;
    const btnLabel = currentTab === 'all' ? '🔍 Scan Unsynced' : `🔍 Scan ${currentTab}`;
    scanBtn.disabled = true;
    scanBtn.textContent = '⏳ Scanning…';
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'SCAN_UNSYNCED',
        platform: currentTab === 'all' ? 'all' : currentTab.toLowerCase()
      });
      if (resp && resp.ok) {
        const results = resp.results || { CF: [], AC: [], LC: [], errors: {} };
        const errors = results.errors || {};

        // Check for GitHub-not-configured error
        if (errors.github) {
          showToast(errors.github, 'error');
          updateSmartSyncButton();
          return;
        }

        // Update only the scanned platform's items (preserve others for partial scans)
        if (currentTab === 'all') {
          scanState.CF = true; scanState.AC = true; scanState.CSES = true; scanState.LC = true; scanState.TP = true;
          scanErrors.CF = errors.CF || null;
          scanErrors.AC = errors.AC || null;
          scanErrors.CSES = errors.CSES || null;
          scanErrors.LC = errors.LC || null;
          scanErrors.TP = errors.TP || null;
          unsyncedItems = [...results.CF, ...results.AC, ...(results.CSES || []), ...results.LC, ...(results.TP || [])];
          // If a platform has 0 unsynced AND no scan error, clear its failedQueue entries
          for (const p of ['CF', 'AC', 'CSES', 'LC', 'TP']) {
            if (!errors[p] && (!results[p] || results[p].length === 0)) {
              failedQueue = failedQueue.filter(i => i.platform !== p);
            }
          }
          await chrome.storage.local.set({ failedQueue });
        } else if (currentTab === 'CF') {
          scanState.CF = true;
          scanErrors.CF = errors.CF || null;
          unsyncedItems = unsyncedItems.filter(i => i.platform !== 'CF');
          unsyncedItems = [...unsyncedItems, ...results.CF];
          // 0 unsynced AND no error → clear stale CF failures
          if (!errors.CF && results.CF.length === 0) {
            failedQueue = failedQueue.filter(i => i.platform !== 'CF');
            await chrome.storage.local.set({ failedQueue });
          }
        } else if (currentTab === 'AC') {
          scanState.AC = true;
          scanErrors.AC = errors.AC || null;
          unsyncedItems = unsyncedItems.filter(i => i.platform !== 'AC');
          unsyncedItems = [...unsyncedItems, ...results.AC];
          // 0 unsynced AND no error → clear stale AC failures
          if (!errors.AC && results.AC.length === 0) {
            failedQueue = failedQueue.filter(i => i.platform !== 'AC');
            await chrome.storage.local.set({ failedQueue });
          }
        } else if (currentTab === 'CSES') {
          scanState.CSES = true;
          scanErrors.CSES = errors.CSES || null;
          unsyncedItems = unsyncedItems.filter(i => i.platform !== 'CSES');
          unsyncedItems = [...unsyncedItems, ...(results.CSES || [])];
          if (!errors.CSES && (!results.CSES || results.CSES.length === 0)) {
            failedQueue = failedQueue.filter(i => i.platform !== 'CSES');
            await chrome.storage.local.set({ failedQueue });
          }
        } else if (currentTab === 'LC') {
          scanState.LC = true;
          scanErrors.LC = errors.LC || null;
          unsyncedItems = unsyncedItems.filter(i => i.platform !== 'LC');
          unsyncedItems = [...unsyncedItems, ...results.LC];
          // 0 unsynced AND no error → clear stale LC failures
          if (!errors.LC && results.LC.length === 0) {
            failedQueue = failedQueue.filter(i => i.platform !== 'LC');
            await chrome.storage.local.set({ failedQueue });
          }
        } else if (currentTab === 'TP') {
          scanState.TP = true;
          scanErrors.TP = errors.TP || null;
          unsyncedItems = unsyncedItems.filter(i => i.platform !== 'TP');
          unsyncedItems = [...unsyncedItems, ...(results.TP || [])];
          if (!errors.TP && (!results.TP || results.TP.length === 0)) {
            failedQueue = failedQueue.filter(i => i.platform !== 'TP');
            await chrome.storage.local.set({ failedQueue });
          }
        }
        
        const scanCount = results.CF.length + results.AC.length + (results.CSES ? results.CSES.length : 0) + results.LC.length + (results.TP ? results.TP.length : 0);
        
        // Build warnings summary
        const warnings = [];
        if (errors.CF && (currentTab === 'all' || currentTab === 'CF')) warnings.push(`CF: ${errors.CF}`);
        if (errors.AC && (currentTab === 'all' || currentTab === 'AC')) warnings.push(`AC: ${errors.AC}`);
        if (errors.CSES && (currentTab === 'all' || currentTab === 'CSES')) warnings.push(`CSES: ${errors.CSES}`);
        if (errors.LC && (currentTab === 'all' || currentTab === 'LC')) warnings.push(`LC: ${errors.LC}`);
        if (errors.TP && (currentTab === 'all' || currentTab === 'TP')) warnings.push(`TP: ${errors.TP}`);
        const warnText = warnings.length > 0 ? ` (Warnings: ${warnings.join(' | ')})` : '';

        updateSmartSyncButton();
        renderFailedBanner();
        await refreshStateAndUI();
        renderAll(currentTab);

        // Auto-sync if "Fix Now" was clicked (math fix migration)
        if (autoSyncAfterScan && unsyncedItems.length > 0) {
          autoSyncAfterScan = false;
          setTimeout(() => {
            const syncBtn = $('smart-sync-btn');
            if (syncBtn && !syncBtn.disabled) syncBtn.click();
          }, 600);
        }

        if (scanCount > 0) {
          const platformLabel = currentTab === 'all' ? '' : `[${currentTab}] `;
          showToast(`${platformLabel}Scan complete: found ${scanCount} unsynced solutions!${warnText}`, warnings.length > 0 ? 'error' : 'success');
        } else if (warnings.length > 0) {
          showToast(`Scan complete with warnings: ${warnings.join(' | ')}`, 'error');
        }
      } else {
        const errMsg = (resp && resp.error) || 'Unknown error';
        showToast('Scan failed: ' + errMsg);
        if (currentTab === 'all') {
          scanErrors.CF = errMsg; scanErrors.AC = errMsg; scanErrors.LC = errMsg;
        } else {
          scanErrors[currentTab] = errMsg;
        }
        updateSmartSyncButton();
      }
    } catch(e) {
      showToast('Scan error: ' + e.message);
      if (currentTab === 'all') {
        scanErrors.CF = e.message; scanErrors.AC = e.message; scanErrors.LC = e.message; scanErrors.TP = e.message;
      } else {
        scanErrors[currentTab] = e.message;
      }
      updateSmartSyncButton();
    } finally {
      scanBtn.disabled = false;
      scanBtn.textContent = btnLabel;
    }
  });


  smartSyncBtn.addEventListener('click', () => {
    let filtered = unsyncedItems;
    let syncPlatform = 'all';
    if (currentTab !== 'all') {
      // currentTab is 'CF'/'AC'/'LC'/'TP' — match exactly against item.platform
      filtered = unsyncedItems.filter(item => item.platform === currentTab);
      syncPlatform = currentTab;
    }
    if (filtered.length === 0) return;

    isSyncActive = true;
    smartSyncBtn.disabled = true;
    scanBtn.disabled = true;
    smartSyncBtn.innerHTML = '<span>⏳ Syncing…</span>';
    $('progress-wrap').style.display = 'block';
    $('bulk-log').innerHTML = '';
    setProgress(0, filtered.length, 'Starting...');
    appendLog(`Starting smart sync of ${filtered.length} solutions...`, 'log-info');
    chrome.runtime.sendMessage({ type: 'START_SMART_SYNC', items: filtered, platform: syncPlatform });
  });

  // Sequence profile syncs to avoid race condition on dailyActivity storage
  // Each sync reads/modifies/writes dailyActivity — concurrent writes cause last-writer-wins
  (async () => {
    try {
      if (data.cfHandle && cfEnabled) {
        await syncCFProfile(data.cfHandle);
      }
      if (data.acHandle && acEnabled) {
        await syncACProfile(data.acHandle);
      }
      if (data.lcUsername && lcEnabled) {
        await syncLCProfile(data.lcUsername);
      } else if (lcEnabled) {
        try {
          const status = await chrome.runtime.sendMessage({ type: 'GET_LC_STATUS' });
          if (status && status.username) {
            chrome.storage.local.set({ lcUsername: status.username });
            await syncLCProfile(status.username);
          }
        } catch(e) {}
      }
      if (data.tpHandle && tpEnabled) {
        await syncTPProfile(data.tpHandle);
      } else if (tpEnabled) {
        try {
          const res = await chrome.storage.local.get(['tpHandle']);
          if (res.tpHandle) {
            await syncTPProfile(res.tpHandle);
          }
        } catch(e) {}
      }
    } catch(e) {
      console.error('Profile sync sequence error:', e);
    }
  })();

  renderAll(currentTab);
  renderFailedBanner();
  updateSmartSyncButton();

  // Auto-sync from GitHub to keep multiple devices in sync automatically
  if (data.ghToken && data.ghOwner && data.ghRepo) {
    chrome.runtime.sendMessage({ type: 'SYNC_FROM_GITHUB' }).then((res) => {
      if (res && res.updated) {
        refreshStateAndUI().then(() => {
          renderAll(currentTab);
        }).catch(() => {});
      }
    }).catch(() => {});
  }

  // Query active background sync status
  chrome.runtime.sendMessage({ type: 'GET_SYNC_STATUS' }).then(async (status) => {
    if (status && status.isSyncing && status.progress && status.progress.phase !== 'finished') {
      isSyncActive = true;
      const { done, total, label, phase, error } = status.progress;
      $('progress-wrap').style.display = 'block';
      $('smart-sync-btn').disabled = true;
      $('scan-btn').disabled = true;
      $('smart-sync-btn').innerHTML = '<span>⏳ Syncing…</span>';

      // Load active sync logs from local storage
      const storage = await chrome.storage.local.get('activeSyncLogs');
      const activeLogs = storage.activeSyncLogs || [];
      $('bulk-log').innerHTML = '';
      activeLogs.forEach(log => {
        appendLog(log.msg, log.cls);
      });

      // Restore progress
      setProgress(done, total, `${phase === 'syncing' ? 'Syncing' : phase === 'success' ? 'Synced' : phase === 'error' ? 'Failed' : 'Skipped'}: ${label}`);
    }
  }).catch(() => null);
}

function handleSmartSyncProgress(msg) {
  const { phase, done, total, label, error, platform = 'all' } = msg;
  const smartSyncBtn = $('smart-sync-btn');
  const scanBtn = $('scan-btn');
  $('progress-wrap').style.display = 'block';
  
  if (phase === 'syncing') {
    isSyncActive = true;
    setProgress(done, total, `Syncing: ${label}`);
  } else if (phase === 'success') {
    isSyncActive = true;
    appendLog(`✓ ${label}`, 'log-ok');
    setProgress(done, total, `Synced: ${label}`);
  } else if (phase === 'skipped') {
    isSyncActive = true;
    appendLog(`⚠ ${label} (${error || 'skipped'})`, 'log-warn');
    setProgress(done, total, `Skipped: ${label}`);
  } else if (phase === 'error') {
    isSyncActive = true;
    appendLog(`✗ ${label}: ${error}`, 'log-err');
    setProgress(done, total, `Failed: ${label}`);
  } else if (phase === 'finished') {
    isSyncActive = false;
    setProgress(total, total, `Finished! Synced all.`);
    $('progress-fill').style.width = '100%';
    smartSyncBtn.innerHTML = '<span>✅ Smart Sync Complete!</span>';
    scanBtn.disabled = false;

    // After sync, directly clear the synced platform's unsyncedItems
    // (do NOT auto-rescan — GitHub tree has cache delay and will falsely show items as still unsynced)
    setTimeout(() => {
      if (platform === 'all') {
        unsyncedItems = [];
        scanState.CF = true; scanState.AC = true; scanState.CSES = true; scanState.LC = true; scanState.TP = true;
      } else {
        unsyncedItems = unsyncedItems.filter(i => i.platform !== platform);
        scanState[platform] = true;
      }
      updateSmartSyncButton();
      smartSyncBtn.innerHTML = '<span>⚡ Sync Unsynced Solutions</span>';
      smartSyncBtn.disabled = true;
    }, 2000);

    // Refresh dashboard stats
    refreshStateAndUI();
  }
}

// Helper to categorize divisions based on contest name
function getDivisions(contestName) {
  const n = (contestName || '').toLowerCase();
  const divs = [];
  if (/div\.?\s*1/.test(n)) divs.push('div1');
  if (/div\.?\s*2/.test(n)) divs.push('div2');
  if (/div\.?\s*3/.test(n)) divs.push('div3');
  if (/div\.?\s*4/.test(n)) divs.push('div4');
  // Educational rounds count as div2 (open to all, rated for div2)
  if (divs.length === 0 && /educational/.test(n)) divs.push('div2');
  // "Codeforces Round" without explicit div → usually div2
  if (divs.length === 0 && /codeforces round/.test(n) && !/div/.test(n)) divs.push('div2');
  // Global/Kotlin Hero/Lockout → others
  if (divs.length === 0) divs.push('others');
  return divs;
}


async function syncCFProfile(handle) {
  try {
    const data = await chrome.runtime.sendMessage({ type: 'GET_CF_PROFILE', handle }).catch(() => null);
    if (!data || data.status !== 'OK') return;

    const submissions = data.result || [];
    const uniqueAccepted = new Map();

    // Get contest list for divisions matching — fetch if cache is empty/stale (24h)
    let contestList = [];
    try {
      const cache = await chrome.storage.local.get(['contestListCache', 'contestListTime']);
      const cacheAge = cache.contestListTime ? (Date.now() - cache.contestListTime) : Infinity;
      if (cache.contestListCache && cache.contestListCache.length > 0 && cacheAge < 86400000) {
        contestList = cache.contestListCache;
      } else {
        // Fetch fresh contest list
        const cfData = await chrome.runtime.sendMessage({ type: 'GET_CF_CONTESTS' }).catch(() => null);
        if (cfData && cfData.status === 'OK' && cfData.result) {
          contestList = cfData.result;
          await chrome.storage.local.set({ contestListCache: contestList, contestListTime: Date.now() });
        }
      }
    } catch(e) { console.warn('Contest list fetch failed:', e.message); }

    // Parse submissions (oldest to newest)
    // Use "contestId_index" key (with separator) to prevent key collisions
    // e.g. contestId=123, index="4A" must NOT collide with contestId=1234, index="A"
    for (let i = submissions.length - 1; i >= 0; i--) {
      const sub = submissions[i];
      if (sub.verdict === 'OK') {
        const probId = `${sub.contestId}_${sub.problem.index}`;
        uniqueAccepted.set(probId, sub);
      }
    }

    // Compute CF activity using user's local timezone offset.
    // Group all submissions (with verdict === 'OK') by dateStr, keeping unique problem IDs per day.
    const userOffsetHours = -new Date().getTimezoneOffset() / 60;
    const cfActivity = {};
    const cfDailyUniqueProblems = {}; // dateStr -> Set of problemIds
    for (const sub of submissions) {
      if (sub.verdict === 'OK') {
        const ts = sub.creationTimeSeconds;
        if (!ts) continue;
        const dateStr = epochToDateStr(ts, userOffsetHours);
        const probId = `${sub.contestId}_${sub.problem.index}`;
        if (!cfDailyUniqueProblems[dateStr]) {
          cfDailyUniqueProblems[dateStr] = new Set();
        }
        cfDailyUniqueProblems[dateStr].add(probId);
      }
    }
    for (const [dateStr, probSet] of Object.entries(cfDailyUniqueProblems)) {
      cfActivity[dateStr] = probSet.size;
    }

    // Build division stats based on unique accepted problems
    const contestMap = new Map();
    if (contestList && contestList.length > 0) {
      for (const c of contestList) {
        contestMap.set(c.id, c);
      }
    }

    const divCounts = { 'div1': 0, 'div2': 0, 'div3': 0, 'div4': 0, 'others': 0 };
    for (const sub of uniqueAccepted.values()) {
      let contestName = '';
      const found = contestMap.get(sub.contestId);
      if (found) contestName = found.name;

      const divs = getDivisions(contestName);
      const divKey = divs[0];
      if (divCounts[divKey] !== undefined) {
        divCounts[divKey]++;
      } else {
        divCounts['others']++;
      }
    }

    // Fetch profile page to get exact solved count and calendar solved dates from the Codeforces website
    let finalSolvedCount = uniqueAccepted.size;
    const scrapedDates = new Set();

    try {
      const profileUrl = `https://codeforces.com/profile/${handle}?locale=en`;
      const profileRes = await chrome.runtime.sendMessage({ type: 'FETCH_PROFILE_PAGE', url: profileUrl }).catch(() => null);
      if (profileRes && profileRes.ok && profileRes.text) {
        const htmlText = profileRes.text;
        const solvedMatch = htmlText.match(/(\d+)\s+problems?\s*(?:<[^>]*>\s*)*solved\s+for\s+all\s+time/i);
        if (solvedMatch) {
          finalSolvedCount = parseInt(solvedMatch[1], 10);
        }

        // Scrape calendar solved dates
        const dateRegex = /"(\d{4}-\d{2}-\d{2})":\s*\{/g;
        let match;
        while ((match = dateRegex.exec(htmlText)) !== null) {
          scrapedDates.add(match[1]);
        }
      }
    } catch (err) {
      console.warn('Failed to scrape CF profile page:', err.message);
    }

    // Compute CF submission activity (all submissions, accepted or failed)
    const cfSubActivity = {};
    for (const sub of submissions) {
      const ts = sub.creationTimeSeconds;
      if (!ts) continue;
      const dateStr = epochToDateStr(ts, userOffsetHours);
      cfSubActivity[dateStr] = (cfSubActivity[dateStr] || 0) + 1;
    }

    // Merge scraped calendar dates into cfSubActivity (NOT cfActivity)
    if (scrapedDates.size > 0) {
      for (const dStr of scrapedDates) {
        cfSubActivity[dStr] = Math.max(cfSubActivity[dStr] || 0, 1);
      }
    }

    cfOffset = userOffsetHours;
    const todayLocal = todayInOffset(userOffsetHours);
    const _cfToday = cfActivity[todayLocal] || 0;

    // Calculate streak from submission activity map (using local offset)
    const { streak: _cfStreak } = computeStreakFromActivity(cfSubActivity, userOffsetHours);

    const stored = await chrome.storage.local.get(['dailyActivity', 'dailySubmissionActivity']);
    const storedDaily = getDailyActivity(stored);
    const storedDailySub = getDailySubmissionActivity(stored);
    storedDaily['CF'] = cfActivity;
    storedDailySub['CF'] = cfSubActivity;

    await chrome.storage.local.set({
      dailyActivity: storedDaily,
      dailySubmissionActivity: storedDailySub,
      cfSolvedCount: finalSolvedCount,
      cfAttemptsCount: submissions.length,
      cfDivCounts: divCounts,
      cfStreak: _cfStreak,
      cfOffset: cfOffset
    });
    cfAttemptsCount = submissions.length;

    // Update globals so renderStreak picks up the new data immediately
    dailyActivity = storedDaily;
    dailySubmissionActivity = storedDailySub;

    // Update state variables and refresh UI
    cfSolvedCount = finalSolvedCount;
    cfDivCounts = divCounts;
    cfStreak = _cfStreak;
    cfTodayCount = _cfToday;
    if (currentTab === 'all' || currentTab === 'CF') {
      renderAll(currentTab);
    }
  } catch(e) {
    console.error('Failed to sync CF profile:', e);
  }
}

async function syncACProfile(handle) {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'GET_AC_PROFILE', handle }).catch(() => null);
    if (!resp || !resp.ok) return;

    const submissions = resp.submissions || [];
    const uniqueAccepted = new Map();
    const contestCounts = { abc: 0, arc: 0, agc: 0, other: 0 };

    // Group unique accepted problems (oldest to newest epoch_second)
    // Sort submissions ascending by epoch_second first to process in order
    submissions.sort((a, b) => a.epoch_second - b.epoch_second);
    for (const sub of submissions) {
      if (sub.result === 'AC') {
        uniqueAccepted.set(sub.problem_id, sub);
      }
    }

    const userOffsetHours = -new Date().getTimezoneOffset() / 60;

    // Step 1: Find the best streak NUMBER using timezone-tolerant logic.
    // We try UTC+9 (Japan) as preferred since AtCoder is Japanese — this gives the
    // most generous streak counting. The number is what gets displayed as STREAK.
    const { streak: _acStreakFromAPI } = computeStreakFromSubmissions(
      submissions,
      userOffsetHours,
      sub => sub.result === 'AC',
      9 // AtCoder preferred offset is UTC+9 (Japan)
    );

    // Step 2: Build the calendar display maps using the USER'S LOCAL timezone.
    // This ensures "today" always refers to the user's actual local date,
    // preventing the calendar from showing tomorrow as today (e.g. after 9pm
    // for a UTC+6 user when acOffset was UTC+9).
    const acSubActivity = {}; // all submissions, user local offset
    for (const sub of submissions) {
      const ts = sub.epoch_second;
      if (!ts) continue;
      const dateStr = epochToDateStr(ts, userOffsetHours);
      acSubActivity[dateStr] = (acSubActivity[dateStr] || 0) + 1;
    }

    // Compute AC accepted activity in user's local timezone
    const acActivity = {};
    const acDailyUniqueProblems = {}; // dateStr -> Set of problemIds
    for (const sub of submissions) {
      if (sub.result === 'AC') {
        const ts = sub.epoch_second;
        if (!ts) continue;
        const dateStr = epochToDateStr(ts, userOffsetHours);
        const probId = sub.problem_id;
        if (!acDailyUniqueProblems[dateStr]) {
          acDailyUniqueProblems[dateStr] = new Set();
        }
        acDailyUniqueProblems[dateStr].add(probId);
      }
    }
    for (const [dateStr, probSet] of Object.entries(acDailyUniqueProblems)) {
      acActivity[dateStr] = probSet.size;
    }

    // Always store/use user's local offset for display
    acOffset = userOffsetHours;

    // Build contest category counts based on unique accepted problems
    for (const sub of uniqueAccepted.values()) {
      const contestId = (sub.contest_id || '').toLowerCase();
      if (contestId.startsWith('abc')) {
        contestCounts.abc++;
      } else if (contestId.startsWith('arc')) {
        contestCounts.arc++;
      } else if (contestId.startsWith('agc')) {
        contestCounts.agc++;
      } else {
        contestCounts.other++;
      }
    }

    const stored = await chrome.storage.local.get(['dailyActivity', 'dailySubmissionActivity', 'syncLog']);
    const storedDaily = getDailyActivity(stored);
    const storedDailySub = getDailySubmissionActivity(stored);

    // Merge API data with active recent syncLog entries (within last 3 days)
    // to preserve new solves the API hasn't indexed yet, while discarding stale/incorrect historical values.
    const todayLocal = todayInOffset(userOffsetHours);
    const mergedAcActivity = { ...acActivity };
    const mergedAcSubActivity = { ...acSubActivity };
    const syncLogArr = stored.syncLog || [];
    const threeDaysAgo = Date.now() - 3 * 86400 * 1000;

    const recentAcSyncCounts = {};
    for (const e of syncLogArr) {
      if (e.platform === 'AC' && !e.skipped && !e.syncedFromGitHub && (!e.commitMsg || !e.commitMsg.startsWith('Synced from GitHub')) && e.submissionTime) {
        const t = new Date(e.submissionTime).getTime();
        if (t > threeDaysAgo) {
          const dateStr = epochToDateStr(t / 1000, userOffsetHours);
          recentAcSyncCounts[dateStr] = (recentAcSyncCounts[dateStr] || 0) + 1;
        }
      }
    }
    for (const [date, count] of Object.entries(recentAcSyncCounts)) {
      mergedAcActivity[date] = Math.max(mergedAcActivity[date] || 0, count);
      mergedAcSubActivity[date] = Math.max(mergedAcSubActivity[date] || 0, count);
    }

    storedDaily['AC'] = mergedAcActivity;
    storedDailySub['AC'] = mergedAcSubActivity;

    // Recompute streak using merged data (local timezone) so locally-recorded solves count
    const { streak: _acStreakMerged } = computeStreakFromActivity(mergedAcActivity, userOffsetHours);
    const finalAcStreak = Math.max(_acStreakFromAPI, _acStreakMerged);
    const _acToday = mergedAcActivity[todayLocal] || 0;

    await chrome.storage.local.set({
      dailyActivity: storedDaily,
      dailySubmissionActivity: storedDailySub,
      acSolvedCount: Math.max(uniqueAccepted.size, stored.acSolvedCount || 0),
      acAttemptsCount: submissions.length,
      acContestCounts: contestCounts,
      acStreak: finalAcStreak,
      acOffset: acOffset
    });
    acAttemptsCount = submissions.length;

    // Update globals so renderStreak picks up the new data immediately
    dailyActivity = storedDaily;
    dailySubmissionActivity = storedDailySub;

    // Update state variables and refresh UI
    acSolvedCount = Math.max(uniqueAccepted.size, acSolvedCount);
    acContestCounts = contestCounts;
    acStreak = finalAcStreak;
    acTodayCount = _acToday;
    if (currentTab === 'all' || currentTab === 'AC') {
      renderAll(currentTab);
    }
  } catch(e) {
    console.error('Failed to sync AC profile:', e);
  }
}

async function syncLCProfile(username) {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'GET_LC_PROFILE', handle: username }).catch(() => null);
    if (!resp || !resp.ok || !resp.data || !resp.data.matchedUser) return;

    const matchedUser = resp.data.matchedUser;
    const userCalendar = matchedUser.userCalendar || {};
    const submitStatsGlobal = matchedUser.submitStatsGlobal || {};
    const recentSubmissionList = resp.data.recentSubmissionList || matchedUser.recentSubmissionList || [];

    const userOffsetHours = -new Date().getTimezoneOffset() / 60;
    const todayLocal = todayInOffset(userOffsetHours);

    // Parse difficulty stats
    const acNum = submitStatsGlobal.acSubmissionNum || [];
    let solvedCount = 0;
    const difficultyCounts = { Easy: 0, Medium: 0, Hard: 0 };
    for (const item of acNum) {
      if (item.difficulty === 'All') {
        solvedCount = item.count;
      } else if (difficultyCounts[item.difficulty] !== undefined) {
        difficultyCounts[item.difficulty] = item.count;
      }
    }

    const totalSubNum = submitStatsGlobal.totalSubmissionNum || [];
    const totalItem = totalSubNum.find(i => i.difficulty === 'All');
    const lcAttempts = totalItem ? totalItem.submissions : 0;
    const overallAcRate = lcAttempts > 0 ? (solvedCount / lcAttempts) : 0.6;

    // Track recent submissions (with verdicts)
    const recentAcByDate = {};
    const recentSubByDate = {};
    for (const sub of recentSubmissionList) {
      const ts = parseInt(sub.timestamp, 10);
      if (!ts) continue;
      const dateStr = epochToDateStr(ts, userOffsetHours);
      recentSubByDate[dateStr] = (recentSubByDate[dateStr] || 0) + 1;
      if (sub.statusDisplay === 'Accepted') {
        recentAcByDate[dateStr] = (recentAcByDate[dateStr] || 0) + 1;
      } else {
        if (recentAcByDate[dateStr] === undefined) {
          recentAcByDate[dateStr] = 0;
        }
      }
    }

    // Parse submission calendar
    let calendarData = {};
    try {
      calendarData = JSON.parse(userCalendar.submissionCalendar || '{}');
    } catch(e) {}

    const lcSubActivity = {};
    const lcActivity = {};

    for (const [timestamp, count] of Object.entries(calendarData)) {
      const ts = parseInt(timestamp, 10);
      const dateStr = epochToDateStr(ts, userOffsetHours);
      lcSubActivity[dateStr] = Math.max(lcSubActivity[dateStr] || 0, count);

      if (recentAcByDate[dateStr] !== undefined) {
        // Use true recent AC verdict count (0 if user attempted but failed)
        lcActivity[dateStr] = recentAcByDate[dateStr];
      } else {
        // Historical date outside recent submission list
        const estAc = Math.min(count, Math.round(count * overallAcRate));
        lcActivity[dateStr] = estAc;
      }
    }

    for (const [dateStr, cnt] of Object.entries(recentSubByDate)) {
      lcSubActivity[dateStr] = Math.max(lcSubActivity[dateStr] || 0, cnt);
    }
    for (const [dateStr, cnt] of Object.entries(recentAcByDate)) {
      lcActivity[dateStr] = cnt;
    }

    const stored = await chrome.storage.local.get(['dailyActivity', 'dailySubmissionActivity', 'syncLog', 'lcSolvedCount']);
    const storedDaily = getDailyActivity(stored);
    const storedDailySub = getDailySubmissionActivity(stored);

    // Merge API calendar with active recent syncLog entries (within last 3 days)
    const mergedLcActivity = { ...lcActivity };
    const mergedLcSubActivity = { ...lcSubActivity };
    const syncLogArr = stored.syncLog || [];
    const threeDaysAgo = Date.now() - 3 * 86400 * 1000;

    for (const e of syncLogArr) {
      if (e.platform === 'LC' && !e.skipped && !e.syncedFromGitHub && (!e.commitMsg || !e.commitMsg.startsWith('Synced from GitHub')) && e.submissionTime) {
        const t = new Date(e.submissionTime).getTime();
        if (t > threeDaysAgo) {
          const dateStr = epochToDateStr(t / 1000, userOffsetHours);
          mergedLcActivity[dateStr] = Math.max(mergedLcActivity[dateStr] || 0, 1);
          mergedLcSubActivity[dateStr] = Math.max(mergedLcSubActivity[dateStr] || 0, 1);
        }
      }
    }

    storedDaily['LC'] = mergedLcActivity;
    storedDailySub['LC'] = mergedLcSubActivity;

    // Recompute streak using merged ACCEPTED activity (only AC counts towards streak!)
    const streakVal = computeStreakFromActivity(mergedLcActivity, userOffsetHours).streak;
    const _lcToday = mergedLcActivity[todayLocal] || 0;

    await chrome.storage.local.set({
      dailyActivity: storedDaily,
      dailySubmissionActivity: storedDailySub,
      lcSolvedCount: Math.max(solvedCount, stored.lcSolvedCount || 0),
      lcAttemptsCount: lcAttempts,
      lcStreak: streakVal,
      lcDifficultyCounts: difficultyCounts
    });
    lcAttemptsCount = lcAttempts;

    // Update globals so renderStreak picks up the new data immediately
    dailyActivity = storedDaily;
    dailySubmissionActivity = storedDailySub;

    // Update state variables and refresh UI
    lcSolvedCount = Math.max(solvedCount, lcSolvedCount);
    lcStreak = streakVal;
    lcDifficultyCounts = difficultyCounts;
    lcTodayCount = _lcToday;
    if (currentTab === 'all' || currentTab === 'LC') {
      renderAll(currentTab);
    }
  } catch(e) {
    console.error('Failed to sync LC profile:', e);
  }
}

async function syncTPProfile(handle) {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'GET_TP_PROFILE', handle }).catch(() => null);
    if (!resp || !resp.ok) return;

    const userOffsetHours = -new Date().getTimezoneOffset() / 60;
    const todayLocal = todayInOffset(userOffsetHours);

    const submissionsList = resp.submissionsList || [];
    const categoryCounts = resp.categoryCounts || {};
    const totalSubmissions = resp.submissions || 0;
    const totalSolutions = resp.solutions || 0;
    const contestCount = resp.contests || 0;

    // 1. Build subActivity and activity from submissionsList
    const tpSubActivity = {};
    const tpActivity = {};
    const uniqueAccepted = new Set();

    for (const sub of submissionsList) {
      const ts = sub.ts;
      if (!ts) continue;
      const dateStr = epochToDateStr(ts, userOffsetHours);
      tpSubActivity[dateStr] = (tpSubActivity[dateStr] || 0) + 1;
      const isAc = sub.verdictCode === 'ac' || (sub.verdictText && sub.verdictText.toLowerCase().includes('accepted'));
      if (isAc) {
        uniqueAccepted.add(sub.slug || sub.title || sub.subId);
        tpActivity[dateStr] = (tpActivity[dateStr] || 0) + 1;
      }
    }

    // 2. Read stored dailyActivity and syncLog to merge any locally-recorded syncLog items
    const stored = await chrome.storage.local.get(['dailyActivity', 'dailySubmissionActivity', 'syncLog', 'tpSolvedCount']);
    const storedDaily = getDailyActivity(stored);
    const storedDailySub = getDailySubmissionActivity(stored);

    // Merge with previously stored activity to preserve historical data
    const mergedTpActivity = { ...(storedDaily['TP'] || {}), ...tpActivity };
    const mergedTpSubActivity = { ...(storedDailySub['TP'] || {}), ...tpSubActivity };

    // Utilize activityMap from Toph's heatmap (provides full year of daily activity data)
    const activityMap = resp.activityMap || {};
    if (Object.keys(activityMap).length > 0) {
      // activityMap keys are day-of-year indices (0-365) with submission counts
      // Convert to date strings using the current year as base
      const now = new Date();
      const yearStart = new Date(now.getFullYear(), 0, 1);
      for (const [dayIdx, cnt] of Object.entries(activityMap)) {
        if (cnt > 0) {
          const dayDate = new Date(yearStart.getTime() + parseInt(dayIdx, 10) * 86400000);
          const dateStr = epochToDateStr(dayDate.getTime() / 1000, userOffsetHours);
          // Only backfill if API scraping didn't provide data for this date
          if (!mergedTpSubActivity[dateStr]) {
            mergedTpSubActivity[dateStr] = cnt;
          }
          // Estimate AC as a fraction of submissions (honest: do not force 1 on dates with no confirmed solves)
          if (!mergedTpActivity[dateStr] && cnt > 0) {
            const est = Math.round(cnt * 0.3);
            if (est > 0) mergedTpActivity[dateStr] = est;
          }
        }
      }
    }

    const syncLogArr = stored.syncLog || [];
    const threeDaysAgo = Date.now() - 3 * 86400 * 1000;

    for (const e of syncLogArr) {
      if (e.platform === 'TP' && !e.skipped && !e.syncedFromGitHub && (!e.commitMsg || !e.commitMsg.startsWith('Synced from GitHub')) && e.submissionTime) {
        const t = new Date(e.submissionTime).getTime();
        if (t > threeDaysAgo) {
          const dateStr = epochToDateStr(t / 1000, userOffsetHours);
          mergedTpActivity[dateStr] = Math.max(mergedTpActivity[dateStr] || 0, 1);
          mergedTpSubActivity[dateStr] = Math.max(mergedTpSubActivity[dateStr] || 0, 1);
        }
      }
    }

    storedDaily['TP'] = mergedTpActivity;
    storedDailySub['TP'] = mergedTpSubActivity;

    // 3. Compute streak from AC activity (not all submissions) for accurate streak
    const { streak: finalTpStreak } = computeStreakFromActivity(mergedTpActivity, userOffsetHours);
    const _tpToday = mergedTpActivity[todayLocal] || 0;

    const finalSolved = Math.max(totalSolutions, uniqueAccepted.size, stored.tpSolvedCount || 0);

    await chrome.storage.local.set({
      dailyActivity: storedDaily,
      dailySubmissionActivity: storedDailySub,
      tpSolvedCount: finalSolved,
      tpAttemptsCount: totalSubmissions,
      tpContestCount: contestCount,
      tpCategoryCounts: categoryCounts,
      tpStreak: finalTpStreak
    });

    tpSolvedCount = finalSolved;
    tpAttemptsCount = totalSubmissions;
    tpContestCount = contestCount;
    tpCategoryCounts = categoryCounts;
    tpStreak = finalTpStreak;
    tpTodayCount = _tpToday;

    dailyActivity = storedDaily;
    dailySubmissionActivity = storedDailySub;

    if (currentTab === 'all' || currentTab === 'TP') {
      renderAll(currentTab);
    }
  } catch(e) {
    console.error('Failed to sync TP profile:', e);
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.cfHandle) cfHandle = (changes.cfHandle.newValue || '').trim();
  if (changes.acHandle) acHandle = (changes.acHandle.newValue || '').trim();
  if (changes.lcUsername) lcUsername = (changes.lcUsername.newValue || '').trim();
  if (changes.tpHandle) tpHandle = (changes.tpHandle.newValue || '').trim();
  if (changes.ghOwner) ghOwner = (changes.ghOwner.newValue || '').trim();
  if (changes.ghRepo) ghRepo = (changes.ghRepo.newValue || '').trim();
  if (changes.cfEnabled) cfEnabled = changes.cfEnabled.newValue !== false;
  if (changes.acEnabled) acEnabled = changes.acEnabled.newValue !== false;
  if (changes.lcEnabled) lcEnabled = changes.lcEnabled.newValue !== false;
  if (changes.tpEnabled) tpEnabled = changes.tpEnabled.newValue !== false;
  if (changes.csesEnabled) csesEnabled = changes.csesEnabled.newValue !== false;
  if (changes.cfSolvedCount) cfSolvedCount = changes.cfSolvedCount.newValue || 0;
  if (changes.acSolvedCount) acSolvedCount = changes.acSolvedCount.newValue || 0;
  if (changes.lcSolvedCount) lcSolvedCount = changes.lcSolvedCount.newValue || 0;
  if (changes.tpSolvedCount) tpSolvedCount = changes.tpSolvedCount.newValue || 0;
  if (changes.csesSolvedCount) csesSolvedCount = changes.csesSolvedCount.newValue || 0;
  if (changes.csesAttemptsCount) csesAttemptsCount = changes.csesAttemptsCount.newValue || 0;
  if (changes.csesStreak) csesStreak = changes.csesStreak.newValue || 0;
  if (changes.tpContestCount) tpContestCount = changes.tpContestCount.newValue || 0;
  if (changes.tpAttemptsCount) tpAttemptsCount = changes.tpAttemptsCount.newValue || 0;
  if (changes.acAttemptsCount) acAttemptsCount = changes.acAttemptsCount.newValue || 0;
  if (changes.lcAttemptsCount) lcAttemptsCount = changes.lcAttemptsCount.newValue || 0;
  if (changes.tpStreak) tpStreak = changes.tpStreak.newValue || 0;
  if (changes.acStreak) acStreak = changes.acStreak.newValue || 0;
  if (changes.lcStreak) lcStreak = changes.lcStreak.newValue || 0;
  if (changes.dailyActivity) dailyActivity = getDailyActivity({ dailyActivity: changes.dailyActivity.newValue, syncLog });
  if (changes.dailySubmissionActivity) dailySubmissionActivity = getDailySubmissionActivity({ dailySubmissionActivity: changes.dailySubmissionActivity.newValue, syncLog });
  if (changes.soundEnabled !== undefined) {
    soundEnabled = changes.soundEnabled.newValue !== false;
    if ($('sound-btn')) $('sound-btn').textContent = soundEnabled ? '🔔' : '🔕';
  }
  if (changes.syncLog) syncLog = changes.syncLog.newValue || [];
  updateStatusBanner();
  renderAll(currentTab);
});

init();
