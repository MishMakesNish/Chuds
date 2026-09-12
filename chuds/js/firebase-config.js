/* =========================================================================
   CHUDS — firebase-config.js
   -------------------------------------------------------------------------
   Paste in the values from YOUR Firebase project here. Get them from:
   Firebase console → your project → Project settings (gear icon) →
   General tab → "Your apps" → the web app (the </> icon) → the config
   object shown under "SDK setup and configuration".

   None of these values are secret. Firebase is deliberately designed so
   this config can be public — access to your data is controlled by the
   Firestore security rules you set in the console, not by hiding these
   values. That's exactly why it's fine for this file to sit in a public
   GitHub repo. See README.md for the full setup walkthrough.
   ========================================================================= */

const FIREBASE_CONFIG = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.appspot.com",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME",
};

/* -------------------------------------------------------------------------
   ADMIN_CONFIG — the one email address allowed to delete other people's
   lift submissions (for removing fake ones). Set this to whatever email
   YOU sign up to the site with. This must match exactly what's typed
   into the security rules too (see README) — the rules are what actually
   enforce this; this value just controls whether the site shows you the
   delete button in the first place.
   ------------------------------------------------------------------------- */
const ADMIN_CONFIG = {
  email: "ADMIN_EMAIL_REPLACE_ME",
};
