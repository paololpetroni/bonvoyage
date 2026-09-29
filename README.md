# Bonvoyage

Trip planning built on ratings from real travelers.

This is **Phase 1** of the roadmap: the app shell, accounts, the database and an empty Community tab.
Phase 1 is done when you can sign up, sign in, and see the Community tab (empty until Phase 2 imports Montreal).

## What's in here

| Path | What it is |
| --- | --- |
| `src/` | The app (React, built with Vite) |
| `src/pages/` | Plan a trip, Community, Sign in, Profile, Privacy |
| `src/lib/categories.js` | Rating scales and flavor/style tags for every category |
| `supabase/schema.sql` | Full database setup for a brand-new Supabase project (includes every update) |
| `supabase/002_place_search.sql` | Update 2: adding places from search, listing places in any city |
| `supabase/003_ratings.sql` | Update 3: rating checks and community breakdown |
| `supabase/004_photos.sql` | Update 4: photo storage and rules |
| `src/lib/photon.js` | Place search (Photon, built on OpenStreetMap) and sorting results into categories |
| `prototypes/` | The Community prototype. Put `bonvoyage.html` (the trip wizard prototype) here too |
| `.env.example` | Template for your two Supabase settings |

## One-time setup

You need three free accounts: GitHub (stores the code), Supabase (database and sign-in) and Vercel (hosts the site).

### 1. Install the tools

- **Node.js 22 LTS** from nodejs.org. Check in a terminal: `node -v` should print v22 or higher.
- **Git** from git-scm.com (on a Mac it's already there: run `git --version`).
- A code editor. VS Code is the usual choice.

### 2. Put the code on GitHub

1. Create a GitHub account and a new **private** repository called `bonvoyage`. Don't add a README (this project has one).
2. In a terminal, inside this folder:

```bash
git init
git add .
git commit -m "Phase 1: app shell, accounts, database"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/bonvoyage.git
git push -u origin main
```

### 3. Create the Supabase project

1. Sign up at supabase.com and create a new project called `bonvoyage`.
   - **Region: Canada (Central).** This keeps user data in Canada, which matters for Quebec's privacy law.
   - Save the database password somewhere safe. The app doesn't need it, but you will later.
2. Open **SQL Editor**, click **New query**, paste all of `supabase/schema.sql`, and click **Run**. It should say "Success. No rows returned".
3. Open **Project Settings > API Keys**. Copy the **Project URL** and the **publishable key** (starts with `sb_publishable_`).
   Never copy the secret key into the app.
4. Open **Authentication > Sign In / Providers > Email**:
   - While you're testing alone, turn **Confirm email** off. Supabase's built-in email only sends to members of your
     Supabase team and only a couple of messages per hour, so confirmation emails to friends won't arrive.
   - Before inviting testers, set up custom email sending (Authentication > Emails > SMTP settings) and turn it back on.
5. Open **Authentication > URL Configuration**. Set **Site URL** to `http://localhost:5173` for now and add
   `http://localhost:5173/**` to **Redirect URLs**.

### 4. Run it on your computer

```bash
cp .env.example .env.local     # on Windows: copy .env.example .env.local
```

Open `.env.local`, paste the Project URL and publishable key, then:

```bash
npm install
npm run dev
```

Open http://localhost:5173.

### 5. Check Phase 1 is done

- [ ] **Sign in > Create an account** with your email and a password. You land on your profile.
- [ ] Change your display name and click **Save**. Reload: it's still there.
- [ ] **Community** loads and says there are no places yet (no error box).
- [ ] **Sign out**, then sign back in.
- [ ] **Download my data** gives you a file with your profile.
- [ ] In Supabase, **Table Editor > profiles** shows one row for your account.

### 6. Put it online with Vercel

1. Sign up at vercel.com with your GitHub account, click **Add New > Project**, and import `bonvoyage`.
2. Under **Environment Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` with the same values as `.env.local`.
3. Click **Deploy**. You get an address like `bonvoyage-abc.vercel.app`.
4. Back in Supabase **Authentication > URL Configuration**: set **Site URL** to that address and add
   `https://YOUR-ADDRESS.vercel.app/**` to **Redirect URLs**.

From now on, every `git push` to `main` updates the live site automatically.

## Optional: Google sign-in

The button is there but won't work until you connect it. In Google Cloud Console, create an OAuth client
(type: Web application), add the callback URL shown in Supabase under **Authentication > Sign In / Providers > Google**,
then paste the Google client ID and secret into that Supabase page. Supabase's docs walk through it.

## Before anyone else uses it

- Fill in the two placeholders at the top of `src/pages/Privacy.jsx` (who's responsible and a contact email).
- Resolve the bracketed note in the "Where it is stored" section of the privacy policy.
- Have someone who knows Quebec privacy law read the policy. It's a starting draft, not legal advice.
- Set up custom email sending (step 3.4).

## How the security rules work

Row-level security is on for every table, so the rules hold even though the key is in the browser:

- You can read and edit only your own profile.
- Everyone sees approved places. Places people suggest stay pending until reviewed.
- Individual ratings are private. You see and manage only your own; everyone else sees combined scores through
  `get_place_scores`.
- One rating per place per account, in half-star steps from 1 to 5.
- **Delete my account** removes the account, profile and ratings.
