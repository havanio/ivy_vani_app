# Vani & Ivy Expense App

Static GitHub Pages app for tracking shared expenses.

## Enable Edit/Delete

The frontend has edit/delete buttons, but they need the Google Apps Script backend in this repo.

To enable them:

1. Open your Google Apps Script project.
2. Replace the script code with `apps-script/Code.gs` from this repo.
3. Deploy a new web app version.
4. Keep the same access setting you already use.
5. Refresh the app.

After the updated script is deployed:

- Edit/delete buttons become active.
- Budget limits stay in `script.js`, so you can change them in code when needed.
