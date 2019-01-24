/**
 * Module Description
 *
 * Version			Date			Author				Remarks
 * 1.00				09 Nov 2017		Greg DelVecchio		Processes a list of invoices for delivery
 * 1.05             21 Nov 2018     Doug Humberd        Per Greg, remove all references to "Portal"
 *
 */


/**
 * Constants
 */
const DELIVERY_TYPE_EMAIL = '1';
const DELIVERY_TYPE_MAIL = '2';
//const DELIVERY_TYPE_PORTAL = '3';
const DELIVERY_FOLDER_MAIL = 1650923;
//const DELIVERY_FOLDER_PORTAL = 932548;


/**
 * Logs an exception to the script execution log
 *
 * @appliedtorecord recordType
 *
 * @param {String} e Exception
 * @returns {Void}
 */
function scg_invpdf_logError(e, invId) {
    // Log the error based on available details
    var errorMessage = (e instanceof nlobjError) ? {'code': e.getCode(), 'details': e.getDetails(), 'stackTrace': e.getStackTrace()}: {'code': '', 'details': e.toString(), 'stackTrace': ''};
    nlapiLogExecution('ERROR', 'System Error', JSON.stringify(errorMessage));
    if (invId) {
        // Record the error on the Invoice record
        nlapiSubmitField('invoice', invId, 'custbody_invoice_delivery_error', errorMessage);
    }
}


/**
 * Processes a list of Invoices submitted by the user through the Process Invoices Suitelet
 *
 * @appliedtorecord invoice
 *
 * @returns {Void}
 */
function scg_invpdf_processInvoices() {
    // Initialize variables
    var scg_invpdf_context = nlapiGetContext();
    var invIds = scg_invpdf_context.getSetting('SCRIPT', 'custscript_process_inv_ids');
    var emailAuthor = scg_invpdf_context.getSetting('SCRIPT', 'custscript_process_inv_author');
    var bccAddress = scg_invpdf_context.getSetting('SCRIPT', 'custscript_process_inv_bcc');
    var timestamp = new Date();
    var timestampdt = nlapiDateToString(timestamp, 'datetime');
    var timestampdtz = nlapiDateToString(timestamp, 'datetimetz');

    // Parse JSON list of Invoice Ids into an array
    nlapiLogExecution('DEBUG', 'Invoice List: ', invIds);
    invIds = (invIds) ? JSON.parse(invIds) : null;
    nlapiLogExecution('DEBUG', 'Invoice Count: ', (invIds) ? invIds.length : 0);

    // Loop through the invoices and email them
    scg_invpdf_scheduledBatch(invIds, function (invId) {
        try {
            // Load the Invoice record
            var invFields = nlapiLookupField('invoice', invId, ['tranid', 'custbody_invoice_delivery_type', 'custbody_invoice_email_address_list', 'entity', 'subsidiary']);
            var deliveryTypes = invFields['custbody_invoice_delivery_type'].split(',');
            var emailAddresses = invFields['custbody_invoice_email_address_list'];
            var tranId = invFields['tranid'];
            var entityId = invFields['entity'];
            var subsidiaryId = invFields['subsidiary'];
            var fileId = null;

            // Generate the PDF file
            var pdfFile = nlapiPrintRecord('TRANSACTION', invId, 'PDF', null);

            // Deliver by email
            if (deliveryTypes.indexOf(DELIVERY_TYPE_EMAIL) >= 0) {
                // Validate email addresses
                if (!emailAddresses || emailAddresses.length == 0)
                    throw nlapiCreateError('INVOICE_EMAIL-NO_ADDRESSES', 'There are no email addresses associated with this Invoice. [Invoice: ' + tranId + ']', false);

                // Create the email record
                var customerName = nlapiLookupField('customer', entityId, 'companyname');
                var templateId = nlapiLookupField('subsidiary', subsidiaryId, 'custrecord_invoice_email_template');
                if (!templateId)
                    throw nlapiCreateError('INVOICE_EMAIL-NO_TEMPLATE', 'There is no email template associated with the Subsidiary (' + subsidiaryId + ') on the Invoice record [Invoice: ' + tranId + ']', false);
                var emailMerger = nlapiCreateEmailMerger(templateId);
                emailMerger.setEntity('customer', entityId);
                emailMerger.setTransaction(invId);
                var mergeResult = emailMerger.merge();

                // Send the email
                nlapiSendEmail(emailAuthor, emailAddresses, mergeResult.getSubject() + ' ' + customerName, mergeResult.getBody(), null, bccAddress, {'entity': entityId, 'transaction': invId}, pdfFile, true);
            }

            // Deliver by mail
            if (deliveryTypes.indexOf(DELIVERY_TYPE_MAIL) >= 0) {
                pdfFile.setFolder(DELIVERY_FOLDER_MAIL);
                var fileId = nlapiSubmitFile(pdfFile);
                nlapiAttachRecord('file', fileId, 'invoice', invId);
            }

            // Deliver by portal
            //if (deliveryTypes.indexOf(DELIVERY_TYPE_PORTAL) >= 0) {
                //pdfFile.setFolder(DELIVERY_FOLDER_PORTAL);
                //nlapiSubmitFile(pdfFile);
                //if (!fileId) {
                    //var fileId = nlapiSubmitFile(pdfFile);
                    //nlapiAttachRecord('file', fileId, 'invoice', invId);
                //}
            //}

            // Update the Invoice records
            nlapiSubmitField('invoice', invId, ['custbody_invoice_delivery_date', 'custbody_invoice_delivery_error'], [timestampdtz, '']);
        } catch (e) {
            scg_invpdf_logError(e, invId);
        }
    });

}


/**
 * Processes each element of an array, checks remaining governance units 
 * and reschedules the script, if needed.
 *
 * @appliedtorecord invoice
 *
 * @param {Array} arr: array to be processed by the script
 * @param {Array} proc: function to be used to process each element of the array
 * @returns {Void}
 */
function scg_invpdf_scheduledBatch(arr, proc) {

    // Initialize variables
    var maxUsage = 0;
    var startUsage = nlapiGetContext().getRemainingUsage();

    // Loop through the array
    for (var i in arr) {
        // Process the current array value
        proc(arr[i], i, arr);

        // Update the percent complete value on the script status page
        if (nlapiGetContext().getExecutionContext() == "scheduled") nlapiGetContext().setPercentComplete(((100 * i) / arr.length).toFixed(1));

        // Track governance and reschedule script, if needed
        var endUsage = nlapiGetContext().getRemainingUsage();
        var runUsage = startUsage - endUsage;
        if (maxUsage < runUsage) maxUsage = runUsage;
        if (endUsage < (maxUsage + 20)) {
            var state = nlapiYieldScript();
            if (state.status == 'FAILURE') {
                nlapiLogExecution("ERROR", "Failed to reschedule script, exiting: Reason = " + state.reason + " / Size = " + state.size + " / Info = " + state.information);
                throw "Failed to reschedule script";
            } else if (state.status == 'RESUME') {
                nlapiLogExecution("AUDIT", "Resuming script because of " + state.reason + ".  Size = " + state.size);
            }
            startUsage = nlapiGetContext().getRemainingUsage();
        } else {
            startUsage = endUsage;
        }
    }
}
