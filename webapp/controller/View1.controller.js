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
	"sap/ui/core/util/File",
	"sap/ui/core/BusyIndicator"
], function(Controller, JSONModel, NumberFormat, Dialog, List, StandardListItem, Button, SearchField, Filter, FilterOperator,
	MessageToast, MessageBox, File, BusyIndicator) {
	"use strict";

	return Controller.extend("Z_Fixed_Cost_Report_FCR.controller.View1", {
		onInit: function() {
			this._oODataModel = null;
			this._oODataReady = null;

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

			// Kept for compatibility with existing helper functions and UI text mapping.
			this._mGroupNames = {};

			this._aPeriodMonthNames = ["", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

			this.getView().setModel(new JSONModel({
				companyCode: "",
				fiscalYear: "",
				profitCenters: [],
				glGroups: [],
				quarters: [] // Stays empty to mean "All Quarters" or select by default
			}), "filters");

			this.getView().setModel(new JSONModel({
				companyCodes: [],
				profitCenters: [],
				glGroups: [],
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
				globalSearch: "",
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

			// Initialize OData metadata/value-helps, but do not load report data until "Run Report".
			this._initOData().catch(function(oErr) {
				// Keep the UI usable even if the service isn't reachable in the current environment.
				MessageBox.error("Unable to initialize OData service ZO_FCR_SRV.", {
					details: (oErr && oErr.message) ? oErr.message : String(oErr || "")
				});
			});
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
				companyCode: "",
				fiscalYear: "",
				profitCenters: [],
				glGroups: [],
				quarters: []
			});
			this._clearSearch();
			// Do not auto-fetch on reset; user will press Run Report.
		},

		onQuarterValueHelp: function() {
			this._openMultiSelectValueHelp("Quarter", "quarters", "quarters");
		},

		onFiscalYearChange: function(oEvent) {
			var sValue = oEvent.getSource().getValue();
			var sYear = (sValue || "").replace(/\D/g, "").substr(0, 4);

			if (sYear && sYear.length === 4) {
				this.getView().getModel("filters").setProperty("/fiscalYear", sYear);
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

		onViewModeChange: function(oEvent) {
			var sKey = "";
			var oSource = oEvent.getSource();
			if (oSource && oSource.getSelectedKey) {
				sKey = oSource.getSelectedKey() || "";
			}
			if (!sKey) {
				sKey = oEvent.getParameter("key") || "";
			}
			if (!sKey) {
				var oItem = oEvent.getParameter("item");
				sKey = oItem && oItem.getKey ? (oItem.getKey() || "") : "";
			}

			var oUi = this.getView().getModel("ui");

			if (oUi.getProperty("/selectedTab") === "all") {

				oUi.setProperty("/allViewMode", sKey);

			} else {

				oUi.setProperty("/topViewMode", sKey);

			}

			// Drop focus from the button to prevent browser scroll-anchoring jumps
			if (document.activeElement) {
				document.activeElement.blur();
			}

			this._updateKpisFromActive();

		},
		onSegmentTabChange: function(oEvent) {

			var sKey = "";
			var oSource = oEvent.getSource();
			if (oSource && oSource.getSelectedKey) {
				sKey = oSource.getSelectedKey() || "";
			}
			if (!sKey) {
				sKey = oEvent.getParameter("key") || "";
			}
			if (!sKey) {
				var oItem = oEvent.getParameter("item");
				sKey = oItem && oItem.getKey ? (oItem.getKey() || "") : "";
			}

			this.getView()
				.getModel("ui")
				.setProperty("/selectedTab", sKey);

			this._updateKpisFromActive();

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
			BusyIndicator.show(0);
			this._initOData().then(function() {
				return this._loadProfitCenterF4();
			}.bind(this)).then(function() {
				BusyIndicator.hide();
				this._openMultiSelectValueHelp("Profit Centre", "profitCenters", "profitCenters", {
					f4Kind: "PRCTR"
				});
			}.bind(this)).catch(function() {
				BusyIndicator.hide();
			});
		},

		onGlGroupValueHelp: function() {
			BusyIndicator.show(0);
			this._initOData().then(function() {
				return this._loadGlGroupF4();
			}.bind(this)).then(function() {
				BusyIndicator.hide();
				this._openMultiSelectValueHelp("GL Group", "glGroups", "glGroups", {
					f4Kind: "GLGRP"
				});
			}.bind(this)).catch(function() {
				BusyIndicator.hide();
			});
		},

		onCompanyCodeValueHelp: function() {
			this._openSingleSelectValueHelp("Company Code", "companyCodes", "/companyCode");
		},

		_openSingleSelectValueHelp: function(sTitle, sLookupPath, sFilterPropPath) {
			var oView = this.getView();
			var oFiltersModel = oView.getModel("filters");
			var sCurrent = oFiltersModel.getProperty(sFilterPropPath) || "";
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
							sSelected = "";
						}
					}),
					new Button({
						text: "OK",
						type: "Emphasized",
						press: function() {
							oFiltersModel.setProperty(sFilterPropPath, sSelected || "");
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

		_initOData: function() {
			if (this._oODataReady) {
				return this._oODataReady;
			}

			this._oODataModel = this.getOwnerComponent().getModel();
			if (!this._oODataModel) {
				this._oODataReady = Promise.reject(new Error("Default OData model is not configured."));
				return this._oODataReady;
			}

			this._oODataReady = this._oODataModel.metadataLoaded().then(function() {
				return this._loadLookupsFromService();
			}.bind(this));

			return this._oODataReady;
		},

		_loadLookupsFromService: function() {
			var oModel = this._oODataModel;
			var oLookups = this.getView().getModel("lookups");
			if (!oModel || !oLookups) {
				return Promise.resolve();
			}

			// Company codes are not provided via a dedicated F4 set, so we still derive a small list
			// from the detail set. Profit Centre / GL Group come from the dedicated F4 entity sets.
			var pBukrs = this._readOData("/es_detailset", {
				"$select": "bukrs",
				"$top": "500"
			}).then(function(aResults) {
				var mBukrs = {};
				(aResults || []).forEach(function(oRow) {
					if (oRow && oRow.bukrs) {
						mBukrs[oRow.bukrs] = true;
					}
				});
				oLookups.setProperty("/companyCodes", Object.keys(mBukrs).sort().map(function(sKey) {
					return {
						key: sKey,
						text: sKey
					};
				}));
			});

			var pPrctr = this._loadProfitCenterF4();
			var pGl = this._loadGlGroupF4();

			return Promise.all([pBukrs, pPrctr, pGl]).then(function() {
				return;
			});
		},

		_loadProfitCenterF4: function() {
			if (this._pPrctrF4All) {
				return this._pPrctrF4All;
			}

			this._pPrctrF4All = this._readOData("/es_f4_prctrset", {
				"$format": "json",
				"$select": "prctr,ltext",
				"$top": "5000"
			}).then(function(aResults) {
				var oLookups = this.getView().getModel("lookups");
				oLookups.setProperty("/profitCenters", (aResults || []).map(function(o) {
					var sKey = (o && o.prctr) ? String(o.prctr) : "";
					var sText = (o && o.ltext) ? String(o.ltext) : "";
					return {
						key: sKey,
						text: sText
					};
				}).filter(function(o) {
					return !!o.key;
				}));
			}.bind(this)).catch(function() {
				// Non-blocking: keep typing usable even if F4 fails
				return;
			});

			return this._pPrctrF4All;
		},

		_loadGlGroupF4: function() {
			if (this._pGlGroupF4All) {
				return this._pGlGroupF4All;
			}

			this._pGlGroupF4All = this._readOData("/es_f4_gl_ac_grpset", {
				"$format": "json",
				"$select": "gl_ac_group",
				"$top": "5000"
			}).then(function(aResults) {
				var oLookups = this.getView().getModel("lookups");
				oLookups.setProperty("/glGroups", (aResults || []).map(function(o) {
					var sVal = (o && o.gl_ac_group) ? String(o.gl_ac_group) : "";
					return {
						key: sVal,
						text: sVal
					};
				}).filter(function(o) {
					return !!o.key;
				}));
			}.bind(this)).catch(function() {
				return;
			});

			return this._pGlGroupF4All;
		},

		_readOData: function(sPath, mUrlParameters) {
			var oModel = this._oODataModel;
			return new Promise(function(resolve, reject) {
				if (!oModel) {
					reject(new Error("OData model not available"));
					return;
				}

				oModel.read(sPath, {
					urlParameters: mUrlParameters || {},
					success: function(oData) {
						resolve((oData && oData.results) ? oData.results : []);
					},
					error: function(oErr) {
						reject(oErr);
					}
				});
			});
		},

		_readODataPaged: function(sPath, mUrlParameters, iMaxRows) {
			var iPageSize = 5000;
			var iMax = typeof iMaxRows === "number" ? iMaxRows : 50000;
			var aAll = [];
			var iSkip = 0;

			var fnNext = function() {
				var m = Object.assign({}, mUrlParameters || {});
				m["$top"] = String(iPageSize);
				m["$skip"] = String(iSkip);

				return this._readOData(sPath, m).then(function(aChunk) {
					aChunk = aChunk || [];
					aAll = aAll.concat(aChunk);
					iSkip += aChunk.length;

					if (aChunk.length < iPageSize) {
						return aAll;
					}
					if (aAll.length >= iMax) {
						return aAll.slice(0, iMax);
					}
					return fnNext();
				});
			}.bind(this);

			return fnNext();
		},

		_openMultiSelectValueHelp: function(sTitle, sLookupPath, sFilterPath, mOptions) {
			var oView = this.getView();
			var oFiltersModel = oView.getModel("filters");
			var aCurrent = oFiltersModel.getProperty("/" + sFilterPath) || [];
			var mSelected = {};
			var sF4Kind = (mOptions && mOptions.f4Kind) ? mOptions.f4Kind : "";

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
					// Client-side filtering (F4 lists are loaded once with a BusyIndicator on open).
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
				}.bind(this)
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
			var oUi = this.getView().getModel("ui");
			var oFcr = this.getView().getModel("fcr");

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
			this._updatePeriodText(oFilters, aPeriods);

			// Ensure OData model is ready (metadata + lookup init)
			var pReady = this._initOData();

			// Use core BusyIndicator for compatibility with older UI5 runtimes.
			BusyIndicator.show(0);

			pReady.then(function() {
				var sBukrs = (oFilters.companyCode || "").trim();
				var sYear = (oFilters.fiscalYear || "").trim();
				var aPrctr = aProfitCenters.slice();
				var aGl = aGlGroups.slice();

				var aDetailFilters = [];
				if (sBukrs) {
					aDetailFilters.push("bukrs eq '" + this._odataLiteral(sBukrs) + "'");
				}
				if (sYear) {
					aDetailFilters.push("ryear eq '" + this._odataLiteral(sYear) + "'");
				}
				if (aPrctr.length) {
					aDetailFilters.push("(" + aPrctr.map(function(s) {
						return "prctr eq '" + this._odataLiteral(s) + "'";
					}.bind(this)).join(" or ") + ")");
				}
				if (aGl.length) {
					aDetailFilters.push("(" + aGl.map(function(s) {
						return "gl_ac_group eq '" + this._odataLiteral(s) + "'";
					}.bind(this)).join(" or ") + ")");
				}

				var sDetailFilter = aDetailFilters.join(" and ");

				var aSummaryFilters = [];
				if (sBukrs) {
					aSummaryFilters.push("bukrs eq '" + this._odataLiteral(sBukrs) + "'");
				}
				if (sYear) {
					aSummaryFilters.push("ryear eq '" + this._odataLiteral(sYear) + "'");
				}
				if (aPrctr.length) {
					aSummaryFilters.push("(" + aPrctr.map(function(s) {
						return "prctr eq '" + this._odataLiteral(s) + "'";
					}.bind(this)).join(" or ") + ")");
				}
				if (aGl.length) {
					aSummaryFilters.push("(" + aGl.map(function(s) {
						return "gl_ac_group eq '" + this._odataLiteral(s) + "'";
					}.bind(this)).join(" or ") + ")");
				}
				var sSummaryFilter = aSummaryFilters.join(" and ");

				return Promise.all([
					this._readODataPaged("/es_detailset", sDetailFilter ? {
						"$filter": sDetailFilter
					} : {}, 50000),
					this._readODataPaged("/es_summaryset", sSummaryFilter ? {
						"$filter": sSummaryFilter
					} : {}, 50000)
				]);
			}.bind(this)).then(function(aResults) {
				var aDetailRaw = aResults[0] || [];
				var aSummaryRaw = aResults[1] || [];

				var aDetailRows = aDetailRaw.map(this._mapDetailRowFromOData.bind(this)).filter(Boolean);
				var aSummaryRows = aSummaryRaw.map(this._mapSummaryRowFromOData.bind(this)).filter(Boolean);

				var aTopDetailRows = aDetailRows.slice().sort(this._sortByTotalDesc).slice(0, 5);
				var aTopSummaryRows = aSummaryRows.slice().sort(this._sortByTotalDesc).slice(0, 5);

				oFcr.setData({
					allDetailRows: aDetailRows,
					allSummaryRows: aSummaryRows,
					allSummaryChart: this._createChartRows(aDetailRows, 12),
					topDetailRows: aTopDetailRows,
					topSummaryRows: aTopSummaryRows,
					topSummaryChart: this._createChartRows(aTopDetailRows, 5)
				});

				this._updateTotalsFromPivot(aDetailRows, bMarkRun);

				var sGlobalQuery = oUi.getProperty("/globalSearch") || "";
				this._applyUniversalSearch("all", sGlobalQuery);
				this._applyUniversalSearch("top", sGlobalQuery);
				this._refreshChartStyling();
				this._updateKpisFromActive();
			}.bind(this)).catch(function(oErr) {
				MessageBox.error("Failed to load data from ZO_FCR_SRV.", {
					details: (oErr && oErr.message) ? oErr.message : String(oErr || "")
				});
			}).finally(function() {
				BusyIndicator.hide();
			});

			// Keep old behavior (function is now async, so we stop here).
			return;
			// this._applyUniversalSearch("all", this.getView().getModel("ui").getProperty("/allSearch") || "");
			// this._applyUniversalSearch("top", this.getView().getModel("ui").getProperty("/topSearch") || "");
			// this._refreshChartStyling();
			// this._updateKpisFromActive();
			// --- UPDATE THESE TWO LINES ---
			var sGlobalQuery = this.getView().getModel("ui").getProperty("/globalSearch") || "";
			this._applyUniversalSearch("all", sGlobalQuery);
			this._applyUniversalSearch("top", sGlobalQuery);
			// ------------------------------

			this._refreshChartStyling();
			this._updateKpisFromActive();
		},

		_mapDetailRowFromOData: function(o) {
			if (!o) {
				return null;
			}
			var m = this._mapPeriodFieldsFromOData(o);
			var iTotal = this._parseAmount(o.total);
			var sGlGroup = o.gl_ac_group || "";
			var sGlAccount = o.saknr || "";
			var sGlText = o.gl_ac_text || "";

			return {
				glAccount: sGlAccount,
				glName: sGlText,
				glGroup: sGlGroup,
				glGroupText: sGlGroup,
				p1: m.p1,
				p2: m.p2,
				p3: m.p3,
				p4: m.p4,
				p5: m.p5,
				p6: m.p6,
				p7: m.p7,
				p8: m.p8,
				p9: m.p9,
				p10: m.p10,
				p11: m.p11,
				p12: m.p12,
				p1Text: m.p1Text,
				p2Text: m.p2Text,
				p3Text: m.p3Text,
				p4Text: m.p4Text,
				p5Text: m.p5Text,
				p6Text: m.p6Text,
				p7Text: m.p7Text,
				p8Text: m.p8Text,
				p9Text: m.p9Text,
				p10Text: m.p10Text,
				p11Text: m.p11Text,
				p12Text: m.p12Text,
				q1: m.q1,
				q2: m.q2,
				q3: m.q3,
				q4: m.q4,
				q1Text: m.q1Text,
				q2Text: m.q2Text,
				q3Text: m.q3Text,
				q4Text: m.q4Text,
				total: iTotal,
				totalText: this._formatAmount(iTotal),
				totalState: this._varianceState(iTotal)
			};
		},

		_mapSummaryRowFromOData: function(o) {
			if (!o) {
				return null;
			}
			var m = this._mapPeriodFieldsFromOData(o);
			var iTotal = this._parseAmount(o.total);
			var sGlGroup = o.gl_ac_group || "";
			return {
				glGroup: sGlGroup,
				groupName: sGlGroup,
				p1: m.p1,
				p2: m.p2,
				p3: m.p3,
				p4: m.p4,
				p5: m.p5,
				p6: m.p6,
				p7: m.p7,
				p8: m.p8,
				p9: m.p9,
				p10: m.p10,
				p11: m.p11,
				p12: m.p12,
				p1Text: m.p1Text,
				p2Text: m.p2Text,
				p3Text: m.p3Text,
				p4Text: m.p4Text,
				p5Text: m.p5Text,
				p6Text: m.p6Text,
				p7Text: m.p7Text,
				p8Text: m.p8Text,
				p9Text: m.p9Text,
				p10Text: m.p10Text,
				p11Text: m.p11Text,
				p12Text: m.p12Text,
				q1: m.q1,
				q2: m.q2,
				q3: m.q3,
				q4: m.q4,
				q1Text: m.q1Text,
				q2Text: m.q2Text,
				q3Text: m.q3Text,
				q4Text: m.q4Text,
				total: iTotal,
				totalText: this._formatAmount(iTotal),
				totalState: this._varianceState(iTotal)
			};
		},

		_mapPeriodFieldsFromOData: function(o) {
			var p = {};
			p.p1 = this._parseAmount(o.hsl01);
			p.p2 = this._parseAmount(o.hsl02);
			p.p3 = this._parseAmount(o.hsl03);
			p.p4 = this._parseAmount(o.hsl04);
			p.p5 = this._parseAmount(o.hsl05);
			p.p6 = this._parseAmount(o.hsl06);
			p.p7 = this._parseAmount(o.hsl07);
			// Metadata uses "rhsl08" for November; handle either spelling.
			p.p8 = this._parseAmount((o.rhsl08 !== undefined) ? o.rhsl08 : o.hsl08);
			p.p9 = this._parseAmount(o.hsl09);
			p.p10 = this._parseAmount(o.hsl10);
			p.p11 = this._parseAmount(o.hsl11);
			p.p12 = this._parseAmount(o.hsl12);

			p.p1Text = this._formatAmount(p.p1);
			p.p2Text = this._formatAmount(p.p2);
			p.p3Text = this._formatAmount(p.p3);
			p.p4Text = this._formatAmount(p.p4);
			p.p5Text = this._formatAmount(p.p5);
			p.p6Text = this._formatAmount(p.p6);
			p.p7Text = this._formatAmount(p.p7);
			p.p8Text = this._formatAmount(p.p8);
			p.p9Text = this._formatAmount(p.p9);
			p.p10Text = this._formatAmount(p.p10);
			p.p11Text = this._formatAmount(p.p11);
			p.p12Text = this._formatAmount(p.p12);

			p.q1 = this._parseAmount(o.q1);
			p.q2 = this._parseAmount(o.q2);
			p.q3 = this._parseAmount(o.q3);
			p.q4 = this._parseAmount(o.q4);

			p.q1Text = this._formatAmount(p.q1);
			p.q2Text = this._formatAmount(p.q2);
			p.q3Text = this._formatAmount(p.q3);
			p.q4Text = this._formatAmount(p.q4);

			return p;
		},

		_parseAmount: function(v) {
			if (v === null || v === undefined) {
				return 0;
			}
			if (typeof v === "number") {
				return v;
			}
			var s = String(v);
			s = s.replace(/[, ]/g, "");
			var n = parseFloat(s);
			return isNaN(n) ? 0 : n;
		},

		_odataLiteral: function(sValue) {
			return String(sValue || "").replace(/'/g, "''");
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

				// Scroll down => collapse; scroll back to top => expand.
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
		onUniversalSearch: function(oEvent) {
			// 1. Get the search string
			var sQuery = oEvent.getParameter("newValue") || "";

			// 2. Save it to the model so it persists across refreshes
			this.getView().getModel("ui").setProperty("/globalSearch", sQuery);

			// 3. Apply the search to BOTH tabs (All and Top 5) so it's ready when the user switches
			this._applyUniversalSearch("all", sQuery);
			this._applyUniversalSearch("top", sQuery);

			// 4. Recalculate the KPIs (Actual Cost, Variance, etc.) based on the new filtered rows
			this._updateKpisFromActive();
		},
		_clearSearch: function() {
			var oUi = this.getView().getModel("ui");
			oUi.setProperty("/allSearch", "");
			oUi.setProperty("/topSearch", "");
			oUi.setProperty("/globalSearch", ""); // Clear unified search state
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

		/**
		 * Synchronizes the data model when the MultiInput is cleared via the UI icon
		 */
		onTokenUpdate: function(oEvent) {
			var oFiltersModel = this.getView().getModel("filters");
			var sType = oEvent.getParameter("type");

			// With valueHelpOnly=true, this mainly handles user clearing tokens via the MultiInput "x".
			if (sType === "removed") {
				var oSource = oEvent.getSource();
				var sId = oSource.getId();

				if (sId.includes("quarterInput")) {
					oFiltersModel.setProperty("/quarters", []);
				} else if (sId.includes("profitCentreInput")) {
					oFiltersModel.setProperty("/profitCenters", []);
				} else if (sId.includes("glGroupInput")) {
					oFiltersModel.setProperty("/glGroups", []);
				}
			}
		}
	});
});