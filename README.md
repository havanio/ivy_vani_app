# Vani & Ivy Expense App

Static GitHub Pages app for tracking shared expenses.

## Enable Edit/Delete

The frontend already has edit/delete buttons, but they stay disabled until the Google Apps Script backend supports row updates.

To enable them:

1. Open your Google Apps Script project.
2. Replace the script code with `apps-script/Code.gs` from this repo.
3. Deploy a new web app version.
4. Keep the same access setting you already use.
5. Refresh the app.

Budget editing works immediately in the browser and is saved with `localStorage`.
