sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/model/json/JSONModel",
	"sap/ui/core/format/NumberFormat",
	"sap/m/Dialog",
	"sap/m/List",
	"sap/m/StandardListItem",
	"sap/m/Button",
	"sap/m/SearchField",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageToast"
], function(Controller, JSONModel, NumberFormat, Dialog, List, StandardListItem, Button, SearchField, Filter, FilterOperator, MessageToast) {
	"use strict";

	return Controller.extend("Z_Fixed_Cost_Report_FCR.controller.View1", {
		onInit: function() {
			this._oAmountFormat = NumberFormat.getFloatInstance({
				groupingEnabled: true,
				maxFractionDigits: 0
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

			this._mGroupNames = {
				LAB: "Labour and Benefits",
				POW: "Power and Utilities",
				REP: "Repairs and Maintenance",
				ADM: "Administration Overheads",
				DEP: "Depreciation",
				SEC: "Security and Facility"
			};
			this._aMonthNames = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

			this._aBaseRows = this._createBaseRows();

			this.getView().setModel(new JSONModel({
				companyCode: "1000",
				fiscalYear: "2026",
				profitCenters: [],
				glGroups: [],
				quarter: "Q1"
			}), "filters");

			this.getView().setModel(new JSONModel({
				profitCenters: this._createProfitCenters(),
				glGroups: this._createGlGroups(),
				quarters: [
					{ key: "Q1", text: "Q1 - Period 1 to 3" },
					{ key: "Q2", text: "Q2 - Period 4 to 6" },
					{ key: "Q3", text: "Q3 - Period 7 to 9" },
					{ key: "Q4", text: "Q4 - Period 10 to 12" }
				]
			}), "lookups");

			this.getView().setModel(new JSONModel({
				allDetailRows: [],
				allSummaryRows: [],
				allSummaryChart: [],
				topDetailRows: [],
				topSummaryRows: [],
				topSummaryChart: []
			}), "fcr");

			this.getView().setModel(new JSONModel({
				selectedTab: "all",
				allViewMode: "DETAIL",
				topViewMode: "DETAIL",
				paramsExpanded: true,
				periodText: "",
				lastRunText: "Ready to run",
				totalActual: "0",
				totalBudget: "0",
				totalVariance: "0",
				variancePct: "0.0",
				varianceState: "None",
				recordCount: "0"
			}), "ui");

			this._applyFilters(false);
		},

		onAfterRendering: function() {
			this._configureCharts();
			this._wireScrollAutoCollapse();
		},

		onSearch: function() {
			this._applyFilters(true);
			MessageToast.show("Fixed Cost Report refreshed");
		},

		onReset: function() {
			this.getView().getModel("filters").setData({
				companyCode: "1000",
				fiscalYear: "2026",
				profitCenters: [],
				glGroups: [],
				quarter: "Q1"
			});
			this._applyFilters(true);
		},

		onQuarterChange: function() {
			this._applyFilters(true);
		},

		onFiscalYearChange: function(oEvent) {
			var sValue = oEvent.getSource().getValue();
			var sYear = (sValue || "").replace(/\D/g, "").substr(0, 4);

			if (sYear && sYear.length === 4) {
				this.getView().getModel("filters").setProperty("/fiscalYear", sYear);
				this._applyFilters(true);
			}
		},

		onToggleParams: function() {
			var oUiModel = this.getView().getModel("ui");
			oUiModel.setProperty("/paramsExpanded", !oUiModel.getProperty("/paramsExpanded"));
		},

		onProfitCentreValueHelp: function() {
			this._openMultiSelectValueHelp("Profit Centre", "profitCenters", "profitCenters");
		},

		onGlGroupValueHelp: function() {
			this._openMultiSelectValueHelp("GL Group", "glGroups", "glGroups");
		},

		_openMultiSelectValueHelp: function(sTitle, sLookupPath, sFilterPath) {
			var oView = this.getView();
			var oFiltersModel = oView.getModel("filters");
			var aCurrent = oFiltersModel.getProperty("/" + sFilterPath) || [];
			var mSelected = {};

			aCurrent.forEach(function(oItem) {
				mSelected[oItem.key] = true;
			});

			var oList = new List({
				mode: "MultiSelect",
				includeItemInSelection: true,
				items: {
					path: "lookups>/" + sLookupPath,
					template: new StandardListItem({
						title: "{lookups>key}",
						description: "{lookups>text}"
					})
				}
			});

			oList.attachUpdateFinished(function() {
				oList.getItems().forEach(function(oItem) {
					var sKey = oItem.getBindingContext("lookups").getProperty("key");
					oItem.setSelected(!!mSelected[sKey]);
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
				title: sTitle,
				contentWidth: "30rem",
				contentHeight: "34rem",
				stretchOnPhone: true,
				content: [oSearch, oList],
				buttons: [
					new Button({
						text: "Clear",
						press: function() {
							oList.removeSelections(true);
						}
					}),
					new Button({
						text: "OK",
						type: "Emphasized",
						press: function() {
							var aSelected = oList.getSelectedItems().map(function(oItem) {
								var oData = oItem.getBindingContext("lookups").getObject();
								return {
									key: oData.key,
									text: oData.key + " - " + oData.text
								};
							});

							oFiltersModel.setProperty("/" + sFilterPath, aSelected);
							this._applyFilters(true);
							oDialog.close();
						}.bind(this)
					}),
					new Button({
						text: "Cancel",
						press: function() {
							oDialog.close();
						}
					})
				],
				afterClose: function() {
					oDialog.destroy();
				}
			});

			oView.addDependent(oDialog);
			oDialog.open();
		},

		_applyFilters: function(bMarkRun) {
			var oFilters = this.getView().getModel("filters").getData();
			var aPeriods = this._mQuarterPeriods[oFilters.quarter] || [];
			var aProfitCenters = (oFilters.profitCenters || []).map(function(oItem) {
				return oItem.key;
			});
			var aGlGroups = (oFilters.glGroups || []).map(function(oItem) {
				return oItem.key;
			});

			var aRows = this._aBaseRows.filter(function(oRow) {
				var bCompany = !oFilters.companyCode || oRow.companyCode === oFilters.companyCode;
				var bYear = !oFilters.fiscalYear || oRow.fiscalYear === oFilters.fiscalYear;
				var bPeriod = aPeriods.indexOf(oRow.period) !== -1;
				var bProfitCenter = !aProfitCenters.length || aProfitCenters.indexOf(oRow.profitCenter) !== -1;
				var bGlGroup = !aGlGroups.length || aGlGroups.indexOf(oRow.glGroup) !== -1;

				return bCompany && bYear && bPeriod && bProfitCenter && bGlGroup;
			});

			var aDetailRows = this._decorateDetailRows(aRows);
			var aSummaryRows = this._createSummaryRows(aRows);
			var aTopDetailRows = aDetailRows.slice().sort(this._sortByVariance).slice(0, 5);
			var aTopSummaryRows = aSummaryRows.slice().sort(this._sortByVariance).slice(0, 5);

			this.getView().getModel("fcr").setData({
				allDetailRows: aDetailRows,
				allSummaryRows: aSummaryRows,
				allSummaryChart: this._createChartRows(aSummaryRows),
				topDetailRows: aTopDetailRows,
				topSummaryRows: aTopSummaryRows,
				topSummaryChart: this._createChartRows(aTopSummaryRows)
			});

			this._updateTotals(aDetailRows, bMarkRun);
			this._updatePeriodText(oFilters, aPeriods);
		},

		_updateTotals: function(aRows, bMarkRun) {
			var oTotals = aRows.reduce(function(oResult, oRow) {
				oResult.actual += oRow.actual;
				oResult.budget += oRow.budget;
				return oResult;
			}, {
				actual: 0,
				budget: 0
			});
			var iVariance = oTotals.actual - oTotals.budget;
			var fVariancePct = oTotals.budget ? (iVariance / oTotals.budget) * 100 : 0;
			var oUiModel = this.getView().getModel("ui");

			oUiModel.setProperty("/totalActual", this._formatAmount(oTotals.actual));
			oUiModel.setProperty("/totalBudget", this._formatAmount(oTotals.budget));
			oUiModel.setProperty("/totalVariance", this._formatAmount(iVariance));
			oUiModel.setProperty("/variancePct", this._formatPercent(fVariancePct));
			oUiModel.setProperty("/varianceState", this._varianceState(iVariance));
			oUiModel.setProperty("/recordCount", this._formatAmount(aRows.length));

			if (bMarkRun) {
				oUiModel.setProperty("/lastRunText", "Last run just now");
			}
		},

		_updatePeriodText: function(oFilters, aPeriods) {
			var sPeriodText = aPeriods.length ? "Periods " + aPeriods[0] + " to " + aPeriods[aPeriods.length - 1] : "No period";
			var sProfitText = oFilters.profitCenters.length ? oFilters.profitCenters.length + " profit centres" : "All profit centres";
			var sGlText = oFilters.glGroups.length ? oFilters.glGroups.length + " GL groups" : "All GL groups";

			this.getView().getModel("ui").setProperty("/periodText",
				"Company " + (oFilters.companyCode || "-") + " | FY " + (oFilters.fiscalYear || "-") + " | " +
				(oFilters.quarter || "-") + " " + sPeriodText + " | " + sProfitText + " | " + sGlText);
		},

		_createChartRows: function(aRows) {
			return (aRows || []).map(function(oRow) {
				return {
					name: oRow.glGroup + " / FY " + oRow.fiscalYear + " / " + oRow.monthText,
					variance: oRow.variance
				};
			});
		},

		_configureCharts: function() {
			["allSummaryChart", "topSummaryChart"].forEach(function(sChartId) {
				var oVizFrame = this.byId(sChartId);

				if (!oVizFrame || oVizFrame.data("configured")) {
					return;
				}

				oVizFrame.setVizProperties({
					title: {
						visible: false
					},
					legend: {
						visible: false
					},
					plotArea: {
						dataLabel: {
							visible: true
						},
						colorPalette: this._randomPalette(18),
						animation: {
							dataLoading: true
						}
					},
					valueAxis: {
						title: {
							visible: false
						}
					},
					categoryAxis: {
						title: {
							visible: false
						},
						label: {
							rotation: "fixed"
						}
					}
				});
				oVizFrame.data("configured", true);
			}.bind(this));
		},

		_wireScrollAutoCollapse: function() {
			var oView = this.getView();
			var oDomRef = oView.getDomRef();
			if (!oDomRef) {
				return;
			}

			var oScroll = oDomRef.querySelector(".sapMPageEnableScrolling");
			if (!oScroll) {
				return;
			}

			if (this._fnScrollHandler) {
				oScroll.removeEventListener("scroll", this._fnScrollHandler);
			}

			this._fnScrollHandler = function() {
				var oUiModel = oView.getModel("ui");
				var bExpanded = !!oUiModel.getProperty("/paramsExpanded");
				var iTop = oScroll.scrollTop || 0;

				if (iTop > 90 && bExpanded) {
					oUiModel.setProperty("/paramsExpanded", false);
				} else if (iTop <= 10 && !bExpanded) {
					oUiModel.setProperty("/paramsExpanded", true);
				}
			};

			oScroll.addEventListener("scroll", this._fnScrollHandler, { passive: true });
		},

		_randomPalette: function(iCount) {
			var a = [];
			for (var i = 0; i < iCount; i++) {
				var hue = Math.floor(Math.random() * 360);
				a.push("hsl(" + hue + ", 78%, 48%)");
			}
			return a;
		},

		_createSummaryRows: function(aRows) {
			var mGroups = {};
			var aSummary = [];

			aRows.forEach(function(oRow) {
				var sGroupKey = oRow.glGroup + "|" + oRow.fiscalYear + "|" + oRow.period;

				if (!mGroups[sGroupKey]) {
					mGroups[sGroupKey] = {
						glGroup: oRow.glGroup,
						groupName: this._mGroupNames[oRow.glGroup] || oRow.glGroup,
						fiscalYear: oRow.fiscalYear,
						period: oRow.period,
						monthText: this._monthText(oRow.period),
						lineCount: 0,
						budget: 0,
						actual: 0
					};
				}

				mGroups[sGroupKey].lineCount += 1;
				mGroups[sGroupKey].budget += oRow.budget;
				mGroups[sGroupKey].actual += oRow.actual;
			}.bind(this));

			Object.keys(mGroups).forEach(function(sKey) {
				aSummary.push(this._decorateAmountRow(mGroups[sKey]));
			}.bind(this));

			return aSummary.sort(function(oA, oB) {
				if (oA.fiscalYear !== oB.fiscalYear) {
					return oA.fiscalYear.localeCompare(oB.fiscalYear);
				}
				if (oA.period !== oB.period) {
					return oA.period - oB.period;
				}
				return oA.glGroup.localeCompare(oB.glGroup);
			});
		},

		_decorateDetailRows: function(aRows) {
			return aRows.map(function(oRow) {
				return this._decorateAmountRow(Object.assign({}, oRow, {
					groupName: this._mGroupNames[oRow.glGroup] || oRow.glGroup,
					monthText: this._monthText(oRow.period)
				}));
			}.bind(this));
		},

		_monthText: function(iPeriod) {
			return "M" + iPeriod + " - " + (this._aMonthNames[iPeriod] || "Period " + iPeriod);
		},

		_decorateAmountRow: function(oRow) {
			var iVariance = oRow.actual - oRow.budget;
			var fVariancePct = oRow.budget ? (iVariance / oRow.budget) * 100 : 0;

			oRow.variance = iVariance;
			oRow.variancePct = fVariancePct;
			oRow.actualText = this._formatAmount(oRow.actual);
			oRow.budgetText = this._formatAmount(oRow.budget);
			oRow.varianceText = this._formatAmount(iVariance);
			oRow.variancePctText = this._formatPercent(fVariancePct);
			oRow.varianceState = this._varianceState(iVariance);
			return oRow;
		},

		_sortByVariance: function(oA, oB) {
			return Math.abs(oB.variance) - Math.abs(oA.variance);
		},

		_varianceState: function(iVariance) {
			if (iVariance > 0) {
				return "Error";
			}
			if (iVariance < 0) {
				return "Success";
			}
			return "None";
		},

		_formatAmount: function(vValue) {
			return this._oAmountFormat.format(vValue || 0);
		},

		_formatPercent: function(vValue) {
			return this._oPercentFormat.format(vValue || 0);
		},

		_createProfitCenters: function() {
			return [
				{ key: "PC100", text: "Rail Coach Assembly" },
				{ key: "PC200", text: "Foundry Operations" },
				{ key: "PC300", text: "Maintenance Workshop" },
				{ key: "PC400", text: "Corporate Services" },
				{ key: "PC500", text: "Paint Shop" }
			];
		},

		_createGlGroups: function() {
			return Object.keys(this._mGroupNames).map(function(sKey) {
				return {
					key: sKey,
					text: this._mGroupNames[sKey]
				};
			}.bind(this));
		},

		_createBaseRows: function() {
			return [
				this._row("PC100", "LAB", "500101", "Basic Wages", 1, 1420000, 1495000),
				this._row("PC100", "POW", "510201", "Electricity Charges", 1, 880000, 960000),
				this._row("PC100", "REP", "520301", "Mechanical Repairs", 2, 610000, 575000),
				this._row("PC100", "DEP", "560101", "Plant Depreciation", 3, 760000, 760000),
				this._row("PC200", "LAB", "500102", "Contract Labour", 1, 1180000, 1275000),
				this._row("PC200", "POW", "510202", "Fuel and Gas", 2, 970000, 1030000),
				this._row("PC200", "REP", "520302", "Foundry Maintenance", 3, 690000, 820000),
				this._row("PC200", "SEC", "540101", "Security Services", 3, 240000, 225000),
				this._row("PC300", "LAB", "500103", "Overtime Wages", 2, 530000, 610000),
				this._row("PC300", "ADM", "530101", "Office Administration", 2, 390000, 360000),
				this._row("PC300", "REP", "520303", "Preventive Maintenance", 3, 840000, 790000),
				this._row("PC400", "ADM", "530102", "Shared Service Cost", 1, 720000, 755000),
				this._row("PC400", "SEC", "540102", "Facility Management", 2, 315000, 349000),
				this._row("PC400", "DEP", "560102", "Building Depreciation", 3, 410000, 410000),
				this._row("PC500", "POW", "510203", "Compressed Air", 1, 520000, 595000),
				this._row("PC500", "LAB", "500104", "Paint Shop Labour", 2, 680000, 642000),
				this._row("PC500", "REP", "520304", "Booth Maintenance", 3, 455000, 530000),
				this._row("PC100", "LAB", "500101", "Basic Wages", 4, 1450000, 1510000),
				this._row("PC200", "POW", "510202", "Fuel and Gas", 5, 1010000, 980000),
				this._row("PC300", "REP", "520303", "Preventive Maintenance", 6, 860000, 925000),
				this._row("PC400", "ADM", "530102", "Shared Service Cost", 7, 735000, 705000),
				this._row("PC500", "POW", "510203", "Compressed Air", 8, 540000, 622000),
				this._row("PC100", "DEP", "560101", "Plant Depreciation", 10, 780000, 780000),
				this._row("PC200", "SEC", "540101", "Security Services", 11, 250000, 268000)
			];
		},

		_row: function(sProfitCenter, sGlGroup, sGlAccount, sGlName, iPeriod, iBudget, iActual) {
			return {
				companyCode: "1000",
				fiscalYear: "2026",
				profitCenter: sProfitCenter,
				glGroup: sGlGroup,
				glAccount: sGlAccount,
				glName: sGlName,
				period: iPeriod,
				budget: iBudget,
				actual: iActual
			};
		}
	});
});
