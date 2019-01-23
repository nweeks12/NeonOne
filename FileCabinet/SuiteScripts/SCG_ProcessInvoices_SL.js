/**
 * Module Description
 *
 * Version			Date			Author				Remarks
 * 1.00				16 Jan 2018		Greg DelVecchio		Allows a user to select Invoices for PDF generation
 * 1.05             21 Nov 2018     Doug Humberd        Per Greg, remove all references to "Portal"
 *
 */


/**
 * Constants
 */
const DELIVERY_TYPE_EMAIL = '1';
const DELIVERY_TYPE_MAIL = '2';
//const DELIVERY_TYPE_PORTAL = '3';
const DELIVERY_TYPE_TEXT_EMAIL = 'Email';
const DELIVERY_TYPE_TEXT_MAIL = 'Mail';
//const DELIVERY_TYPE_TEXT_PORTAL = 'Portal';


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
 * @param {nlobjRequest} request Request object
 * @param {nlobjResponse} response Response object
 * @returns {Void} Any output is written via response object
 */
function scg_invpdf_listInvoices(request, response){
    if (request.getMethod()=='GET') {
        try	{
            var form = nlapiCreateForm('Invoice Bulk Processing');
            form.setScript('customscript_scg_process_invoices_cs');

            //Check filter parameters
            var tranStartDate = request.getParameter('transtartdate');
            var tranEndDate = request.getParameter('tranenddate');
            var customer = request.getParameter('customer');
            var email = request.getParameter('email');
            email = (email == null) ? 'T' : email;
            var mail = request.getParameter('mail');
            mail = (mail == null) ? 'T' : mail;
            var consortium = request.getParameter('consortium');
            consortium = (consortium == null) ? 'F' : consortium;
            var status = request.getParameter('status');
            var failed = request.getParameter('failed');
            var success = request.getParameter('success');
            var refresh = request.getParameter('refresh');

            //Form Fields
            fld = form.addField('custpage_tran_start_date', 'date', 'Earliest Tran Date');
            fld.setDefaultValue(tranStartDate);

            fld = form.addField('custpage_tran_end_date', 'date', 'Latest Tran Date');
            fld.setDefaultValue(tranEndDate);

            fld = form.addField('custpage_customer', 'select', 'Customer', 'customer');
            fld.setDefaultValue(customer);
            fld.setBreakType('startcol');

            fld = form.addField('custpage_status', 'select', 'Status', 'status');
            fld.addSelectOption('CustInvc:A','Open');
            fld.addSelectOption('CustInvc:B','Paid In Full');
            fld.addSelectOption('@ALL@','All');
            fld.setDefaultValue(status);

            var fld = form.addField('custpage_success', 'checkbox', 'Include Previously Successful Transactions');
            fld.setDefaultValue(success);

            var fld = form.addField('custpage_failed', 'checkbox', 'Include Previously Failed Transactions');
            fld.setDefaultValue(failed);

            var fld = form.addField('custpage_email', 'checkbox', 'Email Invoice');
            fld.setDefaultValue((email == 'F') ? 'F' : 'T');
            fld.setBreakType('startcol');

            var fld = form.addField('custpage_mail', 'checkbox', 'Mail Invoice');
            fld.setDefaultValue((mail == 'F') ? 'F' : 'T');

            var fld = form.addField('custpage_consortium', 'checkbox', 'Bill To Consortium');
            fld.setDefaultValue((consortium == 'F') ? 'F' : 'T');

            var fld = form.addField('custpage_count', 'integer', 'Invoice Count');
            fld.setDisplayType('inline');
            fld.setDefaultValue(0);
            fld.setBreakType('startcol');

            var fld = form.addField('custpage_total', 'currency', 'Invoice Total');
            fld.setDisplayType('inline');
            fld.setDefaultValue(0);

            fld = form.addField('custpage_filter_changed', 'checkbox', 'Filter Changed');
            fld.setDefaultValue('F');
            fld.setDisplayType('hidden');

            var urlParamId = 'custpage_url_params';
            fld = form.addField(urlParamId, 'text', 'URL Parameters');
            fld.setDisplayType('hidden');

            // Invoice Sublist
            var invList = form.addSubList('custpage_inv_list', 'list', 'Invoices');
            invList.addButton('custpage_inv_refresh', 'Refresh', 'scg_invpdf_updateUrlParams(); NS.form.setInited(false); document.getElementById(\'server_commands\').src=\'/app/site/hosting/scriptlet.nl?script=' + scg_invpdf_context.getScriptId() + '&deploy=' + scg_invpdf_context.getDeploymentId() + '&r=T&machine=custpage_inv_list\' + nlapiGetFieldValue(\'custpage_url_params\') + \'&refresh=T&ts=\' + new Date().getTime(); nlapiSetFieldValue(\'custpage_filter_changed\', \'F\');');
            invList.addField('custpage_inv_process', 'checkbox', 'Process');
            invList.addField('custpage_inv_item', 'select', 'Invoice', 'transaction').setDisplayType('hidden');
            invList.addField('custpage_inv_tranid', 'text', 'Invoice #');
            invList.addField('custpage_inv_date', 'date', 'Tran Date');
            invList.addField('custpage_inv_customer', 'select', 'Customer', 'customer').setDisplayType('inline');
            invList.addField('custpage_inv_delivery_method', 'text', 'Delivery Method');
            invList.addField('custpage_inv_amount', 'currency', 'Amount');
            invList.addField('custpage_inv_status', 'text', 'Status');
            invList.addField('custpage_inv_delivery_date', 'text', 'Date Processed');
            invList.addField('custpage_inv_error', 'text', 'Error');
            invList.addMarkAllButtons();

            // Search for Invoices
            var invData = [];
            var invCount = 0;
            var invTotal = 0;
            var minInternalId = 0;
            var resultCount = 0;
            do {
                var results = scg_invpdf_getInvoices(customer, status, tranStartDate, tranEndDate, failed, success, email, mail, consortium, minInternalId);
                resultCount = (results) ? results.length : 0;
                nlapiLogExecution('DEBUG', 'result count: ' + resultCount, '');
                for(var x=0; results && x < results.length; x++) {
                    invData[invCount] = [];
                    invData[invCount]['custpage_inv_process'] = 'F';
                    invData[invCount]['custpage_inv_item'] = results[x].getId();
                    invData[invCount]['custpage_inv_tranid'] = '<a href="' + nlapiResolveURL('RECORD', 'invoice', results[x].getId(), 'VIEW') + '">' + results[x].getValue('tranid') + '</a>';
                    invData[invCount]['custpage_inv_date'] = results[x].getValue('trandate');
                    invData[invCount]['custpage_inv_customer'] = results[x].getValue('entity');
                    var deliveryMethod = ((results[x].getValue('custbody_invoice_delivery_type').split(',').indexOf(DELIVERY_TYPE_EMAIL) >= 0) ? 'Email' : '');
                    deliveryMethod += (deliveryMethod) ? ((results[x].getValue('custbody_invoice_delivery_type').split(',').indexOf(DELIVERY_TYPE_MAIL) >= 0) ? ', Mail' : '') : ((results[x].getValue('custbody_invoice_delivery_type').split(',').indexOf(DELIVERY_TYPE_MAIL) >= 0) ? 'Mail' : '');
                    //deliveryMethod += (deliveryMethod) ? ((results[x].getValue('custbody_invoice_delivery_type').split(',').indexOf(DELIVERY_TYPE_PORTAL) >= 0) ? ', Portal' : '') : ((results[x].getValue('custbody_invoice_delivery_type').split(',').indexOf(DELIVERY_TYPE_PORTAL) >= 0) ? 'Portal' : '');
                    invData[invCount]['custpage_inv_delivery_method'] =  deliveryMethod;
                    invData[invCount]['custpage_inv_amount'] = results[x].getValue('total');
                    invData[invCount]['custpage_inv_status'] = results[x].getText('status');
                    invData[invCount]['custpage_inv_delivery_date'] = (results[x].getValue('custbody_invoice_delivery_date')) ? results[x].getValue('custbody_invoice_delivery_date').substring(0, 19) : '';
                    invData[invCount]['custpage_inv_error'] = (results[x].getValue('custbody_invoice_delivery_error')) ? results[x].getValue('custbody_invoice_delivery_error').substring(0, 19) : '';
                    invCount++;
                    invTotal += parseFloat(results[x].getValue('total'));
                    minInternalId = results[x].getValue('internalid');
                }
            } while (resultCount > 0);

            invList.setLineItemValues(invData);
            fld = form.getField('custpage_count');
            fld.setDefaultValue(invCount);
            fld = form.getField('custpage_total');
            fld.setDefaultValue(invTotal);

            form.addSubmitButton('Process Invoices');

            response.writePage(form);
        } catch (e) {
            scg_invpdf_logError(e);
            throw e;
        }
    } else {
        try {
            // Get Invoice internal IDs and kick off scheduled script to process selected Invoices
            var invIds = [];
            var itemCount = request.getLineItemCount('custpage_inv_list');
            for (var i = 1; itemCount != 0 && i <= itemCount; i++) {
                if (request.getLineItemValue('custpage_inv_list', 'custpage_inv_process', i) == 'T') {
                    invIds.push(request.getLineItemValue('custpage_inv_list', 'custpage_inv_item', i));
                }
            }
            nlapiLogExecution('DEBUG', 'Invoice Count: ' + itemCount, '');

            // Start the scheduled script that will process the Invoices submitted by the user
            if (invIds) {
                var scriptSched = nlapiScheduleScript('customscript_scg_process_invoices_ss', 'customdeploy_scg_process_invoices_ss', {'custscript_process_inv_ids': JSON.stringify(invIds)});
                nlapiLogExecution('DEBUG', 'Deployment Scheduled: ' + ' Status: ' + scriptSched, '');
                nlapiSetRedirectURL('TASKLINK', 'LIST_SCRIPTSTATUS', null, null, {'scripttype': scg_invpdf_getScriptInternalId('customscript_scg_process_invoices_ss')});
            } else {
                throw nlapiCreateError('INVOICE_EMAIL-NO_INV_SELECTED', 'There were no Invoices selected. Please go back and select at least one Invoice.', false);
            }
        } catch (e) {
            scg_invpdf_logError(e);
            throw e;
        }
    }
}


/**
 * Returns the internal id of the given script
 *
 * @appliedtorecord script
 *
 * @param {Array} scriptId: identifier given to this script
 * @returns {Integer}
 */
function scg_invpdf_getScriptInternalId(scriptId) {
    // Initialize variables
    var scriptInternalId = '';

    // Define filters
    var filters = new Array();
    filters.push(new nlobjSearchFilter('scriptid', null, 'is', scriptId));

    // Define columns
    var columns = new Array();
    columns.push(new nlobjSearchColumn('name', null, null));

    // Get results
    var results = nlapiSearchRecord('script', null, filters, columns);
    if (results && results.length > 0) {
        scriptInternalId = results[0].getId();
    }

    // Return
    return scriptInternalId;
}


/**
 * Search for Invoices
 *
 * @appliedtorecord invoice
 *
 * @param {Integer} customer: internal id of a Customer record
 * @param {String} tranStartDate: earliest transaction date
 * @param {String} tranEndDate: latest transaction date
 * @param {String} failed: include transactions with a previous failed processing attempt
 * @param {String} success: include transactions with a previous successful processing attempt
 * @param {String} email: include transactions to be delivered by email
 * @param {String} mail: include transactions to be delivered by mail
 * @param {String} consortium: include transactions marked Bill to Consortium
 * @param {Integer} minInternalId: minimum transaction internal id of the next page of results
 * @returns {nlobjSearchResults}
 */
function scg_invpdf_getInvoices(customer, status, tranStartDate, tranEndDate, failed, success, email, mail, consortium, minInternalId) {
    // Build formula for Delivery Method filter
    var deliveryMethodFormula = 'CASE WHEN ';
    if (email == 'T') {
        deliveryMethodFormula += 'INSTR({custbody_invoice_delivery_type}, \'' + DELIVERY_TYPE_TEXT_EMAIL + '\') > 0';
        if (mail == 'T') {
            deliveryMethodFormula += ' OR INSTR({custbody_invoice_delivery_type}, \'' + DELIVERY_TYPE_TEXT_MAIL + '\') > 0';
        }
    } else if (mail == 'T') {
        deliveryMethodFormula += 'INSTR({custbody_invoice_delivery_type}, \'' + DELIVERY_TYPE_TEXT_MAIL + '\') > 0';
    } 
    //else {
        //deliveryMethodFormula += 'INSTR({custbody_invoice_delivery_type}, \'' + DELIVERY_TYPE_TEXT_EMAIL + '\') = 0 AND INSTR({custbody_invoice_delivery_type}, \'' + DELIVERY_TYPE_TEXT_MAIL + '\') = 0 AND INSTR({custbody_invoice_delivery_type}, \'' + DELIVERY_TYPE_TEXT_PORTAL + '\') = 0';
    //}
    deliveryMethodFormula += ' THEN 1 ELSE 0 END';

    nlapiLogExecution('DEBUG', 'deliveryMethodFormula', deliveryMethodFormula);
    nlapiLogExecution('DEBUG', 'failed formula', 'CASE WHEN {custbody_invoice_delivery_error} IS NULL THEN 1 ELSE ' + ((failed == 'T') ? '1' : '0') + ' END');
    nlapiLogExecution('DEBUG', 'success formula', 'CASE WHEN {custbody_invoice_delivery_date} IS NULL THEN 1 ELSE ' + ((success == 'T') ? '1' : '0') + ' END');

    // Define filters
    var filters = [];
    filters.push(new nlobjSearchFilter('entity', null, 'anyof', (customer) ? customer : '@ALL@'));
    filters.push(new nlobjSearchFilter('mainline', null, 'is', 'T'));
    filters.push(new nlobjSearchFilter('status', null, 'is', (status) ? status : 'CustInvc:A')); //CustInvc:A = internal code for Open
    filters.push(new nlobjSearchFilter('trandate', null, 'within', ((tranStartDate) ? tranStartDate : ''), ((tranEndDate) ? tranEndDate : '')));
    filters.push(new nlobjSearchFilter('formulanumeric', null, 'equalto', 1).setFormula('CASE WHEN {custbody_invoice_delivery_error} IS NULL THEN 1 ELSE ' + ((failed == 'T') ? '1' : '0') + ' END'));
    filters.push(new nlobjSearchFilter('formulanumeric', null, 'equalto', 1).setFormula('CASE WHEN {custbody_invoice_delivery_date} IS NULL THEN 1 ELSE ' + ((success == 'T') ? '1' : '0') + ' END'));
    filters.push(new nlobjSearchFilter('formulanumeric', null, 'equalto', 1).setFormula(deliveryMethodFormula));
    filters.push(new nlobjSearchFilter('custbody_bill_to_consortium', null, 'is', consortium));
    filters.push(new nlobjSearchFilter('internalidnumber', null, 'greaterthan', minInternalId));

    // Define columns
    var columns = [];
    columns.push(new nlobjSearchColumn('internalid'));
    columns.push(new nlobjSearchColumn('tranid'));
    columns.push(new nlobjSearchColumn('trandate'));
    columns.push(new nlobjSearchColumn('entity'));
    columns.push(new nlobjSearchColumn('custbody_invoice_delivery_date'));
    columns.push(new nlobjSearchColumn('status'));
    columns.push(new nlobjSearchColumn('custbody_invoice_delivery_error'));
    columns.push(new nlobjSearchColumn('custrecord_email_invoice', 'billingaddress'));
    columns.push(new nlobjSearchColumn('custrecord_mail_invoice', 'billingaddress'));
    //columns.push(new nlobjSearchColumn('custrecord_portal_submit', 'billingaddress'));
    columns.push(new nlobjSearchColumn('custbody_invoice_delivery_type'));
    columns.push(new nlobjSearchColumn('total'));
    columns[0].setSort(false /* ascending */);

    // Return results
    return nlapiSearchRecord('invoice', null, filters, columns);
}
