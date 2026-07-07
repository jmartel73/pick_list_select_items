/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * Client script attached (via the User Event script) to the Sales Order form.
 * Handles the "Print Pick List" button click by opening the Pick List Suitelet.
 */
define(['N/currentRecord', 'N/url'], (currentRecord, url) => {

    /**
     * Required entry point (unused, but must exist for the script to attach).
     */
    const pageInit = () => {};

    /**
     * Called by the "Print Pick List" button.
     * Opens the Pick List Suitelet for the current Sales Order in a new tab.
     */
    const openPickListSuitelet = () => {
        const rec = currentRecord.get();

        const suiteletUrl = url.resolveScript({
            scriptId: 'customscript_pick_list_sl',
            deploymentId: 'customdeploy_pick_list_sl',
            params: {
                soid: rec.id
            }
        });

        window.open(suiteletUrl, '_blank');
    };

    return {
        pageInit,
        openPickListSuitelet
    };
});
