/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * Adds a "Print Pick List" button to Sales Order records (view mode).
 * The button opens the Pick List Suitelet for the current Sales Order.
 */
define([], () => {

    /**
     * @param {Object} context
     * @param {Record} context.newRecord
     * @param {Form} context.form
     * @param {string} context.type
     */
    const beforeLoad = (context) => {
        // Only show the button when viewing an existing Sales Order
        if (context.type !== context.UserEventType.VIEW) {
            return;
        }

        const form = context.form;

        // Client script that handles the button click
        form.clientScriptModulePath = './pick_list_button_cs.js';

        form.addButton({
            id: 'custpage_print_pick_list',
            label: 'Print Pick List',
            functionName: 'openPickListSuitelet'
        });
    };

    return { beforeLoad };
});
