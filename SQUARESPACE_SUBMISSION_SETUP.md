# Add the DJ Submission Page to Squarespace

The submission form remains hosted by the DJ Database Railway service. Squarespace displays it through a responsive iframe, so submissions continue to use the existing `/api/submissions` endpoint and approval queue.

## 1. Deploy the updated DJ Database

Deploy the included application changes to the existing Railway service.

After deployment, confirm that this address opens the form:

```text
https://YOUR-DJ-DATABASE-DOMAIN.up.railway.app/submit
```

Use the public Railway domain assigned to the DJ Database service, not the MongoDB service domain.

## 2. Prepare the Squarespace embed code

Open:

```text
squarespace/dj-submission-code-block.html
```

Replace this value once:

```text
https://YOUR-DJ-DATABASE-DOMAIN.up.railway.app
```

with the exact public Railway domain for the DJ Database.

Do not remove `/submit?embed=1`; the embed parameter activates the Squarespace-specific layout and automatic height reporting.

## 3. Create the Squarespace page

1. Open the Squarespace site editor.
2. Open **Pages**.
3. Add a new blank page, such as **DJ Submission**.
4. Edit the page and add a **Code** block.
5. Set the Code block type to **HTML** and disable **Display Source** if that option appears.
6. Paste the complete contents of `squarespace/dj-submission-code-block.html` into the block.
7. Stretch the Code block to the full available page width.
8. Save the page and test it from the published site.

Squarespace Core supports JavaScript and iframe content inside Code blocks. No site-wide Code Injection is required.

## 4. Test the complete workflow

1. Submit a test profile from the Squarespace page.
2. Open the private DJ Database.
3. Confirm the test entry appears in the **Profile Approval Queue**.
4. Approve or reject the entry.
5. Delete the test DJ profile afterward if it was approved only for testing.

## Troubleshooting

### The iframe says it was blocked

Confirm the latest `server/server.js` was deployed. Its Content Security Policy permits embedding from:

- `xodiamediagroup.com`
- `www.xodiamediagroup.com`
- Squarespace editor and preview domains

### The page is blank

Confirm the Railway service is running and that the domain in the Code block begins with `https://` and contains no path after `.app`.

### The form is cut off

Publish or refresh the Squarespace page. The live embed automatically adjusts its height from messages sent by the form. The initial minimum height is only a fallback while the form loads.

### The form works directly but not in Squarespace preview

Publish the page and test the public URL. Squarespace's editor can delay or restrict custom JavaScript previews even when the published Code block works correctly.
