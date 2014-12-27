define([ 
    "dojo/_base/declare", 
    "dojo/_base/array",
    "dojo/dom",
    "dojo/dom-construct",
    "dojo/dom-style",
    "dojo/query",
    "dojo/_base/fx",
    "dijit/_WidgetBase",
    "dijit/_TemplatedMixin",
    "dojo/text!./templates/Uploader.html",
    "./util/$",
    "jQuery-File-Upload/js/jquery.fileupload",
    "./util/load-css"
],
function(declare, array, dom, domConstruct, domStyle, query, fx,_WidgetBase,_TemplatedMixin,template, $, fileupload,loadCss) {
    
    return declare("dexist.Uploader",[_WidgetBase,_TemplatedMixin], {
        url:"/dashboard/plugins/browsing/upload.xql",
        collection:"/db",
    	templateString:template,
        baseClass:"dexistUploader",
        errorsFound: false,
        onDone:function(){
        	// override
        },
        postCreate: function() {
        	loadCss(require.toUrl("dexist/resources/Uploader.css"));
            var container = this.domNode;
            var self = this;
            var pending = 0;
            var progressDiv = query(".overall-progress", container)[0];
            $(container).fileupload({
            	dropZone:container,
                sequentialUploads: true,
                dataType: "json",
                add: function(e, data) {
                    var rows = "";
                    for (var i = 0; i < data.files.length; i++) {
                        rows += "<tr>";
                        rows += "<td class='name'>" + data.files[i].name + "</td>";
                        rows +="<td>" + Math.ceil(data.files[i].size / 1024) + "k</td>";
                        rows += "<td class='progress'><div class='bar' style='width: 0'></div></td>";
                        rows += "</tr>";
                    }
                    data.context = domConstruct.place(rows, query(".files", container)[0], "last");
                    pending += 1;
                    data.submit();
                },
                progress: function (e, data) {
                    var progress = parseInt(data.loaded / data.total * 100, 10);
                    query('.bar', data.context).style("width", progress + "%");
                },
                progressall: function (e, data) {
                    var progress = parseInt(data.loaded / data.total * 100, 10);
                    if (domStyle.get(progressDiv, "opacity") == 0) {
                        fx.fadeIn({node: progressDiv, duration: 200}).play();
                    }
                    if (progress == 100 && domStyle.get(progressDiv, "opacity") > 0) {
                        fx.fadeOut({node: progressDiv, duration: 200}).play();
                        progress = 0;
                    }
                    query(".overall-progress .bar", container).style("width", progress + "%");
                    query(".overall-progress .progress-label", container).innerHTML(progress + "%");
                },
                done: function(e, data) {
                    pending -= 1;
                    if (data.result[0].error) {
                        query(".progress", data.context).innerHTML(data.result[0].error);
                        self.errorsFound = true;
                    } else {
                        domConstruct.destroy(data.context);
                    }
                    if (pending < 1) {
                        fx.fadeOut({node: progressDiv, duration: 200}).play();
                        progress = 0;
                        self.onDone(self.errorsFound);
                    }
                },
                fail: function(e, data) {
                    query(".progress", data.context).innerHTML(data.jqXHR.statusText);
                }
            });
            this.inherited(arguments);
        },
        
        clear: function() {
            query(".files", this.domNode).empty();
            this.errorsFound = false;
        }
    });
    
});