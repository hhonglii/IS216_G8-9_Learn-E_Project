# Learn-E

Created: 2026-11-05
Last Updated: 2026-11-06

Learn-E is a classroom app for practising debugging. Professors publish debugging challenges; students answer them, explain how the fix applies to a new case, and ask classmates for help. Students whose work on a challenge was approved can mentor others on it and earn contribution points. Later, groups take on mini-projects tracked against a GitHub repository, and the professor reviews what each group submits. Each classroom can also have a Boss Battle quiz game that the professor builds and students play.

Built for IS216 Web Application Development II at Singapore Management University.

**Live site:** https://is-216-g8-9-learn-e-project-vosm.vercel.app/

## Features

- **Accounts:** everyone signs up with a username and password. A professor account also needs the professor sign-up code the server is configured with. There are 5 demo accounts on the live site, and passwords need 8 to 128 characters.
- **Classrooms:** professors create classrooms, pick a cover for each and share a join code. The dashboard's "Waiting on you" list shows a professor what needs reviewing, and shows a student returned work, hints to check, new challenges, approved diagnoses and classmates' questions they can now help with.
- **Debugging challenges:** each challenge has a prompt, an optional code snippet and questions of three kinds: predict the output, locate the fault (the line and the kind of mistake) or put repair steps in order. Every wrong answer unlocks the next hint. Once every question is right, the student writes an applied diagnosis, which the professor approves or returns with feedback. Professors can preview a draft as a student before publishing it.
- **Peer mentoring:** students ask for help on one question of a challenge or on anything in the class. A classmate whose diagnosis for that challenge was approved can claim a question request and sees the code and the asker's last wrong answer. Helpful answers earn contribution points, which rank the classroom leaderboard.
- **Group mini-projects:** professors draft a brief with stage instructions, a rubric and up to five PDF or zip files. Students form groups, split the work into tasks, record evidence for each stage, link a public GitHub repository to show its commits and contributors, and submit for review.
- **Classroom games:** professors build a Boss Battle from their own multiple-choice questions. Students defeat the monster by answering every question before their hearts run out. Answers are marked on the server, and the professor sees the class results. It has no effect on grades.
- **Take a break:** 2048, Tetris and RootKit OS, with personal best scores kept in your browser.
- **Optional drafting:** professors can have Google Gemini draft challenge content, hints and Boss Battle questions, then review them before saving.

## Using the app

### As a professor

1. Create an account, choose **Professor** and enter the professor sign-up code.
2. Create a classroom and share its join code with your students.
3. Write challenges and publish them for the class to attempt.
4. Review applied diagnoses and mini-project submissions on the **Professor review** page. Approving a student's diagnosis lets them mentor others on that challenge.
5. To add a game, choose **Create Boss Battle** in the **Boss Battle** section of your classroom's page (it says **Edit Boss Battle** once a battle exists). Pick a monster, set 1 to 10 hearts and add at least 3 questions, typed or drafted with Gemini. Preview it, publish it, then read the class results.

### As a student

1. Create an account, choose **Student** and join a classroom with its code.
2. Work through the challenges and write your applied diagnosis.
3. Use the **Help queue** to ask for a hint, and to help classmates: general requests any time, question requests once your diagnosis for that challenge is approved.
4. Create or join a group to work on a mini-project.
5. When a Boss Battle is up, the classroom page's **Boss Battle** section shows its monster. Choose **Play**, then **Start battle**. The sound starts off; the sound buttons turn the effects and the music on.
6. Open **Take a break** from the sidebar to play 2048, Tetris or RootKit OS.

## Run it locally

### 1. Install the prerequisites

You need Node.js `^22.18.0` or `>=24.12.0`, and pnpm 11.19.0.

```bash
node --version
npm install --global pnpm@11.19.0
pnpm --version
```

If Windows PowerShell blocks scripts, use `npm.cmd` and `pnpm.cmd` instead.

### 2. Install the dependencies

Run these from the folder that contains `client/` and `server/`:

```bash
pnpm --dir server install --frozen-lockfile
pnpm --dir client install --frozen-lockfile
```

### 3. Add the `.env` file

Copy `server/.env.example` to `server/.env` and fill it in. Keep the name exactly `.env`, not `.env.txt`, and never commit it.

The app needs a MongoDB database, so the file must contain a valid `MONGODB_URI`. With it left blank, the pages load but nobody can create an account or log in. If the database can't be reached, the server stops at startup.

| Setting | What it is for | Needed? |
| --- | --- | --- |
| `MONGODB_URI` | The MongoDB connection string, local or MongoDB Atlas | Yes |
| `PROFESSOR_SIGNUP_CODE` | The code entered when creating a professor account | To create professor accounts |
| `PORT` | The backend port, `8000` by default | No |
| `CLIENT_ORIGIN` | The frontend address, `http://localhost:5173` by default | No |
| `GITHUB_TOKEN` | Raises the limits on GitHub requests | No |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Turn on Gemini drafting; both are needed | No |

The frontend needs no `.env` file at the default ports. To point it at another backend, copy `client/.env.example` to `client/.env` and change `VITE_API_BASE_URL`.

### 4. Start the app

Use two terminals, both in the same folder as step 2, and start the backend first:

```bash
pnpm --dir server dev
```

```bash
pnpm --dir client dev
```

Open <http://localhost:5173>. To check the backend, open <http://localhost:8000/api/health>, where `database` should say `connected`. Press **Ctrl+C** in each terminal to stop.

### 5. Run the tests

```bash
pnpm --dir server test --run
pnpm --dir client test:unit --run
pnpm --dir client check
pnpm --dir client build
pnpm --dir client exec playwright install chromium
CI=1 pnpm --dir client test:e2e
```

Stop your own dev servers before the browser tests. They start their own servers, and the product tests use a throwaway in-memory MongoDB, so no real database is touched. The games have their own browser tests, which serve the production build:

```bash
pnpm --dir client exec playwright test -c playwright.games.config.js
```

`postman/Learn-E.postman_collection.json` holds a request for every API route.

## How to test the application

You can test Learn-E in two ways: by hand on the live site with its seeded accounts, or with the automated test suites on your own machine.

The live site has five seeded accounts: the professor `prof` and the students Bing, Bong, Ding and Dong. Their passwords are in our project submission rather than here, so that visitors to this public repository can't change the demo data.

### Test cases on the live site

The live site already holds a classroom, **WAD2 Debugging Lab**, with one challenge (**Cart total skips the last item**), a mini-project (**Campus Café cart**) and a Boss Battle (**The Loop Lair**). Bing has solved the challenge and is a mentor on it, and all four students are in the group **Team Byte**.

Use a private window, or a second browser, for each extra account you want signed in at the same time. A browser keeps one session per site, so logging in as a second user in another tab of the same window logs out the first.

Several cases use a new student account, so you can go through the student flow from the start without changing the seeded students' work. Create one with **Create account**, choose **Student**, and pick any username and a password of 8 to 128 characters.

| # | As | Steps | Expected result |
| --- | --- | --- | --- |
| 1 | Anyone | Log in as Bing with the password `wrong-pass`. Then click the X on the message. | "Username or password is incorrect." appears, and the X removes it. |
| 2 | Anyone | While logged out, add `/take-a-break` to the live site's address and open it. | You land on the login page instead. After you log in, Take a break opens. |
| 3 | Professor | Log in and choose **Open classroom** on WAD2 Debugging Lab. | The classroom page shows its join code, the challenge, the mini-project and the Boss Battle. |
| 4 | New student | In **Join classroom**, enter `ZZZZZZ`. Then enter the join code from case 3. | First: "No classroom uses that join code. Check it with your professor." Then: "Joined WAD2 Debugging Lab", and the classroom card appears. |
| 5 | New student | Open the challenge. On Question 1 pick **36** and choose **Submit answer**. | "Incorrect answer. Please try again." The first hint unlocks, with a link to ask a classmate for a hint. |
| 6 | New student | Follow **Ask a classmate for a hint**, pick **Guiding question** and choose **Submit help request**. | The request appears in the classroom's Help queue. |
| 7 | Bing | Open the classroom's **Help queue**, choose **Claim request** on the new request, write a hint and choose **Send hint**. | Bing sees the challenge code and the new student's last wrong answer (36) while writing the hint. |
| 8 | New student | In the Help queue choose **Open request**, then **Helpful**. | Bing's contribution points go up by 5 on the classroom leaderboard. |
| 9 | New student | Answer Question 1 with **16**. On Question 2 pick **Line 3** and **Off-by-one**. On Question 3 order the steps: log `i`, change the condition, re-run. Then write any diagnosis and choose **Submit diagnosis**. | "Correct answer!" on each question, then "All structured questions completed!". After submitting, the page shows **Waiting for review**. |
| 10 | Professor | From **Waiting on you** on the dashboard, review the new student's diagnosis. Choose **Return for corrections**, add feedback and submit. | The review page confirms it was returned. On the student's challenge page, "Diagnosis returned" shows with the feedback, and the diagnosis form is back. |
| 11 | Bing | Open **Campus Café cart**. Choose **Download** on a material, then **Refresh GitHub data** under Repository. | The zip or PDF downloads. Team Byte shows its four members, its tasks with commit links, and its stage evidence. The latest commits list the commits from `hhonglii/campus-cafe-cart` by Ding, Bing, Dong and Bong. |
| 12 | New student | On Campus Café cart, create a group. Under **Repository**, attach `https://example.com/repo`. | "Use an HTTPS github.com owner/repository URL without credentials, query parameters or extra paths." Nothing is saved. |
| 13 | New student | In the classroom page's **Boss Battle** section choose **Play**, then **Start battle**. Get one question wrong on purpose and finish the battle. | A heart is lost on the wrong answer, and the battle ends with a result screen. |
| 14 | Professor | In the classroom page's **Boss Battle** section choose **Edit Boss Battle**. | The class results include the new student's run. |
| 15 | Bing | Copy the address of the professor's **Professor review** page and open it while logged in as Bing. | An error shows instead of the review lists. Students can't see other students' work. |
| 16 | Bing | Choose **Your profile**. | It shows Bing's contribution points, the cart challenge under Completed challenges and Team Byte under Project groups. |
| 17 | Any student | Choose **Take a break** and play a round of 2048. Reload the page. | The game runs, and your personal best is still shown after the reload. |
| 18 | Anyone | On any page inside a classroom, press the browser's reload button. | The same page loads again rather than a "not found" page. |

To check that the API is up, open <https://is-216-g8-9-learn-e-project.vercel.app/api/health>. It should show `"database":"connected"`.

### Automated tests

Step 5 of "Run it locally" has the commands. Here's what each one covers:

- **Server tests** (`pnpm --dir server test --run`): every API route, through Vitest and Supertest against an in-memory MongoDB. They cover sign-up and login, the join code checks, marking answers, the review rules, the help queue, groups and their GitHub data, material uploads, the Boss Battle marking, and the professor-only and member-only checks. The last run on 2026-11-05 had 41 test files: 1266 tests passed and 1 was skipped.
- **Client unit tests** (`pnpm --dir client test:unit --run`): components, pages and helpers, run in jsdom with Vue Test Utils. The last run on 2026-11-05 had 54 test files, and all 1015 tests passed.
- **Lint and format** (`pnpm --dir client check`): oxlint, ESLint and Prettier.
- **Browser tests** (`CI=1 pnpm --dir client test:e2e`): Playwright drives Chromium through whole flows, such as logging in, challenges, professor review, mini-project submission and the GitHub panel, the profile and the sidebar. The games have their own config, `playwright.games.config.js`.

For the API alone, import `postman/Learn-E.postman_collection.json` into Postman. Set `baseUrl` to your server's `/api` address, fill in `username` and `password`, and send **Auth > Log in** first, which saves the session token for the other requests. Run the full collection only against a local server, because some requests create and delete data.

## How it's built

- `client/` is a Vue 3 single-page app built with Vite, using Bootstrap 5 for layout, Vue Router for pages and Axios for API calls.
- `server/` is an Express 5 API storing data in MongoDB through Mongoose. Requests go from routes to controllers, with models for the collections and services for the rules: marking answers, passwords, sessions, and the GitHub and Gemini calls.
- Every API reply is JSON: `{ data }` on success, or `{ error: { code, message, details } }` on failure.
- Logging in returns a session token that the browser keeps and sends as `Authorization: Bearer <token>`. The server stores only a hash of each token, and passwords are stored as scrypt hashes.
- GitHub and Gemini are called only from the server, so their keys never reach the browser.

| Area | Technologies |
| --- | --- |
| Frontend | Vue 3, Vue Router, JavaScript, HTML, CSS, Bootstrap 5, Axios, Vite |
| Backend | Node.js, Express, Mongoose, dotenv, cors |
| Database | MongoDB |
| Accounts | Username and password login, with passwords hashed using scrypt from Node's `crypto` module |
| Game audio | Web Audio API |
| External services | GitHub REST API, Google Gemini API, DiceBear avatars, Google Fonts |
| Testing | Vitest, Vue Test Utils, jsdom, Supertest, Playwright, mongodb-memory-server |
| Code quality and tools | ESLint, oxlint, Prettier, pnpm |

```text
client/src          the app: views, components, services, router, styles
client/src/__tests__  unit and component tests (Vitest)
client/e2e          browser tests (Playwright)
server/src          the API: app, routes, controllers, models, services, utils
server/tests        API tests (Vitest and Supertest)
server/index.js     the Vercel entry point
postman/            an API collection for Postman or Newman
```

## AI attribution

AI generated the following parts of the games in this app:

- **Game assets:** all game artwork, including the six Boss Battle monsters.
- **Game audio:** all music and sound effects. They are written as code and synthesized in the browser, so no recordings or third-party sounds are used.
- **Game code and logic flow:** the rules, game flow and interactions of 2048, Tetris, RootKit OS and the Boss Battle, including the server code that marks Boss Battle answers.

## Limitations

This is a university prototype, so don't store sensitive data in it. Passwords are hashed, but session tokens are kept in the browser's `localStorage`, login has no rate limit or password reset, and local development uses plain HTTP.

## Document Information

Created: 2026-11-05
Last Updated: 2026-11-06
Document Type: Project README
