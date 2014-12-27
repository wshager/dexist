define([
	"dojo/_base/lang",
	"dojo/_base/array",
	"dojo/on",
	"dojo/request",
	"dojo/ready",
	"dojo/query",
	"dojo/Deferred",
	"dojo/when",
	"dojo/store/Memory",
	"dojo/dom-geometry",
	"dojo/dom-construct",
	"dojo/dom-style",
	"dojo/dom-attr",
	"dojo/dom-class",
	"dojo/NodeList-data",
	"dojo/NodeList-manipulate",
	"dojo/NodeList-traverse"
], function(lang,array,on,request,ready,query,Deferred,when,Memory,domGeometry,domConstruct,domStyle,domAttr,domClass) {

	var magicGuard = function(a){
		return a.length == 1 && (typeof a[0] == "string");
	};
	function getSet(module){
		return function(node, name, value){
			if(arguments.length == 2){
				return module[typeof name == "string" ? "get" : "set"](node, name);
			}
			// setter
			return module.set(node, name, value);
		};
	}
	function isElement(obj) {
		  try {
		    //Using W3 DOM2 (works for FF, Opera and Chrom)
		    return obj instanceof HTMLElement;
		  }
		  catch(e){
		    //Browsers not supporting W3 DOM2 don't have HTMLElement and
		    //an exception is thrown and we end up here. Testing some
		    //properties that all elements have. (works on IE7)
		    return (typeof obj==="object") &&
		      (obj.nodeType===1) && (typeof obj.style === "object") &&
		      (typeof obj.ownerDocument ==="object");
		  }
	}
	var r20 = /%20/g,
	rbracket = /\[\]$/,
	rCRLF = /\r?\n/g,
	rsubmitterTypes = /^(?:submit|button|image|reset|file)$/i,
	rsubmittable = /^(?:input|select|textarea|keygen)/i;
	var class2type = {};
	array.forEach("Boolean Number String Function Array Date RegExp Object Error".split(" "), function(name) {
		class2type[ "[object " + name + "]" ] = name.toLowerCase();
	});
	// jQuery's dirty isArraylike
	function isArraylike( obj ) {
		var length = obj.length,
			type = typeof obj;

		if ( type === "function" || (obj != null && obj == obj.window) ) {
			return false;
		}

		if ( obj.nodeType === 1 && length ) {
			return true;
		}

		return type === "array" || length === 0 ||
			typeof length === "number" && length > 0 && ( length - 1 ) in obj;
	}
	
	// jQuery's dirty custom selectors
	var filters = {
		hidden: function( elem ) {
			// Support: Opera <= 12.12
			// Opera reports offsetWidths and offsetHeights less than zero on some elements
			return elem.offsetWidth <= 0 && elem.offsetHeight <= 0;
		},
		visible: function( elem ) {
			return !filters.hidden( elem );
		}
	};
	
	var attr = query.NodeList._adaptWithCondition(getSet(domAttr), magicGuard);
	lang.extend(query.NodeList,{
		ready:ready,
		add: function(elm){
			this.push(elm);
			return this;
		},
		data:function(){
			return this.query.apply(this,arguments)[0];
		},
		find: function(){
			return this.query.apply(this,arguments);
		},
		each: function(){
			var args = Array.prototype.slice.call(arguments);
			var f = args.shift();
			this.forEach(function(_){
				f.apply(_,args);
			});
			return this;
		},
		hasClass: function(selector){
			var className = " " + selector + " ",
			i = 0,
			l = this.length;
			for ( ; i < l; i++ ) {
				if ( this[i].nodeType === 1 && (" " + this[i].className + " ").replace(rclass, " ").indexOf( className ) >= 0 ) {
					return true;
				}
			}
	
			return false;
		},
		is:function(selector){
			return !!this.filter(function(_){
				return !!$(selector,_).length;
			}).length;
		},
		attr:function(key,val){
			var x = attr.apply(this,arguments);
			if(val===undefined) return x.join("");
			return x;
		},
		prop:function(key,val){
			var res = attr.apply(this,arguments);
			var x = [];
			array.forEach(res,function(_){
				if(_) x.push(_);
			});
			if(!x.length){
				this.each(function(){
					if(this[key]) {
						if(val!==undefined) this[key] = val;
						x.push(this[key]);
					}
				});
			}
			if(!x.length){
				this.each(function(){
					var q = $(key,this);
					if(q.length) x.push(q[0]);
				});
			}
			return x.length ? x[0] : null;
		},
		css: function(prop){
			var x = this.map(function(){
				return domStyle.get(this,prop);
			});
			if(typeof prop=="string") return x.join("");
			return x;
		},
		currentStyle:function(prop){
			return this.map(function(){
				return domStyle.get(this,prop);
			}).join();
		},
		click:function(f){
			if(f===undefined) return this.trigger.apply(this,[]);
			return this.bind.apply(this,["click",f]);
		},
		bind:function(){
			var eventType = arguments[0],
			l = arguments.length;
			if(eventType.indexOf(".") >= 0) {
				// Namespaced trigger; create a regexp to match event type in handle()
				var namespaces = eventType.split(".");
				eventType = namespaces.shift();
				//namespaces.sort();
			}
			var eventData = l>2 ? arguments[1] : null,
				handler = arguments[l-1];
			var xhandler = function(ev) {
				var shimmed = new $.Event(ev);
				return handler(shimmed);
			}
			this.forEach(function(_){
				var h = on(_,eventType,xhandler);
				if(_==document || _==window) {
					_["evt-"+eventType] = h;
				} else {
					$(_).data("evt-"+eventType,h);
				}
			});
			return this;
		},
		unbind:function(eventType){
			this.forEach(function(_){
				var h;
				var k = "evt-"+eventType;
				if(_==document || _==window) {
					h = _[k];
					delete _[k];
				} else {
					h = $(_).data(k);
					$(_).removeData(k);
				}
				if(h) h.remove();
			});
		},
		trigger:function(type){
			type = (!type || typeof type == "string") ? type : type.type ? type.type : type;
			this.forEach(function(_){
				on.emit(_, type, {
					bubbles: true,
					cancelable: true
				});
			});
			return this;
		},
		width:function(v){
			if(v) {
				if(typeof v !="string") v+="px";
				this.forEach(function(_){
					return domStyle.set(_,"width",v);
				});
				return this;
			} else {
				return this.map(function(){
					return domStyle.get(this,"width");
				}).join();
			}
		},
		outerWidth:function(){
			return domGeometry.getMarginBox(this[0]).w;
		},
		outerHeight:function(){
			return domGeometry.getMarginBox(this[0]).h;
		},
		height:function(v){
			if(v) {
				if(typeof v !="string") v+="px";
				this.forEach(function(_){
					return domStyle.set(_,"height",v);
				});
				return this;
			} else {
				return this.map(function(){
					return domStyle.get(this,"height");
				}).join();
			}
		},
		offset:function(){
			var x = domGeometry.position(this[0]);
			return {
				left:x.x,
				top:x.y
			};
		},
		hide:function(){
			this.forEach(function(_){
				domClass.add(_,"dijitHidden");
			});
		},
		show:function(){
			this.forEach(function(_){
				domClass.remove(_,"dijitHidden");
			});
		},
		offsetParent:function(){
			return this.map(function() {
				return this.offsetParent || document.body;
			});
		},
		get:function( num ) {
			return num != null ?

				// Return just the one element from the set
				( num < 0 ? this[ num + this.length ] : this[ num ] ) :

				// Return all the elements in a clean array
				slice.call( this );
		},
		serializeArray: function() {
			// Can add propHook for "elements" to filter or add form elements
			var elements = $.prop( this, "elements" );
			return elements ? $.makeArray( elements ) : this;
			elements.filter(function() {
				var type = this.type;
				// Use .is(":disabled") so that fieldset[disabled] works
				return this.name && !$( this ).is( ":disabled" ) &&
					rsubmittable.test( this.nodeName ) && !rsubmitterTypes.test( type ) &&
					( this.checked || !rcheckableType.test( type ) );
			})
			.map(function( i, elem ) {
				var val = $( this ).val();

				return val == null ?
					null :
					$.isArray( val ) ?
						$.map( val, function( val ) {
							return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
						}) :
						{ name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
			}).get();
		}
	});
	$ = query;
	var pseudos = /:(:?[^ ,:.]+)/g;
	$ = lang.mixin(function(selector,context){
		if(arguments.length===0){
			return lang.mixin(new query.NodeList([]), $.fn);
		}
		if ( typeof selector === "string" ) {
			if ( selector[0] === "<" && selector[ selector.length - 1 ] === ">" && selector.length >= 3 ) {
				return lang.mixin(query(domConstruct.place(selector,context || document.body)), $.fn);
			}
			// hacky test for custom pseudo filters
			if(selector.match(pseudos)) {
				var pseudo = selector.replace(pseudos,"$1");
				if(filters[pseudo]) return filters[pseudo](context);
			}
		}
		return lang.mixin(query.apply(this, arguments), $.fn);
	}, dojo, {fn: {}});
	$.each = function(collection, fn){
		if(collection instanceof Array) {
			collection.forEach(function(_,i){
				fn(i,_);
			});
		}else{
			for(var k in collection) {
				fn(k,collection[k]);
			}
		}
	};
	$.isArray = function(obj) {
		return $.type(obj) === "array";
	};
	$.noop = function(){};
	$.Deferred = function(){
		var d = new Deferred();
		d.pipe = d.then;
		d.promise = function(){
			return this;
		}
		d.done = function(fn){
			when(d,function(args){
				fn.apply(this,args)
			});
		};
		d.fail = function(fn){
			when(d,function(){
			},function(args){
				fn.apply(this,args);
			});
		};
		d.resolveWith = function(obj,args) {
			return this.resolve.call(obj,args);
		}
		var oriResolve = d.resolve;
		d.resolve = function(){
			var res = oriResolve.apply(this, arguments);
			res.__proto__.promise = function(){
				return this;
			}
			return res;
		}
		return d;
	};
	$.isPlainObject = function(obj){
		var key;

		// Must be an Object.
		// Because of IE, we also have to check the presence of the constructor property.
		// Make sure that DOM nodes and window objects don't pass through, as well
		if ( !obj || typeof obj !== "object" || obj.nodeType || (obj != null && obj == obj.window) ) {
			return false;
		}

		try {
			// Not own constructor property must be Object
			if ( obj.constructor &&
				!hasOwn.call(obj, "constructor") &&
				!hasOwn.call(obj.constructor.prototype, "isPrototypeOf") ) {
				return false;
			}
		} catch ( e ) {
			// IE8,9 Will throw exceptions on certain host objects #9897
			return false;
		}

		// Own properties are enumerated firstly, so to speed up,
		// if last one is own, then all properties are own.
		for ( key in obj ) {}

		return key === undefined || hasOwn.call( obj, key );
	};
	$.prop = function(elm,key,value) {
		return $(elm).prop(key,value);
	};
	$.data = function(elm,key,value){
		return $(elm).data(key,value);
	};
	$.type = function(obj){
		if ( obj == null ) {
			return obj + "";
		}
		return typeof obj === "object" || typeof obj === "function" ?
			class2type[ toString.call(obj) ] || "object" :
			typeof obj;
	};
	$.extend = function(){
		var args = Array.prototype.slice.call(arguments);
		var target = args[0];
		var deep = false;
		// Handle a deep copy situation
		if(typeof target === "boolean" ) {
			deep = args.shift();
		}
		return lang.mixin.apply(this,args);
	};
	$.inArray = function( elem, arr, i ) {
		var len;
		if ( arr ) {
			return array.indexOf( arr, elem, i );
		}
		return -1;
	};
	$.merge = function( first, second ) {
		var len = +second.length,
			j = 0,
			i = first.length;

		while ( j < len ) {
			first[ i++ ] = second[ j++ ];
		}

		// Support: IE<9
		// Workaround casting of .length to NaN on otherwise arraylike objects (e.g., NodeLists)
		if ( len !== len ) {
			while ( second[j] !== undefined ) {
				first[ i++ ] = second[ j++ ];
			}
		}

		first.length = i;

		return first;
	};
	$.makeArray = function( arr, results ) {
		var ret = results || [];

		if ( arr != null ) {
			if ( isArraylike(arr) ) {
				$.merge( ret,
					typeof arr === "string" ?
					[ arr ] : arr
				);
			} else {
				push.call( ret, arr );
			}
		}

		return ret;
	};
	$.expr = {};
	$.expr[":"] = {};
	$.support = {};
	$.now = function(){
		return (new Date).getTime();
	};

	function returnTrue() {
		return true;
	}

	function returnFalse() {
		return false;
	}
	// ugh..
	$.Event = function( src, props ) {
		// Allow instantiation without the 'new' keyword
		if ( !(this instanceof $.Event) ) {
			return new $.Event( src, props );
		}

		// Event object
		if ( src && src.type ) {
			this.originalEvent = src;
			this.type = src.type;

			// Events bubbling up the document may have been marked as prevented
			// by a handler lower down the tree; reflect the correct value.
			this.isDefaultPrevented = src.defaultPrevented ||
					src.defaultPrevented === undefined &&
					// Support: IE < 9, Android < 4.0
					src.returnValue === false ?
				returnTrue :
				returnFalse;

		// Event type
		} else {
			this.type = src;
		}

		// Put explicitly provided properties onto the event object
		if ( props ) {
			$.extend( this, props );
		}

		// Create a timestamp if incoming event doesn't have one
		this.timeStamp = src && src.timeStamp || $.now();
	};

	// jQuery.Event is based on DOM3 Events as specified by the ECMAScript Language Binding
	// http://www.w3.org/TR/2003/WD-DOM-Level-3-Events-20030331/ecma-script-binding.html
	$.Event.prototype = {
		isDefaultPrevented: returnFalse,
		isPropagationStopped: returnFalse,
		isImmediatePropagationStopped: returnFalse,

		preventDefault: function() {
			var e = this.originalEvent;

			this.isDefaultPrevented = returnTrue;
			if ( !e ) {
				return;
			}

			// If preventDefault exists, run it on the original event
			if ( e.preventDefault ) {
				e.preventDefault();

			// Support: IE
			// Otherwise set the returnValue property of the original event to false
			} else {
				e.returnValue = false;
			}
		},
		stopPropagation: function() {
			var e = this.originalEvent;

			this.isPropagationStopped = returnTrue;
			if ( !e ) {
				return;
			}
			// If stopPropagation exists, run it on the original event
			if ( e.stopPropagation ) {
				e.stopPropagation();
			}

			// Support: IE
			// Set the cancelBubble property of the original event to true
			e.cancelBubble = true;
		},
		stopImmediatePropagation: function() {
			var e = this.originalEvent;

			this.isImmediatePropagationStopped = returnTrue;

			if ( e && e.stopImmediatePropagation ) {
				e.stopImmediatePropagation();
			}

			this.stopPropagation();
		}
	};
	$.ajaxSettings = {
		xhr:function() {
			return new window.XMLHttpRequest()
		},
		type: "GET",
		global: true,
		processData: true,
		async: true,
		contentType: "application/x-www-form-urlencoded; charset=UTF-8",
		/*
		timeout: 0,
		data: null,
		dataType: null,
		username: null,
		password: null,
		cache: null,
		throws: false,
		traditional: false,
		headers: {},
		*/

		accepts: {
			text: "text/plain",
			html: "text/html",
			xml: "application/xml, text/xml",
			json: "application/json, text/javascript"
		},

		contents: {
			xml: /xml/,
			html: /html/,
			json: /json/
		},

		responseFields: {
			xml: "responseXML",
			text: "responseText",
			json: "responseJSON"
		},

		// Data converters
		// Keys separate source (or catchall "*") and destination types with a single space
		converters: {

			// Convert anything to text
			"* text": String,

			// Text to html (true = no transformation)
			"text html": true,

			// Evaluate text as a json expression
			"text json": JSON.parse,

			// Parse text as xml
			"text xml": function(){}
		},

		// For options that shouldn't be deep extended:
		// you can add your own custom options here if
		// and when you create one that shouldn't be
		// deep extended (see ajaxExtend)
		flatOptions: {
			url: true,
			context: true
		}
	};
	$.ajax = function( url, options ) {
		if ( typeof url === "object" ) {
			options = url;
			url = options.url;
		}
		var d = new $.Deferred();
		request(url).then(function(res){
			d.resolve([res,200,{}]);
		},function(err){
			d.reject([err.response.xhr,err.response.status])
		})
		return d;
	}
	return $;
});
