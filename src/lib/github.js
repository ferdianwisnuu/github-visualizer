const BASE_URL = 'https://api.github.com';

function buildHeaders() {
  const token = import.meta.env.GITHUB_TOKEN;
  return {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
}

async function fetchGitHub(path) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: buildHeaders() });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status} on ${path}`);
  return res.json();
}

async function fetchGraphQL(query, variables = {}) {
  const token = import.meta.env.GITHUB_TOKEN;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  });
  if (!res.ok) throw new Error(`GitHub GraphQL error: ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}

export async function getUserProfile(username) {
  return fetchGitHub(`/users/${username}`);
}

export async function getTopLanguages(username) {
  const repos = await fetchGitHub(`/user/repos?per_page=100&sort=pushed&affiliation=owner`);

  const langMap = {};
  const langFetches = repos
    .filter(r => !r.fork)
    .map(r => fetchGitHub(`/repos/${username}/${r.name}/languages`).then(langs => {
      for (const [lang, bytes] of Object.entries(langs)) {
        langMap[lang] = (langMap[lang] || 0) + bytes;
      }
    }).catch(() => {}));

  await Promise.all(langFetches);

  const total = Object.values(langMap).reduce((a, b) => a + b, 0);
  return Object.entries(langMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, bytes]) => ({
      name,
      bytes,
      percent: ((bytes / total) * 100).toFixed(1)
    }));
}

export async function getContributionData(username) {
  const query = `
    query($username: String!) {
      user(login: $username) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
                weekday
              }
            }
          }
        }
      }
    }
  `;

  const data = await fetchGraphQL(query, { username });
  const calendar = data.user.contributionsCollection.contributionCalendar;

  return {
    total: calendar.totalContributions,
    weeks: calendar.weeks
  };
}