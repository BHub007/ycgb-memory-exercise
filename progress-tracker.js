/**
 * ProgressTracker — drop-in localStorage progress tracking for memory games
 *
 * USAGE (add to any game's HTML):
 * ─────────────────────────────────────────────────────────────────────────
 * 1. Include this script:
 *    <script src="progress-tracker.js"></script>
 *    OR paste the contents inside a <script> tag at the end of <body>.
 *
 * 2. Include the companion CSS (progress-tracker.css), or paste it in <style>.
 *
 * 3. Add the tracker button somewhere in your HTML (usually top-right):
 *    <button onclick="ProgressTracker.open()" class="pt-trigger">📊 Stats</button>
 *
 * 4. Call this once when a round finishes in your game logic:
 *    ProgressTracker.record({
 *        game:  'Face Name Recall',   // identifier for this game
 *        score: 4,                    // numeric score achieved
 *        max:   5,                    // maximum possible score
 *        mode:  'easy'                // optional: mode/difficulty label
 *    });
 *
 * That's it. The tracker handles all storage, rendering, and UI.
 * ─────────────────────────────────────────────────────────────────────────
 */

const ProgressTracker = (() => {
    const STORAGE_KEY = 'memory_game_progress_v1';
    const MAX_SESSIONS_STORED = 200;

    // ── Storage helpers ────────────────────────────────────────────────────

    function load() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch { return []; }
    }

    function save(sessions) {
        try {
            // Keep only the most recent MAX_SESSIONS_STORED entries
            const trimmed = sessions.slice(-MAX_SESSIONS_STORED);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
        } catch (e) {
            console.warn('ProgressTracker: could not save to localStorage', e);
        }
    }

    // ── Public API ─────────────────────────────────────────────────────────

    /**
     * Record a completed game session.
     * @param {object} opts
     * @param {string} opts.game   - Game name/identifier
     * @param {number} opts.score  - Score achieved
     * @param {number} opts.max    - Maximum possible score
     * @param {string} [opts.mode] - Optional mode label (e.g. 'easy', 'hard')
     */
    function record({ game, score, max, mode = '' }) {
        if (!game || score == null || max == null) {
            console.warn('ProgressTracker.record: missing required fields'); return;
        }
        const sessions = load();
        sessions.push({
            game,
            score,
            max,
            mode,
            pct: Math.round((score / max) * 100),
            ts: Date.now()
        });
        save(sessions);
        // Refresh panel if open
        if (document.getElementById('pt-panel')?.classList.contains('pt-open')) {
            renderPanel();
        }
    }

    function clearAll() {
        if (confirm('Clear all progress history? This cannot be undone.')) {
            localStorage.removeItem(STORAGE_KEY);
            renderPanel();
        }
    }

    // ── Stats computation ──────────────────────────────────────────────────

    function computeStats(sessions) {
        if (!sessions.length) return null;

        // Group by game
        const byGame = {};
        sessions.forEach(s => {
            if (!byGame[s.game]) byGame[s.game] = [];
            byGame[s.game].push(s);
        });

        const gameStats = Object.entries(byGame).map(([name, rows]) => {
            const pcts = rows.map(r => r.pct);
            const avg = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
            const best = Math.max(...pcts);
            const last = rows[rows.length - 1];
            // Trend: compare last 3 vs previous 3
            const recent = pcts.slice(-3);
            const prior  = pcts.slice(-6, -3);
            let trend = '—';
            if (prior.length && recent.length) {
                const rAvg = recent.reduce((a,b)=>a+b,0)/recent.length;
                const pAvg = prior.reduce((a,b)=>a+b,0)/prior.length;
                trend = rAvg > pAvg + 5 ? '↑' : rAvg < pAvg - 5 ? '↓' : '→';
            }
            return { name, rows, avg, best, last, trend, count: rows.length };
        });

        // Overall across all games
        const allPcts = sessions.map(s => s.pct);
        const overallAvg = Math.round(allPcts.reduce((a,b)=>a+b,0) / allPcts.length);
        const totalSessions = sessions.length;
        const streak = computeStreak(sessions);

        return { gameStats, overallAvg, totalSessions, streak };
    }

    function computeStreak(sessions) {
        // Count consecutive days with at least one session (from today backwards)
        if (!sessions.length) return 0;
        const days = new Set(sessions.map(s => new Date(s.ts).toDateString()));
        let streak = 0;
        const d = new Date();
        while (days.has(d.toDateString())) {
            streak++;
            d.setDate(d.getDate() - 1);
        }
        return streak;
    }

    // ── Chart helpers ──────────────────────────────────────────────────────

    function sparklinePath(values, w, h) {
        if (values.length < 2) return '';
        const min = 0, max = 100;
        const xStep = w / (values.length - 1);
        const pts = values.map((v, i) => {
            const x = i * xStep;
            const y = h - ((v - min) / (max - min)) * h;
            return `${x},${y}`;
        });
        return 'M' + pts.join('L');
    }

    // ── Render ─────────────────────────────────────────────────────────────

    function formatDate(ts) {
        return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
    function formatTime(ts) {
        return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }

    function renderPanel() {
        const panel = document.getElementById('pt-panel');
        if (!panel) return;
        const sessions = load();
        const stats = computeStats(sessions);

        if (!stats) {
            panel.querySelector('.pt-body').innerHTML = `
                <div class="pt-empty">
                    <div class="pt-empty-icon">🎮</div>
                    <div class="pt-empty-title">No games played yet</div>
                    <div class="pt-empty-sub">Complete a round to start tracking your progress.</div>
                </div>`;
            return;
        }

        const gameCardsHtml = stats.gameStats.map(g => {
            const sparkW = 120, sparkH = 36;
            const recentPcts = g.rows.slice(-20).map(r => r.pct);
            const path = sparklinePath(recentPcts, sparkW, sparkH);
            const trendColor = g.trend === '↑' ? '#10b981' : g.trend === '↓' ? '#f87171' : '#94a3b8';
            const avgColor = g.avg >= 80 ? '#10b981' : g.avg >= 50 ? '#f59e0b' : '#f87171';
            const modeLabel = g.last.mode ? `<span class="pt-mode-badge">${g.last.mode}</span>` : '';

            return `
            <div class="pt-game-card">
                <div class="pt-game-header">
                    <div class="pt-game-name">${g.name} ${modeLabel}</div>
                    <div class="pt-trend" style="color:${trendColor}">${g.trend}</div>
                </div>
                <div class="pt-game-metrics">
                    <div class="pt-metric">
                        <div class="pt-metric-val" style="color:${avgColor}">${g.avg}%</div>
                        <div class="pt-metric-lbl">avg</div>
                    </div>
                    <div class="pt-metric">
                        <div class="pt-metric-val">${g.best}%</div>
                        <div class="pt-metric-lbl">best</div>
                    </div>
                    <div class="pt-metric">
                        <div class="pt-metric-val">${g.count}</div>
                        <div class="pt-metric-lbl">played</div>
                    </div>
                    <div class="pt-metric">
                        <div class="pt-metric-val">${g.last.score}/${g.last.max}</div>
                        <div class="pt-metric-lbl">last</div>
                    </div>
                </div>
                <div class="pt-sparkline-wrap">
                    <svg viewBox="0 0 ${sparkW} ${sparkH}" class="pt-sparkline" preserveAspectRatio="none">
                        <path d="${path}" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
                        <path d="${path}L${sparkW},${sparkH}L0,${sparkH}Z" fill="url(#pt-grad)" opacity="0.25"/>
                        <defs>
                            <linearGradient id="pt-grad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stop-color="#7c3aed"/>
                                <stop offset="100%" stop-color="#7c3aed" stop-opacity="0"/>
                            </linearGradient>
                        </defs>
                    </svg>
                    <div class="pt-sparkline-label">last ${recentPcts.length} sessions</div>
                </div>
            </div>`;
        }).join('');

        // Recent history table (last 10)
        const recent = sessions.slice(-10).reverse();
        const historyHtml = recent.map(s => {
            const pctColor = s.pct >= 80 ? '#10b981' : s.pct >= 50 ? '#f59e0b' : '#f87171';
            const bar = `<div class="pt-bar-track"><div class="pt-bar-fill" style="width:${s.pct}%;background:${pctColor}"></div></div>`;
            return `
            <div class="pt-history-row">
                <div class="pt-history-game">${s.game}${s.mode ? ` <span class="pt-mode-badge">${s.mode}</span>` : ''}</div>
                <div class="pt-history-score" style="color:${pctColor}">${s.score}/${s.max}</div>
                ${bar}
                <div class="pt-history-date">${formatDate(s.ts)}<br><span>${formatTime(s.ts)}</span></div>
            </div>`;
        }).join('');

        panel.querySelector('.pt-body').innerHTML = `
            <!-- Overview pills -->
            <div class="pt-overview">
                <div class="pt-pill">
                    <div class="pt-pill-val">${stats.totalSessions}</div>
                    <div class="pt-pill-lbl">Total Rounds</div>
                </div>
                <div class="pt-pill">
                    <div class="pt-pill-val">${stats.overallAvg}%</div>
                    <div class="pt-pill-lbl">Overall Avg</div>
                </div>
                <div class="pt-pill">
                    <div class="pt-pill-val">${stats.streak}🔥</div>
                    <div class="pt-pill-lbl">Day Streak</div>
                </div>
            </div>

            <!-- Per-game cards -->
            <div class="pt-section-title">By Game</div>
            <div class="pt-game-cards">${gameCardsHtml}</div>

            <!-- Recent history -->
            <div class="pt-section-title">Recent Sessions</div>
            <div class="pt-history">${historyHtml}</div>

            <button class="pt-clear-btn" onclick="ProgressTracker.clearAll()">🗑 Clear all history</button>
        `;
    }

    // ── Panel DOM ──────────────────────────────────────────────────────────

    function injectDOM() {
        if (document.getElementById('pt-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'pt-panel';
        panel.innerHTML = `
            <div class="pt-backdrop" onclick="ProgressTracker.close()"></div>
            <div class="pt-drawer">
                <div class="pt-header">
                    <div class="pt-header-title">
                        <span class="pt-header-icon">📈</span>
                        Progress
                    </div>
                    <button class="pt-close-btn" onclick="ProgressTracker.close()">✕</button>
                </div>
                <div class="pt-body pt-scroll"></div>
            </div>
        `;
        document.body.appendChild(panel);
    }

    function open() {
        injectDOM();
        renderPanel();
        requestAnimationFrame(() => {
            document.getElementById('pt-panel').classList.add('pt-open');
        });
    }

    function close() {
        document.getElementById('pt-panel')?.classList.remove('pt-open');
    }

    // Keyboard close
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') close();
    });

    return { record, open, close, clearAll };
})();
