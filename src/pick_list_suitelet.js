/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * Pick List Suitelet
 * ------------------
 * GET  : Shows all item lines of a Sales Order with a checkbox per line
 *        (with native Mark All / Unmark All buttons).
 * POST : Renders a PDF pick list containing ONLY the checked lines.
 *
 * Expected deployment IDs (referenced by the client script):
 *   Script ID     : customscript_pick_list_sl
 *   Deployment ID : customdeploy_pick_list_sl
 */
define(['N/ui/serverWidget', 'N/record', 'N/render', 'N/format', 'N/error'],
    (serverWidget, record, render, format, error) => {

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
            setVal('custpage_item', so.getSublistText({ sublistId: 'item', fieldId: 'item', line: i }));
            setVal('custpage_desc', so.getSublistValue({ sublistId: 'item', fieldId: 'description', line: i }));
            setVal('custpage_qty', so.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line: i }));
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

        const xml = buildPickListXml(so, selectedLines);

        const pdfFile = render.xmlToPdf({ xmlString: xml });
        pdfFile.name = 'PickList_' + so.getValue({ fieldId: 'tranid' }) + '.pdf';

        // true = inline (opens in the browser tab instead of downloading)
        context.response.writeFile(pdfFile, true);
    };

    /**
     * Builds the BFO XML for the pick list PDF.
     *
     * @param {Record} so - loaded Sales Order record
     * @param {number[]} selectedLines - item sublist line indexes to include
     * @returns {string} XML string
     */
    const buildPickListXml = (so, selectedLines) => {
        const tranId = esc(so.getValue({ fieldId: 'tranid' }));
        const customer = esc(so.getText({ fieldId: 'entity' }));
        const tranDate = esc(formatDate(so.getValue({ fieldId: 'trandate' })));
        const shipDate = esc(formatDate(so.getValue({ fieldId: 'shipdate' })));
        const memo = esc(so.getValue({ fieldId: 'memo' }));
        const printedOn = esc(formatDate(new Date()));

        let rows = '';
        for (const line of selectedLines) {
            const item = esc(so.getSublistText({ sublistId: 'item', fieldId: 'item', line: line }));
            const desc = esc(so.getSublistValue({ sublistId: 'item', fieldId: 'description', line: line }));
            const qty = esc(so.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line: line }));
            const units = esc(so.getSublistText({ sublistId: 'item', fieldId: 'units', line: line }));
            const location = esc(so.getSublistText({ sublistId: 'item', fieldId: 'location', line: line }));

            rows +=
                '<tr>' +
                '<td>' + item + '</td>' +
                '<td>' + desc + '</td>' +
                '<td>' + location + '</td>' +
                '<td align="right">' + qty + '</td>' +
                '<td>' + units + '</td>' +
                '<td class="pickbox">&nbsp;</td>' +
                '</tr>';
        }

        return '<?xml version="1.0"?>' +
            '<!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">' +
            '<pdf>' +
            '<head>' +
            '<style type="text/css">' +
            '  body { font-family: Helvetica, sans-serif; font-size: 9pt; }' +
            '  h1 { font-size: 16pt; margin-bottom: 2pt; }' +
            '  table.header td { padding: 2pt 6pt 2pt 0; font-size: 9pt; }' +
            '  table.items { width: 100%; margin-top: 12pt; }' +
            '  table.items th { background-color: #e5e5e5; border-bottom: 1pt solid #333;' +
            '                   padding: 4pt; font-size: 9pt; text-align: left; }' +
            '  table.items td { border-bottom: 0.5pt solid #ccc; padding: 5pt 4pt; }' +
            '  td.pickbox { border: 1pt solid #333; width: 28pt; }' +
            '</style>' +
            '<macrolist>' +
            '<macro id="nlfooter">' +
            '<table width="100%"><tr>' +
            '<td style="font-size:8pt;">Printed: ' + printedOn + '</td>' +
            '<td align="right" style="font-size:8pt;">Page <pagenumber/> of <totalpages/></td>' +
            '</tr></table>' +
            '</macro>' +
            '</macrolist>' +
            '</head>' +
            '<body footer="nlfooter" footer-height="20pt" padding="0.5in 0.5in 0.75in 0.5in" size="Letter">' +
            '<h1>Pick List</h1>' +
            '<table class="header">' +
            '<tr><td><b>Sales Order:</b></td><td>' + tranId + '</td>' +
            '<td><b>Date:</b></td><td>' + tranDate + '</td></tr>' +
            '<tr><td><b>Customer:</b></td><td>' + customer + '</td>' +
            '<td><b>Ship Date:</b></td><td>' + shipDate + '</td></tr>' +
            (memo ? '<tr><td><b>Memo:</b></td><td colspan="3">' + memo + '</td></tr>' : '') +
            '</table>' +
            '<table class="items">' +
            '<thead>' +
            '<tr>' +
            '<th>Item</th>' +
            '<th>Description</th>' +
            '<th>Location</th>' +
            '<th align="right">Qty</th>' +
            '<th>Units</th>' +
            '<th>Picked</th>' +
            '</tr>' +
            '</thead>' +
            rows +
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
