sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/model/json/JSONModel",
	"sap/ui/core/format/NumberFormat",
	"sap/m/Button",
	"sap/m/Dialog",
	"sap/m/List",
	"sap/m/StandardListItem",
	"sap/m/SearchField",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageToast",
	"sap/m/MessageBox",
	"sap/ui/core/util/File"
], function(Controller, JSONModel, NumberFormat, Button, Dialog, List, StandardListItem, SearchField, Filter, FilterOperator, MessageToast, MessageBox, File) {
	"use strict";

	return Controller.extend("Z_Fixed_Cost_Report_FCR.controller.BudgetWise", {
		onInit: function() {
			this._oAmountFormat = NumberFormat.getFloatInstance({
				groupingEnabled: true,
				minFractionDigits: 2,
				maxFractionDigits: 2
			});
			this._oIntegerFormat = NumberFormat.getIntegerInstance({
				groupingEnabled: true
			});

			this._mModeLabels = {
				GL: "G/L Group Wise",
				NONGL: "Non G/L wise"
			};

			this._mValueHelpData = {
				fiscalYear: this._createFiscalYearItems(),
				period: this._createPeriodItems()
				// glGroup: [
				// 	{ key: "GLG-1000", text: "GLG-1000 - Admin Expenses" },
				// 	{ key: "GLG-2000", text: "GLG-2000 - Plant Expenses" },
				// 	{ key: "GLG-3000", text: "GLG-3000 - Sales Expenses" }
				// ],
				// glAccount: [
				// 	{ key: "400100", text: "400100 - Salaries" },
				// 	{ key: "400200", text: "400200 - Repairs" },
				// 	{ key: "400300", text: "400300 - Travel" }
				// ],
				// costCenterGroup: [
				// 	{ key: "CCG-01", text: "CCG-01 - Factory Support" },
				// 	{ key: "CCG-02", text: "CCG-02 - Administration" },
				// 	{ key: "CCG-03", text: "CCG-03 - Commercial" }
				// ],
				// costCenter: [
				// 	{ key: "CC1001", text: "CC1001 - Head Office" },
				// 	{ key: "CC2001", text: "CC2001 - Plant A" },
				// 	{ key: "CC3001", text: "CC3001 - Sales North" }
				// ]
			};

			this.getView().setModel(new JSONModel({
				companyCode: "1100",
				fiscalYear: String(new Date().getFullYear()),
				period: "",
				glGroup: [],
				glAccount: [],
				costCenterGroup: [],
				costCenter: []
			}), "filters");

			this.getView().setModel(new JSONModel({
				companyCodes: this._mValueHelpData.companyCode,
				fiscalYears: this._mValueHelpData.fiscalYear,
				periods: this._mValueHelpData.period,
				glGroups: this._mValueHelpData.glGroup,
				glAccounts: this._mValueHelpData.glAccount,
				costCenterGroups: this._mValueHelpData.costCenterGroup,
				costCenters: this._mValueHelpData.costCenter
			}), "lookups");

			this.getView().setModel(new JSONModel({
				glRows: [],
				glChartRows: [],
				nonGlRows: [],
				nonGlChartRows: []
			}), "budget");

			this.getView().setModel(new JSONModel({
				pageTitle: "Fixed Cost Report - Budget Wise",
				reportType: "GL",
				modeLabel: this._mModeLabels.GL,
				isGlMode: true,
				isNonGlMode: false,
				companyCodeState: "None",
				fiscalYearState: "None",
				periodState: "None",
				glGroupState: "None",
				glAccountState: "None",
				costCenterGroupState: "None",
				costCenterState: "None",
				periodText: "",
				selectedParamsText: "",
				kpi1Label: "Total Current Year Budget",
				kpi2Label: "Total Last Year Actual",
				kpi3Label: "Total Last Two Months Actual",
				kpi4Label: "Total Up To Current Month",
				kpi1Value: "0.00",
				kpi2Value: "0.00",
				kpi3Value: "0.00",
				kpi4Value: "0.00",
				recordCount: "0"
			}), "ui");

			this._seedDemoData();
			this._syncModeState("GL");
			this._updateSelectedParametersText();
			this._updateKpisFromActiveMode();

			this.getOwnerComponent().getRouter().getRoute("budgetWise").attachPatternMatched(this._onBudgetRouteMatched, this);
		},

		_onBudgetRouteMatched: function() {
			this._syncModeState(this.getView().getModel("ui").getProperty("/reportType") || "GL");
			this._updateSelectedParametersText();
			this._updateKpisFromActiveMode();
		},

		onAfterRendering: function() {
			this._configureChart("budgetGlChart", "Budget by Cost Center and G/L Group");
			this._configureChart("budgetNonGlChart", "Budget by Cost Center Group");
		},

		formatLookupText: function(sKey, aItems) {
			return this._resolveLookupText(aItems, sKey);
		},

		setUpFiscalYear: function() {
			// Kept as a standalone helper so this view stays independent from View1.
			var aYears = [];
			var iCurrentYear = new Date().getFullYear();
			for (var i = iCurrentYear - 5; i <= iCurrentYear + 5; i++) {
				aYears.push({
					key: String(i),
					text: String(i)
				});
			}
			this.getView().setModel(new JSONModel({
				years: aYears
			}), "yearModel");
		},

		_createFiscalYearItems: function() {
			var aYears = [];
			var iCurrentYear = new Date().getFullYear();
			for (var i = iCurrentYear - 5; i <= iCurrentYear + 5; i++) {
				aYears.push({
					key: String(i),
					text: String(i)
				});
			}
			return aYears;
		},

		_createPeriodItems: function() {
			return [{
				key: "1",
				text: "1 - April"
			}, {
				key: "2",
				text: "2 - May"
			}, {
				key: "3",
				text: "3 - June"
			}, {
				key: "4",
				text: "4 - July"
			}, {
				key: "5",
				text: "5 - August"
			}, {
				key: "6",
				text: "6 - September"
			}, {
				key: "7",
				text: "7 - October"
			}, {
				key: "8",
				text: "8 - November"
			}, {
				key: "9",
				text: "9 - December"
			}, {
				key: "10",
				text: "10 - January"
			}, {
				key: "11",
				text: "11 - February"
			}, {
				key: "12",
				text: "12 - March"
			}];
		},

		onReportTypeChange: function(oEvent) {
			var sKey = "";
			var oSource = oEvent.getSource();
			if (oSource && oSource.getSelectedKey) {
				sKey = oSource.getSelectedKey() || "";
			}
			if (!sKey) {
				sKey = oEvent.getParameter("key") || "";
			}
			if (!sKey && oEvent.getParameter("item")) {
				sKey = oEvent.getParameter("item").getKey() || "";
			}

			if (sKey !== "NONGL") {
				sKey = "GL";
			}

			this._syncModeState(sKey);
			this._updateSelectedParametersText();
			this._updateKpisFromActiveMode();
		},

		_syncModeState: function(sMode) {
			var oUi = this.getView().getModel("ui");
			var bGlMode = sMode === "GL";

			oUi.setProperty("/reportType", bGlMode ? "GL" : "NONGL");
			oUi.setProperty("/modeLabel", bGlMode ? this._mModeLabels.GL : this._mModeLabels.NONGL);
			oUi.setProperty("/isGlMode", bGlMode);
			oUi.setProperty("/isNonGlMode", !bGlMode);

			// if (bGlMode) {
			// 	oUi.setProperty("/kpi1Label", "Current Year Budget");
			// } else {
			// 	oUi.setProperty("/kpi1Label", "Budget of the Current Year");
			// }
			// oUi.setProperty("/kpi2Label", "Last Year Actual");
			// oUi.setProperty("/kpi3Label", "Actual for the Last two months");
			// oUi.setProperty("/kpi4Label", "Up to Current Month");
		},

		onCompanyCodeChange: function() {
			this._updateSelectedParametersText();
		},

		onFiscalYearChange: function(oEvent) {
			var sValue = oEvent.getSource().getValue();
			var sYear = (sValue || "").replace(/\D/g, "").substr(0, 4);
			if (sYear && sYear.length === 4) {
				this.getView().getModel("filters").setProperty("/fiscalYear", sYear);
			}
			this._updateSelectedParametersText();
		},

		onPeriodChange: function() {
			this._updateSelectedParametersText();
		},

		onSearch: function() {
			if (!this._validateMandatory()) {
				return;
			}

			this._updateSelectedParametersText();
			this._updateKpisFromActiveMode();
			MessageToast.show("Budget view updated");
		},

		onReset: function() {
			var sMode = this.getView().getModel("ui").getProperty("/reportType") || "GL";
			this.getView().getModel("filters").setData({
				companyCode: "1100",
				fiscalYear: String(new Date().getFullYear()),
				period: "1",
				glGroup: "GLG-1000",
				glAccount: "400100",
				costCenterGroup: "CCG-02",
				costCenter: "CC1001"
			});

			this._clearValueStates();
			this._syncModeState(sMode);
			this._updateSelectedParametersText();
			this._updateKpisFromActiveMode();
			this._applySearch("");
			MessageToast.show("Reset all parameters");
		},

		onBack: function() {
			this.getOwnerComponent().getRouter().navTo("main");
		},

		onUniversalSearch: function(oEvent) {
			this._applySearch(oEvent.getSource().getValue() || "");
		},

		onExport: function() {
			if (!this._validateMandatory()) {
				return;
			}

			var oTarget = this._getActiveTableConfig();
			if (!oTarget) {
				MessageToast.show("Nothing to export");
				return;
			}

			var aRows = this._getVisibleRows(oTarget.tableId, oTarget.modelPath);
			if (!aRows.length) {
				MessageToast.show("No rows to export");
				return;
			}

			var sCsv = this._toCsv(aRows, oTarget.columns);
			var oFilters = this.getView().getModel("filters").getData();
			var sName = "FCR_Budget_" + (oFilters.companyCode || "CC") + "_FY" + (oFilters.fiscalYear || "YYYY") + "_" + oTarget.fileSuffix;
			File.save(sCsv, sName, "csv", "text/csv");
		},

		onGlGroupValueHelp: function() {
			this._openSingleSelectValueHelp("G/L Group", "glGroups", "/glGroup");
		},

		onGlAccountValueHelp: function() {
			this._openSingleSelectValueHelp("G/L Account", "glAccounts", "/glAccount");
		},

		onCostCenterGroupValueHelp: function() {
			this._openSingleSelectValueHelp("Cost Center Group", "costCenterGroups", "/costCenterGroup");
		},

		onCostCenterValueHelp: function() {
			this._openSingleSelectValueHelp("Cost Center", "costCenters", "/costCenter");
		},

		onPeriodValueHelp: function() {
			this._openSingleSelectValueHelp("Period", "periods", "/period");
		},

		onCompanyCodeValueHelp: function() {
			this._openSingleSelectValueHelp("Company Code", "companyCodes", "/companyCode");
		},

		_openSingleSelectValueHelp: function(sTitle, sLookupPath, sFilterPropPath) {
			var oView = this.getView();
			var oFiltersModel = oView.getModel("filters");
			var sCurrent = String(oFiltersModel.getProperty(sFilterPropPath) || "");
			var sSelected = sCurrent;
			var oList = new List({
				mode: "SingleSelectMaster",
				includeItemInSelection: true,
				items: {
					path: "lookups>/" + sLookupPath,
					template: new StandardListItem({
						title: "{lookups>key}",
						description: "{lookups>text}"
					})
				}
			});

			oList.attachSelectionChange(function(oEvent) {
				var oItem = oEvent.getParameter("listItem");
				if (!oItem) {
					return;
				}
				sSelected = oItem.getBindingContext("lookups").getProperty("key");
			});

			oList.attachUpdateFinished(function() {
				oList.getItems().forEach(function(oItem) {
					var sKey = oItem.getBindingContext("lookups").getProperty("key");
					oItem.setSelected(sKey === sCurrent);
				});
			});

			var oSearch = new SearchField({
				width: "100%",
				placeholder: "Search " + sTitle,
				liveChange: function(oEvent) {
					var sValue = oEvent.getParameter("newValue");
					var oBinding = oList.getBinding("items");
					var aFilters = [];
					if (sValue) {
						aFilters.push(new Filter({
							filters: [
								new Filter("key", FilterOperator.Contains, sValue),
								new Filter("text", FilterOperator.Contains, sValue)
							],
							and: false
						}));
					}
					oBinding.filter(aFilters);
				}
			});

			var oDialog = new Dialog({
				title: "Select " + sTitle,
				contentWidth: "32rem",
				contentHeight: "24rem",
				resizable: true,
				draggable: true,
				content: [
					oSearch,
					oList
				],
				beginButton: new Button({
					text: "OK",
					type: "Emphasized",
					press: function() {
						oFiltersModel.setProperty(sFilterPropPath, sSelected);
						this._updateSelectedParametersText();
						oDialog.close();
					}.bind(this)
				}),
				endButton: new Button({
					text: "Cancel",
					press: function() {
						oDialog.close();
					}
				}),
				afterClose: function() {
					oDialog.destroy();
				}
			});

			this.getView().addDependent(oDialog);
			oDialog.open();
		},

		_validateMandatory: function() {
			var oFilters = this.getView().getModel("filters").getData();
			var oUi = this.getView().getModel("ui");
			var bOk = true;
			var aMissing = [];
			var bGlMode = oUi.getProperty("/isGlMode");

			this._clearValueStates();

			if (!(oFilters.companyCode || "").trim()) {
				oUi.setProperty("/companyCodeState", "Error");
				aMissing.push("Company Code");
				bOk = false;
			}
			if (!/^[0-9]{4}$/.test((oFilters.fiscalYear || "").trim())) {
				oUi.setProperty("/fiscalYearState", "Error");
				aMissing.push("Fiscal Year");
				bOk = false;
			}
			// if (!(oFilters.period || "").trim()) {
			// 	oUi.setProperty("/periodState", "Error");
			// 	aMissing.push("Period");
			// 	bOk = false;
			// }
			// if (bGlMode && !(oFilters.glGroup || "").trim()) {
			// 	oUi.setProperty("/glGroupState", "Error");
			// 	aMissing.push("G/L Group");
			// 	bOk = false;
			// }
			// if (!(oFilters.glAccount || "").trim()) {
			// 	oUi.setProperty("/glAccountState", "Error");
			// 	aMissing.push("G/L Account");
			// 	bOk = false;
			// }
			// if (!(oFilters.costCenterGroup || "").trim()) {
			// 	oUi.setProperty("/costCenterGroupState", "Error");
			// 	aMissing.push("Cost Center Group");
			// 	bOk = false;
			// }
			// if (!(oFilters.costCenter || "").trim()) {
			// 	oUi.setProperty("/costCenterState", "Error");
			// 	aMissing.push("Cost Center");
			// 	bOk = false;
			// }

			if (!bOk) {
				MessageBox.error("Please fill mandatory field(s): " + aMissing.join(", ") + ".");
			}
			return bOk;
		},

		_clearValueStates: function() {
			var oUi = this.getView().getModel("ui");
			oUi.setProperty("/companyCodeState", "None");
			oUi.setProperty("/fiscalYearState", "None");
			oUi.setProperty("/periodState", "None");
			oUi.setProperty("/glGroupState", "None");
			oUi.setProperty("/glAccountState", "None");
			oUi.setProperty("/costCenterGroupState", "None");
			oUi.setProperty("/costCenterState", "None");
		},

		_updateSelectedParametersText: function() {
			var oFilters = this.getView().getModel("filters").getData();
			var oLookups = this.getView().getModel("lookups").getData();
			var sMode = this.getView().getModel("ui").getProperty("/modeLabel") || this._mModeLabels.GL;
			var bGlMode = this.getView().getModel("ui").getProperty("/isGlMode");
			var sText = ["Mode: " + sMode, "Company Code " + this._displayValue(oFilters.companyCode),
				"FY " + this._displayValue(oFilters.fiscalYear)];

			if (bGlMode) {
				sText.push("G/L Group " + this._displayValue(oFilters.glGroup));
			}

			sText.push("G/L Account " + this._displayValue(oFilters.glAccount));
			sText.push("Cost Center Group " + this._displayValue(oFilters.costCenterGroup));
			sText.push("Cost Center " + this._displayValue(oFilters.costCenter));
			sText.push("Period " + this._resolveLookupText(oLookups.periods, oFilters.period));

			this.getView().getModel("ui").setProperty("/selectedParamsText", sText.join(" | "));
			this.getView().getModel("ui").setProperty("/periodText", this._resolveLookupText(oLookups.periods, oFilters.period));
		},

		_displayValue: function(sValue) {
			return String(sValue || "-");
		},

		_resolveLookupText: function(aItems, sKey) {
			var sValue = String(sKey || "");
			var oMatch;

			if (!sValue) {
				return "-";
			}

			oMatch = (aItems || []).filter(function(oItem) {
				return String(oItem.key) === sValue;
			})[0];

			return oMatch ? oMatch.text : sValue;
		},

		_updateKpisFromActiveMode: function() {
			var oUi = this.getView().getModel("ui");
			var oBudget = this.getView().getModel("budget");
			var bGlMode = oUi.getProperty("/isGlMode");
			var aRows = bGlMode ? (oBudget.getProperty("/glRows") || []) : (oBudget.getProperty("/nonGlRows") || []);
			var iKpi1 = 0;
			var iKpi2 = 0;
			var iKpi3 = 0;
			var iKpi4 = 0;

			// aRows.forEach(function(oRow) {
			// 	iKpi1 += Number(oRow.budgetCurrentYear || 0);
			// 	iKpi2 += Number(oRow.lastYearActual || 0);
			// 	iKpi3 += Number(oRow.actualLastTwoMonths || 0);
			// 	iKpi4 += Number(oRow.upToCurrentMonth || 0);
			// });

			oUi.setProperty("/kpi1Value", this._formatAmount(iKpi1));
			oUi.setProperty("/kpi2Value", this._formatAmount(iKpi2));
			oUi.setProperty("/kpi3Value", this._formatAmount(iKpi3));
			oUi.setProperty("/kpi4Value", this._formatAmount(iKpi4));
			oUi.setProperty("/recordCount", this._oIntegerFormat.format(aRows.length));
		},

		_seedDemoData: function() {
			var oBudget = this.getView().getModel("budget");
			var aGlRows = [{
				costCenter: "CC1001",
				costCenterDesc: "Head Office",
				costCenterGroup: "CCG-02",
				gl: "400100",
				glDesc: "Salaries",
				glGroup: "GLG-1000",
				lastYearActual: 180.25,
				budgetCurrentYear: 220.75,
				actualLastTwoMonths: 34.5,
				upToCurrentMonth: 95.1
			}, {
				costCenter: "CC2001",
				costCenterDesc: "Plant A",
				costCenterGroup: "CCG-01",
				gl: "400200",
				glDesc: "Repairs",
				glGroup: "GLG-2000",
				lastYearActual: 98.15,
				budgetCurrentYear: 120.4,
				actualLastTwoMonths: 18.9,
				upToCurrentMonth: 43.25
			}, {
				costCenter: "CC3001",
				costCenterDesc: "Sales North",
				costCenterGroup: "CCG-03",
				gl: "400300",
				glDesc: "Travel",
				glGroup: "GLG-3000",
				lastYearActual: 64.8,
				budgetCurrentYear: 82.2,
				actualLastTwoMonths: 12.6,
				upToCurrentMonth: 29.75
			}];
			var aNonGlRows = [{
				costCenterGroup: "CCG-01",
				costCenter: "CC2001",
				costCenterDesc: "Plant A",
				lastYearActual: 198.3,
				budgetCurrentYear: 240.5,
				actualLastTwoMonths: 27.25,
				upToCurrentMonth: 110.4
			}, {
				costCenterGroup: "CCG-02",
				costCenter: "CC1001",
				costCenterDesc: "Head Office",
				lastYearActual: 152.9,
				budgetCurrentYear: 180.15,
				actualLastTwoMonths: 24.6,
				upToCurrentMonth: 88.9
			}, {
				costCenterGroup: "CCG-03",
				costCenter: "CC3001",
				costCenterDesc: "Sales North",
				lastYearActual: 76.45,
				budgetCurrentYear: 94.8,
				actualLastTwoMonths: 11.4,
				upToCurrentMonth: 37.2
			}];

			oBudget.setProperty("/glRows", aGlRows);
			oBudget.setProperty("/nonGlRows", aNonGlRows);
			oBudget.setProperty("/glChartRows", aGlRows.map(function(oRow) {
				return {
					name: oRow.costCenter + " - " + oRow.gl,
					value: oRow.budgetCurrentYear
				};
			}));
			oBudget.setProperty("/nonGlChartRows", aNonGlRows.map(function(oRow) {
				return {
					name: oRow.costCenterGroup + " - " + oRow.costCenter,
					value: oRow.budgetCurrentYear
				};
			}));
		},

		_formatAmount: function(vValue) {
			return this._oAmountFormat.format(Number(vValue || 0));
		},

		_getActiveTableConfig: function() {
			return this.getView().getModel("ui").getProperty("/isGlMode") ? {
				tableId: "budgetGlTable",
				modelPath: "/glRows",
				fileSuffix: "GL_Group_Wise",
				columns: this._getGlColumns()
			} : {
				tableId: "budgetNonGlTable",
				modelPath: "/nonGlRows",
				fileSuffix: "Non_GL_Wise",
				columns: this._getNonGlColumns()
			};
		},

		_getVisibleRows: function(sTableId, sModelPath) {
			var oTable = this.byId(sTableId);
			var oBudget = this.getView().getModel("budget");
			var aRows = oBudget.getProperty(sModelPath) || [];
			var oBinding = oTable && oTable.getBinding("rows");

			if (!oBinding) {
				return aRows.slice();
			}

			var aContexts = oBinding.getContexts(0, oBinding.getLength());
			return aContexts.map(function(oContext) {
				return oContext.getObject();
			});
		},

		_applySearch: function(sQuery) {
			var oTarget = this._getActiveTableConfig();
			var oTable = oTarget && this.byId(oTarget.tableId);
			var s = String(sQuery || "").trim();

			if (!oTable || !oTable.getBinding("rows")) {
				return;
			}

			if (!s) {
				oTable.getBinding("rows").filter([]);
				return;
			}

			var aProps = this.getView().getModel("ui").getProperty("/isGlMode") ? [
				"costCenter",
				"costCenterDesc",
				"costCenterGroup",
				"gl",
				"glDesc",
				"glGroup"
			] : [
				"costCenterGroup",
				"costCenter",
				"costCenterDesc"
			];

			oTable.getBinding("rows").filter(new Filter({
				filters: aProps.map(function(sProp) {
					return new Filter(sProp, FilterOperator.Contains, s);
				}),
				and: false
			}));
		},

		_configureChart: function(sChartId, sTitle) {
			var oVizFrame = this.byId(sChartId);
			if (!oVizFrame || oVizFrame.data("configured")) {
				return;
			}

			oVizFrame.setVizProperties({
				title: {
					visible: true,
					text: sTitle
				},
				legend: {
					visible: false
				},
				plotArea: {
					dataLabel: {
						visible: true
					},
					drawingEffect: "glossy",
					gap: {
						barSpacing: 1.8
					}
				},
				categoryAxis: {
					title: {
						visible: false
					},
					label: {
						visible: true,
						allowMultiline: true,
						linesOfWrap: 3,
						rotation: 0,
						angle: 0,
						maxWidth: 220
					}
				},
				valueAxis: {
					title: {
						visible: true,
						text: "Amount (Lakhs)"
					}
				}
			});
			oVizFrame.data("configured", true);
		},

		_getGlColumns: function() {
			return [{
				key: "costCenter",
				label: "Cost Center"
			}, {
				key: "costCenterDesc",
				label: "Cost Center Desc"
			}, {
				key: "costCenterGroup",
				label: "Cost Center Group"
			}, {
				key: "gl",
				label: "G/L"
			}, {
				key: "glDesc",
				label: "G/L Desc"
			}, {
				key: "glGroup",
				label: "G/L Group"
			}, {
				key: "lastYearActual",
				label: "Last Year Actual"
			}, {
				key: "budgetCurrentYear",
				label: "Budget of the Current Year"
			}, {
				key: "actualLastTwoMonths",
				label: "Actual for the Last two months"
			}, {
				key: "upToCurrentMonth",
				label: "up to Current Month"
			}];
		},

		_getNonGlColumns: function() {
			return [{
				key: "costCenterGroup",
				label: "Cost Center Group"
			}, {
				key: "costCenter",
				label: "Cost Center"
			}, {
				key: "costCenterDesc",
				label: "Cost Center desc"
			}, {
				key: "lastYearActual",
				label: "Last Year Actual"
			}, {
				key: "budgetCurrentYear",
				label: "Budget of the Current Year"
			}, {
				key: "actualLastTwoMonths",
				label: "Actual for the Last two months"
			}, {
				key: "upToCurrentMonth",
				label: "up to Current Month"
			}];
		},

		_toCsv: function(aRows, aColumns) {
			var aHeaders = aColumns.map(function(oCol) {
				return this._csvEscape(oCol.label);
			}.bind(this));
			var aLines = [aHeaders.join(",")];

			(aRows || []).forEach(function(oRow) {
				var aValues = aColumns.map(function(oCol) {
					var v = oRow[oCol.key];
					if (typeof v === "number") {
						v = this._formatAmount(v);
					}
					return this._csvEscape(v);
				}.bind(this));
				aLines.push(aValues.join(","));
			}.bind(this));

			return aLines.join("\n");
		},

		_csvEscape: function(vValue) {
			var s = String(vValue == null ? "" : vValue);
			if (/[",\n]/.test(s)) {
				return '"' + s.replace(/"/g, '""') + '"';
			}
			return s;
		}
	});
});