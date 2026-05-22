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
	"sap/ui/core/BusyIndicator",
	"sap/m/BusyDialog"
], function(Controller, JSONModel, NumberFormat, Dialog, List, StandardListItem, Button, SearchField, Filter, FilterOperator,
	MessageToast, MessageBox, File, BusyIndicator, BusyDialog) {
	"use strict";

	return Controller.extend("Z_Fixed_Cost_Report_FCR.controller.View1", {
		onInit: function() {

			this.setUpFiscalYear();

			this._oODataModel = null;
			this._oODataReady = null;

			// this._oAmountFormat = NumberFormat.getFloatInstance({
			// 	groupingEnabled: true,
			// 	maxFractionDigits: 0
			// });
			this._oAmountFormat = NumberFormat.getFloatInstance({
				groupingEnabled: true,
				minFractionDigits: 2, // Forces exactly 2 decimal places (e.g., 100.00)
				maxFractionDigits: 2 // Limits to maximum 2 decimal places
			});

			// ADD THIS NEW FORMATTER FOR WHOLE NUMBERS:
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

			// Kept for compatibility with existing helper functions and UI text mapping.
			this._mGroupNames = {};

			this._aPeriodMonthNames = ["", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

			this.getView().setModel(new JSONModel({
				// companyCode: "",
				// fiscalYear: "",
				companyCode: "1100", // Default to 1100
				fiscalYear: "2026", // Default to 2026
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
				// Quarter Fields
				q1Visible: false,
				q2Visible: false,
				q3Visible: false,
				q4Visible: false,

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

			// Load data automatically on initial load since we now have defaults
			this._applyFilters(false);
		},

		// _getBusyDialog: function() {
		// 	if (!this._oBusyDialog) {
		// 		this._oBusyDialog = new BusyDialog({
		// 			title: "Fetching Data",
		// 			text: "Initializing report, please wait...",
		// 			// showCancelButton: false, // Prevents users from interrupting the data fetch
		// 			// customIcon: "sap-icon://loading", // Adds a familiar Fiori loading icon
		// 			// customIconRotationSpeed: 1000 // Smooth, consistent rotation
		// 			showCancelButton: false,
		// 			customIcon: "sap-icon://synchronize",
		// 			customIconRotationSpeed: 800

		// 			// customClass: "fcrBusyDialog"
		// 		});
		// 		this._oBusyDialog.addStyleClass("fcrBusyDialog");
		// 	}

		// 	// Dynamically update the text based on current filters for better UX
		// 	// var oFilters = this.getView().getModel("filters").getData();
		// 	// this._oBusyDialog.setText("Preparing " + (oFilters.fiscalYear || "") + " data for your selection...");

		// 	return this._oBusyDialog;
		// },
		_getBusyDialog: function() {
			if (!this._oBusyDialog) {
				this._oBusyDialog = new sap.m.Dialog({
					title: "Fetching Data", // Restored title!
					contentWidth: "20rem",
					escapeHandler: function(oPromise) {
						oPromise.reject(); // Prevents closing with the ESC key
					},
					content: [
						new sap.m.VBox({
							alignItems: "Center",
							justifyContent: "Center",
							items: [
								// 1. Inject pure HTML for a modern CSS spinner
								new sap.ui.core.HTML({
									content: "<div class='fcrModernSpinner'></div>"
								}).addStyleClass("sapUiMediumMarginTop sapUiSmallMarginBottom"),

								// 2. Your loading text
								new sap.m.Text({
									text: "Initializing report, please wait...",
									textAlign: "Center"
								}).addStyleClass("sapUiMediumMarginBottom sapUiSmallMarginTop")
							]
						})
					]
				});
			}
			return this._oBusyDialog;
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
			this._configureTrendChart(); // Configures the new Trend Chart
			this._connectPopovers(); // Add this line
			// this._wireScrollAutoCollapse();
		},

		setUpFiscalYear: function() {
			var aYears = [];
			var iCurrentYear = new Date().getFullYear();

			for (var i = iCurrentYear - 5; i <= iCurrentYear + 5; i++) {
				aYears.push({
					key: i.toString(),
					text: i.toString()
				});
			}

			var oYearModel = new sap.ui.model.json.JSONModel({
				years: aYears
			});

			this.getView().setModel(oYearModel, "yearModel");
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
				// companyCode: "1100", // Default to 1100
				// fiscalYear: "2026", // Default to 2026
				companyCode: "",
				fiscalYear: "",
				profitCenters: [],
				glGroups: [],
				quarters: []
			});
			this._clearSearch();
			// Do not auto-fetch on reset; user will press Run Report.
			MessageToast.show("Reset All Parameters");
			// this._applyFilters(true);
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
			this._getBusyDialog().open();
			this._initOData().then(function() {
				return this._loadProfitCenterF4();
			}.bind(this)).then(function() {
				this._getBusyDialog().close();
				this._openMultiSelectValueHelp("Profit Centre", "profitCenters", "profitCenters", {
					f4Kind: "PRCTR"
				});
			}.bind(this)).catch(function() {
				this._getBusyDialog().close();
			});
		},

		onGlGroupValueHelp: function() {
			this._getBusyDialog().open();
			this._initOData().then(function() {
				return this._loadGlGroupF4();
			}.bind(this)).then(function() {
				this._getBusyDialog().close();
				this._openMultiSelectValueHelp("GL Group", "glGroups", "glGroups", {
					f4Kind: "GLGRP"
				});
			}.bind(this)).catch(function() {
				this._getBusyDialog().close();
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
			var that = this;
			var oFilters = that.getView().getModel("filters").getData();
			var oUi = that.getView().getModel("ui");
			var oFcr = that.getView().getModel("fcr");

			// Handle Quarters Multi-Selection
			var aSelectedQuarters = (oFilters.quarters || []).map(function(o) {
				return o.key;
			});
			var aPeriods = [];
			aSelectedQuarters.forEach(function(sQ) {
				aPeriods = aPeriods.concat(that._mQuarterPeriods[sQ] || []);
			}.bind(that));

			var aProfitCenters = (oFilters.profitCenters || []).map(function(oItem) {
				return oItem.key;
			});
			var aGlGroups = (oFilters.glGroups || []).map(function(oItem) {
				return oItem.key;
			});

			// Fix: If no specific quarters are selected, keep columns active for all months (1 to 12)
			// that._syncPeriodVisibility(aPeriods);
			this._syncPeriodVisibility(aSelectedQuarters);
			that._updateSelectedValuesText(oFilters);
			that._updatePeriodText(oFilters, aPeriods);

			// Ensure OData model is ready (metadata + lookup init)
			var pReady = that._initOData();

			// Use core BusyIndicator for compatibility with older UI5 runtimes.
			that._getBusyDialog().open();

			pReady.then(function() {
				var sBukrs = (oFilters.companyCode || "").trim();
				var sYear = (oFilters.fiscalYear || "").trim();
				var aPrctr = aProfitCenters.slice();
				var aGl = aGlGroups.slice();

				var aDetailFilters = [];
				if (sBukrs) {
					aDetailFilters.push("bukrs eq '" + that._odataLiteral(sBukrs) + "'");
				}
				if (sYear) {
					aDetailFilters.push("ryear eq '" + that._odataLiteral(sYear) + "'");
				}
				if (aPrctr.length) {
					aDetailFilters.push("(" + aPrctr.map(function(s) {
						return "prctr eq '" + that._odataLiteral(s) + "'";
					}.bind(that)).join(" or ") + ")");
				}
				if (aGl.length) {
					aDetailFilters.push("(" + aGl.map(function(s) {
						return "gl_ac_group eq '" + that._odataLiteral(s) + "'";
					}.bind(that)).join(" or ") + ")");
				}

				var sDetailFilter = aDetailFilters.join(" and ");

				var aSummaryFilters = [];
				if (sBukrs) {
					aSummaryFilters.push("bukrs eq '" + that._odataLiteral(sBukrs) + "'");
				}
				if (sYear) {
					aSummaryFilters.push("ryear eq '" + that._odataLiteral(sYear) + "'");
				}
				if (aPrctr.length) {
					aSummaryFilters.push("(" + aPrctr.map(function(s) {
						return "prctr eq '" + that._odataLiteral(s) + "'";
					}.bind(that)).join(" or ") + ")");
				}
				if (aGl.length) {
					aSummaryFilters.push("(" + aGl.map(function(s) {
						return "gl_ac_group eq '" + that._odataLiteral(s) + "'";
					}.bind(that)).join(" or ") + ")");
				}
				var sSummaryFilter = aSummaryFilters.join(" and ");

				return Promise.all([
					that._readODataPaged("/es_detailset", sDetailFilter ? {
						"$filter": sDetailFilter
					} : {}, 50000),
					that._readODataPaged("/es_summaryset", sSummaryFilter ? {
						"$filter": sSummaryFilter
					} : {}, 50000)
				]);
			}.bind(that)).then(function(aResults) {
				var aDetailRaw = aResults[0] || [];
				var aSummaryRaw = aResults[1] || [];

				var aDetailRows = aDetailRaw.map(that._mapDetailRowFromOData.bind(that)).filter(Boolean);
				var aSummaryRows = aSummaryRaw.map(that._mapSummaryRowFromOData.bind(that)).filter(Boolean);

				// =========================================================
				// MODERN CUSTOM "NO DATA" DIALOG
				// =========================================================
				if (aDetailRows.length === 0 && aSummaryRows.length === 0) {
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

				var aTopDetailRows = aDetailRows.slice().sort(that._sortByTotalDesc).slice(0, 5);
				var aTopSummaryRows = aSummaryRows.slice().sort(that._sortByTotalDesc).slice(0, 5);

				oFcr.setData({
					allDetailRows: aDetailRows,
					allSummaryRows: aSummaryRows,
					// allSummaryChart: this._createChartRows(aDetailRows, 12),
					// FIX: Removed the 12 limit. It will now show everything in aSummaryRows.
					allSummaryChart: that._createChartRows(aSummaryRows),
					topDetailRows: aTopDetailRows,
					topSummaryRows: aTopSummaryRows,
					topSummaryChart: that._createChartRows(aTopDetailRows, 5)
				});

				that._updateTotalsFromPivot(aDetailRows, bMarkRun);

				var sGlobalQuery = oUi.getProperty("/globalSearch") || "";
				that._applyUniversalSearch("all", sGlobalQuery);
				that._applyUniversalSearch("top", sGlobalQuery);
				that._refreshChartStyling();
				that._updateKpisFromActive();
			}.bind(that)).catch(function(oErr) {
				MessageBox.error("Failed to load data from ZO_FCR_SRV.", {
					details: (oErr && oErr.message) ? oErr.message : String(oErr || "")
				});
				that._getBusyDialog().close();
			}).finally(function() {
				that._getBusyDialog().close();
			});

			// Keep old behavior (function is now async, so we stop here).
			return;
			// this._applyUniversalSearch("all", this.getView().getModel("ui").getProperty("/allSearch") || "");
			// this._applyUniversalSearch("top", this.getView().getModel("ui").getProperty("/topSearch") || "");
			// this._refreshChartStyling();
			// this._updateKpisFromActive();
			// --- UPDATE THESE TWO LINES ---
			var sGlobalQuery = that.getView().getModel("ui").getProperty("/globalSearch") || "";
			that._applyUniversalSearch("all", sGlobalQuery);
			that._applyUniversalSearch("top", sGlobalQuery);
			// ------------------------------

			that._refreshChartStyling();
			that._updateKpisFromActive();
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

				// ADD THIS LINE to pull the Profit Centre from OData
				profitCentre: o.prctr || "",

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
				profitCentre: o.prctr || "",
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

		// _parseAmount: function(v) {
		// 	if (v === null || v === undefined) {
		// 		return 0;
		// 	}
		// 	if (typeof v === "number") {
		// 		return v;
		// 	}
		// 	var s = String(v);
		// 	s = s.replace(/[, ]/g, "");
		// 	var n = parseFloat(s);
		// 	return isNaN(n) ? 0 : n;
		// },

		_parseAmount: function(v) {
			if (v === null || v === undefined) {
				return 0;
			}
			var n = 0;
			if (typeof v === "number") {
				n = v;
			} else {
				var s = String(v);
				s = s.replace(/[, ]/g, "");
				n = parseFloat(s);
			}
			
			if (isNaN(n)) {
				return 0;
			}
			
			// ==========================================
			// CONVERT TO LACS (Divide by 1,00,000)
			// ==========================================
			return n / 100000;
		},
		_odataLiteral: function(sValue) {
			return String(sValue || "").replace(/'/g, "''");
		},

		// _updateTotalsFromPivot: function(aRows, bMarkRun) {
		// 	var iTotal = aRows.reduce(function(iSum, oRow) {
		// 		return iSum + (oRow.total || 0);
		// 	}, 0);
		// 	var iMax = 0;
		// 	if (aRows && aRows.length) {
		// 		iMax = aRows.reduce(function(iBest, oRow) {
		// 			return Math.max(iBest, Math.abs(oRow.total || 0));
		// 		}, 0);
		// 	}
		// 	var oUiModel = this.getView().getModel("ui");

		// 	oUiModel.setProperty("/totalActual", this._formatAmount(iTotal));
		// 	oUiModel.setProperty("/totalBudget", this._formatAmount(0));
		// 	oUiModel.setProperty("/totalVariance", this._formatAmount(iMax));
		// 	oUiModel.setProperty("/variancePct", this._formatPercent(0));
		// 	oUiModel.setProperty("/varianceState", this._varianceState(iMax));
		// 	oUiModel.setProperty("/recordCount", this._formatAmount(aRows.length));

		// 	if (bMarkRun) {
		// 		oUiModel.setProperty("/lastRunText", "Last run just now");
		// 	}
		// },
		_updateTotalsFromPivot: function(aRows, bMarkRun) {
			var iTotal = 0;
			var iMax = 0;
			var sTopGroupName = "None";
			var iTopGroupValue = 0;

			aRows.forEach(function(oRow) {
				var val = oRow.total || 0;
				iTotal += val;

				// Identify the row with the largest absolute total
				if (Math.abs(val) > iMax) {
					iMax = Math.abs(val);
					// If it's a detail row, use glName; if summary, use groupName
					sTopGroupName = oRow.glName || oRow.groupName || "Unknown";
					iTopGroupValue = val;
				}
			});

			var oUiModel = this.getView().getModel("ui");
			oUiModel.setProperty("/totalActual", this._formatAmount(iTotal));
			oUiModel.setProperty("/maxGlGroupName", sTopGroupName); // New property
			oUiModel.setProperty("/maxGlGroupValue", this._formatAmount(iTopGroupValue)); // New property
			oUiModel.setProperty("/totalVariance", this._formatAmount(iMax));
			// oUiModel.setProperty("/recordCount", this._formatAmount(aRows.length));
			oUiModel.setProperty("/recordCount", this._oIntegerFormat.format(aRows.length));

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

		// _createChartRows: function(aRows, iLimit) {
		// 	var aSource = (aRows || []).slice();
		// 	aSource.sort(this._sortByTotalDesc);
		// 	if (iLimit) {
		// 		aSource = aSource.slice(0, iLimit);
		// 	}
		// 	return aSource.map(function(oRow) {
		// 		return {
		// 			name: oRow.glAccount + " - " + oRow.glName,
		// 			value: oRow.total
		// 		};
		// 	});
		// },
		_createChartRows: function(aRows, iLimit) {
			var aSource = (aRows || []).slice();
			aSource.sort(this._sortByTotalDesc);

			// 👇 LOOK AT THIS IF STATEMENT 👇
			if (iLimit) {
				aSource = aSource.slice(0, iLimit);
			}

			return aSource.map(function(oRow) {
				// var sName = oRow.glAccount ? (oRow.glAccount + " - " + oRow.glName) : (oRow.glGroup + " - " + oRow.groupName);
				var sName = oRow.glAccount ? (oRow.glAccount + " - " + oRow.glName) : oRow.glGroup;
				return {
					name: sName,
					value: oRow.total
				};
			});
		},

		// _configureCharts: function() {
		// 	["allSummaryChart", "topSummaryChart"].forEach(function(sChartId) {
		// 		var oVizFrame = this.byId(sChartId);
		// 		if (!oVizFrame || oVizFrame.data("configured")) {
		// 			return;
		// 		}
		// 		oVizFrame.setVizProperties({
		// 			// title: {
		// 			// 	visible: false
		// 			// },
		// 			title: {
		// 				visible: true,
		// 				// Automatically sets the correct title based on the chart ID
		// 				text: sChartId.includes("top") ? "Top 5 G/L Accounts by Total" : "All G/L Accounts by Total"
		// 			},
		// 			legend: {
		// 				visible: true
		// 			},
		// 			plotArea: {
		// 				dataLabel: {
		// 					visible: true
		// 				},
		// 				drawingEffect: "glossy",
		// 				colorPalette: this._paletteForChart(sChartId),
		// 				animation: {
		// 					dataLoading: true
		// 				},
		// 				gap: {
		// 					barSpacing: 2.2
		// 				}
		// 			},
		// 			// valueAxis: {
		// 			// 	title: {
		// 			// 		visible: true,
		// 			// 		text: "Total"
		// 			// 	}
		// 			// },
		// 			// categoryAxis: {
		// 			// 	title: {
		// 			// 		visible: true,
		// 			// 		text: "G/L Group"
		// 			// 	},
		// 			// 	label: {
		// 			// 		rotation: "45", // Rotates text so it doesn't overlap
		// 			// 		truncate: false, // Disables the "..." truncation
		// 			// 		style: {
		// 			// 			maxWidth: "200" // Allows wider labels before wrapping
		// 			// 		}
		// 			// 	}
		// 			// },
		// 			// // This enables the detailed popover content
		// 			// interaction: {
		// 			// 	selectability: {
		// 			// 		mode: "single"
		// 			// 	}
		// 			// }
		// 			interaction: {
		// 				selectability: {
		// 					mode: "multiple"
		// 				}
		// 			},
		// 			categoryAxis: {
		// 				title: {
		// 					visible: true,
		// 					text: "G/L Group"
		// 				},
		// 				label: {
		// 					visible: true,
		// 					allowMultiline: true,
		// 					linesOfWrap: 4,
		// 					overlapBehavior: "wrap",
		// 					rotation: 0,
		// 					angle: 0,
		// 					maxWidth: 200,
		// 					truncatedLabelRatio: 0.9,
		// 					style: {
		// 						fontSize: "12px",
		// 						fontWeight: "bold"
		// 					}
		// 				}
		// 			},
		// 			valueAxis: {
		// 				label: {
		// 					visible: true
		// 				}
		// 			}
		// 		});
		// 		oVizFrame.data("configured", true);
		// 	}.bind(this));
		// },
		_configureCharts: function() {
			["allSummaryChart", "topSummaryChart"].forEach(function(sChartId) {
				var oVizFrame = this.byId(sChartId);
				if (!oVizFrame || oVizFrame.data("configured")) {
					return;
				}

				// 1. Generate the color rules dynamically for this specific chart
				var aRules = this._dataPointRulesForChart(sChartId);

				oVizFrame.setVizProperties({
					title: {
						visible: true,
						// Automatically sets the correct title based on the chart ID
						text: sChartId.includes("top") ? "Top 5 G/L Accounts by Total" : "All G/L Accounts by Total"
					},
					legend: {
						visible: false // Hidden since every bar gets a unique, specific color
					},
					plotArea: {
						dataLabel: {
							visible: true
						},
						drawingEffect: "glossy",

						// 2. REPLACED colorPalette with dataPointStyle
						dataPointStyle: {
							rules: aRules
						},

						animation: {
							dataLoading: true
						},
						gap: {
							barSpacing: 2.0
								// innerGroupSpacing: 3.0,
								// groupSpacing: 3.0
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
							text: "G/L Group"
						},
						label: {
							visible: true,
							allowMultiline: true,
							linesOfWrap: 2,
							overlapBehavior: "wrap",
							rotation: 0,
							angle: 0,
							maxWidth: 200,
							truncatedLabelRatio: 0.9,
							style: {
								fontSize: "12px",
								fontWeight: "bold"
							}
						}
					},
					valueAxis: {
						label: {
							visible: true,
							text: "Total Amount (in Lacs)"
						}
					}
				});
				oVizFrame.data("configured", true);
			}.bind(this));
		},

		_configureTrendChart: function() {
			["allTrendChart", "topTrendChart"].forEach(function(sChartId) {
				var oVizFrame = this.byId(sChartId);
				if (!oVizFrame || oVizFrame.data("configured")) {
					return;
				}

				oVizFrame.setVizProperties({
					// title: {
					// 	visible: false
					// },
					title: {
						visible: true,
						text: sChartId.includes("top") ? "Top 5 Trend by Period & G/L Group" : "Overall Trend by Period & G/L Group"
					},
					legend: {
						visible: false
					}, // Hidden since every bar will be a unique color
					plotArea: {
						dataLabel: {
							visible: true
						},
						drawingEffect: "glossy",
						colorPalette: this._paletteForChart(sChartId),
						gap: {
							barSpacing: 1.4,
							groupSpacing: 0.3
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
							text: "Period & G/L Group"
						},
						label: {
							// rotation: "0", 
							// // FIX: Enable multiline so long horizontal labels wrap instead of overlapping
							// allowMultiline: true,
							// linesOfWrap: 3,
							// style: {
							// 	fontSize: "11px",
							// 	fontWeight: "bold"
							// }
							visible: true,
							allowMultiline: true,
							linesOfWrap: 4,
							overlapBehavior: "wrap",
							rotation: 0,
							angle: 0,
							maxWidth: 400,
							truncatedLabelRatio: 0.9,
							style: {
								fontSize: "12px",
								fontWeight: "bold"
							}
						}
					},
					valueAxis: {
						title: {
							visible: true,
							text: "Period Amount (Lacs)"
						}
					}
				});

				oVizFrame.data("configured", true);
			}.bind(this));
		},

		// Add this new function
		_connectPopovers: function() {
			var oAllChart = this.byId("allSummaryChart");
			var oAllPop = this.byId("allSummaryPopover");
			if (oAllChart && oAllPop) {
				oAllPop.connect(oAllChart.getVizUid());
			}

			var oTopChart = this.byId("topSummaryChart");
			var oTopPop = this.byId("topSummaryPopover");
			if (oTopChart && oTopPop) {
				oTopPop.connect(oTopChart.getVizUid());
			}

			// ADD THIS NEW BLOCK FOR THE TREND CHART
			var oTrendChart = this.byId("allTrendChart");
			var oTrendPop = this.byId("allTrendPopover");
			if (oTrendChart && oTrendPop) {
				oTrendPop.connect(oTrendChart.getVizUid());
			}

			// ADD THIS FOR TOP 5 TREND
			var oTopTrendChart = this.byId("topTrendChart");
			var oTopTrendPop = this.byId("topTrendPopover");
			if (oTopTrendChart && oTopTrendPop) {
				oTopTrendPop.connect(oTopTrendChart.getVizUid());
			}
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

		// _paletteForChart: function(sChartId) {
		// 	var oFcr = this.getView().getModel("fcr");
		// 	var sPath = sChartId === "topSummaryChart" ? "/topSummaryChart" : "/allSummaryChart";
		// 	var aData = oFcr.getProperty(sPath) || [];
		// 	var a = [];
		// 	for (var i = 0; i < aData.length; i++) {
		// 		a.push(this._colorForKey(aData[i].name));
		// 	}
		// 	return a;
		// },
		// _paletteForChart: function(sChartId) {
		// 	var oFcr = this.getView().getModel("fcr");
		// 	var aColors = [];

		// 	// Custom logic to extract colors specifically for the Trend Chart
		// 	if (sChartId === "allTrendChart") {
		// 		var aTrendData = oFcr.getProperty("/allTrendChart") || [];
		// 		var mUnique = {};
		// 		// Find all unique GL Groups so we don't duplicate colors
		// 		aTrendData.forEach(function(oRow) {
		// 			mUnique[oRow.gl] = true;
		// 		});
		// 		var aUniqueGroups = Object.keys(mUnique);
		// 		for (var j = 0; j < aUniqueGroups.length; j++) {
		// 			aColors.push(this._colorForKey(aUniqueGroups[j]));
		// 		}
		// 		return aColors;
		// 	}

		// 	// Original logic for the Summary Charts
		// 	var sPath = sChartId === "topSummaryChart" ? "/topSummaryChart" : "/allSummaryChart";
		// 	var aData = oFcr.getProperty(sPath) || [];
		// 	for (var i = 0; i < aData.length; i++) {
		// 		aColors.push(this._colorForKey(aData[i].name));
		// 	}
		// 	return aColors;
		// },

		_paletteForChart: function(sChartId) {
			var oFcr = this.getView().getModel("fcr");
			var aColors = [];

			if (sChartId === "allTrendChart" || sChartId === "topTrendChart") {
				var sTrendPath = sChartId === "topTrendChart" ? "/topTrendChart" : "/allTrendChart";
				var aTrendData = oFcr.getProperty(sTrendPath) || [];
				var mUnique = {};

				aTrendData.forEach(function(oRow) {
					mUnique[oRow.colorId] = true;
				});
				var aUniqueLabels = Object.keys(mUnique);
				for (var j = 0; j < aUniqueLabels.length; j++) {
					aColors.push(this._colorForKey(aUniqueLabels[j]));
				}
				return aColors;
			}

			var sPath = sChartId === "topSummaryChart" ? "/topSummaryChart" : "/allSummaryChart";
			var aData = oFcr.getProperty(sPath) || [];
			for (var i = 0; i < aData.length; i++) {
				aColors.push(this._colorForKey(aData[i].name));
			}
			return aColors;
		},

		_colorForKey: function(sKey) {
			// Vibrant Fiori chart colors for maximum contrast
			var aColors = [
				"#5899DA", "#E8743B", "#19A979", "#ED4A7B", "#945ECF",
				"#13A4B4", "#525DF4", "#BF399E", "#6C8893", "#EE6868",
				"#2F6497", "#E48F29", "#29846E", "#D54366", "#734F96",
				"#00A6A6", "#F1B500", "#7A1C7D", "#A6A6A6", "#007D34"
			];

			var s = String(sKey || "");
			var hash = 0;
			for (var i = 0; i < s.length; i++) {
				hash = ((hash << 5) - hash) + s.charCodeAt(i);
				hash |= 0;
			}
			var index = Math.abs(hash) % aColors.length;
			return aColors[index];
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
		_syncPeriodVisibility: function(aSelectedQuarters) {
			var oUiModel = this.getView().getModel("ui");
			var bQuarterSelected = (aSelectedQuarters && aSelectedQuarters.length > 0);

			// Hide/Show Month columns (p1 - p12)
			for (var i = 1; i <= 12; i++) {
				oUiModel.setProperty("/p" + i + "Visible", !bQuarterSelected);
			}

			// Hide/Show Quarter columns (q1 - q4)
			oUiModel.setProperty("/q1Visible", bQuarterSelected && aSelectedQuarters.indexOf("Q1") !== -1);
			oUiModel.setProperty("/q2Visible", bQuarterSelected && aSelectedQuarters.indexOf("Q2") !== -1);
			oUiModel.setProperty("/q3Visible", bQuarterSelected && aSelectedQuarters.indexOf("Q3") !== -1);
			oUiModel.setProperty("/q4Visible", bQuarterSelected && aSelectedQuarters.indexOf("Q4") !== -1);
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
				new Filter("fiscalYear", FilterOperator.Contains, s),

				new Filter("profitCentre", FilterOperator.Contains, s)
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

		// _syncChartsFromTables: function() {
		// 	var oFcr = this.getView().getModel("fcr");
		// 	var oAllDetail = this.byId("allDetailTable");
		// 	if (oAllDetail && oAllDetail.getBinding("rows")) {
		// 		var aAll = this._getFilteredTableObjects(oAllDetail, "fcr", "/allDetailRows");
		// 		oFcr.setProperty("/allSummaryChart", this._createChartRows(aAll, 12));
		// 	}
		// 	var oTopDetail = this.byId("topDetailTable");
		// 	if (oTopDetail && oTopDetail.getBinding("rows")) {
		// 		var aTop = this._getFilteredTableObjects(oTopDetail, "fcr", "/topDetailRows");
		// 		oFcr.setProperty("/topSummaryChart", this._createChartRows(aTop, 5));
		// 	}
		// 	this._refreshChartStyling();
		// },

		_syncChartsFromTables: function() {
			var oFcr = this.getView().getModel("fcr");

			var oAllSummary = this.byId("allSummaryTable");
			if (oAllSummary && oAllSummary.getBinding("rows")) {
				var aAll = this._getFilteredTableObjects(oAllSummary, "fcr", "/allSummaryRows");
				// FIX: Removed the 12 limit here as well.
				oFcr.setProperty("/allSummaryChart", this._createChartRows(aAll));

				// ADD THIS LINE FOR THE NEW CHART:
				oFcr.setProperty("/allTrendChart", this._createTrendData(aAll));
			}

			var oTopSummary = this.byId("topSummaryTable");
			if (oTopSummary && oTopSummary.getBinding("rows")) {
				var aTop = this._getFilteredTableObjects(oTopSummary, "fcr", "/topSummaryRows");
				oFcr.setProperty("/topSummaryChart", this._createChartRows(aTop, 5));

				// ADD THIS LINE: Generate trend data for the Top 5
				oFcr.setProperty("/topTrendChart", this._createTrendData(aTop));
			}
			this._refreshChartStyling();
		},
		// _createTrendData: function(aRows) {
		// 	var aTrendData = [];
		// 	var aVisiblePeriods = [];

		// 	// 1. Identify which Months are visible (p1 to p12)
		// 	for (var i = 1; i <= 12; i++) {
		// 		if (this.getView().getModel("ui").getProperty("/p" + i + "Visible")) {
		// 			aVisiblePeriods.push({
		// 				key: "p" + i,
		// 				label: this._aPeriodMonthNames[i]
		// 			});
		// 		}
		// 	}

		// 	// 2. Identify which Quarters are visible (q1 to q4)
		// 	for (var j = 1; j <= 4; j++) {
		// 		if (this.getView().getModel("ui").getProperty("/q" + j + "Visible")) {
		// 			aVisiblePeriods.push({
		// 				key: "q" + j,
		// 				label: "Q" + j
		// 			});
		// 		}
		// 	}

		// 	// 3. Extract the specific month/quarter value for each GL Group
		// 	aRows.forEach(function(oRow) {
		// 		aVisiblePeriods.forEach(function(oPeriod) {
		// 			aTrendData.push({
		// 				gl: oRow.glGroup, // The GL Group name
		// 				period: oPeriod.label, // "Apr", "May", or "Q1"
		// 				value: oRow[oPeriod.key] || 0 // The actual value for that specific month/quarter!
		// 			});
		// 		});
		// 	});

		// 	return aTrendData;
		// },
		_createTrendData: function(aRows) {
			var aTrendData = [];
			var aVisiblePeriods = [];

			for (var i = 1; i <= 12; i++) {
				if (this.getView().getModel("ui").getProperty("/p" + i + "Visible")) {
					aVisiblePeriods.push({
						key: "p" + i,
						label: this._aPeriodMonthNames[i]
					});
				}
			}
			for (var j = 1; j <= 4; j++) {
				if (this.getView().getModel("ui").getProperty("/q" + j + "Visible")) {
					aVisiblePeriods.push({
						key: "q" + j,
						label: "Q" + j
					});
				}
			}

			aRows.forEach(function(oRow) {
				aVisiblePeriods.forEach(function(oPeriod) {
					var iVal = oRow[oPeriod.key] || 0;

					if (iVal !== 0) {
						aTrendData.push({
							// We generate a unique string purely for color assignment later
							colorId: oPeriod.label + " - " + (oRow.groupName || oRow.glGroup),
							gl: oRow.glGroup,
							period: oPeriod.label,
							value: iVal
						});
					}
				});
			});
			return aTrendData;
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
			// oUi.setProperty("/recordCount", this._formatAmount(aRows.length));
			oUi.setProperty("/recordCount", this._oIntegerFormat.format(aRows.length));
		},

		// _refreshChartStyling: function() {
		// 	["allSummaryChart", "topSummaryChart"].forEach(function(sChartId) {
		// 		var oVizFrame = this.byId(sChartId);
		// 		if (!oVizFrame) {
		// 			return;
		// 		}
		// 		var aRules = this._dataPointRulesForChart(sChartId);
		// 		oVizFrame.setVizProperties({
		// 			plotArea: {
		// 				drawingEffect: "glossy",
		// 				colorPalette: this._paletteForChart(sChartId),
		// 				dataPointStyle: {
		// 					rules: aRules
		// 				}
		// 			}
		// 		});
		// 	}.bind(this));
		// },
		// _refreshChartStyling: function() {
		// 	// 1. Refresh Original Charts
		// 	["allSummaryChart", "topSummaryChart"].forEach(function(sChartId) {
		// 		var oVizFrame = this.byId(sChartId);
		// 		if (!oVizFrame) {
		// 			return;
		// 		}

		// 		var aRules = this._dataPointRulesForChart(sChartId);
		// 		oVizFrame.setVizProperties({
		// 			plotArea: {
		// 				drawingEffect: "glossy",
		// 				colorPalette: this._paletteForChart(sChartId),
		// 				dataPointStyle: {
		// 					rules: aRules
		// 				}
		// 			}
		// 		});
		// 	}.bind(this));

		// 	// 2. Refresh Trend Chart Separately
		// 	var oTrendViz = this.byId("allTrendChart");
		// 	if (oTrendViz) {
		// 		oTrendViz.setVizProperties({
		// 			plotArea: {
		// 				drawingEffect: "glossy",
		// 				// Give it the palette, but DO NOT apply dataPointStyle rules!
		// 				colorPalette: this._paletteForChart("allTrendChart")
		// 			}
		// 		});
		// 	}
		// },
		_refreshChartStyling: function() {
			// Apply dataPointStyle rules to ALL 4 charts dynamically
			["allSummaryChart", "topSummaryChart", "allTrendChart", "topTrendChart"].forEach(function(sChartId) {
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
			var aRules = [];

			// 1. Rules for the TREND Charts (Using multiple dimensions like your reference code)
			if (sChartId === "allTrendChart" || sChartId === "topTrendChart") {
				var sTrendPath = sChartId === "topTrendChart" ? "/topTrendChart" : "/allTrendChart";
				var aTrendData = oFcr.getProperty(sTrendPath) || [];

				aTrendData.forEach(function(oRow) {
					aRules.push({
						// Maps exactly to the XML dimension names
						dataContext: {
							"Period": oRow.period,
							"GL Group": oRow.gl
						},
						properties: {
							color: this._colorForKey(oRow.colorId)
						}
					});
				}.bind(this));

				return aRules;
			}

			// 2. Rules for the SUMMARY Charts (Single dimension)
			var sPath = sChartId === "topSummaryChart" ? "/topSummaryChart" : "/allSummaryChart";
			var aData = oFcr.getProperty(sPath) || [];

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

		// _csvColumnsForMode: function(sMode) {
		// 	var oUi = this.getView().getModel("ui");
		// 	var aPeriods = [];
		// 	for (var i = 1; i <= 12; i++) {
		// 		if (oUi.getProperty("/p" + i + "Visible")) {
		// 			aPeriods.push(i);
		// 		}
		// 	}
		// 	var a = [];
		// 	if (sMode === "DETAIL") {
		// 		a.push({
		// 			key: "glAccount",
		// 			label: "G/L Acct"
		// 		});
		// 		a.push({
		// 			key: "glName",
		// 			label: "G/L Acct Long Text"
		// 		});
		// 		a.push({
		// 			key: "glGroupText",
		// 			label: "G/L Group"
		// 		});
		// 	} else {
		// 		a.push({
		// 			key: "glGroup",
		// 			label: "G/L Group"
		// 		});
		// 		a.push({
		// 			key: "groupName",
		// 			label: "G/L Group Text"
		// 		});
		// 	}
		// 	a.push({
		// 		key: "total",
		// 		label: "Total"
		// 	});
		// 	aPeriods.forEach(function(iP) {
		// 		a.push({
		// 			key: "p" + iP,
		// 			label: this._aPeriodMonthNames[iP]
		// 		});
		// 	}.bind(this));
		// 	return a;
		// },

		_csvColumnsForMode: function(sMode) {
			var oUi = this.getView().getModel("ui");
			var a = [];

			// 1. Add Header Columns based on View Mode
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

			// 2. Add Total
			a.push({
				key: "total",
				label: "Total (in Lacs)"
			});

			// 3. Add visible Month columns (p1-p12)
			for (var i = 1; i <= 12; i++) {
				if (oUi.getProperty("/p" + i + "Visible")) {
					a.push({
						key: "p" + i,
						label: this._aPeriodMonthNames[i]
					});
				}
			}

			// 4. ADD THIS BLOCK: Add visible Quarter columns (q1-q4)
			for (var j = 1; j <= 4; j++) {
				if (oUi.getProperty("/q" + j + "Visible")) {
					a.push({
						key: "q" + j,
						label: "Q" + j
					});
				}
			}

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
		},

		onPeriodHeaderClick: function(oEvent) {
			// 1. Get which month/quarter was clicked from the Link's custom data
			var oSource = oEvent.getSource();
			var sPeriodKey = oSource.data("periodKey"); // e.g., "p1"
			var sPeriodLabel = oSource.data("periodLabel"); // e.g., "April"

			var oUiModel = this.getView().getModel("ui");
			oUiModel.setProperty("/selectedPeriodLabel", sPeriodLabel);

			// 2. Fetch the data from the currently active table (All GL or Top 5)
			var sTab = oUiModel.getProperty("/selectedTab");
			var sPath = sTab === "top" ? "/topSummaryRows" : "/allSummaryRows";
			var aRows = this.getView().getModel("fcr").getProperty(sPath) || [];

			// 3. Extract the data specifically for that month
			var aChartData = [];
			aRows.forEach(function(oRow) {
				var iVal = oRow[sPeriodKey] || 0;
				if (iVal !== 0) {
					aChartData.push({
						glGroup: oRow.groupName || oRow.glGroup,
						value: iVal
					});
				}
			});

			// Sort from highest to lowest cost for a cleaner chart
			aChartData.sort(function(a, b) {
				return b.value - a.value;
			});

			this.getView().getModel("fcr").setProperty("/periodChartData", aChartData);

			// 4. Open the Fragment Dialog (Compatible with ALL older SAPUI5 versions)
			if (!this._oPeriodChartDialog) {
				// Use xmlfragment instead of Fragment.load
				this._oPeriodChartDialog = sap.ui.xmlfragment(
					this.getView().getId(),
					"Z_Fixed_Cost_Report_FCR.fragments.PeriodChartDialog", // Ensure this path is exactly right
					this
				);
				this.getView().addDependent(this._oPeriodChartDialog);
			}

			this._updateAndOpenPeriodChart(aChartData);
		},

		_updateAndOpenPeriodChart: function(aChartData) {
			// Bulletproof way to find the VizFrame inside a fragment
			var oVizFrame = this.byId("periodVizFrame") || sap.ui.core.Fragment.byId(this.getView().getId(), "periodVizFrame");

			if (!oVizFrame) {
				console.error("VizFrame not found in the dialog!");
				return;
			}

			// Generate colors
			var aRules = aChartData.map(function(oData) {
				return {
					dataContext: {
						"G/L Group": oData.glGroup
					},
					properties: {
						color: this._colorForKey(oData.glGroup)
					}
				};
			}.bind(this));

			// ADDED: Find the Popover and connect it to the VizFrame
			var oPopover = this.byId("periodChartPopover") || sap.ui.core.Fragment.byId(this.getView().getId(), "periodChartPopover");
			if (oPopover) {
				oPopover.connect(oVizFrame.getVizUid());
			}

			// 1. Grab the month/quarter name the user just clicked
			var sPeriodName = this.getView().getModel("ui").getProperty("/selectedPeriodLabel");

			// Apply the styling, thick bars (gaps), and chart configurations
			oVizFrame.setVizProperties({
				// title: {
				// 	visible: false
				// },
				title: {
					visible: true,
					text: "G/L Group Totals for " + sPeriodName // Results in: "G/L Group Totals for April"
				},
				legend: {
					visible: false
				},

				plotArea: {
					dataLabel: {
						visible: true
					},
					drawingEffect: "glossy",
					dataPointStyle: {
						rules: aRules
					},
					animation: {
						dataLoading: true
					},
					gap: {
						barSpacing: 0.4
					}
				},
				categoryAxis: {

					title: {
						visible: true,
						text: "G/L Group"
					},

					label: {
						visible: true,
						allowMultiline: true,
						linesOfWrap: 2,
						overlapBehavior: "wrap",
						rotation: 0,
						angle: 0,
						maxWidth: 200,
						truncatedLabelRatio: 0.9,
						style: {
							fontSize: "12px",
							fontWeight: "bold"
						}
					}
				},
				valueAxis: {
					title: {
						visible: true,
						text: "Period Amount (Lacs)"
					}
				}
			});

			// Open the popup
			this._oPeriodChartDialog.open();
		},

		onClosePeriodChart: function() {
			if (this._oPeriodChartDialog) {
				this._oPeriodChartDialog.close();
			}
		}
	});
});