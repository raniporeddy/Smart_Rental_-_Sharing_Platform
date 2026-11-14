# Smart Rental & Sharing Platform

## Phase 1 layout

```text
ai/                 AI and ML modules
backend/blueprints/ Flask REST API route modules
backend/tests/      Backend verification suite
database/           MySQL schema and seed scripts
frontend/           Vite and React application
uploads/            Local development upload storage
requirements.txt    Python dependencies
```

## Database initialization

Use MySQL 8.0 or newer. From the repository root, apply the schema before the seed data:

```sh
mysql -u <mysql-user> -p < database/schema.sql
mysql -u <mysql-user> -p < database/seed.sql
```

The scripts create the `smart_rental_sharing` database, six top-level categories, 25 subcategories, pricing priors, and platform policies. Configure credentials through environment variables; do not commit secrets.

Install the Python dependencies in a virtual environment with `python -m pip install -r requirements.txt`.

## Flask API (Phase 2)

Copy `backend/.env.example` to `.env` and set a unique `DATABASE_URL` and a long random `JWT_SECRET_KEY`. For a database created from the original Phase 1 schema, apply `database/migrations/001_phase2_backend.sql`, `database/migrations/002_ai_engine.sql`, and `database/migrations/003_frontend_support.sql`, once each in order. A fresh database should use the updated `database/schema.sql` and `database/seed.sql` and does not need those migrations.

Start the API from the repository root with `python -m backend.run`. The API listens on port 5000 by default; configure `PORT`, `CORS_ORIGINS`, `MAX_UPLOAD_BYTES`, and reset-token delivery through environment variables as needed. Reset tokens are returned only for the configured simulation delivery mode; a production email/SMS provider is not included.

Routes are grouped under `/api/auth`, `/api/users`, `/api/products`, `/api/bookings`, `/api/payments`, `/api/notifications`, `/api/reviews`, `/api/complaints`, `/api/admin`, and `/api/ai`. Use a bearer access token for protected routes. An initial administrator must be promoted directly in the database by a trusted operator (`UPDATE users SET role='admin' WHERE email='...';`); public registration never accepts a role.

## AI endpoints (Phase 3)

On startup, `backend/ai_engine.py` trains a small Random Forest pricing model and an Isolation Forest booking anomaly model from reproducible synthetic samples, seeded `category_pricing` data, and available listing averages. Authenticated owners can call `POST /api/ai/predict-price`; listing creation also runs the category price anomaly rule and sends flagged listings to admin notifications without banning the owner. Booking requests are scored for rapid-fire activity and appear under `/api/admin/suspicious-bookings` for review.

Use `POST /api/ai/classify-image` with multipart field `image`. MobileNetV2 inference is enabled when TensorFlow and a local ImageNet MobileNetV2 weights file are available; set `AI_MOBILENET_WEIGHTS` to that file. The offline fallback compares Pillow visual descriptors with previously uploaded platform listing photos and reports when there is not enough reference data for an automatic category. Product creation runs the same classifier on its first uploaded image; a confident match can supply a missing category.

`GET /api/ai/recommendations` uses TF-IDF product similarity, the signed-in user's booking and search history, and community booking/review signals; guests receive a trending fallback. `POST /api/ai/chat` is a retrieval assistant that reads live listing availability, current booking state, and `platform_policies` from MySQL. Policy text and late penalty multipliers should be reviewed for the operator's jurisdiction before deployment.

## Frontend (Phase 4)

The responsive React application lives in `frontend/`. It uses live Flask endpoints for search, listings, availability, bookings, simulated payment verification, reviews, saved items, notifications, AI recommendations/chat, and the user/owner/admin dashboards. Configure `VITE_API_URL` as the API base URL including `/api`.

### Windows PowerShell setup

From the repository root, initialize a fresh database and load the supplied categories and policy seed:

```powershell
cmd /c "mysql -u root -p < database\schema.sql"
cmd /c "mysql -u root -p < database\seed.sql"
```

For an existing Phase 1 database, apply the migrations instead, in order:

```powershell
cmd /c "mysql -u root -p smart_rental_sharing < database\migrations\001_phase2_backend.sql"
cmd /c "mysql -u root -p smart_rental_sharing < database\migrations\002_ai_engine.sql"
cmd /c "mysql -u root -p smart_rental_sharing < database\migrations\003_frontend_support.sql"
```

Create and configure the backend environment, then start Flask:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item backend/.env.example .env
notepad .env
python -m backend.run
```

Set `DATABASE_URL` to the MySQL account/database and replace `JWT_SECRET_KEY` in `.env` before starting the API. To create an administrator, first register that account, then run this trusted-operator SQL after replacing the email:

```sql
UPDATE users SET role='admin' WHERE email='admin@example.com';
```

In a second PowerShell terminal, install and run Vite:

```powershell
Set-Location frontend
Copy-Item .env.example .env
notepad .env
npm install
npm run dev
```

Set `VITE_API_URL=http://localhost:5000/api` in `frontend/.env`. Open the development URL printed by Vite (normally `http://localhost:5173`). Use `npm run build` to produce the deployable static bundle in `frontend/dist`.

## Production Deployment

### 1. Database: TiDB Cloud (Serverless or Dedicated)
1. Initialize the database schema and seed data on your TiDB Cloud cluster:
   ```sh
   mysql -u <user> -p -h <gateway-host> -P 4000 --ssl-mode=VERIFY_IDENTITY < database/schema.sql
   mysql -u <user> -p -h <gateway-host> -P 4000 --ssl-mode=VERIFY_IDENTITY < database/seed.sql
   ```
2. Your connection string format:
   ```text
   mysql+pymysql://<user>:<password>@<gateway-host>:4000/<database>?ssl_ca=/etc/ssl/certs/ca-certificates.crt
   ```
   *(On Windows for local tests, the app automatically maps the SSL CA to `certifi.where()`.)*

### 2. Backend: Render Web Service
1. Connect this repository to Render using Blueprint (`render.yaml`).
2. Set the following Environment Variables in the Render Dashboard:
   - `DATABASE_URL`: Your TiDB Cloud connection string (ensure `mysql+pymysql://` scheme).
   - `JWT_SECRET_KEY`: A secure random string (auto-generated if using `render.yaml`).
   - `CORS_ORIGINS`: Comma-separated allowed frontend domains (e.g. `https://your-frontend.vercel.app`). All `*.vercel.app` domains are automatically accepted by default.
3. Build command: `pip install -r requirements.txt`
4. Start command: `gunicorn backend.run:app`

### 3. Frontend: Vercel Web Deployment
1. Import the repository on Vercel.
2. Set **Root Directory** to `frontend`.
3. Set Environment Variable:
   - `VITE_API_URL`: `https://<your-render-backend-service>.onrender.com/api`
4. Single-Page Application routing is automatically handled by [`frontend/vercel.json`](frontend/vercel.json).

