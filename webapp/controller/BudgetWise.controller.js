sap.ui.define([
	"Z_Fixed_Cost_Report_FCR/controller/View1.controller", // Inherit View1 for OData & Dialogs
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
], function(View1Controller, JSONModel, NumberFormat, Button, Dialog, List, StandardListItem, SearchField, Filter, FilterOperator,
	MessageToast, MessageBox, File) {
	"use strict";

	return View1Controller.extend("Z_Fixed_Cost_Report_FCR.controller.BudgetWise", {
		onInit: function() {
			this._bIsInitiallyLoaded = false; // Prevents reloading on Nav Back

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
			};

			this.getView().setModel(new JSONModel({
				companyCode: "1100",
				fiscalYear: String(new Date().getFullYear()),
				period: "",
				// glGroup: "",
				// glAccount: "",
				// costCenterGroup: "",
				// costCenter: ""
				glGroup: [], // Changed to Array
				glAccount: [], // Changed to Array
				costCenterGroup: [], // Changed to Array
				costCenter: [] // Changed to Array
			}), "filters");

			this.getView().setModel(new JSONModel({
				companyCodes: this._mValueHelpData.companyCode || [],
				fiscalYears: this._mValueHelpData.fiscalYear,
				periods: this._mValueHelpData.period,
				glGroups: [],
				glAccounts: [],
				costCenterGroups: [],
				costCenters: []
			}), "lookups");

			this.getView().setModel(new JSONModel({
				glRows: [],
				glChartRows: [],
				nonGlRows: [],
				nonGlChartRows: [],
				top5ColumnData: [],
				top5PieData: []
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

			this._syncModeState("GL");
			this._updateSelectedParametersText();

			this.getOwnerComponent().getRouter().getRoute("budgetWise").attachPatternMatched(this._onBudgetRouteMatched, this);
		},

		_onBudgetRouteMatched: function() {
			var oShared = this.getOwnerComponent().getModel("shared");
			var oUi = this.getView().getModel("ui");
			var oNav = oShared && oShared.getProperty("/budgetNavigation");

			if (oNav) {
				this.getView().getModel("filters").setData({
					companyCode: oNav.companyCode || "1100",
					fiscalYear: oNav.fiscalYear || String(new Date().getFullYear()),
					period: oNav.fromPeriod || "",
					glGroup: [],
					glAccount: [],
					costCenterGroup: [],
					costCenter: []
				});
			}

			this._syncModeState(oUi.getProperty("/reportType") || "GL");
			this._updateSelectedParametersText();

			if (!this._bIsInitiallyLoaded) {
				var sCompanyCode = this.getView().getModel("filters").getProperty("/companyCode");
				if (sCompanyCode) {
					var that = this;
					setTimeout(function() {
						that._fetchBudgetData(false);
						that._bIsInitiallyLoaded = true;
					}, 50);
				}
			} else {
				this._updateKpisFromActiveMode();
			}
		},

		onAfterRendering: function() {
			// this._configureBudgetChart("budgetGlChart", "Current Yearly Budget by Cost Center and G/L Group");
			// this._configureBudgetChart("budgetNonGlChart", "Current Yearly Budget by Cost Center Group");
			
			this._configureBudgetChart("budgetGlChart", "Last Year Actual vs Current Year Budget by Cost Center and G/L Group");
			this._configureBudgetChart("budgetNonGlChart", "Last Year Actual vs Current Year Budget by Cost Center");

			this._configureTop5Charts();
			this._connectBudgetPopovers();
		},

		/**
		 * Helper function to format table cells to always show 2 decimals (e.g., 0.00, 300.00)
		 */
		formatTableAmount: function(vValue) {
			if (vValue === null || vValue === undefined || vValue === "") {
				return "0.00";
			}
			// Uses the SAPUI5 NumberFormat you already initialized in onInit to add commas and decimals
			return this._oAmountFormat ? this._oAmountFormat.format(Number(vValue)) : Number(vValue).toFixed(2);
		},

		// =========================================================
		// BACKEND DATA FETCHING LOGIC (ZBUDGET_AVL_SRV_SRV)
		// =========================================================

		_initBudgetOData: function() {
			var oBudgetModel = this.getOwnerComponent().getModel("budgetService");
			if (!oBudgetModel) {
				return Promise.reject(new Error("Budget Service OData model not found. Check manifest.json."));
			}
			// Wait for BOTH the default model (for Lookups) AND the budget model metadata
			return Promise.all([
				this._initOData(),
				oBudgetModel.metadataLoaded()
			]);
		},

		_readBudgetOData: function(sPath, sFilterString) {
			var oModel = this.getOwnerComponent().getModel("budgetService");
			return new Promise(function(resolve, reject) {
				if (!oModel) {
					reject(new Error("Budget Service OData model not found."));
					return;
				}

				// Bypass UI5's native filter parentheses by passing the exact string as a URL parameter
				var mParams = sFilterString ? {
					"$filter": sFilterString
				} : {};

				oModel.read(sPath, {
					urlParameters: mParams,
					success: function(oData) {
						resolve((oData && oData.results) ? oData.results : []);
					},
					error: function(oErr) {
						reject(oErr);
					}
				});
			});
		},

		_fetchBudgetData: function(bMarkRun) {
			var that = this;
			var oFilters = this.getView().getModel("filters").getData();
			var oUi = this.getView().getModel("ui");
			var oBudget = this.getView().getModel("budget");

			this._getBusyDialog().open();

			setTimeout(function() {
				var pReady = that._initBudgetOData();

				pReady.then(function() {
					var aCommonFilters = [];

					// 1. Standard Strings (BUILDS EXACT STRING FROM YOUR BACKEND TEST)
					if (oFilters.companyCode) {
						aCommonFilters.push("Bukrs eq '" + that._odataLiteral(oFilters.companyCode) + "'");
					}
					if (oFilters.fiscalYear) {
						aCommonFilters.push("Gjahr eq '" + that._odataLiteral(oFilters.fiscalYear) + "'");
					}
					if (oFilters.period) {
						// Removes leading zero (e.g., '03' becomes '3') exactly as tested in your backend GUI
						aCommonFilters.push("Monat eq '" + String(parseInt(oFilters.period, 10)) + "'");
					}

					// 2. Multi-Select Array Checks (Common)
					if (oFilters.costCenter && oFilters.costCenter.length > 0) {
						aCommonFilters.push("(" + oFilters.costCenter.map(function(oItem) {
							return "Kostl eq '" + that._odataLiteral(oItem.key) + "'";
						}).join(" or ") + ")");
					}
					if (oFilters.costCenterGroup && oFilters.costCenterGroup.length > 0) {
						aCommonFilters.push("(" + oFilters.costCenterGroup.map(function(oItem) {
							return "Co_grp eq '" + that._odataLiteral(oItem.key) + "'";
						}).join(" or ") + ")");
					}

					var sCommonFilter = aCommonFilters.join(" and ");

					// 3. GL Specific Array Checks
					var aGlFilters = aCommonFilters.slice();

					if (oFilters.glAccount && oFilters.glAccount.length > 0) {
						aGlFilters.push("(" + oFilters.glAccount.map(function(oItem) {
							return "Saknr eq '" + that._odataLiteral(oItem.key) + "'";
						}).join(" or ") + ")");
					}
					if (oFilters.glGroup && oFilters.glGroup.length > 0) {
						aGlFilters.push("(" + oFilters.glGroup.map(function(oItem) {
							return "Gl_grp eq '" + that._odataLiteral(oItem.key) + "'";
						}).join(" or ") + ")");
					}

					var sGlFilter = aGlFilters.join(" and ");

					// Call BOTH endpoints simultaneously passing the RAW STRINGS
					return Promise.all([
						that._readBudgetOData("/COWithGLSet", sGlFilter),
						that._readBudgetOData("/COWithoutGLSet", sCommonFilter)
					]);
				}).then(function(aResults) {
					var aRawGlData = aResults[0] || [];
					var aRawNonGlData = aResults[1] || [];

					// 1. Process and Store GL Data
					var aMappedGlRows = aRawGlData.map(that._mapGlRow.bind(that)).filter(Boolean);
					oBudget.setProperty("/glRows", aMappedGlRows);
					oBudget.setProperty("/glChartRows", that._createBudgetChartRows(aMappedGlRows, "GL"));

					// 2. Process and Store Non-GL Data
					var aMappedNonGlRows = aRawNonGlData.map(that._mapNonGlRow.bind(that)).filter(Boolean);
					oBudget.setProperty("/nonGlRows", aMappedNonGlRows);
					oBudget.setProperty("/nonGlChartRows", that._createBudgetChartRows(aMappedNonGlRows, "NONGL"));

					// if (aMappedGlRows.length === 0 && aMappedNonGlRows.length === 0) {
					// 	MessageToast.show("No budget records found for the selected parameters.");
					// }
					// =========================================================
					// MODERN CUSTOM "NO DATA" DIALOG
					// =========================================================
					if (aMappedGlRows.length === 0 && aMappedNonGlRows.length === 0) {
						if (!that._oNoDataDialog) {
							that._oNoDataDialog = new sap.m.Dialog({
								showHeader: false, // Hides the clunky top bar for a sleek look
								contentWidth: "24rem",
								content: [
									new sap.m.VBox({
										alignItems: "Center",
										justifyContent: "Center",
										items: [
											// 1. Large, elegant warning/search icon
											new sap.ui.core.Icon({
												src: "sap-icon://search", // or "sap-icon://alert"
												size: "4rem",
												color: "#E9730C"
											}).addStyleClass("fcrPulseIcon sapUiMediumMarginTop sapUiSmallMarginBottom"), // <-- ADDED fcrPulseIcon

											// 2. Strong Title
											new sap.m.Title({
												text: "No Records Found",
												level: "H2"
											}).addStyleClass("sapUiSmallMarginBottom"),

											// 3. Friendly, readable instructions
											new sap.m.Text({
												text: "We couldn't find any fixed cost records for your current parameters.",
												textAlign: "Center"
											}).addStyleClass("sapUiTinyMarginBottom")

											// new sap.m.Text({
											// 	text: "Try adjusting your Fiscal Year, Company Code, or clearing your specific GL/Profit Centre filters.",
											// 	textAlign: "Center"
											// })
										]
									}).addStyleClass("sapUiMediumMargin")
								],
								buttons: [
									new sap.m.Button({
										text: "Got it",
										type: "Emphasized", // Solid blue button
										press: function() {
											that._oNoDataDialog.close();
										}
									})
								]
							});
							that.getView().addDependent(that._oNoDataDialog);
						}
						that._oNoDataDialog.open();
					}
					// =========================================================

					that._applySearch(oUi.getProperty("/globalSearch") || "");
					that._updateKpisFromActiveMode();

					that._updateTop5Charts();

					that._refreshBudgetChartStyling();

					that._bIsInitiallyLoaded = true;

				}).catch(function(oErr) {
					MessageBox.error("Failed to load budget data from backend.", {
						details: (oErr && oErr.message) ? oErr.message : String(oErr || "")
					});
					that._getBusyDialog().close();
				}).finally(function() {
					that._getBusyDialog().close();
				});
			}, 50);
		},

		_mapGlRow: function(oRow) {
			var fLakhs = 100000; // Conversion factor
			var fYearlyBudget = Number(oRow.YrValue || 0) / fLakhs;
			var fOldYearlyValue = Number(oRow.OldyValue || 0) / fLakhs;
			var fPreviousTwoMonths = Number(oRow.PrevTwo || 0) / fLakhs;
			var fCurrentMonth = Number(oRow.CurrMonth || 0) / fLakhs;
			var sCostCenter = oRow.Kostl || "";
			var sGlAccount = oRow.Saknr || "";
			return {
				companyCode: oRow.Bukrs || "",
				fiscalYear: oRow.Gjahr || "",
				period: oRow.Monat || "",
				costCenter: sCostCenter,
				costCenterDesc: oRow.Ltext || "",
				coGroup: oRow.Co_grp || "",
				costCenterGroup: oRow.Co_grp || "",
				gl: sGlAccount,
				glAccount: sGlAccount,
				glDesc: oRow.Txt50 || "",
				glGroup: oRow.Gl_grp || "",
				yearlyBudget: fYearlyBudget,
				oldYearlyValue: fOldYearlyValue,
				previousTwoMonthsValue: fPreviousTwoMonths,
				currentMonthValue: fCurrentMonth,
				lastYearActual: fOldYearlyValue,
				budgetCurrentYear: fYearlyBudget,
				actualLastTwoMonths: fPreviousTwoMonths,
				upToCurrentMonth: fCurrentMonth
			};
		},

		_mapNonGlRow: function(oRow) {
			var fLakhs = 100000; // Conversion factor
			var fYearlyBudget = Number(oRow.YrValue || 0) / fLakhs;
			var fOldYearlyValue = Number(oRow.OldyValue || 0) / fLakhs;
			var fPreviousTwoMonths = Number(oRow.PrevTwo || 0) / fLakhs;
			var fCurrentMonth = Number(oRow.CurrMonth || 0) / fLakhs;
			var sCostCenter = oRow.Kostl || "";
			var sGlAccount = oRow.Saknr || "";
			return {
				companyCode: oRow.Bukrs || "",
				fiscalYear: oRow.Gjahr || "",
				period: oRow.Monat || "",
				coGroup: oRow.Co_grp || "",
				costCenterGroup: oRow.Co_grp || "",
				costCenter: sCostCenter,
				costCenterDesc: oRow.Ltext || "",
				gl: sGlAccount,
				glAccount: sGlAccount,
				yearlyBudget: fYearlyBudget,
				oldYearlyValue: fOldYearlyValue,
				previousTwoMonthsValue: fPreviousTwoMonths,
				currentMonthValue: fCurrentMonth,
				lastYearActual: fOldYearlyValue,
				budgetCurrentYear: fYearlyBudget,
				actualLastTwoMonths: fPreviousTwoMonths,
				upToCurrentMonth: fCurrentMonth
			};
		},

		_createBudgetChartRows: function(aRows, sMode) {
			return aRows.map(function(oRow) {
				return {
					name: sMode === "GL" ? (oRow.glGroup || oRow.gl || "") : (oRow.costCenterDesc || oRow.costCenter || ""),
					currentYearBudget: oRow.yearlyBudget,
					lastYearActual: oRow.oldYearlyValue,
					value: oRow.yearlyBudget
				};
			});
		},

		// =========================================================
		// KPI & UI UPDATES
		// =========================================================

		_updateKpisFromActiveMode: function() {
			var oUi = this.getView().getModel("ui");
			var oBudget = this.getView().getModel("budget");
			var bGlMode = oUi.getProperty("/isGlMode");
			var aRows = bGlMode ? (oBudget.getProperty("/glRows") || []) : (oBudget.getProperty("/nonGlRows") || []);
			var iKpi1 = 0,
				iKpi2 = 0,
				iKpi3 = 0,
				iKpi4 = 0;

			// Active KPI Calculation looping through backend data
			aRows.forEach(function(oRow) {
				iKpi1 += Number(oRow.yearlyBudget || 0);
				iKpi2 += Number(oRow.oldYearlyValue || 0);
				iKpi3 += Number(oRow.previousTwoMonthsValue || 0);
				iKpi4 += Number(oRow.currentMonthValue || 0);
			});

			oUi.setProperty("/kpi1Value", this._formatAmount(iKpi1));
			oUi.setProperty("/kpi2Value", this._formatAmount(iKpi2));
			oUi.setProperty("/kpi3Value", this._formatAmount(iKpi3));
			oUi.setProperty("/kpi4Value", this._formatAmount(iKpi4));
			oUi.setProperty("/recordCount", this._oIntegerFormat.format(aRows.length));
		},

		onSearch: function() {
			if (!this._validateMandatory()) {
				return;
			}
			this._updateSelectedParametersText();
			this._fetchBudgetData(true);
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
			this._applySearch(this.getView().getModel("ui").getProperty("/globalSearch") || "");

			setTimeout(function() {
				this._refreshBudgetChartStyling();
				this._connectBudgetPopovers();
			}.bind(this), 0);

			this._updateTop5Charts(); // Top 5
		},

		// =========================================================
		// STANDARD HELPERS & FORMATTERS
		// =========================================================

		formatLookupText: function(sKey, aItems) {
			return this._resolveLookupText(aItems, sKey);
		},

		setUpFiscalYear: function() {
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
			// return [{
			// 	key: "1",
			// 	text: "April"
			// }, {
			// 	key: "2",
			// 	text: "May"
			// }, {
			// 	key: "3",
			// 	text: "June"
			// }, {
			// 	key: "4",
			// 	text: "July"
			// }, {
			// 	key: "5",
			// 	text: "August"
			// }, {
			// 	key: "6",
			// 	text: "September"
			// }, {
			// 	key: "7",
			// 	text: "October"
			// }, {
			// 	key: "8",
			// 	text: "November"
			// }, {
			// 	key: "9",
			// 	text: "December"
			// }, {
			// 	key: "10",
			// 	text: "January"
			// }, {
			// 	key: "11",
			// 	text: "February"
			// }, {
			// 	key: "12",
			// 	text: "March"
			// }];
			return [{
				key: "1",
				text: "April",
				description: "1"
			}, {
				key: "2",
				text: "May",
				description: "2"
			}, {
				key: "3",
				text: "June",
				description: "3"
			}, {
				key: "4",
				text: "July",
				description: "4"
			}, {
				key: "5",
				text: "August",
				description: "5"
			}, {
				key: "6",
				text: "September",
				description: "6"
			}, {
				key: "7",
				text: "October",
				description: "7"
			}, {
				key: "8",
				text: "November",
				description: "8"
			}, {
				key: "9",
				text: "December",
				description: "9"
			}, {
				key: "10",
				text: "January",
				description: "10"
			}, {
				key: "11",
				text: "February",
				description: "11"
			}, {
				key: "12",
				text: "March",
				description: "12"
			}];
		},

		_syncModeState: function(sMode) {
			var oUi = this.getView().getModel("ui");
			var bGlMode = sMode === "GL";

			oUi.setProperty("/reportType", bGlMode ? "GL" : "NONGL");
			oUi.setProperty("/modeLabel", bGlMode ? this._mModeLabels.GL : this._mModeLabels.NONGL);
			oUi.setProperty("/isGlMode", bGlMode);
			oUi.setProperty("/isNonGlMode", !bGlMode);
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

		onReset: function() {
			var sMode = this.getView().getModel("ui").getProperty("/reportType") || "GL";
			this.getView().getModel("filters").setData({
				companyCode: "1100",
				fiscalYear: String(new Date().getFullYear()),
				period: "",
				glGroup: [],
				glAccount: [],
				costCenterGroup: [],
				costCenter: []
			});

			this._clearValueStates();
			this._syncModeState(sMode);
			this._updateSelectedParametersText();
			this.getView().getModel("budget").setData({
				glRows: [],
				glChartRows: [],
				nonGlRows: [],
				nonGlChartRows: [],
				top5ColumnData: [],
				top5PieData: []
			});
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

		// onGlGroupValueHelp: function() {
		// 	this._openSingleSelectValueHelp("G/L Group", "glGroups", "/glGroup");
		// },
		// onGlAccountValueHelp: function() {
		// 	this._openSingleSelectValueHelp("G/L Account", "glAccounts", "/glAccount");
		// },
		// onCostCenterGroupValueHelp: function() {
		// 	this._openSingleSelectValueHelp("Cost Center Group", "costCenterGroups", "/costCenterGroup");
		// },
		// onCostCenterValueHelp: function() {
		// 	this._openSingleSelectValueHelp("Cost Center", "costCenters", "/costCenter");
		// },

		// Use View 1's Multi-Select dialog for these 4 fields
		onGlGroupValueHelp: function() {
			this._openMultiSelectValueHelp("G/L Group", "glGroups", "/glGroup");
		},
		onGlAccountValueHelp: function() {
			this._openMultiSelectValueHelp("G/L Account", "glAccounts", "/glAccount");
		},
		onCostCenterGroupValueHelp: function() {
			this._openMultiSelectValueHelp("Cost Center Group", "costCenterGroups", "/costCenterGroup");
		},
		onCostCenterValueHelp: function() {
			this._openMultiSelectValueHelp("Cost Center", "costCenters", "/costCenter");
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
					// path: "lookups>/" + sLookupPath,
					// template: new StandardListItem({
					// 	title: "{lookups>key}",
					// 	description: "{lookups>text}"
					// })
					path: "lookups>/" + sLookupPath,
					template: new StandardListItem({
						title: sLookupPath === "periods" ? "{lookups>text}" : "{lookups>key}",
						description: sLookupPath === "periods" ? "{lookups>description}" : "{lookups>text}"
					})
				}
			});

			oList.attachSelectionChange(function(oEvent) {
				var oItem = oEvent.getParameter("listItem");
				if (oItem) sSelected = oItem.getBindingContext("lookups").getProperty("key");
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
				content: [oSearch, oList],
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

		// Override View 1's refresh function so it updates the bottom text when clicking "OK" in dialog
		_refreshSelectionTexts: function() {
			this._updateSelectedParametersText();
		},

		// Handle user clicking the 'x' on tokens to remove them
		onTokenUpdate: function(oEvent) {
			var oFiltersModel = this.getView().getModel("filters");
			var sType = oEvent.getParameter("type");

			if (sType === "removed") {
				var sId = oEvent.getSource().getId();
				if (sId.includes("costCenterGrpInputBudget")) oFiltersModel.setProperty("/costCenterGroup", []);
				else if (sId.includes("costCenterInputBudget")) oFiltersModel.setProperty("/costCenter", []);
				else if (sId.includes("glAccountInputBudget")) oFiltersModel.setProperty("/glAccount", []);
				else if (sId.includes("glGroupInputBudget")) oFiltersModel.setProperty("/glGroup", []);
			}

			this._updateSelectedParametersText();
		},

		_validateMandatory: function() {
			var oFilters = this.getView().getModel("filters").getData();
			var oUi = this.getView().getModel("ui");
			var bOk = true;
			var aMissing = [];

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

			if (!bOk) MessageBox.error("Please fill mandatory field(s): " + aMissing.join(", ") + ".");
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
			var bGlMode = this.getView().getModel("ui").getProperty("/isGlMode");

			var sCompany = "Company " + (oFilters.companyCode || "-");
			var sFY = "FY " + (oFilters.fiscalYear || "-");
			var sPeriod = oFilters.period ? this._resolveLookupText(oLookups.periods, oFilters.period) : "All periods";

			// Check lengths of arrays
			var sCostCenter = (oFilters.costCenter && oFilters.costCenter.length) ? oFilters.costCenter.length + " Cost Centers" :
				"All Cost Centers";
			var sCostCenterGroup = (oFilters.costCenterGroup && oFilters.costCenterGroup.length) ? oFilters.costCenterGroup.length +
				" Cost Center Groups" : "All Cost Center Groups";
			var sGlAccount = (oFilters.glAccount && oFilters.glAccount.length) ? oFilters.glAccount.length + " G/L Accounts" :
				"All G/L Accounts";

			var aTextParts = [sCompany, sFY, sPeriod, sCostCenter, sCostCenterGroup, sGlAccount];

			if (bGlMode) {
				var sGlGroup = (oFilters.glGroup && oFilters.glGroup.length) ? oFilters.glGroup.length + " G/L Groups" : "All G/L Groups";
				aTextParts.push(sGlGroup);
			}

			this.getView().getModel("ui").setProperty("/selectedParamsText", aTextParts.join(" | "));
		},

		_displayValue: function(sValue) {
			return String(sValue || "-");
		},

		_resolveLookupText: function(aItems, sKey) {
			var sValue = String(sKey || "");
			if (!sValue) return "";
			var oMatch = (aItems || []).filter(function(oItem) {
				return String(oItem.key) === sValue;
			})[0];
			return oMatch ? oMatch.text : sValue;
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
			if (!oBinding) return aRows.slice();
			var aContexts = oBinding.getContexts(0, oBinding.getLength());
			return aContexts.map(function(oContext) {
				return oContext.getObject();
			});
		},

		_applySearch: function(sQuery) {
			var oTarget = this._getActiveTableConfig();
			var oTable = oTarget && this.byId(oTarget.tableId);
			var s = String(sQuery || "").trim();

			if (!oTable || !oTable.getBinding("rows")) return;
			if (!s) {
				oTable.getBinding("rows").filter([]);
				return;
			}

			var aProps = this.getView().getModel("ui").getProperty("/isGlMode") ? ["costCenter", "costCenterDesc", "coGroup", "gl",
				"glAccount", "glDesc", "glGroup"
			] : ["coGroup", "costCenter", "costCenterDesc", "gl", "glAccount"];

			oTable.getBinding("rows").filter(new Filter({
				filters: aProps.map(function(sProp) {
					return new Filter(sProp, FilterOperator.Contains, s);
				}),
				and: false
			}));
		},

		_configureBudgetChart: function(sChartId, sTitle) {
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
					visible: true,
					position: "bottom"
				},
				layout: {
					padding: {
						bottom: 140,
						left: 20,
						right: 20,
						top: 20
					}
				},
				plotArea: {
					dataLabel: {
						visible: true
					},
					drawingEffect: "glossy",
					animation: {
						dataLoading: true
					},
					gap: {
						barSpacing: 1.8 // Match View 1 thickness
					}
				},
				interaction: {
					selectability: {
						mode: "multiple"
					}
				},
				categoryAxis: {
					title: {
						visible: true,
						text: sChartId === "budgetGlChart" ? "G/L Group" : "Cost Centre Description"
					},
					label: {
						visible: true,
						allowMultiline: true,
						linesOfWrap: 3,
						overlapBehavior: "wrap",
						rotation: true, // Angle labels like View 1
						angle: 30, // Angle labels like View 1
						maxWidth: 220,
						truncatedLabelRatio: 1,
						style: {
							fontSize: "11px",
							fontWeight: "bold"
						}
					}
				},
				valueAxis: {
					title: {
						visible: true,
						// text: "Last Year Vs Current Year Amount (Lakhs)"
						text: "Amount (Lakhs)"
					},
					label: {
						style: {
							fontSize: "11px"
						}
					}
				}
			});
			oVizFrame.data("configured", true);
		},

		// =========================================================
		// DYNAMIC CHART STYLING (Like View 1)
		// =========================================================

		_refreshBudgetChartStyling: function() {
			["budgetGlChart", "budgetNonGlChart"].forEach(function(sChartId) {
				var oVizFrame = this.byId(sChartId);
				if (!oVizFrame) {
					return;
				}

				oVizFrame.setVizProperties({
					legend: {
						visible: true,
						position: "bottom"
					},
					plotArea: {
						drawingEffect: "glossy",
						colorPalette: [
							this._colorForKey("Current Year Budget"),
							this._colorForKey("Last Year Actual")
						]
					}
				});
			}.bind(this));
		},

		_dataPointRulesForBudgetChart: function(sChartId) {
			var oBudget = this.getView().getModel("budget");
			var aRules = [];
			var sPath = sChartId === "budgetGlChart" ? "/glChartRows" : "/nonGlChartRows";
			var aData = oBudget.getProperty(sPath) || [];

			for (var i = 0; i < aData.length; i++) {
				var sName = aData[i].name;
				aRules.push({
					// This MUST match the DimensionDefinition name="Category" in your Budget XML
					dataContext: {
						"G/L Group": sName,
						"Cost Centre Description": sName
					},
					properties: {
						color: this._colorForKey(sName) // Inherited instantly from View1!
					}
				});
			}
			return aRules;
		},

		_paletteForBudgetChart: function(sChartId) {
			var oBudget = this.getView().getModel("budget");
			var aColors = [];
			var sPath = sChartId === "budgetGlChart" ? "/glChartRows" : "/nonGlChartRows";
			var aData = oBudget.getProperty(sPath) || [];

			for (var i = 0; i < aData.length; i++) {
				aColors.push(this._colorForKey(aData[i].name));
			}
			return aColors;
		},

		_connectBudgetPopovers: function() {
			[
				["budgetGlChart", "budgetGlPopover"],
				["budgetNonGlChart", "budgetNonGlPopover"],
				["top5ColumnChartGl", "top5ColumnPopoverGl"],
				["top5PieChartGl", "top5PiePopoverGl"],
				["top5ColumnChartNonGl", "top5ColumnPopoverNonGl"],
				["top5PieChartNonGl", "top5PiePopoverNonGl"]
			].forEach(function(aPair) {
				var oChart = this.byId(aPair[0]);
				var oPopover = this.byId(aPair[1]);
				if (oChart && oPopover) {
					oPopover.connect(oChart.getVizUid());
				}
			}.bind(this));
		},

		// =========================================================
		// TOP 5 SPLIT CHARTS LOGIC
		// =========================================================

		_updateTop5Charts: function() {
			var oBudget = this.getView().getModel("budget");
			var bGlMode = this.getView().getModel("ui").getProperty("/isGlMode");

			// Grab the existing loaded data based on active tab
			var aRows = bGlMode ? (oBudget.getProperty("/glRows") || []) : (oBudget.getProperty("/nonGlRows") || []);

			// 1. Sort for Left Column Chart (By Uploaded Yearly Budget)
			var aSortedForColumn = aRows.slice().sort(function(a, b) {
				return (b.yearlyBudget || 0) - (a.yearlyBudget || 0);
			}).slice(0, 5);

			var aColumnData = aSortedForColumn.map(function(oRow) {
				return {
					name: bGlMode ? (oRow.glGroup || oRow.gl || "") : (oRow.costCenterDesc || oRow.costCenter || ""),
					columnValue: oRow.yearlyBudget || 0
				};
			});

			// 2. Sort for Right Pie Chart (By Current Month Value)
			var aSortedForPie = aRows.slice().sort(function(a, b) {
				return (b.currentMonthValue || 0) - (a.currentMonthValue || 0);
			}).slice(0, 5);

			var aPieData = aSortedForPie.map(function(oRow) {
				return {
					name: bGlMode ? (oRow.glGroup || oRow.gl || "") : (oRow.costCenterDesc || oRow.costCenter || ""),
					pieValue: oRow.currentMonthValue || 0
				};
			});

			// Apply to model
			oBudget.setProperty("/top5ColumnData", aColumnData);
			oBudget.setProperty("/top5PieData", aPieData);

			// Apply dynamic colors
			this._refreshTop5ChartStyling();
		},

		_configureTop5Charts: function() {
			// Configure ALL 4 Top 5 Charts so they are ready when toggled
			["top5ColumnChartGl", "top5ColumnChartNonGl"].forEach(function(sId) {
				var oColChart = this.byId(sId);
				if (oColChart && !oColChart.data("configured")) {
					oColChart.setVizProperties({
						title: {
							visible: true,
							text: "Top 5 Current Year Budget"
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
								barSpacing: 1.5
							}
						},
						valueAxis: {
							title: {
								visible: true,
								text: "Amount (Lakhs)"
							}
						},
						categoryAxis: {
							label: {
								rotation: true,
								angle: 30,
								style: {
									fontSize: "10px",
									fontWeight: "bold"
								}
							}
						}
						// valueAxis: {
						// 	title: {
						// 		visible: true,
						// 		text: "Amount (Lakhs)"
						// 	}
						// }
					});
					oColChart.data("configured", true);
				}
			}.bind(this));

			["top5PieChartGl", "top5PieChartNonGl"].forEach(function(sId) {
				var oPieChart = this.byId(sId);
				if (oPieChart && !oPieChart.data("configured")) {
					oPieChart.setVizProperties({
						title: {
							visible: true,
							text: "Top 5 Current Month Value"
						},
						legend: {
							visible: true,
							position: "right"
						},
						plotArea: {
							dataLabel: {
								visible: true
							},
							drawingEffect: "glossy"
						}
					});
					oPieChart.data("configured", true);
				}
			}.bind(this));
		},

		_refreshTop5ChartStyling: function() {
			var oBudget = this.getView().getModel("budget");
			var bGlMode = this.getView().getModel("ui").getProperty("/isGlMode");

			// Figure out which exact chart IDs we should be styling based on the active tab
			var sColChartId = bGlMode ? "top5ColumnChartGl" : "top5ColumnChartNonGl";
			var sPieChartId = bGlMode ? "top5PieChartGl" : "top5PieChartNonGl";

			// Style Active Column Chart
			var oColChart = this.byId(sColChartId);
			if (oColChart) {
				var aColData = oBudget.getProperty("/top5ColumnData") || [];
				var aRules = aColData.map(function(d) {
					var sDimName = bGlMode ? "G/L Group" : "Cost Centre Description";
					return {
						dataContext: {
							[sDimName]: d.name
						},
						properties: {
							color: this._colorForKey(d.name)
						}
					};
				}.bind(this));
				var aColPalette = aColData.map(function(d) {
					return this._colorForKey(d.name);
				}.bind(this));

				oColChart.setVizProperties({
					plotArea: {
						colorPalette: aColPalette,
						dataPointStyle: {
							rules: aRules
						}
					}
				});
			}

			// Style Active Pie Chart
			var oPieChart = this.byId(sPieChartId);
			if (oPieChart) {
				var aPieData = oBudget.getProperty("/top5PieData") || [];
				var aPiePalette = aPieData.map(function(d) {
					return this._colorForKey(d.name);
				}.bind(this));
				oPieChart.setVizProperties({
					plotArea: {
						colorPalette: aPiePalette
					}
				});
			}
		},

		_getGlColumns: function() {
			return [{
				key: "costCenter",
				label: "Cost Center"
			}, {
				key: "costCenterDesc",
				label: "Cost Center Description"
			}, {
				key: "coGroup",
				label: "CO Group"
			}, {
				key: "gl",
				label: "G/L Account"
			}, {
				key: "glDesc",
				label: "G/L Description"
			}, {
				key: "glGroup",
				label: "G/L Group"
			}, {
				key: "yearlyBudget",
				label: "Uploaded Yearly Budget"
			}, {
				key: "oldYearlyValue",
				label: "Old Yearly Value"
			}, {
				key: "previousTwoMonthsValue",
				label: "Previous two months value"
			}, {
				key: "currentMonthValue",
				label: "Current Month Value"
			}];
		},

		_getNonGlColumns: function() {
			return [{
				key: "coGroup",
				label: "CO Group"
			}, {
				key: "costCenter",
				label: "Cost Center"
			}, {
				key: "costCenterDesc",
				label: "Cost Center Description"
			}, {
				key: "gl",
				label: "G/L Account"
			}, {
				key: "yearlyBudget",
				label: "Uploaded Yearly Budget"
			}, {
				key: "oldYearlyValue",
				label: "Old Yearly Value"
			}, {
				key: "previousTwoMonthsValue",
				label: "Previous two months value"
			}, {
				key: "currentMonthValue",
				label: "Current Month Value"
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
					if (typeof v === "number") v = this._formatAmount(v);
					return this._csvEscape(v);
				}.bind(this));
				aLines.push(aValues.join(","));
			}.bind(this));
			return aLines.join("\n");
		},

		_csvEscape: function(vValue) {
			var s = String(vValue == null ? "" : vValue);
			if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
			return s;
		}
	});
});