# specs. — glasses try-on app (PHP + MySQL)

Upload a selfie and a photo of glasses, crop them, and see the glasses composited onto your
face — with per-user accounts so everyone's photos stay private to them.

## What's in here

```
index.php              the app shell (one page, JS drives the UI)
config.php.example      copy to config.php and fill in your database details (shared hosting only)
schema.sql               run this once to create the database tables
Dockerfile               used by Railway/Render/Fly.io/etc — not needed for shared hosting
.htaccess, .user.ini     server config (upload limits, blocking direct access to PHP internals)
includes/                PHP: database connection, session/auth helpers, upload handling
api/                      PHP: JSON endpoints the front-end calls (register, login, CRUD, image serving)
assets/                   CSS and the front-end JS (all the editing/cropping/compositing logic)
storage/uploads/          where uploaded photos are actually stored (never served directly)
```

## How it's built

Cropping, face/glasses detection, background removal, and compositing all happen **in the
browser** with the HTML canvas — that part needs to be interactive (you're dragging a crop box,
tapping a lens, dragging glasses into position), and a browser can do that instantly where a
server round-trip per adjustment would feel sluggish. PHP's job is everything that needs to
persist and be private: accounts, sessions, and storing/serving the finished images tied to
whichever user made them. Each photo is saved with a random filename and can only be fetched by
its owner (checked against the logged-in session on every request).

Config comes from either environment variables (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`,
`DB_PASS` — used on Railway) or a `config.php` file (used on shared hosting). The app checks for
`DB_HOST` first and falls back to `config.php` if it's not set, so the same codebase deploys
cleanly either way without editing PHP.

## Deploying to Railway (GitHub → Docker → MySQL)

1. **Push this folder to a GitHub repo.** From inside it:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```
   `.gitignore` already keeps `config.php` and any uploaded photos out of the repo, so there's
   nothing sensitive to accidentally commit.

2. **Create a Railway project from that repo.** In the Railway dashboard: *New Project* → *Deploy
   from GitHub repo* → pick your repo. Railway will find the `Dockerfile` in this folder
   automatically and build from it — no other configuration needed for the build itself.

3. **Add a MySQL database.** In the same project: *New* → *Database* → *MySQL*. Railway
   provisions it and exposes its credentials as variables on that MySQL service (`MYSQLHOST`,
   `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE`).

4. **Import the schema.** Open the MySQL service's *Connect* tab for connection details, then run
   `schema.sql` against it with any MySQL client (e.g. `mysql -h HOST -P PORT -u USER -p DATABASE
   < schema.sql`, or point a GUI tool like TablePlus/DBeaver at those same details).

5. **Wire the two services together.** Open your **web service's** *Variables* tab (not the MySQL
   service) and add:
   ```
   DB_HOST=${{MySQL.MYSQLHOST}}
   DB_PORT=${{MySQL.MYSQLPORT}}
   DB_NAME=${{MySQL.MYSQLDATABASE}}
   DB_USER=${{MySQL.MYSQLUSER}}
   DB_PASS=${{MySQL.MYSQLPASSWORD}}
   ```
   The `${{MySQL.___}}` syntax is Railway's way of referencing another service's variables, so
   these stay correct automatically if the database's own credentials ever change. You do **not**
   need a `config.php` file for this — the app picks up `DB_HOST` and uses these directly.

6. **Add a Volume for uploaded photos.** This is the one easy step to miss: without it, every
   redeploy wipes out everyone's saved selfies, glasses, and try-on results, because a fresh
   container starts with an empty filesystem. On your web service: *Settings* → *Volumes* → add
   one mounted at `/var/www/html/storage/uploads`.

7. **Generate a domain.** Web service → *Settings* → *Networking* → *Generate Domain* (or attach
   your own custom domain there instead).

8. **Visit the domain and register an account.** That's it.

A couple of things worth knowing about this setup:
- **Sessions are file-based and stored on the container's own disk**, which is fine as long as
  you're running a single instance (Railway's default). If you ever scale this service to
  multiple replicas, logins would need to move to database-backed sessions instead, since each
  replica wouldn't see the others' session files.
- **Redeploys rebuild the container** but the Volume persists across them, so uploaded photos
  survive; the database is a separate persistent service either way.

## Deploying elsewhere (traditional shared hosting)

Most shared hosting (cPanel, Plesk, etc.) works the same way for this:

1. **Upload the files.** Copy everything in this folder to your hosting account's web root
   (often called `public_html` or `www`), keeping the folder structure intact.

2. **Create a database.** In your host's control panel, create a new MySQL/MariaDB database and
   a database user with full access to it. Note the database name, username, password, and host
   (usually `localhost`).

3. **Import the schema.** Open phpMyAdmin (or similar), select your new database, go to
   *Import*, and upload `schema.sql`. Or from a terminal if you have SSH access:
   ```
   mysql -u YOUR_DB_USER -p YOUR_DB_NAME < schema.sql
   ```

4. **Configure the app.** Rename `config.php.example` to `config.php` and fill in the database
   details from step 2.

5. **Make sure storage is writable.** `storage/uploads/` needs to be writable by the web server
   (PHP will create subfolders itself the first time each is needed — on most hosts the default
   permissions already allow this; if uploads fail, try setting `storage/` to permissions 755 or
   775 via your file manager).

6. **Visit your site and register an account.** That's it — you can now add selfies, add
   glasses, and try them on.

If your host uses Nginx instead of Apache, the `.htaccess` files won't do anything — ask your
host (or add manually) to block direct web access to `config.php`, `schema.sql`, `includes/`,
and `storage/`, since those aren't meant to be requested directly.

## About the background-removal fixes

Two rounds of fixes went into the cutout logic behind "Remove background":

- **Glasses nearly disappearing.** The original version compared each pixel only to its
  immediate neighbor, so on any gradient (lens reflections, soft shadows) the "this is
  background" classification could drift step by step deep into the glasses themselves.
- **The fix for that made it too weak.** Requiring each pixel to also be a smooth step from its
  removed neighbor stopped the drift, but meant a single noisy pixel (a JPEG artifact, a faint
  shadow) could block the fill from ever reaching real background just past it — leaving little
  islands you'd have to clear by hand.

The current version classifies every pixel independently against a background color sampled from
the photo's edges — nothing chains from pixel to pixel, so there's nothing left to drift along —
then does a quick pass to bridge tiny 1px gaps in that classification before flood-filling from
the border. That's both safer against the original bug and noticeably more thorough. There's also
a manual fallback in the "Lens type" screen — **Keep more of photo** / **Remove more
background** — for the rare photo that still needs a nudge either way.

## Notes and things you may want to add later

- **No password reset or email verification** is included — this needs an SMTP setup (or a
  transactional email service) that varies by host, so it's left out. Registration and login with
  hashed passwords, session-based auth, CSRF protection, and a login lockout after repeated failed
  attempts are all in place.
- **Use HTTPS in production.** Session cookies are marked `Secure` automatically once your site is
  served over HTTPS — Railway domains get this for free automatically; on shared hosting, check
  for "SSL/TLS" or "Let's Encrypt" in your control panel.
- Uploaded image size is capped at 8MB per photo by default (`max_upload_bytes` in `config.php`,
  or the `MAX_UPLOAD_BYTES` environment variable on Railway); `.user.ini` raises PHP's own upload
  limits to match on shared hosts that honor per-directory overrides.
