const rawBaseURL = process.env.POLITY_HOSTED_BASE_URL ?? process.env.POLITY_SMOKE_BASE_URL;

if (!rawBaseURL) {
  console.error("Set POLITY_HOSTED_BASE_URL to the deployed Polity Engine origin.");
  process.exit(1);
}

const baseURL = rawBaseURL.replace(/\/+$/, "");

function setupData() {
  return {
    options: {
      playerCount: 2,
      mode: "multiplayer",
      commonsSetId: "classics",
      enabledExpansions: [],
      enabledVariants: []
    },
    playerNationIds: {
      "0": "test_nation_sun_coast",
      "1": "test_nation_sun_coast"
    }
  };
}

async function get(path) {
  const response = await fetch(`${baseURL}${path}`);
  if (!response.ok) {
    throw new Error(`GET ${path} failed with ${response.status}: ${await response.text()}`);
  }
  return response;
}

async function getJSON(path) {
  return await (await get(path)).json();
}

async function postJSON(path, body) {
  const response = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`POST ${path} failed with ${response.status}: ${await response.text()}`);
  }
  return await response.json();
}

function assertPrivateDebugDisabled(appHtml) {
  const blockedMarkers = [
    "VITE_SHOW_PRIVATE_CARD_DEBUG",
    "rawEffectTextPrivate",
    "officialRulesText",
    "officialText"
  ];
  for (const marker of blockedMarkers) {
    if (appHtml.includes(marker)) {
      throw new Error(`Hosted app shell exposes private debug marker: ${marker}`);
    }
  }
}

async function main() {
  const health = await getJSON("/polity/accounts/health");
  if (health?.ok !== true) throw new Error("Account health endpoint did not return ok=true.");

  const appHtml = await (await get("/")).text();
  if (!appHtml.includes('<div id="root">')) {
    throw new Error("Hosted app shell did not include the React root.");
  }
  assertPrivateDebugDisabled(appHtml);

  const listedBefore = await getJSON("/polity/lobby/rooms");
  if (!Array.isArray(listedBefore?.lobbies)) {
    throw new Error("Lobby room listing did not return a lobbies array.");
  }

  const lobby = await postJSON("/polity/lobby/rooms", {
    roomName: `Hosted Smoke ${Date.now()}`,
    playerCount: 2,
    setupData: setupData(),
    privateDataFingerprint: "placeholder",
    hostName: "Hosted Smoke Host",
    clientID: `hosted-smoke-${Date.now()}`
  });
  if (!lobby?.lobbyID || !lobby?.lobbyCredentials) {
    throw new Error("Hosted lobby creation did not return lobby credentials.");
  }

  const listedAfter = await getJSON("/polity/lobby/rooms");
  const createdLobby = listedAfter.lobbies.find((candidate) => candidate.lobbyID === lobby.lobbyID);
  if (!createdLobby) {
    throw new Error(`Created hosted lobby ${lobby.lobbyID} was not listed.`);
  }

  console.log(JSON.stringify({
    ok: true,
    smoke: "hosted",
    baseURL,
    lobbyID: lobby.lobbyID
  }, null, 2));
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
);
