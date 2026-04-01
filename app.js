require("dotenv").config();
const express = require("express");
const date = require(__dirname + "/date.js");
const _ = require("lodash");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");

mongoose.set("strictQuery", false);

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
const sessionSecret = process.env.SECRET;

const SESSION_AGE_MS = 1000 * 60 * 60 * 24 * 7;
const AUTH_WINDOW_MS = 1000 * 60 * 15;
const AUTH_MAX_ATTEMPTS = 12;
const MAX_LIST_NAME_LENGTH = 32;
const MAX_ITEM_LENGTH = 160;
const MAX_LISTS_PER_USER = 24;
const MAX_ITEMS_PER_LIST = 300;
const MAX_IDEA_QUERY_LENGTH = 80;
const RESERVED_ROUTES = new Set([
  "delete",
  "login",
  "register",
  "about",
  "logout",
  "deletelist",
  "addnewlist",
  "favicon.ico",
]);

const authAttempts = new Map();
const IDEA_LIBRARY = {
  productivity: {
    keywords: ["productivity", "focus", "routine", "discipline", "organize"],
    ideas: [
      "Pick one high-impact task and finish it before checking distractions.",
      "Create a 25-minute deep work block for your hardest task.",
      "Clear one physical or digital space that is slowing you down.",
    ],
  },
  study: {
    keywords: ["study", "exam", "revision", "college", "school", "learning", "notes"],
    ideas: [
      "Review one chapter and write 5 recall questions from memory.",
      "Turn your hardest topic into 10 flashcards.",
      "Solve one timed practice set and mark the weak spots.",
    ],
  },
  fitness: {
    keywords: ["fitness", "gym", "workout", "run", "exercise", "health", "yoga"],
    ideas: [
      "Plan a 30-minute workout and lay out your gear in advance.",
      "Track water, sleep, and movement for today in one quick note.",
      "Do one recovery habit after training like stretching or a walk.",
    ],
  },
  coding: {
    keywords: ["code", "coding", "developer", "bug", "project", "app", "website"],
    ideas: [
      "List the top bug or blocker and define the smallest fix first.",
      "Ship one visible UI or backend improvement today.",
      "Write a short test checklist before touching the next feature.",
    ],
  },
  content: {
    keywords: ["youtube", "content", "video", "instagram", "reel", "post", "writing"],
    ideas: [
      "Draft 5 content hooks around your main topic.",
      "Outline one post or video in intro, value, and call-to-action format.",
      "Collect 3 reference ideas and remix them in your own voice.",
    ],
  },
  business: {
    keywords: ["business", "startup", "client", "sales", "marketing", "brand"],
    ideas: [
      "Write one offer that clearly states problem, promise, and price.",
      "Reach out to 3 leads with a sharp, personalized message.",
      "Review one funnel, page, or pitch and cut the weakest section.",
    ],
  },
  home: {
    keywords: ["home", "cleaning", "room", "kitchen", "family", "house"],
    ideas: [
      "Reset one room completely before moving to the next.",
      "Make a 15-minute cleaning sprint list and race the timer.",
      "Prepare tomorrow's essentials in one visible place tonight.",
    ],
  },
  finance: {
    keywords: ["money", "finance", "budget", "saving", "income", "expense"],
    ideas: [
      "Review today's spending and tag one unnecessary cost.",
      "Set one savings target and name the amount plus deadline.",
      "Write a 3-step plan for increasing income this month.",
    ],
  },
  travel: {
    keywords: ["travel", "trip", "vacation", "flight", "hotel", "journey"],
    ideas: [
      "List the non-negotiables for your trip: budget, dates, and city.",
      "Create a short packing checklist for essentials only.",
      "Compare 3 stay or travel options and shortlist the best one.",
    ],
  },
  food: {
    keywords: ["food", "meal", "diet", "recipe", "cooking", "keto"],
    ideas: [
      "Plan your next 3 meals before hunger decides for you.",
      "Prep one healthy default option for busy hours.",
      "Save 2 repeatable recipes you can make without thinking.",
    ],
  },
};

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "img-src 'self' data:",
      "style-src 'self' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "script-src 'self'",
      "connect-src 'self'",
      "form-action 'self'",
    ].join("; ")
  );
  next();
});

app.use(express.static("public"));
app.set("view engine", "ejs");

app.use(
  session({
    name: "todo.sid",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    proxy: process.env.NODE_ENV === "production",
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_AGE_MS,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

const itemSchema = new mongoose.Schema({
  name: String,
});

const listSchema = new mongoose.Schema({
  name: String,
  items: [itemSchema],
});

const dataSchema = new mongoose.Schema({
  username: String,
  lists: [listSchema],
});

const userSchema = new mongoose.Schema({
  username: String,
  password: String,
});

userSchema.plugin(passportLocalMongoose.default);

const Data = mongoose.model("Data", dataSchema);
const User = mongoose.model("User", userSchema);

passport.use(User.createStrategy());
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

function createDefaultItems() {
  return [
    { name: "Welcome to your mission board." },
    { name: "Create a fresh list from the rail when you want a new zone." },
    { name: "Use Spotlight mode to let the app choose your next move." },
    { name: "Hit Privacy Veil when you want to hide the board fast." },
    { name: "Copy a Snapshot when you need a quick update to share." },
  ];
}

function sanitizeText(value, maxLength) {
  return String(value || "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeListName(value) {
  const cleaned = sanitizeText(value, MAX_LIST_NAME_LENGTH);
  if (!cleaned) return "";

  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function encodeListRoute(listName) {
  return `/${encodeURIComponent(listName)}`;
}

function renderAuthPage(res, showRegister, authError = "", statusCode = 200) {
  res.status(statusCode).render("login-register", {
    showRegister,
    authError,
  });
}

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }

  res.redirect("/login");
}

function recordAuthAttempt(key) {
  const now = Date.now();
  const bucket = authAttempts.get(key);

  if (!bucket || now > bucket.resetAt) {
    const freshBucket = { count: 1, resetAt: now + AUTH_WINDOW_MS };
    authAttempts.set(key, freshBucket);
    return freshBucket;
  }

  bucket.count += 1;
  authAttempts.set(key, bucket);
  return bucket;
}

function clearExpiredAuthAttempts() {
  const now = Date.now();
  for (const [key, value] of authAttempts.entries()) {
    if (now > value.resetAt) {
      authAttempts.delete(key);
    }
  }
}

function authRateLimit(req, res, next) {
  clearExpiredAuthAttempts();
  const key = `${req.ip}:${req.path}`;
  const bucket = recordAuthAttempt(key);

  if (bucket.count > AUTH_MAX_ATTEMPTS) {
    return renderAuthPage(
      res,
      req.path === "/register",
      "Too many attempts. Take a short break and try again in a few minutes.",
      429
    );
  }

  next();
}

function clearAuthAttempts(req) {
  authAttempts.delete(`${req.ip}:${req.path}`);
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function loginUser(req, user) {
  return new Promise((resolve, reject) => {
    req.login(user, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function logoutUser(req) {
  return new Promise((resolve, reject) => {
    req.logOut((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function buildDashboardState(lists, listItems) {
  const focusScore = Math.max(
    18,
    100 - listItems.length * 8 - Math.max(lists.length - 1, 0) * 3
  );

  const focusMode =
    listItems.length === 0
      ? "Zero Gravity"
      : listItems.length <= 3
        ? "Locked In"
        : listItems.length <= 7
          ? "Momentum"
          : "Overdrive";

  const spotlightSeed =
    listItems[0]?.name || "Inbox cleared. Add your next mission to spin the deck again.";

  const quickTip =
    listItems.length === 0
      ? "Capture your next idea before it escapes."
      : "Use Spotlight when you want the board to choose your next hit.";

  return {
    focusScore,
    focusMode,
    spotlightSeed,
    quickTip,
  };
}

function buildIdeaSuggestions(query) {
  const cleanedQuery = sanitizeText(query, MAX_IDEA_QUERY_LENGTH).toLowerCase();
  const keywords = cleanedQuery.split(" ").filter(Boolean);
  const matches = [];

  for (const [category, config] of Object.entries(IDEA_LIBRARY)) {
    const matched = config.keywords.some((alias) =>
      keywords.some((keyword) => keyword.includes(alias) || alias.includes(keyword))
    );

    if (matched) {
      matches.push(category);
    }
  }

  const suggestions = [];
  const addSuggestion = (text) => {
    if (text && !suggestions.includes(text)) {
      suggestions.push(text);
    }
  };

  matches.forEach((category) => {
    IDEA_LIBRARY[category].ideas.forEach(addSuggestion);
  });

  if (!matches.length) {
    addSuggestion(`Break "${query}" into 3 tiny steps and start with the easiest one.`);
    addSuggestion(`Research "${query}" for 15 minutes and save the best 3 takeaways.`);
    addSuggestion(`Create one deadline and one success metric for "${query}".`);
    addSuggestion(`Write down the biggest blocker slowing "${query}" and one fix for it.`);
  } else {
    addSuggestion(`Turn "${query}" into one measurable task you can finish today.`);
    addSuggestion(`Set a 20-minute sprint for "${query}" and stop only after one clear win.`);
  }

  return {
    query,
    categories: matches,
    suggestions: suggestions.slice(0, 6),
  };
}

app.get("/", (req, res) => {
  if (req.isAuthenticated()) {
    res.redirect("/To-do");
    return;
  }

  res.redirect("/login");
});

app.get("/register", (req, res) => {
  renderAuthPage(res, true);
});

app.get("/login", (req, res) => {
  renderAuthPage(res, false);
});

app.get("/logout", ensureAuthenticated, async (req, res, next) => {
  try {
    await logoutUser(req);
    req.session.destroy((err) => {
      if (err) {
        next(err);
        return;
      }
      res.clearCookie("todo.sid");
      res.redirect("/");
    });
  } catch (err) {
    next(err);
  }
});

app.get("/about", (req, res) => {
  res.render("about.ejs");
});

app.get("/ideas", ensureAuthenticated, (req, res) => {
  const query = sanitizeText(req.query.q, MAX_IDEA_QUERY_LENGTH);

  if (!query) {
    res.status(400).json({ message: "Enter a keyword first to unlock idea suggestions." });
    return;
  }

  res.json(buildIdeaSuggestions(query));
});

app.get("/:listName", ensureAuthenticated, async (req, res) => {
  const listName = normalizeListName(decodeURIComponent(req.params.listName));
  const { username } = req.user;

  const data = await Data.findOne({ username }).lean();
  const lists = data?.lists || [];
  const theList = lists.find((entry) => entry.name === listName);

  if (!theList) {
    res.redirect("/To-do");
    return;
  }

  const dashboardState = buildDashboardState(lists, theList.items);

  res.render("todoList", {
    listTitle: listName === "To-do" ? date.getDate() : `${listName} List`,
    lists: lists.map((entry) => entry.name),
    listItems: theList.items,
    listName,
    dashboardState,
  });
});

app.post("/register", authRateLimit, async (req, res) => {
  const username = sanitizeText(req.body.username, 120).toLowerCase();
  const password = String(req.body.password || "");

  if (!username.includes("@")) {
    renderAuthPage(res, true, "Use a valid email address.", 400);
    return;
  }

  if (password.length < 8) {
    renderAuthPage(
      res,
      true,
      "Use at least 8 characters so the password is harder to brute-force.",
      400
    );
    return;
  }

  try {
    const registeredUser = await User.register({ username }, password);
    await regenerateSession(req);
    await loginUser(req, registeredUser);
    clearAuthAttempts(req);

    await Data.create({
      username: registeredUser.username,
      lists: [
        {
          name: "To-do",
          items: createDefaultItems(),
        },
      ],
    });

    res.redirect("/To-do");
  } catch (err) {
    const authError =
      err.name === "UserExistsError"
        ? "That email already has an account."
        : "Could not create your account right now.";

    console.log("register error", err);
    renderAuthPage(res, true, authError, 400);
  }
});

app.post("/login", authRateLimit, (req, res, next) => {
  req.body.username = sanitizeText(req.body.username, 120).toLowerCase();
  req.body.password = String(req.body.password || "");

  passport.authenticate("local", async (err, user) => {
    if (err) {
      next(err);
      return;
    }

    if (!user) {
      renderAuthPage(res, false, "Invalid email or password.", 401);
      return;
    }

    try {
      await regenerateSession(req);
      await loginUser(req, user);
      clearAuthAttempts(req);
      res.redirect("/To-do");
    } catch (sessionErr) {
      next(sessionErr);
    }
  })(req, res, next);
});

app.post("/delete", ensureAuthenticated, async (req, res) => {
  const listName = normalizeListName(req.body.listName);
  const checkboxId = sanitizeText(req.body.checkbox, 48);

  if (!listName || !mongoose.Types.ObjectId.isValid(checkboxId)) {
    res.redirect("/To-do");
    return;
  }

  try {
    await Data.updateOne(
      {
        username: req.user.username,
        "lists.name": listName,
      },
      {
        $pull: {
          "lists.$.items": { _id: new mongoose.Types.ObjectId(checkboxId) },
        },
      }
    );

    res.redirect(encodeListRoute(listName));
  } catch (err) {
    console.log("delete item error", err);
    res.status(500).send(
      "A delete request misfired. Refresh once and try again."
    );
  }
});

app.post("/addNewList", ensureAuthenticated, async (req, res) => {
  const listName = normalizeListName(req.body.newListName);

  if (!listName) {
    res.status(400).json({ message: "Give the new list a real name first." });
    return;
  }

  if (RESERVED_ROUTES.has(listName.toLowerCase())) {
    res.status(400).json({ message: "That name is reserved by the app." });
    return;
  }

  const data = await Data.findOne({ username: req.user.username }).lean();
  const lists = data?.lists || [];

  if (lists.length >= MAX_LISTS_PER_USER) {
    res.status(400).json({
      message: "You have hit the list limit. Clear a few rooms before creating more.",
    });
    return;
  }

  if (lists.some((entry) => entry.name.toLowerCase() === listName.toLowerCase())) {
    res.status(400).json({ message: "That list already exists." });
    return;
  }

  try {
    await Data.updateOne(
      {
        username: req.user.username,
      },
      {
        $push: {
          lists: {
            name: listName,
            items: [],
          },
        },
      }
    );

    res.status(201).json({
      message: "List created.",
      redirect: encodeListRoute(listName),
    });
  } catch (err) {
    console.log("add list error", err);
    res.status(500).json({ message: "Could not create that list right now." });
  }
});

app.post("/deleteList", ensureAuthenticated, async (req, res) => {
  const listName = normalizeListName(req.body.listName);

  if (!listName || listName === "To-do") {
    res.status(400).json({
      message: "The main To-do list is locked in place and cannot be deleted.",
    });
    return;
  }

  try {
    await Data.updateOne(
      {
        username: req.user.username,
      },
      {
        $pull: { lists: { name: listName } },
      }
    );

    res.json({ message: "List removed.", redirect: "/To-do" });
  } catch (err) {
    console.log("delete list error", err);
    res.status(500).json({ message: "Could not delete that list right now." });
  }
});

app.post("/:listName", ensureAuthenticated, async (req, res) => {
  const listName = normalizeListName(decodeURIComponent(req.params.listName));
  const itemName = sanitizeText(req.body.newItem, MAX_ITEM_LENGTH);

  if (!listName) {
    res.redirect("/To-do");
    return;
  }

  if (!itemName) {
    res.redirect(encodeListRoute(listName));
    return;
  }

  const data = await Data.findOne(
    {
      username: req.user.username,
      "lists.name": listName,
    },
    {
      "lists.$": 1,
    }
  ).lean();

  const itemCount = data?.lists?.[0]?.items?.length || 0;
  if (itemCount >= MAX_ITEMS_PER_LIST) {
    res.status(400).send(
      "This list is full for now. Complete a few missions before adding more."
    );
    return;
  }

  try {
    await Data.updateOne(
      {
        username: req.user.username,
        "lists.name": listName,
      },
      {
        $push: {
          "lists.$.items": { name: itemName },
        },
      }
    );

    res.redirect(encodeListRoute(listName));
  } catch (err) {
    console.log("add item error", err);
    res.status(500).send(
      "A task could not be added right now. Please try once more."
    );
  }
});

async function startServer() {
  if (!mongoUri) {
    throw new Error(
      "MongoDB connection string is missing. Set MONGODB_URI or MONGO_URI in your .env file."
    );
  }

  if (!sessionSecret) {
    throw new Error("SECRET is missing. Add it to your .env file before starting the app.");
  }

  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB");

  app.listen(process.env.PORT || 3000, () => {
    console.log(`app running at http://localhost:${process.env.PORT || "3000"}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start application:", err);
  process.exit(1);
});
