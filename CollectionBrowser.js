define([
	"dojo/_base/declare",
	"dojo/_base/lang",
	"dojo/_base/array",
	"dojo/has",
	"dojo/dom",
	"dojo/dom-construct",
	"dojo/dom-style",
	"dojo/dom-geometry",
	"dojo/dom-form",
	"dojo/on",
	"dojo/query",
	"dojo/request",
	"dojo/data/ObjectStore",
	"dojo/store/Memory",
	"dojo/store/Cache",
	"dojo/store/JsonRest",
	"dojo/data/ItemFileWriteStore",
	"dijit/registry",
	"dijit/Dialog",
	"dijit/form/Button",
	"dojo/text!./resources/CollectionBrowser.html",
	"dijit/layout/ContentPane",
	"dijit/layout/StackContainer",
	"dijit/layout/StackController",
	"dojox/grid/DataGrid",
	"dojox/grid/EnhancedGrid",
	"dojox/grid/enhanced/plugins/Menu",
	"dijit/form/CheckBox",
	"dijit/form/Select",
	"dijit/Toolbar",
	"dojo/_base/sniff"
],
	function(declare, lang, array, has, dom, domConstruct, domStyle, domGeometry, domForm, 
			on, query, request, ObjectStore, Memory, Cache, JsonRest, ItemFileWriteStore, 
			registry, Dialog, Button, template) {
		
		var util = {
			confirm: function(title, message, callback) {
				// console.debug("create new Dialog");
				var callbackToExecute = callback;
				var dialog = new Dialog({
					title: title
				});
				var div = domConstruct.create('div', { style: 'width: 400px;' }, dialog.containerNode, "last");
				var msg = domConstruct.create("p", { innerHTML: message });
				div.appendChild(msg);
				var okButton = new button({
					label: "Yes"
				});
				on(okButton, "click", lang.hitch(this, function() {
					console.debug("execute callback and hide dialog") ;
					dialog.hide();
					//dialog.destroyRecursive();
					callbackToExecute();
				}));
				div.appendChild(okButton.domNode);
	
				var cancelButton = new button({
					label: "No"
				});
				on(cancelButton, "click", lang.hitch(this, function() {
					console.debug("do nothing, simply hide dialog") ;
					dialog.hide();
					// dialog.destroyRecursive();
				}));
				div.appendChild(cancelButton.domNode);
				dialog.show();
			},
	
			message: function(title, message, label, callback) {
				if (!label || typeof label == "function") {
					callback = label;
					label = "Close";
				}
				var dialog = new Dialog({
					title: title
				});
				on(dialog, "hide", function(ev) {
					dialog.destroyRecursive();
					if (callback) {
						callback();
					}
				});
				var div = domConstruct.create('div', {
					style: 'width: 400px;'
				}, dialog.containerNode, "last");
				var msg = domConstruct.create("div", {
					innerHTML: message
				});
				div.appendChild(msg);
				var closeButton = new Button({
					label: label,
					onClick: function() {
						dialog.hide();
					}
				});
				div.appendChild(closeButton.domNode);
				dialog.show();
			},
	
			input: function(title, message, controls, callback) {
				var dialog = new Dialog({
					title: title
				});
				var div = domConstruct.create('div', {
					style: 'width: 400px;'
				}, dialog.containerNode, "last");
				var msg = domConstruct.create("p", {
					innerHTML: message
				});
				div.appendChild(msg);
				var form = domConstruct.create("form", {
					innerHTML: controls
				}, div, "last");
				var closeButton = new Button({
					label: "Cancel",
					onClick: function() {
						dialog.hide();
						dialog.destroyRecursive();
					}
				});
				div.appendChild(closeButton.domNode);
				var okButton = new Button({
					label: "Ok",
					onClick: function() {
						dialog.hide();
						dialog.destroyRecursive();
						var value = domForm.toObject(form);
						callback(value);
					}
				});
				div.appendChild(okButton.domNode);
				dialog.show();
			}
		};
	
		function permissionsFormatter(permissions){
			
			if(permissions) {
				return "<span class='permissionsCell'>" + permissions + "</span>";
			} else {
				return null;	
			}
		}

		//todo: fix intial value for breadcrumb - currently will be updated when dblclick occurs - when using keyboard it will never updated
		/**
		 * Collection browser plugin.
		 */
		return declare("dexist.CollectionBrowser", null, {
			store: null,
			grid: null,
			collection: "/db",
			clipboard: null,
			clipboardCut: false,
			editor: null,
			contentHeight: 0,
			permissionsStore : null,
			permissionsGrid: null,
			aclStore: null,
			aclGrid: null,
			container: null,
			theme:"claro",
			constructor:function(params){
				lang.mixin(this,params);
			},
			startup: function() {
				if(!this.dialog) this.dialog = new Dialog();
				this.dialog.set("title","Collection Browser");
				this.dialog.set("content",lang.replace(template,{path:require.toUrl("dexist/resources")}));
				var container = this.dialog.containerNode;
				container.style.padding = "0px";
				container.style.overflow = "hidden";
				var div = query(".inline-app", container)[0];
				dom.byId("breadcrumb").innerHTML = this.collection;
				this._init();
				this.dialog.show();
				var self = this;
				this.dialog.on("hide",function(){
					self.close();
				});
			},
			
			/**
			 * Dynamically load a CSS stylesheet.
			 */
			loadCSS: function(path) {
				console.debug("loadCSS",path);

				//todo: check this code - still needed?
				var head = document.getElementsByTagName("head")[0];
				query("link", head).forEach(function(elem) {
					var href = elem.getAttribute("href");
					if (href === path) {
						// already loaded
						return;
					}
				});
				var link = document.createElement("link");
				link.setAttribute("rel", "stylesheet");
				link.setAttribute("type", "text/css");
				link.setAttribute("href", path);
				head.appendChild(link);
			},
			
			_init: function() {
				var self = this;
				
				this.loadCSS(require.toUrl("dojox/grid/resources/"+this.theme+"Grid.css"));
				this.loadCSS(require.toUrl("dconecta/widget/resources/CollectionBrowser.css"));
				
				// json data store
				var restStore = new JsonRest({ target: "/dashboard/plugins/browsing/contents/" });
				this.store = new ObjectStore({ objectStore: restStore });

				/*set up layout*/
				var layout = [[
					{name: 'Name', field: 'name', width: '30%'},
					{name: 'Permissions', field: 'permissions', width: '20%', 'formatter': permissionsFormatter},
					{name: 'Owner', field: 'owner', width: '10%'},
					{name: 'Group', field: 'group', width: '10%'},
					{name: 'Last-modified', field: 'lastModified', width: '30%'}
				]];

				/*create a new grid:*/
				this.grid = new dojox.grid.DataGrid(
					{
						id: 'browsing-grid',
						selectionMode: "multi",
						structure: layout,
						autoWidth: false,
						autoHeight: true,
						onStyleRow: function(row) {
							self.styleRow(self.grid, row);
						},
						escapeHTMLInData: false
					},
					document.createElement('div'));
				
				this.grid.setStore(this.store, { collection: this.collection });

				on(this.grid, "rowDblClick", function(ev) {
					var item = self.grid.getItem(ev.rowIndex);
					if (item.isCollection) {
						self.collection = item.id;
						// console.debug("collection: ", self.collection);
						dom.byId("breadcrumb").innerHTML = self.collection;
						self.grid.selection.deselectAll();
						self.grid.focus.setFocusIndex(0, 0);
						self.store.close();
						self.grid.setStore(self.store, { collection: self.collection });
					} else {
						if(ev.altKey) {
							self.openResource(item.id);
						} else {
							self.onSelectResource(item.id,item);
						}
					}
				});

				on(this.grid, "keyUp", function(e) {
					if (self.grid.edit.isEditing()) {
						return;
					}
					if (!e.shiftKey && !e.altKey && !e.ctrlKey) {
						e.stopImmediatePropagation();
						e.preventDefault();
						var idx = self.grid.focus.rowIndex;
						switch (e.which) {
							case 13: // enter
								self.changeCollection(idx);
								break;
							case 8: // backspace
								self.changeCollection(0);
								break;
						}
					}
				});

				/*append the new grid to the div*/
				dom.byId("browsing-grid-container").appendChild(this.grid.domNode);

				/* on(dom.byId("browsing-toolbar-properties"), "click", lang.hitch(this, "properties")); */
				query("#browsing-toolbar-properties").on("click", function(ev) {
					var items = self.grid.selection.getSelected();
					if(items.length && items.length > 0) {
						setupPropertiesForm(items[0], self);
						changePage("propertiesPage");
					}
				});
				
				query("#saveProperties").on("click", function(ev) {
					
					//do we need to save basic permissions?
					if(self.permissionsStore.isDirty()) {
					
						//save basic properties
						self.permissionsStore.save({
							onComplete: function() {
								
								//do we also need to save ACEs
								if(self.aclStore.isDirty()) {
									//save ACEs
									self.aclStore.save({
										onComplete: function() {
											self.grid._refresh(); //update the main grid
											changePage("browsingPage");
										} 
									});
								} else {
									//no changes to ACEs
									self.grid._refresh(); //update the main grid (as basic permissions have changed)
									changePage("browsingPage");
								}
							}
						});
					} else {
					
						//do we need to save ACEs?
						if(self.aclStore.isDirty()) {
							
							//save ACEs
							self.aclStore.save({
								onComplete: function() {
									self.grid._refresh(); //update the main grid
									changePage("browsingPage");
								} 
							});
						} else {
							//no changes to ACEs
							changePage("browsingPage");
						}
					}
				});
				
				query("#closeProperties").on("click", function(ev) {
					changePage("browsingPage");
				});
				
				on(dom.byId("browsing-toolbar-delete"), "click", lang.hitch(this, "del"));
				on(dom.byId("browsing-toolbar-new"), "click", lang.hitch(this, "createCollection"));

				on(dom.byId("browsing-toolbar-add"), "click", lang.hitch(this, "upload"));

				on(dom.byId("browsing-toolbar-copy"), "click", function(ev) {
					ev.preventDefault();
					var resources = self.getSelected();
					if (resources) {
						console.log("Copy %d resources", resources.length);
						self.clipboard = resources;
						self.clipboardCut = false;
					}
				});
				on(dom.byId("browsing-toolbar-cut"), "click", function(ev) {
					ev.preventDefault();
					var resources = self.getSelected();
					if (resources) {
						console.log("Cut %d resources", resources.length);
						self.clipboard = resources;
						self.clipboardCut = true;
					}
				});
				on(dom.byId("browsing-toolbar-paste"), "click", function(ev) {
					ev.preventDefault();
					if (self.clipboard && self.clipboard.length > 0) {
						console.log("Paste: %d resources", self.clipboard.length);
						request.post("/dashboard/plugins/browsing/contents" + self.collection,{
							data: { resources: self.clipboard, action: self.clipboardCut ? "move" : "copy" },
							handleAs: "json"
						}).then(function(data) {
							if (data.status != "ok") {
								util.message("Paste Failed!", "Some resources could not be copied.");
							}
							self.refresh();
						},function() {
							self.refresh();
						});
					}
				});
				on(dom.byId("browsing-toolbar-reload"), "click", lang.hitch(this, "refresh"));
				on(dom.byId("browsing-toolbar-reindex"), "click", lang.hitch(this, "reindex"));
				/*on(dom.byId("browsing-toolbar-edit"), "click", lang.hitch(this, function(ev) {
					var items = this.grid.selection.getSelected();
					if(items.length && items.length > 0 && !items[0].isCollection) {
						this.openResource(items[0].id);
					}
				}));*/
				
				//new Uploader(dom.byId("browsing-upload"), lang.hitch(this, "refresh"));
				
				/* start permissions grid */
				this.permissionsStore = new ItemFileWriteStore({
					data: {
						label: "class",
						items: [
							{
								"id": "User",
								read: false,
								write: false,
								execute: false,
								special: false,
								specialLabel: 'SetUID:'
							},
							{
								"id": "Group",
								read: false,
								write: false,
								execute: false,
								special: false,
								specialLabel: 'SetGID:'
							},
							{
								"id": "Other",
								read: false,
								write: false,
								execute: false,
								special: false,
								specialLabel: 'Sticky:'
							}
						]
					},
					clearOnClose: true
				});
	
				var permissionsLayout = [[
					{name: 'Permission', field: 'id', width: '25%'},
					{name: 'Read', field: 'read', width: '10%', type: dojox.grid.cells.Bool, editable: true },
					{name: 'Write', field: 'write', width: '10%', type: dojox.grid.cells.Bool, editable: true },
					{name: 'Execute', field: 'execute', width: '25%', type: dojox.grid.cells.Bool, editable: true },
					{name: 'Special', field: 'specialLabel', width: '10%', editable: false },
					{name: ' ', field: 'special', width: '15%', type: dojox.grid.cells.Bool, editable: true }
				]];
				
				this.permissionsGrid = new dojox.grid.DataGrid(
					{
						id: 'permissions-grid',
						store: this.permissionsStore,
						structure: permissionsLayout,
						autoWidth: false,
						autoHeight: true,			 //TODO setting to true seems to solve the problem with them being shown and not having to click refresh, otherwise 12 is a good value
						selectionMode: "single"
					},
					document.createElement('div')
				);
				dom.byId("permissions-grid-container").appendChild(this.permissionsGrid.domNode);
				this.permissionsGrid.startup();
				/* end permissions grid */
				
				/* start acl grid */
				this.aclStore = new ItemFileWriteStore({
					data: {
						label: "index",
						identifier: "index",
						items: []
					},
					clearOnClose: true
				});
	
				var aclLayout = [[
					{name: 'Target', field: 'target', width: '20%'},
					{name: 'Subject', field: 'who', width: '30%'},
					{name: 'Access', field: 'access_type', width: '20%'},
					{name: 'Read', field: 'read', width: '10%', type: dojox.grid.cells.Bool, editable: true },
					{name: 'Write', field: 'write', width: '10%', type: dojox.grid.cells.Bool, editable: true },
					{name: 'Execute', field: 'execute', width: '10%', type: dojox.grid.cells.Bool, editable: true }
				]];
				
				this.aclGrid = new dojox.grid.EnhancedGrid(
					{
						id: 'acl-grid',
						store: this.aclStore,
						structure: aclLayout,
						autoWidth: false,
						autoHeight: true,			 //TODO setting to true seems to solve the problem with them being shown and not having to click refresh, otherwise 12 is a good value
						selectionMode: "single",
						plugins: {
							menus: {
								rowMenu:"acl-grid-Menu"
							}
						}
					},
					document.createElement('div')
				);
				dom.byId("acl-grid-container").appendChild(this.aclGrid.domNode);
				this.aclGrid.startup();
				/* end acl grid */
				
				// resizing and grid initialization after plugin becomes visible
				self.resize();
				self.grid.startup();

				self.grid.domNode.focus();
				self.grid.focus.setFocusIndex(0, 0);
				self.grid.focus.focusGrid();
				self.resize();
			},

			getSelected: function(collectionsOnly) {
				var items = this.grid.selection.getSelected();
				if (items.length && items.length > 0) {
					var resources = [];
					array.forEach(items, function(item) {
						if (!collectionsOnly || item.isCollection)
							resources.push(item.id);
					});
					return resources;
				}
				return null;
			},

			/*
			properties: function() {
				var self = this;
				var items = self.grid.selection.getSelected();
				if (items.length && items.length > 0) {
					var resources = [];
					array.forEach(items, function(item) {
						resources.push(item.id);
					});
					var title = resources.length == 1 ? resources[0] : "selection";
					request("/dashboard/plugins/browsing/properties/",{
						data: { resources: resources }
					}).then(function(data) {
						var dlg = registry.byId("browsing-dialog");
						dlg.set("content", data);
						dlg.set("title", "Properties for " + title);
						dlg.show();

						var form = dom.byId("browsing-dialog-form");
						on(form, "submit", function(ev) {
							ev.preventDefault();
							self.applyProperties(dlg, resources);
						});
					});
				}
			},*/

			applyProperties: function(dlg, resources) {
				console.debug("applyProperties");
				var self = this;
				var form = dom.byId("browsing-dialog-form");
				var params = domForm.toObject(form);
				params.resources = resources;
				request.post("/dashboard/plugins/browsing/properties/",{
					data: params,
					handleAs: "json"
				}).then(function(data) {
					self.refresh();
					if (data.status == "ok") {
						registry.byId("browsing-dialog").hide();
					} else {
						util.message("Changing Properties Failed!", "Could not change properties on all resources!");
					}
				},function() {
					util.message("Server Error", "An error occurred while communicating to the server!");
				});
			},

			refresh: function() {
				if (this.store != null) {
					this.store.close();
					this.grid.setStore(this.store, { collection: this.collection });
				}
			},

			resize: function() {
				var box = domGeometry.getContentBox(query(".browsing")[0]);
				var gridDiv = dom.byId("browsing-grid-container");
				domStyle.set("browsing-grid", "height", (box.h - gridDiv.offsetTop) + "px");
			},

			changeCollection: function(idx) {
				console.debug("Changing to item %d %o", idx, this.grid);
				var item = this.grid.getItem(idx);
				if (item.isCollection) {
					this.collection = item.id;
					this.grid.selection.deselectAll();
					this.store.close();
					this.grid.setStore(this.store, { collection: this.collection });
					this.grid.focus.setFocusIndex(0, 0);
				}
			},

			createCollection: function() {
				var self = this;
				util.input("Create Collection", "Create a new collection",
					"<label for='name'>Name:</label><input type='text' name='name'/>",
					function(value) {
						request.put("/dashboard/plugins/browsing/contents/" + value.name,{
							data: { "collection": self.collection },
							handleAs: "json"
						}).then(function(data) {
							self.refresh();
							if (data.status != "ok") {
								util.message("Creating Collection Failed!", "Could not create collection " + value.name);
							}
						},
						function() {
							util.message("An error occurred", "Failed to create collection " + value.name);
						});
					}
				);
			},

			del: function(ev) {
				ev.preventDefault();
				var self = this;
				var resources = self.getSelected();
				if (resources) {
					util.confirm("Delete Resources?", "Are you sure you want to delete the selected resources?",
						function() {
							request.del("/dashboard/plugins/browsing/contents/",{
								data: { resources: resources },
								handleAs: "json"
							}).then(function(data) {
								self.refresh();
								if (data.status != "ok") {
									util.message("Deletion Failed!", "Some resources could not be deleted.");
								} else {
									self.grid.selection.deselectAll();
								}
							},function() {
								util.message("Server error!", "Error while communicating to the server.");
							});
						});
				}
			},

			upload: function() {
				dom.byId("browsing-upload-collection").value = this.collection;
				var uploadDlg = registry.byId("browsing-upload-dialog");
				uploadDlg.show();
			},

			reindex: function() {
				var self = this;
				var target = this.collection;
				var resources = this.getSelected(true);
				if (resources && resources.length > 0) {
					if (resources.length > 1) {
						util.message("Reindex", "Please select a single collection or none to reindex the current root collection");
						return;
					}
					target = resources[0];
				}
				
				util.confirm("Reindex collection?", "Are you sure you want to reindex collection " + 
					target + "?",
					function() {
						request.post("/dashboard/plugins/browsing/contents" + target,{
							data: { action: "reindex" },
							handleAs: "json"
						}).then(function(data) {
							if (data.status != "ok") {
								util.message("Reindex Failed!", "Reindex of collection " + target + " failed");
							}
							self.refresh();
						},function() {
							self.refresh();
						});
					});
			},
			
			styleRow: function(grid, row) {
				var item = grid.getItem(row.index);
				if(item) {
				
					if(row.over) {
						row.customClasses += " dojoxGridRowOver";
					}
					
					if(row.selected) {
						row.customClasses += " dojoxGridRowSelected";
					}
				
					if(item.isCollection) {
						if(!row.selected) {
							row.customClasses = "collectionRow " + row.customClasses;
						}
					} else {
						row.customClasses += " dojoxGridRow";
						if(row.odd) {
							row.customClasses += " dojoxGridRowOdd";
						}
					}
				}
				grid.focus.styleRow(row);
				grid.edit.styleRow(row);
			},
			onSelectResource:function(path){
				//override!
			},
			openResource: function(path) {
				var exide = window.open("", "eXide");
				if (exide && !exide.closed) {
					
					// check if eXide is really available or it's an empty page
					var app = exide.eXide;
					if (app) {
						// eXide is there
						exide.eXide.app.findDocument(path);

						exide.focus();
						setTimeout(function() {
							if (has("ie") ||
								(typeof exide.eXide.app.hasFocus == "function" && !exide.eXide.app.hasFocus())) {
								util.message("Open Resource", "Opened code in existing eXide window.");
							}
						}, 200);
					} else {
						window.eXide_onload = function() {
							exide.eXide.app.findDocument(path);
						};
						// empty page
						var href = window.location.href;
						href = href.substring(0, href.indexOf("/dashboard")) + "/eXide/index.html";
						exide.location = href;
					}
				} else {
					util.message("Open Resource", "Failed to start eXide in new window.");
				}
			},
			
			close: function() {
				console.log("Closing down");
				var container = this.dialog.containerNode;
				var widgets = registry.findWidgets(container);
				array.forEach(widgets, function(widget) {
					widget.destroyRecursive();
				});
			}
		});
		
		function changePage(pageId) {
			var stack = registry.byId("browsingStack");
			var page = registry.byId(pageId);
			stack.selectChild(page);
		};
		
		function setupPropertiesForm(item, self) {
			
			registry.byId("resourceName").set("value", item.name);
			registry.byId("internetMediaType").set("value", item.internetMediaType);
			registry.byId("created").set("value", item.created);
			registry.byId("lastModified").set("value", item.lastModified);
			registry.byId("owner").set("value", item.owner);
			registry.byId("group").set("value", item.group);
			
			//reload the permissions store and grid
			self.permissionsStore.close();
			var propertiesStore = new Cache(
				new JsonRest({
					target: "/dashboard/plugins/browsing/permissions/" + item.id.replace(/\//g, '...') + "/"
				}),
				new Memory()
			);
			self.permissionsStore = new ObjectStore({
				objectStore: propertiesStore
			});
			self.permissionsGrid.setStore(self.permissionsStore);
			
			
			//reload the acl store and grid
			self.aclStore.close();
			var aclPropertiesStore = new Cache(
				new JsonRest({
					target: "/dashboard/plugins/browsing/acl/" + item.id.replace(/\//g, '...') + "/"
				}),
				new Memory()
			);
			self.aclStore = new ObjectStore({
				objectStore: aclPropertiesStore
			});
			self.aclGrid.setStore(self.aclStore);

		};
	});