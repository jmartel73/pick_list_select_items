# NetSuite — Sales Order Pick List (Select Items)

Adds a **Print Pick List** button to Sales Orders. Clicking it opens a screen
listing every item line on the order, each with a checkbox (plus **Mark All /
Unmark All**). After selecting lines and clicking **Print Pick List**, a PDF
pick list is generated containing **only the checked lines** — unchecked lines
are left off the printout.

## How it works

| File | Script Type | Purpose |
|------|-------------|---------|
| `src/pick_list_button_ue.js` | User Event (beforeLoad) | Adds the **Print Pick List** button to the Sales Order in view mode |
| `src/pick_list_button_cs.js` | Client Script | Handles the button click and opens the Suitelet in a new tab |
| `src/pick_list_suitelet.js` | Suitelet | GET: line-selection screen with checkboxes; POST: renders the PDF of the selected lines |

Flow:

1. On a Sales Order (view mode), click **Print Pick List**.
2. A Suitelet page opens showing all item lines (description, subtotal,
   discount, tax, and shipping lines are automatically excluded). All lines
   start checked; use **Mark All** / **Unmark All** or individual checkboxes.
3. Click **Print Pick List** on the Suitelet. A PDF opens inline with only the
   selected lines, including a "Picked" write-in box per line for warehouse use.

## Installation

### 1. Upload the script files

Go to **Documents > Files > SuiteScripts** (or a subfolder) and upload all
three files from `src/`. **Upload them into the same folder** — the User Event
script references the client script by relative path (`./pick_list_button_cs.js`).

### 2. Create the Suitelet script record

**Customization > Scripting > Scripts > New**, select `pick_list_suitelet.js`.

- Name: `Pick List Suitelet`
- **ID: `_pick_list_sl`** (becomes `customscript_pick_list_sl` — must match exactly)

Deploy it:

- **ID: `_pick_list_sl`** (becomes `customdeploy_pick_list_sl` — must match exactly)
- Status: **Released**
- Audience: the roles/employees who should be able to print pick lists

> The script and deployment IDs are referenced by `pick_list_button_cs.js`
> (`url.resolveScript`). If you use different IDs, update them there.

### 3. Create the User Event script record

**Customization > Scripting > Scripts > New**, select `pick_list_button_ue.js`.

- Name: `Pick List Button UE`
- ID: `_pick_list_button_ue` (suggested)

Deploy it:

- Applies To: **Sales Order**
- Status: **Released**
- Event Type: leave blank (the script itself limits the button to view mode)

> `pick_list_button_cs.js` does **not** get its own script record — it is
> attached automatically by the User Event script.

### 4. Test

Open any Sales Order in view mode. You should see the **Print Pick List**
button. Click it, adjust the checkboxes, and submit to get the PDF.

## Customizing

- **Columns on the selection screen / PDF**: edit the sublist fields in
  `renderSelectionForm` and the row/column markup in `buildPickListXml`
  (both in `src/pick_list_suitelet.js`).
- **Which line types are excluded**: edit `NON_PICK_ITEM_TYPES` in
  `src/pick_list_suitelet.js`.
- **Default check state**: lines default to checked; change
  `setVal('custpage_select', 'T')` to `'F'` to start unchecked.
