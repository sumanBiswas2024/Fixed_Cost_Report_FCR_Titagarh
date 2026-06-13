sap.ui.define([
	"sap/ui/core/UIComponent",
	"sap/ui/Device",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/odata/v2/ODataModel",
	"Z_Fixed_Cost_Report_FCR/model/models"
], function(UIComponent, Device, JSONModel, ODataModel, models) {
	"use strict";

	return UIComponent.extend("Z_Fixed_Cost_Report_FCR.Component", {

		metadata: {
			manifest: "json"
		},

		/**
		 * The component is initialized by UI5 automatically during the startup of the app and calls the init method once.
		 * @public
		 * @override
		 */
		init: function() {
			// call the base component's init function
			UIComponent.prototype.init.apply(this, arguments);

			// set the device model
			this.setModel(models.createDeviceModel(), "device");
			// this.setModel(new ODataModel("/sap/opu/odata/sap/ZBUDGET_AVL_SRV_SRV/", {
			// 	useBatch: true,
			// 	defaultCountMode: "Inline"
			// }), "budgetService");
			this.setModel(new JSONModel({
				mainReportType: "all",
				budgetNavigation: null
			}), "shared");
			this.getRouter().initialize();
		}
	});
});