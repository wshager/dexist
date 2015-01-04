dexist
======

Tools for eXist based on Dojo

----

Deps:

* dojo/dojo
* dojo/dijit
* sitepen/dstore
* lagua/dforma
* sitepen/dgrid
* kriszyp/xstyle
* kriszyp/put-selector

## API

CollectionBrowser
=================

### Properties:

Property | Description
-------- | -----------
target   | The base for services used for browsing (db), users (user) and groups (group)
collection | The default collection
persist  | A boolean determining if the collection and preferences should be stored in a cookie
thumbnailSize | An integer determining the default thumbnail size (1,2,4 or 16)
sort | The default sorting property of the items in a collection
display | The default view of the collection items (details or tiles) 


### Methods:

Method | Description
refresh(collection) | Call this to change or refresh the current collection
onSelectResource(id,item,event) | Override this method to connect to the selecting (double-clicking) of a resource. Note that the the complete path is `"/db/"+id`.
