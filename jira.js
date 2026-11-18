// jira.js — minimal Jira Cloud client (REST API v3, API-token auth).
// Scope: test the connection, list projects, search issues (summary + assignee only).
//
// Credentials live in chrome.storage.local under JIRA_KEY — outside Clair's SQLite
// database, so they never appear in JSON exports or automatic backups. They are
// NOT encrypted: Chrome stores extension storage as plain data in the profile.
// The token is read here only to build the Authorization header; it is never
// returned to callers, rendered, logged, or included in error messages.
const ClairJira = (() => {
  const JIRA_KEY = 'jiraConfig'; // { site, email, token, accountName, accountId, connectedAt }
  const HOST_PATTERN = 'https://*.atlassian.net/*'; // optional_host_permissions in manifest.json

  class JiraError extends Error {
    constructor(message, status = 0) { super(message); this.name = 'JiraError'; this.status = status; }
  }

  // "yourcompany", "yourcompany.atlassian.net", "https://yourcompany.atlassian.net/jira/..." → https://yourcompany.atlassian.net
  const normalizeSite = (input) => {
    let s = String(input || '').trim();
    if (!s) throw new JiraError('Enter your Jira site URL, e.g. https://yourcompany.atlassian.net');
    if (!/^[a-z]+:\/\//i.test(s)) s = s.includes('.') ? 'https://' + s : `https://${s}.atlassian.net`;
    let url;
    try { url = new URL(s); } catch (e) { throw new JiraError('That is not a valid URL. Use the form https://yourcompany.atlassian.net'); }
    if (url.protocol !== 'https:') throw new JiraError('The Jira site URL must start with https://');
    if (!/^[a-z0-9][a-z0-9-]*\.atlassian\.net$/i.test(url.hostname)) {
      throw new JiraError('Only Jira Cloud sites (https://yourcompany.atlassian.net) are supported.');
    }
    return `https://${url.hostname.toLowerCase()}`;
  };

  const readConfig = async () => (await chrome.storage.local.get(JIRA_KEY))[JIRA_KEY] || null;

  // Safe to put in app state / the DOM: never includes the token.
  const getPublicConfig = async () => {
    const c = await readConfig();
    if (!c) return null;
    return { site: c.site, email: c.email, hasToken: !!c.token, accountName: c.accountName || '', connectedAt: c.connectedAt || '' };
  };

  // UTF-8-safe base64 (btoa alone throws on non-Latin-1 characters).
  const b64 = (str) => {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin);
  };

  const hasPermission = () => chrome.permissions.contains({ origins: [HOST_PATTERN] });
  // Must run from a user gesture (a button click) the first time.
  const ensurePermission = async () => {
    if (await hasPermission()) return;
    let granted = false;
    try { granted = await chrome.permissions.request({ origins: [HOST_PATTERN] }); } catch (e) { granted = false; }
    if (!granted) throw new JiraError('Clair needs permission to contact *.atlassian.net. Click Save again and choose "Allow".');
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // GET {site}{path}. Maps every failure to a readable JiraError without credentials.
  const request = async (cfg, path, params = {}) => {
    const url = new URL(cfg.site + path);
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v); });
    const host = new URL(cfg.site).hostname;
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetch(url.toString(), {
          method: 'GET',
          credentials: 'omit', // never fall back to the browser's Jira login cookies
          cache: 'no-store',
          headers: { Authorization: `Basic ${b64(`${cfg.email}:${cfg.token}`)}`, Accept: 'application/json' }
        });
      } catch (e) {
        if (!(await hasPermission())) throw new JiraError('Clair no longer has permission to contact Jira. Open Settings → Integrations and click Save to allow it again.');
        throw new JiraError(`Could not reach ${host}. Check the site URL and your internet connection.`);
      }
      if (res.ok) {
        try { return await res.json(); } catch (e) { throw new JiraError(`${host} returned an unexpected response. Is this a Jira Cloud site?`, res.status); }
      }
      if (res.status === 429 && attempt < 2) {
        const wait = Math.min(10, parseInt(res.headers.get('Retry-After'), 10) || 2 * (attempt + 1));
        await sleep(wait * 1000);
        continue;
      }
      let detail = '';
      try {
        const body = await res.json();
        detail = [...(body.errorMessages || []), ...Object.values(body.errors || {})].filter(Boolean).join(' ');
      } catch (e) { /* non-JSON error body */ }
      switch (res.status) {
        case 401: throw new JiraError('Jira rejected the email or API token. Check that the email is your Atlassian account email and that the token is valid (not revoked or expired).', 401);
        case 403:
          if ((res.headers.get('X-Seraph-LoginReason') || '').includes('AUTHENTICATION_DENIED')) {
            throw new JiraError('Jira temporarily blocked API logins for this account (too many failed attempts). Sign in to Jira in your browser once, then try again.', 403);
          }
          throw new JiraError(`Your Jira account doesn't have permission for this.${detail ? ' ' + detail : ''}`, 403);
        case 404: throw new JiraError(`Not found on ${host}.${detail ? ' ' + detail : ' Check the site URL.'}`, 404);
        case 400: throw new JiraError(detail || 'Jira could not process the request.', 400);
        case 429: throw new JiraError('Jira is rate-limiting requests. Wait a minute and try again.', 429);
        default: throw new JiraError(`Jira returned an error (HTTP ${res.status}).${detail ? ' ' + detail : ''}`, res.status);
      }
    }
  };

  const requireConfig = async () => {
    const c = await readConfig();
    if (!c || !c.token) throw new JiraError('Jira is not connected. Set it up in Settings → Integrations.');
    return c;
  };

  // Verify credentials against a site; returns account + project count. Does not store anything.
  const probe = async (cfg) => {
    const me = await request(cfg, '/rest/api/3/myself');
    const projects = await request(cfg, '/rest/api/3/project/search', { maxResults: 1 });
    return {
      accountName: me.displayName || cfg.email,
      accountId: me.accountId || '',
      accountEmail: me.emailAddress || cfg.email, // emailAddress may be hidden by profile privacy
      workspace: new URL(cfg.site).hostname,
      projectCount: typeof projects.total === 'number' ? projects.total : (projects.values || []).length
    };
  };

  // Save + verify. A blank token keeps the stored one (only when site and email are unchanged).
  const saveConfig = async ({ site, email, token }) => {
    const cleanSite = normalizeSite(site);
    const cleanEmail = String(email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new JiraError('Enter the email address of your Atlassian account.');
    await ensurePermission(); // first await, so the click's user gesture is still valid for the prompt
    const existing = await readConfig();
    let cleanToken = String(token || '').trim();
    if (!cleanToken) {
      if (existing && existing.token && existing.site === cleanSite && existing.email === cleanEmail) cleanToken = existing.token;
      else throw new JiraError('Paste your Jira API token.');
    }
    const cfg = { site: cleanSite, email: cleanEmail, token: cleanToken };
    const result = await probe(cfg); // only store credentials that actually work
    await chrome.storage.local.set({ [JIRA_KEY]: { ...cfg, accountName: result.accountName, accountId: result.accountId, connectedAt: new Date().toISOString() } });
    return result;
  };

  const testConnection = async () => probe(await requireConfig());

  // Removes stored credentials and the host permission. Project↔Jira links are kept
  // (they hold no credentials) so reconnecting restores them.
  const disconnect = async () => {
    await chrome.storage.local.remove(JIRA_KEY);
    try { await chrome.permissions.remove({ origins: [HOST_PATTERN] }); } catch (e) { /* already removed */ }
  };

  // Projects visible to the account, paginated by startAt.
  const listProjects = async ({ query = '', startAt = 0 } = {}) => {
    const cfg = await requireConfig();
    const data = await request(cfg, '/rest/api/3/project/search', { query: query.trim(), startAt, maxResults: 50, orderBy: 'name' });
    return {
      site: cfg.site,
      projects: (data.values || []).map(p => ({ id: String(p.id), key: p.key, name: p.name })),
      nextStartAt: data.isLast === false ? (data.startAt || 0) + (data.values || []).length : null,
      total: data.total
    };
  };

  const ISSUE_KEY_RE = /^[A-Z][A-Z0-9_]*-\d+$/i;
  const jqlString = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

  // Issues in one project, newest first, only summary + assignee. Paginated by nextPageToken.
  const searchIssues = async ({ projectKey, text = '', nextPageToken = '' }) => {
    const cfg = await requireConfig();
    const q = text.trim();
    let filter = '';
    if (ISSUE_KEY_RE.test(q)) filter = ` AND key = ${jqlString(q.toUpperCase())}`;
    else if (/^\d+$/.test(q)) filter = ` AND key = ${jqlString(`${projectKey}-${q}`)}`;
    else if (q) {
      // Text search: drop JQL reserved characters rather than risk a syntax error.
      const words = q.replace(/[+\-&|!(){}[\]^~*?:\\/"]/g, ' ').trim();
      if (words) filter = ` AND summary ~ ${jqlString(words + '*')}`;
    }
    const jql = `project = ${jqlString(projectKey)}${filter} ORDER BY created DESC`;
    let data;
    try {
      data = await request(cfg, '/rest/api/3/search/jql', { jql, fields: 'summary,assignee', maxResults: 50, nextPageToken });
    } catch (e) {
      // A well-formed key that doesn't exist (or isn't visible) is "no results", not an error.
      if (e.status === 400 && filter.startsWith(' AND key')) return { site: cfg.site, issues: [], nextPageToken: null };
      if (e.status === 400 && /project/i.test(e.message)) throw new JiraError(`The Jira project "${projectKey}" no longer exists or you can't access it. Re-link the Clair project to a Jira project.`, 400);
      throw e;
    }
    return {
      site: cfg.site,
      issues: (data.issues || []).map(i => ({
        id: String(i.id),
        key: i.key,
        summary: (i.fields && i.fields.summary) || '(no summary)',
        assignee: (i.fields && i.fields.assignee && i.fields.assignee.displayName) || '',
        url: `${cfg.site}/browse/${i.key}`
      })),
      nextPageToken: data.isLast === false && data.nextPageToken ? data.nextPageToken : null
    };
  };

  return { JIRA_KEY, normalizeSite, getPublicConfig, saveConfig, testConnection, disconnect, listProjects, searchIssues };
})();
