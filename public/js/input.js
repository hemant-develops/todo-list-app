const root = document.documentElement;
const body = document.body;
const themeToggle = document.querySelector("[data-theme-toggle]");
const addButton = document.querySelector(".addList");
const focusPreview = document.querySelector("[data-focus-preview]");
const privacyLabel = document.querySelector("[data-privacy-label]");
const deleteListButton = document.querySelector("#deleteListButton");
const specialOne = document.querySelector(".special-btn");
const specialForm = document.querySelector("#special-btn-form");
const authContainer = document.querySelector(".container");
const authToggleLinks = document.querySelectorAll("[data-auth-toggle]");
const mobileMenu = document.querySelector("[data-mobile-menu]");
const mobileMenuToggle = document.querySelector("[data-mobile-menu-toggle]");
const mobileMenuPanel = document.querySelector("[data-mobile-menu-panel]");
const ideaForm = document.querySelector("[data-idea-form]");
const ideaInput = document.querySelector("[data-idea-input]");
const ideaResults = document.querySelector("[data-idea-results]");
const ideaStatus = document.querySelector("[data-idea-status]");
const composerInput = document.querySelector('.composer input[name="newItem"]');

const reservedRoutes = [
  "delete",
  "login",
  "register",
  "about",
  "deletelist",
  "addnewlist",
  "logout",
];

function applyTheme(theme) {
  root.setAttribute("data-theme", theme);
  localStorage.setItem("todo-theme", theme);
  syncThemeToggle();
}

function syncThemeToggle() {
  const toggle = document.querySelector("[data-theme-toggle]");
  if (!toggle) return;

  const activeOption = toggle.querySelector(
    root.getAttribute("data-theme") === "dark"
      ? ".theme-toggle__option--moon"
      : ".theme-toggle__option--sun"
  );

  if (!activeOption) return;

  const toggleRect = toggle.getBoundingClientRect();
  const optionRect = activeOption.getBoundingClientRect();
  const x = optionRect.left - toggleRect.left;

  toggle.style.setProperty("--toggle-thumb-x", `${x}px`);
  toggle.style.setProperty("--toggle-thumb-width", `${optionRect.width}px`);
}

function initTheme() {
  const savedTheme = localStorage.getItem("todo-theme");
  const preferredTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";

  applyTheme(savedTheme || preferredTheme);
  window.addEventListener("resize", syncThemeToggle);

  themeToggle?.addEventListener("click", () => {
    const nextTheme =
      root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
  });
}

function setAuthMode(mode) {
  if (!authContainer) return;
  authContainer.classList.toggle("active", mode === "register");
}

function initAuthToggle() {
  if (!authContainer) return;

  setAuthMode(body.dataset.authRegister === "true" ? "register" : "login");

  authToggleLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      setAuthMode(link.dataset.authToggle);
    });
  });
}

function closeMobileMenu() {
  if (!mobileMenu || !mobileMenuPanel || !mobileMenuToggle) return;
  mobileMenu.classList.remove("is-open");
  mobileMenuPanel.classList.add("is-hidden");
  mobileMenuToggle.setAttribute("aria-expanded", "false");
}

function initMobileMenu() {
  if (!mobileMenu || !mobileMenuPanel || !mobileMenuToggle) return;

  mobileMenuToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = mobileMenu.classList.toggle("is-open");
    mobileMenuPanel.classList.toggle("is-hidden", !open);
    mobileMenuToggle.setAttribute("aria-expanded", open ? "true" : "false");
  });

  mobileMenuPanel.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => closeMobileMenu());
  });

  document.addEventListener("click", (event) => {
    if (!mobileMenu.contains(event.target)) {
      closeMobileMenu();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 640) {
      closeMobileMenu();
    }
  });
}

function createListInput() {
  const input = document.createElement("input");
  input.type = "text";
  input.id = "newListName";
  input.classList.add("new-list-input");
  input.autocomplete = "off";
  input.placeholder = "Name your new list";
  return input;
}

function bindAddListButton() {
  if (!addButton) return;

  addButton.onclick = () => {
    const inputField = createListInput();
    addButton.parentElement.insertBefore(inputField, addButton);
    addButton.textContent = "Create";
    inputField.focus();

    addButton.onclick = async () => {
      const value = inputField.value.trim();
      if (value) {
        await sendDataToServer(value);
      }
      addButton.textContent = "+ New list";
      inputField.remove();
      bindAddListButton();
    };
  };
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return { message: "Unexpected response from server." };
}

async function sendDataToServer(newListName) {
  if (!preventRouteClash(newListName)) {
    alert(
      `The list name "${newListName}" matches an app route. Please choose something else.`
    );
    return;
  }

  try {
    const response = await fetch("/addNewList", {
      method: "POST",
      body: JSON.stringify({ newListName }),
      headers: { "Content-type": "application/json; charset=UTF-8" },
    });
    const payload = await parseResponse(response);

    if (!response.ok) {
      throw new Error(payload.message || "Could not create the list.");
    }

    location.assign(payload.redirect || location.href);
  } catch (error) {
    alert(error.message);
  }
}

function showError(show = true) {
  const error = document.querySelector("#error");
  if (error) {
    error.classList.toggle("is-hidden", !show);
  }
}

let passwordTimer;
function verify(strong = false) {
  const pass = document.querySelector("#reg-pass");
  const confirmPass = document.querySelector("#confirm-pass");
  const submit = document.querySelector("#register-submit");

  if (!pass || !confirmPass || !submit) return false;
  if (passwordTimer) clearTimeout(passwordTimer);

  submit.removeAttribute("type");

  if (pass.value) {
    if (pass.value === confirmPass.value) {
      showError(false);
      submit.setAttribute("type", "submit");
      return true;
    }

    passwordTimer = setTimeout(showError, 1200);
    if (confirmPass.value.length > pass.value.length || strong) {
      showError(true);
    }
  }

  return false;
}

function getTaskItems() {
  return Array.from(document.querySelectorAll("[data-task-item]"));
}

function setFocusPreview(message) {
  if (focusPreview) {
    focusPreview.textContent = message;
  }
}

function clearSpotlight() {
  getTaskItems().forEach((item) => item.classList.remove("task-form--spotlight"));
}

function spotlightRandomTask() {
  const items = getTaskItems();
  if (!items.length) {
    setFocusPreview("No live tasks yet. Add one and spin the deck again.");
    return;
  }

  clearSpotlight();
  const selected = items[Math.floor(Math.random() * items.length)];
  selected.classList.add("task-form--spotlight");
  selected.scrollIntoView({ behavior: "smooth", block: "center" });
  setFocusPreview(selected.dataset.taskText || "Fresh mission selected.");
}

function syncPrivacyMode() {
  const enabled = localStorage.getItem("todo-privacy-mode") === "on";
  body.classList.toggle("privacy-mode", enabled);
  if (privacyLabel) {
    privacyLabel.textContent = enabled ? "Reveal board" : "Privacy veil";
  }
}

function togglePrivacyMode() {
  const enabled = !(localStorage.getItem("todo-privacy-mode") === "on");
  localStorage.setItem("todo-privacy-mode", enabled ? "on" : "off");
  syncPrivacyMode();
}

async function copySnapshot() {
  const items = getTaskItems().map((item, index) => {
    const text = item.dataset.taskText || "";
    return `${index + 1}. ${text}`;
  });

  const title = document.querySelector(".hero-copy h1")?.textContent?.trim() || "Mission board";
  const payload = [title, "", ...items].join("\n");

  try {
    await navigator.clipboard.writeText(payload);
    setFocusPreview("Snapshot copied. Drop it anywhere.");
  } catch (error) {
    setFocusPreview("Clipboard access is blocked in this browser.");
  }
}

function bindCommandDeck() {
  document.querySelector('[data-command="spotlight"]')?.addEventListener("click", () => {
    spotlightRandomTask();
  });

  document.querySelector('[data-command="privacy"]')?.addEventListener("click", () => {
    togglePrivacyMode();
  });

  document.querySelector('[data-command="snapshot"]')?.addEventListener("click", () => {
    copySnapshot();
  });

  document.addEventListener("keydown", (event) => {
    const activeTag = document.activeElement?.tagName;
    if (activeTag === "INPUT" || activeTag === "TEXTAREA") return;

    const key = event.key.toLowerCase();
    if (key === "f") {
      spotlightRandomTask();
    }
    if (key === "p") {
      togglePrivacyMode();
    }
    if (key === "s") {
      copySnapshot();
    }
    if (key === "i") {
      ideaInput?.focus();
    }
  });

  syncPrivacyMode();
}

function renderIdeaResults(suggestions, query) {
  if (!ideaResults) return;

  ideaResults.innerHTML = "";

  suggestions.forEach((suggestion) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "idea-chip";
    button.textContent = suggestion;
    button.addEventListener("click", () => {
      if (composerInput) {
        composerInput.value = suggestion;
        composerInput.focus();
      }
      setFocusPreview(`Idea loaded from "${query}". Hit Add when ready.`);
    });
    ideaResults.appendChild(button);
  });
}

async function fetchIdeas(query) {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    if (ideaStatus) {
      ideaStatus.textContent = "Enter a keyword first to unlock idea suggestions.";
    }
    return;
  }

  if (ideaStatus) {
    ideaStatus.textContent = `Scanning ideas for "${cleanQuery}"...`;
  }

  try {
    const response = await fetch(`/ideas?q=${encodeURIComponent(cleanQuery)}`);
    const payload = await parseResponse(response);

    if (!response.ok) {
      throw new Error(payload.message || "Could not load ideas right now.");
    }

    renderIdeaResults(payload.suggestions || [], cleanQuery);
    if (ideaStatus) {
      ideaStatus.textContent = `Found ${payload.suggestions.length} ideas. Tap one to move it into your task box.`;
    }
  } catch (error) {
    if (ideaStatus) {
      ideaStatus.textContent = error.message;
    }
  }
}

function bindIdeaSearch() {
  ideaForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    fetchIdeas(ideaInput?.value || "");
  });

  document.querySelectorAll("[data-idea-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      const keyword = button.dataset.ideaPreset || "";
      if (ideaInput) {
        ideaInput.value = keyword;
      }
      fetchIdeas(keyword);
    });
  });
}

function bindTaskDeletion() {
  document.querySelectorAll('.task-form input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      checkbox.form?.submit();
    });
  });
}

function bindRegisterValidation() {
  const confirmPass = document.querySelector("#confirm-pass");
  confirmPass?.addEventListener("input", () => verify());
}

specialForm?.addEventListener("submit", (event) => {
  event.preventDefault();
});

specialOne?.addEventListener("click", (event) => {
  if (event.target.closest("#deleteListButton")) return;
  deleteListButton?.classList.toggle("is-hidden");
});

deleteListButton?.addEventListener("click", async () => {
  try {
    const response = await fetch("/deleteList", {
      method: "POST",
      body: JSON.stringify({ listName: deleteListButton.dataset.list }),
      headers: { "Content-type": "application/json; charset=UTF-8" },
    });
    const payload = await parseResponse(response);

    if (!response.ok) {
      throw new Error(payload.message || "Could not delete the list.");
    }

    location.assign(payload.redirect || "/To-do");
  } catch (error) {
    alert(error.message);
  }
});

function preventRouteClash(newListName) {
  return !reservedRoutes.includes(newListName.toLowerCase());
}

initTheme();
initAuthToggle();
initMobileMenu();
bindAddListButton();
bindCommandDeck();
bindIdeaSearch();
bindTaskDeletion();
bindRegisterValidation();

window.verify = verify;
