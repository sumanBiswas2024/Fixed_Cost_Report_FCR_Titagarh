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
	"sap/m/MessageToast",
	"sap/m/MessageBox",
	"sap/ui/core/util/File"
], function(Controller, JSONModel, NumberFormat, Dialog, List, StandardListItem, Button, SearchField, Filter, FilterOperator,
	MessageToast, MessageBox, File) {
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

			this._aPeriodMonthNames = ["", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

			this._aBaseRows = this._createBaseRows();

			this.getView().setModel(new JSONModel({
				companyCode: "1000",
				fiscalYear: "2026",
				profitCenters: [],
				glGroups: [],
				quarters: [] // Stays empty to mean "All Quarters" or select by default
			}), "filters");

			this.getView().setModel(new JSONModel({
				profitCenters: this._createProfitCenters(),
				glGroups: this._createGlGroups(),
				quarters: [{
					key: "Q1",
					text: "Q1 - Period 1 to 3"
				}, {
					key: "Q2",
					text: "Q2 - Period 4 to 6"
				}, {
					key: "Q3",
					text: "Q3 - Period 7 to 9"
				}, {
					key: "Q4",
					text: "Q4 - Period 10 to 12"
				}]
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
				allSearch: "",
				topSearch: "",
				companyCodeState: "None",
				companyCodeStateText: "",
				fiscalYearState: "None",
				fiscalYearStateText: "",
				quarterState: "None",
				quarterStateText: "",
				selectedValuesText: "",
				p1Visible: true,
				p2Visible: true,
				p3Visible: true,
				p4Visible: true,
				p5Visible: true,
				p6Visible: true,
				p7Visible: true,
				p8Visible: true,
				p9Visible: true,
				p10Visible: true,
				p11Visible: true,
				p12Visible: true,
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

		/**
		 * Formatter to display selected keys in MultiInput as a comma-separated string
		 */
		formatTokenKeys: function(aSelectedItems) {
			if (!aSelectedItems || aSelectedItems.length === 0) {
				return "";
			}
			return aSelectedItems.map(function(oItem) {
				return oItem.key;
			}).join(", ");
		},

		onAfterRendering: function() {
			this._configureCharts();
			this._wireScrollAutoCollapse();
		},

		onSearch: function() {
			if (!this._validateMandatory()) {
				return;
			}
			this._applyFilters(true);
			MessageToast.show("Fixed Cost Report refreshed");
		},

		onReset: function() {
			this.getView().getModel("filters").setData({
				companyCode: "1000",
				fiscalYear: "2026",
				profitCenters: [],
				glGroups: [],
				quarters: []
			});
			this._clearSearch();
			this._applyFilters(true);
		},

		onQuarterValueHelp: function() {
			this._openMultiSelectValueHelp("Quarter", "quarters", "quarters");
		},

		onFiscalYearChange: function(oEvent) {
			var sValue = oEvent.getSource().getValue();
			var sYear = (sValue || "").replace(/\D/g, "").substr(0, 4);

			if (sYear && sYear.length === 4) {
				this.getView().getModel("filters").setProperty("/fiscalYear", sYear);
				this._applyFilters(true);
			}
		},

		onExport: function() {
			if (!this._validateMandatory()) {
				return;
			}

			var oTarget = this._getActiveTable();
			if (!oTarget || !oTarget.table) {
				MessageToast.show("Nothing to export");
				return;
			}

			var aRows = this._getFilteredTableObjects(oTarget.table, oTarget.modelName, oTarget.path);
			if (!aRows.length) {
				MessageToast.show("No rows to export");
				return;
			}

			var sCsv = this._toCsv(aRows, oTarget.columns);
			var oFilters = this.getView().getModel("filters").getData();
			var sName = "FCR_" + (oFilters.companyCode || "CC") + "_FY" + (oFilters.fiscalYear || "YYYY") + "_" + oTarget.name;
			File.save(sCsv, sName, "csv", "text/csv");
		},

		onToggleParams: function() {
			var oUiModel = this.getView().getModel("ui");
			oUiModel.setProperty("/paramsExpanded", !oUiModel.getProperty("/paramsExpanded"));
		},

		onTabSelect: function() {
			setTimeout(function() {
				if (!this.bIsDestroyed) {
					this._updateKpisFromActive();
				}
			}.bind(this), 0);
		},

		onViewModeChange: function() {
			setTimeout(function() {
				if (!this.bIsDestroyed) {
					this._updateKpisFromActive();
				}
			}.bind(this), 0);
		},

		onAllSearch: function(oEvent) {
			var sQuery = oEvent.getSource().getValue() || "";
			this.getView().getModel("ui").setProperty("/allSearch", sQuery);
			this._applyUniversalSearch("all", sQuery);
			this._updateKpisFromActive();
		},

		onTopSearch: function(oEvent) {
			var sQuery = oEvent.getSource().getValue() || "";
			this.getView().getModel("ui").setProperty("/topSearch", sQuery);
			this._applyUniversalSearch("top", sQuery);
			this._updateKpisFromActive();
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

			oList.attachSelectionChange(function(oEvent) {
				var oItem = oEvent.getParameter("listItem");
				if (!oItem) {
					return;
				}
				var sKey = oItem.getBindingContext("lookups").getProperty("key");
				mSelected[sKey] = oItem.getSelected();
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
							mSelected = {};
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

			// Handle Quarters Multi-Selection
			var aSelectedQuarters = (oFilters.quarters || []).map(function(o) {
				return o.key;
			});
			var aPeriods = [];
			aSelectedQuarters.forEach(function(sQ) {
				aPeriods = aPeriods.concat(this._mQuarterPeriods[sQ] || []);
			}.bind(this));

			var aProfitCenters = (oFilters.profitCenters || []).map(function(oItem) {
				return oItem.key;
			});
			var aGlGroups = (oFilters.glGroups || []).map(function(oItem) {
				return oItem.key;
			});

			// Fix: If no specific quarters are selected, keep columns active for all months (1 to 12)
			this._syncPeriodVisibility(aPeriods);
			this._updateSelectedValuesText(oFilters);

			var aRows = this._aBaseRows.filter(function(oRow) {
				var bCompany = !oFilters.companyCode || oRow.companyCode === oFilters.companyCode;
				var bYear = !oFilters.fiscalYear || oRow.fiscalYear === oFilters.fiscalYear;
				var bPeriod = !aPeriods.length || aPeriods.indexOf(oRow.period) !== -1;
				var bProfitCenter = !aProfitCenters.length || aProfitCenters.indexOf(oRow.profitCenter) !== -1;
				var bGlGroup = !aGlGroups.length || aGlGroups.indexOf(oRow.glGroup) !== -1;

				return bCompany && bYear && bPeriod && bProfitCenter && bGlGroup;
			});

			var aDetailRows = this._buildDetailPivotRows(aRows);
			var aSummaryRows = this._buildGroupPivotRows(aRows);
			var aTopDetailRows = aDetailRows.slice().sort(this._sortByTotalDesc).slice(0, 5);
			var aTopSummaryRows = aSummaryRows.slice().sort(this._sortByTotalDesc).slice(0, 5);

			this.getView().getModel("fcr").setData({
				allDetailRows: aDetailRows,
				allSummaryRows: aSummaryRows,
				allSummaryChart: this._createChartRows(aDetailRows, 12),
				topDetailRows: aTopDetailRows,
				topSummaryRows: aTopSummaryRows,
				topSummaryChart: this._createChartRows(aTopDetailRows, 5)
			});

			this._updateTotalsFromPivot(aDetailRows, bMarkRun);
			this._updatePeriodText(oFilters, aPeriods);
			this._applyUniversalSearch("all", this.getView().getModel("ui").getProperty("/allSearch") || "");
			this._applyUniversalSearch("top", this.getView().getModel("ui").getProperty("/topSearch") || "");
			this._refreshChartStyling();
			this._updateKpisFromActive();
		},

		_updateTotalsFromPivot: function(aRows, bMarkRun) {
			var iTotal = aRows.reduce(function(iSum, oRow) {
				return iSum + (oRow.total || 0);
			}, 0);
			var iMax = 0;
			if (aRows && aRows.length) {
				iMax = aRows.reduce(function(iBest, oRow) {
					return Math.max(iBest, Math.abs(oRow.total || 0));
				}, 0);
			}
			var oUiModel = this.getView().getModel("ui");

			oUiModel.setProperty("/totalActual", this._formatAmount(iTotal));
			oUiModel.setProperty("/totalBudget", this._formatAmount(0));
			oUiModel.setProperty("/totalVariance", this._formatAmount(iMax));
			oUiModel.setProperty("/variancePct", this._formatPercent(0));
			oUiModel.setProperty("/varianceState", this._varianceState(iMax));
			oUiModel.setProperty("/recordCount", this._formatAmount(aRows.length));

			if (bMarkRun) {
				oUiModel.setProperty("/lastRunText", "Last run just now");
			}
		},

		_updatePeriodText: function(oFilters, aPeriods) {
			var sPeriodText = aPeriods.length ? "Periods " + Math.min.apply(null, aPeriods) + " to " + Math.max.apply(null, aPeriods) :
				"All periods";
			var sProfitText = oFilters.profitCenters.length ? oFilters.profitCenters.length + " profit centres" : "All profit centres";
			var sGlText = oFilters.glGroups.length ? oFilters.glGroups.length + " GL groups" : "All GL groups";

			this.getView().getModel("ui").setProperty("/periodText",
				"Company " + (oFilters.companyCode || "-") + " | FY " + (oFilters.fiscalYear || "-") + " | " +
				sPeriodText + " | " + sProfitText + " | " + sGlText);
		},

		_createChartRows: function(aRows, iLimit) {
			var aSource = (aRows || []).slice();
			aSource.sort(this._sortByTotalDesc);
			if (iLimit) {
				aSource = aSource.slice(0, iLimit);
			}
			return aSource.map(function(oRow) {
				return {
					name: oRow.glAccount + " - " + oRow.glName,
					value: oRow.total
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
						visible: true
					},
					plotArea: {
						dataLabel: {
							visible: true
						},
						drawingEffect: "glossy",
						colorPalette: this._paletteForChart(sChartId),
						animation: {
							dataLoading: true
						}
					},
					valueAxis: {
						title: {
							visible: true,
							text: "Total"
						}
					},
					categoryAxis: {
						title: {
							visible: true,
							text: "G/L Account"
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
			oScroll.addEventListener("scroll", this._fnScrollHandler, {
				passive: true
			});
		},

		_paletteForChart: function(sChartId) {
			var oFcr = this.getView().getModel("fcr");
			var sPath = sChartId === "topSummaryChart" ? "/topSummaryChart" : "/allSummaryChart";
			var aData = oFcr.getProperty(sPath) || [];
			var a = [];
			for (var i = 0; i < aData.length; i++) {
				a.push(this._colorForKey(aData[i].name));
			}
			return a;
		},

		_colorForKey: function(sKey) {
			var s = String(sKey || "");
			var hash = 0;
			for (var i = 0; i < s.length; i++) {
				hash = ((hash << 5) - hash) + s.charCodeAt(i);
				hash |= 0;
			}
			var hue = Math.abs(hash) % 360;
			return "hsl(" + hue + ", 78%, 48%)";
		},

		_buildDetailPivotRows: function(aRows) {
			var m = {};
			aRows.forEach(function(oRow) {
				var sKey = oRow.glAccount + "|" + oRow.glGroup + "|" + oRow.fiscalYear;
				if (!m[sKey]) {
					m[sKey] = {
						glAccount: oRow.glAccount,
						glName: oRow.glName,
						glGroup: oRow.glGroup,
						glGroupText: this._mGroupNames[oRow.glGroup] || oRow.glGroup,
						fiscalYear: oRow.fiscalYear,
						total: 0,
						p1: 0,
						p2: 0,
						p3: 0,
						p4: 0,
						p5: 0,
						p6: 0,
						p7: 0,
						p8: 0,
						p9: 0,
						p10: 0,
						p11: 0,
						p12: 0
					};
				}
				var iPeriod = oRow.period;
				var iVal = oRow.actual || 0;
				m[sKey]["p" + iPeriod] += iVal;
				m[sKey].total += iVal;
			}.bind(this));

			return Object.keys(m).map(function(sKey) {
				var o = m[sKey];
				this._decoratePivotRow(o);
				return o;
			}.bind(this)).sort(function(a, b) {
				return a.glAccount.localeCompare(b.glAccount);
			});
		},

		_buildGroupPivotRows: function(aRows) {
			var m = {};
			aRows.forEach(function(oRow) {
				var sKey = oRow.glGroup + "|" + oRow.fiscalYear;
				if (!m[sKey]) {
					m[sKey] = {
						glGroup: oRow.glGroup,
						groupName: this._mGroupNames[oRow.glGroup] || oRow.glGroup,
						fiscalYear: oRow.fiscalYear,
						total: 0,
						p1: 0,
						p2: 0,
						p3: 0,
						p4: 0,
						p5: 0,
						p6: 0,
						p7: 0,
						p8: 0,
						p9: 0,
						p10: 0,
						p11: 0,
						p12: 0
					};
				}
				var iPeriod = oRow.period;
				var iVal = oRow.actual || 0;
				m[sKey]["p" + iPeriod] += iVal;
				m[sKey].total += iVal;
			}.bind(this));

			return Object.keys(m).map(function(sKey) {
				var o = m[sKey];
				o.glGroupText = o.groupName;
				this._decoratePivotRow(o);
				return o;
			}.bind(this)).sort(function(a, b) {
				return a.glGroup.localeCompare(b.glGroup);
			});
		},

		_decoratePivotRow: function(oRow) {
			oRow.totalText = this._formatAmount(oRow.total);
			oRow.totalState = this._varianceState(oRow.total);
			for (var i = 1; i <= 12; i++) {
				oRow["p" + i + "Text"] = this._formatAmount(oRow["p" + i]);
			}
		},

		_sortByTotalDesc: function(oA, oB) {
			return Math.abs(oB.total) - Math.abs(oA.total);
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

		_validateMandatory: function() {
			var oFilters = this.getView().getModel("filters").getData();
			var oUiModel = this.getView().getModel("ui");
			var bOk = true;
			var aMissing = [];

			if (!(oFilters.companyCode || "").trim()) {
				oUiModel.setProperty("/companyCodeState", "Error");
				aMissing.push("Company Code");
				bOk = false;
			} else {
				oUiModel.setProperty("/companyCodeState", "None");
			}

			if (!/^[0-9]{4}$/.test((oFilters.fiscalYear || "").trim())) {
				oUiModel.setProperty("/fiscalYearState", "Error");
				aMissing.push("Fiscal Year");
				bOk = false;
			} else {
				oUiModel.setProperty("/fiscalYearState", "None");
			}

			if (!bOk) {
				MessageBox.error("Please fill mandatory field(s): " + aMissing.join(", ") + ".");
			}
			return bOk;
		},

		// Fix: Synchronize monthly column visibilities correctly when aPeriods is empty
		_syncPeriodVisibility: function(aPeriods) {
			var oUiModel = this.getView().getModel("ui");
			for (var i = 1; i <= 12; i++) {
				if (!aPeriods || aPeriods.length === 0) {
					// If no specific quarter selected, all months remain visible
					oUiModel.setProperty("/p" + i + "Visible", true);
				} else {
					// Otherwise, match exact quarter indices
					oUiModel.setProperty("/p" + i + "Visible", aPeriods.indexOf(i) !== -1);
				}
			}
		},

		_updateSelectedValuesText: function(oFilters) {
			var aPc = (oFilters.profitCenters || []).map(function(o) {
				return o.key;
			});
			var aGlg = (oFilters.glGroups || []).map(function(o) {
				return o.key;
			});
			var aQ = (oFilters.quarters || []).map(function(o) {
				return o.key;
			});
			var sText = "CC: " + (oFilters.companyCode || "-") + " | FY: " + (oFilters.fiscalYear || "-") +
				" | Q: " + (aQ.join(", ") || "-") + " | PC: " + (aPc.join(", ") || "All") + " | GL: " + (aGlg.join(", ") || "All");
			this.getView().getModel("ui").setProperty("/selectedValuesText", sText);
		},

		_clearSearch: function() {
			var oUi = this.getView().getModel("ui");
			oUi.setProperty("/allSearch", "");
			oUi.setProperty("/topSearch", "");
			this._applyUniversalSearch("all", "");
			this._applyUniversalSearch("top", "");
		},

		_applyUniversalSearch: function(sTab, sQuery) {
			var s = (sQuery || "").trim();
			var aTargets = [this.byId(sTab + "DetailTable"), this.byId(sTab + "SummaryTable")].filter(Boolean);

			var fnApply = function(oTable, aFilters) {
				var oBinding = oTable.getBinding("rows");
				if (oBinding) {
					oBinding.filter(aFilters);
				}
			};

			if (!s) {
				aTargets.forEach(function(oTable) {
					fnApply(oTable, []);
				});
				this._syncChartsFromTables();
				return;
			}

			var a = [
				new Filter("glAccount", FilterOperator.Contains, s),
				new Filter("glName", FilterOperator.Contains, s),
				new Filter("glGroup", FilterOperator.Contains, s),
				new Filter("glGroupText", FilterOperator.Contains, s),
				new Filter("groupName", FilterOperator.Contains, s),
				new Filter("fiscalYear", FilterOperator.Contains, s)
			];

			var aAppFilters = [new Filter({
				filters: a,
				and: false
			})];
			aTargets.forEach(function(oTable) {
				fnApply(oTable, aAppFilters);
			});
			this._syncChartsFromTables();
			this._updateKpisFromActive();
		},

		_syncChartsFromTables: function() {
			var oFcr = this.getView().getModel("fcr");
			var oAllDetail = this.byId("allDetailTable");
			if (oAllDetail && oAllDetail.getBinding("rows")) {
				var aAll = this._getFilteredTableObjects(oAllDetail, "fcr", "/allDetailRows");
				oFcr.setProperty("/allSummaryChart", this._createChartRows(aAll, 12));
			}
			var oTopDetail = this.byId("topDetailTable");
			if (oTopDetail && oTopDetail.getBinding("rows")) {
				var aTop = this._getFilteredTableObjects(oTopDetail, "fcr", "/topDetailRows");
				oFcr.setProperty("/topSummaryChart", this._createChartRows(aTop, 5));
			}
			this._refreshChartStyling();
		},

		_updateKpisFromActive: function() {
			var oUi = this.getView().getModel("ui");
			var sTab = oUi.getProperty("/selectedTab") || "all";
			var sMode = sTab === "all" ? oUi.getProperty("/allViewMode") : oUi.getProperty("/topViewMode");
			var sTableId = sTab + (sMode === "SUMMARY" ? "SummaryTable" : "DetailTable");
			var oTable = this.byId(sTableId);
			if (!oTable) {
				return;
			}
			var sPath = "/" + sTab + (sMode === "SUMMARY" ? "SummaryRows" : "DetailRows");
			var aRows = this._getFilteredTableObjects(oTable, "fcr", sPath);
			var iTotal = 0;
			var iMax = 0;
			for (var i = 0; i < aRows.length; i++) {
				var v = aRows[i].total || 0;
				iTotal += v;
				iMax = Math.max(iMax, Math.abs(v));
			}
			oUi.setProperty("/totalActual", this._formatAmount(iTotal));
			oUi.setProperty("/totalBudget", this._formatAmount(0));
			oUi.setProperty("/totalVariance", this._formatAmount(iMax));
			oUi.setProperty("/variancePct", this._formatPercent(0));
			oUi.setProperty("/varianceState", this._varianceState(iMax));
			oUi.setProperty("/recordCount", this._formatAmount(aRows.length));
		},

		_refreshChartStyling: function() {
			["allSummaryChart", "topSummaryChart"].forEach(function(sChartId) {
				var oVizFrame = this.byId(sChartId);
				if (!oVizFrame) {
					return;
				}
				var aRules = this._dataPointRulesForChart(sChartId);
				oVizFrame.setVizProperties({
					plotArea: {
						drawingEffect: "glossy",
						colorPalette: this._paletteForChart(sChartId),
						dataPointStyle: {
							rules: aRules
						}
					}
				});
			}.bind(this));
		},

		_dataPointRulesForChart: function(sChartId) {
			var oFcr = this.getView().getModel("fcr");
			var sPath = sChartId === "topSummaryChart" ? "/topSummaryChart" : "/allSummaryChart";
			var aData = oFcr.getProperty(sPath) || [];
			var aRules = [];
			for (var i = 0; i < aData.length; i++) {
				var sName = aData[i].name;
				aRules.push({
					dataContext: {
						"GL Account": sName
					},
					properties: {
						color: this._colorForKey(sName)
					}
				});
			}
			return aRules;
		},

		_getActiveTable: function() {
			var oUi = this.getView().getModel("ui");
			var sTab = oUi.getProperty("/selectedTab") || "all";
			var sMode = sTab === "all" ? oUi.getProperty("/allViewMode") : oUi.getProperty("/topViewMode");
			var sId = sTab + (sMode === "SUMMARY" ? "SummaryTable" : "DetailTable");
			var sPath = "/" + sTab + (sMode === "SUMMARY" ? "SummaryRows" : "DetailRows");
			var aCols = this._csvColumnsForMode(sMode);
			return {
				table: this.byId(sId),
				modelName: "fcr",
				path: sPath,
				name: sTab + "_" + sMode,
				columns: aCols
			};
		},

		_getFilteredTableObjects: function(oTable, sModelName, sPath) {
			var oBinding = oTable.getBinding("rows");
			if (!oBinding) {
				return this.getView().getModel(sModelName).getProperty(sPath) || [];
			}
			return oBinding.getContexts(0, oBinding.getLength()).map(function(oCtx) {
				return oCtx.getObject();
			});
		},

		_csvColumnsForMode: function(sMode) {
			var oUi = this.getView().getModel("ui");
			var aPeriods = [];
			for (var i = 1; i <= 12; i++) {
				if (oUi.getProperty("/p" + i + "Visible")) {
					aPeriods.push(i);
				}
			}
			var a = [];
			if (sMode === "DETAIL") {
				a.push({
					key: "glAccount",
					label: "G/L Acct"
				});
				a.push({
					key: "glName",
					label: "G/L Acct Long Text"
				});
				a.push({
					key: "glGroupText",
					label: "G/L Group"
				});
			} else {
				a.push({
					key: "glGroup",
					label: "G/L Group"
				});
				a.push({
					key: "groupName",
					label: "G/L Group Text"
				});
			}
			a.push({
				key: "total",
				label: "Total"
			});
			aPeriods.forEach(function(iP) {
				a.push({
					key: "p" + iP,
					label: this._aPeriodMonthNames[iP]
				});
			}.bind(this));
			return a;
		},

		_toCsv: function(aRows, aCols) {
			var aLines = [];
			aLines.push(aCols.map(function(c) {
				return this._csvCell(c.label);
			}.bind(this)).join(","));
			aRows.forEach(function(oRow) {
				aLines.push(aCols.map(function(c) {
					return this._csvCell(oRow[c.key]);
				}.bind(this)).join(","));
			}.bind(this));
			return aLines.join("\r\n");
		},

		_csvCell: function(v) {
			var s = v === null || v === undefined ? "" : String(v);
			if (/[\",\\r\\n]/.test(s)) {
				s = "\"" + s.replace(/\"/g, "\"\"") + "\"";
			}
			return s;
		},

		_createProfitCenters: function() {
			return [{
				key: "PC100",
				text: "Rail Coach Assembly"
			}, {
				key: "PC200",
				text: "Foundry Operations"
			}, {
				key: "PC300",
				text: "Maintenance Workshop"
			}, {
				key: "PC400",
				text: "Corporate Services"
			}, {
				key: "PC500",
				text: "Paint Shop"
			}];
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
				// --- Q1: Periods 1 to 3 (Apr, May, Jun) ---
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

				// --- Q2: Periods 4 to 6 (Jul, Aug, Sep) ---
				this._row("PC100", "LAB", "500101", "Basic Wages", 4, 1450000, 1510000),
				this._row("PC100", "POW", "510201", "Electricity Charges", 4, 910000, 890000),
				this._row("PC100", "REP", "520301", "Mechanical Repairs", 5, 630000, 650000),
				this._row("PC200", "POW", "510202", "Fuel and Gas", 5, 1010000, 980000),
				this._row("PC200", "LAB", "500102", "Contract Labour", 6, 1200000, 1150000),
				this._row("PC300", "REP", "520303", "Preventive Maintenance", 6, 860000, 925000),
				this._row("PC300", "ADM", "530101", "Office Administration", 4, 400000, 410000),
				this._row("PC400", "SEC", "540102", "Facility Management", 5, 320000, 310000),
				this._row("PC500", "LAB", "500104", "Paint Shop Labour", 6, 700000, 720000),

				// --- Q3: Periods 7 to 9 (Oct, Nov, Dec) ---
				this._row("PC400", "ADM", "530102", "Shared Service Cost", 7, 735000, 705000),
				this._row("PC100", "LAB", "500101", "Basic Wages", 7, 1480000, 1460000),
				this._row("PC100", "POW", "510201", "Electricity Charges", 8, 950000, 1020000),
				this._row("PC500", "POW", "510203", "Compressed Air", 8, 540000, 622000),
				this._row("PC200", "REP", "520302", "Foundry Maintenance", 9, 710000, 750000),
				this._row("PC300", "LAB", "500103", "Overtime Wages", 9, 550000, 580000),
				this._row("PC400", "DEP", "560102", "Building Depreciation", 7, 410000, 410000),
				this._row("PC500", "REP", "520304", "Booth Maintenance", 8, 460000, 440000),

				// --- Q4: Periods 10 to 12 (Jan, Feb, Mar) ---
				this._row("PC100", "DEP", "560101", "Plant Depreciation", 10, 780000, 780000),
				this._row("PC100", "LAB", "500101", "Basic Wages", 11, 1500000, 1530000),
				this._row("PC200", "SEC", "540101", "Security Services", 11, 250000, 268000),
				this._row("PC200", "LAB", "500102", "Contract Labour", 10, 1250000, 1290000),
				this._row("PC300", "REP", "520303", "Preventive Maintenance", 12, 880000, 860000),
				this._row("PC400", "ADM", "530102", "Shared Service Cost", 12, 750000, 780000),
				this._row("PC500", "POW", "510203", "Compressed Air", 10, 560000, 540000),
				this._row("PC500", "LAB", "500104", "Paint Shop Labour", 12, 720000, 710000)
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
		},

		/**
		 * Synchronizes the data model when the MultiInput is cleared via the UI icon
		 */
		onTokenUpdate: function(oEvent) {
			var sType = oEvent.getParameter("type");

			if (sType === "removed") {
				var oSource = oEvent.getSource();
				var sId = oSource.getId();
				var oFiltersModel = this.getView().getModel("filters");

				if (sId.includes("quarterInput")) {
					oFiltersModel.setProperty("/quarters", []);
				} else if (sId.includes("profitCentreInput")) {
					oFiltersModel.setProperty("/profitCenters", []);
				} else if (sId.includes("glGroupInput")) {
					oFiltersModel.setProperty("/glGroups", []);
				}

				this._applyFilters(true);
			}
		}
	});
});