/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       29 Jun 2017     Greg DelVecchio  Copies Rev Rec date changes from Sales Transactions (SO, Cash Sale, Inv, CM) to Revenue Arrangement
 *
 */


/**
 * Copies Rev Rec dates from Sales Transaction to Revenue Arrangement
 *
 * @appliedtorecord salesorder
 * @appliedtorecord cashsale
 * @appliedtorecord invoice
 * @appliedtorecord creditmemo
 *
 * @param {String} type Operation types: create, edit, delete, xedit,
 *                      approve, cancel, reject (SO, ER, Time Bill, PO & RMA only)
 *                      pack, ship (IF only)
 *                      dropship, specialorder, orderitems (PO only) 
 *                      paybills (vendor payments)
 * @returns {Void}
 */
function scg_ra_updateRevenueArrangement(type) {
	// Only run on create or edit
	if (type != 'edit')
		return;
	
	// Initialize variables
	var oldSoRec = nlapiGetOldRecord();
	var newSoRec = nlapiGetNewRecord();
	
	// Look for lines with new/changed Rev Rec dates
	var linesToProcess = [];
	var itemCount = newSoRec.getLineItemCount('item');
	for (var i=1; itemCount != 0 && i <= itemCount; i++) {
		var revRecStart = newSoRec.getLineItemValue('item', 'custcol_revrec_start', i);
		var revRecEnd = newSoRec.getLineItemValue('item', 'custcol_revrec_end', i);
		var uniqueLineId = newSoRec.getLineItemValue('item', 'custcol_unique_line_id', i);
		var updateRevRec = newSoRec.getLineItemValue('item', 'custcol_update_rev_rec', i);
		var isChanged = (oldSoRec) ? scg_ra_compareDates(oldSoRec, uniqueLineId, revRecStart, revRecEnd) : (type == 'create') ? true : false;

		
		if (isChanged || updateRevRec == 'T') {
            linesToProcess.push({'solinenum': i, 'souniquelineid': uniqueLineId, 'revrecstart': revRecStart, 'revrecend': revRecEnd});
		}
	}
	
	nlapiLogExecution('DEBUG', 'linesToProcess.length', linesToProcess.length);
	
	// Update the Revenue Arrangement
	if (linesToProcess && linesToProcess.length > 0) {
		scg_ra_updateRevenueArrangementId(newSoRec, linesToProcess);
	}
}


/**
 * Compares Rev Rec dates between new and old versions of the invoice record
 *
 * @appliedtorecord salesorder
 * @appliedtorecord cashsale
 * @appliedtorecord invoice
 * @appliedtorecord creditmemo
 * 
 * @param {nlobjRecord} oldSoRec the version of the Invoice record prior to editing
 * @param {Integer} uniqueLineId the line whose rev rec dates are being compared
 * @param {String} revRecStart the rev rec start date
 * @param {String} revRecEnd the rev rec end date
 * 
 * @returns {Boolean}
 */
function scg_ra_compareDates(oldSoRec, uniqueLineId, revRecStart, revRecEnd) {
	// Initialize variables
	var isChanged = true;
	
	// Compare the rev rec dates
	var lineNumber = nlapiFindLineItemValue('item', 'lineuniquekey', uniqueLineId);
	if (lineNumber > 0) {
		var oldRevRecStart = oldSoRec.getLineItemValue('item', 'custcol_revrec_start', lineNumber);
		var oldRevRecEnd = oldSoRec.getLineItemValue('item', 'custcol_revrec_end', lineNumber);
		if (oldRevRecStart == revRecStart && oldRevRecEnd == revRecEnd) {
			isChanged = false;
		}
	}
	
	// Return result
	return isChanged;
}


/**
 * Updates the Revenue Arrangement with the new rec rec dates
 * 
 * @appliedtorecord revenuearrangement
 * 
 * @param {nlobjRecord} soRec the Sales Order record
 * @param {Object} linesToProcess an object containing info required to update rev rec dates on the rev arrangement
 * 
 * @returns {Void}
 */
function scg_ra_updateRevenueArrangementId(soRec, linesToProcess) {
	// Initialize variables
	var revArrRec = scg_ra_getRevenueArrangement(soRec);
	var isModified = false;
	
	// Set the rev rec dates on the revenue element lines
	for (var i=0; revArrRec && linesToProcess != null && i < linesToProcess.length; i++) {
		var lineNumber = revArrRec.findLineItemValue('revenueelement', 'sourceid', linesToProcess[i]['souniquelineid']);
		nlapiLogExecution('DEBUG', 'Line Number', lineNumber);
		if (lineNumber > 0) {
			
			var existingStartDate = revArrRec.getLineItemValue('revenueelement', 'revrecstartdate', lineNumber);
			var existingEndDate = revArrRec.getLineItemValue('revenueelement', 'revrecenddate', lineNumber);
			if(!IsNullOrEmpty(existingStartDate) || !IsNullOrEmpty(existingEndDate)){
				revArrRec.setLineItemValue('revenueelement', 'custcol_revenue_dates_updated', lineNumber, 'T');				
			}
			
			
			revArrRec.setLineItemValue('revenueelement', 'revrecstartdate', lineNumber, linesToProcess[i]['revrecstart']);
			revArrRec.setLineItemValue('revenueelement', 'revrecenddate', lineNumber, linesToProcess[i]['revrecend']);
			revArrRec.setLineItemValue('revenueelement', 'forecaststartdate', lineNumber, linesToProcess[i]['revrecstart']);
			revArrRec.setLineItemValue('revenueelement', 'forecastenddate', lineNumber, linesToProcess[i]['revrecend']);
			isModified = true;
		}
	}
	
	
	// Commit the changes to the revenue arrangement process
	if (isModified) {
		nlapiSubmitRecord(revArrRec);
	}
}


/**
 * Returns the revenue arrangement associated with a sales order
 *
 * @appliedtorecord salesorder
 * @appliedtorecord cashsale
 * @appliedtorecord invoice
 * @appliedtorecord creditmemo
 *
 * @param {nlobjRecord} soRec the Sales Order record
 * 
 * @returns {nlobjRecord}
 */
function scg_ra_getRevenueArrangement(soRec) {
	// Initialize variables
	var revArrRecId = null;
	var revArrRec = null;
	
	var recType = soRec.getRecordType();
	
	// Loop through the sales order's list of related records
	var itemCount = recType != 'invoice' ? soRec.getLineItemCount('links') : soRec.getLineItemCount('arrngrlrcds');
	
	nlapiLogExecution('DEBUG', 'itemCount', itemCount);
	
	for (var i=1; !revArrRecId && itemCount != 0 && i <= itemCount; i++) {
		if(recType != 'invoice'){
			var linkUrl = soRec.getLineItemValue('links', 'linkurl', i);
			if (linkUrl && linkUrl.indexOf('revarrng') > 0) {
				revArrRecId = soRec.getLineItemValue('links', 'id', i);
			}
		} else {
			revArrRecId = soRec.getLineItemValue('arrngrlrcds', 'appldatekey', i);
		}
	}
	
	// Get the revenue arrangement object
	revArrRec = (revArrRecId) ? nlapiLoadRecord('revenuearrangement', revArrRecId) : null;
	
	
	nlapiLogExecution('DEBUG', 'revArrRec', revArrRecId);

	
	// Return record
	return revArrRec;
}

function IsNullOrEmpty(testObj){
	
	if(testObj != null && testObj != "" && testObj != undefined){
		return false;
	}else{
		return true;
	}
}