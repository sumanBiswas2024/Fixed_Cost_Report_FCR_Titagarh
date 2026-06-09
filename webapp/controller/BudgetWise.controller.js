sap.ui.define([
	"Z_Fixed_Cost_Report_FCR/controller/View1.controller",
	"sap/ui/model/json/JSONModel",
	"sap/ui/core/format/NumberFormat",
	"sap/m/MessageToast",
	"sap/m/MessageBox"
], function(View1Controller, JSONModel, NumberFormat, MessageToast, MessageBox) {
	"use strict";

	return View1Controller.extend("Z_Fixed_Cost_Report_FCR.controller.BudgetWise", {
		onInit: function() {
			this.setUpFiscalYear();

			this._oODataModel = null;
			this._oODataReady = null;
			this._oAmountFormat = NumberFormat.getFloatInstance({
				groupingEnabled: true,
				minFractionDigits: 2,
				maxFractionDigits: 2
			});
			this._oIntegerFormat = NumberFormat.getIntegerInstance({
				groupingEnabled: true
			});
			this._oPercentFormat = NumberFormat.getFloatInstance({
				groupingEnabled: true,
				minFractionDigits: 1,
				maxFractionDigits: 1
			});
			this._mQuarterPeriods = {
				Q1: [1, 2, 3],
				Q2: [4, 5, 6],
				Q3: [7, 8, 9],
				Q4: [10, 11, 12]
			};
			this._mGroupNames = {};
			this._aPeriodMonthNames = ["", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

			this.getView().setModel(new JSONModel({
				companyCode: "1100",
				fiscalYear: "2026",
				period: "",
				profitCenters: [],
				glGroups: []
			}), "filters");

			this.getView().setModel(new JSONModel({
				companyCodes: [],
				profitCenters: [],
				glGroups: [],
				quarters: [],
				periods: this._createPeriodLookups()
			}), "lookups");

			this.getView().setModel(new JSONModel({
				budgetRows: [],
				budgetChart: []
			}), "fcr");

			this.getView().setModel(new JSONModel({
				reportType: "budget",
				companyCodeState: "None",
				fiscalYearState: "None",
				periodState: "None",
				globalSearch: "",
				periodText: "",
				lastRunText: "Ready to run",
				totalActual: "0",
				totalBudget: "0",
				totalVariance: "0",
				recordCount: "0",
				maxGlGroupName: "None",
				maxGlGroupValue: "0",
				lastTwoMonthsTotal: "0"
			}), "ui");

			this._initOData().catch(function(oErr) {
				MessageBox.error("Unable to initialize OData service ZO_FCR_SRV.", {
					details: (oErr && oErr.message) ? oErr.message : String(oErr || "")
				});
			});

			this.getOwnerComponent().getRouter().getRoute("budgetWise").attachPatternMatched(this._onBudgetRouteMatched, this);
		},

		_onBudgetRouteMatched: function() {
			var oShared = this.getOwnerComponent().getModel("shared");
			var oNav = oShared && oShared.getProperty("/budgetNavigation");
			if (oNav) {
				this._applySharedFilters(oNav);
			}
			this.getView().getModel("ui").setProperty("/reportType", "budget");
			this._getBusyDialog().close();

			if (this.getView().getModel("filters").getProperty("/period")) {
				this._applyBudgetFilters(false);
			} else {
				this._updateBudgetPeriodText();
			}
		},

		_applySharedFilters: function(oNav) {
			var oFilters = this.getView().getModel("filters");
			oFilters.setData({
				companyCode: oNav.companyCode || "1100",
				fiscalYear: oNav.fiscalYear || "2026",
				period: this._deriveBudgetPeriodFromMainFilters(oNav),
				profitCenters: (oNav.profitCenters || []).slice(),
				glGroups: (oNav.glGroups || []).slice()
			});
		},

		_deriveBudgetPeriodFromMainFilters: function(oNav) {
			var sFrom = String(oNav.fromPeriod || "").trim();
			var sTo = String(oNav.toPeriod || "").trim();
			var aQuarters = oNav.quarters || [];
			var sQuarter;

			if (sFrom) {
				return sFrom;
			}
			if (sTo) {
				return sTo;
			}
			if (aQuarters.length === 1) {
				sQuarter = aQuarters[0].key;
				if (this._mQuarterPeriods[sQuarter]) {
					return String(this._mQuarterPeriods[sQuarter][2]);
				}
			}
			return "";
		},

		onBudgetPeriodValueHelp: function() {
			this._openSingleSelectValueHelp("Period", "periods", "/period");
		},

		onSearch: function() {
			if (!this._validateBudgetMandatory()) {
				return;
			}
			this._applyBudgetFilters(true);
			MessageToast.show("Budget wise report refreshed");
		},

		onReset: function() {
			this.getView().getModel("filters").setData({
				companyCode: "1100",
				fiscalYear: "2026",
				period: "",
				profitCenters: [],
				glGroups: []
			});
			this.getView().getModel("ui").setProperty("/globalSearch", "");
			this.getView().getModel("fcr").setData({
				budgetRows: [],
				budgetChart: []
			});
			this._resetBudgetKpis();
			this._updateBudgetPeriodText();
			MessageToast.show("Reset All Parameters");
		},

		onBack: function() {
			var oShared = this.getOwnerComponent().getModel("shared");
			var sMainReportType = (oShared && oShared.getProperty("/mainReportType")) || "all";
			this._getBusyDialog().open();
			this.getOwnerComponent().getRouter().navTo("main");
			oShared.setProperty("/mainReportType", sMainReportType);
		},

		onReportTypeChange: function(oEvent) {
			var sKey = oEvent.getSource().getSelectedKey() || oEvent.getParameter("key") || "";
			if (!sKey && oEvent.getParameter("item")) {
				sKey = oEvent.getParameter("item").getKey();
			}

			if (sKey === "budget") {
				this.getView().getModel("ui").setProperty("/reportType", "budget");
				return;
			}

			this._getBusyDialog().open();
			this.getOwnerComponent().getModel("shared").setProperty("/mainReportType", sKey || "all");
			this.getOwnerComponent().getRouter().navTo("main");
		},

		onUniversalSearch: function(oEvent) {
			var sQuery = oEvent.getSource().getValue() || "";
			this.getView().getModel("ui").setProperty("/globalSearch", sQuery);
			this._applyBudgetSearch(sQuery);
		},

		onExport: function() {
			if (!this._validateBudgetMandatory()) {
				return;
			}

			var oTable = this.byId("budgetTable");
			var aRows = this._getFilteredTableObjects(oTable, "fcr", "/budgetRows");
			if (!aRows.length) {
				MessageToast.show("No rows to export");
				return;
			}

			var sCsv = this._toCsv(aRows, this._getBudgetColumns());
			var oFilters = this.getView().getModel("filters").getData();
			var sName = "FCR_Budget_" + (oFilters.companyCode || "CC") + "_FY" + (oFilters.fiscalYear || "YYYY");
			sap.ui.core.util.File.save(sCsv, sName, "csv", "text/csv");
		},

		_validateBudgetMandatory: function() {
			var oFilters = this.getView().getModel("filters").getData();
			var oUiModel = this.getView().getModel("ui");
			var bOk = true;
			var aMissing = [];
			var sPeriod = String(oFilters.period || "").trim();

			oUiModel.setProperty("/companyCodeState", "None");
			oUiModel.setProperty("/fiscalYearState", "None");
			oUiModel.setProperty("/periodState", "None");

			if (!(oFilters.companyCode || "").trim()) {
				oUiModel.setProperty("/companyCodeState", "Error");
				aMissing.push("Company Code");
				bOk = false;
			}

			if (!/^[0-9]{4}$/.test((oFilters.fiscalYear || "").trim())) {
				oUiModel.setProperty("/fiscalYearState", "Error");
				aMissing.push("Fiscal Year");
				bOk = false;
			}

			if (!sPeriod) {
				oUiModel.setProperty("/periodState", "Error");
				aMissing.push("Period");
				bOk = false;
			}

			if (!bOk) {
				MessageBox.error("Please fill mandatory field(s): " + aMissing.join(", ") + ".");
			}
			return bOk;
		},

		_applyBudgetFilters: function(bMarkRun) {
			var that = this;
			var oFilters = this.getView().getModel("filters").getData();
			var sBukrs = (oFilters.companyCode || "").trim();
			var sYear = (oFilters.fiscalYear || "").trim();
			var iPrevYear = parseInt(sYear, 10) - 1;
			var aProfitCenters = (oFilters.profitCenters || []).map(function(oItem) {
				return oItem.key;
			});
			var aGlGroups = (oFilters.glGroups || []).map(function(oItem) {
				return oItem.key;
			});
			var iSelectedPeriod = parseInt(oFilters.period, 10);

			this._getBusyDialog().open();

			this._initOData().then(function() {
				var aBaseFilters = [];
				if (sBukrs) {
					aBaseFilters.push("bukrs eq '" + that._odataLiteral(sBukrs) + "'");
				}
				if (aProfitCenters.length) {
					aBaseFilters.push("(" + aProfitCenters.map(function(s) {
						return "prctr eq '" + that._odataLiteral(s) + "'";
					}).join(" or ") + ")");
				}
				if (aGlGroups.length) {
					aBaseFilters.push("(" + aGlGroups.map(function(s) {
						return "gl_ac_group eq '" + that._odataLiteral(s) + "'";
					}).join(" or ") + ")");
				}

				var sCurrentFilter = aBaseFilters.concat(["ryear eq '" + that._odataLiteral(sYear) + "'"]).join(" and ");
				var sLastYearFilter = aBaseFilters.concat(["ryear eq '" + that._odataLiteral(String(iPrevYear)) + "'"]).join(" and ");

				return Promise.all([
					that._readODataPaged("/es_detailset", sCurrentFilter ? {
						"$filter": sCurrentFilter
					} : {}, 50000),
					that._readODataPaged("/es_detailset", sLastYearFilter ? {
						"$filter": sLastYearFilter
					} : {}, 50000)
				]);
			}).then(function(aResults) {
				var aCurrentRows = (aResults[0] || []).map(that._mapDetailRowFromOData.bind(that)).filter(Boolean);
				var aLastYearRows = (aResults[1] || []).map(that._mapDetailRowFromOData.bind(that)).filter(Boolean);
				var aBudgetRows = that._buildBudgetRows(aCurrentRows, aLastYearRows, iSelectedPeriod);

				that.getView().getModel("fcr").setProperty("/budgetRows", aBudgetRows);
				that.getView().getModel("fcr").setProperty("/budgetChart", that._buildBudgetChartRows(aBudgetRows));
				that._applyBudgetSearch(that.getView().getModel("ui").getProperty("/globalSearch") || "");
				that._updateBudgetPeriodText();
				that._updateBudgetKpis(aBudgetRows, bMarkRun);
				that._configureBudgetChart();

				if (!aBudgetRows.length) {
					MessageToast.show("No budget wise records found for the selected filters");
				}
			}).catch(function(oErr) {
				MessageBox.error("Unable to load budget wise report.", {
					details: (oErr && oErr.message) ? oErr.message : String(oErr || "")
				});
			}).finally(function() {
				that._getBusyDialog().close();
			});
		},

		_buildBudgetRows: function(aCurrentRows, aLastYearRows, iSelectedPeriod) {
			var mRows = {};
			var i;

			function ensureRow(oSource) {
				var sKey = [oSource.glAccount, oSource.glName, oSource.glGroup].join("|");
				if (!mRows[sKey]) {
					mRows[sKey] = {
						glAccount: oSource.glAccount,
						glName: oSource.glName,
						glGroup: oSource.glGroup,
						lastYearBudget: 0,
						currentYearBudget: 0,
						lastTwoMonthsBudget: 0,
						currentMonthBudget: 0
					};
				}
				return mRows[sKey];
			}

			aCurrentRows.forEach(function(oRow) {
				var oBudgetRow = ensureRow(oRow);
				var iLastTwoMonths = 0;
				for (i = Math.max(1, iSelectedPeriod - 2); i < iSelectedPeriod; i++) {
					iLastTwoMonths += oRow["p" + i] || 0;
				}
				oBudgetRow.currentYearBudget += oRow.total || 0;
				oBudgetRow.currentMonthBudget += oRow["p" + iSelectedPeriod] || 0;
				oBudgetRow.lastTwoMonthsBudget += iLastTwoMonths;
			});

			aLastYearRows.forEach(function(oRow) {
				var oBudgetRow = ensureRow(oRow);
				oBudgetRow.lastYearBudget += oRow.total || 0;
			});

			return Object.keys(mRows).map(function(sKey) {
				var oRow = mRows[sKey];
				oRow.lastYearBudgetText = this._formatAmount(oRow.lastYearBudget);
				oRow.currentYearBudgetText = this._formatAmount(oRow.currentYearBudget);
				oRow.lastTwoMonthsBudgetText = this._formatAmount(oRow.lastTwoMonthsBudget);
				oRow.currentMonthBudgetText = this._formatAmount(oRow.currentMonthBudget);
				return oRow;
			}.bind(this)).sort(function(a, b) {
				return b.currentYearBudget - a.currentYearBudget;
			});
		},

		_buildBudgetChartRows: function(aRows) {
			return (aRows || []).slice(0, 10).map(function(oRow) {
				return {
					name: oRow.glAccount + " - " + oRow.glName,
					value: oRow.currentYearBudget
				};
			});
		},

		_applyBudgetSearch: function(sQuery) {
			var oTable = this.byId("budgetTable");
			var s = (sQuery || "").trim();
			if (!oTable || !oTable.getBinding("rows")) {
				return;
			}

			if (!s) {
				oTable.getBinding("rows").filter([]);
				return;
			}

			oTable.getBinding("rows").filter(new sap.ui.model.Filter({
				filters: [
					new sap.ui.model.Filter("glAccount", sap.ui.model.FilterOperator.Contains, s),
					new sap.ui.model.Filter("glName", sap.ui.model.FilterOperator.Contains, s),
					new sap.ui.model.Filter("glGroup", sap.ui.model.FilterOperator.Contains, s)
				],
				and: false
			}));
		},

		_updateBudgetKpis: function(aRows, bMarkRun) {
			var iCurrentYear = 0;
			var iLastYear = 0;
			var iCurrentMonth = 0;
			var iLastTwoMonths = 0;
			var sTopName = "None";
			var iTopValue = 0;

			(aRows || []).forEach(function(oRow) {
				iCurrentYear += oRow.currentYearBudget || 0;
				iLastYear += oRow.lastYearBudget || 0;
				iCurrentMonth += oRow.currentMonthBudget || 0;
				iLastTwoMonths += oRow.lastTwoMonthsBudget || 0;
				if (Math.abs(oRow.currentYearBudget || 0) > iTopValue) {
					iTopValue = Math.abs(oRow.currentYearBudget || 0);
					sTopName = oRow.glAccount + " - " + oRow.glName;
				}
			});

			var oUi = this.getView().getModel("ui");
			oUi.setProperty("/totalActual", this._formatAmount(iCurrentYear));
			oUi.setProperty("/totalBudget", this._formatAmount(iLastYear));
			oUi.setProperty("/totalVariance", this._formatAmount(iCurrentMonth));
			oUi.setProperty("/lastTwoMonthsTotal", this._formatAmount(iLastTwoMonths));
			oUi.setProperty("/maxGlGroupName", sTopName);
			oUi.setProperty("/maxGlGroupValue", this._formatAmount(iTopValue));
			oUi.setProperty("/recordCount", this._oIntegerFormat.format((aRows || []).length));
			if (bMarkRun) {
				oUi.setProperty("/lastRunText", "Last run just now");
			}
		},

		_resetBudgetKpis: function() {
			var oUi = this.getView().getModel("ui");
			oUi.setProperty("/totalActual", "0");
			oUi.setProperty("/totalBudget", "0");
			oUi.setProperty("/totalVariance", "0");
			oUi.setProperty("/lastTwoMonthsTotal", "0");
			oUi.setProperty("/maxGlGroupName", "None");
			oUi.setProperty("/maxGlGroupValue", "0");
			oUi.setProperty("/recordCount", "0");
			oUi.setProperty("/lastRunText", "Ready to run");
		},

		_updateBudgetPeriodText: function() {
			var oFilters = this.getView().getModel("filters").getData();
			var aPeriods = this.getView().getModel("lookups").getProperty("/periods");
			var sPeriodText = this.formatLookupText(oFilters.period, aPeriods) || "Select period";
			var sProfitText = oFilters.profitCenters.length ? oFilters.profitCenters.length + " profit centres" : "All profit centres";
			var sGlText = oFilters.glGroups.length ? oFilters.glGroups.length + " GL groups" : "All GL groups";

			this.getView().getModel("ui").setProperty("/periodText",
				"Company " + (oFilters.companyCode || "-") + " | FY " + (oFilters.fiscalYear || "-") + " | " +
				sPeriodText + " | " + sProfitText + " | " + sGlText);
		},

		_configureBudgetChart: function() {
			var oVizFrame = this.byId("budgetChart");
			if (!oVizFrame) {
				return;
			}

			oVizFrame.setVizProperties({
				plotArea: {
					dataLabel: {
						visible: true
					},
					colorPalette: this._paletteForChart("allSummaryChart")
				},
				valueAxis: {
					title: {
						visible: true,
						text: "Current Year Budget (Lakhs)"
					}
				},
				categoryAxis: {
					title: {
						visible: false
					}
				},
				legend: {
					visible: false
				},
				title: {
					visible: false
				}
			});
		},

		_getBudgetColumns: function() {
			return [{
				key: "glAccount",
				label: "G/L Account"
			}, {
				key: "glName",
				label: "G/L Name"
			}, {
				key: "lastYearBudget",
				label: "Last Year Budget"
			}, {
				key: "currentYearBudget",
				label: "Current Year Budget"
			}, {
				key: "lastTwoMonthsBudget",
				label: "Last Two Months Budget"
			}, {
				key: "currentMonthBudget",
				label: "Current Month Budget"
			}];
		}
	});
});
