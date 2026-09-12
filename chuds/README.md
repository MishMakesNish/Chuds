# Chuds

A shared, public gym-lift leaderboard. Everyone who visits the site sees
the same leaderboard, points, streaks, and notifications — this needs two
free accounts (Firebase and GitHub) to actually go live. Both are covered
below.

## What's built

- **Sign in / create account screen** — the whole site requires a real
  account (email + password). Your data follows you to any device.
- **Main page** — top 10 leaderboard by total points, plus a "Race to 100"
  XP bar showing everyone's progress toward 100 points.
- **Profile icon (top left)** — links to the account page.
- **Notification bell (top left, next to profile)** — badge shows unread
  count. Click it to see who's overtaken you and on which leaderboard.
- **Account page** — your username (click it to rename yourself), total
  points, current ranking, and a card for every personal best you've logged.
- **Log Lift tab** — dropdown of all 16 exercises. Weight-type lifts ask
  for weight *and* reps (1–12) and rank by total volume — see "Regular
  lifts: volume, not just weight" below. Optional photo/video attachment
  (filename only, shown as a label — see below).
- **Log PR tab** — a separate, simpler form for true 1-rep maxes on just
  4 exercises (bench press, deadlift, leg press, squat) — see "PR
  leaderboards" below.
- **Leaderboards tab** — a gold-bordered "PR's" box at the top with the 4
  PR boards, then the big white "LEADERBOARD" banner and a grid of boxes
  for all 16 regular lifts (each with a bundled icon by default, or your
  own photo if you add one), each showing a 🔥 streak tag if someone's
  holding #1. Click a box to see that lift's top 10, with the streak
  badge next to whoever's in first and a proof filename tag on rows
  that attached one.
- **Clickable usernames** — click anyone's name on the main leaderboard
  or an exercise leaderboard to see their public profile: photo,
  ranking, total points, and every lift they've logged, compiled in one
  place. Clicking your own name takes you to your editable account page
  instead.
- **Admin delete** — whoever's signed in with the email set in
  `ADMIN_CONFIG` can remove a fake submission from any exercise page.

## How the points system works

Every night, for **every one of the 16 exercise leaderboards** (plus
the 4 PR boards, worth double — see below):
- 1st place → **+5 points**
- 2nd place → **+3 points**
- 3rd place → **+1 point**
- everyone else → nothing

These banked points (not the raw weight/reps/time) rank the front-page
leaderboard and the Race to 100 bar. First to **100 points** wins.

**Why it's not exactly midnight:** there's still no server running while
everyone's asleep, so the instant *anyone* opens the site, it checks how
many calendar days have passed and catches up on all of them at once —
same result, just not instant at 00:00. Since it's now a shared database,
if two friends happen to open the site in the same second, a Firestore
transaction makes sure only one of them actually applies the catch-up.
Values live in `PLACE_POINTS` near the top of `js/data.js`.

**A real bug this had, now fixed:** the nightly job used to award points
to everyone's top-3 finishes in one atomic batch — but the security
rules only allowed writing to *your own* points field, so the instant
that batch touched anyone else's, Firestore rejected the whole thing
silently, including your own points. The rules above now include a
specific "anyone signed in may increase, but never decrease, someone
else's points" line to fix this — that's the piece that was actually
missing.

**Testing without waiting a day:** the account page has a "Force run
tonight's points now" button, visible only to you as admin. It instantly
awards points/streaks based on whoever's currently leading each
exercise, rather than making you wait for a real midnight — handy for
confirming everything's wired up correctly. Don't click it more than
once on the same real day, since each click awards one full night's
points based on the standings at that moment.

## Regular lifts: volume, not just weight

For every weight-type exercise's *regular* leaderboard (Log Lift tab),
you now enter both a weight and a rep count (1–12). Rankings go by
**total volume** — weight × reps — not raw weight, so 40kg for 12 reps
(480kg volume) beats 50kg for 5 reps (250kg volume). The leaderboard
shows this as `40x12` next to your name rather than a single number, so
it's clear what the actual set was. Logging a new set only counts as a
personal best if its *volume* beats your current one.

## PR leaderboards

Separate from all of that, 4 exercises — bench press, deadlift, leg
press, and squat — also have a genuine 1-rep-max leaderboard, logged
through the **Log PR** tab. No reps field, no volume math, just the
heaviest single rep you've done. These live in their own gold-bordered
box at the top of the Leaderboards tab, and are tracked completely
separately from that same exercise's regular (volume-based) board —
your bench press PR and your regular bench press leaderboard position
are two unrelated things.

PR boards are worth **double points** on the nightly job (10/6/2
instead of 5/3/1) and have their own independent streaks, since holding
#1 on a PR board is a different achievement from holding #1 on the
regular one.

## Streaks & notifications

Whoever's #1 on an exercise keeps a running streak of consecutive nights
held — shown as a 🔥 badge on the leaderboard tiles and exercise pages.
Whenever a lift pushes someone else down the rankings (any position, not
just top 3), they get a notification under the bell icon.

## What changed to make this shared

Previously every browser had its own private copy of the data in
`localStorage`. Now `js/data.js` talks to **Firebase Firestore** — a free
real database — so a friend on their phone and you on your laptop see the
exact same leaderboard. Nothing else changed: same function names, same
pages, same look. You need to do two things before it works:

1. Create a free Firebase project and paste its config into
   `js/firebase-config.js` (steps below).
2. Publish the folder somewhere public, e.g. GitHub Pages (steps below).

Until step 1 is done, every page shows a plain message saying so instead
of a broken blank page.

### Setting up Firebase

1. Go to **console.firebase.google.com**, sign in with a Google account,
   click **Add project**, give it a name (e.g. "chuds"), and you can
   decline Google Analytics — you don't need it.
2. In the project, go to the left sidebar → **Databases & Storage → Firestore**
   → click **Create database**. Pick a location close to you (e.g. a
   European region if you're in the UK) — this can't be changed later,
   but it won't matter much at this scale. Choose **Start in test mode**
   for now (you'll paste stricter rules next).
3. Click the **Rules** tab and replace everything with the rules block
   below, then **Publish** — but first replace `ADMIN_EMAIL_REPLACE_ME`
   in the block with your own email (whatever you'll sign up to the site
   with):

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId} {
         allow read: if true;

         // You can always fully write to your own document (logging
         // lifts, changing your username, updating your photo, etc.)
         allow write: if request.auth != null && request.auth.uid == userId
                      && request.resource.data.keys().hasOnly(['username','lifts','prLifts','points','notifications','photoUrl'])
                      && request.resource.data.username is string
                      && request.resource.data.username.size() <= 24
                      && request.resource.data.points is number
                      && (!('photoUrl' in request.resource.data) || request.resource.data.photoUrl == null
                          || (request.resource.data.photoUrl is string && request.resource.data.photoUrl.size() < 300000));

         // Anyone else who's signed in may ONLY add to your
         // notifications list (this is how "you got overtaken" alerts
         // reach you).
         allow update: if request.auth != null && request.auth.uid != userId
                       && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['notifications']);

         // Anyone signed in may INCREASE (never decrease) someone else's
         // points — this is how the nightly points job credits OTHER
         // people's top-3 finishes, since whoever happens to have the
         // site open when a new day starts is the one whose browser
         // actually runs the catch-up job.
         allow update: if request.auth != null
                       && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['points'])
                       && request.resource.data.points is number
                       && request.resource.data.points > resource.data.points;

         // Only the site admin may remove a lift from someone else's
         // profile — either the regular board (lifts) or a PR board
         // (prLifts) — used to delete fake submissions. .lower() makes
         // the email match regardless of how it was capitalized at
         // sign-up.
         allow update: if request.auth != null
                       && request.auth.token.email.lower() == 'ADMIN_EMAIL_REPLACE_ME'
                       && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['lifts', 'prLifts']);
       }
       match /streaks/{exerciseId} {
         allow read: if true;
         allow write: if request.auth != null;
       }
       match /meta/{docId} {
         allow read: if true;
         allow write: if request.auth != null;
       }
     }
   }
   ```

   **What changed from before:** rather than "anyone signed in can write
   anything", this now properly separates three cases — you editing your
   own profile, anyone posting an overtake notification to someone else
   (but nothing more), and only the admin removing a lift from someone
   else's profile. `request.auth.uid` and `request.auth.token.email`
   can't be faked by a client — Firebase verifies both server-side, not
   something the person types in.
4. Click **Build → Authentication** (or **Authentication** directly in
   the left sidebar) → **Get started** → choose **Email/Password** from
   the list of sign-in providers → toggle it **Enable** → **Save**. This
   is what lets people actually create accounts.
5. Go to **Project settings** (gear icon, top left) → scroll to
   **Your apps** → click the **`</>`** (web) icon → give the app any
   nickname → **Register app**. Firebase shows you a config object with
   `apiKey`, `authDomain`, `projectId`, etc.
6. Open `js/firebase-config.js` in this folder:
   - Replace each `"REPLACE_ME"` under `FIREBASE_CONFIG` with the
     matching value Firebase gave you.
   - Replace `"ADMIN_EMAIL_REPLACE_ME"` under `ADMIN_CONFIG` with the
     **same email** you used in the Rules above. This is what shows you
     (and only you) the delete button on leaderboard pages.

That's it for Firestore — open `index.html` (via a local server, see
below) and the site now reads/writes real shared data.

**Note for anyone curious about security:** those config values are
meant to be public — Firebase is designed so this file can safely sit in
a public repo. The Rules you set in step 3 are what actually control
access, not secrecy of the config.

**On proof uploads:** Firebase Storage (which would let people upload a
real, viewable photo/video as proof) was deliberately skipped for now —
since February 2026 it requires linking a billing card to Google even
to stay within the free tier, and that wasn't a trade-off worth making
yet. Proof is filename-only for the moment (see below). If that ever
changes, the code marks exactly where to add real uploads back in.

### Trying it locally before publishing

```
python3 -m http.server 8000
```

then open `http://localhost:8000`.

## Adding the leaderboard photos

The leaderboard tiles already ship with original vector icons I made
for each exercise (in `assets/img/*.svg`) so the tiles don't look empty
out of the box. To swap in a real photo, drop a `.jpg` into
`assets/img/` named to match the exercise ID, e.g.
`assets/img/bench-press.jpg` — the site automatically prefers a real
photo over the bundled icon whenever one exists, no code changes
needed. IDs are listed in the `EXERCISES` array in `js/data.js`.

## Publishing on GitHub Pages

You said you're fine with the source code being public, which makes this
the simplest free option — no separate hosting account needed beyond
GitHub itself.

1. Create a free account at **github.com** if you don't have one.
2. Click the **+** top right → **New repository**. Name it `chuds`,
   leave it **Public**, create it.
3. On the repo page, click **uploading an existing file** and drag in
   everything from this folder — `index.html`, `css/`, `js/` (including
   your now-filled-in `firebase-config.js`), `assets/`, `README.md`.
   Commit.
4. Go to the repo's **Settings → Pages**. Under "Build and deployment",
   set Source to **Deploy from a branch**, pick **main** and the **root**
   folder, Save.
5. Within a minute or two you'll get a live link like
   `yourname.github.io/chuds`. That's the address to send to friends —
   and to anyone else who stumbles onto it, since it's genuinely public.
6. Only you can push changes to the repo unless you add someone under
   **Settings → Collaborators**. To update the site later, upload changed
   files the same way, or use `git push` if you're comfortable with git.

Since Firebase runs entirely from the browser, this GitHub Pages step
doesn't change regardless of the backend — the site calls Google's
servers directly, no matter where the static files themselves are hosted.

## Accounts & logging in

Everyone now needs a real account to use the site — the whole thing
(including just viewing the leaderboard) sits behind a sign in / create
account screen. Creating an account only needs an email and a password
(6+ characters); there's no email verification step, so people are
signed in immediately. Their chosen username, points, lifts, and
notifications are attached to that account and follow them to any
device or browser they log into. There's a **Sign out** button at the
bottom of the account page.

If you'd rather let people *view* the leaderboard without an account
and only require sign-in to log a lift or see your own profile, that's
a reasonable alternative — just ask and it can be changed; right now
every page requires being signed in, for simplicity.

## Profile photos

Click your avatar circle on the account page to upload a photo. It
shows up there, in the top bar, and next to your name on every
leaderboard. This deliberately avoids Firebase Storage (and its billing
card requirement) by shrinking the photo down to 160×160 pixels and
compressing it right in the browser before saving it as a small text
field on your profile — same free Firestore database as everything
else, no new setup needed.

**Worth knowing:** because this field lives on every user's profile, it
gets downloaded along with everyone else's data on every leaderboard
page load — not just when a photo is actually shown. That's exactly why
it's kept small (typically a few KB per photo); at friend-group scale
this is a non-issue, but it's not designed to hold a huge, high-quality
photo, and there isn't a hard ceiling stopping someone from uploading a
low-quality but large image if they bypassed the app's own resizing —
the 300,000-character size check in the rules is there as a backstop.

## Proof photos/videos

Attaching proof when logging a lift is **optional** — if someone can't
attach a video or photo, they can still submit the lift. Right now only
the **filename** is saved as a small label next to that entry on the
leaderboard (e.g. "📎 bench_pr.mp4") — the actual file never leaves the
uploader's device, so there's nothing to click or watch yet. Real
viewable uploads would need Firebase Storage, skipped for now for the
billing-card reason above; happy to revisit if that trade-off changes.

## Removing a fake submission (admin only)

There's no review queue — lifts go live the moment they're logged, and
fake ones get dealt with after the fact instead. If you're signed in
with the email you set as `ADMIN_CONFIG.email` in `js/firebase-config.js`
(and matched in the security rules above), you'll see a small **✕**
button next to every row on an exercise's leaderboard page. Click it,
confirm, and that specific lift is removed — the rest of that person's
lifts on other exercises are untouched.

**Worth knowing:** deleting a lift removes it from the leaderboard and
stops it earning further nightly points from that point on, but it
doesn't claw back points already banked on previous nights while the
fake entry was sitting in the top 3 — there's no historical ledger to
reverse that against. In practice this means: the sooner a fake
submission gets spotted and removed, the less it can have already
banked. If exact retroactive point correction ever matters, that would
need a bigger change (recording *why* each point was awarded, not just
the running total) — possible, just not built now.
