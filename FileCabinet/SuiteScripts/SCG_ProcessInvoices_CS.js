/**
 * Module Description
 *
 * Version			Date			Author				Remarks
 * 1.00				29 Jan 2018		Greg DelVecchio		Handles client events on the Process Invoices Suitelet
 * 1.05             21 Nov 2018     Doug Humberd        Per Greg, remove all references to "Portal"
 *
 */


/**
 * Global Variables
 */
var scg_invpdf_context = nlapiGetContext();


/**
 * Logs an exception to the script execution log
 *
 * @appliedtorecord invoice
 *
 * @param {String} e Exception
 * @returns {Void}
 */
function scg_invpdf_logError(e) {
    // Log the error based on available details
    var errorMessage = (e instanceof nlobjError) ? {'code': e.getCode(), 'details': e.getDetails(), 'stackTrace': e.getStackTrace()}: {'code': '', 'details': e.toString(), 'stackTrace': ''};
    nlapiLogExecution('ERROR', 'System Error', JSON.stringify(errorMessage));
}


/**
 * Updates the sublist filters when Refresh button is clicked
 *
 * @appliedtorecord invoice
 *
 * @returns {Void}
 */
function scg_invpdf_updateUrlParams() {
    // Initialize variables
    var approvalStartDate = nlapiGetFieldValue('custpage_approval_start_date');
    var approvalEndDate = nlapiGetFieldValue('custpage_approval_end_date');
    var tranStartDate = nlapiGetFieldValue('custpage_tran_start_date');
    var tranEndDate = nlapiGetFieldValue('custpage_tran_end_date');
    var customer = nlapiGetFieldValue('custpage_customer');
    var success = nlapiGetFieldValue('custpage_success');
    var status = nlapiGetFieldValue('custpage_status');
    var failed = nlapiGetFieldValue('custpage_failed');
    var email = nlapiGetFieldValue('custpage_email');
    var mail = nlapiGetFieldValue('custpage_mail');
    var consortium = nlapiGetFieldValue('custpage_consortium');
    //var portal = nlapiGetFieldValue('custpage_portal');
    var refresh = '';

    // Set URL parameter components
    approvalStartDate = (approvalStartDate) ? '&approvalstartdate=' + encodeURIComponent(approvalStartDate) : '';
    approvalEndDate = (approvalEndDate) ? '&approvalenddate=' + encodeURIComponent(approvalEndDate) : '';
    tranStartDate = (tranStartDate) ? '&transtartdate=' + encodeURIComponent(tranStartDate) : '';
    tranEndDate = (tranEndDate) ? '&tranenddate=' + encodeURIComponent(tranEndDate) : '';
    customer = (customer) ? '&customer=' + encodeURIComponent(customer) : '';
    success = (success) ? '&success=' + encodeURIComponent(success) : '';
    status = (status) ? '&status=' + encodeURIComponent(status) : '';
    failed = (failed) ? '&failed=' + encodeURIComponent(failed) : '';
    email = (email) ? '&email=' + encodeURIComponent(email) : '';
    mail = (mail) ? '&mail=' + encodeURIComponent(mail) : '';
    consortium = (consortium) ? '&consortium=' + encodeURIComponent(consortium) : '';
    //portal = (portal) ? '&portal=' + encodeURIComponent(portal) : '';
    refresh = '&refresh=T';

    // Build URL parameter string
    //var urlParams = approvalStartDate + approvalEndDate + tranStartDate + tranEndDate + customer + success + status + failed + email + mail + consortium + portal + refresh;
    var urlParams = approvalStartDate + approvalEndDate + tranStartDate + tranEndDate + customer + success + status + failed + email + mail + consortium + refresh;
    nlapiSetFieldValue('custpage_url_params', urlParams);
}


/**
 * Performs actions when a form is loaded in the user's browser
 *
 * @appliedtorecord invoice
 *
 * @param {String} type Sublist internal id
 * @returns {Void}
 */
function scg_invpdf_pageInit(type){
    try {
        document.getElementById('server_commands').addEventListener('load', function() {scg_invpdf_updateTotals();}, false);
        //scg_invpdf_updateTotals();
    } catch (e) {
        scg_invpdf_logError(e);
    }
}


/**
 * Handles events related to changes to field values
 *
 * @appliedtorecord invoice
 *
 * @param {String} type Sublist internal id
 * @param {String} name Field internal id
 * @param {Number} linenum Optional line item number, starts from 1
 * @returns {Void}
 */
function scg_invpdf_fieldChanged(type, name, linenum) {
    try {
        scg_invpdf_setFilterChanged(type, name, linenum);
        scg_invpdf_checkListRefreshed(type, name, linenum);
    } catch (e) {
        scg_invpdf_logError(e);
        throw e;
    }
}


/**
 * Sets a field that tracks whether a filter value has changed
 *
 * @appliedtorecord invoice
 *
 * @param {String} type Sublist internal id
 * @param {String} name Field internal id
 * @param {Number} linenum Optional line item number, starts from 1
 * @returns {Void}
 */
function scg_invpdf_setFilterChanged(type, name, linenum) {
    if (name == 'custpage_approval_start_date' ||
        name == 'custpage_approval_end_date' ||
        name == 'custpage_tran_start_date' ||
        name == 'custpage_tran_end_date' ||
        name == 'custpage_customer' ||
        name == 'custpage_success' ||
        name == 'custpage_status' ||
        name == 'custpage_failed' ||
        name == 'custpage_email' ||
        name == 'custpage_mail' ||
        name == 'custpage_consortium') {
        nlapiSetFieldValue('custpage_filter_changed', 'T');
    }
}


/**
 * Checks if the Invoice sublist has been refreshed since the last filter
 * change before allowing any Invoicess to be selected for emailing
 *
 * @appliedtorecord invoice
 *
 * @param {String} type Sublist internal id
 * @param {String} name Field internal id
 * @param {Number} linenum Optional line item number, starts from 1
 * @returns {Void}
 */
function scg_invpdf_checkListRefreshed(type, name, linenum) {
    if (name == 'custpage_inv_process') {
        if (nlapiGetFieldValue('custpage_filter_changed') == 'T') {
            alert('Once a filter setting is changed, you must click the Refresh button to update the Invoice list. After the list is refreshed you may select and submit Invoicess to be processed.');
            var processValue = nlapiGetLineItemValue('custpage_inv_list', 'custpage_inv_process', linenum);
            nlapiSetLineItemValue('custpage_inv_list', 'custpage_inv_process', linenum, (processValue == 'T') ? 'F' : 'T');
        }
    }
}


/**
 * Handles events triggered when the user submits the form
 *
 * @appliedtorecord invoice
 *
 * @returns {Boolean} True to continue save, false to abort save
 */
function scg_invpdf_saveRecord() {
    try {
        var retVal = false;
        retVal = scg_invpdf_isFilterChanged();
        retVal = (retVal) ? scg_invpdf_isInvoiceChecked() : false;
        return retVal;
    } catch (e) {
        scg_invpdf_logError(e);
        throw e;
    }
}


/**
 * Determines if the Invoice sublist has been refreshed since the last filter change
 *
 * @appliedtorecord invoice
 *
 * @returns {Boolean} True to continue save, false to abort save
 */
function scg_invpdf_isFilterChanged() {
    var retVal = (nlapiGetFieldValue('custpage_filter_changed') == 'T') ? false : true;
    if (!retVal) {
        alert('Once a filter setting is changed, you must click the Refresh button to update the Invoice list. After the list is refreshed you may select and submit Invoices to be processed.');
    }
    return retVal;
}


/**
 * Determines if at least one Invoice has been selected before the Email button was clicked
 *
 * @appliedtorecord invoice
 *
 * @returns {Boolean} True to continue save, false to abort save
 */
function scg_invpdf_isInvoiceChecked() {
    var retVal = (nlapiFindLineItemValue('custpage_inv_list', 'custpage_inv_process', 'T') == -1) ? false : true;
    if (!retVal) {
        alert('Please select one or more Invoices to be processed.');
    }
    return retVal;
}


/**
 * Calculates number of Invoices and their Total Amount
 *
 * @appliedtorecord invoice
 *
 * @returns {Void}
 */
function scg_invpdf_updateTotals() {
    var invCount = 0;
    var invTotal = 0;
    var itemCount = nlapiGetLineItemCount('custpage_inv_list');
    for (var i = 1; itemCount != 0 && i <= itemCount; i++) {
        invCount++;
        invTotal += parseFloat(nlapiGetLineItemValue('custpage_inv_list', 'custpage_inv_amount', i));
    }
    nlapiSetFieldValue('custpage_count', invCount);
    nlapiSetFieldValue('custpage_total', invTotal.toFixed(2));
}
