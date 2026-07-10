# Vani & Ivy Expense App

Static expense tracker with a Netlify frontend/API and a Neon PostgreSQL database.

## Current Architecture

- Frontend: Netlify
- API: Netlify Functions
- Database: Neon
- Source control: GitHub

## Local Data Model

The main table is `transactions` with these fields:

- `id`
- `payer`
- `category`
- `description`
- `amount`
- `date`

See `db/schema.sql` for the SQL schema.

## Deploy On Netlify

1. Create or open a Netlify site for this repo.
2. Set the publish directory to the repo root.
3. Set the functions directory to `netlify/functions`.
4. Add the `DATABASE_URL` environment variable from Neon.
5. Run the SQL in `db/schema.sql` on your Neon database.
6. Deploy the site.

## API

The frontend calls `GET`, `POST`, `PATCH`, and `DELETE` on `/api/transactions`.

## Notes

- The app still keeps local cache in the browser to speed up reloads.
- Google Sheets / Apps Script is no longer the live backend.
