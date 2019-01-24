/**
 * Module Description
 *
 * Version    Date            Author           Remarks
 * 1.00       11 Nov 2017     Greg DelVecchio  Handles user events on Sales Order records
 * 2.00 	  04 Jan 2018 	  Arianne Sirow	   Added the set billing schedule function
 *
 */


/***********************************
 * Constants
 *
 ***********************************/
// Billing Frequency constants
const MONTHLY = '1';
const QUARTERLY = '2';
const SEMI_ANNUAL = '3';
const ANNUAL = '4';
const CUSTOM = '5';
const MONTHLY_IN_ARREARS_BF = '6';
const QUARTERLY_IN_ARREARS_BF = '7';

// Billing Schedule constants
const ANNUALLY = '19';
const SEMIANNUALLY_IN_ADVANCE = '17';
const TRIANNUALLY_IN_ADVANCE = '24';
const QUARTERLY_IN_ADVANCE = '13';
const MONTHLY_IN_ADVANCE = '12';
const SEMIANNUALLY_IN_ARREARS = '23';
const QUARTERLY_IN_ARREARS = '21';
const MONTHLY_IN_ARREARS = '22';
const UPON_SIGNING = '20';

//Order Type constants
const RENEWAL = '3';
const CONSOLIDATION = '4';

const CONSOLIDATION_URL = '/app/site/hosting/scriptlet.nl?script=314&deploy=1';


/**
 * Performs actions immediately before a record is served to a client.
 *
 * @appliedtorecord salesorder
 *
 * @param {String} type Operation types: create, edit, view, copy, print, email
 * @param {nlobjForm} form Current form
 * @param {nlobjRequest} request Request object
 * @returns {Void}
 */
function mt_so_beforeLoad(type, form, request){
    try {
        mt_so_setConsolidationValues(type, form, request);
    } catch (e) {
        mt_so_logError(e);
        throw e;
    }
}


/**
 * Performs actions immediately following a write event on a record.
 *
 * @appliedtorecord salesorder
 *
 * @param {String} type Operation types: create, edit, delete, xedit,
 *                      approve, cancel, reject (SO, ER, Time Bill, PO & RMA only)
 *                      pack, ship (IF only)
 *                      dropship, specialorder, orderitems (PO only)
 *                      paybills (vendor payments)
 * @returns {Void}
 */
function mt_so_beforeSubmit(type) {
    nlapiLogExecution('DEBUG', 'Before Submit - Type: ' + type, '');
    try {
        mt_so_setBillingSchedule(type);
        mt_so_setFrequency(type);
        mt_so_setRevRecEndDate(type);
    } catch (e) {
        mt_so_logError(e);
        throw e;
    }
}


/**
 * Performs actions immediately following a write event on a record.
 *
 * @appliedtorecord job
 *
 * @param {String} type Operation types: create, edit, delete, xedit,
 *                      approve, cancel, reject (SO, ER, Time Bill, PO & RMA only)
 *                      pack, ship (IF only)
 *                      dropship, specialorder, orderprojects (PO only)
 *                      paybills (vendor payments)
 * @returns {Void}
 */
function mt_so_afterSubmit(type) {
    nlapiLogExecution('DEBUG', 'After Submit - Type: ' + type, '');
    try {
        scg_ra_updateRevenueArrangement(type);
        //mt_so_setFields(type);
    } catch (e) {
        mt_so_logError(e);
        throw e;
    }
}


/**
 * Writes an error message to the Script Execution Log
 *
 * @param {nlobjError} e - The NetSuite Error object passed in from the calling function
 *
 * @returns {Void}
 */
function mt_so_logError(e) {
    // Log the error based on available details
    if (e instanceof nlobjError) {
        nlapiLogExecution('ERROR', 'System Error', e.getCode() + '\n' + e.getDetails());
    } else {
        nlapiLogExecution('ERROR', 'Unexpected Error', e.toString());
    }
}


/**
 * Sets the value of the Consolidation column
 *
 * @appliedtorecord salesorder
 *
 * @param {String} type Operation types: create, edit, view, copy, print, email
 * @param {nlobjForm} form Current form
 * @param {nlobjRequest} request Request object
 * @returns {Void}
 */
function mt_so_setConsolidationValues(type, form, request) {
    // Initialize variables
    var orderType = nlapiGetFieldValue('custbody_order_type');
    var count = nlapiGetLineItemCount('item');

    // Only run on View when Order Type is Existing - Consolidation
    if (type != 'view' || orderType != CONSOLIDATION)
        return;

    for (var i = 1; i <= count; i++) {
        var consolidationSource = nlapiGetLineItemValue('item', 'custcol_consolidation_source', i);
        if (consolidationSource) {
            //nlapiSetLineItemValue('item', 'custcol_is_consolidated_line', i, mt_so_getConsolidationValues(JSON.parse(consolidationSource)));
            nlapiSetLineItemValue('item', 'custcol_is_consolidated_line', i, '<div style="text-align: center;"><a class="dottedlink" onclick="window.open(\'' + CONSOLIDATION_URL + '&soid=' + nlapiGetRecordId() + '&lineid=' + nlapiGetLineItemValue('item', 'custcol_salesforce_line_id', i) + '\', \'_blank\', \'location=no,height=150,width=450\')">Yes</a></div>');
        }
    }
}


/**
 * Records the Frequency value from the Billing Schedule associated with each line item
 *
 * @appliedtorecord salesorder
 *
 * @param {String} type Operation types: create, edit, delete, xedit
 *                      approve, reject, cancel (SO, ER, Time Bill, PO & RMA only)
 *                      pack, ship (IF)
 *                      markcomplete (Call, Task)
 *                      reassign (Case)
 *                      editforecast (Opp, Estimate)
 * @returns {Void}
 */
function mt_so_setFrequency(type) {
    // Only run for new or edited
    if (type != 'edit')
        return;
    nlapiLogExecution('DEBUG', 'setFrequency - Type: ' + type, '');

    // Record the Billing Frequency in each line
    var soRec = nlapiGetNewRecord();
    nlapiLogExecution('debug', 'soRec - Start', JSON.stringify(soRec));
    var count = soRec.getLineItemCount('item');
    for(var i = 1; i <= count; i++){
        nlapiSelectLineItem('item', i);
        var billingSchedule = soRec.getCurrentLineItemValue('item', 'billingschedule');
        var frequency = (billingSchedule) ? nlapiLookupField('billingschedule', billingSchedule, 'frequency') : null;

        // For each billing schedule frequency value assign the billing frequency field the associated number
        switch(frequency){
            case 'MONTHLY':
                soRec.setCurrentLineItemValue('item', 'custcol_billing_frequency', '1');
                break;
            case 'QUARTERLY':
                soRec.setCurrentLineItemValue('item', 'custcol_billing_frequency', '2');
                break;
            case 'SEMIANNUALLY':
                soRec.setCurrentLineItemValue('item', 'custcol_billing_frequency', '3');
                break;
            case 'ANNUALLY':
                soRec.setCurrentLineItemValue('item', 'custcol_billing_frequency', '4');
                break;
            case 'CUSTOM':
                soRec.setCurrentLineItemValue('item', 'custcol_billing_frequency', '9');
                break;
            default:
                soRec.setCurrentLineItemValue('item', 'custcol_billing_frequency', '');
        }

        // Commit changes to the line
        nlapiCommitLineItem('item');
    }
    nlapiLogExecution('debug', 'soRec - End',  JSON.stringify(soRec));
}


/**
 * Sets fields on the Sales Order record
 *
 * @appliedtorecord customer
 *
 * @param {String} type Operation types: create, edit, view, copy, print, email
 * @returns {Void}
 */
function mt_so_setFields(type) {
    // Only set these fields in View mode
    if (type != 'create' && type != 'edit')
        return;

    // Initialize variables
    var externalid = nlapiGetFieldValue('externalid');

    // Update the record
    nlapiSubmitField(nlapiGetRecordType(), nlapiGetRecordId(), 'custbody_salesforce_id', externalid);
}


/**
 * The recordType (internal id) corresponds to the "Applied To" record in your script deployment.
 * @appliedtorecord recordType
 *
 * @param {String} type Operation types: create, edit, delete, xedit
 *                      approve, reject, cancel (SO, ER, Time Bill, PO & RMA only)
 *                      pack, ship (IF)
 *                      markcomplete (Call, Task)
 *                      reassign (Case)
 *                      editforecast (Opp, Estimate)
 * @returns {Void}
 */
function mt_so_setBillingSchedule(type){

    // Run on create edit
    if(type == 'edit'){
        nlapiLogExecution('DEBUG', 'setBillingSchedule - Type: ' + type, '');

        // Initialize Values
        var billingFreq = nlapiGetFieldValue('custbody_billing_frequency');

        // If there us no billing frequency then end script
        if(billingFreq == null || billingFreq == ""){
            return;
        }

        // Go Case by case to map the billing frequencies and billing schedules
        switch(billingFreq)
        {
            case MONTHLY:
                billingFreq = MONTHLY_IN_ADVANCE;
                break;
            case QUARTERLY:
                billingFreq = QUARTERLY_IN_ADVANCE;
                break;
            case SEMI_ANNUAL:
                billingFreq = SEMIANNUALLY_IN_ADVANCE;
                break;
            case ANNUAL:
                billingFreq = ANNUALLY;
                break;
            case MONTHLY_IN_ARREARS_BF:
                billingFreq = MONTHLY_IN_ARREARS;
                break;
            case QUARTERLY_IN_ARREARS_BF:
                billingFreq = QUARTERLY_IN_ARREARS;
                break;
//			case CUSTOM:
            default:
                billingFreq = null;
                break;
        }

        // If the billing frequency is null then end the function
        if(billingFreq == null){
            return;
        }

        var count = nlapiGetLineItemCount('item');

        // Loop through the items
        for(var i = 1; i <= count; i++){

            var billingSchedule = nlapiGetLineItemValue('item', 'billingschedule', i);

            //if the billing schedule column is empty then set it
            if(billingSchedule == "" || billingSchedule == null){

                nlapiSetLineItemValue('item', 'billingschedule', i, billingFreq);
                nlapiCommitLineItem('item');
            }
        }

    }

}

/**
 * Set the rev rec start and end date based on non-inventory item subscription start and end dates
 * Set the service item rev rec end date based on the subscription end date
 * If the item is a service item, the order type is renewal and renewal service change checkbox is not checked
 * use the subscription start date for the rev rec start date
 *
 * @appliedtorecord salesorder
 *
 * @param {String} type Operation types: create, edit, delete, xedit
 *                      approve, reject, cancel (SO, ER, Time Bill, PO & RMA only)
 *                      pack, ship (IF)
 *                      markcomplete (Call, Task)
 *                      reassign (Case)
 *                      editforecast (Opp, Estimate)
 * @returns {Void}
 */
function mt_so_setRevRecEndDate(type) {

    // Only run for new or edited
    if (type != 'create' && type != 'view')
        return;

    // Record the Subscription end date in each line
    var soRec = nlapiGetNewRecord();
    nlapiLogExecution('debug', 'soRec - Start', JSON.stringify(soRec));
    var count = soRec.getLineItemCount('item');

    for(var i = 1; i <= count; i++){

        nlapiSelectLineItem('item', i);

        // Initialize Values
        var itemType = soRec.getCurrentLineItemValue('item', 'itemtype');
        var subscriptionEndDate = soRec.getCurrentLineItemValue('item', 'custcol_subscription_end');
        var subscriptionStartDate = soRec.getCurrentLineItemValue('item', 'custcol_subscription_start');
        var orderType = soRec.getFieldValue('custbody_order_type');
        var renewalCheckbox = soRec.getFieldValue('custbody_renewal_service_change');

        // If it is a non-inventory part number set the rev rec start and end date
        if(itemType == 'NonInvtPart'){

            // Set the rev rec start and end date value
            soRec.setCurrentLineItemValue('item', 'custcol_revrec_end', subscriptionEndDate);
            soRec.setCurrentLineItemValue('item', 'custcol_revrec_start', subscriptionStartDate);
        }

        // If it is a service item then set the subscription end date
        else if(itemType == 'Service'){

            // Set the rev rec end date value
            soRec.setCurrentLineItemValue('item', 'custcol_revrec_end', subscriptionEndDate);

            // If order type is renewal and checkbox is false then set revrec start date
            if(orderType == RENEWAL && renewalCheckbox == 'F'){

                soRec.setCurrentLineItemValue('item', 'custcol_revrec_start', subscriptionStartDate);
            }

        }

        // Commit changes to the line
        nlapiCommitLineItem('item');
    }

    nlapiLogExecution('debug', 'soRec - End',  JSON.stringify(soRec));
}