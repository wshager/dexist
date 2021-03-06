define([
	"dojo/_base/declare",
	"dojo/_base/lang",
	"dojo/_base/array",
	"dojo/has",
	"dojo/dom",
	"dojo/dom-construct",
	"dojo/dom-class",
	"dojo/dom-geometry",
	"dojo/dom-form",
	"dojo/on",
	"dojo/query",
	"dojo/request",
	"dojo/date/locale",
	"dojo/cookie",

	"dstore/Memory",
	"dstore/Cache",
	"dstore/Rest",
	"dstore/legacy/DstoreAdapter",

	"dijit/layout/ContentPane",
	"dijit/layout/LayoutContainer",
	"dijit/layout/StackContainer",
	"dijit/Toolbar",
	"dijit/ToolbarSeparator",
	"dijit/Dialog",
	"dijit/form/Button",
	"dijit/form/CheckBox",
	"dijit/form/FilteringSelect",

	"dgrid/OnDemandGrid",
	"dgrid/OnDemandList",
	"dgrid/Editor",
	"dgrid/Keyboard",
	"dgrid/Selection",
	"dgrid/util/touch",
	"dgrid/extensions/DijitRegistry",

	"dforma/Builder",
	"dforma/Grid",
	"dforma/DateTimeTextBox",
	"dforma/RadioGroup",

	"./util/load-css",
	"./Uploader",
	"dojo/sniff"
],
	function(declare, lang, array, has, dom, domConstruct, domClass, domGeometry, domForm, on, query, request, locale, cookie,
			Memory, Cache, Rest, DstoreAdapter,
			ContentPane, LayoutContainer, StackContainer, Toolbar, ToolbarSeparator, Dialog, Button, CheckBox, FilteringSelect,
			OnDemandGrid, OnDemandList, Editor, Keyboard, Selection, touchUtil, DijitRegistry,
			Builder, Grid, DateTimeTextBox, RadioGroup,
			loadCss, Uploader) {


		if(has("ie") < 9) {
			lang.extend(Array, {
				indexOf: function(x){
					return array.indexOf(this,x);
				},
				forEach: function(fn) {
					return array.forEach(this,fn);
				},
				map: function(fn) {
					return array.map(this,fn);
				},
				filter: function(fn) {
					return array.filter(this,fn);
				}
			});
		}

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
				var okButton = new Button({
					label: "Yes"
				});
				on(okButton, "click", lang.hitch(this, function() {
					console.debug("execute callback and hide dialog") ;
					dialog.hide();
					//dialog.destroyRecursive();
					callbackToExecute();
				}));
				div.appendChild(okButton.domNode);

				var cancelButton = new Button({
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

		function formatTimestamp(value) {
			var inputDate = new Date(value);
			return dojo.date.locale.format(inputDate, {
				selector:"date",
				datePattern:"MMMM dd yyyy HH:mm:ss"
			});
		}

		var selection = [];

		return declare("dexist.CollectionBrowser", [StackContainer], {
			store: null,
			grid: null,
			target:"",
			collectionRoot:"/db",
			collection: "/db",
			clipboard: null,
			clipboardCut: false,
			editor: null,
			editable:true,
			showPermissions:true,
			useDialog:false,
			tools:null,
			useTools:true,
			useRangeHeaders:true,
			thumbnailSize:has("touch") ? 4 : 2,
			sort:"+internetMediaType",
			filter:null,
			selectionMode:"extended",
			display:has("touch") ? "tiles" : "details",
			persist:true,
			baseClass:"dexistCollectionBrowser",
			rootId:"",
			updateBreadcrumb:function() {
				var self = this;
				this.breadcrumb.innerHTML = "";
				var rootCount = this.rootId.split("/").length - 2;//  - 2 FIXME for each slash in collectionRoot
				this.collection.split("/").forEach(function(part,i,parts){
					if(!part || i<=rootCount) return;
					domConstruct.create("a",{
						innerHTML:part,
						target: parts.slice(0,i+1).join("/"),
						onclick:function(){
							self.refresh(this.target);
						}
					},this.breadcrumb);
				},this);
			},
			formatMediaType:function(value,item) {
				var ext = item.isCollection ? null : item.name.match(/\.[0-9a-z]{3,4}$/i);
				ext = ext && ext.length ? ext[0].substr(1) : null;
				var base = require.toUrl("dexist/resources/images/file-128");
				var sup,sub;
				if(!item.isCollection){
					var part = value.split("/");
					sup = part.shift();
					sub = part.shift();
				}
				var files = ["xml","xhtml+xml","xquery","json","css","xslt+xml","xml-dtd","html","x-javascript","octet-stream"];
				var thumb = item.thumbnail ? this.target+"thumb"+item.thumbnail :
					base+"/"+(item.isCollection ? "collection" :
						files.indexOf(ext)>-1 ? ext :
							files.indexOf(sub)>-1 ? sub :
								sup =="image" ? "img" : "generic")+".png";
				return "<img title=\""+value+"\" class=\"thumbnail\" src=\""+thumb+"\"/>";
			},
			_connectGrid:function(){
				this.browsingPage.addChild(this.grid);
				this.grid.on('dgrid-refresh-complete',lang.hitch(this,function(){
					setTimeout(lang.hitch(this,function() {
						if(this.persist){
							// selection may be set from cookie
							var resources = (""+cookie("dexistSelection")).split(",");
							if(resources.length) {
								this.setSelected(resources);
								// properties page may be selected
								if(this.propertiesPage.selected){
									this._buildPropertiesForm();
								}
							}
						}
						this.resize();
						var p = dijit.getEnclosingWidget(this.domNode.parentNode);
						if(p) {
							p.resize();
						}
					}),250);
				}));
				this.grid.on(".dgrid-row:dblclick", lang.hitch(this,"_gridDblClick"));
				this.grid.on(touchUtil.selector(".dgrid-row", touchUtil.dbltap), lang.hitch(this,"_gridDblClick"));
				this.grid.on("dgrid-select", lang.hitch(this,"_gridSelect"));
				this.grid.on("dgrid-deselect", lang.hitch(this,"_gridSelect"));
				domClass.add(this.grid.domNode,"thumbnailx"+this.thumbnailSize);
				this.grid.startup();
			},
			_gridSelect:function(ev){
				selection = ev.rows.map(function(_){
					return _.data;
				}).filter(function(_){
					return !!_;
				});
				if(this.persist){
					var resources = this.getSelected();
					if(resources && resources.length>0){
						cookie("dexistSelection",resources.join(","));
					} else {
						cookie("dexistSelection","");
					}
				}
				this.updateToolbar(selection.length);
			},
			_gridDblClick:function(ev) {
				var row = this.grid.row(ev);
				var item = row.data;
				if(item.isCollection) {
					this.refresh(this.collectionRoot+item.id);
				} else {
					this.onSelectResource(item.id,item,ev);
				}
			},
			_destroyGrid:function(){
				this.browsingPage.removeChild(this.grid);
				this.grid.destroy();
			},
			_renderList:function(){
				var sort = [{property:this.sort.substr(1),descending:this.sort.charAt(0)=="-"}];
				this.grid = new (declare([OnDemandList, Keyboard, Selection, DijitRegistry]))({
					region:"center",
					"class":"browsingList",
					sort:sort,
					//query:this.filter,
					selectionMode:this.selectionMode,
					showFooter: this.useDialog,
					collection: this.store.filter(lang.mixin({collection:this.collection},this.filter)),
					farOffRemoval: 500,
					renderRow: lang.hitch(this,function(object){
						var thumb = this.formatMediaType(object.internetMediaType,object);
						return domConstruct.create("div",{
							innerHTML:"<div class=\"tile-row\"><span class=\"tile-thumb\">"+thumb+"</span></div><div class=\"tile-row\"><span class=\"tile-text\">"+object.name+"</span></div>"
						});
					})
				});
			},
			_renderGrid:function(){
				var sort = [{property:this.sort.substr(1),descending:this.sort.charAt(0)=="-"}];
				this.grid = new (declare([OnDemandGrid, Keyboard, Selection, Editor, DijitRegistry]))({
					region:"center",
					"class":"browsingGrid",
					sort:sort,
					selectionMode:this.selectionMode,
					showFooter: this.useDialog,
					query:this.filter,
					collection:  this.store.filter(lang.mixin({collection:this.collection},this.filter)),
					columns: [{
						label: "ⓘ",
						field: "internetMediaType",
						/*renderHeaderCell: function(node) {
							return domConstruct.create('img',{
								src:require.toUrl("dexist/resources/images/info.svg")
							});
						},*/
						formatter:lang.hitch(this,"formatMediaType")
					},{
						label: "Name",
						field: "name",
						editor: "text",
						editOn: "click",
						canEdit:lang.hitch(function(){
							this.editable = true;
						})
					},{
						label: "Permissions",
						field: "permissionsString",
						hidden: !this.showPermissions
					},{
						label: "Owner",
						field: "owner",
						hidden: !this.showPermissions
					},{
						label: "Group",
						field: "group",
						hidden: !this.showPermissions
					},{
						label: "Last-modified",
						field: "lastModified",
						formatter:formatTimestamp
					}]
				});
			},
			_renderToolBar:function(){
				this.toolbar = new Toolbar();
				this.browsingTop.addChild(this.toolbar);
				var tools = [{
					id:"reload",
					title:"Refresh"
				},{
					id:"reindex",
					title:"Reindex collection"
				},{
					id:"new",
					title:"New collection"
				},{
					id:"delete",
					title:"Delete resources"
				},{
					id:"properties",
					title:"Edit owner, groups and permissions"
				},{
					id:"copy",
					title:"Copy selected resources"
				},{
					id:"cut",
					title:"Cut selected resources"
				},{
					id:"paste",
					title:"Paste resources"
				},{
					id:"add",
					title:"Upload resources"
				}];
				this.tools = {};
				tools.forEach(function(_){
					var bt = new Button({
						title:_.title,
						iconClass:"toolbar-"+_.id,
						showLabel:false
					});
					this.tools[_.id] = bt;
					this.toolbar.addChild(bt);
				},this);
				this.toolbar.addChild(new ToolbarSeparator());
				this.toolbar.addChild(new dforma.Label({
					label:"Thumbnail Size",
					child:new FilteringSelect({
						store: new DstoreAdapter(new Memory({
							data:[{
								id:1,
								name:"1x"
							},{
								id:2,
								name:"2x"
							},{
								id:4,
								name:"4x"
							},{
								id:16,
								name:"16x"
							}]
						})),
						style:"width:40px;",
						required:false,
						value:this.thumbnailSize,
						onChange:lang.hitch(this,function(val){
							domClass.remove(this.grid.domNode,"thumbnailx"+this.thumbnailSize);
							domClass.add(this.grid.domNode,"thumbnailx"+val);
							if(this.persist) {
								cookie("dexistThumbnailSize",val);
							}
							this.thumbnailSize = val;
						})
					})
				}));
				this.toolbar.addChild(new ToolbarSeparator());
				this.toolbar.addChild(new dforma.Label({
					label:"Display",
					child:new FilteringSelect({
						store: new DstoreAdapter(new Memory({
							data:[{
								id:"details",
								name:"Details"
							},{
								id:"tiles",
								name:"Tiles"
							}]
						})),
						style:"width:60px;",
						required:false,
						value:this.display,
						onChange:lang.hitch(this,function(val){
							this._destroyGrid();
							if(val=="details") {
								this._renderGrid();
							} else {
								this._renderList();
							}
							this._connectGrid();
							if(this.persist) {
								cookie("dexistDisplay",val);
							}
							this.display = val;
						})
					})
				}));
				this.toolbar.addChild(new ToolbarSeparator());
				this.toolbar.addChild(new dforma.Label({
					label:"Order by",
					child:new FilteringSelect({
						store: new DstoreAdapter(new Memory({
							data:[{
								id:"+internetMediaType"
							},{
								id:"-internetMediaType"
							},{
								id:"+name"
							},{
								id:"-name"
							},{
								id:"+lastModified"
							},{
								id:"-lastModified"
							},{
								id:"+user"
							},{
								id:"-user"
							},{
								id:"+group"
							},{
								id:"-group"
							}]
						})),
						searchAttr:"id",
						style:"width:140px;",
						required:false,
						value:this.sort,
						onChange:lang.hitch(this,function(val){
							var sort = [{property:val.substr(1),descending:val.charAt(0)=="-"}];
							this.grid.set("sort", sort);
							if(this.persist) {
								cookie("dexistSort",val);
							}
							this.sort = val;
						})
					})
				}));
				this.updateToolbar(0);
				this.tools["paste"].set("disabled",true);
				this.toolbar.own(
					on(this.tools["properties"],"click", lang.hitch(this,"_buildPropertiesForm")),
					on(this.tools["delete"], "click", lang.hitch(this, "_deleteResources")),
					on(this.tools["new"], "click", lang.hitch(this, "_createCollection")),
					on(this.tools["add"], "click", lang.hitch(this, "_upload")),
					on(this.tools["copy"], "click", lang.hitch(this,"_copy")),
					on(this.tools["cut"], "click", lang.hitch(this,"_cut")),
					on(this.tools["paste"], "click", lang.hitch(this,"_pasteResources")),
					on(this.tools["reload"], "click", lang.hitch(this, function(){this.refresh()})),
					on(this.tools["reindex"], "click", lang.hitch(this, "_reindex"))
				);
			},
			updateToolbar:function(len){
				if(!this.useTools) return;
				var disable = ["properties","delete","copy","cut"];
				for(var k in this.tools) {
					if(disable.indexOf(k)>-1){
						this.tools[k].set("disabled",len===0);
					}
				}
			},
			_renderDialog:function(){
				this.okButton = new Button({
					label:"OK",
					onClick:lang.hitch(this,function(evt){
						this.onSubmit(this.getSelected(),evt);
					})
				});
				this.cancelButton = new Button({
					label:"Cancel",
					onClick:lang.hitch(this,function(evt){
						var sel = this.getSelected();
						this.onCancel(evt);
					})
				});
				this.cancelButton.placeAt(this.grid.footerNode);
				this.okButton.placeAt(this.grid.footerNode);
			},
			onSubmit:function(sel,evt){

			},
			onCancel:function(evt){

			},
			startup: function() {
				if(this._started) return;
				if(this.persist){
					this.collection = cookie("dexistCollection") || this.collection;
					this.thumbnailSize = cookie("dexistThumbnailSize") || this.thumbnailSize;
					this.display = cookie("dexistDisplay") || this.display;
					this.sort = cookie("dexistSort") || this.sort;
				}
				if(this.rootId) {
					if(this.collection.substr(4,this.rootId.length)!=this.rootId){
						this.collection = this.collectionRoot+this.rootId;
					}
				}
				var self = this;

				loadCss(require.toUrl("dexist/resources/CollectionBrowser.css"));

				this.browsingPage = new LayoutContainer({
				});
				this.propertiesPage = new ContentPane({
				});
				this.browsingTop = new ContentPane({
					region:"top"
				});
				this.browsingPage.addChild(this.browsingTop);
				if(this.useTools) this._renderToolBar();
				this.breadcrumb = domConstruct.create("div",{
					"class":"breadcrumb"
				},this.browsingTop.domNode,"last");
				this.updateBreadcrumb();
				// json data store
				this.store = new Rest({
					useRangeHeaders:this.useRangeHeaders,
					target:this.target,
					rpc:function(id,method,params,callId){
						callId = callId || "call-id";
						return request.post(this.target+id,{
							data:JSON.stringify({
								method:method,
								params:params,
								id:callId
							}),
							handleAs:"json",
							headers:{
								"Content-Type":"application/json",
								"Accept":"application/json"
							}
						});
					}
				});
				if(this.display=="details") {
					this._renderGrid();
				} else {
					this._renderList();
				}
				if(this.useDialog) this._renderDialog();
				this.addChild(this.browsingPage);
				this.addChild(this.propertiesPage);
				this._connectGrid();
				// init uploader
				this.uploadDlg = new Dialog({
					title:"Upload Files"
				});
				this.uploader = new Uploader({
					collection:this.collection,
					url:this.target+"upload",
					onDone:function(){
						self.refresh();
					}
				});
				this.uploadDlg.containerNode.appendChild(this.uploader.domNode);

				this.form = new Builder({
					cancellable:true,
					cancel:function(){
						self.selectChild(self.browsingPage);
						self.refresh();
					},
					submit:function(){
						if(!this.validate()) return;
						var data = this.get("value");
						self.store.put(data).then(function(){
							self.selectChild(self.browsingPage);
							self.refresh();
							util.message("Properties updated successfully", "Properties updated");
						},function(err){
							util.message("Changing Properties Failed!", "Could not change properties on all resources! <br>Server says: "+err.response.xhr.responseText);
						});
					}
				});

				this.propertiesPage.addChild(this.form);

				// resizing and grid initialization after plugin becomes visible
				this.grid.focus();
				this.inherited(arguments);
			},
			getSelected: function(collectionsOnly) {
				if(selection && selection.length > 0) {
					var resources = [];
					selection.forEach(function(item) {
						if (!collectionsOnly || item.isCollection)
							resources.push(item.id);
					});
					return resources;
				}
				return null;
			},
			setSelected: function(resources) {
				if(resources && resources.length > 0) {
					resources.forEach(function(id) {
						this.grid.select(this.grid.row(id));
					},this);
				}
			},
			refresh: function(collection) {
				if(collection) {
					if(this.persist) {
						cookie("dexistCollection",collection);
					}
					this.collection = collection;
					this.updateBreadcrumb();
				}
				this.grid.set("collection", this.store.filter(lang.mixin({collection:this.collection},this.filter)));
			},
			_buildPropertiesForm:function(){
				if(!selection.length) return;
				this.store.get(selection[0].id).then(lang.hitch(this,function(item){
					this.selectChild(this.propertiesPage);
					this.form.rebuild({
						controls:[{
							name:"id",
							type:"hidden"
						},{
							name:"name",
							title:"Resource",
							type:"text",
							readOnly:true
						},{
							name:"internetMediaType",
							title:"Internet Media Type",
							type:"text",
							readOnly:true
						},{
							name:"created",
							type:"datetime",
							readOnly:true
						},{
							name:"lastModified",
							title:"Last Modified",
							type:"datetime",
							readOnly:true
						},{
							name:"owner",
							type:"select",
							pageSize:"25",
							store:new DstoreAdapter(new Rest({
								useRangeHeaders:true,
								target:this.target+"user/"
							}))
						},{
							name:"group",
							type:"select",
							pageSize:"25",
							store:new DstoreAdapter(new Rest({
								useRangeHeaders:true,
								target:this.target+"group/"
							}))
						},{
							name:"permissions",
							type:"grid",
							add:false,
							edit:false,
							remove:false,
							selectionMode:"none",
							columns: [{
								label: "Permission",
								field: "id"
							},{
								label: "Read",
								field: "read",
								editor: "checkbox"
							},{
								label: "Write",
								field: "write",
								editor: "checkbox"
							},{
								label: "Execute",
								field: "execute",
								editor: "checkbox"
							},{
								label: "Special",
								field: "specialLabel"
							},{
								label: "",
								field: "special",
								editor: "checkbox"
							}]
						},{
							name:"acl",
							type:"grid",
							controller:{
								type:"select",
								name:"target"
							},
							columns:[{
								label: "Target",
								field: "target",
								width: "20%"
							},{
								label: "Subject",
								field: "who",
								width: "30%"
							},{
								label: "Access Type",
								field: "access_type",
								width: "20%"
							},{
								label: "Read",
								field: "read",
								width: "10%",
								editor: "checkbox"
							},{
								label: "Write",
								field: "write",
								width: "10%",
								editor: "checkbox"
							},{
								label: "Execute",
								field: "execute",
								width: "10%",
								editor: "checkbox"
							}],
							schema:{
								items:[{
									id:"USER",
									properties:{
										who:{
											title:"Subject",
											type:"array",
											format:"select",
											items: {
												$ref:this.target+"user/"
											},
											required:true
										},
										access_type:{
											title:"Access Type",
											type:"string",
											format:"radiogroup",
											"enum":["ALLOWED","DENIED"],
											required:true
										},
										read:{
											type:"boolean"
										},
										write:{
											type:"boolean"
										},
										execute:{
											type:"boolean"
										}
									}
								},{
									id:"GROUP",
									properties:{
										who:{
											title:"Subject",
											type:"array",
											format:"select",
											items: {
												$ref:this.target+"group/"
											},
											required:true
										},
										access_type:{
											title:"Access Type",
											type:"string",
											format:"radiogroup",
											"enum":["ALLOWED","DENIED"],
											required:true
										},
										read:{
											type:"boolean"
										},
										write:{
											type:"boolean"
										},
										execute:{
											type:"boolean"
										}
									}
								}]
							}
						}]
					}).then(lang.hitch(this,function(widgets){
						this.form.set("value",item);
					}));
				}));
			},
			_copy:function(ev) {
				ev.preventDefault();
				this.clipboard = this.getSelected();
				console.log("Cut %d resources", this.clipboard.length);
				this.clipboardCut = false;
				this.tools["paste"].set("disabled",false);
			},
			_cut:function(ev) {
				ev.preventDefault();
				this.clipboard = this.getSelected();
				console.log("Cut %d resources", this.clipboard.length);
				this.clipboardCut = true;
				this.tools["paste"].set("disabled",false);
			},
			_createCollection: function() {
				var self = this;
				util.input("Create Collection", "Create a new collection",
					"<label for='name'>Name:</label><input type='text' name='name'/>",
					function(value) {
						var id = self.collection.replace(new RegExp("^"+this.collectionRoot+"/?"),"");
						self.store.rpc(id,"create-collection",[value.name]).then(function() {
							self.refresh();
						},function(err) {
							util.message("Creating Collection Failed!", "Could not create collection &apos;" + value.name+ "&apos;.<br>Server says: "+err.response.xhr.responseText);
						});
					}
				);
			},
			_deleteResources: function(ev) {
				ev.preventDefault();
				var self = this;
				var resources = self.getSelected();
				if(resources) {
					util.confirm("Delete Resources?", "Are you sure you want to delete the selected resources?",
						function() {
							self.store.rpc("","delete-resources",[resources]).then(function() {
								self.refresh();
							},function(err) {
								util.message("Deletion Failed!", "Resources could not be deleted.<br>Server says: "+err.response.xhr.responseText);
							});
						});
				}
			},
			_pasteResources:function(ev){
				ev.preventDefault();
				this.tools["paste"].set("disabled",true);
				if(this.clipboard && this.clipboard.length > 0) {
					console.log("Paste: %d resources", this.clipboard.length);
					var id = this.collection.replace(new RegExp("^"+this.collectionRoot+"/?"),"");
					var mthd = this.clipboardCut ? "move-resources" : "copy-resources";
					this.store.rpc(id,mthd,[this.clipboard]).then(lang.hitch(this,function(){
						this.clipboard = null
						this.clipboardCut = false;
						this.refresh();
					}),lang.hitch(this,function(err){
						this.clipboard = null
						this.clipboardCut = false;
						util.message("Paste Failed!", "Some resources could not be copied.");
					}));
				}
			},
			_upload: function() {
				this.uploader.set("collection",this.collection);
				this.uploadDlg.show();
			},
			_reindex: function() {
				var self = this;
				var id = this.collection.replace(new RegExp("^"+this.collectionRoot+"/?"),"");
				var resources = this.getSelected(true);
				if (resources && resources.length > 0) {
					if (resources.length > 1) {
						util.message("Reindex", "Please select a single collection or none to reindex the current root collection");
						return;
					}
					id = resources[0];
				}
				util.confirm("Reindex collection?",
					"Are you sure you want to reindex collection "+this.collectionRoot+"/" + id + "?",
				function() {
					self.store.rpc(id,"reindex").then(function() {
						self.refresh();
					},function() {
						util.message("Reindex Failed!", "Reindex of collection "+this.collectionRoot+"/" + id + " failed");
						self.refresh();
					});
				});
			},
			onSelectResource:function(id,item,evt){
				// override this to connect to double-click
				this.openResource(this.collectionRoot+id);
			},
			openResource: function(path) {
				var exide = window.open("", "eXide");
				if(exide && !exide.closed) {

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
						// open eXide relative to this page
						var href = location.href+"../eXide/index.html";
						request(href).then(function(){
							exide.location = href;
						},function(){
							util.message("Open Resource", "eXide is not available on the expected location.");
						});
					}
				} else {
					util.message("Open Resource", "Failed to start eXide in new window.");
				}
			}
		});
	});
