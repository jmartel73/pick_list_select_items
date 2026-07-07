/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * Pick List Suitelet
 * ------------------
 * GET  : Shows all item lines of a Sales Order with a checkbox per line
 *        (with native Mark All / Unmark All buttons) plus print options.
 * POST : Renders a PDF pick list containing ONLY the checked lines.
 *
 * Expected deployment IDs (referenced by the client script):
 *   Script ID     : customscript_pick_list_sl
 *   Deployment ID : customdeploy_pick_list_sl
 */
define(['N/ui/serverWidget', 'N/record', 'N/render', 'N/format', 'N/error', 'N/search', 'N/config'],
    (serverWidget, record, render, format, error, search, config) => {

    const SUBLIST_ID = 'custpage_items';

    // Line types on the item sublist that are not physical items to pick
    const NON_PICK_ITEM_TYPES = [
        'Description', 'Subtotal', 'Discount', 'Markup',
        'EndGroup', 'TaxItem', 'ShipItem', 'Payment'
    ];

    const onRequest = (context) => {
        if (context.request.method === 'GET') {
            renderSelectionForm(context);
        } else {
            renderPickListPdf(context);
        }
    };

    /* --------------------------------------------------------------
     * GET — line selection screen
     * -------------------------------------------------------------- */
    const renderSelectionForm = (context) => {
        const soId = context.request.parameters.soid;
        if (!soId) {
            throw error.create({
                name: 'PICK_LIST_MISSING_PARAM',
                message: 'No Sales Order ID (soid) was provided to the Pick List Suitelet.'
            });
        }

        const so = record.load({
            type: record.Type.SALES_ORDER,
            id: soId
        });

        const form = serverWidget.createForm({
            title: 'Print Pick List — Sales Order #' + so.getValue({ fieldId: 'tranid' })
        });

        // Carry the Sales Order ID through to the POST
        const soIdField = form.addField({
            id: 'custpage_soid',
            type: serverWidget.FieldType.TEXT,
            label: 'Sales Order ID'
        });
        soIdField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        soIdField.defaultValue = String(soId);

        const info = form.addField({
            id: 'custpage_info',
            type: serverWidget.FieldType.INLINEHTML,
            label: ' '
        });
        info.defaultValue =
            '<p style="font-size:12px;">Check the lines to include on the pick list, ' +
            'then click <b>Print Pick List</b>. Unchecked lines are left off the printout.</p>';

        // ---- Print options -------------------------------------------------
        form.addFieldGroup({ id: 'custpage_grp_options', label: 'Print Options' });

        const optDesc = form.addField({
            id: 'custpage_opt_desc',
            type: serverWidget.FieldType.CHECKBOX,
            label: 'Print Item Descriptions',
            container: 'custpage_grp_options'
        });
        optDesc.defaultValue = 'T';

        const optDisp = form.addField({
            id: 'custpage_opt_disp',
            type: serverWidget.FieldType.CHECKBOX,
            label: 'Print Extended Item Names',
            container: 'custpage_grp_options'
        });
        optDisp.defaultValue = 'T';

        // ---- Item lines ----------------------------------------------------
        const sublist = form.addSublist({
            id: SUBLIST_ID,
            type: serverWidget.SublistType.LIST,
            label: 'Items'
        });

        // Adds native "Mark All" / "Unmark All" buttons
        sublist.addMarkAllButtons();

        sublist.addField({
            id: 'custpage_select',
            type: serverWidget.FieldType.CHECKBOX,
            label: 'Print'
        });
        const lineField = sublist.addField({
            id: 'custpage_line',
            type: serverWidget.FieldType.TEXT,
            label: 'Line'
        });
        lineField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        sublist.addField({
            id: 'custpage_item',
            type: serverWidget.FieldType.TEXT,
            label: 'Item'
        });
        sublist.addField({
            id: 'custpage_desc',
            type: serverWidget.FieldType.TEXT,
            label: 'Description'
        });
        sublist.addField({
            id: 'custpage_qty',
            type: serverWidget.FieldType.TEXT,
            label: 'Quantity'
        });
        sublist.addField({
            id: 'custpage_committed',
            type: serverWidget.FieldType.TEXT,
            label: 'Committed'
        });
        sublist.addField({
            id: 'custpage_units',
            type: serverWidget.FieldType.TEXT,
            label: 'Units'
        });
        sublist.addField({
            id: 'custpage_location',
            type: serverWidget.FieldType.TEXT,
            label: 'Location'
        });

        const lineCount = so.getLineCount({ sublistId: 'item' });
        let sublistLine = 0;

        for (let i = 0; i < lineCount; i++) {
            const itemType = so.getSublistValue({ sublistId: 'item', fieldId: 'itemtype', line: i });
            if (NON_PICK_ITEM_TYPES.indexOf(itemType) !== -1) {
                continue; // skip description/subtotal/discount/etc. lines
            }

            const setVal = (fieldId, value) => {
                // Sublist LIST fields reject empty values; only set when non-empty
                if (value !== null && value !== undefined && String(value) !== '') {
                    sublist.setSublistValue({
                        id: fieldId,
                        line: sublistLine,
                        value: String(value)
                    });
                }
            };

            setVal('custpage_select', 'T'); // default: everything checked
            setVal('custpage_line', i);
            setVal('custpage_item', cleanItemName(so.getSublistText({ sublistId: 'item', fieldId: 'item', line: i })));
            setVal('custpage_desc', getLineDescription(so, i));
            setVal('custpage_qty', so.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line: i }));
            setVal('custpage_committed', so.getSublistValue({ sublistId: 'item', fieldId: 'quantitycommitted', line: i }));
            setVal('custpage_units', so.getSublistText({ sublistId: 'item', fieldId: 'units', line: i }));
            setVal('custpage_location', so.getSublistText({ sublistId: 'item', fieldId: 'location', line: i }));

            sublistLine++;
        }

        form.addSubmitButton({ label: 'Print Pick List' });

        context.response.writePage(form);
    };

    /* --------------------------------------------------------------
     * POST — render the PDF for the checked lines only
     * -------------------------------------------------------------- */
    const renderPickListPdf = (context) => {
        const request = context.request;
        const soId = request.parameters.custpage_soid;

        const options = {
            printDescriptions: request.parameters.custpage_opt_desc === 'T',
            printExtNames: request.parameters.custpage_opt_disp === 'T'
        };

        const so = record.load({
            type: record.Type.SALES_ORDER,
            id: soId
        });

        // Collect the checked sublist lines
        const selectedLines = [];
        const lineCount = request.getLineCount({ group: SUBLIST_ID });

        for (let i = 0; i < lineCount; i++) {
            const checked = request.getSublistValue({
                group: SUBLIST_ID,
                name: 'custpage_select',
                line: i
            });
            if (checked !== 'T') {
                continue; // unchecked lines are ignored on the printout
            }
            selectedLines.push(Number(request.getSublistValue({
                group: SUBLIST_ID,
                name: 'custpage_line',
                line: i
            })));
        }

        if (selectedLines.length === 0) {
            const form = serverWidget.createForm({ title: 'Print Pick List' });
            const msg = form.addField({
                id: 'custpage_msg',
                type: serverWidget.FieldType.INLINEHTML,
                label: ' '
            });
            msg.defaultValue =
                '<p style="color:red; font-size:12px;">No lines were selected. ' +
                'Go back and check at least one line to print a pick list.</p>';
            context.response.writePage(form);
            return;
        }

        const itemInfo = lookupItemInfo(so, selectedLines);
        const xml = buildPickListXml(so, selectedLines, itemInfo, options);

        const pdfFile = render.xmlToPdf({ xmlString: xml });
        pdfFile.name = 'PickList_' + so.getValue({ fieldId: 'tranid' }) + '.pdf';

        // true = inline (opens in the browser tab instead of downloading)
        context.response.writeFile(pdfFile, true);
    };

    /**
     * Looks up display name, sales description, and (when the account has
     * them) Color / Size / sq-ft attributes for the items on the selected
     * lines. Falls back to a plain lookup when custom columns are missing.
     *
     * @param {Record} so
     * @param {number[]} selectedLines
     * @returns {Object} map of item internal id -> item attributes
     */
    const lookupItemInfo = (so, selectedLines) => {
        const ids = [];
        for (const line of selectedLines) {
            const id = so.getSublistValue({ sublistId: 'item', fieldId: 'item', line: line });
            if (id && ids.indexOf(id) === -1) {
                ids.push(id);
            }
        }

        const map = {};
        if (ids.length === 0) {
            return map;
        }

        const runLookup = (withCustomFields) => {
            const columns = ['displayname', 'salesdescription'];
            if (withCustomFields) {
                // ConventionSuite matrix attributes (color / size)
                columns.push('custitem27', 'custitem28');
            }
            search.create({
                type: 'item',
                filters: [['internalid', 'anyof', ids]],
                columns: columns
            }).run().each((result) => {
                map[result.id] = {
                    displayName: result.getValue({ name: 'displayname' }) || '',
                    salesDesc: result.getValue({ name: 'salesdescription' }) || '',
                    color: withCustomFields ? (result.getText({ name: 'custitem27' }) || '') : '',
                    size: withCustomFields ? (result.getText({ name: 'custitem28' }) || '') : ''
                };
                return true;
            });
        };

        try {
            runLookup(true);
        } catch (e) {
            try {
                runLookup(false);
            } catch (e2) {
                // Item lookup is a nice-to-have; never block printing on it
            }
        }

        return map;
    };

    /**
     * Line description: prefers the ConventionSuite line description column,
     * falls back to the standard description field.
     */
    const getLineDescription = (so, line) => {
        let desc = '';
        try {
            desc = so.getSublistValue({ sublistId: 'item', fieldId: 'custcol_description', line: line }) || '';
        } catch (e) { /* column not present in this account */ }
        if (!desc) {
            desc = so.getSublistValue({ sublistId: 'item', fieldId: 'description', line: line }) || '';
        }
        return desc;
    };

    /** Custom carpet size on the line (sq-ft items), when the column exists. */
    const getLineCustomSize = (so, line) => {
        try {
            return so.getSublistValue({ sublistId: 'item', fieldId: 'custcol_custom_carpet_size', line: line }) || '';
        } catch (e) {
            return '';
        }
    };

    /** Strips the "Parent : Child" hierarchy prefix from an item name. */
    const cleanItemName = (name) => String(name || '').split(' : ').pop();

    /** getText that tolerates fields missing from this account/record. */
    const safeText = (rec, fieldId) => {
        try {
            return rec.getText({ fieldId: fieldId }) || '';
        } catch (e) {
            return '';
        }
    };

    /**
     * Builds the BFO XML for the pick list PDF.
     *
     * @param {Record} so - loaded Sales Order record
     * @param {number[]} selectedLines - item sublist line indexes to include
     * @param {Object} itemInfo - map of item id -> { displayName, upc }
     * @param {Object} options - print options from the selection form
     * @returns {string} XML string
     */
    const buildPickListXml = (so, selectedLines, itemInfo, options) => {
        const tranId = esc(so.getValue({ fieldId: 'tranid' }));
        const customer = esc(so.getText({ fieldId: 'entity' }));
        const tranDate = esc(formatDate(so.getValue({ fieldId: 'trandate' })));
        const shipDate = esc(formatDate(so.getValue({ fieldId: 'shipdate' })));
        const poNum = esc(so.getValue({ fieldId: 'otherrefnum' }));
        const shipMethod = esc(safeText(so, 'shipmethod'));
        const salesRep = esc(safeText(so, 'salesrep'));
        const location = esc(safeText(so, 'location'));
        const showName = esc(safeText(so, 'custbody_show_table'));
        const booth = esc(safeText(so, 'custbody_booth'));
        const orderType = esc(safeText(so, 'custbody_ng_cs_order_type'));
        const status = esc(so.getValue({ fieldId: 'status' }));
        const memo = esc(so.getValue({ fieldId: 'memo' }));
        const shipAddress = esc(so.getValue({ fieldId: 'shipaddress' })).replace(/\r?\n/g, '<br />');
        const printedOn = esc(formatDateTime(new Date()));

        let companyName = '';
        try {
            companyName = esc(config.load({ type: config.Type.COMPANY_INFORMATION })
                .getValue({ fieldId: 'companyname' }));
        } catch (e) { /* not critical */ }

        // ---- Line rows -----------------------------------------------------
        let rows = '';
        let totalQty = 0;
        let rowNum = 0;

        for (const line of selectedLines) {
            rowNum++;
            const itemId = so.getSublistValue({ sublistId: 'item', fieldId: 'item', line: line });
            const info = itemInfo[itemId] || {};

            const item = esc(cleanItemName(so.getSublistText({ sublistId: 'item', fieldId: 'item', line: line })));
            const desc = esc(getLineDescription(so, line) || info.salesDesc || '');
            const qty = so.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line: line });
            const units = esc(so.getSublistText({ sublistId: 'item', fieldId: 'units', line: line }));
            const lineLoc = esc(so.getSublistText({ sublistId: 'item', fieldId: 'location', line: line }));
            const customSize = getLineCustomSize(so, line);

            totalQty += Number(qty) || 0;

            // Item cell: name, optional extended name, then Color / Size attributes
            let itemCell = '<span class="item-name">' + item + '</span>';
            if (options.printExtNames && info.displayName) {
                itemCell += '<br /><i>' + esc(info.displayName) + '</i>';
            }
            const attrs = [];
            if (info.color) {
                attrs.push('<b>Color:</b> ' + esc(info.color));
            }
            if (info.size) {
                attrs.push('<b>Size:</b> ' + esc(info.size));
            } else if (customSize) {
                attrs.push('<b>Size:</b> ' + esc(customSize));
            }
            if (attrs.length > 0) {
                itemCell += '<br /><span class="sub">' + attrs.join(' &#8226; ') + '</span>';
            }

            const descCell = (options.printDescriptions && desc) ? desc : '&nbsp;';

            const rowClass = (rowNum % 2 === 0) ? 'row alt' : 'row';

            rows +=
                '<tr class="' + rowClass + '">' +
                '<td class="num">' + rowNum + '</td>' +
                '<td>' + itemCell + '</td>' +
                '<td>' + descCell + '</td>' +
                '<td>' + (lineLoc || location || '&nbsp;') + '</td>' +
                '<td class="qty">' + esc(qty) + (units ? ' <span class="sub">' + units + '</span>' : '') + '</td>' +
                '<td class="pickbox">&nbsp;</td>' +
                '</tr>';
        }

        // Two label/value pairs per row; optional pairs are skipped when empty
        const infoPairs = [
            ['CUSTOMER', customer, true],
            ['ORDER DATE', tranDate, true],
            ['SHOW / EVENT', showName, false],
            ['BOOTH', booth, false],
            ['ORDER TYPE', orderType, false],
            ['PO #', poNum, false],
            ['SHIP DATE', shipDate, true],
            ['SHIP VIA', shipMethod, false],
            ['SALES REP', salesRep, false],
            ['LOCATION', location, false],
            ['MEMO', memo, false]
        ].filter((pair) => pair[2] || pair[1]);

        let infoGrid = '';
        for (let p = 0; p < infoPairs.length; p += 2) {
            const a = infoPairs[p];
            const b = infoPairs[p + 1] || ['', '', false];
            infoGrid +=
                '<tr>' +
                '<td class="lbl" width="17%">' + a[0] + '</td>' +
                '<td class="val" width="33%">' + (a[1] || '&#8212;') + '</td>' +
                '<td class="lbl" width="17%">' + b[0] + '</td>' +
                '<td class="val" width="33%">' + (b[1] || (b[0] ? '&#8212;' : '&nbsp;')) + '</td>' +
                '</tr>';
        }

        return '<?xml version="1.0"?>' +
            '<!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">' +
            '<pdf>' +
            '<head>' +
            '<style type="text/css">' +
            '  body { font-family: Helvetica, sans-serif; font-size: 9pt; color: #222222; }' +
            '  span.company { font-size: 10pt; color: #555555; letter-spacing: 1pt; }' +
            '  span.title { font-size: 22pt; font-weight: bold; color: #1a1a1a; }' +
            '  span.so-num { font-size: 15pt; font-weight: bold; }' +
            '  span.status { font-size: 9pt; color: #555555; }' +
            '  table.info { width: 100%; margin-top: 10pt; }' +
            '  table.info td { padding: 3pt 6pt 3pt 0; vertical-align: top; }' +
            '  td.lbl { font-size: 7pt; color: #777777; }' +
            '  td.val { font-size: 9.5pt; }' +
            '  table.shipto { width: 100%; margin-top: 8pt; }' +
            '  td.shipto-box { border: 0.75pt solid #cccccc; padding: 6pt 8pt;' +
            '                  font-size: 9pt; background-color: #fafafa; }' +
            '  table.items { width: 100%; margin-top: 14pt; }' +
            '  table.items th { background-color: #2b2b2b; color: #ffffff; padding: 5pt 5pt;' +
            '                   font-size: 8pt; letter-spacing: 0.5pt; text-align: left; }' +
            '  table.items td { padding: 6pt 5pt; border-bottom: 0.5pt solid #dddddd;' +
            '                   vertical-align: top; }' +
            '  tr.alt td { background-color: #f5f5f5; }' +
            '  td.num { color: #888888; }' +
            '  td.qty { text-align: right; font-size: 11pt; font-weight: bold; }' +
            '  td.pickbox { border: 1pt solid #333333; width: 28pt; }' +
            '  span.item-name { font-weight: bold; }' +
            '  span.sub { font-size: 7.5pt; color: #777777; font-weight: normal; }' +
            '  table.totals { width: 100%; margin-top: 2pt; }' +
            '  table.totals td { padding: 6pt 5pt; font-size: 9.5pt; font-weight: bold;' +
            '                    border-top: 1.5pt solid #2b2b2b; }' +
            '  table.sign { width: 100%; margin-top: 34pt; }' +
            '  table.sign td { width: 25%; padding: 2pt 12pt 2pt 0; }' +
            '  td.sign-line { border-top: 0.75pt solid #333333; font-size: 7.5pt;' +
            '                 color: #777777; padding-top: 3pt; }' +
            '</style>' +
            '<macrolist>' +
            '<macro id="nlfooter">' +
            '<table width="100%"><tr>' +
            '<td style="font-size:7.5pt; color:#777777;">Pick List &#8226; Sales Order #' + tranId +
            ' &#8226; Printed ' + printedOn + '</td>' +
            '<td align="right" style="font-size:7.5pt; color:#777777;">Page <pagenumber/> of <totalpages/></td>' +
            '</tr></table>' +
            '</macro>' +
            '</macrolist>' +
            '</head>' +
            '<body footer="nlfooter" footer-height="20pt" padding="0.5in 0.5in 0.75in 0.5in" size="Letter">' +

            // ---- Title band ----
            '<table width="100%"><tr>' +
            '<td>' +
            (companyName ? '<span class="company">' + companyName.toUpperCase() + '</span><br />' : '') +
            '<span class="title">PICK LIST</span>' +
            '</td>' +
            '<td align="right" style="vertical-align:bottom;">' +
            '<span class="so-num">SO #' + tranId + '</span><br />' +
            '<span class="status">' + status + '</span>' +
            '</td>' +
            '</tr></table>' +
            '<hr style="margin-top:6pt; color:#2b2b2b; height:1.5pt;" />' +

            // ---- Order info + ship-to ----
            '<table class="info"><tr><td width="58%" style="padding-right:14pt;">' +
            '<table width="100%">' + infoGrid + '</table>' +
            '</td><td width="42%">' +
            '<table class="shipto">' +
            '<tr><td class="lbl">SHIP TO</td></tr>' +
            '<tr><td class="shipto-box">' + (shipAddress || '&#8212;') + '</td></tr>' +
            '</table>' +
            '</td></tr></table>' +

            // ---- Item lines ----
            '<table class="items">' +
            '<thead>' +
            '<tr>' +
            '<th width="4%">#</th>' +
            '<th width="24%">ITEM</th>' +
            '<th width="35%">DESCRIPTION</th>' +
            '<th width="15%">LOCATION</th>' +
            '<th width="12%" align="right">QTY</th>' +
            '<th width="10%">PICKED</th>' +
            '</tr>' +
            '</thead>' +
            rows +
            '</table>' +

            // ---- Totals ----
            '<table class="totals"><tr>' +
            '<td>' + selectedLines.length + ' line' + (selectedLines.length === 1 ? '' : 's') + '</td>' +
            '<td align="right">Total Quantity: ' + totalQty + '</td>' +
            '</tr></table>' +

            // ---- Signatures ----
            '<table class="sign">' +
            '<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>' +
            '<tr>' +
            '<td class="sign-line">PICKED BY</td>' +
            '<td class="sign-line">DATE</td>' +
            '<td class="sign-line">CHECKED BY</td>' +
            '<td class="sign-line">DATE</td>' +
            '</tr>' +
            '</table>' +

            '</body>' +
            '</pdf>';
    };

    /** Formats a date value for display; returns '' when empty. */
    const formatDate = (d) => {
        if (!d) return '';
        try {
            return format.format({ value: d, type: format.Type.DATE });
        } catch (e) {
            return String(d);
        }
    };

    /** Formats a date + time value for display; returns '' when empty. */
    const formatDateTime = (d) => {
        if (!d) return '';
        try {
            return format.format({ value: d, type: format.Type.DATETIME });
        } catch (e) {
            return String(d);
        }
    };

    /** Escapes XML special characters. */
    const esc = (value) => {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    };

    return { onRequest };
});
