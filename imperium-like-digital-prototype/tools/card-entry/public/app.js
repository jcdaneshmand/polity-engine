const enumOptions = {
  suit: ["", "region", "uncivilized", "civilized", "tributary", "fame", "unrest", "power", "trade_route", "none", "multi"],
  cardType: ["", "action", "in_play", "attack", "power", "state", "development", "accession", "nation", "region", "unrest", "fame", "trade_route", "bot_state", "other"],
  startingLocation: ["draw_deck", "nation_deck", "accession", "development_area", "in_play", "supply", "market", "fame_deck", "unrest_pile", "bot_deck", "box", "other"],
  vpMode: ["none", "fixed", "variable", "negative", "conditional"]
};

const form = document.querySelector("#card-form");
const statusEl = document.querySelector("#status");
const profileSelect = document.querySelector("#profile");
const nationIdInput = document.querySelector("#nation-id");
const csvPathEl = document.querySelector("#csv-path");
let session;
let draft;
let previousDraft;

function setStatus(message, kind = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${kind}`;
}

function fillSelect(name, values) {
  const select = form.elements[name];
  select.innerHTML = "";
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value || "";
    select.append(option);
  }
}

function writeForm(nextDraft) {
  draft = { ...nextDraft };
  for (const [key, value] of Object.entries(draft)) {
    if (form.elements[key]) form.elements[key].value = value ?? "";
  }
}

function readForm() {
  const next = { ...draft };
  for (const element of Array.from(form.elements)) {
    if (element.name) next[element.name] = element.value;
  }
  draft = next;
  return next;
}

function selectedProfile() {
  if (profileSelect.value === "nation-custom") {
    const nationId = nationIdInput.value.trim();
    return {
      id: "nation-custom",
      label: "Nation Deck",
      kind: "nation",
      ownership: "nation",
      setOrNation: nationId,
      commonsSetId: "",
      commonsGroup: "",
      requiredExpansions: []
    };
  }
  return session.profiles.find((item) => item.id === profileSelect.value) || session.profiles[0];
}

function blankFromProfile() {
  const profile = selectedProfile();
  const defaults = profile.defaults || {};
  return {
    ...session.draft,
    sourceBox: defaults.sourceBox || "",
    setOrNation: profile.setOrNation || "",
    startingLocation: defaults.startingLocation || (profile.kind === "nation" ? "nation_deck" : "market"),
    playerCountRequirement: defaults.playerCountRequirement || (profile.kind === "nation" ? "" : "2+"),
    isTradeRouteExpansion: defaults.isTradeRouteExpansion || (profile.requiredExpansions.includes("trade_routes") ? "true" : "false"),
    requiredExpansions: defaults.requiredExpansions || profile.requiredExpansions.join("|"),
    implemented: "false",
    tested: "false",
    ownership: profile.ownership || "commons",
    commonsSetId: profile.commonsSetId || "",
    commonsGroup: profile.commonsGroup || ""
  };
}

async function loadSession() {
  for (const [name, values] of Object.entries(enumOptions)) fillSelect(name, values);
  const response = await fetch("/api/session");
  session = await response.json();
  csvPathEl.textContent = session.csvPath;
  profileSelect.innerHTML = "";
  for (const profile of session.profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.label;
    profileSelect.append(option);
  }
  const nationOption = document.createElement("option");
  nationOption.value = "nation-custom";
  nationOption.textContent = "Nation Deck";
  profileSelect.append(nationOption);
  nationIdInput.hidden = true;
  writeForm(blankFromProfile());
  form.elements.cardId.focus();
}

async function saveDraft() {
  const current = readForm();
  const response = await fetch("/api/cards", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ draft: current })
  });
  const result = await response.json();
  if (!result.ok) {
    const first = result.report.errors.find((error) => error.level === "fatal");
    setStatus(first ? `${first.field}: ${first.message}` : "Save blocked by validation.", "error");
    return;
  }
  previousDraft = current;
  setStatus(`Saved ${current.cardId}. Rows: ${result.report.counts.rows}, warnings: ${result.report.counts.warnings}`, "ok");
  writeForm(blankFromProfile());
  form.elements.cardId.focus();
}

function duplicate(includePrivateText) {
  if (!previousDraft) {
    setStatus("No previous card to duplicate.", "error");
    return;
  }
  writeForm({
    ...previousDraft,
    cardId: "",
    privateName: includePrivateText ? previousDraft.privateName : "",
    publicPlaceholderName: includePrivateText ? previousDraft.publicPlaceholderName : "",
    rawEffectTextPrivate: includePrivateText ? previousDraft.rawEffectTextPrivate : "",
    effectOpsJson: includePrivateText ? previousDraft.effectOpsJson : "",
    implemented: "false",
    tested: "false"
  });
  form.elements.cardId.focus();
}

function updateBatch() {
  nationIdInput.hidden = profileSelect.value !== "nation-custom";
  writeForm(blankFromProfile());
}

document.querySelector("#save").addEventListener("click", saveDraft);
document.querySelector("#duplicate-safe").addEventListener("click", () => duplicate(false));
document.querySelector("#duplicate-full").addEventListener("click", () => duplicate(true));
document.querySelector("#validate-all").addEventListener("click", async () => {
  const report = await (await fetch("/api/validate")).json();
  setStatus(`Validation: rows=${report.counts.rows}, fatal=${report.counts.fatal}, warnings=${report.counts.warnings}`, report.counts.fatal ? "error" : "ok");
});
profileSelect.addEventListener("change", updateBatch);
nationIdInput.addEventListener("change", updateBatch);
document.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.key === "Enter") {
    event.preventDefault();
    saveDraft();
  }
  if (event.ctrlKey && event.key.toLowerCase() === "d") {
    event.preventDefault();
    duplicate(event.shiftKey);
  }
});

loadSession().catch((error) => setStatus(error.message, "error"));
